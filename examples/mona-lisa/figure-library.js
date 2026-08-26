/**
 * Shared driver for the Mona Lisa set.
 *
 * Five takes on one subject, each exercising a different part of the engine:
 * a flowchart, a cartoon, a colouring-book outline, an abstract, and a
 * sculpture in projection.
 *
 * DRAWN LARGE ON PURPOSE. A quadrant is 5px and every primitive is an integer
 * algorithm, so the only way to get a smoother curve is to give the curve more
 * quadrants to land on — a circle of radius 12 is visibly a staircase, and the
 * same circle at radius 60 reads as a circle. The canvas is unbounded, so
 * "draw big, then let the page scale it down" costs nothing but arithmetic.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createSession, createTools } from '../../src/mcp/tools.js';

const here = dirname(fileURLToPath(import.meta.url));
export const project = resolve(here, '..', '..');
export const quiet = process.argv.includes('--quiet');
export const say = (...a) => { if (!quiet) console.log(...a); };

export function driver() {
  const session = createSession({ cwd: project });
  const tools = Object.fromEntries(createTools(session).map((t) => [t.name, t]));
  // Every MCP tool reports failure as TEXT, so a driver that does not inspect
  // the string sees success. `route` is the sharp case: it answers "no clear
  // route", which a careless /clear/ test reads as a win.
  const call = async (name, args) => {
    const r = await tools[name].handler(args ?? {});
    const text = typeof r === 'string' ? r : (r?.text ?? JSON.stringify(r));
    if (/^error:/i.test(text) || r?.isError) throw new Error(`${name}: ${text}`);
    return text;
  };
  return { session, call, asJson: async (n, a) => JSON.parse(await call(n, a)) };
}

/** 0 -> A, 25 -> Z, 26 -> AA. Cell columns, as the address grammar spells them. */
export const col = (n) => {
  let s = '';
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** A quadrant address from absolute quadrant coordinates. */
export const q = (x, y) =>
  `${col(Math.floor(x / 2))}${Math.floor(y / 2) + 1}.q${(y % 2) * 2 + (x % 2) + 1}`;

/** A cell address from cell coordinates. */
export const cell = (cx, cy) => `${col(cx)}${cy}`;

/**
 * Validate, adjudicate, save, render.
 *
 * `reasons` maps a rule to a written sentence about THIS drawing. A reason that
 * only restated the rule code is refused by the engine, and rightly — "C001" is
 * not an argument for anything.
 */
export async function finish(call, asJson, slug, title, reasons = {}) {
  // The engine refuses one reason spread past fifteen findings, and it is right
  // to: a drawing whose overlaps run into the dozens is telling you something
  // about the drawing. So accept up to the limit and leave the rest OPEN and
  // counted, rather than inventing fifteen paraphrases of the same sentence.
  const REUSE_LIMIT = 15;
  const v = await asJson('validate', { format: 'json' });
  const used = {};
  const unjudged = {};
  for (const f of v.open ?? []) {
    const reason = reasons[f.rule];
    if (!reason) continue;
    if ((used[f.rule] ?? 0) >= REUSE_LIMIT) { unjudged[f.rule] = (unjudged[f.rule] ?? 0) + 1; continue; }
    await call('accept_finding', { fingerprint: f.fingerprint, reason });
    used[f.rule] = (used[f.rule] ?? 0) + 1;
  }

  const after = await asJson('validate', { format: 'json' });
  const blocking = (after.open ?? []).filter((f) => f.severity === 'S0' || f.severity === 'S1');
  await call('save', { force: true });
  const rendered = await call('render', { path: `diagrams/mona/${slug}.svg`, showGrid: false, force: true });

  const spill = Object.entries(unjudged).map(([r, n]) => `${r}x${n}`).join(' ');
  say(`${title}: ${(after.open ?? []).length} open (${blocking.length} blocking), `
    + `${(after.accepted ?? []).length} accepted`
    + (spill ? ` — past the reuse limit, left open: ${spill}` : ''));
  for (const f of blocking.slice(0, 6)) say(`   ${f.rule} ${f.message.slice(0, 120)}`);
  say(`   ${rendered.split('\n')[0]}`);
  return blocking.length;
}

/**
 * Points on an ellipse, in absolute quadrants, ready to feed `polygon`.
 *
 * The lattice has circles and arcs but no ellipse, and a face is not a circle.
 * A polygon of enough points IS the ellipse at this resolution — which is the
 * whole argument for drawing large: at r=60 quadrants a 28-gon has a vertex
 * every ~13 quadrants and reads as a smooth curve, while at r=12 the same
 * 28-gon is a visible polygon. Detail is bought with quadrants, not cleverness.
 */
export function ellipse(cx, cy, rx, ry, n = 28, rotDeg = 0) {
  const rot = (rotDeg * Math.PI) / 180;
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    pts.push({
      x: Math.round(cx + ex * Math.cos(rot) - ey * Math.sin(rot)),
      y: Math.round(cy + ex * Math.sin(rot) + ey * Math.cos(rot)),
    });
  }
  return pts;
}

/** A `polygon` command over absolute quadrant points. */
export const polygonOf = (pts) => `polygon ${pts.map((p) => q(p.x, p.y)).join(' ')}`;

/** An open run of straight segments — a polyline the lattice draws as rays. */
export function polylineOf(pts) {
  const out = [`pen ${q(pts[0].x, pts[0].y)}`];
  for (let i = 1; i < pts.length; i += 1) out.push(`ray to ${q(pts[i].x, pts[i].y)}`);
  return out.join('\n');
}

/**
 * A curve through control points, sampled as a quadratic through each triple.
 * Hair, veils and drapery are not made of straight lines, and a ray between
 * every pair would read as a folded ribbon.
 */
export function curveOf(pts, steps = 10) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      // Catmull-Rom, rounded to the lattice: the sampling is continuous, the
      // ink is not, and the engine only ever sees whole quadrants.
      out.push({
        x: Math.round(0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t
          + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
          + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)),
        y: Math.round(0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t
          + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
          + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)),
      });
    }
  }
  out.push(pts[pts.length - 1]);
  // Collapse repeats so the pen is never asked to travel nowhere.
  return out.filter((p, i) => i === 0 || p.x !== out[i - 1].x || p.y !== out[i - 1].y);
}

/**
 * Break a polyline into the runs that fall OUTSIDE a silhouette.
 *
 * Without fills, a landscape drawn behind a figure runs straight across her
 * face — the horizon in the first colouring page cut her at eye level. There
 * is no z-buffer and no white shape to hide behind, so "behind" has to be made
 * true by not drawing the part that would be hidden.
 *
 * `inside(p)` answers whether a point is covered by the figure.
 */
export function clipOutside(pts, inside) {
  const runs = [];
  let run = [];
  for (const p of pts) {
    if (inside(p)) {
      if (run.length > 1) runs.push(run);
      run = [];
    } else {
      run.push(p);
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

/** Is a point inside a polygon? Standard ray crossing, on integer quadrants. */
export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y)
      && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Fill a polygon with hatch runs, because the lattice has no closed-path fill.
 *
 * `polygon` claims the quadrants of its outline and nothing inside it, so a
 * toned polygon is a toned OUTLINE — the first abstract sheet asked for planes
 * of tone and got dotted rectangles. Scanning the interior and emitting one run
 * per row is how a region actually becomes mass here.
 *
 * Returns pen programs, not ink: the caller decides colour, width and density,
 * and `spacing` is the real tone control — wider rows read lighter.
 */
export function hatchFill(poly, { spacing = 6, inset = 0 } = {}) {
  const ys = poly.map((p) => p.y);
  const xs = poly.map((p) => p.x);
  const y0 = Math.min(...ys) + inset;
  const y1 = Math.max(...ys) - inset;
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);

  const programs = [];
  for (let y = y0; y <= y1; y += spacing) {
    let run = null;
    for (let x = x0; x <= x1; x += 1) {
      if (pointInPolygon({ x, y }, poly)) {
        if (!run) run = { x0: x, x1: x };
        else run.x1 = x;
      } else if (run) {
        if (run.x1 - run.x0 >= 2) programs.push(`pen ${q(run.x0, y)}\nray to ${q(run.x1, y)}`);
        run = null;
      }
    }
    if (run && run.x1 - run.x0 >= 2) programs.push(`pen ${q(run.x0, y)}\nray to ${q(run.x1, y)}`);
  }
  return programs;
}
