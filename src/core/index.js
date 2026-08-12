/**
 * TurtlePen core — public surface.
 *
 * The plan -> validate -> adjudicate cycle lives here: a pen program is applied
 * to a page, the whole composition is then validated as a unit, and findings
 * the AI judges to be deliberate are accepted by fingerprint. Nothing in this
 * layer ever silently adjusts geometry.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import * as geometry from './geometry.js';
import * as address from './address.js';
import * as text from './text.js';
import * as shapes from './shapes.js';
import * as occupancy from './occupancy.js';
import * as image from './image.js';
import * as png from './png.js';
import * as dither from './dither.js';
import * as tone_ from './tone.js';

import { createDocument, addPage, addBox, addPath, addText, addImage, removeElement, moveElement, findElement, elementsOf, elementClaimed, serialize, deserialize, contentBounds, getPage, updatePage, removePage, renameElement, MIN_OPACITY, DEFAULT_PAGE_OPACITY, PATH_ROLES, PATH_PAINTS, TEXT_ALIGNS, IMAGE_FITS, assertOpacity, normalizeStroke, normalizeColor, assertTextAlign } from './document.js';
import { runPen } from './pen.js';
import { validate, formatLog, fingerprintOf, RULES, SEVERITIES, SEVERITY_LABEL } from './collide.js';
import { renderAscii } from './ascii.js';
import { renderSvg } from './svg.js';

export { geometry, address, text, shapes, occupancy, image, png, dither };
export { tone_ as tone };
export {
  createDocument, addPage, addBox, addText, addImage, removeElement, moveElement, findElement,
  elementsOf, elementClaimed, serialize, deserialize, contentBounds, getPage, updatePage, removePage, renameElement,
  runPen, validate, formatLog, fingerprintOf, RULES, SEVERITIES, SEVERITY_LABEL,
  renderAscii, renderSvg,
  MIN_OPACITY, DEFAULT_PAGE_OPACITY, PATH_ROLES, PATH_PAINTS, TEXT_ALIGNS, IMAGE_FITS, assertOpacity, normalizeStroke, normalizeColor, assertTextAlign,
};
export { PALETTE, PALETTE_DARK, SEVERITY_CUE } from './svg.js';

/**
 * Apply a pen program to a page, creating a path element plus any boxes or
 * text the program declared.
 *
 * @returns {{path:object|null, boxes:Array, texts:Array, trace:Array, notes:Array, cursor:object, facing:string}}
 */
/**
 * The free span on the axis perpendicular to travel, containing `perp`.
 *
 * This is what makes `align center` answerable: a stroke cannot be centred in
 * its own cell, but it can be centred in the gap between whatever is either
 * side of it. Scanning stops at the first claimed quadrant in each direction,
 * so the corridor is bounded by real content rather than by a guess.
 */
export function corridorAt(doc, pageId, axis, along, perp, limit = 400) {
  const index = occupancy.buildIndex(doc, pageId);
  const taken = (p) => index.has(axis === 'v' ? `${p},${along}` : `${along},${p}`);
  if (taken(perp)) return null; // the cursor is already inside something

  let min = perp, max = perp;
  while (min - 1 >= 0 && !taken(min - 1) && perp - min < limit) min -= 1;
  while (!taken(max + 1) && max - perp < limit) max += 1;
  // An unbounded corridor has no middle to speak of.
  if (perp - min >= limit || max - perp >= limit) return null;
  return { min, max };
}

/**
 * Did this trace come back to where it began?
 *
 * Adjacent counts as closed, not just identical: a pen walking an outline ends
 * one quadrant away from its start as often as it lands exactly on it, and both
 * read to a human as a finished loop.
 */
export function isClosedPath(pieces) {
  if (!pieces || pieces.length < 4) return false;
  const a = pieces[0], b = pieces[pieces.length - 1];
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

export function applyPen(doc, pageId, program, options = {}) {
  // A pen program can add multiple elements. Rehearse on a clone first so a
  // duplicate id or malformed later element cannot leak an earlier element
  // into the live document.
  const draft = structuredClone(doc);
  const result = applyPenMutable(draft, pageId, program, options);
  doc.pages = draft.pages;
  doc.elements = draft.elements;
  return result;
}

function applyPenMutable(doc, pageId, program, { id = null, role = 'connector', stroke = null, color = null, width = null, cap = null, paint = null, tone = null, feather = null, texture = null } = {}) {
  getPage(doc, pageId);
  const result = runPen(program, {
    resolveElement: (name) => findElement(doc, name)?.element ?? null,
    corridorAt: (axis, along, perp) => corridorAt(doc, pageId, axis, along, perp),
  });

  const boxes = result.boxes.map((b, i) =>
    addBox(doc, pageId, {
      id: b.id ?? nextId(doc, 'box', i),
      rect: b.rect,
      label: b.label,
      corner: b.corner,
      fontSize: b.fontSize ?? doc.font.size,
      fill: b.fill,
    }),
  );
  const texts = result.texts.map((t, i) =>
    addText(doc, pageId, {
      id: t.id ?? nextId(doc, 'text', i), rect: t.rect, text: t.text,
      fontSize: t.fontSize ?? doc.font.size, align: t.align, color: t.color, weight: t.weight ?? 400,
    }),
  );

  let path = null;
  if (result.pieces.length) {
    const presentation = stroke ?? (color != null || width != null || cap != null || paint != null
      || tone != null || feather != null || texture != null
      ? {
        color: color ?? undefined, width: width ?? undefined, cap: cap ?? undefined, paint: paint ?? undefined,
        tone: tone ?? undefined, feather: feather ?? undefined, texture: texture ?? undefined,
      }
      : null);
    const pathId = id ?? nextId(doc, 'path', 0);
    // Tone filters the PIECES, and a piece is one quadrant. Everything
    // downstream — elementClaimed, elementRects, the SVG emitter, the ASCII
    // view — derives from this array, so a 50% shape claims exactly its 50%
    // without the collision engine needing to know tone exists at all.
    const pieces = presentation
      ? tone_.toneMask(result.pieces, {
        tone: presentation.tone ?? 1,
        feather: presentation.feather ?? 0,
        texture: presentation.texture ?? null,
        seed: pathId,
      })
      : result.pieces;
    if (!pieces.length) {
      throw new RangeError(
        `tone left "${pathId}" with no inked quadrants — raise the tone, reduce the feather, or drop the texture`,
      );
    }
    path = addPath(doc, pageId, { id: pathId, pieces, role, stroke: presentation });
    // A shape is not a connector. If the trace comes back to where it started,
    // say so — the rules about loose ends and retraced quadrants are about
    // connectors, and applying them to an outline is how a rule cries wolf.
    if (isClosedPath(result.pieces)) path.closed = true;
    const notes = result.notes.filter((n) => !((path.closed || role === 'artwork') && n.code === 'L015'));
    if (notes.length) path.penNotes = notes;
    // Remembering where the pen stopped is what makes a path resumable.
    path.end = { x: result.cursor.x, y: result.cursor.y, facing: result.facing };
    // What the path was aiming at, so validation can check it actually arrived.
    if (result.targets.length) path.targets = result.targets;
  }

  const notes = role === 'artwork' ? result.notes.filter((n) => n.code !== 'L015') : result.notes;
  return { path, boxes, texts, trace: result.trace, notes, cursor: result.cursor, facing: result.facing };
}

/**
 * Continue an existing path from where its pen stopped.
 *
 * Without this the only way to correct a connector is to delete and redraw it,
 * which loses the id and any acceptances attached to findings about it.
 */
export function extendPath(doc, id, program) {
  const found = findElement(doc, id);
  if (!found) throw new Error(`no path "${id}" to extend`);
  const path = found.element;
  if (path.kind !== 'path') throw new Error(`"${id}" is a ${path.kind}, not a path`);
  if (!path.end) throw new Error(`path "${id}" has no recorded end state; redraw it with replace_path instead`);

  const result = runPen(program, {
    start: path.end,
    resolveElement: (name) => findElement(doc, name)?.element ?? null,
  });
  if (result.boxes.length || result.texts.length) {
    throw new Error('extend_path draws strokes only — place boxes and text with their own operations');
  }

  path.pieces.push(...result.pieces);
  path.end = { x: result.cursor.x, y: result.cursor.y, facing: result.facing };
  if (result.notes.length) path.penNotes = [...(path.penNotes ?? []), ...result.notes];
  if (result.targets.length) path.targets = [...(path.targets ?? []), ...result.targets];

  return { path, page: found.page, trace: result.trace, notes: result.notes, cursor: result.cursor, facing: result.facing };
}

/** Redraw a path from scratch, keeping its id and its position in draw order. */
export function replacePath(doc, id, program) {
  const found = findElement(doc, id);
  if (!found) throw new Error(`no path "${id}" to replace`);
  if (found.element.kind !== 'path') throw new Error(`"${id}" is a ${found.element.kind}, not a path`);

  const original = found.element;
  const list = doc.elements[found.page];
  const index = list.findIndex((e) => e.id === id);
  const draft = structuredClone(doc);
  const draftList = draft.elements[found.page];
  draftList.splice(index, 1);

  const result = applyPen(draft, found.page, program, { id, role: original.role ?? 'connector', stroke: original.stroke });
  if (!result.path) throw new Error(`the replacement program for "${id}" drew no strokes`);

  // Restore the original draw order so stacking within the page is unchanged.
  const committedList = draft.elements[found.page];
  committedList.splice(committedList.indexOf(result.path), 1);
  committedList.splice(index, 0, result.path);
  doc.pages = draft.pages;
  doc.elements = draft.elements;

  return { path: result.path, page: found.page, trace: result.trace, notes: result.notes };
}

/**
 * Resize a box by cell span, keeping one corner pinned.
 *
 * This is the tool behind the `widen` and `heighten` fixes the text-fit rules
 * emit; it re-measures and hands back the new fit report.
 */
export function resizeBox(doc, id, { cellsW = null, cellsH = null, anchor = 'tl' } = {}) {
  const found = findElement(doc, id);
  if (!found) throw new Error(`no element "${id}" to resize`);
  const el = found.element;
  if (el.kind === 'path') throw new Error(`"${id}" is a path — change it with extend_path or replace_path`);

  const w = cellsW == null ? el.rect.w : cellsW * 2;
  const h = cellsH == null ? el.rect.h : cellsH * 2;
  const dw = w - el.rect.w;
  const dh = h - el.rect.h;
  const [ax, ay] = address.PINS[anchor] ?? address.PINS.tl;
  const r = address.assertOnGrid(
    geometry.rect(el.rect.x - (ax * dw) / 2, el.rect.y - (ay * dh) / 2, w, h),
    `resized "${id}"`,
  );
  el.rect = r;
  return { element: el, page: found.page, fit: el.label ? text.fitReport(el.label, r, { fontSize: el.fontSize, paddingQuads: doc.font.paddingQuads, align: el.align }) : null };
}

/** Move an element so the named pin of its bounding box lands on an address. */
export function moveElementTo(doc, id, at, pin = 'tl') {
  const found = findElement(doc, id);
  if (!found) throw new Error(`no element "${id}" to move`);
  const el = found.element;
  const bounds = el.kind === 'path' ? geometry.boundsOf(el.pieces.map((p) => geometry.rect(p.x, p.y, 1, 1))) : el.rect;
  const a = address.parseAddress(at);
  const p = address.pinPoint(a);
  const [px, py] = a.kind === 'pin' ? address.PINS[a.part] : address.PINS[pin];
  const target = { x: p.x - (px * bounds.w) / 2, y: p.y - (py * bounds.h) / 2 };
  address.assertOnGrid(geometry.rect(target.x, target.y, bounds.w, bounds.h), `moved "${id}"`);
  return moveElement(doc, id, target.x - bounds.x, target.y - bounds.y);
}

/** Change a box's label or styling, re-measuring the label as it goes. */
export function restyleBox(doc, id, { label = null, corner = null, align = null, fontSize = null, fill = null } = {}) {
  const found = findElement(doc, id);
  if (!found) throw new Error(`no element "${id}" to restyle`);
  const el = found.element;
  if (el.kind === 'path') throw new Error(`"${id}" is a path and carries no label`);
  if (el.kind === 'image') throw new Error(`"${id}" is an image — restyle changes box or text presentation only`);
  if (el.kind === 'text' && (corner != null || fill != null)) throw new Error(`"${id}" is text — corner and fill apply to boxes only`);
  // Validate the whole request before touching the element. A repair operation
  // is as atomic as a plan even when called directly.
  const nextCorner = corner != null ? shapes.assertCornerStyle(corner) : null;
  const nextAlign = align != null ? assertTextAlign(align) : null;
  const nextFontSize = fontSize != null ? text.resolveFontSize(fontSize) : null;
  const nextFill = fill != null ? normalizeColor(fill, 'box fill') : null;
  if (label != null) el.kind === 'text' ? (el.text = label) : (el.label = label);
  if (nextCorner != null) el.corner = nextCorner;
  if (nextAlign != null) el.align = nextAlign;
  if (nextFontSize != null) el.fontSize = nextFontSize;
  if (nextFill != null) el.fill = nextFill;
  const content = el.kind === 'text' ? el.text : el.label;
  return { element: el, page: found.page, fit: content ? text.fitReport(content, el.rect, { fontSize: el.fontSize, paddingQuads: doc.font.paddingQuads, align: el.align }) : null };
}

export function setCanvas(doc, cols, rows) {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new RangeError(`canvas must be whole positive cell counts, got ${cols}x${rows}`);
  }
  doc.canvas = { cols, rows };
  return doc.canvas;
}

function nextId(doc, prefix, offset) {
  let n = 1 + offset;
  while (findElement(doc, `${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/**
 * Cell spans may be written either way — "12x5" or { w: 12, h: 5 }.
 *
 * Normalising here rather than in the tool layer is deliberate: an operation
 * must mean the same thing whether it is called directly, invoked as a tool, or
 * rehearsed inside a plan. Parsing in only one of those paths is how the same
 * operation ends up with two incompatible signatures.
 */
export function normalizeSpan(span, what = 'span') {
  if (span && typeof span === 'object' && Number.isFinite(span.w) && Number.isFinite(span.h)) {
    if (span.w < 1 || span.h < 1) throw new RangeError(`${what} must be at least 1x1 cells, got ${span.w}x${span.h}`);
    return { w: span.w, h: span.h };
  }
  const m = /^(\d+)x(\d+)$/i.exec(String(span ?? '').trim());
  if (!m) throw new SyntaxError(`${what} must look like "12x5" or { w: 12, h: 5 } (cells), got ${JSON.stringify(span)}`);
  const w = Number(m[1]), h = Number(m[2]);
  if (w < 1 || h < 1) throw new RangeError(`${what} must be at least 1x1 cells, got "${span}"`);
  return { w, h };
}

/** Place a single box by address and cell span — the non-pen path to a node. */
export function placeBox(doc, pageId, { id, at, span, label = '', corner = 'square', align = 'left', fontSize = null, fill = null, opacity = null, state = null }) {
  const cells = normalizeSpan(span, `span for "${id}"`);
  const a = address.parseAddress(at);
  const p = address.pinPoint(a);
  const w = cells.w * 2, h = cells.h * 2;
  const [px, py] = a.kind === 'pin' ? address.PINS[a.part] : [0, 0];
  const r = address.assertOnGrid(geometry.rect(p.x - (px * w) / 2, p.y - (py * h) / 2, w, h), `box "${id}" pinned at ${at}`);
  return addBox(doc, pageId, { id, rect: r, label, corner, align, fontSize, fill, opacity, state });
}

/**
 * Record a finding as deliberate. Acceptance is keyed to the fingerprint, which
 * encodes the exact geometry — so if anything moves, the acceptance lapses and
 * the finding reappears rather than staying silently suppressed.
 */
/**
 * Place an image at a measured footprint.
 *
 * The span is the author's decision, as it is for a box — but `measure_image`
 * exists so that decision is made from the picture's real dimensions instead of
 * from a guess, and the drift that whole cells impose is on the record.
 */
export function placeImage(doc, pageId, { id, at, span, source, mode = 'embed', fit = 'contain', opacity = null }) {
  if (!source) throw new SyntaxError(`image "${id}" needs a source — a data: URI or a path already read into one`);
  image.assertMode(mode);
  const cells = normalizeSpan(span, `span for "${id}"`);
  const a = address.parseAddress(at);
  const p = address.pinPoint(a);
  const w = cells.w * 2, h = cells.h * 2;
  const [px, py] = a.kind === 'pin' ? address.PINS[a.part] : [0, 0];
  const r = address.assertOnGrid(geometry.rect(p.x - (px * w) / 2, p.y - (py * h) / 2, w, h), `image "${id}" pinned at ${at}`);
  // Dithering happens HERE, at placement, not at render time. The quadrant grid
  // becomes part of the document, so re-rendering an old file cannot drift from
  // what its author saw — the same reason measurement precedes placement.
  let runs = null;
  if (mode === 'dither') {
    const inline = image.bytesOfDataUri(source);
    if (!inline) throw new SyntaxError(`image "${id}" cannot be dithered from "${String(source).slice(0, 40)}" — dithering needs the bytes, so pass a data: URI`);
    const grid = dither.ditherToQuadrants(png.decode(inline.bytes), r.w, r.h);
    runs = dither.runsOf(grid);
  }
  return addImage(doc, pageId, { id, rect: r, source, mode, fit, opacity, runs });
}

/**
 * Lay a reference image UNDER the drawing, to trace over.
 *
 * This is how illustrators actually work, and the engine already had every
 * piece: dither the reference onto the lattice so it is made of the same
 * quadrants you will draw in, put it on a page below the base at low opacity,
 * then draw on top and delete the layer.
 *
 * The page is flagged so `L020` can remind you it is still there. Scaffolding
 * that ships is worse than no scaffolding — this is the one thing the workflow
 * needs the engine to remember for you.
 */
export const REFERENCE_OPACITY = 0.25;

export function placeReference(doc, { id = 'reference', source, at = 'A1.tl', span, opacity = REFERENCE_OPACITY, mode = 'dither' }) {
  if (!source) throw new SyntaxError('a reference needs an image source — a data: URI, or a path the tool layer has already read');
  const draft = structuredClone(doc);
  const lowest = draft.pages.reduce((m, p) => Math.min(m, p.z), 0);
  const page = addPage(draft, { id, z: lowest - 1, intent: 'overlay', title: `${id} (tracing reference)`, opacity, reference: true });
  placeImage(draft, id, { id: `${id}-image`, at, span, source, mode });
  doc.pages = draft.pages;
  doc.elements = draft.elements;
  return page;
}

export function acceptFinding(doc, fingerprint, reason) {
  if (!reason || !String(reason).trim()) throw new Error('accepting a finding requires a reason — an unexplained acceptance is indistinguishable from a missed defect');
  const existing = doc.acceptances.find((a) => a.fingerprint === fingerprint);
  if (existing) {
    existing.reason = reason;
    existing.acceptedAt = new Date().toISOString();
    return existing;
  }
  const entry = { fingerprint, reason, acceptedAt: new Date().toISOString() };
  doc.acceptances.push(entry);
  return entry;
}

export function unacceptFinding(doc, fingerprint) {
  const i = doc.acceptances.findIndex((a) => a.fingerprint === fingerprint);
  if (i < 0) return false;
  doc.acceptances.splice(i, 1);
  return true;
}

// ---------------------------------------------------------------------------
// Operations and planning
// ---------------------------------------------------------------------------

/**
 * Every mutating operation, behind one dispatch.
 *
 * Having a single named vocabulary is what makes dry-running possible: the same
 * operations can be applied to a throwaway clone and validated before anything
 * is committed. It also keeps the tool surface and the batch surface honest —
 * they cannot drift apart because they run the same code.
 */
export const OPERATIONS = Object.freeze({
  add_page: (doc, a) => addPage(doc, a),
  update_page: (doc, a) => updatePage(doc, a.id, a),
  remove_page: (doc, a) => removePage(doc, a.id),
  place_box: (doc, a) => placeBox(doc, a.page ?? 'base', a),
  place_image: (doc, a) => placeImage(doc, a.page ?? 'base', a),
  place_reference: (doc, a) => placeReference(doc, a),
  pen: (doc, a) => applyPen(doc, a.page ?? 'base', a.program, {
    id: a.id, role: a.role, stroke: a.stroke, color: a.color, width: a.width, cap: a.cap, paint: a.paint,
    tone: a.tone, feather: a.feather, texture: a.texture,
  }),
  extend_path: (doc, a) => extendPath(doc, a.id, a.program),
  replace_path: (doc, a) => replacePath(doc, a.id, a.program),
  resize: (doc, a) => resizeBox(doc, a.id, a),
  restyle: (doc, a) => restyleBox(doc, a.id, a),
  move: (doc, a) => (a.at ? moveElementTo(doc, a.id, a.at, a.pin ?? 'tl') : moveElement(doc, a.id, a.dx ?? 0, a.dy ?? 0)),
  rename: (doc, a) => renameElement(doc, a.id, a.to),
  remove: (doc, a) => removeElement(doc, a.id, a.page ?? null),
  set_canvas: (doc, a) => setCanvas(doc, a.cols, a.rows),
  accept_finding: (doc, a) => acceptFinding(doc, a.fingerprint, a.reason),
  unaccept_finding: (doc, a) => unacceptFinding(doc, a.fingerprint),
});

export function applyOperation(doc, op) {
  const fn = OPERATIONS[op.op];
  if (!fn) throw new SyntaxError(`unknown operation "${op.op}" — expected one of ${Object.keys(OPERATIONS).join(', ')}`);
  return fn(doc, op);
}

/**
 * Apply a batch of operations to a throwaway copy and validate the result.
 *
 * This is the "map the diagram, then see whether it conflicts" step: the AI can
 * compose a whole layout and read the consequences before committing any of it.
 * The live document is untouched whatever happens, including on failure.
 *
 * @returns {{ok:boolean, failedAt:number|null, error:string|null,
 *             applied:number, validation:object|null, preview:object|null}}
 */
export function planOperations(doc, ops) {
  const draft = structuredClone(doc);
  let applied = 0;
  try {
    for (const op of ops) {
      applyOperation(draft, op);
      applied++;
    }
  } catch (err) {
    return { ok: false, failedAt: applied, error: err.message, applied, validation: null, preview: null };
  }
  return { ok: true, failedAt: null, error: null, applied, validation: validate(draft), preview: draft };
}

/**
 * Apply a batch for real, but only if every operation succeeds — a partially
 * applied batch would leave the document in a state the caller never asked for.
 */
export function commitOperations(doc, ops) {
  const rehearsal = planOperations(doc, ops);
  if (!rehearsal.ok) return rehearsal;
  for (const op of ops) applyOperation(doc, op);
  return { ...rehearsal, validation: validate(doc), preview: null, committed: true };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * The adjudication gate — "is this intentional?", asked mechanically.
 *
 * Every finding above INFO is a decision the AI has not made yet. It can be
 * repaired, or it can be accepted with a stated reason; what it cannot be is
 * ignored on the way to a file. Asking politely in a prompt does not survive a
 * change of agent, so the question is enforced where the state changes instead.
 *
 * INFO deliberately never gates. Blocking on information would teach an author
 * to reach for `force` reflexively, which is exactly the habit this prevents.
 */
export function adjudicationGate(doc) {
  const validation = validate(doc);
  const blocking = validation.open.filter((f) => f.severity !== 'S3');
  return { blocked: blocking.length > 0, blocking, validation };
}

/** The refusal, written as the question it is. */
export function formatGate({ blocking }, verb = 'save') {
  const lines = [
    `${verb} refused — ${blocking.length} finding(s) need a decision before this diagram is written.`,
    '',
    '  Is this intentional?',
    '',
  ];
  for (const f of blocking) {
    lines.push(`  [${f.severityLabel}] ${f.rule} ${f.message}`);
    lines.push(`      #${f.fingerprint}`);
    lines.push(`      yes -> accept_finding { fingerprint: "${f.fingerprint}", reason: "..." }`);
    const repair = f.fixes?.map((x) => FIX_TOOL[x.kind]).filter(Boolean);
    lines.push(`      no  -> ${repair?.length ? [...new Set(repair)].join(' / ') : 'repair the geometry'}`);
    lines.push('');
  }
  lines.push(`  or ${verb} with force: true to write anyway — the document will record that you did.`);
  return lines.join('\n');
}

/** Which tool performs each fix kind. Kept beside the gate so the refusal can
 *  always name a route the caller can actually take. */
const FIX_TOOL = Object.freeze({
  widen: 'resize', heighten: 'resize', shorten: 'restyle', font: 'restyle',
  move: 'move', rename: 'rename', intent: 'update_page', canvas: 'set_canvas',
  extend: 'extend_path', reroute: 'replace_path', offset: 'replace_path',
  hop: 'replace_path', remove: 'remove', remove_page: 'remove_page',
});

/**
 * Write the working state without adjudicating it.
 *
 * The gate belongs on deliverables, not on autosave. Sketching roughly and
 * repairing afterwards is a supported way to work — "placement is never
 * rejected for collision" — so the checkpoint after every mutation must not
 * refuse, or the engine would start fighting the author mid-draft, which is the
 * behaviour it was built to avoid.
 */
export async function checkpointDocument(doc, path) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serialize(doc), 'utf8');
  return path;
}

export async function saveDocument(doc, path, { force = false } = {}) {
  const gate = adjudicationGate(doc);
  if (gate.blocked) {
    if (!force) throw new Error(formatGate(gate, 'save'));
    // A forced save is legitimate; a silent one is not. Recording it means the
    // next reader sees that findings were outstanding, without having to guess.
    doc.forcedSave = { at: new Date().toISOString(), findingCount: gate.blocking.length, rules: gate.blocking.map((f) => f.rule) };
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serialize(doc), 'utf8');
  return path;
}

export async function loadDocument(path) {
  return deserialize(await readFile(path, 'utf8'));
}

export async function exportSvg(doc, path, opts = {}) {
  // A rendered image is a deliverable — it leaves the tool and gets looked at,
  // so it is gated on the same terms as the document itself.
  const gate = adjudicationGate(doc);
  if (gate.blocked && !opts.force) throw new Error(formatGate(gate, 'render'));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, renderSvg(doc, opts), 'utf8');
  return path;
}

/** Constants an AI needs to do the arithmetic itself. */
export function latticeInfo(doc = null) {
  const fontSize = doc?.font?.size ?? text.DEFAULT_FONT.size;
  const advance = text.advanceWidth(fontSize);
  return {
    pxPerCell: geometry.PX_PER_CELL,
    pxPerQuadrant: geometry.PX_PER_QUAD,
    quadrantsPerCell: geometry.QUADS_PER_CELL,
    strokeWidthPx: geometry.PX_PER_QUAD,
    addressing: 'Excel: columns A..Z, AA.., rows 1.. ; origin A1 top-left; unbounded right and down',
    precisions: { cell: 'C4', pin: 'C4.tl (9 per cell)', quadrant: 'C4.q2 (4 per cell)' },
    pins: address.PIN_NAMES,
    font: { size: fontSize, advancePx: advance, lineHeightPx: text.lineHeightFor(fontSize), paddingQuads: doc?.font?.paddingQuads ?? text.DEFAULT_FONT.paddingQuads },
    capacity: {
      charsPerCellWidth: geometry.PX_PER_CELL / advance,
      formula: `chars per line = floor((cellsWide * ${geometry.PX_PER_CELL} - ${(doc?.font?.paddingQuads ?? 1) * geometry.PX_PER_QUAD * 2}) / ${advance})`,
    },
    strokeAlignments: { vertical: shapes.VERTICAL_ALIGNMENTS, horizontal: shapes.HORIZONTAL_ALIGNMENTS, note: 'no centre: a 5px stroke centred in a 10px cell would start at 2.5px, off the lattice' },
    cornerStyles: shapes.BOX_CORNER_STYLES,
    legibilityFloorPx: text.MIN_LEGIBLE_FONT_PX,
  };
}
