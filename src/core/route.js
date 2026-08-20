/**
 * Connector routing that emits a pen program instead of geometry.
 *
 * `llm.md` defers auto-routing with one condition attached: if it is added, it
 * must emit pen commands so the path stays inspectable. That condition is the
 * whole design here. This module **returns a program string and changes
 * nothing**. The author reads it, runs it through `pen` like anything they
 * wrote themselves, and the result validates identically. There is no hidden
 * router in the kernel, and no path in the document that nobody can account
 * for.
 *
 * It is also deliberately not a general router. It tries the three shapes a
 * human would draw — straight, one turn, two turns — and if none is clear it
 * SAYS SO and names what is in the way. A twelve-turn path that technically
 * avoids everything is not a good connector, and inventing one would trade an
 * honest failure for a drawing nobody can read.
 */

import { rect } from './geometry.js';
import { approachPoint, parsePortSpec } from './shapes.js';
import { elementClaimed, findElement, elementsOf } from './document.js';
import { quadToAddress } from './address.js';

const OPPOSITE = Object.freeze({ up: 'down', down: 'up', left: 'right', right: 'left' });
/**
 * The corner alignment that joins two directions without redrawing a quadrant.
 *
 * A `line` leaves the cursor ON its last quadrant, so a following `corner` can
 * re-ink it and raise `L015`. Which alignment pair avoids that depends on the
 * turn, and is not guessable — this table was derived by running every pair
 * through the pen and keeping the ones that produced no self-overlap. Emitting
 * a program that trips a rule the moment it runs would make the router worse
 * than useless.
 */
const CORNER_ALIGN = Object.freeze({
  'down>right': 'right left',
  'down>left': 'right bottom',
  'up>right': 'right left',
  'up>left': 'right top',
  'right>down': 'right top',
  'right>up': 'right bottom',
  'left>down': 'left top',
  'left>up': 'left bottom',
});

const cornerFor = (a, b) => CORNER_ALIGN[`${a}>${b}`] ?? 'right left';

const AXIS = Object.freeze({ up: 'y', down: 'y', left: 'x', right: 'x' });

/** Every quadrant already spoken for, minus the two elements being joined. */
function blockedQuads(doc, pageId, exclude) {
  const taken = new Map();
  for (const el of elementsOf(doc, pageId)) {
    if (exclude.has(el.id)) continue;
    for (const k of elementClaimed(el)) taken.set(k, el.id);
  }
  return taken;
}

/** Walk a straight leg, collecting every quadrant it would cover. */
function leg(from, dir, steps) {
  const out = [];
  const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
  let { x, y } = from;
  for (let i = 0; i < steps; i++) {
    x += dx; y += dy;
    out.push({ x, y });
  }
  return out;
}

function firstBlocker(points, taken) {
  for (const p of points) {
    const who = taken.get(`${p.x},${p.y}`);
    if (who) return { at: quadToAddress(p.x, p.y), by: who };
  }
  return null;
}

/**
 * Candidate shapes, in the order a person would try them.
 *
 * Each returns the quadrants it covers and the pen program that draws it, so
 * the check and the emitted command can never disagree — they are built from
 * the same numbers.
 */
function candidates(a, b, fromId, fromPort, toId, toPort) {
  const out = [];

  // Intermediate legs are addressed, never counted.
  //
  // Distances live in quadrants but a counted leg is written in CELLS, and the
  // grammar takes whole numbers only — so a run of an odd number of quadrants
  // came out as `left 0.5 line`, which the pen itself refuses. Two boxes of
  // different widths have their port midpoints an odd quadrant apart, which
  // makes that the common case rather than the exotic one.
  //
  // `line to <quadrant address>` carries no number, so it says any run exactly.
  // Counting was the only thing that ever needed the parity to work out.

  // 1. Straight: already on the same track, travelling the right way.
  if (a.x === b.x || a.y === b.y) {
    const dir = a.x === b.x ? (b.y > a.y ? 'down' : 'up') : (b.x > a.x ? 'right' : 'left');
    if (dir === a.facing) {
      const dist = a.x === b.x ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
      out.push({
        turns: 0,
        quads: leg(a, dir, dist),
        program: `pen from ${fromId}.${fromPort}\n${dir} line to ${toId}.${toPort} arrow`,
      });
    }
  }

  // 2. One turn: run out along the source's facing, then in along the target's.
  {
    const inDir = OPPOSITE[b.facing];              // the way the path must arrive
    const outDir = a.facing;
    if (AXIS[outDir] !== AXIS[inDir]) {
      const corner = AXIS[outDir] === 'x' ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
      const run1 = AXIS[outDir] === 'x' ? Math.abs(corner.x - a.x) : Math.abs(corner.y - a.y);
      const run2 = AXIS[inDir] === 'x' ? Math.abs(b.x - corner.x) : Math.abs(b.y - corner.y);
      const goesOut = AXIS[outDir] === 'x' ? (corner.x > a.x ? 'right' : 'left') : (corner.y > a.y ? 'down' : 'up');
      const goesIn = AXIS[inDir] === 'x' ? (b.x > corner.x ? 'right' : 'left') : (b.y > corner.y ? 'down' : 'up');
      if (run1 > 0 && run2 > 0 && goesOut === outDir) {
        const first = leg(a, goesOut, run1);
        const second = leg(corner, goesIn, run2);
        const turn = first[first.length - 1] ?? a;
        out.push({
          turns: 1,
          quads: [...first, ...second],
          program: `pen from ${fromId}.${fromPort}\n${goesOut} line to ${quadToAddress(turn.x, turn.y)}\n`
            + `${goesIn} corner align ${cornerFor(goesOut, goesIn)}\n`
            + `${goesIn} line to ${toId}.${toPort} arrow`,
        });
      }
    }
  }

  // 3. Two turns: out, across the midpoint, back in. The staple Z route.
  {
    const outDir = a.facing;
    const inDir = OPPOSITE[b.facing];
    if (AXIS[outDir] === AXIS[inDir]) {
      const vertical = AXIS[outDir] === 'y';
      const mid = vertical ? Math.round((a.y + b.y) / 4) * 2 : Math.round((a.x + b.x) / 4) * 2;
      const run1 = vertical ? Math.abs(mid - a.y) : Math.abs(mid - a.x);
      const run3 = vertical ? Math.abs(b.y - mid) : Math.abs(b.x - mid);
      const across = vertical ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
      if (run1 > 0 && run3 > 0 && across > 0) {
        const d1 = vertical ? (mid > a.y ? 'down' : 'up') : (mid > a.x ? 'right' : 'left');
        const d2 = vertical ? (b.x > a.x ? 'right' : 'left') : (b.y > a.y ? 'down' : 'up');
        const p1 = leg(a, d1, run1);
        const corner1 = p1[p1.length - 1] ?? a;
        const p2 = leg(corner1, d2, across);
        const corner2 = p2[p2.length - 1] ?? corner1;
        const p3 = leg(corner2, d1, run3);
        out.push({
          turns: 2,
          quads: [...p1, ...p2, ...p3],
          program: `pen from ${fromId}.${fromPort}\n${d1} line to ${quadToAddress(corner1.x, corner1.y)}\n`
            + `${d2} corner align ${cornerFor(d1, d2)}\n`
            + `${d2} line to ${quadToAddress(corner2.x, corner2.y)}\n`
            + `${d1} corner align ${cornerFor(d2, d1)}\n`
            + `${d1} line to ${toId}.${toPort} arrow`,
        });
      }
    }
  }

  return out;
}

/**
 * Propose a connector between two elements.
 *
 * Returns `{ program, turns, clear, blockedBy, tried }`. It never mutates the
 * document — running the program is the caller's decision, and the collision
 * log still has the last word on whatever they run.
 */
export function routeProgram(doc, pageId, from, to) {
  const [fromId, fromPortRaw] = String(from).split('.');
  const [toId, toPortRaw] = String(to).split('.');
  if (!fromPortRaw || !toPortRaw) {
    throw new SyntaxError('route needs faces on both ends, e.g. from "a.S" to "b.N"');
  }
  const fromPort = parsePortSpec(fromPortRaw).name;
  const toPort = parsePortSpec(toPortRaw).name;

  const a = findElement(doc, fromId);
  const b = findElement(doc, toId);
  if (!a) throw new Error(`route: no element "${fromId}"`);
  if (!b) throw new Error(`route: no element "${toId}"`);

  const seatA = approachPoint(a.element.rect, fromPort, a.element.shape, a.element.corner);
  const seatB = approachPoint(b.element.rect, toPort, b.element.shape, b.element.corner);
  const taken = blockedQuads(doc, pageId, new Set([fromId, toId]));

  const tried = [];
  for (const c of candidates(seatA, seatB, fromId, fromPort, toId, toPort)
    .sort((x, y) => x.turns - y.turns)) {
    const blocker = firstBlocker(c.quads, taken);
    tried.push({ turns: c.turns, clear: !blocker, blockedBy: blocker ?? null });
    if (!blocker) {
      return { program: c.program, turns: c.turns, clear: true, blockedBy: null, tried };
    }
  }

  // An honest failure. Naming what is in the way is more useful than a
  // contorted path that avoids it and cannot be read.
  return {
    program: null,
    turns: null,
    clear: false,
    blockedBy: tried.find((t) => t.blockedBy)?.blockedBy ?? null,
    tried,
    note: tried.length
      ? 'No straight, one-turn or two-turn route is clear. Move something, or draw the path by hand — '
        + 'a route with more turns than that is not a connector anyone can follow.'
      : 'These faces cannot be joined by a simple route: they point in directions that never meet.',
  };
}

export { rect };
