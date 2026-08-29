#!/usr/bin/env node
/**
 * BC-250 Local AI Compute Atlas
 *
 * Builds six validated diagrams through TurtlePen's MCP tool handlers rather
 * than calling core drawing functions directly. The compositions deliberately
 * use simple vertical/horizontal semantic relationships so TurtlePen can keep
 * every connector inspectable and exact.
 *
 * Run:
 *   node examples/bc250-local-ai-atlas.js
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createSession, createTools } from '../src/mcp/tools.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outputDir = path.join(root, 'diagrams', 'bc250-local-ai');
const CREATED_AT = '2026-08-29T15:34:00.000Z';
await mkdir(outputDir, { recursive: true });

const SOURCES = [
  ['source-video', 'Original BC-250 video', 'https://www.youtube.com/watch?v=Ztkh2UfSUxw', 'Starting point for this research and architecture map.'],
  ['source-h6', 'H6 BC-250 documentation', 'https://github.com/H6-Technologies/BC-250', 'Community hardware and Linux documentation.'],
  ['source-ollama', 'BC-250 Ollama + Open WebUI', 'https://github.com/thelamer/bc250-ollama-openwebui', 'Headless Vulkan/Ollama/Open WebUI deployment.'],
  ['source-benchmarks', 'BC-250 LLM benchmarks', 'https://github.com/akandr/bc250', 'Single-board Vulkan inference and memory tuning notes.'],
  ['source-cu-unlock', '40-CU unlock research', 'https://github.com/duggasco/bc250-40cu-unlock', 'Optional GPU compute-unit re-enable research.'],
  ['source-core-unlock', '8-core / CU helper tooling', 'https://github.com/GabriWar/bc250-core-cu-unlock', 'Optional CPU-core and GPU-CU qualification tooling.'],
  ['source-two-node', 'Two-node llama.cpp cluster', 'https://github.com/4claps/bc250-llama-cluster', 'Validated coordinator + RPC worker architecture with a dedicated 2.5 GbE backend.'],
  ['source-four-node', 'Four-node BC-250 cluster', 'https://github.com/Cirius1792/bc250-cluster-ansible', 'Reference multi-worker llama.cpp RPC fleet.'],
].map(([id, label, uri, description]) => ({ id, type: 'url', label, uri, description, tags: ['source'] }));

const THEME = {
  name: 'bc250-local-ai',
  tokens: {},
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
  perspectiveStyles: [],
};

function columnName(n) {
  let value = n;
  let out = '';
  while (value > 0) {
    value -= 1;
    out = String.fromCharCode(65 + (value % 26)) + out;
    value = Math.floor(value / 26);
  }
  return out;
}

const at = (x, y) => `${columnName(x)}${y}.tl`;
const props = (o = {}) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]));

function N(id, label, x, y, tags = [], options = {}) {
  return {
    id, label, x, y, tags,
    shape: options.shape ?? 'process',
    minW: options.minW ?? 32,
    minH: options.minH ?? 10,
    maxWidth: options.maxWidth ?? 34,
    description: options.description ?? label,
    technology: options.technology ?? null,
    properties: props(options.properties),
    perspectives: props(options.perspectives),
  };
}

function E(id, from, to, tags = [], options = {}) {
  return {
    id, from, to, tags,
    description: options.description ?? `${from} feeds ${to}`,
    technology: options.technology ?? 'logical flow',
    relationshipLabel: options.label ?? null,
  };
}

const maps = [
  {
    slug: '01-overview',
    name: 'BC-250 Local AI Compute — System Overview',
    cols: 260, rows: 190,
    nodes: [
      N('root', 'BC-250 AS A LOW-COST LOCAL AI COMPUTE APPLIANCE', 90, 4, ['root', 'llm'], { shape: 'terminator', minW: 42 }),
      N('stock', 'Stock baseline: 16 GB shared GDDR6, 24 GPU CUs, 6 Zen 2 cores, Linux-first', 90, 24, ['hardware'], { minW: 42, properties: { memory: '16 GB shared GDDR6', gpu: '24 CUs stock', cpu: '6 cores stock' } }),
      N('strategy', 'BUILD STRATEGY', 90, 44, ['phase'], { shape: 'subprocess', minW: 30 }),
      N('better', 'BETTER: ducted cooling, TTM/GTT memory tuning, efficiency profile, optional 40-CU / 8-core qualification', 10, 44, ['optimization', 'cooling'], { minW: 42 }),
      N('cheaper', 'CHEAPER: reuse PSU / SSD / fans, simple frame, spend first on thermals and power quality', 170, 44, ['cost', 'hardware'], { minW: 42 }),
      N('runtime', 'Linux + Mesa/RADV + Vulkan + llama.cpp or Ollama + Open WebUI', 90, 68, ['software', 'llm'], { minW: 42, technology: 'Linux / Vulkan' }),
      N('single', 'ONE BOARD: private LAN inference service for general, coding, RAG, batch and agent work', 90, 90, ['llm'], { minW: 42 }),
      N('scale', 'Need more capacity or concurrency?', 90, 112, ['benchmark'], { shape: 'decision', minW: 34 }),
      N('fleet', 'SCALE: route whole requests to specialist workers first; use llama.cpp RPC when one model must span boards', 90, 138, ['network', 'llm'], { minW: 46 }),
      N('alternatives', 'ALTERNATIVES: existing CUDA GPU, used high-VRAM accelerator, or newer unified-memory AI appliance', 170, 138, ['alternative', 'cost'], { minW: 42 }),
      N('result', 'BEST FIT: cheap private inference appliance / weird-compute lab / agent worker', 90, 164, ['root', 'llm'], { shape: 'terminator', minW: 44 }),
    ],
    edges: [
      E('e_root_stock', 'root.S', 'stock.N', ['hardware']),
      E('e_stock_strategy', 'stock.S', 'strategy.N', ['phase']),
      E('e_strategy_better', 'strategy.W', 'better.E', ['optimization']),
      E('e_strategy_cheaper', 'strategy.E', 'cheaper.W', ['cost']),
      E('e_strategy_runtime', 'strategy.S', 'runtime.N', ['software']),
      E('e_runtime_single', 'runtime.S', 'single.N', ['llm']),
      E('e_single_scale', 'single.S', 'scale.N', ['benchmark']),
      E('e_scale_fleet', 'scale.S', 'fleet.N', ['network']),
      E('e_fleet_alternatives', 'fleet.E', 'alternatives.W', ['alternative']),
      E('e_fleet_result', 'fleet.S', 'result.N', ['llm']),
    ],
  },
  {
    slug: '02-single-node',
    name: 'BC-250 Local AI Compute — Single Node Stack',
    cols: 260, rows: 210,
    nodes: [
      N('start', 'HEADLESS BC-250 AI NODE', 90, 4, ['root', 'llm'], { shape: 'terminator' }),
      N('power', 'Known-good PCIe power + safe mount + board inspection', 90, 24, ['hardware', 'risk']),
      N('cooling', 'Ducted high-static-pressure airflow; cool GDDR6 / VRM areas; fan telemetry and fail-safe', 90, 46, ['cooling', 'hardware'], { minW: 44 }),
      N('linux', 'Modern Linux + SSH + current Mesa/RADV Vulkan stack', 90, 70, ['software'], { technology: 'Linux / Mesa / RADV' }),
      N('telemetry', 'Observe temperatures, fan RPM, clocks, watts, resets and inference errors', 10, 70, ['benchmark', 'cooling'], { minW: 40 }),
      N('memory', 'Tune TTM/GTT so Vulkan can allocate most of the usable shared-memory pool', 90, 94, ['software', 'optimization'], { minW: 42, technology: 'amdgpu TTM/GTT' }),
      N('unlock', 'OPTIONAL ONLY AFTER STOCK QUALIFICATION: 40-CU GPU and/or 8-core CPU unlock; re-test correctness and thermals', 170, 94, ['optimization', 'risk'], { minW: 44 }),
      N('runtime', 'llama.cpp Vulkan OR Ollama', 90, 118, ['software', 'llm'], { shape: 'subprocess', technology: 'llama.cpp / Ollama' }),
      N('models', 'Quantized model selected from real free memory, context/KV budget and target latency', 90, 140, ['llm'], { shape: 'data', minW: 42 }),
      N('api', 'OpenAI-compatible LAN API + optional Open WebUI', 90, 164, ['network', 'llm'], { shape: 'io', technology: 'HTTP' }),
      N('clients', 'BrainnStation / coding agents / RAG / automation / voice / other local services', 90, 188, ['root', 'llm'], { shape: 'terminator', minW: 44 }),
    ],
    edges: [
      E('e1', 'start.S', 'power.N', ['hardware']),
      E('e2', 'power.S', 'cooling.N', ['cooling']),
      E('e3', 'cooling.S', 'linux.N', ['software']),
      E('e4', 'linux.W', 'telemetry.E', ['benchmark']),
      E('e5', 'linux.S', 'memory.N', ['optimization']),
      E('e6', 'memory.E', 'unlock.W', ['optimization', 'risk']),
      E('e7', 'memory.S', 'runtime.N', ['llm']),
      E('e8', 'runtime.S', 'models.N', ['llm']),
      E('e9', 'models.S', 'api.N', ['network']),
      E('e10', 'api.S', 'clients.N', ['llm']),
    ],
  },
  {
    slug: '03-cluster',
    name: 'BC-250 Local AI Compute — Cluster Topology',
    cols: 280, rows: 220,
    nodes: [
      N('client', 'LOCAL CLIENTS / AGENTS', 100, 4, ['root', 'llm'], { shape: 'terminator' }),
      N('router', 'Gateway / model router / OpenAI-compatible API', 100, 24, ['network', 'llm'], { technology: 'HTTP routing' }),
      N('mode', 'Choose scaling mode from the measured bottleneck', 100, 46, ['benchmark'], { shape: 'decision', minW: 38 }),
      N('shard', 'DEFAULT: request-level sharding', 20, 46, ['network', 'llm'], { shape: 'subprocess' }),
      N('rpc', 'WHEN NEEDED: distributed-model RPC', 180, 46, ['network', 'llm'], { shape: 'subprocess' }),
      N('workers', 'Independent workers: fast general / coding / RAG-batch / speech / image / evaluator', 20, 72, ['llm'], { minW: 44 }),
      N('coordinator', 'RPC coordinator: llama-server + local Vulkan GPU', 180, 72, ['network', 'llm'], { minW: 40, technology: 'llama-server / Vulkan' }),
      N('worker', 'RPC worker: ggml-rpc-server + Vulkan GPU', 180, 96, ['network', 'llm'], { minW: 40, technology: 'ggml-rpc-server / Vulkan' }),
      N('backend', 'Dedicated 2.5 GbE point-to-point backend; keep RPC off the management/internet path', 180, 120, ['network', 'risk'], { minW: 44, technology: '2.5 GbE' }),
      N('shard_rule', 'Benefit: locality + concurrency + independent model upgrades', 20, 146, ['benchmark', 'llm'], { minW: 40 }),
      N('rpc_rule', 'Benefit: one larger model can span boards; cost is synchronization/network overhead', 180, 146, ['benchmark', 'network'], { minW: 44 }),
      N('ops', 'Shared operations: Ansible/config management, model inventory, health checks, Prometheus/Grafana, thermals', 100, 172, ['software', 'benchmark'], { minW: 46 }),
      N('rule', 'SCALE RULE: add independent workers first; expand distributed-model groups only after network + quality benchmarks', 100, 198, ['root', 'benchmark'], { shape: 'terminator', minW: 48 }),
    ],
    edges: [
      E('e1', 'client.S', 'router.N', ['network']),
      E('e2', 'router.S', 'mode.N', ['benchmark']),
      E('e3', 'mode.W', 'shard.E', ['llm']),
      E('e4', 'mode.E', 'rpc.W', ['llm']),
      E('e5', 'shard.S', 'workers.N', ['llm']),
      E('e6', 'rpc.S', 'coordinator.N', ['network']),
      E('e7', 'coordinator.S', 'worker.N', ['network'], { technology: 'llama.cpp RPC' }),
      E('e8', 'worker.S', 'backend.N', ['network']),
      E('e9', 'workers.S', 'shard_rule.N', ['benchmark']),
      E('e10', 'backend.S', 'rpc_rule.N', ['benchmark']),
      E('e11', 'ops.S', 'rule.N', ['benchmark']),
    ],
  },
  {
    slug: '04-diy-build',
    name: 'BC-250 Local AI Compute — DIY Build Flow',
    cols: 280, rows: 270,
    nodes: [
      N('start', 'DIY BC-250 AI NODE BUILD', 90, 4, ['root', 'phase'], { shape: 'terminator' }),
      N('source', 'Source board + inspect connectors, heatsink, storage and physical condition', 90, 24, ['hardware', 'risk'], { minW: 42 }),
      N('mount', 'Safe open-frame / printed mount; protect board underside and define the airflow path', 90, 46, ['hardware', 'risk'], { minW: 42 }),
      N('power', 'Known-good PSU; verify PCIe power; avoid questionable adapters', 90, 68, ['hardware', 'risk']),
      N('cool', 'Cooling first: pressure fans + ducting + memory/VRM attention + visible sensors', 90, 90, ['cooling', 'hardware'], { minW: 42 }),
      N('boot', 'Install modern Linux + SSH + management Ethernet', 90, 112, ['software', 'network']),
      N('test', 'Stock stress / memory / Vulkan / thermal validation', 90, 134, ['benchmark', 'risk'], { shape: 'decision', minW: 38 }),
      N('fix', 'UNSTABLE: repair cooling / power / storage / firmware / board issue, then repeat stock validation', 170, 134, ['risk', 'hardware'], { minW: 44 }),
      N('baseline', 'STABLE: capture power, clocks, temps, visible memory and inference baseline', 90, 160, ['benchmark'], { minW: 42 }),
      N('memory', 'Tune TTM/GTT; confirm Vulkan can allocate the intended shared-memory budget', 90, 182, ['software', 'optimization'], { minW: 42 }),
      N('llm', 'Install llama.cpp/Ollama; start with known-small model; step upward in model size/context', 90, 204, ['software', 'llm'], { minW: 44 }),
      N('unlock', 'Optional 40-CU / 8-core experiment only after stock reliability; re-run correctness + thermal qualification', 170, 204, ['optimization', 'risk'], { minW: 44 }),
      N('serve', 'Expose LAN-only API + optional Open WebUI; firewall and supervise the service', 90, 228, ['network', 'llm', 'risk'], { minW: 42 }),
      N('done', 'RESULT: reproducible AI appliance with measured baseline and rollback path', 90, 252, ['root', 'benchmark'], { shape: 'terminator', minW: 44 }),
    ],
    edges: [
      E('e1', 'start.S', 'source.N'),
      E('e2', 'source.S', 'mount.N'),
      E('e3', 'mount.S', 'power.N'),
      E('e4', 'power.S', 'cool.N'),
      E('e5', 'cool.S', 'boot.N'),
      E('e6', 'boot.S', 'test.N'),
      E('e7', 'test.E', 'fix.W', ['risk']),
      E('e8', 'test.S', 'baseline.N', ['benchmark']),
      E('e9', 'baseline.S', 'memory.N', ['optimization']),
      E('e10', 'memory.S', 'llm.N', ['llm']),
      E('e11', 'llm.E', 'unlock.W', ['optimization', 'risk']),
      E('e12', 'llm.S', 'serve.N', ['network']),
      E('e13', 'serve.S', 'done.N', ['benchmark']),
    ],
  },
  {
    slug: '05-cost-options',
    name: 'BC-250 Local AI Compute — Cost and Alternatives',
    cols: 300, rows: 230,
    nodes: [
      N('goal', 'GOAL: MOST USEFUL PRIVATE AI COMPUTE PER DOLLAR', 100, 4, ['root', 'cost'], { shape: 'terminator', minW: 42 }),
      N('own', 'Already own capable compute?', 100, 26, ['cost'], { shape: 'decision' }),
      N('existing', 'YES: benchmark existing GPU/PC first — zero acquisition cost is hard to beat', 20, 26, ['alternative', 'cost'], { minW: 44 }),
      N('bc', 'NO / want separate appliance: price a complete BC-250 node', 100, 52, ['hardware', 'cost'], { minW: 40 }),
      N('minimum', 'MINIMUM: board + reused PSU + reused SSD + two good fans + simple mount', 100, 76, ['hardware', 'cost'], { minW: 42 }),
      N('smart', 'SMART SPEND: ducting / thermal interface / telemetry / power quality before cosmetics', 100, 100, ['cooling', 'cost'], { minW: 44 }),
      N('avoid', 'DEFER: premium case, display, RGB, oversized storage and desktop peripherals', 100, 124, ['cost'], { minW: 42 }),
      N('bottleneck', 'What is the actual bottleneck?', 100, 148, ['benchmark'], { shape: 'decision', minW: 34 }),
      N('simple', 'Software simplicity / latency: conventional CUDA GPU may win', 20, 148, ['alternative'], { minW: 40 }),
      N('vram', 'Capacity: compare used 24–32 GB accelerators, accepting age/power/software trade-offs', 180, 148, ['alternative', 'cost'], { minW: 44 }),
      N('second', 'Before buying board #2, price second BC-250 + 2.5 GbE adapters against one higher-memory alternative', 100, 176, ['network', 'cost', 'alternative'], { minW: 46 }),
      N('fleet', 'Concurrency need: independent workers may scale better than forcing every model across the network', 100, 200, ['network', 'llm'], { minW: 44 }),
      N('rule', 'PURCHASE RULE: compare total node cost, watts, cooling, software friction and useful model quality — not board price alone', 100, 224, ['root', 'benchmark', 'cost'], { shape: 'terminator', minW: 48 }),
    ],
    edges: [
      E('e1', 'goal.S', 'own.N', ['cost']),
      E('e2', 'own.W', 'existing.E', ['alternative']),
      E('e3', 'own.S', 'bc.N', ['hardware']),
      E('e4', 'bc.S', 'minimum.N', ['cost']),
      E('e5', 'minimum.S', 'smart.N', ['cost']),
      E('e6', 'smart.S', 'avoid.N', ['cost']),
      E('e7', 'avoid.S', 'bottleneck.N', ['benchmark']),
      E('e8', 'bottleneck.W', 'simple.E', ['alternative']),
      E('e9', 'bottleneck.E', 'vram.W', ['alternative']),
      E('e10', 'bottleneck.S', 'second.N', ['cost']),
      E('e11', 'second.S', 'fleet.N', ['network']),
      E('e12', 'fleet.S', 'rule.N', ['benchmark']),
    ],
  },
  {
    slug: '06-roadmap',
    name: 'BC-250 Local AI Compute — Research and Build Roadmap',
    cols: 240, rows: 340,
    nodes: [
      N('p0', 'PHASE 0 — SOURCE / INSPECT / DOCUMENT', 80, 4, ['root', 'phase'], { shape: 'terminator', minW: 40 }),
      N('g0', 'Gate: boots, sensors work, cooling is controllable and stock hardware is stable', 80, 26, ['benchmark', 'risk'], { shape: 'decision', minW: 42 }),
      N('p1', 'PHASE 1 — STOCK SINGLE-NODE LLM BASELINE', 80, 52, ['phase', 'llm'], { minW: 42 }),
      N('b1', 'Record model fit, prompt tok/s, generation tok/s, TTFT, watts, temps and errors', 80, 76, ['benchmark'], { minW: 44 }),
      N('p2', 'PHASE 2 — MEMORY + THERMAL + EFFICIENCY TUNING', 80, 100, ['phase', 'optimization'], { minW: 44 }),
      N('g2', 'Gate: gain is repeatable and worth added power / complexity', 80, 124, ['benchmark'], { shape: 'decision', minW: 40 }),
      N('unlock', 'OPTIONAL: qualify 40-CU / 8-core paths with rollback and correctness tests', 160, 124, ['optimization', 'risk'], { minW: 42 }),
      N('p3', 'PHASE 3 — SECOND NODE', 80, 150, ['phase', 'network'], { minW: 34 }),
      N('net', 'Add dedicated 2.5 GbE backend; compare request sharding vs llama.cpp RPC model split', 80, 174, ['network', 'benchmark'], { minW: 46 }),
      N('g3', 'Gate: larger-model quality or concurrency justifies second-node watts and latency', 80, 198, ['benchmark'], { shape: 'decision', minW: 44 }),
      N('p4', 'PHASE 4 — ROUTER + SPECIALIST WORKERS', 80, 224, ['phase', 'llm'], { minW: 42 }),
      N('roles', 'Fast model / coding / RAG-batch / speech / image / evaluation workers', 80, 248, ['llm'], { minW: 42 }),
      N('ops', 'Add config management, monitoring, health checks, API policy and model/version inventory', 80, 272, ['software', 'benchmark'], { minW: 44 }),
      N('p5', 'PHASE 5 — FLEET / RACK ONLY IF ECONOMICS STILL WIN', 80, 296, ['phase', 'cost'], { minW: 44 }),
      N('end', 'END STATE — MEASURED, REPRODUCIBLE LOCAL AI FABRIC', 80, 320, ['root', 'llm'], { shape: 'terminator', minW: 44 }),
    ],
    edges: [
      E('e1', 'p0.S', 'g0.N'), E('e2', 'g0.S', 'p1.N'), E('e3', 'p1.S', 'b1.N'),
      E('e4', 'b1.S', 'p2.N'), E('e5', 'p2.S', 'g2.N'), E('e6', 'g2.E', 'unlock.W', ['optimization', 'risk']),
      E('e7', 'g2.S', 'p3.N'), E('e8', 'p3.S', 'net.N'), E('e9', 'net.S', 'g3.N'),
      E('e10', 'g3.S', 'p4.N'), E('e11', 'p4.S', 'roles.N'), E('e12', 'roles.S', 'ops.N'),
      E('e13', 'ops.S', 'p5.N'), E('e14', 'p5.S', 'end.N'),
    ],
  },
];

function mcpSession() {
  const session = createSession({ cwd: root, createdAt: CREATED_AT });
  const tools = createTools(session);
  const registry = new Map(tools.map((tool) => [tool.name, tool]));
  return async (name, args = {}) => {
    const tool = registry.get(name);
    if (!tool) throw new Error(`TurtlePen MCP tool not found: ${name}`);
    return await tool.handler(args);
  };
}

async function placementOperations(call, nodes) {
  const operations = [];
  for (const node of nodes) {
    const measured = JSON.parse(await call('measure', {
      text: node.label,
      maxWidthCells: node.maxWidth,
      shape: node.shape,
    }));
    const natural = measured.span ?? { w: measured.cellsWide, h: measured.cellsTall };
    const span = {
      w: Math.max(node.minW, Number(natural.w ?? measured.cellsWide ?? node.minW)),
      h: Math.max(node.minH, Number(natural.h ?? measured.cellsTall ?? node.minH)),
    };
    operations.push({
      op: 'place_box', id: node.id, at: at(node.x, node.y), span,
      label: node.label, shape: node.shape, align: 'center',
      corner: node.shape === 'process' ? 'rounded' : 'square',
    });
    operations.push({
      op: 'annotate', id: node.id, description: node.description,
      ...(node.technology ? { technology: node.technology } : {}),
      tags: node.tags, properties: node.properties, perspectives: node.perspectives,
    });
  }
  return operations;
}

async function build(spec) {
  const call = mcpSession();
  const documentPath = path.join(outputDir, `${spec.slug}.turtlepen.json`);
  const svgPath = path.join(outputDir, `${spec.slug}.svg`);

  await call('new_diagram', { name: spec.name, path: documentPath, cols: spec.cols, rows: spec.rows, fontSize: 10 });

  const ops = await placementOperations(call, spec.nodes);
  const rehearsal = JSON.parse(await call('plan', { operations: ops, commit: false, format: 'json' }));
  if (!rehearsal.ok) throw new Error(`${spec.slug}: placement rehearsal failed: ${rehearsal.error}`);
  const committed = JSON.parse(await call('plan', { operations: ops, commit: true, format: 'json' }));
  if (!committed.ok) throw new Error(`${spec.slug}: placement commit failed: ${committed.error}`);

  for (const edge of spec.edges) {
    await call('connect', {
      id: edge.id, from: edge.from, to: edge.to, routing: 'orthogonal',
      description: edge.description, technology: edge.technology, tags: edge.tags,
      ...(edge.relationshipLabel ? { relationshipLabel: edge.relationshipLabel } : {}),
    });
  }

  await call('configure_theme', THEME);
  for (const source of SOURCES) await call('attach_resource', source);

  let validation = JSON.parse(await call('validate', { format: 'json' }));
  for (const finding of validation.open.filter((f) => f.severity === 'S3')) {
    await call('accept_finding', {
      fingerprint: finding.fingerprint,
      reason: 'Deliberate schematic composition: explicit spacing is used to keep architecture relationships readable and inspectable.',
    });
  }
  validation = JSON.parse(await call('validate', { format: 'json' }));
  if (validation.open.length) {
    throw new Error(`${spec.slug}: final validation has open findings:\n${validation.open.map((f) => `[${f.severity}] ${f.rule}: ${f.message}`).join('\n')}`);
  }

  const model = JSON.parse(await call('inspect_model', { minimum: 'warning', format: 'json' }));
  const modelWarnings = model.open?.length ?? model.findings?.length ?? 0;
  if (modelWarnings) {
    throw new Error(`${spec.slug}: semantic model inspection has ${modelWarnings} warning/error finding(s)`);
  }

  const render = await call('render', { path: svgPath, showGrid: false, markFindings: false, bounds: 'content', margin: 30 });
  const renderHash = /renderHash:\s*([0-9a-f]+)/i.exec(render)?.[1] ?? 'unknown';
  return { slug: spec.slug, name: spec.name, nodes: spec.nodes.length, edges: spec.edges.length, renderHash };
}

const results = [];
for (const spec of maps) {
  console.log(`\n=== ${spec.name} ===`);
  const result = await build(spec);
  results.push(result);
  console.log(`validated + rendered ${result.slug}: ${result.nodes} nodes / ${result.edges} relationships / ${result.renderHash}`);
}

const readme = `# BC-250 Local AI Compute Atlas\n\nGenerated through TurtlePen's MCP tool handlers by \`examples/bc250-local-ai-atlas.js\`.\n\n## Maps\n\n${results.map((r) => `- **${r.name}** — [SVG](./${r.slug}.svg) · [TurtlePen JSON](./${r.slug}.turtlepen.json) · ${r.nodes} nodes / ${r.edges} relationships · render \`${r.renderHash}\``).join('\n')}\n\n## Reading order\n\n1. **Overview** — why the BC-250 is more interesting as a local-AI appliance than a weird gaming PC.\n2. **Single Node** — power, cooling, Linux/Vulkan, memory tuning, inference runtime and LAN API.\n3. **Cluster** — independent worker routing versus distributed-model llama.cpp RPC.\n4. **DIY Build** — safe build and qualification sequence.\n5. **Cost + Alternatives** — where to spend, what to reuse, and when another platform wins.\n6. **Roadmap** — gated path from one stock board to a measured local-AI fabric.\n\n## Core architecture\n\nStart with one boring, reliable stock board. Qualify cooling and memory behavior before optional silicon unlocks. Scale concurrency with independent specialist workers first. Use distributed-model llama.cpp RPC when one model genuinely needs to span boards; the strongest current reference uses a dedicated 2.5 GbE backend rather than the onboard management link.\n\n## Sources\n\n${SOURCES.map((s) => `- [${s.label}](${s.uri}) — ${s.description}`).join('\n')}\n`;
await writeFile(path.join(outputDir, 'README.md'), readme, 'utf8');
console.log(`\nwrote ${path.relative(root, path.join(outputDir, 'README.md'))}`);
