/**
 * Wireframe — a dimensioned area, equipment placed in it to scale, and a brief
 * an image model can actually follow.
 *
 * The driving case is an HVAC layout: a mechanical room or roof of known size,
 * with units of known footprint that need service clearance around them. Two
 * things follow from that, and they are what make this different from a generic
 * "describe a picture" helper:
 *
 *   1. REAL UNITS. Everything is authored in inches and converted to quadrants
 *      at a declared scale. A layout whose dimensions are approximate is worse
 *      than no layout, because it looks authoritative.
 *
 *   2. CLEARANCE IS GEOMETRY. Service clearance is not an annotation, it is a
 *      rectangle that nothing else may occupy. Modelled as a real footprint, it
 *      collides through the ordinary engine, so a unit placed too near a wall
 *      or another unit reports as a defect rather than needing a human to spot
 *      it.
 *
 * The engine never silently adjusts geometry, so conversion drift is REPORTED
 * rather than swallowed: an item whose true size does not land on a whole
 * quadrant says so, with the error in inches.
 *
 * This module supplies no clearance values of its own. Required clearances come
 * from the equipment's listing and the governing code, and inventing plausible
 * numbers would be worse than having none — the caller passes them in.
 */

export const LAYOUTS = Object.freeze(['rows', 'columns', 'grid', 'explicit']);

/** A scale is quadrants per foot. 2 -> one quadrant is 6", 4 -> 3". */
export const SCALES = Object.freeze({
  '1/4in=1ft': 2,   // one quadrant = 6 inches
  '1/2in=1ft': 4,   // one quadrant = 3 inches
  '1in=1ft': 8,     // one quadrant = 1.5 inches
});

export function quadrantsPerInch(scale) {
  if (typeof scale === 'number') {
    if (!(scale > 0)) throw new RangeError(`scale must be a positive number of quadrants per foot — got ${scale}`);
    return scale / 12;
  }
  const q = SCALES[scale];
  if (!q) throw new SyntaxError(`unknown scale ${JSON.stringify(scale)} — expected a number, or one of ${Object.keys(SCALES).join(', ')}`);
  return q / 12;
}

/**
 * Convert inches to whole quadrants, reporting what the rounding cost.
 *
 * Returned rather than thrown: a 3/8" drift on a 20' wall is usually fine and a
 * 3/8" drift on a 4" clearance is not, and only the caller knows which. Hiding
 * it is the one option that is never right.
 */
export function toQuadrants(inches, qpi) {
  if (typeof inches !== 'number' || !Number.isFinite(inches) || inches <= 0) {
    throw new RangeError(`a dimension must be a positive number of inches — got ${JSON.stringify(inches)}`);
  }
  const exact = inches * qpi;
  const whole = Math.max(1, Math.round(exact));
  return { quadrants: whole, driftInches: round2((whole - exact) / qpi) };
}

const round2 = (v) => Math.round(v * 100) / 100;

/** Feet-and-inches for display: 90 -> 7'-6". */
export function feetInches(inches) {
  const sign = inches < 0 ? '-' : '';
  const t = Math.abs(inches);
  const ft = Math.floor(t / 12);
  const inch = round2(t - ft * 12);
  return `${sign}${ft}'-${inch}"`;
}

/**
 * Place equipment in an area, at scale, with clearance.
 *
 * Each item: { id, widthIn, depthIn, atXIn, atYIn, clearanceIn?, describe? }
 * Coordinates are inches from the area's top-left corner.
 */
export function layout(area, items, { scale = 2, origin = { x: 2, y: 2 } } = {}) {
  const qpi = quadrantsPerInch(scale);
  const w = toQuadrants(area.widthIn, qpi);
  const d = toQuadrants(area.depthIn, qpi);

  const placed = [];
  const drift = [];
  if (w.driftInches) drift.push(`area width off by ${w.driftInches}"`);
  if (d.driftInches) drift.push(`area depth off by ${d.driftInches}"`);

  for (const it of items) {
    const iw = toQuadrants(it.widthIn, qpi);
    const id_ = toQuadrants(it.depthIn, qpi);
    const x = origin.x + Math.round(it.atXIn * qpi);
    const y = origin.y + Math.round(it.atYIn * qpi);
    for (const [what, r] of [['width', iw], ['depth', id_]]) {
      if (r.driftInches) drift.push(`${it.id} ${what} off by ${r.driftInches}"`);
    }

    const entry = {
      id: it.id,
      rect: { x, y, w: iw.quadrants, h: id_.quadrants },
      describe: it.describe ?? '',
      widthIn: it.widthIn,
      depthIn: it.depthIn,
      atXIn: it.atXIn,
      atYIn: it.atYIn,
    };

    // Clearance is real geometry, not a note — but it must be drawn as a RING
    // rather than a filled rectangle. A filled clearance would swallow the unit
    // it belongs to and report a collision with itself; four bands surround the
    // unit without touching it, so the only thing that can collide with a band
    // is something that has genuinely encroached.
    if (it.clearanceIn) {
      const c = Math.round(it.clearanceIn * qpi);
      const { w: uw, h: uh } = entry.rect;
      entry.clearance = {
        inches: it.clearanceIn,
        quadrants: c,
        bands: [
          { id: `${it.id}_clr_n`, rect: { x: x - c, y: y - c, w: uw + 2 * c, h: c } },
          { id: `${it.id}_clr_s`, rect: { x: x - c, y: y + uh, w: uw + 2 * c, h: c } },
          { id: `${it.id}_clr_w`, rect: { x: x - c, y, w: c, h: uh } },
          { id: `${it.id}_clr_e`, rect: { x: x + uw, y, w: c, h: uh } },
        ],
      };
    }
    placed.push(entry);
  }

  return {
    scale,
    quadrantsPerInch: qpi,
    area: { rect: { x: origin.x, y: origin.y, w: w.quadrants, h: d.quadrants }, ...area },
    items: placed,
    drift,
  };
}

/**
 * Brief for an image model.
 *
 * Both kinds of model are served: one that accepts regional conditioning reads
 * the normalised boxes, one that only reads prose gets the same arrangement
 * stated in feet and inches and in plain position words.
 */
export function toPrompt(plan, { style = null, subject = null, view = 'plan' } = {}) {
  const a = plan.area.rect;
  const nx = (q) => clamp01((q - a.x) / a.w);
  const ny = (q) => clamp01((q - a.y) / a.h);
  const p3 = (v) => v.toFixed(3);

  const out = [];
  out.push(subject
    ? subject.trim()
    : `A ${view} view of a ${feetInches(plan.area.widthIn)} by ${feetInches(plan.area.depthIn)} area.`);
  out.push('');
  out.push(`AREA        ${feetInches(plan.area.widthIn)} wide x ${feetInches(plan.area.depthIn)} deep`);
  out.push(`VIEW        ${view}${view === 'plan' ? ' (looking straight down, no perspective)' : ''}`);
  out.push(`SCALE       ${typeof plan.scale === 'number' ? `${plan.scale} quadrants per foot` : plan.scale}`);
  out.push('');
  out.push('EQUIPMENT — normalised x0,y0,x1,y1 within the area, origin top-left.');
  out.push('Draw each item INSIDE its box, at the stated size, and nowhere else.');
  out.push('');

  const pad = Math.max(...plan.items.map((i) => i.id.length), 8);
  for (const it of plan.items) {
    const r = it.rect;
    const box = [nx(r.x), ny(r.y), nx(r.x + r.w), ny(r.y + r.h)].map(p3).join(',');
    out.push(`  ${it.id.padEnd(pad)}  ${box}   ${feetInches(it.widthIn)} x ${feetInches(it.depthIn)}  ${where(it, a)}`);
    if (it.describe) out.push(`  ${' '.repeat(pad)}  ${it.describe}`);
    if (it.clearance) {
      out.push(`  ${' '.repeat(pad)}  clearance ${feetInches(it.clearance.inches)} on all sides — keep this band empty`);
    }
    out.push('');
  }

  if (style) out.push(`STYLE: ${style.trim()}`, '');
  out.push('Hold the proportions: the boxes are to scale against the area, so an');
  out.push('item drawn larger than its box is drawn at the wrong size. Do not add');
  out.push('equipment that is not listed, and leave the clearance bands clear.');
  return out.join('\n');
}

function where(it, area) {
  const cx = (it.rect.x + it.rect.w / 2 - area.x) / area.w;
  const cy = (it.rect.y + it.rect.h / 2 - area.y) / area.h;
  const band = cy < 0.34 ? 'top' : cy > 0.66 ? 'bottom' : 'middle';
  const side = cx < 0.34 ? 'left' : cx > 0.66 ? 'right' : 'centre';
  return band === 'middle' && side === 'centre' ? 'centre' : `${band} ${side}`;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));


/**
 * Every rectangle the plan needs drawn, ready for place_box.
 *
 * Clearance bands come back as ordinary boxes so they collide through the
 * ordinary engine. Nothing here is special-cased in the collision rules — an
 * encroachment reports as the L001 it actually is.
 */
export function boxes(plan, { includeClearance = true, wallQuads = 1 } = {}) {
  // The area is drawn as WALLS, not as a filled rectangle. A filled area would
  // overlap every single thing standing in it and report the room itself as a
  // collision — the same mistake as a filled clearance, one level up. Walls also
  // happen to be what a plan actually shows, and equipment touching one is then
  // a real finding rather than noise.
  const a = plan.area.rect;
  const t = Math.max(1, wallQuads);
  const out = [
    { id: 'wall_n', rect: { x: a.x - t, y: a.y - t, w: a.w + 2 * t, h: t }, label: '', kind: 'wall' },
    { id: 'wall_s', rect: { x: a.x - t, y: a.y + a.h, w: a.w + 2 * t, h: t }, label: '', kind: 'wall' },
    { id: 'wall_w', rect: { x: a.x - t, y: a.y, w: t, h: a.h }, label: '', kind: 'wall' },
    { id: 'wall_e', rect: { x: a.x + a.w, y: a.y, w: t, h: a.h }, label: '', kind: 'wall' },
  ];
  for (const it of plan.items) {
    out.push({ id: it.id, rect: it.rect, label: it.id, kind: 'equipment' });
    if (includeClearance && it.clearance) {
      for (const b of it.clearance.bands) out.push({ ...b, label: '', kind: 'clearance' });
    }
  }
  return out;
}
