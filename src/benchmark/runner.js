import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import * as core from '../core/index.js';

function runProcess(command, args, input, { cwd, timeoutMs }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args ?? [], { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const stdout = [], stderr = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('benchmark adapter timed out after ' + timeoutMs + 'ms'));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('benchmark adapter exited ' + code + ': ' + Buffer.concat(stderr).toString('utf8')));
      try { resolvePromise(JSON.parse(Buffer.concat(stdout).toString('utf8'))); }
      catch (error) { reject(new Error('benchmark adapter did not return one JSON object: ' + error.message)); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

export async function loadCorpus(path) {
  const corpus = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(corpus.tasks) || !corpus.tasks.length) throw new TypeError('benchmark corpus has no tasks');
  return corpus;
}

export function benchmarkWorksheet(corpus, { partition = null } = {}) {
  const tasks = partition ? corpus.tasks.filter((task) => task.partition === partition) : corpus.tasks;
  return {
    schema: 1,
    corpus: corpus.corpus,
    rule: corpus.scoring.rule,
    dimensions: ['structural', 'semantic', 'perceptual', 'workflow'],
    tasks: tasks.map((task) => ({
      id: task.id,
      intent: task.intent,
      requiredObjects: task.requiredObjects,
      requiredRelationships: task.requiredRelationships,
      requiredText: task.requiredText,
      prohibited: task.prohibited,
      humanQuestion: task.humanQuestion,
      artifact: null,
      metrics: { toolCalls: null, tokens: null, durationMs: null, repairIterations: null },
      perceptual: { reviewedBy: null, answer: null, blockers: null },
    })),
  };
}

function semanticSignals(doc, task) {
  const elements = Object.values(doc.elements).flat();
  const haystack = elements.map((element) =>
    [element.id, element.label, element.text, element.description, element.technology, ...(element.tags ?? [])].filter(Boolean).join(' '))
    .join(' ').toLowerCase();
  const requiredText = task.requiredText ?? [];
  const textHits = requiredText.map((text) => ({ requirement: text, present: haystack.includes(String(text).toLowerCase()) }));
  const relationshipCount = elements.filter((element) => element.relationship).length;
  const requiredRelationshipCount = task.requiredRelationships?.length ?? 0;
  return {
    requiredText: textHits,
    requiredTextPresent: textHits.filter((entry) => entry.present).length,
    requiredTextTotal: textHits.length,
    relationshipCount,
    requiredRelationshipCount,
    relationshipCountSatisfied: relationshipCount >= requiredRelationshipCount,
    note: 'Object identity and perceptual intent require a human/model review; text and relationship counts are automatic signals only.',
  };
}

export async function scoreBenchmarkResult(task, result, { cwd = process.cwd() } = {}) {
  if (!result?.artifact) throw new TypeError('benchmark result for ' + task.id + ' needs an artifact path');
  const doc = await core.loadDocument(resolve(cwd, result.artifact));
  const validation = core.validate(doc);
  const model = core.inspectModel(doc);
  const semantic = semanticSignals(doc, task);
  const complete = semantic.requiredTextPresent === semantic.requiredTextTotal && semantic.relationshipCountSatisfied;
  return {
    task: task.id,
    artifact: resolve(cwd, result.artifact),
    structural: {
      state: validation.summary.state,
      firstPassValid: result.firstPassValid ?? null,
      aboveInfo: validation.open.filter((finding) => finding.severity !== 'S3').length,
      connectorFindings: validation.open.filter((finding) => ['L004', 'L006', 'L015'].includes(finding.rule)).length,
      labelFindings: validation.open.filter((finding) => finding.rule === 'L002').length,
      repairIterations: result.metrics?.repairIterations ?? null,
    },
    semantic: { ...semantic, completenessGate: complete ? 'passed-automatic-signals' : 'failed-automatic-signals' },
    perceptual: result.perceptual?.reviewedBy
      ? { state: result.perceptual.blockers ? 'blocked' : 'reviewed', ...result.perceptual }
      : { state: 'unreviewed', reviewedBy: null, answer: null, blockers: null },
    workflow: {
      toolCalls: result.metrics?.toolCalls ?? null,
      tokens: result.metrics?.tokens ?? null,
      durationMs: result.metrics?.durationMs ?? null,
      repairIterations: result.metrics?.repairIterations ?? null,
      deterministicReproduction: result.metrics?.deterministicReproduction ?? null,
    },
    modelInspection: model.summary,
  };
}

export async function scoreBenchmarkRun(corpus, run, options = {}) {
  if (!run || !Array.isArray(run.results)) throw new TypeError('benchmark run needs a results array');
  const byId = new Map(corpus.tasks.map((task) => [task.id, task]));
  const tasks = [];
  for (const result of run.results) {
    const task = byId.get(result.task);
    if (!task) throw new Error('benchmark result names unknown task ' + JSON.stringify(result.task));
    tasks.push(await scoreBenchmarkResult(task, result, options));
  }
  return {
    schema: 1,
    corpus: corpus.corpus,
    system: run.system,
    model: run.model,
    generatedAt: run.generatedAt ?? null,
    dimensions: ['structural', 'semantic', 'perceptual', 'workflow'],
    tasks,
    disclosure: 'No dimensions are collapsed into one score. Unreviewed perceptual results remain unreviewed.',
  };
}

export async function runBenchmark(corpus, config, { cwd = process.cwd() } = {}) {
  if (!config?.model || !Array.isArray(config.systems) || !config.systems.length) {
    throw new TypeError('benchmark config needs one shared model id and one or more system adapters');
  }
  const tasks = config.partition ? corpus.tasks.filter((task) => task.partition === config.partition) : corpus.tasks;
  const runs = [];
  for (const system of config.systems) {
    if (!system.id || !system.command) throw new TypeError('each benchmark system needs id and command');
    const results = [];
    for (const task of tasks) {
      const started = Date.now();
      const output = await runProcess(system.command, system.args, {
        protocol: 'turtlepen-benchmark-adapter-v1',
        model: config.model,
        system: system.id,
        task,
      }, { cwd, timeoutMs: config.timeoutMs ?? 120000 });
      results.push({ task: task.id, ...output, metrics: { durationMs: Date.now() - started, ...(output.metrics ?? {}) } });
    }
    runs.push(await scoreBenchmarkRun(corpus, {
      system: system.id,
      model: config.model,
      generatedAt: config.generatedAt ?? null,
      results,
    }, { cwd }));
  }
  return {
    schema: 1,
    corpus: corpus.corpus,
    model: config.model,
    systems: runs,
    disclosure: 'All systems were invoked with the same declared model. Results are reported by dimension; no overall winner is computed.',
  };
}
