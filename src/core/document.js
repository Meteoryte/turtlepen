/**
 * The document model: a stack of Z-pages, each holding elements.
 *
 * Pages exist so an AI can overlay annotation, highlight, or future-state
 * layers on a base drawing. The engine cannot tell from geometry alone whether
 * an overlap between layers is a mistake or the entire purpose of the layer, so
 * each page declares its INTENT when created:
 *
 *   exclusive — nothing below may be overlapped. Overlap is an error.
 *   overlay   — overlap is expected. Reported as information, not noise.
 *
 * Within a single page, overlap is always an error regardless of intent.
 */

import { rect, rectsOverlap, boundsOf } from './geometry.js';
import { claimedQuads, visualQuads, assertCornerStyle, assertNodeShape, parsePortSpec, portPoint } from './shapes.js';
import { DEFAULT_FONT, resolveFontSize } from './text.js';
import { normalizeTone, normalizeFeather, normalizeTexture } from './tone.js';
import { normalizePattern } from './pattern.js';
import { assertEmbeddedSource, assertMode as assertImageMode, scaleReport } from './image.js';
import { analyseRuns, SIMPLIFY_DETAILS, SIMPLIFY_SUPERSAMPLES } from './dither.js';

// `schematic` stacks exactly like `exclusive`; it exists to carry authorial meaning —
// "this page is deliberately spare" — which the composition rules read and skip.
export const PAGE_INTENTS = Object.freeze(['exclusive', 'overlay', 'schematic']);
export const PATH_ROLES = Object.freeze(['connector', 'artwork']);
export const PATH_PAINTS = Object.freeze(['line', 'cells']);
export const TEXT_ALIGNS = Object.freeze(['left', 'center', 'right']);
export const IMAGE_FITS = Object.freeze(['contain', 'cover']);
export const SCHEMA_VERSION = 1;

export function createDocument({ name = 'untitled', canvas = { cols: 160, rows: 100 }, font = {} } = {}) {
  const doc = {
    schema: SCHEMA_VERSION,
    name,
    canvas: { cols: canvas.cols, rows: canvas.rows },
    font: { ...DEFAULT_FONT, ...font },
    pages: [],
    elements: {},
    groups: [],
    constraints: [],
    acceptances: [],
    createdAt: new Date().toISOString(),
  };
  addPage(doc, { id: 'base', z: 0, intent: 'exclusive', title: 'Base' });
  return doc;
}

/**
 * Opacity is PRESENTATION. It never reaches `claimedQuads`, `visualQuads`, or
 * any collision rule — a faded element occupies exactly what a solid one does.
 * The tempting misuse is fading something to make an overlap "go away"; L019
 * exists because that is a trap, not a repair.
 */
export const MIN_OPACITY = 0.05;
export const DEFAULT_PAGE_OPACITY = Object.freeze({ exclusive: 1, overlay: 0.92, schematic: 1 });

export function assertOpacity(value, what = 'opacity') {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_OPACITY || value > 1) {
    throw new RangeError(`${what} must be a number between ${MIN_OPACITY} and 1 — got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Optional presentation for a path. Geometry still claims whole quadrants;
 * colour, width and caps only change how the stored footprint is painted.
 * Hex-only colours keep saved SVG safe to embed in the live viewer.
 */
export function normalizeStroke(stroke) {
  if (stroke == null) return null;
  if (!stroke || typeof stroke !== 'object' || Array.isArray(stroke)) {
    throw new TypeError('path stroke must be an object with color, width, and cap');
  }
  const color = normalizeColor(stroke.color ?? '#2b2a26', 'path color');
  const width = stroke.width ?? 5;
  if (!Number.isInteger(width) || width < 1 || width > 5) {
    throw new RangeError(`path width must be a whole pixel count between 1 and 5 — got ${JSON.stringify(width)}`);
  }
  const cap = stroke.cap ?? 'butt';
  if (!['butt', 'round', 'square'].includes(cap)) {
    throw new SyntaxError(`path cap must be butt, round, or square — got ${JSON.stringify(cap)}`);
  }
  const paint = stroke.paint ?? 'line';
  if (!PATH_PAINTS.includes(paint)) {
    throw new SyntaxError(`path paint must be ${PATH_PAINTS.join(' or ')} — got ${JSON.stringify(paint)}`);
  }
  // Tone is normalised HERE, in core, so an operation means the same thing
  // called directly, invoked as a tool, or rehearsed inside a plan. Parsing it
  // in the tool handler is how place_box once ended up with two incompatible
  // signatures for one name.
  const tone = normalizeTone(stroke.tone, 'path tone');
  const feather = normalizeFeather(stroke.feather, 'path feather');
  const texture = normalizeTexture(stroke.texture, 'path texture');
  const pattern = normalizePattern(stroke.pattern, 'path pattern');
  return {
    color,
    width,
    cap,
    ...(paint === 'cells' ? { paint } : {}),
    ...(tone < 1 ? { tone } : {}),
    ...(feather > 0 ? { feather } : {}),
    ...(texture ? { texture } : {}),
    ...(pattern ? { pattern } : {}),
  };
}

export function normalizeColor(value, what = 'color') {
  if (value == null) return null;
  if (!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(String(value))) {
    throw new SyntaxError(`${what} must be a 3- or 6-digit hex colour — got ${JSON.stringify(value)}`);
  }
  return String(value).toLowerCase();
}

export function assertTextAlign(value) {
  if (!TEXT_ALIGNS.includes(value)) {
    throw new SyntaxError(`text alignment must be ${TEXT_ALIGNS.join(', ')} — got ${JSON.stringify(value)}`);
  }
  return value;
}

export function assertImageFit(value) {
  if (!IMAGE_FITS.includes(value)) {
    throw new SyntaxError(`image fit must be ${IMAGE_FITS.join(' or ')} — got ${JSON.stringify(value)}`);
  }
  return value;
}

export function assertFontWeight(value) {
  if (!Number.isInteger(value) || value < 100 || value > 900 || value % 100 !== 0) {
    throw new RangeError(`font weight must be 100–900 in steps of 100 — got ${JSON.stringify(value)}`);
  }
  return value;
}

function assertElementId(id) {
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new SyntaxError(`element id "${id}" must be non-empty and alphanumeric (dashes and underscores allowed)`);
  }
  return id;
}

export function addPage(doc, { id, z = null, intent = 'exclusive', title = null, opacity = null, reference = false }) {
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new SyntaxError(`page id "${id}" must be non-empty and alphanumeric (dashes and underscores allowed)`);
  }
  if (doc.pages.some((p) => p.id === id)) throw new Error(`page "${id}" already exists`);
  if (!PAGE_INTENTS.includes(intent)) {
    throw new SyntaxError(`page intent must be one of ${PAGE_INTENTS.join(', ')} — got "${intent}"`);
  }
  const zed = z == null ? doc.pages.reduce((m, p) => Math.max(m, p.z), -1) + 1 : z;
  if (!Number.isInteger(zed)) throw new RangeError(`page z-index must be a whole number — got ${JSON.stringify(zed)}`);
  if (doc.pages.some((p) => p.z === zed)) throw new Error(`z-index ${zed} is already occupied by page "${doc.pages.find((p) => p.z === zed).id}"`);
  const page = { id, z: zed, intent, title: title ?? id, visible: true, opacity: assertOpacity(opacity, 'page opacity') ?? DEFAULT_PAGE_OPACITY[intent], ...(reference ? { reference: true } : {}) };
  doc.pages.push(page);
  doc.pages.sort((a, b) => a.z - b.z);
  doc.elements[id] = [];
  return page;
}

/**
 * Change a page's declared intent, stacking, title, or visibility.
 *
 * This exists because `L005` suggests "declare this page as an overlay if the
 * stacking is deliberate" — a fix the tool surface has to be able to perform,
 * or the AI reads advice it cannot act on.
 */
export function updatePage(doc, id, { intent = null, z = null, title = null, visible = null, opacity = null } = {}) {
  const page = getPage(doc, id);
  if (intent != null && !PAGE_INTENTS.includes(intent)) throw new SyntaxError(`page intent must be one of ${PAGE_INTENTS.join(', ')} — got "${intent}"`);
  if (z != null) {
    if (!Number.isInteger(z)) throw new RangeError(`page z-index must be a whole number — got ${JSON.stringify(z)}`);
    const clash = doc.pages.find((p) => p.z === z && p.id !== id);
    if (clash) throw new Error(`z-index ${z} is already occupied by page "${clash.id}"`);
  }
  const nextOpacity = opacity != null ? assertOpacity(opacity, 'page opacity') : null;
  if (intent != null) page.intent = intent;
  if (z != null) page.z = z;
  if (title != null) page.title = title;
  if (nextOpacity != null) page.opacity = nextOpacity;
  if (visible != null) page.visible = Boolean(visible);
  if (z != null) doc.pages.sort((a, b) => a.z - b.z);
  return page;
}

export function removePage(doc, id) {
  const page = getPage(doc, id);
  if (doc.pages.length === 1) throw new Error('a document must keep at least one page');
  const removedIds = new Set(elementsOf(doc, id).map((element) => element.id));
  doc.pages.splice(doc.pages.indexOf(page), 1);
  delete doc.elements[id];
  for (const group of groupsOf(doc)) group.members = group.members.filter((member) => !removedIds.has(member));
  doc.constraints = constraintsOf(doc).filter((constraint) => !removedIds.has(constraint.dependent) && !removedIds.has(constraint.target));
  return page;
}

/** Rename an element. Ids are how pen targets like `to db.W` resolve, so the
 *  new name must be free across the whole document. */
export function renameElement(doc, id, newId) {
  const found = findElement(doc, id);
  if (!found) throw new Error(`no element "${id}" to rename`);
  if (id === newId) return found.element;
  assertElementId(newId);
  assertFreeId(doc, newId);
  found.element.id = newId;
  for (const group of groupsOf(doc)) {
    const index = group.members.indexOf(id);
    if (index >= 0) group.members[index] = newId;
  }
  for (const constraint of constraintsOf(doc)) {
    if (constraint.dependent === id) constraint.dependent = newId;
    if (constraint.target === id) constraint.target = newId;
  }
  return found.element;
}

export function getPage(doc, id) {
  const page = doc.pages.find((p) => p.id === id);
  if (!page) throw new Error(`no such page "${id}" — pages are: ${doc.pages.map((p) => p.id).join(', ') || '(none)'}`);
  return page;
}

export function elementsOf(doc, pageId) {
  return doc.elements[pageId] ?? [];
}

export function allElements(doc) {
  return doc.pages.flatMap((p) => elementsOf(doc, p.id).map((el) => ({ ...el, page: p.id })));
}

export function findElement(doc, id, pageId = null) {
  const pages = pageId ? [getPage(doc, pageId)] : doc.pages;
  for (const p of pages) {
    const el = elementsOf(doc, p.id).find((e) => e.id === id);
    if (el) return { element: el, page: p.id };
  }
  return null;
}

/** Ids must be unique across the whole document, not just per page — a
 *  connector targeting `db` must resolve without the AI naming a page. */
export function assertFreeId(doc, id) {
  const existing = findElement(doc, id);
  if (existing) throw new Error(`element id "${id}" already exists on page "${existing.page}"`);
  if (findGroup(doc, id)) throw new Error(`id "${id}" already belongs to group "${id}"`);
  if (findConstraint(doc, id)) throw new Error(`id "${id}" already belongs to constraint "${id}"`);
}

export function addBox(doc, pageId, { id, rect: r, label = '', fontSize = null, corner = 'square', shape = 'process', align = 'left', fill = null, note = null, opacity = null, state = null }) {
  getPage(doc, pageId);
  assertElementId(id);
  assertFreeId(doc, id);
  assertCornerStyle(corner);
  assertNodeShape(shape);
  const el = {
    id,
    kind: 'box',
    rect: rect(r.x, r.y, r.w, r.h),
    label,
    fontSize: fontSize == null ? doc.font.size : resolveFontSize(fontSize),
    corner,
    shape,
    align: assertTextAlign(align),
    fill: normalizeColor(fill, 'box fill'),
    note,
    opacity: assertOpacity(opacity, 'element opacity'),
    state,
  };
  doc.elements[pageId].push(el);
  return el;
}

export function addImage(doc, pageId, { id, rect: r, source, mode = 'embed', fit = 'contain', detail = null, supersample = null, opacity = null, note = null, runs = null, scale = null, ditherStats = null, processing = null }) {
  getPage(doc, pageId);
  assertElementId(id);
  assertFreeId(doc, id);
  const el = {
    id,
    kind: 'image',
    rect: rect(r.x, r.y, r.w, r.h),
    source,
    mode,
    fit: assertImageFit(fit),
    ...(detail ? { detail } : {}),
    ...(supersample ? { supersample } : {}),
    opacity: assertOpacity(opacity, 'element opacity'),
    note,
    ...(runs ? { runs } : {}),
    ...(scale ? { scale } : {}),
    ...(ditherStats ? { ditherStats } : {}),
    ...(processing ? { processing } : {}),
  };
  doc.elements[pageId].push(el);
  return el;
}

export function addPath(doc, pageId, { id, pieces, stroke = null, note = null, role = 'connector' }) {
  getPage(doc, pageId);
  assertElementId(id);
  assertFreeId(doc, id);
  if (!pieces.length) throw new Error(`path "${id}" has no pieces — a pen program must draw at least one quadrant`);
  if (!PATH_ROLES.includes(role)) throw new SyntaxError(`path role must be ${PATH_ROLES.join(' or ')} — got ${JSON.stringify(role)}`);
  const el = { id, kind: 'path', pieces, stroke: normalizeStroke(stroke), note, ...(role === 'artwork' ? { role } : {}) };
  doc.elements[pageId].push(el);
  return el;
}

export function addText(doc, pageId, { id, rect: r, text, fontSize = null, align = 'left', color = null, weight = 400 }) {
  getPage(doc, pageId);
  assertElementId(id);
  assertFreeId(doc, id);
  const el = {
    id,
    kind: 'text',
    rect: rect(r.x, r.y, r.w, r.h),
    text,
    fontSize: fontSize == null ? doc.font.size : resolveFontSize(fontSize),
    align: assertTextAlign(align),
    color: normalizeColor(color, 'text color'),
    weight: assertFontWeight(weight),
  };
  doc.elements[pageId].push(el);
  return el;
}

export function removeElement(doc, id, pageId = null) {
  const found = findElement(doc, id, pageId);
  if (!found) throw new Error(`no element "${id}"${pageId ? ` on page "${pageId}"` : ''}`);
  const list = doc.elements[found.page];
  list.splice(list.findIndex((e) => e.id === id), 1);
  for (const group of groupsOf(doc)) group.members = group.members.filter((member) => member !== id);
  doc.constraints = constraintsOf(doc).filter((constraint) => constraint.dependent !== id && constraint.target !== id);
  return found;
}

export function moveElement(doc, id, dx, dy, pageId = null) {
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) {
    throw new RangeError(`element movement must use whole quadrants — got ${JSON.stringify({ dx, dy })}`);
  }
  const found = findElement(doc, id, pageId);
  if (!found) throw new Error(`no element "${id}" to move`);
  moveElementRaw(found.element, dx, dy);
  reconcileMovedElements(doc, new Set([id]));
  return found;
}

function moveElementRaw(el, dx, dy) {
  if (el.kind === 'path') {
    for (const p of el.pieces) { p.x += dx; p.y += dy; }
    // `end` is the cursor state extend_path resumes from. Moving only the ink
    // made the next extension jump back to the path's old location.
    if (el.end) { el.end.x += dx; el.end.y += dy; }
  } else {
    el.rect = rect(el.rect.x + dx, el.rect.y + dy, el.rect.w, el.rect.h);
  }
}

// ---------------------------------------------------------------------------
// Flat groups — explicit subsystem ownership without hidden geometry.
// ---------------------------------------------------------------------------

export function groupsOf(doc) {
  if (!Array.isArray(doc.groups)) doc.groups = [];
  return doc.groups;
}

export function findGroup(doc, id) {
  return groupsOf(doc).find((group) => group.id === id) ?? null;
}

function normalizeMembers(members, what = 'group members') {
  if (!Array.isArray(members) || !members.length) throw new RangeError(`${what} must name at least one element`);
  const unique = [...new Set(members.map(String))];
  if (unique.length !== members.length) throw new Error(`${what} contain a duplicate id`);
  return unique;
}

function assertMembersAvailable(doc, members, owner = null) {
  for (const id of members) {
    if (!findElement(doc, id)) throw new Error(`no element "${id}" to group`);
    const occupied = groupsOf(doc).find((group) => group.id !== owner && group.members.includes(id));
    if (occupied) throw new Error(`element "${id}" already belongs to group "${occupied.id}" — groups are flat, so remove it there first`);
  }
}

export function createGroup(doc, { id, members, label = null }) {
  assertElementId(id);
  assertFreeId(doc, id);
  const normalized = normalizeMembers(members);
  assertMembersAvailable(doc, normalized);
  const group = { id, label: label == null ? id : String(label), members: normalized };
  groupsOf(doc).push(group);
  return group;
}

export function addGroupMembers(doc, id, members) {
  const group = findGroup(doc, id);
  if (!group) throw new Error(`no group "${id}" — create it first`);
  const normalized = normalizeMembers(members);
  assertMembersAvailable(doc, normalized, id);
  for (const member of normalized) if (!group.members.includes(member)) group.members.push(member);
  return group;
}

export function removeGroupMembers(doc, id, members) {
  const group = findGroup(doc, id);
  if (!group) throw new Error(`no group "${id}"`);
  const normalized = normalizeMembers(members);
  for (const member of normalized) {
    if (!group.members.includes(member)) throw new Error(`element "${member}" is not in group "${id}"`);
  }
  group.members = group.members.filter((member) => !normalized.includes(member));
  return group;
}

export function deleteGroup(doc, id) {
  const group = findGroup(doc, id);
  if (!group) throw new Error(`no group "${id}"`);
  groupsOf(doc).splice(groupsOf(doc).indexOf(group), 1);
  return group;
}

export function groupBounds(doc, id) {
  const group = findGroup(doc, id);
  if (!group) throw new Error(`no group "${id}"`);
  const members = group.members.map((member) => findElement(doc, member)).filter(Boolean);
  return boundsOf(members.flatMap(({ element }) => elementRects(element)));
}

export function moveGroup(doc, id, dx, dy) {
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) {
    throw new RangeError(`group movement must use whole quadrants — got ${JSON.stringify({ dx, dy })}`);
  }
  const group = findGroup(doc, id);
  if (!group) throw new Error(`no group "${id}"`);
  if (!group.members.length) throw new Error(`group "${id}" is empty — add members before moving it`);
  const members = group.members.map((member) => {
    const found = findElement(doc, member);
    if (!found) throw new Error(`group "${id}" refers to missing element "${member}"`);
    return found;
  });
  for (const { element } of members) moveElementRaw(element, dx, dy);
  reconcileMovedElements(doc, new Set(members.map(({ element }) => element.id)));
  return group;
}

// A constraint is a durable relationship, not a second geometry model. The
// source of truth remains the elements; these records only say which anchor of
// one element follows which anchor of another and by what exact offset.
export function constraintsOf(doc) {
  if (!Array.isArray(doc.constraints)) doc.constraints = [];
  return doc.constraints;
}

export function findConstraint(doc, id) {
  return constraintsOf(doc).find((constraint) => constraint.id === id) ?? null;
}

function elementBoundsForAnchor(element) {
  return boundsOf(elementRects(element));
}

export function elementAnchor(doc, id, anchor = 'C') {
  const found = findElement(doc, id);
  if (!found) throw new Error(`no element "${id}" to anchor`);
  const spec = String(anchor).toUpperCase();
  parsePortSpec(spec);
  const bounds = elementBoundsForAnchor(found.element);
  if (!bounds) throw new Error(`element "${id}" has no footprint to anchor`);
  return portPoint(bounds, spec);
}

function currentConstraintOffset(doc, constraint) {
  const dependent = elementAnchor(doc, constraint.dependent, constraint.dependentAnchor);
  const target = elementAnchor(doc, constraint.target, constraint.targetAnchor);
  return { x: dependent.x - target.x, y: dependent.y - target.y };
}

function syncConstraintRaw(doc, constraint) {
  const dependent = elementAnchor(doc, constraint.dependent, constraint.dependentAnchor);
  const target = elementAnchor(doc, constraint.target, constraint.targetAnchor);
  const dx = target.x + constraint.offset.x - dependent.x;
  const dy = target.y + constraint.offset.y - dependent.y;
  if (dx || dy) moveElementRaw(findElement(doc, constraint.dependent).element, dx, dy);
}

function propagateConstraints(doc, roots, alreadyMoved = new Set()) {
  const queue = [...roots];
  while (queue.length) {
    const target = queue.shift();
    for (const constraint of constraintsOf(doc).filter((entry) => entry.target === target)) {
      if (alreadyMoved.has(constraint.dependent)) continue;
      syncConstraintRaw(doc, constraint);
      alreadyMoved.add(constraint.dependent);
      queue.push(constraint.dependent);
    }
  }
}

function reconcileMovedElements(doc, moved) {
  for (const constraint of constraintsOf(doc)) {
    if (moved.has(constraint.dependent) && !moved.has(constraint.target)) {
      constraint.offset = currentConstraintOffset(doc, constraint);
    }
  }
  propagateConstraints(doc, moved, new Set(moved));
}

/** Reconcile a resize or redraw that changed an element's anchor without using move. */
export function reconcileElementChange(doc, id) {
  if (!findElement(doc, id)) throw new Error(`no element "${id}" to reconcile`);
  const incoming = constraintsOf(doc).find((constraint) => constraint.dependent === id);
  if (incoming) incoming.offset = currentConstraintOffset(doc, incoming);
  propagateConstraints(doc, [id], new Set([id]));
}

export function createConstraint(doc, {
  id, dependent, target, dependentAnchor = 'C', targetAnchor = 'C', offset = null,
}) {
  assertElementId(id);
  assertFreeId(doc, id);
  if (dependent === target) throw new Error('a constraint cannot make an element follow itself');
  if (!findElement(doc, dependent)) throw new Error(`no dependent element "${dependent}"`);
  if (!findElement(doc, target)) throw new Error(`no target element "${target}"`);
  if (constraintsOf(doc).some((constraint) => constraint.dependent === dependent)) {
    throw new Error(`element "${dependent}" already has a follow constraint — delete it before assigning another parent`);
  }

  const depAnchor = String(dependentAnchor).toUpperCase();
  const targetAnchor_ = String(targetAnchor).toUpperCase();
  parsePortSpec(depAnchor);
  parsePortSpec(targetAnchor_);
  // Syntax alone is insufficient for indexed anchors: E#9 may parse but still
  // be outside a short face. Resolve both before changing the document so a
  // rejected explicit-offset constraint cannot leave a partial record behind.
  elementAnchor(doc, dependent, depAnchor);
  elementAnchor(doc, target, targetAnchor_);

  let cursor = target;
  while (cursor) {
    if (cursor === dependent) throw new Error(`constraint "${id}" would create a cycle through "${dependent}"`);
    cursor = constraintsOf(doc).find((constraint) => constraint.dependent === cursor)?.target ?? null;
  }

  const constraint = {
    id,
    dependent,
    target,
    dependentAnchor: depAnchor,
    targetAnchor: targetAnchor_,
    offset: offset == null ? { x: 0, y: 0 } : { x: offset.x, y: offset.y },
  };
  if (offset != null && (!Number.isInteger(offset.x) || !Number.isInteger(offset.y))) {
    throw new RangeError(`constraint offset must use whole quadrants — got ${JSON.stringify(offset)}`);
  }
  if (offset == null) constraint.offset = currentConstraintOffset(doc, constraint);
  constraintsOf(doc).push(constraint);
  if (offset != null) {
    syncConstraintRaw(doc, constraint);
    propagateConstraints(doc, [dependent], new Set([dependent]));
  }
  return constraint;
}

export function deleteConstraint(doc, id) {
  const constraint = findConstraint(doc, id);
  if (!constraint) throw new Error(`no constraint "${id}"`);
  constraintsOf(doc).splice(constraintsOf(doc).indexOf(constraint), 1);
  return constraint;
}

export function syncConstraints(doc, id = null) {
  if (id) {
    const constraint = findConstraint(doc, id);
    if (!constraint) throw new Error(`no constraint "${id}"`);
    syncConstraintRaw(doc, constraint);
    propagateConstraints(doc, [constraint.dependent], new Set([constraint.dependent]));
    return 1;
  }
  const dependents = new Set(constraintsOf(doc).map((constraint) => constraint.dependent));
  const roots = [...new Set(constraintsOf(doc).map((constraint) => constraint.target).filter((target) => !dependents.has(target)))];
  propagateConstraints(doc, roots);
  return constraintsOf(doc).length;
}

function validateLoadedRelationships(doc) {
  const elementCounts = new Map();
  for (const { id } of allElements(doc)) elementCounts.set(id, (elementCounts.get(id) ?? 0) + 1);
  const claimedIds = new Set(elementCounts.keys());
  const groupOwner = new Map();

  for (const group of groupsOf(doc)) {
    if (!group || typeof group !== 'object') throw new TypeError('saved group must be an object');
    assertElementId(group.id);
    if (claimedIds.has(group.id)) throw new Error(`saved group id "${group.id}" collides with another document id`);
    claimedIds.add(group.id);
    if (!Array.isArray(group.members)) throw new TypeError(`saved group "${group.id}" members must be an array`);
    if (new Set(group.members).size !== group.members.length) throw new Error(`saved group "${group.id}" contains a duplicate member`);
    for (const member of group.members) {
      if (elementCounts.get(member) !== 1) {
        throw new Error(`saved group "${group.id}" member "${member}" must resolve to exactly one element`);
      }
      if (groupOwner.has(member)) {
        throw new Error(`saved element "${member}" belongs to both group "${groupOwner.get(member)}" and "${group.id}"`);
      }
      groupOwner.set(member, group.id);
    }
  }

  const parentOf = new Map();
  for (const constraint of constraintsOf(doc)) {
    if (!constraint || typeof constraint !== 'object') throw new TypeError('saved constraint must be an object');
    assertElementId(constraint.id);
    if (claimedIds.has(constraint.id)) throw new Error(`saved constraint id "${constraint.id}" collides with another document id`);
    claimedIds.add(constraint.id);
    if (constraint.dependent === constraint.target) throw new Error(`saved constraint "${constraint.id}" makes an element follow itself`);
    for (const [role, id] of [['dependent', constraint.dependent], ['target', constraint.target]]) {
      if (elementCounts.get(id) !== 1) {
        throw new Error(`saved constraint "${constraint.id}" ${role} "${id}" must resolve to exactly one element`);
      }
    }
    if (parentOf.has(constraint.dependent)) {
      throw new Error(`saved element "${constraint.dependent}" has more than one follow constraint`);
    }
    if (!constraint.offset || !Number.isInteger(constraint.offset.x) || !Number.isInteger(constraint.offset.y)) {
      throw new RangeError(`saved constraint "${constraint.id}" offset must use whole quadrants`);
    }
    elementAnchor(doc, constraint.dependent, constraint.dependentAnchor);
    elementAnchor(doc, constraint.target, constraint.targetAnchor);
    parentOf.set(constraint.dependent, constraint.target);
  }

  for (const start of parentOf.keys()) {
    const seen = new Set();
    let cursor = start;
    while (parentOf.has(cursor)) {
      if (seen.has(cursor)) throw new Error(`saved follow constraints contain a cycle through "${cursor}"`);
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Footprints
// ---------------------------------------------------------------------------

/** Every rect an element covers. Paths report one rect per quadrant piece. */
export function elementRects(el) {
  if (el.kind === 'path') return el.pieces.map((p) => rect(p.x, p.y, 1, 1));
  return [el.rect];
}

/** Quadrants an element reserves. */
export function elementClaimed(el) {
  if (el.kind === 'path') {
    const s = new Set();
    for (const p of el.pieces) s.add(`${p.x},${p.y}`);
    return s;
  }
  return claimedQuads(el.rect);
}

/** Quadrants an element actually inks — boxes lose their cut corners. */
export function elementVisual(el) {
  if (el.kind === 'path') return elementClaimed(el);
  if (el.kind === 'box') return visualQuads(el.rect, el.corner, el.shape ?? 'process');
  return claimedQuads(el.rect);
}

export function elementBounds(el) {
  return boundsOf(elementRects(el));
}

export function elementsOverlap(a, b) {
  const ra = elementRects(a), rb = elementRects(b);
  for (const x of ra) for (const y of rb) if (rectsOverlap(x, y)) return true;
  return false;
}

/** Bounding rect of everything on one page, or the whole document. */
export function contentBounds(doc, pageId = null) {
  const els = pageId ? elementsOf(doc, pageId) : allElements(doc);
  return boundsOf(els.flatMap(elementRects));
}

// ---------------------------------------------------------------------------
// Serialisation — deterministic key order so diffs stay reviewable in git.
// ---------------------------------------------------------------------------

export function serialize(doc) {
  return JSON.stringify(
    {
      schema: doc.schema,
      name: doc.name,
      canvas: doc.canvas,
      font: doc.font,
      createdAt: doc.createdAt,
      pages: [...doc.pages].sort((a, b) => a.z - b.z),
      elements: Object.fromEntries(doc.pages.map((p) => [p.id, elementsOf(doc, p.id)])),
      ...(groupsOf(doc).length ? {
        groups: groupsOf(doc)
          .map((group) => ({ ...group, members: [...group.members].sort() }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      } : {}),
      ...(constraintsOf(doc).length ? {
        constraints: [...constraintsOf(doc)].sort((a, b) => a.id.localeCompare(b.id)),
      } : {}),
      acceptances: [...doc.acceptances].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)),
      // Composition source is operational data, not a renderer cache. Tools
      // such as export_prompt need it after the document is reopened, and the
      // perspective receipt is the only durable record of real-world inputs.
      ...(doc.wireframe ? { wireframe: doc.wireframe } : {}),
      ...(doc.perspective_scene ? { perspective_scene: doc.perspective_scene } : {}),
      // Present only when the adjudication gate was overridden. Its absence is
      // the normal case and says the document was written clean.
      ...(doc.forcedSave ? { forcedSave: doc.forcedSave } : {}),
    },
    null,
    2,
  );
}

export function deserialize(json) {
  const raw = typeof json === 'string' ? JSON.parse(json) : json;
  if (raw.schema !== SCHEMA_VERSION) {
    throw new Error(`document schema ${raw.schema} is not supported by this build (expected ${SCHEMA_VERSION})`);
  }
  if (raw.groups != null && !Array.isArray(raw.groups)) throw new TypeError('document groups must be an array');
  if (raw.constraints != null && !Array.isArray(raw.constraints)) throw new TypeError('document constraints must be an array');
  const doc = {
    schema: raw.schema,
    name: raw.name,
    canvas: raw.canvas,
    font: { ...DEFAULT_FONT, ...raw.font },
    pages: raw.pages,
    elements: raw.elements,
    groups: (raw.groups ?? []).map((group) => ({ ...group, members: [...(group.members ?? [])] })),
    constraints: (raw.constraints ?? []).map((constraint) => ({
      ...constraint,
      dependentAnchor: constraint.dependentAnchor ?? 'C',
      targetAnchor: constraint.targetAnchor ?? 'C',
      offset: { ...constraint.offset },
    })),
    acceptances: raw.acceptances ?? [],
    createdAt: raw.createdAt,
    ...(raw.wireframe ? { wireframe: raw.wireframe } : {}),
    ...(raw.perspective_scene ? { perspective_scene: raw.perspective_scene } : {}),
    ...(raw.forcedSave ? { forcedSave: raw.forcedSave } : {}),
  };
  for (const [page, elements] of Object.entries(doc.elements ?? {})) {
    if (!Array.isArray(elements)) throw new TypeError(`document elements for page "${page}" must be an array`);
    for (const element of elements) {
      if (element?.kind !== 'image') continue;
      assertImageMode(element.mode ?? 'embed');
      assertImageFit(element.fit ?? 'contain');
      if (element.mode === 'simplify') {
        element.detail ??= 'auto';
        element.supersample ??= 'auto';
        if (!SIMPLIFY_DETAILS.includes(element.detail)) {
          throw new SyntaxError(`simplify detail must be ${SIMPLIFY_DETAILS.join(', ')} — got ${JSON.stringify(element.detail)}`);
        }
        if (element.supersample !== 'auto' && !SIMPLIFY_SUPERSAMPLES.includes(element.supersample)) {
          throw new SyntaxError(`simplify supersample must be auto, ${SIMPLIFY_SUPERSAMPLES.join(', ')} — got ${JSON.stringify(element.supersample)}`);
        }
        if (!element.processing || typeof element.processing.nearBinary !== 'boolean') {
          element.processing = {
            strategy: 'unknown-saved-simplification', requestedDetail: element.detail,
            resolvedDetail: element.detail, requestedSupersample: element.supersample,
            resolvedSupersample: 1, workingCanvas: null, workingSamplesPerOutput: 1,
            nearBinary: false, removedComponents: 0, removedSamples: 0,
          };
        }
      }
      if (element.mode !== 'embed') {
        if (!Array.isArray(element.runs)) throw new TypeError(`${element.mode} image "${element.id}" must carry deterministic runs`);
        element.ditherStats = analyseRuns(element.runs, element.rect.w, element.rect.h);
        if (element.scale?.sourcePx) {
          element.scale = scaleReport(element.scale.sourcePx, {
            cellsWide: element.rect.w / 2, cellsTall: element.rect.h / 2, mode: element.mode, fit: element.fit,
          });
        } else {
          delete element.scale;
        }
      } else {
        const source = assertEmbeddedSource(element.source);
        element.scale = scaleReport(source, {
          cellsWide: element.rect.w / 2, cellsTall: element.rect.h / 2, mode: 'embed', fit: element.fit,
        });
      }
    }
  }
  return validateLoadedRelationships(doc);
}
