#!/usr/bin/env node
/**
 * A CRT monitor, a keyboard, and one cable that passes in FRONT of one and
 * BEHIND the other.
 *
 * This is the scene that motivates `L025`. A projected drawing lands on a
 * lattice with no z-buffer, so depth is not something an element carries into
 * the renderer — it is which page the element sits on. Author the whole scene
 * on one page and the cable cannot pass behind the monitor no matter how
 * accurate its 3D waypoints were; it just merges with whatever it crosses, and
 * the log fills with `L006` "will render as a merged line".
 *
 * The important lesson is the one that only shows up when you try it: a single
 * run CANNOT be both in front of the keyboard and behind the monitor, because
 * an element lives on exactly one page. One physical cable is therefore two run
 * elements, and the place they meet is the occlusion boundary.
 *
 * Run with:  node examples/crt-desk-scene.js
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createSession, createTools } from '../src/mcp/tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');
const quiet = process.argv.includes('--quiet');
const say = (...a) => { if (!quiet) console.log(...a); };
const FIXED_CREATED_AT = '2026-08-26T00:00:00.000Z';

const session = createSession({ cwd: project, createdAt: FIXED_CREATED_AT });
const tools = Object.fromEntries(createTools(session).map((t) => [t.name, t]));

/** MCP tools report failure as TEXT, so a driver that ignores it sees success. */
async function call(name, args) {
  const r = await tools[name].handler(args ?? {});
  const text = typeof r === 'string' ? r : (r?.text ?? JSON.stringify(r));
  if (/^error:/i.test(text) || r?.isError) throw new Error(`${name}: ${text}`);
  return text;
}
const asJson = async (name, args) => JSON.parse(await call(name, args));

await call('new_diagram', {
  name: 'CRT Desk Scene',
  path: 'diagrams/crt-desk-scene.turtlepen.json',
  cols: 96,
  rows: 60,
});

// Three layers, because the cable crosses two occlusion boundaries. `behind`
// sits under the base page and `front` above it; the desk furniture stays on
// base, which is the layer the viewer reads as "the scene".
await call('add_page', { id: 'behind', z: -1, intent: 'overlay' });
await call('add_page', { id: 'front', z: 1, intent: 'overlay' });

// Room inches: X rightward, Y up from the floor, Z away from the camera.
// The CRT is deep on purpose — that depth is what the cable disappears into.
const scene = await call('perspective_scene', {
  page: 'base',
  // Framed on the desk, not the room.
  //
  // The first version put the eye 34" outside a 96x84 room, so the shell filled
  // the frame and the objects it exists to show were a few strokes in the
  // middle. A clean collision log said nothing about that — only looking did.
  roomIn: { widthIn: 84, depthIn: 72, heightIn: 66 },
  eyeIn: { x: 44, y: 46, z: 2 },
  targetIn: { x: 44, y: 33, z: 58 },
  fovDeg: 52,
  items: [
    { id: 'desk', xIn: 8, yIn: 28, zIn: 26, widthIn: 80, heightIn: 2, depthIn: 44 },
    { id: 'monitor', xIn: 32, yIn: 30, zIn: 46, widthIn: 26, heightIn: 22, depthIn: 24 },
    { id: 'keyboard', xIn: 30, yIn: 30, zIn: 28, widthIn: 30, heightIn: 1, depthIn: 9 },
  ],
  runs: [
    // The near half: the plug lying loose across the keyboard, running back
    // toward the monitor. Everything here is closer to the camera than the CRT.
    {
      id: 'cable-front',
      color: '#c2410c',
      waypoints: [
        { x: 26, y: 32, z: 30 },
        { x: 40, y: 32, z: 31 },
        { x: 48, y: 32, z: 40 },
      ],
    },
    // The far half: emerging behind the CRT and running down to the outlet.
    // Every point here is deeper than the monitor's back face.
    //
    // Dashed, because that is what a hidden run is drawn as. Occlusion alone
    // makes the far half simply absent, which is truthful and tells the reader
    // nothing — the whole point of the drawing is that the cable CONTINUES
    // behind the monitor.
    {
      id: 'cable-behind',
      color: '#c2410c',
      pattern: 'dashed',
      waypoints: [
        { x: 46, y: 31, z: 72 },
        { x: 52, y: 26, z: 80 },
        { x: 52, y: 10, z: 83 },
      ],
    },
  ],
});

say(scene);

// Everything is on one page right now, which is the mistake the rule exists to
// catch. Read the findings rather than assuming which pairs conflict.
const flat = await asJson('validate', { format: 'json' });
const depthFindings = (flat.open ?? []).filter((f) => f.rule === 'L025');
say(`\nflat scene: ${depthFindings.length} L025 depth conflicts`);
for (const f of depthFindings) say('  ' + f.message);

// Apply the rule's own fix: the nearer element moves onto a page in front.
// `cable-behind` goes the other way, under the base page, because the CRT has
// to be able to hide it.
await call('move', { id: 'cable-front', toPage: 'front' });
await call('move', { id: 'cable-behind', toPage: 'behind' });

// `base` was exclusive, which is a claim that nothing sits under it. Now that
// the cable runs behind, that claim is false — and the engine says so rather
// than quietly tolerating it.
await call('update_page', { id: 'base', intent: 'overlay' });

const after = await asJson('validate', { format: 'json' });
const stillFlat = (after.open ?? []).filter((f) => f.rule === 'L025');
say(`\nafter layering: ${stillFlat.length} L025 remaining`);

// What survives is real geometry that happens to be intended. Each one is
// judged on its own and gets its own sentence — a reason that merely restated
// the rule code would now be refused, and rightly: "L006" is not an argument.
const ADJUDICATED = [
  {
    rule: 'L025', actors: ['desk', 'monitor'],
    reason: 'the CRT is standing ON the desk, so the two interpenetrate at the contact surface by construction. Six inches apart is the depth of the monitor foot, not a layering mistake — neither object can occlude the other here because they are touching.',
  },
  {
    rule: 'L006', actors: ['desk', 'monitor'],
    reason: 'the monitor base and the desk surface are the same line in this projection. Drawing both would double the stroke; they share it because the CRT is resting on the desk.',
  },
  {
    rule: 'L010', actors: ['cable-front', 'keyboard'],
    reason: 'the plug lying across the keyboard is the subject of this drawing. The cable covering the keys is the occlusion working, not an overlay accident.',
  },
];

const sig = (f) => `${f.rule}:${[...f.actors].sort().join(',')}`;
for (const entry of ADJUDICATED) {
  const match = (after.open ?? []).find((f) => sig(f) === sig(entry));
  if (!match) continue;
  await call('accept_finding', { fingerprint: match.fingerprint, reason: entry.reason });
}

say('\n' + await call('validate', {}));
say(await call('ascii', { maxCells: 96 }));

for (const acceptance of session.doc.acceptances) acceptance.acceptedAt = FIXED_CREATED_AT;
await call('save', {});
say(await call('render', { path: 'diagrams/crt-desk-scene.svg' }));

// The gate: judge the FINAL state, after the last edit. An earlier log says
// nothing about what was actually shipped.
const final = await asJson('validate', { format: 'json' });
const blocking = (final.open ?? []).filter((f) => f.severity === 'S0' || f.severity === 'S1');
if (blocking.length) {
  console.error(`FAILED: ${blocking.length} blocking findings remain`);
  for (const f of blocking) console.error('  ' + f.rule + ' ' + f.message);
  process.exit(1);
}
say('\ncrt desk scene passed');
