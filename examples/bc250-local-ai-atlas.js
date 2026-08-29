#!/usr/bin/env node
/**
 * BC-250 Local AI Compute Atlas
 *
 * Six architecture maps authored through TurtlePen's MCP tool layer.
 * Geometry is intentionally standardized so semantic ports are exact:
 * every node is 54x14 cells and every relationship is a literal vertical
 * S->N or horizontal E->W/W->E orthogonal connection.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createSession, createTools } from '../src/mcp/tools.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'diagrams', 'bc250-local-ai');
const CREATED_AT = '2026-08-29T15:34:00.000Z';
const SPAN = '54x14';
await mkdir(outDir, { recursive: true });

const sources = [
  ['video', 'Original BC-250 video', 'https://www.youtube.com/watch?v=Ztkh2UfSUxw', 'Starting point for this research.'],
  ['h6', 'H6 BC-250 docs', 'https://github.com/H6-Technologies/BC-250', 'Community hardware and Linux documentation.'],
  ['ollama', 'BC-250 Ollama + Open WebUI', 'https://github.com/thelamer/bc250-ollama-openwebui', 'Headless Vulkan/Ollama deployment.'],
  ['bench', 'BC-250 LLM benchmarks', 'https://github.com/akandr/bc250', 'Single-board Vulkan and memory tuning notes.'],
  ['cu', '40-CU unlock research', 'https://github.com/duggasco/bc250-40cu-unlock', 'Optional GPU CU qualification research.'],
  ['cores', '8-core / CU helper tooling', 'https://github.com/GabriWar/bc250-core-cu-unlock', 'Optional CPU/GPU qualification tooling.'],
  ['two', 'Two-node llama.cpp cluster', 'https://github.com/4claps/bc250-llama-cluster', 'Validated two-node RPC design with dedicated 2.5 GbE backend.'],
  ['four', 'Four-node cluster reference', 'https://github.com/Cirius1792/bc250-cluster-ansible', 'Reference multi-worker RPC deployment.'],
].map(([id, label, uri, description]) => ({ id: `src-${id}`, type: 'url', label, uri, description, tags: ['source'] }));

const theme = {
  name: 'bc250-local-ai', tokens: {}, perspectiveStyles: [],
  tagStyles: [
    { tag: 'root', fill: '#dfe7ff', stroke: '#455a9c', text: '#111827' },
    { tag: 'hardware', fill: '#dceeff', stroke: '#2563eb', text: '#111827' },
    { tag: 'software', fill: '#e7f7ee', stroke: '#2f855a', text: '#111827' },
    { tag: 'llm', fill: '#e8f4ff', stroke: '#0f766e', text: '#111827' },
    { tag: 'network', fill: '#fff4d8', stroke: '#a16207', text: '#111827' },
    { tag: 'cooling', fill: '#e7f5ff', stroke: '#0284c7', text: '#111827' },
    { tag: 'optimization', fill: '#f3e8ff', stroke: '#7e22ce', text: '#111827' },
    { tag: 'risk', fill: '#ffe8e8', stroke: '#b91c1c', text: '#111827' },
    { tag: 'cost', fill: '#fff0f6', stroke: '#be185d', text: '#111827' },
    { tag: 'benchmark', fill: '#eef2f7', stroke: '#475569', text: '#111827' },
    { tag: 'phase', fill: '#ecfdf5', stroke: '#047857', text: '#111827' },
    { tag: 'alternative', fill: '#fefce8', stroke: '#a16207', text: '#111827' },
  ],
};

function col(n) {
  let x = n, s = '';
  while (x > 0) { x -= 1; s = String.fromCharCode(65 + x % 26) + s; x = Math.floor(x / 26); }
  return s;
}
const address = (x, y) => `${col(x)}${y}.tl`;
const N = (id, label, x, y, tags = [], description = null) => ({ id, label, x, y, tags, description: description ?? label });
const E = (id, from, to, tags = [], technology = 'logical flow') => ({ id, from, to, tags, technology });

const maps = [
  {
    slug: '01-overview', name: 'BC-250 Local AI Compute — System Overview', cols: 280, rows: 210,
    nodes: [
      N('root', 'BC-250 AS A LOW-COST LOCAL AI COMPUTE APPLIANCE', 105, 4, ['root', 'llm']),
      N('stock', 'STOCK BASELINE — 16 GB shared GDDR6 / 24 GPU CUs / 6 Zen 2 cores / Linux-first', 105, 26, ['hardware']),
      N('strategy', 'BUILD STRATEGY', 105, 48, ['phase']),
      N('better', 'BETTER — ducted cooling / TTM-GTT tuning / efficient clocks / optional 40-CU and 8-core qualification', 25, 48, ['optimization', 'cooling']),
      N('cheaper', 'CHEAPER — reuse PSU / SSD / fans / simple frame; spend first on thermals and power quality', 185, 48, ['cost', 'hardware']),
      N('runtime', 'SOFTWARE — Linux + Mesa/RADV + Vulkan + llama.cpp or Ollama + optional Open WebUI', 105, 72, ['software', 'llm']),
      N('single', 'ONE BOARD — private LAN inference for general chat / coding / RAG / batch / agent work', 105, 96, ['llm']),
      N('scale', 'SCALE QUESTION — do we need more model capacity or more concurrent work?', 105, 120, ['benchmark']),
      N('fleet', 'SCALE — independent specialist workers first; llama.cpp RPC when one model genuinely must span boards', 105, 144, ['network', 'llm']),
      N('alts', 'ALTERNATIVES — existing CUDA GPU / used high-VRAM accelerator / newer unified-memory AI appliance', 185, 144, ['alternative', 'cost']),
      N('result', 'BEST FIT — cheap private inference appliance / weird-compute lab / agent worker', 105, 170, ['root', 'llm']),
    ],
    edges: [
      E('e1', 'root.S', 'stock.N', ['hardware']), E('e2', 'stock.S', 'strategy.N', ['phase']),
      E('e3', 'strategy.W', 'better.E', ['optimization']), E('e4', 'strategy.E', 'cheaper.W', ['cost']),
      E('e5', 'strategy.S', 'runtime.N', ['software']), E('e6', 'runtime.S', 'single.N', ['llm']),
      E('e7', 'single.S', 'scale.N', ['benchmark']), E('e8', 'scale.S', 'fleet.N', ['network']),
      E('e9', 'fleet.E', 'alts.W', ['alternative']), E('e10', 'fleet.S', 'result.N', ['llm']),
    ],
  },
  {
    slug: '02-single-node', name: 'BC-250 Local AI Compute — Single Node Stack', cols: 280, rows: 240,
    nodes: [
      N('start', 'HEADLESS BC-250 AI NODE', 105, 4, ['root', 'llm']),
      N('power', 'POWER + MOUNT — known-good PCIe power / safe board mounting / physical inspection', 105, 26, ['hardware', 'risk']),
      N('cool', 'COOLING — ducted pressure airflow / GDDR6 and VRM attention / fan telemetry / fail-safe', 105, 48, ['cooling', 'hardware']),
      N('linux', 'LINUX — modern kernel + SSH + current Mesa/RADV Vulkan stack', 105, 70, ['software']),
      N('telemetry', 'OBSERVE — temperatures / fan RPM / clocks / watts / resets / inference errors', 25, 70, ['benchmark', 'cooling']),
      N('memory', 'MEMORY — tune TTM/GTT so Vulkan can allocate the intended shared-memory budget', 105, 94, ['software', 'optimization']),
      N('unlock', 'OPTIONAL — only after stock qualification: 40-CU GPU and/or 8-core CPU; then re-test correctness and thermals', 185, 94, ['optimization', 'risk']),
      N('runtime', 'INFERENCE — llama.cpp Vulkan OR Ollama', 105, 118, ['software', 'llm']),
      N('models', 'MODEL FIT — choose quantization from real free memory + context/KV budget + target latency', 105, 142, ['llm']),
      N('api', 'SERVICE — OpenAI-compatible LAN API + optional Open WebUI', 105, 166, ['network', 'llm']),
      N('clients', 'CLIENTS — BrainnStation / coding agents / RAG / automation / voice / local services', 105, 190, ['root', 'llm']),
    ],
    edges: [
      E('e1', 'start.S', 'power.N'), E('e2', 'power.S', 'cool.N'), E('e3', 'cool.S', 'linux.N'),
      E('e4', 'linux.W', 'telemetry.E', ['benchmark']), E('e5', 'linux.S', 'memory.N'),
      E('e6', 'memory.E', 'unlock.W', ['optimization', 'risk']), E('e7', 'memory.S', 'runtime.N'),
      E('e8', 'runtime.S', 'models.N'), E('e9', 'models.S', 'api.N', ['network']), E('e10', 'api.S', 'clients.N'),
    ],
  },
  {
    slug: '03-cluster', name: 'BC-250 Local AI Compute — Cluster Topology', cols: 300, rows: 250,
    nodes: [
      N('client', 'LOCAL CLIENTS / AGENTS', 105, 4, ['root', 'llm']),
      N('router', 'ROUTER — one logical OpenAI-compatible endpoint / health-aware task + model routing', 105, 26, ['network', 'llm']),
      N('mode', 'SCALING MODE — choose from the measured bottleneck', 105, 50, ['benchmark']),
      N('shard', 'DEFAULT — request-level sharding', 25, 50, ['network', 'llm']),
      N('rpc', 'WHEN NEEDED — distributed-model RPC', 185, 50, ['network', 'llm']),
      N('workers', 'SPECIALISTS — fast general / coding / RAG-batch / speech / image / evaluation workers', 25, 76, ['llm']),
      N('coord', 'RPC COORDINATOR — llama-server + local Vulkan GPU', 185, 76, ['network', 'llm']),
      N('worker', 'RPC WORKER — ggml-rpc-server + Vulkan GPU', 185, 100, ['network', 'llm']),
      N('backend', 'RPC BACKEND — dedicated 2.5 GbE point-to-point; separate it from management/internet traffic', 185, 124, ['network', 'risk']),
      N('shardrule', 'SHARDING BENEFIT — locality / concurrency / independent models / isolated failures', 25, 150, ['benchmark', 'llm']),
      N('rpcrule', 'RPC BENEFIT — one larger model can span boards; cost is network synchronization and watts', 185, 150, ['benchmark', 'network']),
      N('ops', 'OPERATIONS — Ansible/config management / model inventory / health / Prometheus-Grafana / thermals', 105, 176, ['software', 'benchmark']),
      N('rule', 'SCALE RULE — add independent workers first; grow distributed-model groups only after quality + network benchmarks', 105, 202, ['root', 'benchmark']),
    ],
    edges: [
      E('e1', 'client.S', 'router.N', ['network']), E('e2', 'router.S', 'mode.N', ['benchmark']),
      E('e3', 'mode.W', 'shard.E', ['llm']), E('e4', 'mode.E', 'rpc.W', ['llm']),
      E('e5', 'shard.S', 'workers.N', ['llm']), E('e6', 'rpc.S', 'coord.N', ['network']),
      E('e7', 'coord.S', 'worker.N', ['network'], 'llama.cpp RPC'), E('e8', 'worker.S', 'backend.N', ['network']),
      E('e9', 'workers.S', 'shardrule.N', ['benchmark']), E('e10', 'backend.S', 'rpcrule.N', ['benchmark']),
      E('e11', 'mode.S', 'ops.N', ['software']), E('e12', 'ops.S', 'rule.N', ['benchmark']),
    ],
  },
  {
    slug: '04-diy-build', name: 'BC-250 Local AI Compute — DIY Build Flow', cols: 300, rows: 310,
    nodes: [
      N('start', 'DIY BC-250 AI NODE BUILD', 105, 4, ['root', 'phase']),
      N('source', 'SOURCE + INSPECT — board / connectors / heatsink / storage / physical condition', 105, 26, ['hardware', 'risk']),
      N('mount', 'MOUNT — simple safe frame / protect underside / define airflow path', 105, 48, ['hardware', 'risk']),
      N('power', 'POWER — known-good PSU / verify PCIe power / avoid questionable adapters', 105, 70, ['hardware', 'risk']),
      N('cool', 'COOLING FIRST — pressure fans / ducting / GDDR6-VRM attention / visible sensors', 105, 92, ['cooling', 'hardware']),
      N('boot', 'BOOT — modern Linux + SSH + management Ethernet + Vulkan check', 105, 114, ['software', 'network']),
      N('test', 'STOCK QUALIFICATION — stress / memory / Vulkan / thermal validation', 105, 136, ['benchmark', 'risk']),
      N('fix', 'IF UNSTABLE — repair cooling / power / storage / firmware / board issue, then repeat stock validation', 185, 136, ['risk', 'hardware']),
      N('baseline', 'IF STABLE — capture power / clocks / temps / Vulkan-visible memory / inference baseline', 105, 160, ['benchmark']),
      N('memory', 'TUNE — TTM/GTT + cooling-efficiency profile; verify repeatable gain', 105, 184, ['software', 'optimization']),
      N('llm', 'LLM — install llama.cpp or Ollama; start small; step upward in model size and context', 105, 208, ['software', 'llm']),
      N('unlock', 'OPTIONAL — qualify 40-CU / 8-core path only now; maintain rollback and repeat correctness tests', 185, 208, ['optimization', 'risk']),
      N('serve', 'SERVE — LAN-only API + optional Open WebUI + firewall + process supervision', 105, 232, ['network', 'llm', 'risk']),
      N('second', 'EXPAND — add board #2 only after node #1 is boring and reliable', 105, 256, ['network', 'phase']),
      N('done', 'RESULT — reproducible AI appliance with measured baseline and rollback path', 105, 280, ['root', 'benchmark']),
    ],
    edges: [
      E('e1', 'start.S', 'source.N'), E('e2', 'source.S', 'mount.N'), E('e3', 'mount.S', 'power.N'),
      E('e4', 'power.S', 'cool.N'), E('e5', 'cool.S', 'boot.N'), E('e6', 'boot.S', 'test.N'),
      E('e7', 'test.E', 'fix.W', ['risk']), E('e8', 'test.S', 'baseline.N', ['benchmark']),
      E('e9', 'baseline.S', 'memory.N'), E('e10', 'memory.S', 'llm.N'), E('e11', 'llm.E', 'unlock.W', ['optimization', 'risk']),
      E('e12', 'llm.S', 'serve.N'), E('e13', 'serve.S', 'second.N'), E('e14', 'second.S', 'done.N'),
    ],
  },
  {
    slug: '05-cost-options', name: 'BC-250 Local AI Compute — Cost and Alternatives', cols: 300, rows: 290,
    nodes: [
      N('goal', 'GOAL — most useful private AI compute per dollar', 105, 4, ['root', 'cost']),
      N('own', 'QUESTION — already own capable compute?', 105, 28, ['cost']),
      N('existing', 'YES — benchmark the existing GPU-PC first; zero acquisition cost is hard to beat', 25, 28, ['alternative', 'cost']),
      N('bc', 'NO / WANT A SEPARATE APPLIANCE — price the complete BC-250 node', 105, 52, ['hardware', 'cost']),
      N('minimum', 'MINIMUM SPEND — board + reused PSU + reused SSD + two good fans + simple mount', 105, 76, ['hardware', 'cost']),
      N('smart', 'SMART SPEND — ducting / thermal interface / telemetry / power quality before cosmetics', 105, 100, ['cooling', 'cost']),
      N('avoid', 'DEFER — premium case / display / RGB / oversized storage / desktop peripherals', 105, 124, ['cost']),
      N('bottle', 'QUESTION — what is the actual bottleneck?', 105, 148, ['benchmark']),
      N('simple', 'SIMPLICITY / LATENCY — conventional CUDA GPU may win', 25, 148, ['alternative']),
      N('vram', 'CAPACITY — compare used 24-32 GB accelerators, accepting age / power / software trade-offs', 185, 148, ['alternative', 'cost']),
      N('second', 'BOARD #2 CHECK — compare second BC-250 + 2.5 GbE adapters against one higher-memory alternative', 105, 174, ['network', 'cost', 'alternative']),
      N('fleet', 'CONCURRENCY — independent workers can scale jobs without forcing every model over the network', 105, 198, ['network', 'llm']),
      N('metric', 'MEASURE — total node cost / usable model quality / TTFT / tok-s / watts / thermals / maintenance', 105, 222, ['benchmark', 'cost']),
      N('rule', 'PURCHASE RULE — compare the whole node and workload, not the BC-250 board price alone', 105, 246, ['root', 'cost']),
    ],
    edges: [
      E('e1', 'goal.S', 'own.N'), E('e2', 'own.W', 'existing.E', ['alternative']), E('e3', 'own.S', 'bc.N'),
      E('e4', 'bc.S', 'minimum.N'), E('e5', 'minimum.S', 'smart.N'), E('e6', 'smart.S', 'avoid.N'),
      E('e7', 'avoid.S', 'bottle.N'), E('e8', 'bottle.W', 'simple.E', ['alternative']), E('e9', 'bottle.E', 'vram.W', ['alternative']),
      E('e10', 'bottle.S', 'second.N'), E('e11', 'second.S', 'fleet.N'), E('e12', 'fleet.S', 'metric.N'), E('e13', 'metric.S', 'rule.N'),
    ],
  },
  {
    slug: '06-roadmap', name: 'BC-250 Local AI Compute — Research and Build Roadmap', cols: 280, rows: 390,
    nodes: [
      N('p0', 'PHASE 0 — source / inspect / document', 105, 4, ['root', 'phase']),
      N('g0', 'GATE — boots / sensors work / cooling controllable / stock hardware stable', 105, 28, ['benchmark', 'risk']),
      N('p1', 'PHASE 1 — stock single-node LLM baseline', 105, 52, ['phase', 'llm']),
      N('b1', 'MEASURE — model fit / prompt tok-s / generation tok-s / TTFT / watts / temps / errors', 105, 76, ['benchmark']),
      N('p2', 'PHASE 2 — memory + thermal + efficiency tuning', 105, 100, ['phase', 'optimization']),
      N('g2', 'GATE — improvement is repeatable and worth added power / complexity', 105, 124, ['benchmark']),
      N('unlock', 'OPTIONAL — qualify 40-CU / 8-core paths with rollback and correctness tests', 185, 124, ['optimization', 'risk']),
      N('p3', 'PHASE 3 — second node', 105, 150, ['phase', 'network']),
      N('net', 'NETWORK TEST — dedicated 2.5 GbE backend; request sharding vs llama.cpp RPC model split', 105, 174, ['network', 'benchmark']),
      N('g3', 'GATE — larger-model quality or concurrency justifies second-node watts and latency', 105, 198, ['benchmark']),
      N('p4', 'PHASE 4 — router + specialist workers', 105, 222, ['phase', 'llm']),
      N('roles', 'ROLES — fast / code / RAG-batch / speech / image / evaluation', 105, 246, ['llm']),
      N('ops', 'OPERATIONS — config management / monitoring / health / API policy / model-version inventory', 105, 270, ['software', 'benchmark']),
      N('p5', 'PHASE 5 — fleet or rack only if the economics still win', 105, 294, ['phase', 'cost']),
      N('fleetbench', 'FLEET GATE — compare throughput per dollar and per watt against simpler alternative hardware', 105, 318, ['benchmark', 'alternative']),
      N('end', 'END STATE — measured, reproducible local AI fabric', 105, 344, ['root', 'llm']),
    ],
    edges: [
      E('e1', 'p0.S', 'g0.N'), E('e2', 'g0.S', 'p1.N'), E('e3', 'p1.S', 'b1.N'), E('e4', 'b1.S', 'p2.N'),
      E('e5', 'p2.S', 'g2.N'), E('e6', 'g2.E', 'unlock.W', ['optimization', 'risk']), E('e7', 'g2.S', 'p3.N'),
      E('e8', 'p3.S', 'net.N'), E('e9', 'net.S', 'g3.N'), E('e10', 'g3.S', 'p4.N'), E('e11', 'p4.S', 'roles.N'),
      E('e12', 'roles.S', 'ops.N'), E('e13', 'ops.S', 'p5.N'), E('e14', 'p5.S', 'fleetbench.N'), E('e15', 'fleetbench.S', 'end.N'),
    ],
  },
];

function createCaller() {
  const session = createSession({ cwd: root, createdAt: CREATED_AT });
  const registry = new Map(createTools(session).map((tool) => [tool.name, tool]));
  return async (name, args = {}) => {
    const tool = registry.get(name);
    if (!tool) throw new Error(`missing MCP tool ${name}`);
    return await tool.handler(args);
  };
}

async function build(spec) {
  const call = createCaller();
  const jsonPath = path.join(outDir, `${spec.slug}.turtlepen.json`);
  const svgPath = path.join(outDir, `${spec.slug}.svg`);
  await call('new_diagram', { name: spec.name, path: jsonPath, cols: spec.cols, rows: spec.rows, fontSize: 10 });

  const operations = [];
  for (const node of spec.nodes) {
    const measured = JSON.parse(await call('measure', { text: node.label, maxWidthCells: 52 }));
    if ((measured.cellsTall ?? 0) > 12) throw new Error(`${spec.slug}:${node.id} label needs ${measured.cellsTall} cells of text height`);
    operations.push({ op: 'place_box', id: node.id, at: address(node.x, node.y), span: SPAN, label: node.label, corner: 'rounded', align: 'center' });
    operations.push({ op: 'annotate', id: node.id, description: node.description, tags: node.tags });
  }

  const rehearsal = JSON.parse(await call('plan', { operations, commit: false, format: 'json' }));
  if (!rehearsal.ok) throw new Error(`${spec.slug}: placement rehearsal failed: ${rehearsal.error}`);
  const committed = JSON.parse(await call('plan', { operations, commit: true, format: 'json' }));
  if (!committed.ok) throw new Error(`${spec.slug}: placement commit failed: ${committed.error}`);

  for (const edge of spec.edges) {
    try {
      await call('connect', {
        id: edge.id, from: edge.from, to: edge.to, routing: 'orthogonal',
        description: `${edge.from} -> ${edge.to}`, technology: edge.technology, tags: edge.tags,
      });
    } catch (error) {
      throw new Error(`${spec.slug}:${edge.id} ${edge.from}->${edge.to}: ${error.message}`);
    }
  }

  await call('configure_theme', theme);
  for (const source of sources) await call('attach_resource', source);

  let validation = JSON.parse(await call('validate', { format: 'json' }));
  for (const finding of validation.open.filter((f) => f.severity === 'S3')) {
    await call('accept_finding', { fingerprint: finding.fingerprint, reason: 'Deliberate schematic spacing for readable architecture relationships.' });
  }
  validation = JSON.parse(await call('validate', { format: 'json' }));
  if (validation.open.length) throw new Error(`${spec.slug}: validation open:\n${validation.open.map((f) => `[${f.severity}] ${f.rule} ${f.message}`).join('\n')}`);

  const renderReceipt = await call('render', { path: svgPath, showGrid: false, markFindings: false, bounds: 'content', margin: 30 });
  const renderHash = /renderHash:\s*([0-9a-f]+)/i.exec(renderReceipt)?.[1] ?? 'unknown';
  return { slug: spec.slug, name: spec.name, nodes: spec.nodes.length, edges: spec.edges.length, renderHash };
}

const results = [];
for (const spec of maps) {
  console.log(`\n=== ${spec.name} ===`);
  const result = await build(spec);
  results.push(result);
  console.log(`validated + rendered ${result.slug}: ${result.nodes} nodes / ${result.edges} relationships / ${result.renderHash}`);
}

const index = `# BC-250 Local AI Compute Atlas\n\nGenerated through TurtlePen's MCP tool handlers by \`examples/bc250-local-ai-atlas.js\`.\n\n${results.map((r) => `- **${r.name}** — [SVG](./${r.slug}.svg) · [TurtlePen JSON](./${r.slug}.turtlepen.json) · ${r.nodes} nodes / ${r.edges} relationships · \`${r.renderHash}\``).join('\n')}\n\n## Core architecture\n\nStart with one stock, reliable board. Qualify cooling and memory behavior before optional silicon unlocks. Scale concurrency with independent specialist workers first. Use distributed-model llama.cpp RPC when one model genuinely needs to span boards; the strongest current reference uses a dedicated 2.5 GbE backend.\n\n## Sources\n\n${sources.map((s) => `- [${s.label}](${s.uri}) — ${s.description}`).join('\n')}\n`;
await writeFile(path.join(outDir, 'README.md'), index, 'utf8');
console.log(`\nwrote ${path.relative(root, path.join(outDir, 'README.md'))}`);
