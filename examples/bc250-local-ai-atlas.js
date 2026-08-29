#!/usr/bin/env node
/**
 * BC-250 Local AI Compute Atlas
 *
 * Generates a suite of semantic TurtlePen diagrams through the MCP tool layer,
 * not by calling core geometry directly. Each diagram is measured, planned,
 * connected, laid out, validated, and rendered through the same handlers an
 * external MCP client uses.
 *
 * Run:
 *   node examples/bc250-local-ai-atlas.js
 *
 * Outputs:
 *   diagrams/bc250-local-ai/*.turtlepen.json
 *   diagrams/bc250-local-ai/*.svg
 *   diagrams/bc250-local-ai/README.md
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { createSession, createTools } from '../src/mcp/tools.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outputDir = path.join(root, 'diagrams', 'bc250-local-ai');
await mkdir(outputDir, { recursive: true });

const CREATED_AT = '2026-08-29T15:34:00.000Z';

const SOURCES = [
  {
    id: 'source-video',
    type: 'url',
    label: 'Original BC-250 video',
    uri: 'https://www.youtube.com/watch?v=Ztkh2UfSUxw',
    description: 'Starting point for the research and system-map request.',
    tags: ['source', 'video'],
  },
  {
    id: 'source-h6',
    type: 'url',
    label: 'H6 Technologies BC-250 documentation',
    uri: 'https://github.com/H6-Technologies/BC-250',
    description: 'Community hardware, Linux, memory and firmware documentation.',
    tags: ['source', 'hardware'],
  },
  {
    id: 'source-ollama',
    type: 'url',
    label: 'BC-250 Ollama + Open WebUI guide',
    uri: 'https://github.com/thelamer/bc250-ollama-openwebui',
    description: 'Headless local-LLM deployment using Vulkan, Ollama and Open WebUI.',
    tags: ['source', 'llm'],
  },
  {
    id: 'source-benchmarks',
    type: 'url',
    label: 'akandr BC-250 LLM benchmarks',
    uri: 'https://github.com/akandr/bc250',
    description: 'Single-board Vulkan inference notes, TTM/GTT tuning and model measurements.',
    tags: ['source', 'benchmark'],
  },
  {
    id: 'source-cu-unlock',
    type: 'url',
    label: '40-CU unlock research',
    uri: 'https://github.com/duggasco/bc250-40cu-unlock',
    description: 'Community kernel-level work re-enabling the additional GPU compute units.',
    tags: ['source', 'optimization'],
  },
  {
    id: 'source-core-unlock',
    type: 'url',
    label: '8-core + 40-CU helper tooling',
    uri: 'https://github.com/GabriWar/bc250-core-cu-unlock',
    description: 'Community tooling for optional CPU-core and GPU-CU unlock workflows.',
    tags: ['source', 'optimization'],
  },
  {
    id: 'source-two-node',
    type: 'url',
    label: 'Validated two-node BC-250 llama.cpp cluster',
    uri: 'https://github.com/4claps/bc250-llama-cluster',
    description: 'Two-node Vulkan/RPC design using a dedicated 2.5 GbE backend and OpenAI-compatible API.',
    tags: ['source', 'cluster'],
  },
  {
    id: 'source-four-node',
    type: 'url',
    label: 'Four-node BC-250 cluster Ansible project',
    uri: 'https://github.com/Cirius1792/bc250-cluster-ansible',
    description: 'Reference architecture for a multi-worker llama.cpp RPC fleet.',
    tags: ['source', 'cluster'],
  },
];

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
    { tag: 'decision', fill: '#f8fafc', stroke: '#475569', text: '#111827' },
    { tag: 'alternative', fill: '#fefce8', stroke: '#a16207', text: '#111827' },
  ],
  perspectiveStyles: [],
};

function letters(n) {
  let x = n;
  let out = '';
  while (x > 0) {
    x -= 1;
    out = String.fromCharCode(65 + (x % 26)) + out;
    x = Math.floor(x / 26);
  }
  return out;
}

function roughAddress(rank, slot) {
  return `${letters(4 + slot * 34)}${5 + rank * 18}`;
}

function properties(input = {}) {
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, String(v)]));
}

function node(id, label, rank, slot, {
  shape = 'process',
  tags = [],
  description = label,
  technology = null,
  minW = 18,
  minH = 6,
  maxWidth = 24,
  props = {},
  perspectives = {},
} = {}) {
  return {
    id, label, rank, slot, shape,
    tags, description, technology, minW, minH, maxWidth,
    properties: properties(props),
    perspectives: properties(perspectives),
  };
}

function edge(id, from, to, {
  label = null,
  description = null,
  technology = 'logical flow',
  tags = [],
  outcome = null,
} = {}) {
  return {
    id, from, to,
    routing: 'orthogonal',
    relationshipLabel: label,
    description: description ?? `${from} feeds ${to}`,
    technology,
    tags,
    outcome,
  };
}

const maps = [
  {
    slug: '01-overview',
    name: 'BC-250 Local AI Compute — System Overview',
    cols: 230,
    rows: 170,
    nodes: [
      node('root', 'BC-250 AS A LOW-COST LOCAL AI COMPUTE APPLIANCE', 0, 2, {
        shape: 'terminator', tags: ['root', 'llm'], minW: 30, maxWidth: 34,
        description: 'Reframe the salvaged-compute board as a private local inference node rather than primarily as a gaming PC.',
      }),
      node('stock_board', 'Stock board: 16 GB shared GDDR6, Linux-first, 24 GPU CUs, 6 Zen 2 cores', 1, 0, {
        tags: ['hardware'], minW: 28, maxWidth: 30,
        description: 'Baseline hardware configuration before optional community unlocks.',
        props: { memory: '16 GB shared GDDR6', gpu: '24 CUs stock', cpu: '6 Zen 2 cores stock' },
      }),
      node('make_better', 'MAKE IT BETTER', 1, 1, {
        shape: 'subprocess', tags: ['optimization'], minW: 20,
        description: 'Improve sustained inference, thermal behavior, memory availability and service reliability.',
      }),
      node('make_cheaper', 'MAKE IT CHEAPER', 1, 2, {
        shape: 'subprocess', tags: ['cost'], minW: 20,
        description: 'Minimize non-compute spend and reuse commodity components before buying premium accessories.',
      }),
      node('diy', 'DIY BUILD', 1, 3, {
        shape: 'subprocess', tags: ['hardware', 'phase'], minW: 18,
        description: 'Build a headless appliance around the bare board using reusable power, cooling and storage.',
      }),
      node('local_llm', 'LOCAL LLM / AGENT NODE', 1, 4, {
        shape: 'subprocess', tags: ['llm', 'software'], minW: 24,
        description: 'Serve local models over an OpenAI-compatible endpoint to desktops, agents and automation.',
      }),
      node('cooling', 'Ducted high-static-pressure cooling + memory/VRM attention + telemetry', 2, 0, {
        tags: ['cooling', 'hardware'], minW: 28, maxWidth: 30,
        description: 'Sustained inference requires qualified cooling rather than a bare-board benchmark setup.',
      }),
      node('memory_tune', 'TTM / GTT tuning so Vulkan can use most of the shared memory pool', 2, 1, {
        tags: ['software', 'optimization'], minW: 28, maxWidth: 30,
        description: 'Remove software-side memory ceilings before assuming the board cannot fit a model.',
      }),
      node('optional_unlock', 'Optional: qualify 40-CU GPU and 8-core CPU unlocks board-by-board', 2, 2, {
        tags: ['optimization', 'risk'], minW: 28, maxWidth: 30,
        description: 'Treat dormant-silicon unlocks as optional experiments after stock stability, not as a baseline guarantee.',
      }),
      node('reuse', 'Reuse PSU, M.2 storage, fans, open frame / printed ducts; spend on thermals first', 2, 3, {
        tags: ['cost', 'hardware'], minW: 30, maxWidth: 32,
        description: 'The cheapest useful build avoids a conventional desktop case and premium cosmetic components.',
      }),
      node('runtime', 'Fedora/Debian + Mesa/RADV + llama.cpp or Ollama + Open WebUI', 2, 4, {
        tags: ['software', 'llm'], minW: 30, maxWidth: 32,
        description: 'Current practical software path is Linux plus Vulkan-based inference.',
      }),
      node('one_node', '1 board: fast small models, useful 8B–14B class, some larger MoE/quantized models', 3, 0, {
        tags: ['llm', 'benchmark'], minW: 30, maxWidth: 32,
        description: 'Single-node sweet spot prioritizes useful quality with low latency and low infrastructure cost.',
      }),
      node('two_node', '2 boards: split larger models with llama.cpp RPC over a dedicated 2.5 GbE backend', 3, 1, {
        tags: ['network', 'llm'], minW: 30, maxWidth: 32,
        description: 'A currently validated architecture combines local Vulkan on the coordinator with RPC Vulkan on a second board.',
      }),
      node('fleet', 'Fleet: request-level routing across independent specialist nodes + RPC only when a model must span nodes', 3, 2, {
        tags: ['network', 'llm'], minW: 34, maxWidth: 36,
        description: 'Scale concurrency by routing whole jobs to nodes; use distributed-model RPC selectively where memory capacity requires it.',
      }),
      node('alternatives', 'Alternatives: existing CUDA GPU, used high-VRAM accelerator, newer integrated-memory AI box', 3, 3, {
        tags: ['alternative', 'cost'], minW: 30, maxWidth: 32,
        description: 'BC-250 is compelling only when its price, memory bandwidth and DIY trade-offs beat hardware you already own or can source.',
      }),
      node('decision', 'BEST USE: cheap private inference appliance / weird-compute lab / agent worker', 4, 2, {
        shape: 'terminator', tags: ['root', 'llm'], minW: 34, maxWidth: 36,
        description: 'The strongest fit is a low-cost local AI service node, not a polished general-purpose desktop.',
      }),
    ],
    edges: [
      edge('e_root_stock', 'root.S', 'stock_board.N', { label: 'baseline', tags: ['hardware'] }),
      edge('e_root_better', 'root.S', 'make_better.N', { label: 'improve', tags: ['optimization'] }),
      edge('e_root_cheaper', 'root.S', 'make_cheaper.N', { label: 'reduce cost', tags: ['cost'] }),
      edge('e_root_diy', 'root.S', 'diy.N', { label: 'build', tags: ['phase'] }),
      edge('e_root_llm', 'root.S', 'local_llm.N', { label: 'serve', tags: ['llm'] }),
      edge('e_stock_cooling', 'stock_board.S', 'cooling.N', { tags: ['cooling'] }),
      edge('e_better_memory', 'make_better.S', 'memory_tune.N', { tags: ['optimization'] }),
      edge('e_better_unlock', 'make_better.S', 'optional_unlock.N', { tags: ['optimization', 'risk'] }),
      edge('e_cheaper_reuse', 'make_cheaper.S', 'reuse.N', { tags: ['cost'] }),
      edge('e_llm_runtime', 'local_llm.S', 'runtime.N', { tags: ['software', 'llm'] }),
      edge('e_cooling_one', 'cooling.S', 'one_node.N', { tags: ['llm'] }),
      edge('e_memory_two', 'memory_tune.S', 'two_node.N', { tags: ['network', 'llm'] }),
      edge('e_unlock_fleet', 'optional_unlock.S', 'fleet.N', { tags: ['network', 'llm'] }),
      edge('e_reuse_alt', 'reuse.S', 'alternatives.N', { tags: ['cost', 'alternative'] }),
      edge('e_runtime_one', 'runtime.S', 'one_node.N', { tags: ['llm'] }),
      edge('e_one_decision', 'one_node.S', 'decision.N', { tags: ['llm'] }),
      edge('e_two_decision', 'two_node.S', 'decision.N', { tags: ['llm'] }),
      edge('e_fleet_decision', 'fleet.S', 'decision.N', { tags: ['llm'] }),
      edge('e_alt_decision', 'alternatives.S', 'decision.N', { tags: ['alternative'] }),
    ],
  },
  {
    slug: '02-single-node',
    name: 'BC-250 Local AI Compute — Single Node Stack',
    cols: 190,
    rows: 190,
    nodes: [
      node('start', 'HEADLESS BC-250 AI NODE', 0, 1, {
        shape: 'terminator', tags: ['root', 'llm'], minW: 28,
        description: 'A minimal always-on local inference appliance.',
      }),
      node('power', 'Known-good PCIe power + safe mounting + board inspection', 1, 0, {
        tags: ['hardware', 'risk'], minW: 28,
        description: 'Power and mechanical baseline before any software or unlock work.',
      }),
      node('thermal', 'Ducted CPU/GPU airflow; cool GDDR6 / VRM areas; fan telemetry + fail-safe', 1, 1, {
        tags: ['cooling', 'hardware'], minW: 30,
        description: 'Cooling is a service requirement, not a cosmetic optimization.',
      }),
      node('storage', 'M.2 SSD + wired management Ethernet', 1, 2, {
        tags: ['hardware', 'network'], minW: 24,
        description: 'Local boot/model storage and management network.',
      }),
      node('linux', 'Modern Linux: Fedora validated most strongly; modern Mesa/RADV', 2, 0, {
        tags: ['software'], minW: 30,
        technology: 'Linux + Mesa/RADV',
      }),
      node('baseline', 'Validate stock 24-CU / 6-core behavior first', 2, 1, {
        shape: 'decision', tags: ['benchmark', 'risk'], minW: 26,
        description: 'Establish a stable stock baseline before applying community tuning.',
      }),
      node('ttm', 'Tune TTM/GTT limits so Vulkan can allocate the shared memory it needs', 2, 2, {
        tags: ['software', 'optimization'], minW: 30,
        technology: 'amdgpu TTM/GTT',
      }),
      node('unlock', 'OPTIONAL after qualification: 40-CU GPU and/or 8-core CPU unlock', 3, 0, {
        tags: ['optimization', 'risk'], minW: 30,
        description: 'Optional board-specific optimization; never assume disabled silicon is healthy.',
      }),
      node('governor', 'Use a moderate efficiency profile; benchmark power, thermals and generation speed', 3, 1, {
        tags: ['optimization', 'benchmark'], minW: 32,
        description: 'Prefer sustained efficiency over headline clocks for unattended inference.',
      }),
      node('vulkan', 'Vulkan compute path (RADV / GFX1013)', 3, 2, {
        tags: ['software', 'llm'], minW: 24,
        technology: 'Vulkan',
      }),
      node('runtime', 'llama.cpp OR Ollama', 4, 0, {
        shape: 'subprocess', tags: ['software', 'llm'], minW: 22,
        technology: 'llama.cpp / Ollama',
      }),
      node('models', 'Quantized GGUF / Ollama models sized to real free memory + context/KV budget', 4, 1, {
        shape: 'data', tags: ['llm'], minW: 32,
        description: 'Model fit is weights plus context/KV/cache overhead, not parameter count alone.',
      }),
      node('ui', 'Open WebUI / CLI / agent client', 4, 2, {
        tags: ['software', 'llm'], minW: 24,
      }),
      node('api', 'OpenAI-compatible LAN API', 5, 1, {
        shape: 'io', tags: ['network', 'llm'], minW: 24,
        technology: 'HTTP/OpenAI-compatible API',
      }),
      node('clients', 'BrainnStation, coding agents, RAG, automations, voice, local services', 6, 1, {
        shape: 'terminator', tags: ['root', 'llm'], minW: 34,
        description: 'Consumers treat the BC-250 as a network inference service, not as the interactive desktop.',
      }),
    ],
    edges: [
      edge('e_start_power', 'start.S', 'power.N', { tags: ['hardware'] }),
      edge('e_start_thermal', 'start.S', 'thermal.N', { tags: ['cooling'] }),
      edge('e_start_storage', 'start.S', 'storage.N', { tags: ['hardware', 'network'] }),
      edge('e_power_linux', 'power.S', 'linux.N', { tags: ['software'] }),
      edge('e_thermal_baseline', 'thermal.S', 'baseline.N', { label: 'qualify', tags: ['benchmark'] }),
      edge('e_storage_ttm', 'storage.S', 'ttm.N', { tags: ['software'] }),
      edge('e_linux_unlock', 'linux.S', 'unlock.N', { label: 'optional', tags: ['optimization', 'risk'] }),
      edge('e_baseline_governor', 'baseline.S', 'governor.N', { tags: ['optimization'] }),
      edge('e_ttm_vulkan', 'ttm.S', 'vulkan.N', { tags: ['software', 'llm'] }),
      edge('e_unlock_runtime', 'unlock.S', 'runtime.N', { tags: ['llm'] }),
      edge('e_governor_models', 'governor.S', 'models.N', { tags: ['benchmark', 'llm'] }),
      edge('e_vulkan_ui', 'vulkan.S', 'ui.N', { tags: ['software'] }),
      edge('e_runtime_api', 'runtime.S', 'api.N', { tags: ['network', 'llm'] }),
      edge('e_models_api', 'models.S', 'api.N', { tags: ['llm'] }),
      edge('e_ui_api', 'ui.S', 'api.N', { tags: ['network'] }),
      edge('e_api_clients', 'api.S', 'clients.N', { tags: ['network', 'llm'] }),
    ],
  },
  {
    slug: '03-cluster',
    name: 'BC-250 Local AI Compute — Cluster Topology',
    cols: 250,
    rows: 190,
    nodes: [
      node('client', 'LOCAL CLIENTS / AGENTS', 0, 2, {
        shape: 'terminator', tags: ['root', 'llm'], minW: 26,
      }),
      node('gateway', 'Gateway / model router / OpenAI-compatible API', 1, 2, {
        tags: ['network', 'llm'], minW: 30,
        technology: 'HTTP API + routing',
        description: 'Front door for policy, model selection, concurrency and health-aware routing.',
      }),
      node('mode', 'Does this request need one model larger than a single node can hold?', 2, 2, {
        shape: 'decision', tags: ['decision', 'llm'], minW: 30, maxWidth: 30,
      }),
      node('shard', 'NO: request-level sharding to independent specialist workers', 3, 0, {
        tags: ['network', 'llm'], minW: 30,
        description: 'Best scaling mode for concurrency because each request stays local to one worker.',
      }),
      node('rpc', 'YES: distributed-model llama.cpp RPC', 3, 4, {
        tags: ['network', 'llm'], minW: 28,
        technology: 'llama.cpp RPC',
      }),
      node('worker_fast', 'Worker A: fast small / general model', 4, 0, {
        tags: ['llm'], minW: 24,
      }),
      node('worker_code', 'Worker B: coding / tool-use model', 4, 1, {
        tags: ['llm'], minW: 24,
      }),
      node('worker_rag', 'Worker C: embeddings / RAG / rerank / batch', 4, 2, {
        tags: ['llm'], minW: 26,
      }),
      node('coordinator', 'RPC coordinator: llama-server + local Vulkan GPU', 4, 4, {
        tags: ['llm', 'network'], minW: 30,
        technology: 'llama-server + Vulkan',
      }),
      node('rpc_worker', 'RPC worker: ggml-rpc-server + Vulkan GPU', 5, 4, {
        tags: ['llm', 'network'], minW: 30,
        technology: 'ggml-rpc-server + Vulkan',
      }),
      node('backend', 'Dedicated 2.5 GbE point-to-point backend; no gateway / no internet exposure', 6, 4, {
        tags: ['network', 'risk'], minW: 34,
        technology: 'USB 3.x 2.5 GbE validated reference',
        description: 'Separate management traffic from model-split RPC traffic.',
      }),
      node('management', 'Management LAN: SSH, Ansible, package/model downloads, API clients', 4, 3, {
        tags: ['network', 'software'], minW: 32,
      }),
      node('storage', 'Model store / local SSDs / optional shared cache', 5, 2, {
        shape: 'data', tags: ['hardware', 'software'], minW: 26,
      }),
      node('observability', 'Prometheus/Grafana + temperatures + fan RPM + health + throughput', 5, 1, {
        tags: ['software', 'benchmark'], minW: 32,
      }),
      node('orchestrator', 'Ansible / config management / per-board qualification', 5, 0, {
        tags: ['software', 'risk'], minW: 30,
        technology: 'Ansible',
      }),
      node('scale_rule', 'SCALE RULE: add independent workers first; expand distributed-model groups only after network benchmarks', 7, 2, {
        shape: 'terminator', tags: ['root', 'benchmark'], minW: 38, maxWidth: 40,
        description: 'Avoid assuming aggregate memory is automatically equivalent to one giant GPU.',
      }),
    ],
    edges: [
      edge('e_client_gateway', 'client.S', 'gateway.N', { tags: ['network'] }),
      edge('e_gateway_mode', 'gateway.S', 'mode.N', { tags: ['llm'] }),
      edge('e_mode_shard', 'mode.S', 'shard.N', { label: 'fits one node', tags: ['llm'] }),
      edge('e_mode_rpc', 'mode.S', 'rpc.N', { label: 'needs split', tags: ['llm', 'network'] }),
      edge('e_shard_fast', 'shard.S', 'worker_fast.N', { tags: ['llm'] }),
      edge('e_shard_code', 'shard.S', 'worker_code.N', { tags: ['llm'] }),
      edge('e_shard_rag', 'shard.S', 'worker_rag.N', { tags: ['llm'] }),
      edge('e_rpc_coord', 'rpc.S', 'coordinator.N', { tags: ['llm', 'network'] }),
      edge('e_coord_worker', 'coordinator.S', 'rpc_worker.N', { label: 'RPC', technology: '2.5 GbE TCP', tags: ['network'] }),
      edge('e_rpc_backend', 'rpc_worker.S', 'backend.N', { tags: ['network', 'risk'] }),
      edge('e_gateway_mgmt', 'gateway.S', 'management.N', { tags: ['network'] }),
      edge('e_worker_orch', 'worker_fast.S', 'orchestrator.N', { tags: ['software'] }),
      edge('e_worker_obs', 'worker_code.S', 'observability.N', { tags: ['benchmark'] }),
      edge('e_worker_store', 'worker_rag.S', 'storage.N', { tags: ['software'] }),
      edge('e_orch_scale', 'orchestrator.S', 'scale_rule.N', { tags: ['phase'] }),
      edge('e_obs_scale', 'observability.S', 'scale_rule.N', { tags: ['benchmark'] }),
      edge('e_store_scale', 'storage.S', 'scale_rule.N', { tags: ['hardware'] }),
      edge('e_backend_scale', 'backend.S', 'scale_rule.N', { tags: ['network'] }),
    ],
  },
  {
    slug: '04-diy-build',
    name: 'BC-250 Local AI Compute — DIY Build Flow',
    cols: 180,
    rows: 240,
    nodes: [
      node('start', 'DIY BC-250 AI NODE BUILD', 0, 1, {
        shape: 'terminator', tags: ['root', 'phase'], minW: 28,
      }),
      node('source', 'Source board + inspect physical condition / connectors / heatsink / storage', 1, 1, {
        tags: ['hardware', 'risk'], minW: 32,
      }),
      node('mount', 'Build safe open-frame or printed mount; protect board underside and airflow path', 2, 1, {
        tags: ['hardware', 'risk'], minW: 32,
      }),
      node('power', 'Connect known-good PSU; verify PCIe power and no questionable adapters', 3, 1, {
        tags: ['hardware', 'risk'], minW: 30,
      }),
      node('cool', 'Cooling first: pressure fans + ducting + GDDR6/VRM attention + sensor visibility', 4, 1, {
        tags: ['cooling', 'hardware'], minW: 32,
      }),
      node('boot', 'Install modern Linux + SSH; establish management LAN', 5, 1, {
        tags: ['software', 'network'], minW: 28,
      }),
      node('stocktest', 'Stock stress / memory / Vulkan / thermal validation', 6, 1, {
        shape: 'decision', tags: ['benchmark', 'risk'], minW: 28,
      }),
      node('fix', 'If unstable: repair cooling, power, storage, firmware or board issue BEFORE tuning, then repeat validation', 7, 0, {
        tags: ['risk', 'hardware'], minW: 34,
      }),
      node('baseline', 'If stable: capture baseline power, clocks, temps, VRAM visibility and inference speed', 7, 2, {
        tags: ['benchmark'], minW: 34,
      }),
      node('memory', 'Tune TTM/GTT; confirm Vulkan sees usable shared-memory capacity', 8, 2, {
        tags: ['software', 'optimization'], minW: 32,
      }),
      node('llm', 'Install llama.cpp or Ollama; run known-small model; then step upward in model size/context', 9, 2, {
        tags: ['software', 'llm'], minW: 34,
      }),
      node('unlockq', 'Need more throughput and willing to qualify this specific board?', 10, 2, {
        shape: 'decision', tags: ['decision', 'risk'], minW: 30,
      }),
      node('stockprod', 'NO: keep stock silicon and optimize software / cooling / routing', 11, 1, {
        tags: ['software', 'llm'], minW: 30,
      }),
      node('unlock', 'YES: optional 40-CU and/or 8-core path; re-run correctness + thermal qualification', 11, 3, {
        tags: ['optimization', 'risk'], minW: 34,
      }),
      node('serve', 'Expose LAN-only API + Open WebUI; firewall appropriately', 12, 2, {
        tags: ['network', 'llm', 'risk'], minW: 30,
      }),
      node('second', 'Only after one node is boring/reliable: add second node + dedicated 2.5 GbE RPC link', 13, 2, {
        tags: ['network', 'phase'], minW: 36,
      }),
      node('done', 'RESULT: reproducible AI appliance with a measured baseline and rollback path', 14, 2, {
        shape: 'terminator', tags: ['root', 'benchmark'], minW: 36,
      }),
    ],
    edges: [
      edge('e1', 'start.S', 'source.N'),
      edge('e2', 'source.S', 'mount.N'),
      edge('e3', 'mount.S', 'power.N'),
      edge('e4', 'power.S', 'cool.N'),
      edge('e5', 'cool.S', 'boot.N'),
      edge('e6', 'boot.S', 'stocktest.N'),
      edge('e7', 'stocktest.S', 'fix.N', { label: 'unstable', tags: ['risk'] }),
      edge('e8', 'stocktest.S', 'baseline.N', { label: 'stable', tags: ['benchmark'] }),
      edge('e10', 'baseline.S', 'memory.N', { tags: ['optimization'] }),
      edge('e11', 'memory.S', 'llm.N', { tags: ['llm'] }),
      edge('e12', 'llm.S', 'unlockq.N', { tags: ['llm'] }),
      edge('e13', 'unlockq.S', 'stockprod.N', { label: 'no', tags: ['llm'] }),
      edge('e14', 'unlockq.S', 'unlock.N', { label: 'yes', tags: ['optimization', 'risk'] }),
      edge('e15', 'stockprod.S', 'serve.N', { tags: ['network'] }),
      edge('e16', 'unlock.S', 'serve.N', { tags: ['network'] }),
      edge('e17', 'serve.S', 'second.N', { tags: ['phase'] }),
      edge('e18', 'second.S', 'done.N', { tags: ['benchmark'] }),
    ],
  },
  {
    slug: '05-cost-options',
    name: 'BC-250 Local AI Compute — Cost and Alternatives',
    cols: 220,
    rows: 180,
    nodes: [
      node('goal', 'GOAL: MOST USEFUL PRIVATE AI COMPUTE PER DOLLAR', 0, 2, {
        shape: 'terminator', tags: ['root', 'cost'], minW: 34,
      }),
      node('own_gpu', 'Do you already own a capable GPU / PC?', 1, 2, {
        shape: 'decision', tags: ['decision', 'cost'], minW: 26,
      }),
      node('existing', 'YES: benchmark what you already own first; zero acquisition cost is hard to beat', 2, 0, {
        tags: ['cost', 'alternative'], minW: 34,
      }),
      node('bc250', 'NO / need separate appliance: BC-250 single-board path', 2, 4, {
        tags: ['cost', 'hardware'], minW: 30,
      }),
      node('minimum', 'MINIMUM SPEND: board + reused PSU + reused SSD + two good fans + simple mount', 3, 3, {
        tags: ['cost', 'hardware'], minW: 34,
      }),
      node('smart_spend', 'SMART SPEND: thermal interface / ducting / telemetry before cosmetic casework', 3, 4, {
        tags: ['cost', 'cooling'], minW: 34,
      }),
      node('avoid', 'AVOID EARLY: fancy enclosure, display, RGB, premium storage, unnecessary desktop peripherals', 3, 5, {
        tags: ['cost'], minW: 36,
      }),
      node('need_vram', 'Primary bottleneck?', 4, 2, {
        shape: 'decision', tags: ['decision'], minW: 22,
      }),
      node('latency', 'Latency / easy software: conventional CUDA-capable GPU may be simpler', 5, 0, {
        tags: ['alternative'], minW: 32,
      }),
      node('capacity', 'VRAM capacity: compare used 24–32 GB accelerators, accepting age/power/software trade-offs', 5, 2, {
        tags: ['alternative', 'cost'], minW: 36,
      }),
      node('efficiency', 'Appliance efficiency / support: compare newer unified-memory mini AI systems', 5, 4, {
        tags: ['alternative', 'cost'], minW: 34,
      }),
      node('weird', 'DIY value / experimentation: BC-250 wins when board price is low enough and Linux/Vulkan trade-offs are acceptable', 5, 6, {
        tags: ['hardware', 'llm', 'cost'], minW: 40,
      }),
      node('second_board', 'Need a larger model? Price a second BC-250 + two 2.5 GbE USB adapters against simply buying one higher-memory GPU', 6, 3, {
        tags: ['network', 'cost', 'alternative'], minW: 40,
      }),
      node('fleet', 'Need concurrency? Multiple independent BC-250 workers can scale jobs without forcing every model across the network', 7, 3, {
        tags: ['network', 'llm', 'cost'], minW: 40,
      }),
      node('rule', 'PURCHASE RULE: compare TOTAL node cost, watts, cooling, software friction and usable model quality — not board price alone', 8, 3, {
        shape: 'terminator', tags: ['root', 'cost', 'benchmark'], minW: 42,
      }),
    ],
    edges: [
      edge('e_goal_own', 'goal.S', 'own_gpu.N', { tags: ['cost'] }),
      edge('e_own_existing', 'own_gpu.S', 'existing.N', { label: 'yes', tags: ['alternative'] }),
      edge('e_own_bc', 'own_gpu.S', 'bc250.N', { label: 'no', tags: ['hardware'] }),
      edge('e_bc_min', 'bc250.S', 'minimum.N', { tags: ['cost'] }),
      edge('e_bc_smart', 'bc250.S', 'smart_spend.N', { tags: ['cooling', 'cost'] }),
      edge('e_bc_avoid', 'bc250.S', 'avoid.N', { tags: ['cost'] }),
      edge('e_existing_bottle', 'existing.S', 'need_vram.N', { tags: ['benchmark'] }),
      edge('e_min_bottle', 'minimum.S', 'need_vram.N', { tags: ['benchmark'] }),
      edge('e_smart_bottle', 'smart_spend.S', 'need_vram.N', { tags: ['benchmark'] }),
      edge('e_avoid_bottle', 'avoid.S', 'need_vram.N', { tags: ['benchmark'] }),
      edge('e_b_latency', 'need_vram.S', 'latency.N', { tags: ['alternative'] }),
      edge('e_b_capacity', 'need_vram.S', 'capacity.N', { tags: ['alternative'] }),
      edge('e_b_eff', 'need_vram.S', 'efficiency.N', { tags: ['alternative'] }),
      edge('e_b_weird', 'need_vram.S', 'weird.N', { tags: ['hardware'] }),
      edge('e_lat_second', 'latency.S', 'second_board.N', { tags: ['cost'] }),
      edge('e_cap_second', 'capacity.S', 'second_board.N', { tags: ['cost'] }),
      edge('e_eff_second', 'efficiency.S', 'second_board.N', { tags: ['cost'] }),
      edge('e_weird_second', 'weird.S', 'second_board.N', { tags: ['cost'] }),
      edge('e_second_fleet', 'second_board.S', 'fleet.N', { tags: ['network'] }),
      edge('e_fleet_rule', 'fleet.S', 'rule.N', { tags: ['benchmark'] }),
    ],
  },
  {
    slug: '06-roadmap',
    name: 'BC-250 Local AI Compute — Research and Build Roadmap',
    cols: 210,
    rows: 210,
    nodes: [
      node('phase0', 'PHASE 0 — SOURCE / INSPECT / DOCUMENT', 0, 1, {
        shape: 'terminator', tags: ['phase', 'root'], minW: 32,
        description: 'Record board revision, firmware, thermals, storage, network and purchase cost.',
      }),
      node('gate0', 'Gate: board boots, sensors work, cooling is controllable, no obvious hardware instability', 1, 1, {
        shape: 'decision', tags: ['benchmark', 'risk'], minW: 36,
      }),
      node('phase1', 'PHASE 1 — STOCK SINGLE-NODE LLM BASELINE', 2, 1, {
        tags: ['phase', 'llm'], minW: 34,
      }),
      node('bench1', 'Record model fit, prompt tok/s, generation tok/s, TTFT, watts, temps, errors', 3, 1, {
        tags: ['benchmark'], minW: 36,
      }),
      node('phase2', 'PHASE 2 — MEMORY + THERMAL + EFFICIENCY TUNING', 4, 1, {
        tags: ['phase', 'optimization'], minW: 36,
      }),
      node('gate2', 'Gate: performance gain is real, repeatable and worth added power / complexity', 5, 1, {
        shape: 'decision', tags: ['benchmark', 'decision'], minW: 34,
      }),
      node('unlock', 'Optional experiment: 40-CU and/or 8-core qualification with correctness checks', 6, 1, {
        tags: ['optimization', 'risk'], minW: 36,
      }),
      node('phase3', 'PHASE 3 — SECOND NODE', 7, 1, {
        tags: ['phase', 'network'], minW: 28,
      }),
      node('net', 'Add dedicated 2.5 GbE backend; compare request sharding vs llama.cpp RPC model split', 8, 1, {
        tags: ['network', 'benchmark'], minW: 38,
      }),
      node('gate3', 'Gate: larger-model quality or concurrency justifies second-node watts and latency', 9, 1, {
        shape: 'decision', tags: ['benchmark', 'decision'], minW: 36,
      }),
      node('phase4', 'PHASE 4 — ROUTER + SPECIALIST WORKERS', 10, 1, {
        tags: ['phase', 'llm'], minW: 34,
      }),
      node('roles', 'Fast model / coding model / RAG-batch / speech / image or other local services', 11, 1, {
        tags: ['llm'], minW: 36,
      }),
      node('ops', 'Add Ansible, monitoring, health checks, API policy, model/version inventory', 12, 1, {
        tags: ['software', 'benchmark'], minW: 36,
      }),
      node('phase5', 'PHASE 5 — FLEET / RACK ONLY IF THE ECONOMICS STILL WIN', 13, 1, {
        tags: ['phase', 'cost'], minW: 38,
      }),
      node('fleetbench', 'Benchmark total throughput/$ and throughput/W against alternative hardware before expanding further', 14, 1, {
        tags: ['benchmark', 'cost', 'alternative'], minW: 40,
      }),
      node('end', 'END STATE — MEASURED, REPRODUCIBLE LOCAL AI FABRIC', 15, 1, {
        shape: 'terminator', tags: ['root', 'llm'], minW: 36,
      }),
    ],
    edges: [
      edge('e0', 'phase0.S', 'gate0.N', { tags: ['benchmark'] }),
      edge('e1', 'gate0.S', 'phase1.N', { label: 'pass', tags: ['phase'] }),
      edge('e2', 'phase1.S', 'bench1.N', { tags: ['benchmark'] }),
      edge('e3', 'bench1.S', 'phase2.N', { tags: ['optimization'] }),
      edge('e4', 'phase2.S', 'gate2.N', { tags: ['benchmark'] }),
      edge('e5', 'gate2.S', 'unlock.N', { label: 'optional', tags: ['optimization', 'risk'] }),
      edge('e6', 'unlock.S', 'phase3.N', { tags: ['phase'] }),
      edge('e7', 'phase3.S', 'net.N', { tags: ['network'] }),
      edge('e8', 'net.S', 'gate3.N', { tags: ['benchmark'] }),
      edge('e9', 'gate3.S', 'phase4.N', { label: 'worth it', tags: ['phase'] }),
      edge('e10', 'phase4.S', 'roles.N', { tags: ['llm'] }),
      edge('e11', 'roles.S', 'ops.N', { tags: ['software'] }),
      edge('e12', 'ops.S', 'phase5.N', { tags: ['cost'] }),
      edge('e13', 'phase5.S', 'fleetbench.N', { tags: ['benchmark'] }),
      edge('e14', 'fleetbench.S', 'end.N', { tags: ['llm'] }),
    ],
  },
];

async function toolset() {
  const session = createSession({ cwd: root, createdAt: CREATED_AT });
  const tools = createTools(session);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const call = async (name, args = {}) => {
    const tool = byName.get(name);
    if (!tool) throw new Error(`missing TurtlePen MCP tool: ${name}`);
    return await tool.handler(args);
  };
  return { session, call };
}

async function measuredPlaceOps(call, nodes) {
  const ops = [];
  for (const n of nodes) {
    const measured = JSON.parse(await call('measure', {
      text: n.label,
      maxWidthCells: n.maxWidth,
      shape: n.shape,
    }));
    const base = measured.span ?? {
      w: measured.cellsWide ?? n.minW,
      h: measured.cellsTall ?? n.minH,
    };
    const span = {
      w: Math.max(n.minW, Number(base.w ?? base.width ?? measured.cellsWide ?? n.minW)),
      h: Math.max(n.minH, Number(base.h ?? base.height ?? measured.cellsTall ?? n.minH)),
    };

    ops.push({
      op: 'place_box',
      id: n.id,
      at: roughAddress(n.rank, n.slot),
      span,
      label: n.label,
      shape: n.shape,
      align: 'center',
      corner: n.shape === 'process' ? 'rounded' : 'square',
    });
    ops.push({
      op: 'annotate',
      id: n.id,
      description: n.description,
      ...(n.technology ? { technology: n.technology } : {}),
      tags: n.tags,
      properties: n.properties,
      perspectives: n.perspectives,
    });
  }
  return ops;
}

async function buildMap(spec) {
  const { call } = await toolset();
  const jsonPath = path.join(outputDir, `${spec.slug}.turtlepen.json`);
  const svgPath = path.join(outputDir, `${spec.slug}.svg`);

  await call('new_diagram', {
    name: spec.name,
    path: jsonPath,
    cols: spec.cols,
    rows: spec.rows,
    fontSize: 10,
  });

  const placementOps = await measuredPlaceOps(call, spec.nodes);
  const planned = JSON.parse(await call('plan', {
    operations: placementOps,
    commit: false,
    format: 'json',
  }));
  if (!planned.ok) {
    throw new Error(`${spec.slug}: placement rehearsal failed at ${planned.failedAt}: ${planned.error}`);
  }

  const committed = JSON.parse(await call('plan', {
    operations: placementOps,
    commit: true,
    format: 'json',
  }));
  if (!committed.ok) throw new Error(`${spec.slug}: placement commit failed`);

  const connectionOps = spec.edges.map((e) => ({
    op: 'connect',
    id: e.id,
    from: e.from,
    to: e.to,
    routing: e.routing,
    description: e.description,
    technology: e.technology,
    tags: e.tags,
    ...(e.relationshipLabel ? { relationshipLabel: e.relationshipLabel } : {}),
    ...(e.outcome ? { outcome: e.outcome } : {}),
  }));

  const connected = JSON.parse(await call('plan', {
    operations: connectionOps,
    commit: true,
    format: 'json',
  }));
  if (!connected.ok) {
    throw new Error(`${spec.slug}: relationship plan failed at ${connected.failedAt}: ${connected.error}`);
  }

  await call('configure_theme', THEME);

  for (const source of SOURCES) {
    await call('attach_resource', source);
  }

  await call('layout', {
    page: 'base',
    ids: spec.nodes.map((n) => n.id),
    direction: 'top-down',
    gapX: 12,
    gapY: 14,
    reroute: true,
  });

  // Composition-only S3 findings are acceptable for these deliberately schematic
  // architecture maps. Geometry/model findings are not.
  let validation = JSON.parse(await call('validate', { format: 'json' }));
  for (const finding of validation.open.filter((f) => f.severity === 'S3')) {
    await call('accept_finding', {
      fingerprint: finding.fingerprint,
      reason: 'Deliberate schematic architecture map: spacing and primitive usage prioritize inspectable system relationships.',
    });
  }
  validation = JSON.parse(await call('validate', { format: 'json' }));

  if (validation.open.length) {
    const summary = validation.open
      .map((f) => `[${f.severity}] ${f.rule}: ${f.message}`)
      .join('\n');
    throw new Error(`${spec.slug}: final TurtlePen validation still has open findings:\n${summary}`);
  }

  const renderReceipt = await call('render', {
    path: svgPath,
    showGrid: false,
    markFindings: false,
    bounds: 'content',
    margin: 30,
  });

  const hashMatch = /renderHash:\s*([0-9a-f]+)/i.exec(renderReceipt);
  return {
    slug: spec.slug,
    name: spec.name,
    nodes: spec.nodes.length,
    relationships: spec.edges.length,
    accepted: validation.accepted?.length ?? 0,
    renderHash: hashMatch?.[1] ?? 'unknown',
  };
}

const results = [];
for (const spec of maps) {
  console.log(`\n=== ${spec.name} ===`);
  const result = await buildMap(spec);
  results.push(result);
  console.log(`rendered ${result.slug}: ${result.nodes} nodes, ${result.relationships} relationships, render ${result.renderHash}`);
}

const index = `# BC-250 Local AI Compute Atlas

Generated by \`examples/bc250-local-ai-atlas.js\` through TurtlePen's MCP tool handlers.

## Maps

${results.map((r) => `- **${r.name}** — [SVG](./${r.slug}.svg) · [TurtlePen JSON](./${r.slug}.turtlepen.json) · ${r.nodes} nodes / ${r.relationships} relationships · render \`${r.renderHash}\``).join('\n')}

## Reading order

1. **01 Overview** — the full idea in one page.
2. **02 Single Node** — hardware, Linux/Vulkan, memory tuning, inference runtime and API.
3. **03 Cluster** — independent worker routing versus distributed-model RPC.
4. **04 DIY Build** — safe build/qualification sequence.
5. **05 Cost + Options** — where to spend, what to reuse, and when other hardware wins.
6. **06 Roadmap** — staged experiment gates from one board to a fleet.

## Key architectural conclusion

Treat a BC-250 primarily as a **networked AI compute appliance**. Start with one reliable stock board. Qualify cooling and memory behavior before optional silicon unlocks. For scale, prefer whole-request routing across independent workers because it preserves locality and concurrency. Use llama.cpp RPC when a specific model needs to span boards; the strongest current reference uses a dedicated 2.5 GbE backend between two nodes.

## Sources

${SOURCES.map((s) => `- [${s.label}](${s.uri}) — ${s.description}`).join('\n')}

Generated with deterministic document time: ${CREATED_AT}.
`;

await writeFile(path.join(outputDir, 'README.md'), index, 'utf8');
console.log(`\nwrote ${path.relative(root, path.join(outputDir, 'README.md'))}`);
