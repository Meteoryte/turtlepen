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

import { createDocument, addPage, addBox, addPath, addText, addImage, removeElement, moveElement, moveElementToPage, setBackground, normalizeFill, findElement, elementsOf, elementRects, elementClaimed, serialize, deserialize, contentBounds, getPage, updatePage, removePage, renameElement, groupsOf, findGroup, createGroup, addGroupMembers, removeGroupMembers, deleteGroup, groupBounds, moveGroup, constraintsOf, findConstraint, elementAnchor, reconcileElementChange, createConstraint, deleteConstraint, syncConstraints, MIN_OPACITY, DEFAULT_PAGE_OPACITY, PATH_ROLES, PATH_PAINTS, TEXT_ALIGNS, IMAGE_FITS, assertOpacity, normalizeStroke, normalizeColor, assertTextAlign } from './document.js';
import { runPen } from './pen.js';
import { validate, formatLog, fingerprintOf, RULES, SEVERITIES, SEVERITY_LABEL } from './collide.js';
import { renderAscii } from './ascii.js';
import { renderSvg } from './svg.js';
import * as perceptual from './perceptual.js';
import { mermaidToOperations, parseMermaid } from './mermaid.js';
import { layoutGraph } from './layout.js';
import * as turtlefont from './turtlefont.js';
export { turtlefont };
import { routeProgram as routeProgram_ } from './route.js';
export { mermaidToOperations, parseMermaid } from './mermaid.js';

// Perceptual review is a sibling of validate, not a part of it: same document,
// separate verdict, and nothing here is consulted by the collision engine.
export { NODE_SHAPES, CONTAINER_SHAPES, isContainer } from './shapes.js';
export { routeProgram } from './route.js';
export { repairPlan, applyFix } from './repair.js';
export { createProgressLog, recordCheck, stagnationNote, digestOf, STAGNATION_AFTER } from './progress.js';
export {
  PERCEPTUAL_CATEGORIES, PERCEPTUAL_SEVERITIES, REPAIR_CLASSES,
  normalizePerceptualFinding, attachPerceptualReview, renderHash,
  verdicts as perceptualVerdicts,
} from './perceptual.js';

export { geometry, address, text, shapes, occupancy, image, png, dither };
export { tone_ as tone };
export { pattern_ as pattern };
export { wireframe_ as wireframe };
export { perspective_ as perspective };
export {
  createDocument, addPage, addBox, addText, addImage, removeElement, moveElement, moveElementToPage, setBackground, normalizeFill, findElement,
  elementsOf, elementRects, elementClaimed, serialize, deserialize, contentBounds, getPage, updatePage, removePage, renameElement,
  groupsOf, findGroup, createGroup, addGroupMembers, removeGroupMembers, deleteGroup, groupBounds, moveGroup,
  constraintsOf, findConstraint, elementAnchor, reconcileElementChange, createConstraint, deleteConstraint, syncConstraints,
  runPen, validate, formatLog, fingerprintOf, RULES, SEVERITIES, SEVERITY_LABEL,
  renderAscii, renderSvg,
  perceptual,
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

function applyPenMutable(doc, pageId, program, { id = null, role = 'connector', stroke = null, color = null, fillColor = null, width = null, cap = null, paint = null, tone = null, feather = null, texture = null, pattern = null } = {}) {
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
      shape: b.shape ?? 'process',
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
    /**
     * Spread a two-stop ramp across the pieces by position along the run.
     * Only written when a ramp was asked for — a flat stroke must not carry a
     * colour on every quadrant just because the field exists.
     */
    const applyRamp = (list, ramp) => {
      if (!ramp || list.length === 0) return list;
      const mix = (a, b, t) => {
        const ch = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
        const hex = (n) => n.toString(16).padStart(2, '0');
        return `#${[0, 1, 2].map((i) => hex(Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t))).join('')}`;
      };
      const last = Math.max(1, list.length - 1);
      return list.map((piece, i) => ({ ...piece, color: mix(ramp.from, ramp.to, i / last) }));
    };
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
    // The ramp is spread AFTER tone and pattern have removed quadrants, so the
    // colour runs end to end across what actually survives rather than across
    // what was originally asked for.
    // Read off the RAW colour: `presentation` is the argument object, and the
    // ramp only exists once `normalizeStroke` has seen it inside `addPath`.
    const rawRamp = presentation?.color && typeof presentation.color === 'object' ? presentation.color : null;
    let painted = rawRamp ? applyRamp(pieces, rawRamp) : pieces;

    /**
     * A fill colour is independent of the outline's, because a drawn shape has
     * an edge and an inside and they are not the same mark. Given two stops it
     * gradates ACROSS the region rather than along a path — which is tone
     * without hatching, and the thing hatching was standing in for.
     */
    if (fillColor) {
      const flat = typeof fillColor === 'string';
      const from = flat ? fillColor : fillColor.from;
      const to = flat ? fillColor : fillColor.to;
      const ys = painted.map((p) => p.y);
      const lo = Math.min(...ys);
      const span = Math.max(1, Math.max(...ys) - lo);
      const mix = (a, b, t) => {
        const ch = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
        const hex = (n) => n.toString(16).padStart(2, '0');
        return `#${[0, 1, 2].map((i) => hex(Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t))).join('')}`;
      };
      painted = painted.map((p) => ({ ...p, color: flat ? from : mix(from, to, (p.y - lo) / span) }));
    }
    if (!painted.length) {
      throw new RangeError(
        `tone or pattern left "${pathId}" with no inked quadrants — raise the tone, reduce the feather, or drop the texture or pattern`,
      );
    }
    path = addPath(doc, pageId, { id: pathId, pieces: painted, role, stroke: presentation });
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
    if (result.origin) path.source = result.origin;
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
  if (result.origin && !path.source) path.source = result.origin;
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
  return { element: el, page: found.page, fit: el.label ? text.fitReport(el.label, shapes.shapeTextRect(r, el.shape ?? 'process'), { fontSize: el.fontSize, paddingQuads: doc.font.paddingQuads, align: el.align }) : null };
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
export function restyleBox(doc, id, { label = null, corner = null, shape = null, align = null, fontSize = null, fill = null } = {}) {
  const found = findElement(doc, id);
  if (!found) throw new Error(`no element "${id}" to restyle`);
  const el = found.element;
  if (el.kind === 'path') throw new Error(`"${id}" is a path and carries no label`);
  if (el.kind === 'image') throw new Error(`"${id}" is an image — restyle changes box or text presentation only`);
  if (el.kind === 'text' && (corner != null || fill != null)) throw new Error(`"${id}" is text — corner and fill apply to boxes only`);
  // Validate the whole request before touching the element. A repair operation
  // is as atomic as a plan even when called directly.
  const nextCorner = corner != null ? shapes.assertCornerStyle(corner) : null;
  const nextShape = shape != null ? shapes.assertNodeShape(shape) : null;
  const nextAlign = align != null ? assertTextAlign(align) : null;
  const nextFontSize = fontSize != null ? text.resolveFontSize(fontSize) : null;
  const nextFill = fill != null ? normalizeColor(fill, 'box fill') : null;
  if (label != null) el.kind === 'text' ? (el.text = label) : (el.label = label);
  if (nextCorner != null) el.corner = nextCorner;
  if (nextShape != null) el.shape = nextShape;
  if (nextAlign != null) el.align = nextAlign;
  if (nextFontSize != null) el.fontSize = nextFontSize;
  if (nextFill != null) el.fill = nextFill;
  const content = el.kind === 'text' ? el.text : el.label;
  return { element: el, page: found.page, fit: content ? text.fitReport(content, shapes.shapeTextRect(el.rect, el.shape ?? 'process'), { fontSize: el.fontSize, paddingQuads: doc.font.paddingQuads, align: el.align }) : null };
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
export function placeBox(doc, pageId, { id, at, span, label = '', corner = 'square', shape = 'process', align = 'left', fontSize = null, fill = null, opacity = null, state = null }) {
  const cells = normalizeSpan(span, `span for "${id}"`);
  const a = address.parseAddress(at);
  const p = address.pinPoint(a);
  const w = cells.w * 2, h = cells.h * 2;
  const [px, py] = a.kind === 'pin' ? address.PINS[a.part] : [0, 0];
  const r = address.assertOnGrid(geometry.rect(p.x - (px * w) / 2, p.y - (py * h) / 2, w, h), `box "${id}" pinned at ${at}`);
  return addBox(doc, pageId, { id, rect: r, label, corner, shape, align, fontSize, fill, opacity, state });
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

/**
 * How many findings one identical reason may explain before it stops being an
 * explanation.
 *
 * Calibrated against `diagrams/`, the same way the composition thresholds are:
 * the largest honest repeat in the corpus is `art-deco-hero`, where fourteen
 * frame members legitimately terminate in open space under one rationale. The
 * engine's own wireframe clearance reasons never exceed four, because they name
 * their unit. Fifteen clears both.
 *
 * Do not raise this to fit a diagram in front of you. Bulk reuse is a weak
 * signal on its own — every acceptance this limit catches in the showcase batch
 * was already refused as a restatement — so it is a backstop against a future
 * batch that loops one plausible sentence, not the primary check.
 */
const REASON_REUSE_LIMIT = 15;

/**
 * A fingerprint proves a finding is real and current. It cannot prove anybody
 * looked at it. These two checks catch the ways a batch launders findings it
 * never judged — both taken from a real session that accepted 145 of them.
 *
 * Neither check can read intent, and neither tries to. They test the only
 * machine-verifiable property a non-reason has: it carries no information the
 * finding did not already carry.
 */
function assertReasonWasConsidered(doc, finding, reason) {
  // 1. Restatement. "overlay composition: L014" tells the reader the rule id
  //    they already have. Keyed to the finding's OWN rule, because a reason
  //    that names a different rule is usually drawing a contrast — the
  //    wireframe tool accepts an L007 by explaining that an encroachment
  //    would instead report as L001, and that is a real explanation.
  const own = new RegExp(`\\b${finding.rule}\\b`, 'ig');
  if (own.test(reason)) {
    const rest = reason.replace(own, ' ').match(/[\p{L}\p{N}]+/gu) ?? [];
    if (rest.length < 5) {
      throw new Error(
        `this reason restates the rule instead of explaining it: "${reason}". ` +
        `${finding.rule} is what the engine already reported — say why THIS instance is intended, ` +
        'or fix the finding instead of accepting it.',
      );
    }
  }

  // 2. Bulk reuse. One string spread across a whole batch is a loop, not a
  //    judgement. Re-accepting the same fingerprint is an update and does not
  //    count against the limit.
  const shared = doc.acceptances.filter(
    (a) => a.reason === reason && a.fingerprint !== finding.fingerprint,
  ).length;
  if (shared >= REASON_REUSE_LIMIT) {
    throw new Error(
      `this reason already explains ${shared} other findings: "${reason}". ` +
      `One rationale can cover a class of findings, but past ${REASON_REUSE_LIMIT} it is a loop rather than a judgement — ` +
      'accept these individually, or fix the shared cause.',
    );
  }
}

function recordFindingAcceptance(doc, finding, reason) {
  if (!reason || !String(reason).trim()) throw new Error('accepting a finding requires a reason — an unexplained acceptance is indistinguishable from a missed defect');
  assertReasonWasConsidered(doc, finding, String(reason).trim());
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
    // Depth is the third axis a move can travel on: with no z-buffer, "in
    // front" is a page, so changing page IS a move. It composes with an x/y
    // move in one operation because an element that changes layer usually
    // changes position too, and two operations would validate in between.
    const moved = a.toPage ? moveElementToPage(doc, a.id, a.toPage) : null;
    if (a.at) return moveElementTo(doc, a.id, a.at, a.pin ?? 'tl');
    const usesCells = a.cellsX != null || a.cellsY != null;
    const dx = usesCells ? (a.cellsX ?? 0) * 2 : (a.dx ?? 0);
    const dy = usesCells ? (a.cellsY ?? 0) * 2 : (a.dy ?? 0);
    if (!dx && !dy) {
      if (moved) return moved;
      throw new Error('move needs either `at`, a non-zero `cellsX`/`cellsY`, or a `toPage`');
    }
    return moveElement(doc, a.id, dx, dy);
  },
  rename: (doc, a) => renameElement(doc, a.id, a.to),
  remove: (doc, a) => removeElement(doc, a.id, a.page ?? null),
  set_canvas: (doc, a) => setCanvas(doc, a.cols, a.rows),
  set_background: (doc, a) => setBackground(doc, a.color ?? null),
  align: (doc, a) => alignElements(doc, a.ids, a.edge),
  distribute: (doc, a) => distributeElements(doc, a.ids, a.axis),
  layout: (doc, a) => layoutElements(doc, a),
  stroke_text: (doc, a) => placeStrokeText(doc, a.page ?? 'base', a),
  wireframe: (doc, a) => applyWireframe(doc, a),
  perspective_scene: (doc, a) => applyPerspectiveScene(doc, a),
  // A review is document state, so it goes through OPERATIONS like every other
  // mutation: rehearsable in plan, undoable in history. A mutation only the
  // tool layer could perform would be invisible to rehearsal.
  perceptual_review: (doc, a) => perceptual.attachPerceptualReview(doc, a),
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
    nodeShapes: shapes.NODE_SHAPES,
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
/** Record how far from the camera an element sits, in room inches. */
function tagDepth(doc, id, depth) {
  const found = findElement(doc, id);
  if (found && Number.isFinite(depth)) found.element.depth = Math.round(depth);
}

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
    // Depth rides on the ELEMENT, not just the scene receipt. A receipt says
    // what the camera saw; the collision engine needs to know, per element,
    // which of two overlapping things is in front — and that question outlives
    // the call that generated them.
    tagDepth(doc, b.id, b.depth);
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
    tagDepth(doc, r.id, pr.depth);
    paths.push({ id: r.id, lengthIn: Math.round(lengthIn * 10) / 10, dropped: pr.dropped, depth: Math.round(pr.depth) });
  }

  doc.perspective_scene = { roomIn, eyeIn, targetIn, fovDeg, boxes: drawn, runs: paths };
  return { boxes: drawn, runs: paths };
}

/**
 * Edges an alignment can name. `centerX`/`centerY` align middles, which is a
 * different operation from aligning an edge and is the one people actually mean
 * when a row of boxes of different widths has to look deliberate.
 */
export const ALIGN_EDGES = Object.freeze(['left', 'right', 'top', 'bottom', 'centerX', 'centerY']);
export const DISTRIBUTE_AXES = Object.freeze(['horizontal', 'vertical']);

const rectOfElement = (el) => (el.kind === 'path'
  ? geometry.boundsOf(el.pieces.map((p) => geometry.rect(p.x, p.y, 1, 1)))
  : el.rect);

/**
 * Move the NAMED elements onto one shared edge.
 *
 * Every diagram in this repo hand-computed its own layout — a gap constant, a
 * running row counter, a uniform width worked out with `Math.max`. That
 * arithmetic is identical in every file and wrong in a new way each time, which
 * is a large part of why a generated diagram looks generated.
 *
 * The engine still decides nothing: the caller names the elements and the edge,
 * and the target is taken from those elements rather than invented.
 */
export function alignElements(doc, ids, edge) {
  if (!ALIGN_EDGES.includes(edge)) {
    throw new SyntaxError(`align edge must be one of ${ALIGN_EDGES.join(', ')} — got ${JSON.stringify(edge)}`);
  }
  const found = ids.map((id) => {
    const hit = findElement(doc, id);
    if (!hit) throw new Error(`no element "${id}" to align`);
    return { id, el: hit.element, rect: rectOfElement(hit.element) };
  });
  if (found.length < 2) throw new Error('aligning needs at least two elements to have anything to agree on');

  const target = {
    left: Math.min(...found.map((f) => f.rect.x)),
    right: Math.max(...found.map((f) => f.rect.x + f.rect.w)),
    top: Math.min(...found.map((f) => f.rect.y)),
    bottom: Math.max(...found.map((f) => f.rect.y + f.rect.h)),
    centerX: Math.round(found.reduce((s, f) => s + f.rect.x + f.rect.w / 2, 0) / found.length),
    centerY: Math.round(found.reduce((s, f) => s + f.rect.y + f.rect.h / 2, 0) / found.length),
  }[edge];

  for (const f of found) {
    const dx = {
      left: target - f.rect.x,
      right: target - (f.rect.x + f.rect.w),
      centerX: target - Math.round(f.rect.x + f.rect.w / 2),
    }[edge] ?? 0;
    const dy = {
      top: target - f.rect.y,
      bottom: target - (f.rect.y + f.rect.h),
      centerY: target - Math.round(f.rect.y + f.rect.h / 2),
    }[edge] ?? 0;
    // Whole quadrants, not whole cells. Snapping these to even numbers was a
    // habit borrowed from cell arithmetic; it cost up to a quadrant per element
    // and left centred boxes visibly off from each other.
    if (dx || dy) moveElement(doc, f.id, dx, dy);
  }
  return found.length;
}

/**
 * Space the NAMED elements evenly between the two that already sit furthest
 * apart. The ends anchor the span and never move, so distributing is a
 * tightening of what the author already laid out rather than a re-layout.
 */
export function distributeElements(doc, ids, axis) {
  if (!DISTRIBUTE_AXES.includes(axis)) {
    throw new SyntaxError(`distribute axis must be ${DISTRIBUTE_AXES.join(' or ')} — got ${JSON.stringify(axis)}`);
  }
  const found = ids.map((id) => {
    const hit = findElement(doc, id);
    if (!hit) throw new Error(`no element "${id}" to distribute`);
    return { id, rect: rectOfElement(hit.element) };
  });
  if (found.length < 3) {
    throw new Error('distributing needs at least three elements — with two there is no middle to move');
  }

  const horizontal = axis === 'horizontal';
  const pos = (r) => (horizontal ? r.x : r.y);
  const size = (r) => (horizontal ? r.w : r.h);
  found.sort((a, b) => pos(a.rect) - pos(b.rect));

  const first = found[0];
  const last = found[found.length - 1];
  const span = pos(last.rect) - (pos(first.rect) + size(first.rect));
  const occupied = found.slice(1, -1).reduce((s, f) => s + size(f.rect), 0);
  const gap = (span - occupied) / (found.length - 1);

  let cursor = pos(first.rect) + size(first.rect);
  for (const f of found.slice(1, -1)) {
    cursor += gap;
    const want = Math.round(cursor);
    const delta = want - pos(f.rect);
    if (delta) moveElement(doc, f.id, horizontal ? delta : 0, horizontal ? 0 : delta);
    cursor += size(f.rect);
  }
  return found.length;
}

/** Default separation between laid-out nodes, in quadrants — four cells across, five down. */
export const LAYOUT_DEFAULTS = Object.freeze({ gapX: 8, gapY: 10 });

/**
 * Lay out the connected boxes on a page, then redraw their connectors.
 *
 * `align` and `distribute` tidy an arrangement the author already chose. This
 * CHOOSES one: it ranks the graph, gives every long edge a lane of its own,
 * reduces crossings, and centres each node over its neighbours. That is the
 * arithmetic every diagram in this repo used to write by hand as a gap
 * constant and a running row counter, and writing it by hand is most of why a
 * generated diagram looks generated.
 *
 * THE GRAPH IS AUTHORED FACT, NEVER INFERRED. Edges come from what the pen
 * programs already recorded — `pen from a.S` states an origin and `line to b.N`
 * states a target. Nothing here decides that two boxes are related because
 * they happen to sit near each other.
 *
 * NOTHING HAPPENS SILENTLY. The caller asks for this by name, the same way
 * they would ask for `align`; the return says how many boxes moved, how many
 * crossings went away, which cycles had to be broken to rank the graph, and —
 * importantly — which connectors could NOT be redrawn cleanly. A route that
 * cannot be made is reported, not faked.
 */
export function layoutElements(doc, {
  page = 'base',
  ids = null,
  gapX = LAYOUT_DEFAULTS.gapX,
  gapY = LAYOUT_DEFAULTS.gapY,
  reroute = true,
} = {}) {
  getPage(doc, page);
  if (!Number.isInteger(gapX) || !Number.isInteger(gapY) || gapX < 0 || gapY < 0) {
    throw new SyntaxError('layout gaps are whole quadrants and cannot be negative');
  }

  const els = doc.elements[page] ?? [];
  const wanted = ids ? new Set(ids) : null;
  if (wanted) {
    for (const id of wanted) {
      const hit = findElement(doc, id, page);
      if (!hit) throw new Error(`no element "${id}" on page "${page}" to lay out`);
      if (hit.element.kind !== 'box') throw new Error(`"${id}" is a ${hit.element.kind} — layout arranges boxes, and moves the connectors between them`);
    }
  }
  const boxes = els.filter((e) => e.kind === 'box' && (!wanted || wanted.has(e.id)));
  if (boxes.length < 2) {
    throw new Error('layout needs at least two boxes — with one there is no arrangement to choose');
  }

  const inSet = new Set(boxes.map((b) => b.id));
  const connectors = els.filter((e) => e.kind === 'path'
    && e.source && inSet.has(e.source.id)
    && (e.targets ?? []).some((t) => inSet.has(t.id) && t.id !== e.source.id));

  const edges = [];
  for (const p of connectors) {
    const t = [...p.targets].reverse().find((x) => inSet.has(x.id) && x.id !== p.source.id);
    edges.push({ from: p.source.id, to: t.id, via: p.id, fromPort: p.source.port, toPort: t.port });
  }
  if (!edges.length) {
    throw new Error(
      'layout found no connectors joining these boxes, so there is no graph to rank. '
      + 'Draw the connections first — a pen program that says "from a.S" and "line to b.N" '
      + 'records the edge — or use align and distribute, which arrange boxes that are not joined.',
    );
  }

  // Anchor the result where the drawing already is, rather than teleporting it
  // to the origin and leaving whatever else is on the page behind.
  const before = geometry.boundsOf(boxes.map((b) => b.rect));
  const result = layoutGraph({
    nodes: boxes.map((b) => ({ id: b.id, cellsW: b.rect.w, cellsH: b.rect.h })),
    edges: edges.map((e) => ({ from: e.from, to: e.to })),
    gapX,
    gapY,
    originCol: before.x,
    originRow: before.y,
  });

  const moved = [];
  for (const b of boxes) {
    const want = result.positions.get(b.id);
    const dx = want.col - b.rect.x;
    const dy = want.row - b.rect.y;
    if (dx || dy) { moveElement(doc, b.id, dx, dy); moved.push({ id: b.id, dx, dy }); }
  }

  const routed = [];
  const stranded = [];
  const crowded = [];
  if (reroute) {
    // EVERY connector comes off the page first.
    //
    // Routing them one at a time in place does not work, and fails in a way
    // that looks like success: the router treats existing ink as an obstacle,
    // so each connector is routed around the STALE shapes of the ones not
    // redrawn yet. The first drawing of this made a well-arranged diagram with
    // twice as many errors as the hand-laid spine it replaced. Moving the boxes
    // invalidates all of the connectors at once, so all of them have to be
    // taken down at once.
    const list = doc.elements[page];
    const original = new Map();
    for (const e of edges) {
      const el = list.find((x) => x.id === e.via);
      if (el) original.set(e.via, { element: structuredClone(el), index: list.indexOf(el) });
    }
    for (const e of edges) if (original.has(e.via)) removeElement(doc, e.via, page);

    // Fan-out gets its own slot on the face.
    //
    // Three edges leaving one box all seated on the middle of `.S` start on the
    // same quadrant and block each other immediately, which no amount of
    // rearranging fixes — it is a port problem, not a layout problem. Cardinal
    // faces have had indexed slots all along (`a.S#2`), so the edges are spread
    // across them in the order their far ends actually landed: left-most target
    // takes the left-most slot, and the connectors stop crossing on the way out
    // of the box.
    const widthOf = (id) => boxes.find((b) => b.id === id).rect.w;
    const centreOf = (id) => result.positions.get(id).col + widthOf(id) / 2;
    const rankAt = (id) => result.positions.get(id).rank;

    // The faces come from the NEW arrangement, not the old one. `.E` and `.W`
    // were the right choice when two boxes sat side by side; after ranking they
    // sit above and below, and honouring the old face asks the router for a
    // connector that leaves leftward toward something on the right. Flow runs
    // down the page, so a forward edge leaves the bottom and arrives at the top.
    const facesFor = (e) => {
      const a = rankAt(e.from);
      const b = rankAt(e.to);
      if (b > a) return ['S', 'N'];
      if (b < a) return ['N', 'S'];
      return centreOf(e.to) > centreOf(e.from) ? ['E', 'W'] : ['W', 'E'];
    };

    // Slot 1 is the middle of the face and the rest alternate outward, so the
    // left-to-right reading order is not 1,2,3.
    const offsetOfSlot = (s) => (s === 1 ? 0 : (s % 2 === 0 ? -1 : 1) * Math.ceil((s - 1) / 2) * 2);
    const slotsLeftToRight = (k) => Array.from({ length: k }, (_, i) => i + 1)
      .sort((a, b) => offsetOfSlot(a) - offsetOfSlot(b));

    const portOf = new Map(); // `${via}|from` or `${via}|to` -> the spec to route with

    for (const end of ['from', 'to']) {
      const groups = new Map();
      for (const e of edges) {
        const face = facesFor(e)[end === 'from' ? 0 : 1];
        // Only N and S fan out. Their slots run along the width, which is the
        // axis the far ends are sorted on; an E or W face slots along the
        // height, where that ordering means nothing.
        if (face !== 'N' && face !== 'S') continue;
        const key = `${e[end]}|${face}`;
        if (!groups.has(key)) groups.set(key, { node: e[end], face, members: [] });
        groups.get(key).members.push(e);
      }
      for (const { node, face, members } of groups.values()) {
        if (members.length < 2) continue;
        const far = end === 'from' ? 'to' : 'from';
        members.sort((a, b) => centreOf(a[far]) - centreOf(b[far]) || a.via.localeCompare(b.via));
        const rect = boxes.find((b) => b.id === node).rect;
        const capacity = shapes.portSlotCapacity(rect, face);
        if (members.length > capacity) {
          // Said out loud rather than silently overlapping two connectors: the
          // box is too narrow for the number of lines meeting this face, and
          // the fix is to widen it, which is the author's call.
          crowded.push({ id: node, face, edges: members.length, capacity });
        }
        const slots = slotsLeftToRight(Math.min(members.length, capacity));
        members.forEach((e, i) => {
          const slot = slots[i] ?? 1;
          portOf.set(`${e.via}|${end}`, slot === 1 ? face : `${face}#${slot}`);
        });
      }
    }
    const specFor = (e, end) => portOf.get(`${e.via}|${end}`) ?? facesFor(e)[end === 'from' ? 0 : 1];

    // Short edges first. A connector between adjacent ranks has exactly one
    // sensible path and should get it; a long one has choices and can bend.
    const rankOf = (id) => result.positions.get(id).rank;
    const byReach = [...edges].sort((a, b) => {
      const span = Math.abs(rankOf(a.to) - rankOf(a.from)) - Math.abs(rankOf(b.to) - rankOf(b.from));
      return span || a.via.localeCompare(b.via);
    });

    // Every connector between the same two ranks gets its own crossing track
    // inside the channel the layout already reserved between them. Without
    // this they all take the midpoint and overlap along their whole horizontal
    // run, which reads as one thick line going nowhere.
    // Clear of everything on the page, so a loop-back never runs over a box.
    const margin = Math.max(...boxes.map((b) => b.rect.x + b.rect.w)) + 4;

    const channels = new Map();
    for (const e of byReach) {
      const key = `${rankOf(e.from)}->${rankOf(e.to)}`;
      if (!channels.has(key)) channels.set(key, []);
      channels.get(key).push(e.via);
    }
    const trackFor = (e) => {
      const rFrom = rankOf(e.from);
      const rTo = rankOf(e.to);
      if (rTo !== rFrom + 1) return null;          // only an adjacent-rank channel is reserved
      const top = result.rankRows[rFrom] + result.rankHeights[rFrom];
      const peers = channels.get(`${rFrom}->${rTo}`);
      const slot = peers.indexOf(e.via);
      const track = top + 2 * (slot + 1);
      // Stay inside the channel; past its far edge the track would run through
      // the rank below.
      return track < result.rankRows[rTo] ? track : null;
    };

    for (const e of byReach) {
      const was = original.get(e.via);
      if (!was) continue;
      const from = `${e.from}.${specFor(e, 'from')}`;
      const to = `${e.to}.${specFor(e, 'to')}`;
      // Crossing another connector is a crossing, not a failure — flowcharts
      // have always had them and `hop` exists to mark one. Crossing a BOX is a
      // failure, and that is still refused.
      let attempt = routeProgram_(doc, page, from, to, { track: trackFor(e), avoid: 'boxes' });
      if (!attempt.program) attempt = routeProgram_(doc, page, from, to, { avoid: 'boxes' });
      // A loop back up the page. Every flowchart has one — a retry, a rollback,
      // a "no" branch returning to an earlier step — and it cannot be drawn
      // between the ranks, because everything between them is full. It goes
      // round the outside instead: out of the right face, up the margin clear
      // of every box, and back in the right face of its target. The existing
      // two-turn route already draws exactly that shape once it is told which
      // vertical track to use.
      if (!attempt.program && rankAt(e.to) < rankAt(e.from)) {
        attempt = routeProgram_(doc, page, `${e.from}.E`, `${e.to}.E`, { track: margin, avoid: 'boxes' });
      }
      if (!attempt.program) attempt = routeProgram_(doc, page, from, to);
      if (attempt.program) {
        applyPen(doc, page, attempt.program, {
          id: e.via,
          role: was.element.role ?? 'connector',
          stroke: was.element.stroke,
        });
        routed.push({ id: e.via, turns: attempt.turns });
      } else {
        // Put back exactly what was there. A connector that cannot be redrawn
        // is a fact about the arrangement; deleting the author's line to make
        // the log quieter would be the worse of the two failures.
        addPath(doc, page, {
          id: e.via,
          pieces: was.element.pieces,
          stroke: was.element.stroke,
          note: was.element.note ?? null,
          role: was.element.role ?? 'connector',
        });
        stranded.push({ id: e.via, blockedBy: attempt.blockedBy, note: attempt.note });
      }
    }

    // Restore draw order. Boxes never moved within the list, so putting each
    // connector back at the index it held reproduces the original stacking.
    const after = doc.elements[page];
    const restored = after.filter((x) => !original.has(x.id));
    for (const [id, was] of [...original.entries()].sort((a, b) => a[1].index - b[1].index)) {
      const el = after.find((x) => x.id === id);
      if (el) restored.splice(Math.min(was.index, restored.length), 0, el);
    }
    doc.elements[page] = restored;
  }

  return {
    page,
    boxes: boxes.length,
    moved: moved.length,
    movedDetail: moved,
    edges: edges.length,
    crossings: result.crossings,
    crossingsBefore: result.crossingsBefore,
    ranks: result.depth,
    routed,
    crowded,
    stranded,
    // A cycle had to be broken to rank the graph at all. Which edge was
    // reversed changes what the picture claims, so it is named rather than
    // absorbed.
    reversed: result.reversed.map((i) => ({ id: edges[i].via, from: edges[i].from, to: edges[i].to })),
  };
}

/**
 * Place text as INK.
 *
 * The one mark in this engine that used to escape the lattice was a letter.
 * Everything else is quadrants the collision engine can see; a label was an
 * SVG `<text>` run whose width `core/text.js` had to predict. This draws the
 * words with TurtleFont instead, so they collide, they measure exactly, and
 * they survive a plotter.
 *
 * It costs size: cap height is six quadrants, because a stroke glyph below
 * that stops being legible once the lattice has quantised it. That is why this
 * sits ALONGSIDE `place_box` labels rather than replacing them — titles,
 * callouts and plotter work get real ink, and 11px body text stays as text.
 */
export function placeStrokeText(doc, pageId, {
  id, at, text, scale = 1, tracking = 0, maxWidth = null, align = 'left',
  color = null, width = null, role = 'artwork', note = null,
}) {
  getPage(doc, pageId);
  if (typeof text !== 'string' || !text.length) {
    throw new SyntaxError(`stroke text "${id}" needs something to say`);
  }
  const a = address.parseAddress(at);
  const origin = address.pinPoint(a);

  const drawn = turtlefont.renderStrokeText(text, {
    at: origin, scale, tracking, maxWidth, align,
  });
  if (!drawn.pieces.length) {
    throw new Error(`stroke text "${id}" drew nothing — ${JSON.stringify(text)} is all spaces`);
  }

  const path = addPath(doc, pageId, {
    id,
    pieces: drawn.pieces.map((p) => ({ ...p })),
    stroke: normalizeStroke(color || width ? { color, width } : null),
    // What it says, kept on the element. A path of 400 quadrants is unreadable
    // in a describe listing; the sentence it spells is the useful fact.
    note: note ?? `stroke text: ${text.replace(/\n/g, ' / ')}`,
    role,
  });
  path.text = text;
  path.font = { face: 'turtlefont', scale, tracking, align };
  return { element: path, ...drawn, pieces: drawn.pieces.length };
}
