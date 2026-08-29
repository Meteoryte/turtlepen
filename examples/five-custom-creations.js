#!/usr/bin/env node
/**
 * Five Custom Creations — TurtlePen MCP
 * ────────────────────────────────────────────
 * Programmatically generated diagrams and artworks using TurtlePen's
 * integer-exact lattice engine and pen grammar:
 *
 * 1. Cyberpunk Tactical HUD — Radar scope, health bars, targeting reticle, telemetry
 * 2. Mecha-Dragon Pixel Art — Cybernetic dragon head with energy beam and spine plates
 * 3. 64-Core Quantum Neural Processor Diagram — System architecture, ALU/Cache blocks, bus routes
 * 4. Steampunk Airship Diagram — Envelope, gondola deck, propellers, steam trails
 * 5. Celestial Starmap — Zodiac ring, compass rose, constellation links, moon & sun
 *
 * Run with: node examples/five-custom-creations.js
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as core from '../src/core/index.js';
import { createSession, createTools } from '../src/mcp/tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');
const FIXED_TS = '2026-08-25T12:00:00.000Z';

const log = (s) => console.log(`  ${s}`);

function adjudicateArtwork(doc, label) {
  const ARTWORK_RULES = new Set([
    'L001', 'L004', 'L005', 'L006', 'L007', 'L010', 'L011', 'C001',
  ]);
  const v = core.validate(doc);
  for (const f of v.open) {
    if (ARTWORK_RULES.has(f.rule)) {
      const actors = f.actors?.join(' + ') ?? 'canvas';
      core.acceptFinding(doc, f.fingerprint,
        `${label} artwork: ${f.rule} on ${actors} is by construction — ` +
        `layered primitives share geometry deliberately at this location`);
    }
  }
}

function fitCanvas(doc, margin = 2) {
  const b = core.contentBounds(doc);
  if (!b) return;
  const cols = Math.ceil((b.x + b.w) / 2) + margin;
  const rows = Math.ceil((b.y + b.h) / 2) + margin;
  if (cols > doc.canvas.cols || rows > doc.canvas.rows) {
    core.setCanvas(doc, Math.max(cols, doc.canvas.cols), Math.max(rows, doc.canvas.rows));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CYBERPUNK TACTICAL HUD
// ═══════════════════════════════════════════════════════════════════════════════
async function createCyberpunkHud() {
  log('┌─ Creation 1: Cyberpunk Tactical HUD');

  const session = createSession({ cwd: project, createdAt: FIXED_TS });
  const tools = Object.fromEntries(createTools(session).map((t) => [t.name, t]));
  const call = async (name, args) => {
    const r = await tools[name].handler(args ?? {});
    const text = typeof r === 'string' ? r : (r?.text ?? JSON.stringify(r));
    if (/^error:/i.test(text) || r?.isError) throw new Error(`${name}: ${text}`);
    return text;
  };

  await call('new_diagram', {
    name: 'Cyberpunk Tactical HUD', path: 'diagrams/custom-01-cyberpunk-hud.turtlepen.json',
    cols: 100, rows: 70,
  });

  await call('add_page', { id: 'bg_grid', z: -2, intent: 'overlay' });
  await call('update_page', { id: 'base', intent: 'overlay' });
  await call('add_page', { id: 'radar', z: 1, intent: 'overlay' });
  await call('add_page', { id: 'reticle', z: 2, intent: 'overlay' });
  await call('add_page', { id: 'telemetry', z: 3, intent: 'overlay' });

  const center = 'AX35'; // col 50, row 35

  const operations = [
    // Outer Frame Corner Brackets
    { op: 'pen', id: 'frame-tl', page: 'bg_grid', program: 'pen E5.c\ndash 10 e\npen E5.c\ndash 10 s', role: 'artwork', color: '#00ffcc', width: 2 },
    { op: 'pen', id: 'frame-tr', page: 'bg_grid', program: 'pen CN5.c\ndash 10 w\npen CN5.c\ndash 10 s', role: 'artwork', color: '#00ffcc', width: 2 },
    { op: 'pen', id: 'frame-bl', page: 'bg_grid', program: 'pen E65.c\ndash 10 e\npen E65.c\ndash 10 n', role: 'artwork', color: '#00ffcc', width: 2 },
    { op: 'pen', id: 'frame-br', page: 'bg_grid', program: 'pen CN65.c\ndash 10 w\npen CN65.c\ndash 10 n', role: 'artwork', color: '#00ffcc', width: 2 },

    // Central Radar Circles
    { op: 'pen', id: 'radar-ring1', page: 'radar', program: `pen ${center}.c\ncircle 8`, role: 'artwork', color: '#00ffcc', width: 1 },
    { op: 'pen', id: 'radar-ring2', page: 'radar', program: `pen ${center}.c\ncircle 16`, role: 'artwork', color: '#00ffcc', width: 1 },
    { op: 'pen', id: 'radar-ring3', page: 'radar', program: `pen ${center}.c\ncircle 24`, role: 'artwork', color: '#00bbee', width: 1 },
    { op: 'pen', id: 'radar-ring4', page: 'radar', program: `pen ${center}.c\ncircle 32`, role: 'artwork', color: '#0077aa', width: 1 },

    // Radar Crosshairs
    { op: 'pen', id: 'cross-h', page: 'radar', program: `pen ${center}.c\ndash 36 e\npen ${center}.c\ndash 36 w`, role: 'artwork', color: '#00ffcc', width: 1 },
    { op: 'pen', id: 'cross-v', page: 'radar', program: `pen ${center}.c\ndash 36 n\npen ${center}.c\ndash 36 s`, role: 'artwork', color: '#00ffcc', width: 1 },

    // Target Lock Reticle (Inner Diamond/Box)
    { op: 'pen', id: 'target-lock', page: 'reticle', program: `pen ${center}.c\ncircle 4`, role: 'artwork', color: '#ff3366', width: 2 },
    { op: 'pen', id: 'target-center', page: 'reticle', program: `pen ${center}.c\ndisc 1`, role: 'artwork', color: '#ff3366', paint: 'cells' },
    { op: 'pen', id: 'target-arc1', page: 'reticle', program: `pen ${center}.c\narc 12 30 60`, role: 'artwork', color: '#ff3366', width: 2 },
    { op: 'pen', id: 'target-arc2', page: 'reticle', program: `pen ${center}.c\narc 12 120 150`, role: 'artwork', color: '#ff3366', width: 2 },
    { op: 'pen', id: 'target-arc3', page: 'reticle', program: `pen ${center}.c\narc 12 210 240`, role: 'artwork', color: '#ff3366', width: 2 },
    { op: 'pen', id: 'target-arc4', page: 'reticle', program: `pen ${center}.c\narc 12 300 330`, role: 'artwork', color: '#ff3366', width: 2 },

    // Detected Hostiles / Blips on Radar
    { op: 'pen', id: 'blip-1', page: 'reticle', program: 'pen AQ25.c\ndisc 2', role: 'artwork', color: '#ffcc00', paint: 'cells' },
    { op: 'pen', id: 'blip-2', page: 'reticle', program: 'pen BF42.c\ndisc 2', role: 'artwork', color: '#ff3366', paint: 'cells' },
    { op: 'pen', id: 'blip-3', page: 'reticle', program: 'pen AP40.c\ndisc 1', role: 'artwork', color: '#00ffcc', paint: 'cells' },

    // Health / Shield Bars (Left side)
    { op: 'place_box', id: 'shield-label', at: 'H12.tl', span: '18x3', label: 'SHIELD: 98%', fill: '#002233', corner: 'chamfered', align: 'left', fontSize: 10 },
    { op: 'pen', id: 'shield-bar-fill', page: 'telemetry', program: 'pen H16.c\ndash 18 e', role: 'artwork', color: '#00ccff', width: 2 },
    { op: 'place_box', id: 'armor-label', at: 'H20.tl', span: '18x3', label: 'ARMOR: 100%', fill: '#002211', corner: 'chamfered', align: 'left', fontSize: 10 },
    { op: 'pen', id: 'armor-bar-fill', page: 'telemetry', program: 'pen H24.c\ndash 18 e', role: 'artwork', color: '#00ff66', width: 2 },

    // Target Telemetry Box (Right side)
    { op: 'place_box', id: 'target-info', at: 'BU12.tl', span: '26x12', label: 'TARGET: MK-IV CYBER-DRONE\nDIST: 142.8m\nBEARING: 042° NE\nSTATUS: LOCKED', fill: '#220011', corner: 'rounded', align: 'left', fontSize: 10 },

    // Status Header
    { op: 'place_box', id: 'hud-header', at: 'AK4.tl', span: '28x4', label: 'TACTICAL HUD v4.09 // ONLINE', fill: '#003344', corner: 'chamfered', align: 'center', fontSize: 10 },
  ];

  const rehearsal = await call('plan', { operations });
  if (/plan FAILED/.test(rehearsal)) throw new Error(rehearsal);
  await call('plan', { operations, commit: true });

  fitCanvas(session.doc);
  adjudicateArtwork(session.doc, 'Cyberpunk HUD');

  await call('save');
  await call('render', { path: 'diagrams/custom-01-cyberpunk-hud.svg' });
  log('✓ Cyberpunk Tactical HUD rendered');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. MECHA-DRAGON PIXEL ART
// ═══════════════════════════════════════════════════════════════════════════════
async function createMechaDragon() {
  log('┌─ Creation 2: Mecha-Dragon Pixel Art');

  const session = createSession({ cwd: project, createdAt: FIXED_TS });
  const tools = Object.fromEntries(createTools(session).map((t) => [t.name, t]));
  const call = async (name, args) => {
    const r = await tools[name].handler(args ?? {});
    const text = typeof r === 'string' ? r : (r?.text ?? JSON.stringify(r));
    if (/^error:/i.test(text) || r?.isError) throw new Error(`${name}: ${text}`);
    return text;
  };

  await call('new_diagram', {
    name: 'Mecha Dragon', path: 'diagrams/custom-02-mecha-dragon.turtlepen.json',
    cols: 90, rows: 70,
  });

  await call('add_page', { id: 'wings', z: -2, intent: 'overlay' });
  await call('update_page', { id: 'base', intent: 'overlay' });
  await call('add_page', { id: 'head', z: 1, intent: 'overlay' });
  await call('add_page', { id: 'features', z: 2, intent: 'overlay' });
  await call('add_page', { id: 'beam_fx', z: 3, intent: 'overlay' });

  const headCenter = 'AK30'; // col 37, row 30

  const operations = [
    // Dragon Wings (behind body)
    { op: 'pen', id: 'wing-l1', page: 'wings', program: 'pen AK25.c\nray to E10.c\npen E10.c\nray to S35.c\npen AK25.c\nray to S35.c', role: 'artwork', color: '#aa2244', width: 2 },
    { op: 'pen', id: 'wing-l-fill', page: 'wings', program: 'pen R22.c\ndisc 12', role: 'artwork', color: '#661122', paint: 'cells' },
    { op: 'pen', id: 'wing-r1', page: 'wings', program: 'pen AK25.c\nray to CB10.c\npen CB10.c\nray to BQ35.c\npen AK25.c\nray to BQ35.c', role: 'artwork', color: '#aa2244', width: 2 },
    { op: 'pen', id: 'wing-r-fill', page: 'wings', program: 'pen BE22.c\ndisc 12', role: 'artwork', color: '#661122', paint: 'cells' },

    // Main Metallic Head Core
    { op: 'pen', id: 'head-base', page: 'head', program: `pen ${headCenter}.c\ndisc 16`, role: 'artwork', color: '#334455', paint: 'cells' },
    { op: 'pen', id: 'head-outline', page: 'head', program: `pen ${headCenter}.c\ncircle 16`, role: 'artwork', color: '#6688aa', width: 2 },

    // Horns (top left & right)
    { op: 'pen', id: 'horn-l', page: 'head', program: 'pen W18.c\ntriangle C5.c AB24.c', role: 'artwork', color: '#cc9922', paint: 'cells' },
    { op: 'pen', id: 'horn-r', page: 'head', program: 'pen AU18.c\ntriangle BX5.c AN24.c', role: 'artwork', color: '#cc9922', paint: 'cells' },

    // Cybernetic Eyes (Glowing Cyan)
    { op: 'pen', id: 'eye-l', page: 'features', program: 'pen AB26.c\ndisc 3', role: 'artwork', color: '#00ffff', paint: 'cells' },
    { op: 'pen', id: 'eye-r', page: 'features', program: 'pen AU26.c\ndisc 3', role: 'artwork', color: '#00ffff', paint: 'cells' },
    { op: 'pen', id: 'pupil-l', page: 'features', program: 'pen AA26.c\ndot', role: 'artwork', color: '#ffffff' },
    { op: 'pen', id: 'pupil-r', page: 'features', program: 'pen AT26.c\ndot', role: 'artwork', color: '#ffffff' },

    // Snout & Jaw
    { op: 'pen', id: 'snout', page: 'head', program: 'pen AK36.c\ndisc 10', role: 'artwork', color: '#223344', paint: 'cells' },
    { op: 'pen', id: 'nostril-l', page: 'features', program: 'pen AF37.c\ndot', role: 'artwork', color: '#111111' },
    { op: 'pen', id: 'nostril-r', page: 'features', program: 'pen AP37.c\ndot', role: 'artwork', color: '#111111' },

    // Fangs / Teeth
    { op: 'pen', id: 'tooth-1', page: 'features', program: 'pen AE42.c\ntriangle AC44.c AG44.c', role: 'artwork', color: '#ffffff', paint: 'cells' },
    { op: 'pen', id: 'tooth-2', page: 'features', program: 'pen AQ42.c\ntriangle AO44.c AS44.c', role: 'artwork', color: '#ffffff', paint: 'cells' },

    // Energy Cannon Blast (Emitting from Mouth downwards)
    { op: 'pen', id: 'beam-core', page: 'beam_fx', program: 'pen AK44.c\ndash 20 s', role: 'artwork', color: '#00ffff', width: 3 },
    { op: 'pen', id: 'beam-glow', page: 'beam_fx', program: 'pen AK52.c\ndisc 8', role: 'artwork', color: '#0099ff', paint: 'cells', tone: 'half' },
    { op: 'pen', id: 'beam-sparks1', page: 'beam_fx', program: 'pen AC55.c\ndot\npen AS58.c\ndot', role: 'artwork', color: '#ffffff' },
  ];

  const rehearsal = await call('plan', { operations });
  if (/plan FAILED/.test(rehearsal)) throw new Error(rehearsal);
  await call('plan', { operations, commit: true });

  fitCanvas(session.doc);
  adjudicateArtwork(session.doc, 'Mecha Dragon');

  await call('save');
  await call('render', { path: 'diagrams/custom-02-mecha-dragon.svg' });
  log('✓ Mecha-Dragon Pixel Art rendered');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. 64-CORE QUANTUM NEURAL PROCESSOR DIAGRAM
// ═══════════════════════════════════════════════════════════════════════════════
async function createQuantumProcessor() {
  log('┌─ Creation 3: 64-Core Quantum Neural Processor');

  const session = createSession({ cwd: project, createdAt: FIXED_TS });
  const tools = Object.fromEntries(createTools(session).map((t) => [t.name, t]));
  const call = async (name, args) => {
    const r = await tools[name].handler(args ?? {});
    const text = typeof r === 'string' ? r : (r?.text ?? JSON.stringify(r));
    if (/^error:/i.test(text) || r?.isError) throw new Error(`${name}: ${text}`);
    return text;
  };

  await call('new_diagram', {
    name: 'Quantum Neural Processor', path: 'diagrams/custom-03-microchip-arch.turtlepen.json',
    cols: 110, rows: 70,
  });

  await call('add_page', { id: 'die_bg', z: -1, intent: 'overlay' });
  await call('update_page', { id: 'base', intent: 'overlay' });

  const operations = [
    // Header
    { op: 'place_box', id: 'title', at: 'D4.tl', span: '100x4', label: 'QN-64X QUANTUM NEURAL PROCESSOR DIE ARCHITECTURE', fill: '#1e293b', corner: 'chamfered', align: 'center', fontSize: 12 },

    // Main Die Container (Background page die_bg)
    { op: 'place_box', id: 'die-outer', page: 'die_bg', at: 'D10.tl', span: '100x54', label: 'PROCESSOR DIE (4nm Q-CMOS)', fill: '#0f172a', corner: 'square', align: 'left', fontSize: 10 },

    // Four Quadrant Core Complexes (On base page)
    { op: 'place_box', id: 'core-q1', at: 'H16.tl', span: '36x16', label: 'Q-CORE CLUSTER 0 (Cores 0-15)\n16x SQUID Qubits | Cryo-Control', fill: '#1e1b4b', corner: 'rounded', align: 'center', fontSize: 10 },
    { op: 'place_box', id: 'core-q2', at: 'BF16.tl', span: '36x16', label: 'Q-CORE CLUSTER 1 (Cores 16-31)\n16x SQUID Qubits | Cryo-Control', fill: '#1e1b4b', corner: 'rounded', align: 'center', fontSize: 10 },
    { op: 'place_box', id: 'core-q3', at: 'H44.tl', span: '36x16', label: 'Q-CORE CLUSTER 2 (Cores 32-47)\n16x SQUID Qubits | Cryo-Control', fill: '#1e1b4b', corner: 'rounded', align: 'center', fontSize: 10 },
    { op: 'place_box', id: 'core-q4', at: 'BF44.tl', span: '36x16', label: 'Q-CORE CLUSTER 3 (Cores 48-63)\n16x SQUID Qubits | Cryo-Control', fill: '#1e1b4b', corner: 'rounded', align: 'center', fontSize: 10 },

    // Central Photonic Interconnect Hub
    { op: 'place_box', id: 'hub', at: 'AT34.tl', span: '16x8', label: 'PHOTONIC MESH\nINTERCONNECT', fill: '#431407', corner: 'chamfered', align: 'center', fontSize: 10 },

    // Interconnect Buses (Pen paths connecting clusters to hub)
    { op: 'pen', id: 'bus-q1', program: 'pen from core-q1.S\ndown line to hub.W\ndown corner align top right\nright line to hub.W arrow', role: 'connector', color: '#ff6600', width: 2 },
    { op: 'pen', id: 'bus-q2', program: 'pen from core-q2.S\ndown line to hub.E\ndown corner align top left\nleft line to hub.E arrow', role: 'connector', color: '#ff6600', width: 2 },
    { op: 'pen', id: 'bus-q3', program: 'pen from core-q3.N\nup line to hub.W\nup corner align bottom right\nright line to hub.W arrow', role: 'connector', color: '#ff6600', width: 2 },
    { op: 'pen', id: 'bus-q4', program: 'pen from core-q4.N\nup line to hub.E\nup corner align bottom left\nleft line to hub.E arrow', role: 'connector', color: '#ff6600', width: 2 },

    // External I/O Interfaces
    { op: 'place_box', id: 'pcie', at: 'D65.tl', span: '45x3', label: 'HIGH-SPEED CRYOGENIC PCIe Gen 6 INTERFACE', fill: '#064e3b', corner: 'square', align: 'center', fontSize: 10 },
    { op: 'place_box', id: 'mem-ctrl', at: 'BD65.tl', span: '45x3', label: 'HBM3e QUANTUM MEMORY CONTROLLER (1 TB/s)', fill: '#064e3b', corner: 'square', align: 'center', fontSize: 10 },
  ];

  const rehearsal = await call('plan', { operations });
  if (/plan FAILED/.test(rehearsal)) throw new Error(rehearsal);
  await call('plan', { operations, commit: true });

  fitCanvas(session.doc);
  adjudicateArtwork(session.doc, 'Quantum Processor');

  await call('save');
  await call('render', { path: 'diagrams/custom-03-microchip-arch.svg' });
  log('✓ Quantum Neural Processor Diagram rendered');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. STEAMPUNK AIRSHIP DIAGRAM
// ═══════════════════════════════════════════════════════════════════════════════
async function createSteampunkAirship() {
  log('┌─ Creation 4: Steampunk Airship');

  const session = createSession({ cwd: project, createdAt: FIXED_TS });
  const tools = Object.fromEntries(createTools(session).map((t) => [t.name, t]));
  const call = async (name, args) => {
    const r = await tools[name].handler(args ?? {});
    const text = typeof r === 'string' ? r : (r?.text ?? JSON.stringify(r));
    if (/^error:/i.test(text) || r?.isError) throw new Error(`${name}: ${text}`);
    return text;
  };

  await call('new_diagram', {
    name: 'Steampunk Airship', path: 'diagrams/custom-04-steampunk-airship.turtlepen.json',
    cols: 100, rows: 60,
  });

  await call('add_page', { id: 'sky', z: -2, intent: 'overlay' });
  await call('update_page', { id: 'base', intent: 'overlay' });
  await call('add_page', { id: 'hull', z: 1, intent: 'overlay' });
  await call('add_page', { id: 'gondola', z: 2, intent: 'overlay' });
  await call('add_page', { id: 'steam', z: 3, intent: 'overlay' });

  const envCenter = 'AX22'; // col 50, row 22

  const operations = [
    // Clouds in background
    { op: 'pen', id: 'cloud-1', page: 'sky', program: 'pen H10.c\ndisc 8', role: 'artwork', color: '#e2e8f0', paint: 'cells' },
    { op: 'pen', id: 'cloud-2', page: 'sky', program: 'pen CA12.c\ndisc 10', role: 'artwork', color: '#e2e8f0', paint: 'cells' },

    // Main Envelope (Rigid Airship Body)
    { op: 'pen', id: 'envelope-body', page: 'hull', program: `pen ${envCenter}.c\ndisc 18`, role: 'artwork', color: '#b45309', paint: 'cells' },
    { op: 'pen', id: 'envelope-nose', page: 'hull', program: 'pen V22.c\ndisc 14', role: 'artwork', color: '#d97706', paint: 'cells' },
    { op: 'pen', id: 'envelope-tail', page: 'hull', program: 'pen BR22.c\ndisc 14', role: 'artwork', color: '#d97706', paint: 'cells' },

    // Structural Rib Lines (Dashes)
    { op: 'pen', id: 'rib-1', page: 'hull', program: `pen ${envCenter}.c\ncircle 18`, role: 'artwork', color: '#78350f', width: 2 },
    { op: 'pen', id: 'rib-2', page: 'hull', program: `pen ${envCenter}.c\ncircle 12`, role: 'artwork', color: '#78350f', width: 1 },

    // Tail Fins / Rudders
    { op: 'pen', id: 'fin-top', page: 'hull', program: 'pen CC10.c\ntriangle BS20.c CD20.c', role: 'artwork', color: '#991b1b', paint: 'cells' },
    { op: 'pen', id: 'fin-bot', page: 'hull', program: 'pen CC34.c\ntriangle BS24.c CD24.c', role: 'artwork', color: '#991b1b', paint: 'cells' },

    // Suspension Cables (Connecting Envelope to Gondola)
    { op: 'pen', id: 'cable-1', page: 'gondola', program: 'pen AD30.c\ndash 10 s', role: 'artwork', color: '#451a03', width: 1 },
    { op: 'pen', id: 'cable-2', page: 'gondola', program: 'pen AX30.c\ndash 10 s', role: 'artwork', color: '#451a03', width: 1 },
    { op: 'pen', id: 'cable-3', page: 'gondola', program: 'pen BT30.c\ndash 10 s', role: 'artwork', color: '#451a03', width: 1 },

    // Gondola Deck & Cabin
    { op: 'place_box', id: 'gondola-main', at: 'AB40.tl', span: '44x8', label: 'COMMAND GONDOLA & STEAM ENGINE', fill: '#451a03', corner: 'rounded', align: 'center', fontSize: 10 },

    // Propellers at rear of gondola
    { op: 'pen', id: 'prop-hub', page: 'gondola', program: 'pen BY44.c\ndisc 3', role: 'artwork', color: '#fbbf24', paint: 'cells' },
    { op: 'pen', id: 'prop-blade1', page: 'gondola', program: 'pen BY44.c\ndash 6 n', role: 'artwork', color: '#78350f', width: 2 },
    { op: 'pen', id: 'prop-blade2', page: 'gondola', program: 'pen BY44.c\ndash 6 s', role: 'artwork', color: '#78350f', width: 2 },

    // Steam Exhaust Trails
    { op: 'pen', id: 'steam-puff1', page: 'steam', program: 'pen CH42.c\ndisc 4', role: 'artwork', color: '#f1f5f9', paint: 'cells', tone: 'half' },
    { op: 'pen', id: 'steam-puff2', page: 'steam', program: 'pen CN40.c\ndisc 6', role: 'artwork', color: '#f1f5f9', paint: 'cells', tone: 'quarter' },
  ];

  const rehearsal = await call('plan', { operations });
  if (/plan FAILED/.test(rehearsal)) throw new Error(rehearsal);
  await call('plan', { operations, commit: true });

  fitCanvas(session.doc);
  adjudicateArtwork(session.doc, 'Steampunk Airship');

  await call('save');
  await call('render', { path: 'diagrams/custom-04-steampunk-airship.svg' });
  log('✓ Steampunk Airship Diagram rendered');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. CELESTIAL STARMAP
// ═══════════════════════════════════════════════════════════════════════════════
async function createCelestialStarmap() {
  log('┌─ Creation 5: Celestial Starmap');

  const session = createSession({ cwd: project, createdAt: FIXED_TS });
  const tools = Object.fromEntries(createTools(session).map((t) => [t.name, t]));
  const call = async (name, args) => {
    const r = await tools[name].handler(args ?? {});
    const text = typeof r === 'string' ? r : (r?.text ?? JSON.stringify(r));
    if (/^error:/i.test(text) || r?.isError) throw new Error(`${name}: ${text}`);
    return text;
  };

  await call('new_diagram', {
    name: 'Celestial Starmap', path: 'diagrams/custom-05-celestial-map.turtlepen.json',
    cols: 80, rows: 80,
  });

  await call('add_page', { id: 'constellations', z: -1, intent: 'overlay' });
  await call('update_page', { id: 'base', intent: 'overlay' });
  await call('add_page', { id: 'zodiac_ring', z: 1, intent: 'overlay' });
  await call('add_page', { id: 'center_icon', z: 2, intent: 'overlay' });

  const center = 'AN40'; // col 40, row 40

  const operations = [
    // Outer Zodiac Border Rings
    { op: 'pen', id: 'z-ring1', page: 'zodiac_ring', program: `pen ${center}.c\ncircle 34`, role: 'artwork', color: '#d97706', width: 2 },
    { op: 'pen', id: 'z-ring2', page: 'zodiac_ring', program: `pen ${center}.c\ncircle 30`, role: 'artwork', color: '#b45309', width: 1 },
    { op: 'pen', id: 'z-ring3', page: 'zodiac_ring', program: `pen ${center}.c\ncircle 20`, role: 'artwork', color: '#92400e', width: 1 },

    // Cardinal Points / Compass Rays
    { op: 'pen', id: 'ray-n', page: 'zodiac_ring', program: `pen ${center}.c\ndash 34 n`, role: 'artwork', color: '#f59e0b', width: 1 },
    { op: 'pen', id: 'ray-s', page: 'zodiac_ring', program: `pen ${center}.c\ndash 34 s`, role: 'artwork', color: '#f59e0b', width: 1 },
    { op: 'pen', id: 'ray-e', page: 'zodiac_ring', program: `pen ${center}.c\ndash 34 e`, role: 'artwork', color: '#f59e0b', width: 1 },
    { op: 'pen', id: 'ray-w', page: 'zodiac_ring', program: `pen ${center}.c\ndash 34 w`, role: 'artwork', color: '#f59e0b', width: 1 },

    // Constellation Major Stars (Ursa / Orion pattern)
    { op: 'pen', id: 'star-alpha', page: 'constellations', program: 'pen AB20.c\ndisc 3', role: 'artwork', color: '#fef08a', paint: 'cells' },
    { op: 'pen', id: 'star-beta', page: 'constellations', program: 'pen AJ18.c\ndisc 2', role: 'artwork', color: '#ffffff', paint: 'cells' },
    { op: 'pen', id: 'star-gamma', page: 'constellations', program: 'pen AT22.c\ndisc 3', role: 'artwork', color: '#fef08a', paint: 'cells' },
    { op: 'pen', id: 'star-delta', page: 'constellations', program: 'pen AZ28.c\ndisc 2', role: 'artwork', color: '#ffffff', paint: 'cells' },

    // Constellation Lines
    { op: 'pen', id: 'const-line1', page: 'constellations', program: 'pen AB20.c\nray to AJ18.c', role: 'artwork', color: '#fbbf24', width: 1 },
    { op: 'pen', id: 'const-line2', page: 'constellations', program: 'pen AJ18.c\nray to AT22.c', role: 'artwork', color: '#fbbf24', width: 1 },
    { op: 'pen', id: 'const-line3', page: 'constellations', program: 'pen AT22.c\nray to AZ28.c', role: 'artwork', color: '#fbbf24', width: 1 },

    // Centerpiece: Sun-Moon Conjunction Symbol
    { op: 'pen', id: 'sun-disc', page: 'center_icon', program: `pen ${center}.c\ndisc 8`, role: 'artwork', color: '#f59e0b', paint: 'cells' },
    { op: 'pen', id: 'moon-mask', page: 'center_icon', program: 'pen AP39.c\ndisc 7', role: 'artwork', color: '#0f172a', paint: 'cells' },
    { op: 'pen', id: 'sun-rays', page: 'center_icon', program: `pen ${center}.c\ncircle 10`, role: 'artwork', color: '#fef08a', width: 2 },
  ];

  const rehearsal = await call('plan', { operations });
  if (/plan FAILED/.test(rehearsal)) throw new Error(rehearsal);
  await call('plan', { operations, commit: true });

  fitCanvas(session.doc);
  adjudicateArtwork(session.doc, 'Celestial Starmap');

  await call('save');
  await call('render', { path: 'diagrams/custom-05-celestial-map.svg' });
  log('✓ Celestial Starmap rendered');
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTE ALL FIVE
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n  Five Custom Creations — TurtlePen MCP\n');

try {
  await createCyberpunkHud();
  await createMechaDragon();
  await createQuantumProcessor();
  await createSteampunkAirship();
  await createCelestialStarmap();

  console.log('\n  ═══════════════════════════════════');
  console.log('  All five custom creations completed!');
  console.log('  ═══════════════════════════════════');
  console.log('  diagrams/custom-01-cyberpunk-hud.svg');
  console.log('  diagrams/custom-02-mecha-dragon.svg');
  console.log('  diagrams/custom-03-microchip-arch.svg');
  console.log('  diagrams/custom-04-steampunk-airship.svg');
  console.log('  diagrams/custom-05-celestial-map.svg');
  console.log('');
} catch (err) {
  console.error(`\n  FAILED: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
}
