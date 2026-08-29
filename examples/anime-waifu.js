#!/usr/bin/env node
/**
 * Anime Waifu Head with Glasses — TurtlePen Artwork
 * ──────────────────────────────────────────────────
 * Built entirely from geometric primitives:
 *   disc (filled circle), circle (outline), arc, ray, dash, dot.
 *
 * Layering via overlay pages at different z-indices:
 *   z:-1 hair      (behind face — covered by skin disc)
 *   z:1  skin      (face disc on top of hair)
 *   z:2  features  (eyes, nose, mouth, blush on face)
 *   z:3  glasses   (frames, bridge, arms on top of face/eyes)
 *   z:4  bangs     (front hair, eyebrows on top of everything)
 *
 * run:  node examples/anime-waifu.js
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as core from '../src/core/index.js';
import { createSession, createTools } from '../src/mcp/tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');
const session = createSession({ cwd: project });
const tools = Object.fromEntries(
  createTools(session).map((t) => [t.name, t]),
);

const log = (s) => console.log(`  ${s}`);

// ═══════════════════════════════════════════════════════════════════════════
// COORDINATE PLAN (all verified by hand)
//
//   Canvas: 60 cols × 70 rows
//
//   Face center:      AD35  (col 30, row 35)   r=20 quadrants
//   Hair mass center: AD30  (col 30, row 30)   r=24 quadrants
//   Left eye:         X33   (col 24, row 33)   r=6 (white), r=4 (iris)
//   Right eye:        AJ33  (col 36, row 33)   r=6 (white), r=4 (iris)
//   Glasses:          circles r=8 at eye centers, bridge AB33→AF33
//   Bangs:            disc at AD24, r=12 (bottom edge at row 30)
//   Nose:             AD37 (2 cells below face center)
//   Mouth:            AD39 (4 cells below face center)
//   Blush:            V36, AH36  (cheeks)
//
//   Hair extends above face (y=34..48 visible), sides via Q36 and AQ36
// ═══════════════════════════════════════════════════════════════════════════

// ── Step 0: Read help (verifies engine is reachable) ──
await tools.turtlepen_help.handler({});
log('✓ Help loaded');

// ── Step 1: Create diagram ──
await tools.new_diagram.handler({
  name: 'Anime Waifu',
  path: 'diagrams/anime-waifu.turtlepen.json',
  cols: 60,
  rows: 70,
});
log('✓ Created 60×70 canvas');

// ── Step 2: Plan the full composition ──
const operations = [
  // ─── PAGES ───
  { op: 'add_page', id: 'hair',     z: -1, intent: 'overlay', title: 'Back hair' },
  { op: 'add_page', id: 'skin',     z: 1,  intent: 'overlay', title: 'Face skin' },
  { op: 'add_page', id: 'features', z: 2,  intent: 'overlay', title: 'Eyes and features' },
  { op: 'add_page', id: 'glasses',  z: 3,  intent: 'overlay', title: 'Glasses' },
  { op: 'add_page', id: 'bangs',    z: 4,  intent: 'overlay', title: 'Front hair and brows' },

  // ─── BACK HAIR (z:-1, behind face) ───
  // Main mass — large disc above face center; face disc covers bottom half
  { op: 'pen', id: 'hair-mass', page: 'hair',
    program: 'pen AD30.c\ndisc 24',
    role: 'artwork', color: '#2d1b4e', paint: 'cells' },

  // Side hair left — extends below face on left
  { op: 'pen', id: 'hair-side-l', page: 'hair',
    program: 'pen Q36.c\ndisc 10',
    role: 'artwork', color: '#2d1b4e', paint: 'cells' },

  // Side hair right — mirror
  { op: 'pen', id: 'hair-side-r', page: 'hair',
    program: 'pen AQ36.c\ndisc 10',
    role: 'artwork', color: '#2d1b4e', paint: 'cells' },

  // Hair tips hanging below the side masses
  { op: 'pen', id: 'hair-tip-l', page: 'hair',
    program: 'pen Q44.c\ndisc 6',
    role: 'artwork', color: '#2d1b4e', paint: 'cells' },
  { op: 'pen', id: 'hair-tip-r', page: 'hair',
    program: 'pen AQ44.c\ndisc 6',
    role: 'artwork', color: '#2d1b4e', paint: 'cells' },

  // Highlight shimmer on hair (lighter purple, half-tone)
  { op: 'pen', id: 'hair-shine', page: 'hair',
    program: 'pen AG22.c\ndisc 5',
    role: 'artwork', color: '#5a3d8e', paint: 'cells', tone: 'half' },

  // ─── FACE SKIN (z:1, covers bottom of hair) ───
  { op: 'pen', id: 'face-fill', page: 'skin',
    program: 'pen AD35.c\ndisc 20',
    role: 'artwork', color: '#fce4d6', paint: 'cells' },

  // Subtle face outline
  { op: 'pen', id: 'face-line', page: 'skin',
    program: 'pen AD35.c\ncircle 20',
    role: 'artwork', color: '#c4a082', width: 1 },

  // Neck stub below chin
  { op: 'pen', id: 'neck', page: 'skin',
    program: 'pen AD43.c\ndisc 4',
    role: 'artwork', color: '#fce4d6', paint: 'cells' },

  // ─── FEATURES (z:2, drawn on the face) ───
  // LEFT EYE — white, iris, pupil, highlights
  { op: 'pen', id: 'leye-wh', page: 'features',
    program: 'pen X33.c\ndisc 6',
    role: 'artwork', color: '#ffffff', paint: 'cells' },
  { op: 'pen', id: 'leye-ir', page: 'features',
    program: 'pen X34.c\ndisc 4',
    role: 'artwork', color: '#4a90d9', paint: 'cells' },
  { op: 'pen', id: 'leye-pu', page: 'features',
    program: 'pen X34.c\ndisc 2',
    role: 'artwork', color: '#1a1a2e', paint: 'cells' },
  { op: 'pen', id: 'leye-hi', page: 'features',
    program: 'pen W32.c\ndisc 1',
    role: 'artwork', color: '#ffffff', paint: 'cells' },

  // RIGHT EYE — mirror of left
  { op: 'pen', id: 'reye-wh', page: 'features',
    program: 'pen AJ33.c\ndisc 6',
    role: 'artwork', color: '#ffffff', paint: 'cells' },
  { op: 'pen', id: 'reye-ir', page: 'features',
    program: 'pen AJ34.c\ndisc 4',
    role: 'artwork', color: '#4a90d9', paint: 'cells' },
  { op: 'pen', id: 'reye-pu', page: 'features',
    program: 'pen AJ34.c\ndisc 2',
    role: 'artwork', color: '#1a1a2e', paint: 'cells' },
  { op: 'pen', id: 'reye-hi', page: 'features',
    program: 'pen AI32.c\ndisc 1',
    role: 'artwork', color: '#ffffff', paint: 'cells' },

  // Upper eyelids — thick arc across top of each eye
  // arc 200→340 is north portion (clockwise from east): the upper lid
  { op: 'pen', id: 'leyelid', page: 'features',
    program: 'pen X33.c\narc 6 200 340',
    role: 'artwork', color: '#2d1b4e', width: 2 },
  { op: 'pen', id: 'reyelid', page: 'features',
    program: 'pen AJ33.c\narc 6 200 340',
    role: 'artwork', color: '#2d1b4e', width: 2 },

  // Small eyelashes — short diagonals at outer eye corners
  // Left eye outer corner goes NW; right eye outer corner goes NE
  { op: 'pen', id: 'lash-l', page: 'features',
    program: 'pen U31.c\ndash 2 nw',
    role: 'artwork', color: '#2d1b4e', width: 1 },
  { op: 'pen', id: 'lash-r', page: 'features',
    program: 'pen AM31.c\ndash 2 ne',
    role: 'artwork', color: '#2d1b4e', width: 1 },

  // NOSE — tiny mark, 2 cells below face center
  { op: 'pen', id: 'nose', page: 'features',
    program: 'pen AD37.c\ndot s',
    role: 'artwork', color: '#d4a08a' },

  // MOUTH — small smile arc
  // arc from 40° (just below east) to 140° (just above west), through south = bottom curve = ∪ smile
  { op: 'pen', id: 'mouth', page: 'features',
    program: 'pen AD39.c\narc 3 40 140',
    role: 'artwork', color: '#e88b8b', width: 1 },

  // BLUSH — soft pink spots on cheeks (quarter-tone = subtle)
  { op: 'pen', id: 'blush-l', page: 'features',
    program: 'pen V36.c\ndisc 3',
    role: 'artwork', color: '#ff9999', paint: 'cells', tone: 'quarter' },
  { op: 'pen', id: 'blush-r', page: 'features',
    program: 'pen AH36.c\ndisc 3',
    role: 'artwork', color: '#ff9999', paint: 'cells', tone: 'quarter' },

  // ─── GLASSES (z:3, on top of face and eyes) ───
  // Round frames — circle at each eye center, slightly larger than the eye
  { op: 'pen', id: 'gl-frame-l', page: 'glasses',
    program: 'pen X33.c\ncircle 8',
    role: 'artwork', color: '#333333', width: 2 },
  { op: 'pen', id: 'gl-frame-r', page: 'glasses',
    program: 'pen AJ33.c\ncircle 8',
    role: 'artwork', color: '#333333', width: 2 },

  // Bridge — ray connecting inner edges of frames
  // Left frame inner: col 24+4=28 (AB), Right frame inner: col 36-4=32 (AF)
  { op: 'pen', id: 'gl-bridge', page: 'glasses',
    program: 'pen AB33.c\nray to AF33.c',
    role: 'artwork', color: '#333333', width: 2 },

  // Temple arms — rays extending from outer frame edges toward ears
  // Left: col 24-4=20 (T) going left to col 17 (Q)
  // Right: col 36+4=40 (AN) going right to col 43 (AQ)
  { op: 'pen', id: 'gl-arm-l', page: 'glasses',
    program: 'pen T33.c\nray to Q33.c',
    role: 'artwork', color: '#333333', width: 2 },
  { op: 'pen', id: 'gl-arm-r', page: 'glasses',
    program: 'pen AN33.c\nray to AQ33.c',
    role: 'artwork', color: '#333333', width: 2 },

  // ─── BANGS (z:4, on top of everything) ───
  // Main bang mass — disc covering the forehead
  // Center at row 24, r=12 → bottom edge at row 30, just above the eyes
  { op: 'pen', id: 'bang-mass', page: 'bangs',
    program: 'pen AD24.c\ndisc 12',
    role: 'artwork', color: '#2d1b4e', paint: 'cells' },

  // Bang highlight — lighter strip for depth
  { op: 'pen', id: 'bang-shine', page: 'bangs',
    program: 'pen AB23.c\ndisc 4',
    role: 'artwork', color: '#4a2d6e', paint: 'cells', tone: 'half' },

  // Bang strand accents — rays for individual hair strands
  { op: 'pen', id: 'strand-1', page: 'bangs',
    program: 'pen V20.c\nray to X28.c',
    role: 'artwork', color: '#3d2558', width: 1 },
  { op: 'pen', id: 'strand-2', page: 'bangs',
    program: 'pen AA20.c\nray to AC28.c',
    role: 'artwork', color: '#3d2558', width: 1 },
  { op: 'pen', id: 'strand-3', page: 'bangs',
    program: 'pen AD19.c\nray to AD28.c',
    role: 'artwork', color: '#3d2558', width: 1 },
  { op: 'pen', id: 'strand-4', page: 'bangs',
    program: 'pen AG20.c\nray to AE28.c',
    role: 'artwork', color: '#3d2558', width: 1 },
  { op: 'pen', id: 'strand-5', page: 'bangs',
    program: 'pen AL20.c\nray to AJ28.c',
    role: 'artwork', color: '#3d2558', width: 1 },

  // Eyebrows — drawn AFTER bang disc so they sit on top (anime brows-through-hair)
  { op: 'pen', id: 'brow-l', page: 'bangs',
    program: 'pen V30.c\ndash 6 e',
    role: 'artwork', color: '#2d1b4e', width: 2 },
  { op: 'pen', id: 'brow-r', page: 'bangs',
    program: 'pen AH30.c\ndash 6 e',
    role: 'artwork', color: '#2d1b4e', width: 2 },
];

// ── Step 3: Plan (rehearse without committing) ──
log('Planning…');
const plan = await tools.plan.handler({ operations, commit: false });
console.log(plan.split('\n').slice(0, 5).join('\n'));

// ── Step 4: Commit ──
log('Committing…');
const committed = await tools.plan.handler({ operations, commit: true });
const commitLine = committed.split('\n').find((l) => /committed/i.test(l) || /applied/i.test(l));
log(`✓ ${commitLine ?? 'committed'}`);

// ── Step 5: Validate ──
log('Validating…');
const vLog = await tools.validate.handler({ format: 'log' });
console.log(vLog);

// ── Step 6: Adjudicate — accept ONLY the specific findings we understand ──
const v = core.validate(session.doc);
let accepted = 0;
for (const f of v.open) {
  const desc = f.message ?? f.description ?? `${f.rule} finding`;
  const fp = f.fingerprint.slice(0, 8);
  // L006 (shared quadrants) is expected — overlapping discs IS the composition
  if (f.rule === 'L006') {
    core.acceptFinding(session.doc, f.fingerprint,
      `[${fp}] artwork overlap: ${desc.slice(0, 120)}`);
    accepted++;
    continue;
  }
  // L010 (overlay) — each acceptance names what's covering what
  if (f.rule === 'L010') {
    core.acceptFinding(session.doc, f.fingerprint,
      `[${fp}] overlay stack: ${desc.slice(0, 120)}`);
    accepted++;
    continue;
  }
  // L011 (extends past canvas)
  if (f.rule === 'L011') {
    core.acceptFinding(session.doc, f.fingerprint,
      `[${fp}] artwork crop: ${desc.slice(0, 120)}`);
    accepted++;
    continue;
  }
  // Anything else — log but don't accept blindly
  log(`⚠ UNHANDLED: ${f.rule} ${f.severity} — ${desc}`);
}
log(`Accepted ${accepted} findings, ${v.open.length - accepted} unhandled`);

// Re-validate after acceptances
const v2 = core.validate(session.doc);
log(`Final validation: ${v2.summary.clean ? 'CLEAN' : `${v2.open.length} open finding(s)`}`);
if (!v2.summary.clean) {
  for (const f of v2.open) {
    log(`  [${f.rule}] ${f.severity} — ${f.message ?? ''}`);
  }
}

// ── Step 7: Save ──
await tools.save.handler({});
log('✓ Saved');

// ── Step 8: Render ──
const renderResult = await tools.render.handler({
  path: 'diagrams/anime-waifu.svg',
  showGrid: false,
  bounds: 'canvas',
  margin: 10,
});
log(`✓ Rendered: ${renderResult}`);

// ── Step 9: Look at it — ASCII preview ──
log('ASCII preview:');
const ascii = await tools.ascii.handler({ maxCells: 50 });
console.log(ascii);

console.log('\n  Done — SVG at diagrams/anime-waifu.svg');
