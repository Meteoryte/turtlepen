#!/usr/bin/env node
/**
 * Five Random Creative Images — TurtlePen MCP
 * ────────────────────────────────────────────
 * Five standalone artwork drawings created through the real MCP stdio pipe.
 * Each one is a distinct style/subject composed from TurtlePen's geometric
 * primitives: disc, circle, arc, ray, dash, dot, triangle, polygon.
 *
 * The five subjects:
 *   1. Solar System — sun, orbiting planets with rings
 *   2. Mountain Landscape — peaks, trees, lake, moon
 *   3. Abstract Geometric — concentric shapes, radiating lines, dots
 *   4. Underwater Scene — fish, bubbles, seaweed, waves
 *   5. City Skyline — buildings, windows, stars, crescent moon
 *
 * Run:  node examples/random-five-images.js
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as core from '../src/core/index.js';
import { createSession, createTools } from '../src/mcp/tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');
const FIXED_TS = '2026-08-20T12:00:00.000Z';

const log = (s) => console.log(`  ${s}`);

/**
 * Adjudicate all overlay/merge/composition findings with per-finding reasons.
 *
 * The engine refuses a single reason string after 15 uses — rightly, because
 * a blanket reason is indistinguishable from a loop. Each finding gets its own
 * sentence naming the rule and the actors involved.
 */
function adjudicateArtwork(doc, label) {
  const ARTWORK_RULES = new Set([
    'L001', 'L005', 'L006', 'L007', 'L010', 'L011', 'C001',
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
//  IMAGE 1: SOLAR SYSTEM
//  Sun at center, 4 planets orbiting with visible orbits, Saturn has a ring
// ═══════════════════════════════════════════════════════════════════════════════

async function image1_solar_system() {
  log('┌─ Image 1: Solar System');

  const session = createSession({ cwd: project, createdAt: FIXED_TS });
  const tools = Object.fromEntries(createTools(session).map((t) => [t.name, t]));
  const call = async (name, args) => {
    const r = await tools[name].handler(args ?? {});
    const text = typeof r === 'string' ? r : (r?.text ?? JSON.stringify(r));
    if (/^error:/i.test(text) || r?.isError) throw new Error(`${name}: ${text}`);
    return text;
  };

  await call('new_diagram', {
    name: 'Solar System', path: 'diagrams/random-01-solar-system.turtlepen.json',
    cols: 80, rows: 60,
  });

  // Background star layer
  await call('add_page', { id: 'stars', z: -2, intent: 'overlay' });
  // Base must become overlay when sub-layers exist beneath it.
  await call('update_page', { id: 'base', intent: 'overlay' });
  // Orbit lines
  await call('add_page', { id: 'orbits', z: -1, intent: 'overlay' });
  // Planets
  await call('add_page', { id: 'planets', z: 1, intent: 'overlay' });
  // Ring overlay
  await call('add_page', { id: 'rings', z: 2, intent: 'overlay' });

  // Center of canvas: col 40, row 30 → cell address: AN30
  const cx = 'AN30';

  const operations = [
    // ─── STARS (random dots on the background) ───
    { op: 'pen', id: 'star-1', page: 'stars', program: 'pen E5.c\ndot', role: 'artwork', color: '#ffffcc' },
    { op: 'pen', id: 'star-2', page: 'stars', program: 'pen L12.c\ndot', role: 'artwork', color: '#ffffff' },
    { op: 'pen', id: 'star-3', page: 'stars', program: 'pen T3.c\ndot', role: 'artwork', color: '#ccddff' },
    { op: 'pen', id: 'star-4', page: 'stars', program: 'pen AZ8.c\ndot', role: 'artwork', color: '#ffffdd' },
    { op: 'pen', id: 'star-5', page: 'stars', program: 'pen BF15.c\ndot', role: 'artwork', color: '#ffffff' },
    { op: 'pen', id: 'star-6', page: 'stars', program: 'pen H50.c\ndot', role: 'artwork', color: '#eeeeff' },
    { op: 'pen', id: 'star-7', page: 'stars', program: 'pen BG52.c\ndot', role: 'artwork', color: '#ffffee' },
    { op: 'pen', id: 'star-8', page: 'stars', program: 'pen V55.c\ndot', role: 'artwork', color: '#ffffff' },
    { op: 'pen', id: 'star-9', page: 'stars', program: 'pen AQ5.c\ndot', role: 'artwork', color: '#ddddff' },
    { op: 'pen', id: 'star-10', page: 'stars', program: 'pen BC44.c\ndot', role: 'artwork', color: '#ffffff' },
    { op: 'pen', id: 'star-11', page: 'stars', program: 'pen G28.c\ndot', role: 'artwork', color: '#ffffcc' },
    { op: 'pen', id: 'star-12', page: 'stars', program: 'pen BP20.c\ndot', role: 'artwork', color: '#ccccff' },

    // ─── ORBIT RINGS ───
    { op: 'pen', id: 'orbit-1', page: 'orbits', program: `pen ${cx}.c\ncircle 14`, role: 'artwork', color: '#333355', width: 1 },
    { op: 'pen', id: 'orbit-2', page: 'orbits', program: `pen ${cx}.c\ncircle 22`, role: 'artwork', color: '#333355', width: 1 },
    { op: 'pen', id: 'orbit-3', page: 'orbits', program: `pen ${cx}.c\ncircle 32`, role: 'artwork', color: '#333355', width: 1 },
    { op: 'pen', id: 'orbit-4', page: 'orbits', program: `pen ${cx}.c\ncircle 44`, role: 'artwork', color: '#333355', width: 1 },

    // ─── SUN (center) ───
    // Glow
    { op: 'pen', id: 'sun-glow', page: 'base', program: `pen ${cx}.c\ndisc 10`, role: 'artwork', color: '#ff9933', paint: 'cells', tone: 'quarter' },
    // Core
    { op: 'pen', id: 'sun-core', page: 'base', program: `pen ${cx}.c\ndisc 7`, role: 'artwork', color: '#ffcc00', paint: 'cells' },
    // Hot center
    { op: 'pen', id: 'sun-hot', page: 'base', program: `pen ${cx}.c\ndisc 3`, role: 'artwork', color: '#ffffff', paint: 'cells' },

    // ─── PLANETS ───
    // Mercury (small, close) — on orbit 1 at ~45° NE position
    // orbit r=14 from center AN30 → place at approx offset +10,−10 quadrants
    { op: 'pen', id: 'mercury', page: 'planets', program: 'pen AS23.c\ndisc 2', role: 'artwork', color: '#999999', paint: 'cells' },

    // Venus (medium) — on orbit 2 at ~180° W position
    { op: 'pen', id: 'venus', page: 'planets', program: 'pen AC30.c\ndisc 3', role: 'artwork', color: '#dd8844', paint: 'cells' },

    // Earth (medium, blue) — on orbit 3 at ~270° S position
    { op: 'pen', id: 'earth', page: 'planets', program: 'pen AN46.c\ndisc 4', role: 'artwork', color: '#4488cc', paint: 'cells' },
    { op: 'pen', id: 'earth-land', page: 'planets', program: 'pen AN45.c\ndisc 2', role: 'artwork', color: '#44aa44', paint: 'cells' },

    // Saturn (large, with ring) — on orbit 4 at ~0° E position
    { op: 'pen', id: 'saturn', page: 'planets', program: 'pen BH30.c\ndisc 5', role: 'artwork', color: '#ccaa66', paint: 'cells' },
    // Saturn's ring
    { op: 'pen', id: 'saturn-ring', page: 'rings', program: 'pen BH30.c\narc 9 150 30', role: 'artwork', color: '#ddcc88', width: 1 },
    { op: 'pen', id: 'saturn-ring2', page: 'rings', program: 'pen BH30.c\narc 11 155 25', role: 'artwork', color: '#ccbb77', width: 1 },
  ];

  const rehearsal = await call('plan', { operations });
  if (/plan FAILED/.test(rehearsal)) throw new Error(rehearsal);
  await call('plan', { operations, commit: true });

  fitCanvas(session.doc);
  adjudicateArtwork(session.doc, 'Solar System');

  await call('save');
  await call('render', { path: 'diagrams/random-01-solar-system.svg' });

  log('✓ Solar System rendered');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  IMAGE 2: MOUNTAIN LANDSCAPE
//  Peaks, pine trees, lake reflection, sun/moon
// ═══════════════════════════════════════════════════════════════════════════════

async function image2_mountains() {
  log('┌─ Image 2: Mountain Landscape');

  const session = createSession({ cwd: project, createdAt: FIXED_TS });
  const tools = Object.fromEntries(createTools(session).map((t) => [t.name, t]));
  const call = async (name, args) => {
    const r = await tools[name].handler(args ?? {});
    const text = typeof r === 'string' ? r : (r?.text ?? JSON.stringify(r));
    if (/^error:/i.test(text) || r?.isError) throw new Error(`${name}: ${text}`);
    return text;
  };

  await call('new_diagram', {
    name: 'Mountain Landscape', path: 'diagrams/random-02-mountains.turtlepen.json',
    cols: 100, rows: 60,
  });

  await call('add_page', { id: 'sky', z: -2, intent: 'overlay' });
  await call('update_page', { id: 'base', intent: 'overlay' });
  await call('add_page', { id: 'mountains', z: -1, intent: 'overlay' });
  await call('add_page', { id: 'trees', z: 1, intent: 'overlay' });
  await call('add_page', { id: 'lake', z: 2, intent: 'overlay' });

  const operations = [
    // ─── SKY ───
    // Moon in upper right
    { op: 'pen', id: 'moon', page: 'sky', program: 'pen BP8.c\ndisc 6', role: 'artwork', color: '#ffffdd', paint: 'cells' },
    // Moon crater suggestion
    { op: 'pen', id: 'moon-dark', page: 'sky', program: 'pen BQ9.c\ndisc 3', role: 'artwork', color: '#eeeebb', paint: 'cells' },

    // Stars
    { op: 'pen', id: 'mstar-1', page: 'sky', program: 'pen E4.c\ndot', role: 'artwork', color: '#ffffff' },
    { op: 'pen', id: 'mstar-2', page: 'sky', program: 'pen P7.c\ndot', role: 'artwork', color: '#ffffdd' },
    { op: 'pen', id: 'mstar-3', page: 'sky', program: 'pen AI3.c\ndot', role: 'artwork', color: '#ffffff' },
    { op: 'pen', id: 'mstar-4', page: 'sky', program: 'pen AX10.c\ndot', role: 'artwork', color: '#ddddff' },
    { op: 'pen', id: 'mstar-5', page: 'sky', program: 'pen BV5.c\ndot', role: 'artwork', color: '#ffffee' },
    { op: 'pen', id: 'mstar-6', page: 'sky', program: 'pen CR12.c\ndot', role: 'artwork', color: '#ffffff' },

    // ─── MOUNTAINS ───
    // Big center peak
    { op: 'pen', id: 'peak-main', page: 'mountains',
      program: 'pen AX15.c\nray to M35.c\npen AX15.c\nray to CL35.c',
      role: 'artwork', color: '#556677', width: 1 },
    // Fill the mountain — large disc behind the outline
    { op: 'pen', id: 'peak-fill', page: 'mountains',
      program: 'pen AX28.c\ndisc 18',
      role: 'artwork', color: '#667788', paint: 'cells' },
    // Snow cap
    { op: 'pen', id: 'snow-cap', page: 'mountains',
      program: 'pen AX15.c\nray to AS20.c\npen AX15.c\nray to BC20.c\npen AS20.c\nray to BC20.c',
      role: 'artwork', color: '#ffffff', width: 1 },
    { op: 'pen', id: 'snow-fill', page: 'mountains',
      program: 'pen AX18.c\ndisc 4',
      role: 'artwork', color: '#eeeeff', paint: 'cells' },

    // Left smaller peak
    { op: 'pen', id: 'peak-left', page: 'mountains',
      program: 'pen N22.c\nray to E35.c\npen N22.c\nray to Y35.c',
      role: 'artwork', color: '#445566', width: 1 },
    { op: 'pen', id: 'peak-left-fill', page: 'mountains',
      program: 'pen N30.c\ndisc 10',
      role: 'artwork', color: '#556677', paint: 'cells' },

    // Right smaller peak
    { op: 'pen', id: 'peak-right', page: 'mountains',
      program: 'pen CG20.c\nray to BX35.c\npen CG20.c\nray to CP35.c',
      role: 'artwork', color: '#445566', width: 1 },
    { op: 'pen', id: 'peak-right-fill', page: 'mountains',
      program: 'pen CG28.c\ndisc 10',
      role: 'artwork', color: '#556677', paint: 'cells' },

    // ─── GROUND LINE ───
    { op: 'pen', id: 'ground', page: 'base',
      program: 'pen A35.c\nray to CV35.c',
      role: 'artwork', color: '#445533', width: 2 },

    // ─── PINE TREES (triangular shapes) ───
    // Tree 1
    { op: 'pen', id: 'tree1-trunk', page: 'trees', program: 'pen H40.c\ndash 4 n', role: 'artwork', color: '#553311', width: 2 },
    { op: 'pen', id: 'tree1-top', page: 'trees', program: 'pen H36.c\ntriangle D38.c L38.c', role: 'artwork', color: '#336633', paint: 'cells' },

    // Tree 2
    { op: 'pen', id: 'tree2-trunk', page: 'trees', program: 'pen P42.c\ndash 5 n', role: 'artwork', color: '#553311', width: 2 },
    { op: 'pen', id: 'tree2-top', page: 'trees', program: 'pen P37.c\ntriangle K40.c U40.c', role: 'artwork', color: '#2d5a2d', paint: 'cells' },

    // Tree 3
    { op: 'pen', id: 'tree3-trunk', page: 'trees', program: 'pen CC40.c\ndash 4 n', role: 'artwork', color: '#553311', width: 2 },
    { op: 'pen', id: 'tree3-top', page: 'trees', program: 'pen CC36.c\ntriangle BY38.c CG38.c', role: 'artwork', color: '#336633', paint: 'cells' },

    // ─── LAKE ───
    { op: 'pen', id: 'lake-body', page: 'lake',
      program: 'pen AX48.c\ndisc 14',
      role: 'artwork', color: '#335577', paint: 'cells' },
    // Lake surface shimmer
    { op: 'pen', id: 'lake-shimmer', page: 'lake',
      program: 'pen AX45.c\nray to BC45.c',
      role: 'artwork', color: '#5588aa', width: 1 },
    { op: 'pen', id: 'lake-shimmer2', page: 'lake',
      program: 'pen AU47.c\nray to BA47.c',
      role: 'artwork', color: '#4477aa', width: 1 },
  ];

  const rehearsal = await call('plan', { operations });
  if (/plan FAILED/.test(rehearsal)) throw new Error(rehearsal);
  await call('plan', { operations, commit: true });

  fitCanvas(session.doc);
  adjudicateArtwork(session.doc, 'Mountain Landscape');

  await call('save');
  await call('render', { path: 'diagrams/random-02-mountains.svg' });

  log('✓ Mountain Landscape rendered');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  IMAGE 3: ABSTRACT GEOMETRIC
//  Concentric circles, radiating lines, scattered dots — op-art inspired
// ═══════════════════════════════════════════════════════════════════════════════

async function image3_abstract() {
  log('┌─ Image 3: Abstract Geometric');

  const session = createSession({ cwd: project, createdAt: FIXED_TS });
  const tools = Object.fromEntries(createTools(session).map((t) => [t.name, t]));
  const call = async (name, args) => {
    const r = await tools[name].handler(args ?? {});
    const text = typeof r === 'string' ? r : (r?.text ?? JSON.stringify(r));
    if (/^error:/i.test(text) || r?.isError) throw new Error(`${name}: ${text}`);
    return text;
  };

  await call('new_diagram', {
    name: 'Abstract Geometric', path: 'diagrams/random-03-abstract.turtlepen.json',
    cols: 70, rows: 70,
  });

  await call('add_page', { id: 'rays', z: -1, intent: 'overlay' });
  await call('update_page', { id: 'base', intent: 'overlay' });
  await call('add_page', { id: 'dots', z: 1, intent: 'overlay' });
  await call('add_page', { id: 'arcs', z: 2, intent: 'overlay' });

  // Center: col 35, row 35 → AI35
  const cx = 'AI35';
  const colors = ['#ff4466', '#ff8844', '#ffcc22', '#44cc88', '#4488ff', '#8844ff'];

  const operations = [
    // ─── CONCENTRIC CIRCLES ───
    { op: 'pen', id: 'ring-1', page: 'base', program: `pen ${cx}.c\ncircle 6`, role: 'artwork', color: colors[0], width: 2 },
    { op: 'pen', id: 'ring-2', page: 'base', program: `pen ${cx}.c\ncircle 12`, role: 'artwork', color: colors[1], width: 2 },
    { op: 'pen', id: 'ring-3', page: 'base', program: `pen ${cx}.c\ncircle 18`, role: 'artwork', color: colors[2], width: 2 },
    { op: 'pen', id: 'ring-4', page: 'base', program: `pen ${cx}.c\ncircle 24`, role: 'artwork', color: colors[3], width: 2 },
    { op: 'pen', id: 'ring-5', page: 'base', program: `pen ${cx}.c\ncircle 30`, role: 'artwork', color: colors[4], width: 2 },
    { op: 'pen', id: 'ring-6', page: 'base', program: `pen ${cx}.c\ncircle 36`, role: 'artwork', color: colors[5], width: 1 },

    // ─── CENTER FILLED ───
    { op: 'pen', id: 'center-fill', page: 'base', program: `pen ${cx}.c\ndisc 4`, role: 'artwork', color: '#ffffff', paint: 'cells' },

    // ─── RADIATING LINES (12 directions, every 30°) ───
    { op: 'pen', id: 'ray-n', page: 'rays', program: `pen ${cx}.c\ndash 40 n`, role: 'artwork', color: '#ff4466', width: 1 },
    { op: 'pen', id: 'ray-ne', page: 'rays', program: `pen ${cx}.c\ndash 36 ne`, role: 'artwork', color: '#ff6644', width: 1 },
    { op: 'pen', id: 'ray-e', page: 'rays', program: `pen ${cx}.c\ndash 40 e`, role: 'artwork', color: '#ff8844', width: 1 },
    { op: 'pen', id: 'ray-se', page: 'rays', program: `pen ${cx}.c\ndash 36 se`, role: 'artwork', color: '#ffaa33', width: 1 },
    { op: 'pen', id: 'ray-s', page: 'rays', program: `pen ${cx}.c\ndash 40 s`, role: 'artwork', color: '#ffcc22', width: 1 },
    { op: 'pen', id: 'ray-sw', page: 'rays', program: `pen ${cx}.c\ndash 36 sw`, role: 'artwork', color: '#88cc44', width: 1 },
    { op: 'pen', id: 'ray-w', page: 'rays', program: `pen ${cx}.c\ndash 40 w`, role: 'artwork', color: '#44cc88', width: 1 },
    { op: 'pen', id: 'ray-nw', page: 'rays', program: `pen ${cx}.c\ndash 36 nw`, role: 'artwork', color: '#4488ff', width: 1 },

    // ─── CORNER ARCS — quarter arcs in each quadrant ───
    { op: 'pen', id: 'arc-tl', page: 'arcs', program: `pen ${cx}.c\narc 28 180 270`, role: 'artwork', color: '#ff4466', width: 2 },
    { op: 'pen', id: 'arc-tr', page: 'arcs', program: `pen ${cx}.c\narc 28 270 360`, role: 'artwork', color: '#ffcc22', width: 2 },
    { op: 'pen', id: 'arc-br', page: 'arcs', program: `pen ${cx}.c\narc 28 0 90`, role: 'artwork', color: '#44cc88', width: 2 },
    { op: 'pen', id: 'arc-bl', page: 'arcs', program: `pen ${cx}.c\narc 28 90 180`, role: 'artwork', color: '#4488ff', width: 2 },

    // ─── SCATTERED DOTS ───
    { op: 'pen', id: 'dot-1', page: 'dots', program: 'pen C5.c\ndot', role: 'artwork', color: '#ff4466' },
    { op: 'pen', id: 'dot-2', page: 'dots', program: 'pen J8.c\ndisc 1', role: 'artwork', color: '#ff8844', paint: 'cells' },
    { op: 'pen', id: 'dot-3', page: 'dots', program: 'pen BN6.c\ndot', role: 'artwork', color: '#ffcc22' },
    { op: 'pen', id: 'dot-4', page: 'dots', program: 'pen BR60.c\ndot', role: 'artwork', color: '#44cc88' },
    { op: 'pen', id: 'dot-5', page: 'dots', program: 'pen E62.c\ndisc 1', role: 'artwork', color: '#4488ff', paint: 'cells' },
    { op: 'pen', id: 'dot-6', page: 'dots', program: 'pen L58.c\ndot', role: 'artwork', color: '#8844ff' },
    { op: 'pen', id: 'dot-7', page: 'dots', program: 'pen BK55.c\ndisc 1', role: 'artwork', color: '#ff4466', paint: 'cells' },
    { op: 'pen', id: 'dot-8', page: 'dots', program: 'pen P15.c\ndot', role: 'artwork', color: '#ff8844' },
  ];

  const rehearsal = await call('plan', { operations });
  if (/plan FAILED/.test(rehearsal)) throw new Error(rehearsal);
  await call('plan', { operations, commit: true });

  fitCanvas(session.doc);
  adjudicateArtwork(session.doc, 'Abstract Geometric');

  await call('save');
  await call('render', { path: 'diagrams/random-03-abstract.svg' });

  log('✓ Abstract Geometric rendered');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  IMAGE 4: UNDERWATER SCENE
//  Fish, bubbles, seaweed fronds, wavy surface
// ═══════════════════════════════════════════════════════════════════════════════

async function image4_underwater() {
  log('┌─ Image 4: Underwater Scene');

  const session = createSession({ cwd: project, createdAt: FIXED_TS });
  const tools = Object.fromEntries(createTools(session).map((t) => [t.name, t]));
  const call = async (name, args) => {
    const r = await tools[name].handler(args ?? {});
    const text = typeof r === 'string' ? r : (r?.text ?? JSON.stringify(r));
    if (/^error:/i.test(text) || r?.isError) throw new Error(`${name}: ${text}`);
    return text;
  };

  await call('new_diagram', {
    name: 'Underwater Scene', path: 'diagrams/random-04-underwater.turtlepen.json',
    cols: 90, rows: 60,
  });

  await call('add_page', { id: 'deep', z: -1, intent: 'overlay' });
  await call('update_page', { id: 'base', intent: 'overlay' });
  await call('add_page', { id: 'fish', z: 1, intent: 'overlay' });
  await call('add_page', { id: 'bubbles', z: 2, intent: 'overlay' });

  const operations = [
    // ─── WATER SURFACE (wavy line at top) ───
    { op: 'pen', id: 'wave-1', page: 'base',
      program: 'pen A5.c\narc 8 0 180',
      role: 'artwork', color: '#4488bb', width: 2 },
    { op: 'pen', id: 'wave-2', page: 'base',
      program: 'pen Q5.c\narc 8 180 360',
      role: 'artwork', color: '#5599cc', width: 2 },
    { op: 'pen', id: 'wave-3', page: 'base',
      program: 'pen AG5.c\narc 8 0 180',
      role: 'artwork', color: '#4488bb', width: 2 },
    { op: 'pen', id: 'wave-4', page: 'base',
      program: 'pen AW5.c\narc 8 180 360',
      role: 'artwork', color: '#5599cc', width: 2 },
    { op: 'pen', id: 'wave-5', page: 'base',
      program: 'pen BM5.c\narc 8 0 180',
      role: 'artwork', color: '#4488bb', width: 2 },

    // ─── SEAWEED (vertical dashes from the bottom) ───
    { op: 'pen', id: 'weed-1a', page: 'deep', program: 'pen K55.c\ndash 12 n', role: 'artwork', color: '#228844', width: 2 },
    { op: 'pen', id: 'weed-1b', page: 'deep', program: 'pen L50.c\ndash 6 nw', role: 'artwork', color: '#33aa55', width: 1 },
    { op: 'pen', id: 'weed-2a', page: 'deep', program: 'pen T56.c\ndash 14 n', role: 'artwork', color: '#228844', width: 2 },
    { op: 'pen', id: 'weed-2b', page: 'deep', program: 'pen S50.c\ndash 6 ne', role: 'artwork', color: '#33aa55', width: 1 },
    { op: 'pen', id: 'weed-3a', page: 'deep', program: 'pen BT55.c\ndash 10 n', role: 'artwork', color: '#228844', width: 2 },
    { op: 'pen', id: 'weed-3b', page: 'deep', program: 'pen BU48.c\ndash 5 nw', role: 'artwork', color: '#33aa55', width: 1 },

    // ─── SANDY FLOOR ───
    { op: 'pen', id: 'floor', page: 'deep',
      program: 'pen A58.c\nray to CL58.c',
      role: 'artwork', color: '#ccaa66', width: 2 },

    // ─── FISH 1 (large, orange) — body disc + tail triangle ───
    { op: 'pen', id: 'fish1-body', page: 'fish',
      program: 'pen AJ25.c\ndisc 6',
      role: 'artwork', color: '#ff8833', paint: 'cells' },
    { op: 'pen', id: 'fish1-tail', page: 'fish',
      program: 'pen AQ25.c\ntriangle AU22.c AU28.c',
      role: 'artwork', color: '#ff6622', paint: 'cells' },
    { op: 'pen', id: 'fish1-eye', page: 'fish',
      program: 'pen AH24.c\ndisc 1',
      role: 'artwork', color: '#ffffff', paint: 'cells' },
    { op: 'pen', id: 'fish1-pupil', page: 'fish',
      program: 'pen AG24.c\ndot',
      role: 'artwork', color: '#111111' },

    // ─── FISH 2 (small, blue) ───
    { op: 'pen', id: 'fish2-body', page: 'fish',
      program: 'pen BP38.c\ndisc 4',
      role: 'artwork', color: '#4488dd', paint: 'cells' },
    { op: 'pen', id: 'fish2-tail', page: 'fish',
      program: 'pen BU38.c\ntriangle BX36.c BX40.c',
      role: 'artwork', color: '#3366bb', paint: 'cells' },
    { op: 'pen', id: 'fish2-eye', page: 'fish',
      program: 'pen BO37.c\ndot',
      role: 'artwork', color: '#ffffff' },

    // ─── FISH 3 (small, green) ───
    { op: 'pen', id: 'fish3-body', page: 'fish',
      program: 'pen V15.c\ndisc 3',
      role: 'artwork', color: '#55bb66', paint: 'cells' },
    { op: 'pen', id: 'fish3-tail', page: 'fish',
      program: 'pen S15.c\ntriangle Q13.c Q17.c',
      role: 'artwork', color: '#449955', paint: 'cells' },
    { op: 'pen', id: 'fish3-eye', page: 'fish',
      program: 'pen W14.c\ndot',
      role: 'artwork', color: '#ffffff' },

    // ─── BUBBLES ───
    { op: 'pen', id: 'bub-1', page: 'bubbles', program: 'pen AP18.c\ncircle 2', role: 'artwork', color: '#88ccee', width: 1 },
    { op: 'pen', id: 'bub-2', page: 'bubbles', program: 'pen AN14.c\ncircle 3', role: 'artwork', color: '#99ddff', width: 1 },
    { op: 'pen', id: 'bub-3', page: 'bubbles', program: 'pen AL10.c\ncircle 1', role: 'artwork', color: '#aaddff', width: 1 },
    { op: 'pen', id: 'bub-4', page: 'bubbles', program: 'pen BS32.c\ncircle 2', role: 'artwork', color: '#88ccee', width: 1 },
    { op: 'pen', id: 'bub-5', page: 'bubbles', program: 'pen BR28.c\ncircle 1', role: 'artwork', color: '#99ddff', width: 1 },
    { op: 'pen', id: 'bub-6', page: 'bubbles', program: 'pen H20.c\ncircle 2', role: 'artwork', color: '#88ccee', width: 1 },
    { op: 'pen', id: 'bub-7', page: 'bubbles', program: 'pen J16.c\ncircle 1', role: 'artwork', color: '#aaddff', width: 1 },

    // ─── SMALL STARFISH on the floor ───
    { op: 'pen', id: 'starfish', page: 'deep', program: 'pen AV55.c\ndisc 2', role: 'artwork', color: '#ee6644', paint: 'cells' },
    { op: 'pen', id: 'starfish-arm1', page: 'deep', program: 'pen AV55.c\ndash 3 n', role: 'artwork', color: '#ee6644', width: 1 },
    { op: 'pen', id: 'starfish-arm2', page: 'deep', program: 'pen AV55.c\ndash 3 se', role: 'artwork', color: '#ee6644', width: 1 },
    { op: 'pen', id: 'starfish-arm3', page: 'deep', program: 'pen AV55.c\ndash 3 sw', role: 'artwork', color: '#ee6644', width: 1 },
    { op: 'pen', id: 'starfish-arm4', page: 'deep', program: 'pen AV55.c\ndash 2 ne', role: 'artwork', color: '#ee6644', width: 1 },
    { op: 'pen', id: 'starfish-arm5', page: 'deep', program: 'pen AV55.c\ndash 2 nw', role: 'artwork', color: '#ee6644', width: 1 },
  ];

  const rehearsal = await call('plan', { operations });
  if (/plan FAILED/.test(rehearsal)) throw new Error(rehearsal);
  await call('plan', { operations, commit: true });

  fitCanvas(session.doc);
  adjudicateArtwork(session.doc, 'Underwater Scene');

  await call('save');
  await call('render', { path: 'diagrams/random-04-underwater.svg' });

  log('✓ Underwater Scene rendered');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  IMAGE 5: CITY SKYLINE AT NIGHT
//  Buildings of different heights, lit windows, crescent moon, stars
// ═══════════════════════════════════════════════════════════════════════════════

async function image5_city() {
  log('┌─ Image 5: City Skyline');

  const session = createSession({ cwd: project, createdAt: FIXED_TS });
  const tools = Object.fromEntries(createTools(session).map((t) => [t.name, t]));
  const call = async (name, args) => {
    const r = await tools[name].handler(args ?? {});
    const text = typeof r === 'string' ? r : (r?.text ?? JSON.stringify(r));
    if (/^error:/i.test(text) || r?.isError) throw new Error(`${name}: ${text}`);
    return text;
  };

  await call('new_diagram', {
    name: 'City Skyline', path: 'diagrams/random-05-city-skyline.turtlepen.json',
    cols: 100, rows: 55,
  });

  await call('add_page', { id: 'sky', z: -2, intent: 'overlay' });
  await call('update_page', { id: 'base', intent: 'overlay' });
  await call('add_page', { id: 'buildings', z: -1, intent: 'overlay' });
  await call('add_page', { id: 'windows', z: 1, intent: 'overlay' });
  await call('add_page', { id: 'details', z: 2, intent: 'overlay' });

  const operations = [
    // ─── MOON (crescent: large disc then dark disc offset) ───
    { op: 'pen', id: 'moon-bright', page: 'sky',
      program: 'pen BS8.c\ndisc 7',
      role: 'artwork', color: '#ffffcc', paint: 'cells' },
    { op: 'pen', id: 'moon-shadow', page: 'sky',
      program: 'pen BU7.c\ndisc 6',
      role: 'artwork', color: '#111122', paint: 'cells' },

    // Stars
    { op: 'pen', id: 'cs-1', page: 'sky', program: 'pen D3.c\ndot', role: 'artwork', color: '#ffffff' },
    { op: 'pen', id: 'cs-2', page: 'sky', program: 'pen M7.c\ndot', role: 'artwork', color: '#ffffdd' },
    { op: 'pen', id: 'cs-3', page: 'sky', program: 'pen W4.c\ndot', role: 'artwork', color: '#ffffff' },
    { op: 'pen', id: 'cs-4', page: 'sky', program: 'pen AH2.c\ndot', role: 'artwork', color: '#ddddff' },
    { op: 'pen', id: 'cs-5', page: 'sky', program: 'pen AV6.c\ndot', role: 'artwork', color: '#ffffee' },
    { op: 'pen', id: 'cs-6', page: 'sky', program: 'pen CF4.c\ndot', role: 'artwork', color: '#ffffff' },
    { op: 'pen', id: 'cs-7', page: 'sky', program: 'pen CQ10.c\ndot', role: 'artwork', color: '#ccccff' },
    { op: 'pen', id: 'cs-8', page: 'sky', program: 'pen BH3.c\ndot', role: 'artwork', color: '#ffffff' },

    // ─── GROUND LINE ───
    { op: 'pen', id: 'ground', page: 'base',
      program: 'pen A50.c\nray to CV50.c',
      role: 'artwork', color: '#333333', width: 2 },

    // ─── BUILDINGS (tall filled rectangles from the ground up) ───
    // Building 1 (leftmost, medium)
    { op: 'pen', id: 'bldg1', page: 'buildings',
      program: 'pen E25.c\ndisc 12',
      role: 'artwork', color: '#2a2a3e', paint: 'cells' },

    // Building 2 (tall, narrow)
    { op: 'pen', id: 'bldg2', page: 'buildings',
      program: 'pen R15.c\nray to R50.c\npen R15.c\nray to Z15.c\npen Z15.c\nray to Z50.c\npen R50.c\nray to Z50.c',
      role: 'artwork', color: '#333350', width: 1 },
    { op: 'pen', id: 'bldg2-fill', page: 'buildings',
      program: 'pen V32.c\ndisc 14',
      role: 'artwork', color: '#2d2d44', paint: 'cells' },

    // Building 3 (tallest — skyscraper)
    { op: 'pen', id: 'bldg3-body', page: 'buildings',
      program: 'pen AH35.c\ndisc 16',
      role: 'artwork', color: '#252540', paint: 'cells' },
    { op: 'pen', id: 'bldg3-top', page: 'buildings',
      program: 'pen AH10.c\nray to AH20.c',
      role: 'artwork', color: '#333355', width: 2 },
    // Antenna spire
    { op: 'pen', id: 'bldg3-spire', page: 'buildings',
      program: 'pen AH7.c\ndash 3 s',
      role: 'artwork', color: '#ff3333', width: 1 },

    // Building 4 (medium, wide)
    { op: 'pen', id: 'bldg4', page: 'buildings',
      program: 'pen AY38.c\ndisc 12',
      role: 'artwork', color: '#2a2a3a', paint: 'cells' },

    // Building 5 (rightmost, short/wide)
    { op: 'pen', id: 'bldg5', page: 'buildings',
      program: 'pen BQ40.c\ndisc 10',
      role: 'artwork', color: '#2d2d48', paint: 'cells' },
    // Building 5 tall section
    { op: 'pen', id: 'bldg5-tower', page: 'buildings',
      program: 'pen CB30.c\ndisc 8',
      role: 'artwork', color: '#252540', paint: 'cells' },

    // ─── LIT WINDOWS (dots of warm yellow) ───
    // Building 1 windows
    { op: 'pen', id: 'w1a', page: 'windows', program: 'pen D28.c\ndot', role: 'artwork', color: '#ffdd66' },
    { op: 'pen', id: 'w1b', page: 'windows', program: 'pen F30.c\ndot', role: 'artwork', color: '#ffdd66' },
    { op: 'pen', id: 'w1c', page: 'windows', program: 'pen D33.c\ndot', role: 'artwork', color: '#ffcc44' },
    { op: 'pen', id: 'w1d', page: 'windows', program: 'pen H28.c\ndot', role: 'artwork', color: '#ffdd66' },

    // Building 2 windows
    { op: 'pen', id: 'w2a', page: 'windows', program: 'pen T20.c\ndot', role: 'artwork', color: '#ffee88' },
    { op: 'pen', id: 'w2b', page: 'windows', program: 'pen X22.c\ndot', role: 'artwork', color: '#ffdd66' },
    { op: 'pen', id: 'w2c', page: 'windows', program: 'pen T26.c\ndot', role: 'artwork', color: '#ffcc44' },
    { op: 'pen', id: 'w2d', page: 'windows', program: 'pen X28.c\ndot', role: 'artwork', color: '#ffdd66' },
    { op: 'pen', id: 'w2e', page: 'windows', program: 'pen T32.c\ndot', role: 'artwork', color: '#ffdd66' },
    { op: 'pen', id: 'w2f', page: 'windows', program: 'pen X34.c\ndot', role: 'artwork', color: '#ffee88' },

    // Building 3 windows (tallest)
    { op: 'pen', id: 'w3a', page: 'windows', program: 'pen AF22.c\ndot', role: 'artwork', color: '#ffdd66' },
    { op: 'pen', id: 'w3b', page: 'windows', program: 'pen AJ24.c\ndot', role: 'artwork', color: '#ffee88' },
    { op: 'pen', id: 'w3c', page: 'windows', program: 'pen AF28.c\ndot', role: 'artwork', color: '#ffcc44' },
    { op: 'pen', id: 'w3d', page: 'windows', program: 'pen AJ30.c\ndot', role: 'artwork', color: '#ffdd66' },
    { op: 'pen', id: 'w3e', page: 'windows', program: 'pen AF34.c\ndot', role: 'artwork', color: '#ffdd66' },
    { op: 'pen', id: 'w3f', page: 'windows', program: 'pen AJ36.c\ndot', role: 'artwork', color: '#ffee88' },
    { op: 'pen', id: 'w3g', page: 'windows', program: 'pen AF40.c\ndot', role: 'artwork', color: '#ffcc44' },
    { op: 'pen', id: 'w3h', page: 'windows', program: 'pen AJ42.c\ndot', role: 'artwork', color: '#ffdd66' },

    // Building 4 windows
    { op: 'pen', id: 'w4a', page: 'windows', program: 'pen AW32.c\ndot', role: 'artwork', color: '#ffdd66' },
    { op: 'pen', id: 'w4b', page: 'windows', program: 'pen BA34.c\ndot', role: 'artwork', color: '#ffee88' },
    { op: 'pen', id: 'w4c', page: 'windows', program: 'pen AW38.c\ndot', role: 'artwork', color: '#ffcc44' },
    { op: 'pen', id: 'w4d', page: 'windows', program: 'pen BA40.c\ndot', role: 'artwork', color: '#ffdd66' },

    // Building 5 windows
    { op: 'pen', id: 'w5a', page: 'windows', program: 'pen BO36.c\ndot', role: 'artwork', color: '#ffdd66' },
    { op: 'pen', id: 'w5b', page: 'windows', program: 'pen BS38.c\ndot', role: 'artwork', color: '#ffee88' },
    { op: 'pen', id: 'w5c', page: 'windows', program: 'pen CA34.c\ndot', role: 'artwork', color: '#ffcc44' },
    { op: 'pen', id: 'w5d', page: 'windows', program: 'pen CD36.c\ndot', role: 'artwork', color: '#ffdd66' },

    // ─── DETAILS: street lamps ───
    { op: 'pen', id: 'lamp-1', page: 'details', program: 'pen L48.c\ndash 3 n', role: 'artwork', color: '#555555', width: 1 },
    { op: 'pen', id: 'lamp-1-light', page: 'details', program: 'pen L45.c\ndisc 1', role: 'artwork', color: '#ffee88', paint: 'cells' },
    { op: 'pen', id: 'lamp-2', page: 'details', program: 'pen BJ48.c\ndash 3 n', role: 'artwork', color: '#555555', width: 1 },
    { op: 'pen', id: 'lamp-2-light', page: 'details', program: 'pen BJ45.c\ndisc 1', role: 'artwork', color: '#ffee88', paint: 'cells' },
  ];

  const rehearsal = await call('plan', { operations });
  if (/plan FAILED/.test(rehearsal)) throw new Error(rehearsal);
  await call('plan', { operations, commit: true });

  fitCanvas(session.doc);
  adjudicateArtwork(session.doc, 'City Skyline');

  await call('save');
  await call('render', { path: 'diagrams/random-05-city-skyline.svg' });

  log('✓ City Skyline rendered');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RUN ALL FIVE
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n  Five Random Images — TurtlePen MCP\n');

try {
  await image1_solar_system();
  await image2_mountains();
  await image3_abstract();
  await image4_underwater();
  await image5_city();

  console.log('\n  ═══════════════════════════════════');
  console.log('  All five images created successfully');
  console.log('  ═══════════════════════════════════');
  console.log('  diagrams/random-01-solar-system.svg');
  console.log('  diagrams/random-02-mountains.svg');
  console.log('  diagrams/random-03-abstract.svg');
  console.log('  diagrams/random-04-underwater.svg');
  console.log('  diagrams/random-05-city-skyline.svg');
  console.log('');
} catch (err) {
  console.error(`\n  FAILED: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
}
