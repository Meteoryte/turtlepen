#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

import * as core from './core/index.js';
import { createSession, createTools } from './mcp/tools.js';
import { atomicWriteFile } from './io.js';
import { VERSION } from './version.js';
import { capabilityRegistry, doctorReport, searchCapabilities } from './capabilities.js';
import { buildArtifactManifest } from './quality/artifacts.js';
import { documentationBundle } from './quality/documentation.js';
import { benchmarkWorksheet, loadCorpus, runBenchmark, scoreBenchmarkRun } from './benchmark/runner.js';

const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';
const rest = argv.slice(1);
const has = (name) => rest.includes('--' + name);
const option = (name, fallback = null) => {
  const index = rest.indexOf('--' + name);
  return index >= 0 && rest[index + 1] != null && !rest[index + 1].startsWith('--') ? rest[index + 1] : fallback;
};
const positional = () => rest.filter((entry, index) => !entry.startsWith('--') && (index === 0 || !rest[index - 1].startsWith('--')));
const json = (value) => JSON.stringify(value, null, 2);

const HELP = [
  'TurtlePen ' + VERSION,
  '',
  'Usage: turtlepen <command> [options]',
  '',
  '  help [query]                         searchable capability help',
  '  doctor [--json]                      runtime and registry diagnostics',
  '  validate <document> [--json]         structural validation',
  '  inspect <document> [--json]          semantic-model inspection',
  '  render <document> --format svg|png|pdf [--out path] [--view key] [--force]',
  '  manifest [documents...] [--out path] [--generated-at ISO] [--enforce]',
  '  bundle <document> --out <directory>  architecture/model/view/ADR docs',
  '  benchmark worksheet [--partition dev|holdout] [--out path]',
  '  benchmark score <run.json> [--out path]',
  '  benchmark run <config.json> [--out path]',
  '',
  'When manifest receives no paths it uses git-tracked diagrams only. Benchmark',
  'commands never invent perceptual results; missing human/model review remains unreviewed.',
].join('\n');

function trackedDocuments() {
  try {
    return execFileSync('git', ['ls-files', 'diagrams/*.turtlepen.json'], { encoding: 'utf8', windowsHide: true })
      .split(/\r?\n/).filter(Boolean);
  } catch (error) {
    throw new Error('no document paths were supplied and git tracking could not be read: ' + error.message);
  }
}

async function writeJsonOrPrint(value, path) {
  if (path) {
    await atomicWriteFile(resolve(path), json(value) + '\n', { backup: true });
    process.stdout.write(resolve(path) + '\n');
  } else process.stdout.write(json(value) + '\n');
}

async function main() {
  const session = createSession({ cwd: process.cwd() });
  const tools = createTools(session);
  if (command === 'help' || command === '--help' || command === '-h') {
    const query = positional().join(' ');
    if (!query) return process.stdout.write(HELP + '\n');
    const result = searchCapabilities(tools, query);
    process.stdout.write(result.matches.map((entry) => entry.name + ' [' + entry.category + ']\n  ' + entry.description).join('\n') + '\n');
    return;
  }
  if (command === 'doctor') {
    const result = doctorReport(tools, { schemaVersion: core.SCHEMA_VERSION, version: VERSION, cwd: process.cwd() });
    if (has('json')) process.stdout.write(json(result) + '\n');
    else process.stdout.write(['TurtlePen doctor: ' + result.state.toUpperCase(), ...result.checks.map((check) => (check.ok ? 'PASS ' : 'FAIL ') + check.id.padEnd(10) + check.detail), 'capabilities ' + result.capabilityFingerprint].join('\n') + '\n');
    if (result.state !== 'ready') process.exitCode = 2;
    return;
  }
  if (command === 'capabilities') return process.stdout.write(json(capabilityRegistry(tools)) + '\n');

  if (command === 'validate' || command === 'inspect') {
    const path = positional()[0];
    if (!path) throw new Error(command + ' needs a document path');
    const doc = await core.loadDocument(resolve(path));
    const result = command === 'validate' ? core.validate(doc) : core.inspectModel(doc);
    process.stdout.write(has('json') ? json(result) + '\n' : (command === 'validate' ? core.formatLog(result) : core.formatInspection(result)) + '\n');
    if (command === 'validate' && result.open.some((finding) => finding.severity !== 'S3')) process.exitCode = 2;
    if (command === 'inspect' && result.summary.error) process.exitCode = 2;
    return;
  }

  if (command === 'render') {
    const path = positional()[0];
    if (!path) throw new Error('render needs a document path');
    const doc = await core.loadDocument(resolve(path));
    const format = option('format', extname(option('out', '')).slice(1) || 'svg').toLowerCase();
    if (!['svg', 'png', 'pdf'].includes(format)) throw new Error('render format must be svg, png, or pdf');
    const base = resolve(path).replace(/\.turtlepen\.json$/i, '');
    const out = resolve(option('out', base + '.' + format));
    const options = {
      force: has('force'),
      view: option('view'),
      bounds: option('bounds', 'content'),
      showGrid: !has('no-grid'),
      backup: true,
    };
    if (format === 'svg') await core.exportSvg(doc, out, options);
    if (format === 'png') await core.exportPng(doc, out, options);
    if (format === 'pdf') await core.exportPdf(doc, out, options);
    process.stdout.write(out + '\n');
    return;
  }

  if (command === 'manifest') {
    const paths = positional();
    const manifest = await buildArtifactManifest(paths.length ? paths : trackedDocuments(), { generatedAt: option('generated-at') });
    await writeJsonOrPrint(manifest, option('out'));
    if (has('enforce') && manifest.summary.publishable !== manifest.summary.artifacts) process.exitCode = 2;
    return;
  }

  if (command === 'bundle') {
    const path = positional()[0];
    const out = option('out');
    if (!path || !out) throw new Error('bundle needs a document and --out directory');
    const doc = await core.loadDocument(resolve(path));
    const files = documentationBundle(doc);
    for (const [relative, value] of Object.entries(files)) await atomicWriteFile(join(resolve(out), relative), value + '\n', { backup: true });
    process.stdout.write(json({ directory: resolve(out), files: Object.keys(files) }) + '\n');
    return;
  }

  if (command === 'benchmark') {
    const action = rest[0];
    const corpus = await loadCorpus(resolve(option('corpus', 'benchmark/corpus-v1.json')));
    if (action === 'worksheet') {
      return writeJsonOrPrint(benchmarkWorksheet(corpus, { partition: option('partition') }), option('out'));
    }
    const file = rest.find((entry, index) => index > 0 && !entry.startsWith('--') && !rest[index - 1].startsWith('--'));
    if (!file) throw new Error('benchmark ' + action + ' needs a JSON config or run path');
    const input = JSON.parse(await readFile(resolve(file), 'utf8'));
    if (action === 'score') return writeJsonOrPrint(await scoreBenchmarkRun(corpus, input), option('out'));
    if (action === 'run') return writeJsonOrPrint(await runBenchmark(corpus, input), option('out'));
    throw new Error('benchmark action must be worksheet, score, or run');
  }
  throw new Error('unknown command ' + JSON.stringify(command) + '\n\n' + HELP);
}

main().catch((error) => {
  process.stderr.write('TurtlePen: ' + error.message + '\n');
  process.exitCode = 1;
});
