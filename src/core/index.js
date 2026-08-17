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
import * as pattern_ from './pattern.js';
import * as wireframe_ from './wireframe.js';
import * as perspective_ from './perspective.js';

import { createDocument, addPage, addBox, addPath, addText, addImage, removeElement, moveElement, findElement, elementsOf, elementRects, elementClaimed, serialize, deserialize, contentBounds, getPage, updatePage, removePage, renameElement, groupsOf, findGroup, createGroup, addGroupMembers, removeGroupMembers, deleteGroup, groupBounds, moveGroup, constraintsOf, findConstraint, elementAnchor, reconcileElementChange, createConstraint, deleteConstraint, syncConstraints, MIN_OPACITY, DEFAULT_PAGE_OPACITY, PATH_ROLES, PATH_PAINTS, TEXT_ALIGNS, IMAGE_FITS, assertOpacity, normalizeStroke, normalizeColor, assertTextAlign } from './document.js';
import { runPen } from './pen.js';
import { validate, formatLog, fingerprintOf, RULES, SEVERITIES, SEVERITY_LABEL } from './collide.js';
import { renderAscii } from './ascii.js';
import { renderSvg } from './svg.js';

export { geometry, address, text, shapes, occupancy, image, png, dither };
export { tone_ as tone };
export { pattern_ as pattern };
export { wireframe_ as wireframe };
export { perspective_ as perspective };
export {
  createDocument, addPage, addBox, addText, addImage, removeElement, moveElement, findElement,
  elementsOf, elementRects, elementClaimed, serialize, deserialize, contentBounds, getPage, updatePage, removePage, renameElement,
  groupsOf, findGroup, createGroup, addGroupMembers, removeGroupMembers, deleteGroup, groupBounds, moveGroup,
  constraintsOf, findConstraint, elementAnchor, reconcileElementChange, createConstraint, deleteConstraint, syncConstraints,
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

function applyPenMutable(doc, pageId, program, { id = null, role = 'connector', stroke = null, color = null, width = null, cap = null, paint = null, tone = null, feather = null, texture = null, pattern = null } = {}) {
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
      || tone != null || feather != null || texture != null || pattern != null
      ? {
        color: color ?? undefined, width: width ?? undefined, cap: cap ?? undefined, paint: paint ?? undefined,
        tone: tone ?? undefined, feather: feather ?? undefined, texture: texture ?? undefined,
        pattern: pattern ?? undefined,
      }
      : null);
    const pathId = id ?? nextId(doc, 'path', 0);
    // Tone filters the PIECES, and a piece is one quadrant. Everything
    // downstream — elementClaimed, elementRects, the SVG emitter, the ASCII
    // view — derives from this array, so a 50% shape claims exactly its 50%
    // without the collision engine needing to know tone exists at all.
    const pieces = presentation
      ? pattern_.patternMask(tone_.toneMask(result.pieces, {
        tone: presentation.tone ?? 1,
        feather: presentation.feather ?? 0,
        texture: presentation.texture ?? null,
        seed: pathId,
      }), presentation.pattern ?? null)
      : result.pieces;
    if (!pieces.length) {
      throw new RangeError(
        `tone or pattern left "${pathId}" with no inked quadrants — raise the tone, reduce the feather, or drop the texture or pattern`,
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
  reconcileElementChange(doc, id);

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
  reconcileElementChange(doc, id);

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
  if (el.kind === 'image' && el.mode !== 'embed') {
    throw new Error(
      `"${id}" is a ${el.mode} image whose runs are bound to its current quadrant grid. ` +
      'Remove it and call place_image again at the new span so upscaling or downscaling is recomputed from the source.',
    );
  }

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
  if (el.kind === 'image') {
    const source = image.assertEmbeddedSource(el.source);
    el.scale = image.scaleReport(source, { cellsWide: r.w / 2, cellsTall: r.h / 2, mode: 'embed', fit: el.fit });
  }
  reconcileElementChange(doc, id);
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
    if (!Number.isInteger(span.w) || !Number.isInteger(span.h)) {
      throw new TypeError(`${what} must use whole-cell counts, got ${span.w}x${span.h}`);
    }
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
 * from a guess. Whole-cell viewport drift is reported, while contain or cover
 * preserves the source aspect through padding or cropping.
 */
export function placeImage(doc, pageId, { id, at, span, source, mode = 'embed', fit = 'contain', detail = 'auto', supersample = 'auto', opacity = null }) {
  if (!source) throw new SyntaxError(`image "${id}" needs a source — a base64 data URI prepared by the tool layer`);
  image.assertMode(mode);
  if (mode !== 'simplify' && detail !== 'auto') {
    throw new SyntaxError(`image detail applies only to mode "simplify" — ${mode} mode received ${JSON.stringify(detail)}`);
  }
  if (mode !== 'simplify' && supersample !== 'auto') {
    throw new SyntaxError(`image supersample applies only to mode "simplify" — ${mode} mode received ${JSON.stringify(supersample)}`);
  }
  const embedded = image.assertEmbeddedSource(source);
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
  let ditherStats = null;
  let processing = null;
  if (mode !== 'embed') {
    if (embedded.format !== 'png') throw new SyntaxError(`image "${id}" cannot use ${mode} mode from ${embedded.format.toUpperCase()} — lattice rasterization decodes PNG only; use mode "embed" or convert it to PNG`);
    const decoded = png.decode(embedded.bytes);
    const grid = mode === 'simplify'
      ? dither.simplifyToQuadrants(decoded, r.w, r.h, { fit, detail, supersample })
      : dither.ditherToQuadrants(decoded, r.w, r.h, { fit });
    runs = dither.runsOf(grid);
    ditherStats = dither.analyse(grid);
    processing = grid.processing ?? null;
  }
  const scale = image.scaleReport(embedded, { cellsWide: cells.w, cellsTall: cells.h, mode, fit });
  // Dither runs are the durable render source. Keeping the original bitmap as
  // well would duplicate megabytes in the document and every history snapshot.
  return addImage(doc, pageId, {
    id, rect: r, source: mode === 'embed' ? source : null, mode, fit, detail: mode === 'simplify' ? detail : null,
    supersample: mode === 'simplify' ? supersample : null,
    opacity, runs, scale, ditherStats, processing,
  });
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

export function placeReference(doc, { id = 'reference', source, at = 'A1.tl', span, opacity = REFERENCE_OPACITY, mode = 'dither', fit = 'contain', detail = 'auto', supersample = 'auto' }) {
  if (!source) throw new SyntaxError('a reference needs an image source — a data: URI, or a path the tool layer has already read');
  if (!['dither', 'simplify'].includes(mode)) {
    throw new SyntaxError(`a tracing reference mode must be dither or simplify — got ${JSON.stringify(mode)}`);
  }
  const draft = structuredClone(doc);
  const lowest = draft.pages.reduce((m, p) => Math.min(m, p.z), 0);
  const page = addPage(draft, { id, z: lowest - 1, intent: 'overlay', title: `${id} (tracing reference)`, opacity, reference: true });
  placeImage(draft, id, { id: `${id}-image`, at, span, source, mode, fit, detail, supersample });
  doc.pages = draft.pages;
  doc.elements = draft.elements;
  return page;
}

function recordFindingAcceptance(doc, finding, reason) {
  if (!reason || !String(reason).trim()) throw new Error('accepting a finding requires a reason — an unexplained acceptance is indistinguishable from a missed defect');
  const { fingerprint } = finding;
  const existing = doc.acceptances.find((a) => a.fingerprint === fingerprint);
  if (existing) {
    existing.rule = finding.rule;
    existing.page = finding.page;
    existing.title = finding.title;
    existing.reason = String(reason).trim();
    existing.acceptedAt = new Date().toISOString();
    return existing;
  }
  const entry = {
    fingerprint,
    rule: finding.rule,
    page: finding.page,
    title: finding.title,
    reason: String(reason).trim(),
    acceptedAt: new Date().toISOString(),
  };
  doc.acceptances.push(entry);
  return entry;
}

export function acceptFinding(doc, fingerprint, reason) {
  if (!reason || !String(reason).trim()) throw new Error('accepting a finding requires a reason — an unexplained acceptance is indistinguishable from a missed defect');
  const validation = validate(doc);
  const finding = [...validation.open, ...validation.accepted].find((entry) => entry.fingerprint === fingerprint);
  if (!finding) {
    throw new Error(`cannot accept #${fingerprint}: it is not a current finding; validate again and use an open fingerprint`);
  }
  return recordFindingAcceptance(doc, finding, reason);
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
    tone: a.tone, feather: a.feather, texture: a.texture, pattern: a.pattern,
  }),
  extend_path: (doc, a) => extendPath(doc, a.id, a.program),
  replace_path: (doc, a) => replacePath(doc, a.id, a.program),
  resize: (doc, a) => resizeBox(doc, a.id, a),
  restyle: (doc, a) => restyleBox(doc, a.id, a),
  move: (doc, a) => {
    if (a.at) return moveElementTo(doc, a.id, a.at, a.pin ?? 'tl');
    const usesCells = a.cellsX != null || a.cellsY != null;
    const dx = usesCells ? (a.cellsX ?? 0) * 2 : (a.dx ?? 0);
    const dy = usesCells ? (a.cellsY ?? 0) * 2 : (a.dy ?? 0);
    if (!dx && !dy) throw new Error('move needs either `at` or a non-zero `cellsX`/`cellsY`');
    return moveElement(doc, a.id, dx, dy);
  },
  rename: (doc, a) => renameElement(doc, a.id, a.to),
  remove: (doc, a) => removeElement(doc, a.id, a.page ?? null),
  set_canvas: (doc, a) => setCanvas(doc, a.cols, a.rows),
  wireframe: (doc, a) => applyWireframe(doc, a),
  perspective_scene: (doc, a) => applyPerspectiveScene(doc, a),
  accept_finding: (doc, a) => acceptFinding(doc, a.fingerprint, a.reason),
  unaccept_finding: (doc, a) => unacceptFinding(doc, a.fingerprint),
  group: (doc, a) => {
    switch (a.action) {
      case 'create': return createGroup(doc, a);
      case 'add': return addGroupMembers(doc, a.id, a.members);
      case 'remove': return removeGroupMembers(doc, a.id, a.members);
      case 'delete': return deleteGroup(doc, a.id);
      case 'move': return moveGroup(doc, a.id, (a.cellsX ?? 0) * 2, (a.cellsY ?? 0) * 2);
      default: throw new SyntaxError(`group action must be create, add, remove, delete, or move — got ${JSON.stringify(a.action)}`);
    }
  },
  constraint: (doc, a) => {
    switch (a.action) {
      case 'create': {
        const hasX = a.offsetX != null;
        const hasY = a.offsetY != null;
        if (hasX !== hasY) throw new Error('constraint create needs both offsetX and offsetY, or neither');
        const offset = a.offset ?? (hasX ? { x: a.offsetX, y: a.offsetY } : null);
        return createConstraint(doc, { ...a, offset });
      }
      case 'delete': return deleteConstraint(doc, a.id);
      case 'sync': return syncConstraints(doc, a.id ?? null);
      default: throw new SyntaxError(`constraint action must be create, delete, or sync — got ${JSON.stringify(a.action)}`);
    }
  },
});

export function applyOperation(doc, op) {
  const fn = OPERATIONS[op.op];
  if (!fn) throw new SyntaxError(`unknown operation "${op.op}" — expected one of ${Object.keys(OPERATIONS).join(', ')}`);
  return fn(doc, op);
}

function applyOperationBatch(doc, ops) {
  let currentFindings = null;
  let applied = 0;
  for (const op of ops) {
    try {
      if (op.op === 'accept_finding') {
        if (!op.reason || !String(op.reason).trim()) {
          throw new Error('accepting a finding requires a reason — an unexplained acceptance is indistinguishable from a missed defect');
        }
        if (!currentFindings) {
          const validation = validate(doc);
          currentFindings = new Map([...validation.open, ...validation.accepted].map((finding) => [finding.fingerprint, finding]));
        }
        const finding = currentFindings.get(op.fingerprint);
        if (!finding) {
          throw new Error(`cannot accept #${op.fingerprint}: it is not a current finding; validate again and use an open fingerprint`);
        }
        recordFindingAcceptance(doc, finding, op.reason);
      } else {
        applyOperation(doc, op);
        currentFindings = null;
      }
    } catch (err) {
      err.applied = applied;
      throw err;
    }
    applied++;
  }
  return applied;
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
  let applied;
  try {
    applied = applyOperationBatch(draft, ops);
  } catch (err) {
    const failedAt = applied ?? Number(err.applied ?? 0);
    return { ok: false, failedAt, error: err.message, applied: failedAt, validation: null, preview: null };
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
  applyOperationBatch(doc, ops);
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


/**
 * Lay a dimensioned area and its equipment onto a page, to scale.
 *
 * A mutation, so it lives in OPERATIONS and can be rehearsed by `plan` like any
 * other. Clearance bands are placed as ordinary boxes: an encroachment is then
 * an ordinary L001 rather than a rule the engine had to learn.
 */
export function applyWireframe(doc, {
  page = 'base', widthIn, depthIn, heightIn = null, items = [], runs = [], scale = 2,
  origin = null, clearance = true, labels = true, view = 'plan',
} = {}) {
  getPage(doc, page);
  const plan = wireframe_.layout(
    { widthIn, depthIn, ...(heightIn != null ? { heightIn } : {}) },
    items,
    { scale, view, ...(origin ? { origin } : {}) },
  );
  plan.page = page;
  plan.clearanceDrawn = clearance;
  const drawn = [];
  for (const b of wireframe_.boxes(plan, { includeClearance: clearance })) {
    drawn.push(addBox(doc, page, {
      id: b.id,
      rect: b.rect,
      label: labels ? (b.label ?? '') : '',
      corner: b.kind === 'clearance' ? 'chamfered' : 'square',
      fontSize: doc.font.size,
    }));
  }
  // Runs are paths, not boxes — a line set has a length, which is the number an
  // estimator actually wants. Drawn with the pattern its kind implies: control
  // wiring dashed, drain dotted, so the three are told apart without a legend.
  plan.runs = [];
  for (const r of runs) {
    const routed = wireframe_.route(plan, r);
    applyPen(doc, page, wireframe_.runProgram(routed), {
      id: routed.id, role: 'artwork', pattern: routed.pattern,
    });
    routed.penetrations = wireframe_.penetrations(plan, routed);
    for (const pen of routed.penetrations) {
      addBox(doc, page, { id: pen.id, rect: { x: pen.x - 1, y: pen.y - 1, w: 3, h: 3 }, label: '', corner: 'rounded' });
    }
    plan.runs.push(routed);
  }

  doc.wireframe = plan;          // kept so export_prompt describes what was drawn

  // A unit's own four clearance bands meet at its corners — that is what makes
  // them a ring rather than four stripes, and it fires L007 "no gutter" every
  // time. Left alone it would put four warnings per unit into the log for
  // geometry the construction guarantees, and a rule that cries wolf on correct
  // work teaches an author to stop reading the log.
  //
  // Adjudicated rather than suppressed: each is accepted by fingerprint with a
  // stated reason, so it still lapses the moment the geometry changes, and a
  // clearance band touching anything ELSE is untouched and still reports.
  const ownBands = new Set(plan.items.flatMap((i) => (i.clearance?.bands ?? []).map((b) => b.id)));
  const isWall = (id) => /^wall_[nsew]$/.test(id);
  const unit = (id) => id.replace(/_clr_[nsew]$/, '');

  for (const f of validate(doc).open) {
    if (f.rule !== 'L007') continue;                 // only "touching", never overlap
    const [a, b] = f.actors ?? [];
    if (!a || !b) continue;

    if (ownBands.has(a) && ownBands.has(b) && unit(a) === unit(b)) {
      acceptFinding(doc, f.fingerprint,
        `Clearance bands of ${unit(a)} meet at a corner: they form one ring around the unit, which is the intended geometry.`);
      continue;
    }
    // A band touching the unit it belongs to is what "adjacent clearance"
    // means. Reporting it would flag every unit in every layout.
    if ((ownBands.has(a) && unit(a) === b) || (ownBands.has(b) && unit(b) === a)) {
      acceptFinding(doc, f.fingerprint,
        `A clearance band sits against ${ownBands.has(a) ? unit(a) : unit(b)} by definition — the band starts at the unit's face.`);
      continue;
    }
    // A band flush against a wall is the unit sitting at EXACTLY its stated
    // clearance — the good case, and the one a careful layout aims for. An
    // encroachment is an overlap, and overlaps are L001 errors that stay.
    if ((ownBands.has(a) && isWall(b)) || (isWall(a) && ownBands.has(b))) {
      const band = ownBands.has(a) ? a : b;
      acceptFinding(doc, f.fingerprint,
        `${unit(band)} sits at exactly its stated clearance from this wall — touching is the limit case, not an encroachment. Encroachment overlaps, and would report as L001.`);
    }
  }

  return { plan, boxes: drawn };
}


/**
 * Project a room and its contents onto the lattice through a real camera.
 *
 * A flat elevation cannot say that a stair recedes or that a ceiling is twenty
 * feet behind the wall you are looking at. Matching a photograph means
 * projecting real 3D coordinates, not arranging rectangles that resemble one.
 *
 * Boxes are drawn FAR TO NEAR. The lattice has no z-buffer, so draw order is
 * the only thing that makes an occlusion read correctly.
 */
export function applyPerspectiveScene(doc, {
  page = 'base', roomIn, eyeIn, targetIn, fovDeg = 60, items = [], runs = [],
  widthQ = null, heightQ = null,
} = {}) {
  getPage(doc, page);
  const W = widthQ ?? doc.canvas.cols * 2;
  const H = heightQ ?? doc.canvas.rows * 2;
  const cam = perspective_.camera({ eyeIn, targetIn, fovDeg, widthQ: W, heightQ: H });

  const boxes = [{ id: 'room', ...perspective_.room(roomIn) },
    ...items.map((i) => ({ ...i }))]
    .map((b) => ({ id: b.id, ...perspective_.projectBox(cam, b) }))
    .sort((a, b) => b.depth - a.depth);

  const drawn = [];
  for (const b of boxes) {
    const prog = perspective_.segmentProgram(b.segments, { widthQ: W, heightQ: H });
    if (!prog) continue;
    applyPen(doc, page, prog, { id: b.id, role: 'artwork' });
    drawn.push({ id: b.id, dropped: b.dropped, depth: Math.round(b.depth) });
  }

  const paths = [];
  for (const r of runs) {
    const pr = perspective_.projectPath(cam, r.waypoints);
    const prog = perspective_.segmentProgram(pr.segments, { widthQ: W, heightQ: H });
    if (!prog) continue;
    applyPen(doc, page, prog, { id: r.id, role: 'artwork', color: r.color, pattern: r.pattern });
    // Length is measured in the ROOM, never off the projection: a run drawn
    // shorter because it recedes is not a shorter run.
    let lengthIn = 0;
    for (let i = 1; i < r.waypoints.length; i += 1) {
      const a = r.waypoints[i - 1], b = r.waypoints[i];
      lengthIn += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
    paths.push({ id: r.id, lengthIn: Math.round(lengthIn * 10) / 10, dropped: pr.dropped });
  }

  doc.perspective_scene = { roomIn, eyeIn, targetIn, fovDeg, boxes: drawn, runs: paths };
  return { boxes: drawn, runs: paths };
}
