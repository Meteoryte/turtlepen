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
import { claimedQuads, visualQuads, assertCornerStyle } from './shapes.js';
import { DEFAULT_FONT, resolveFontSize } from './text.js';

export const PAGE_INTENTS = Object.freeze(['exclusive', 'overlay']);
export const SCHEMA_VERSION = 1;

export function createDocument({ name = 'untitled', canvas = { cols: 160, rows: 100 }, font = {} } = {}) {
  const doc = {
    schema: SCHEMA_VERSION,
    name,
    canvas: { cols: canvas.cols, rows: canvas.rows },
    font: { ...DEFAULT_FONT, ...font },
    pages: [],
    elements: {},
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
export const DEFAULT_PAGE_OPACITY = Object.freeze({ exclusive: 1, overlay: 0.92 });

export function assertOpacity(value, what = 'opacity') {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_OPACITY || value > 1) {
    throw new RangeError(`${what} must be a number between ${MIN_OPACITY} and 1 — got ${JSON.stringify(value)}`);
  }
  return value;
}

export function addPage(doc, { id, z = null, intent = 'exclusive', title = null, opacity = null }) {
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new SyntaxError(`page id "${id}" must be non-empty and alphanumeric (dashes and underscores allowed)`);
  }
  if (doc.pages.some((p) => p.id === id)) throw new Error(`page "${id}" already exists`);
  if (!PAGE_INTENTS.includes(intent)) {
    throw new SyntaxError(`page intent must be one of ${PAGE_INTENTS.join(', ')} — got "${intent}"`);
  }
  const zed = z == null ? doc.pages.reduce((m, p) => Math.max(m, p.z), -1) + 1 : z;
  if (doc.pages.some((p) => p.z === zed)) throw new Error(`z-index ${zed} is already occupied by page "${doc.pages.find((p) => p.z === zed).id}"`);
  const page = { id, z: zed, intent, title: title ?? id, visible: true, opacity: assertOpacity(opacity, 'page opacity') ?? DEFAULT_PAGE_OPACITY[intent] };
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
  if (intent != null) {
    if (!PAGE_INTENTS.includes(intent)) throw new SyntaxError(`page intent must be one of ${PAGE_INTENTS.join(', ')} — got "${intent}"`);
    page.intent = intent;
  }
  if (z != null) {
    const clash = doc.pages.find((p) => p.z === z && p.id !== id);
    if (clash) throw new Error(`z-index ${z} is already occupied by page "${clash.id}"`);
    page.z = z;
    doc.pages.sort((a, b) => a.z - b.z);
  }
  if (title != null) page.title = title;
  if (opacity != null) page.opacity = assertOpacity(opacity, 'page opacity');
  if (visible != null) page.visible = Boolean(visible);
  return page;
}

export function removePage(doc, id) {
  const page = getPage(doc, id);
  if (doc.pages.length === 1) throw new Error('a document must keep at least one page');
  doc.pages.splice(doc.pages.indexOf(page), 1);
  delete doc.elements[id];
  return page;
}

/** Rename an element. Ids are how pen targets like `to db.W` resolve, so the
 *  new name must be free across the whole document. */
export function renameElement(doc, id, newId) {
  const found = findElement(doc, id);
  if (!found) throw new Error(`no element "${id}" to rename`);
  if (id === newId) return found.element;
  assertFreeId(doc, newId);
  found.element.id = newId;
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
}

export function addBox(doc, pageId, { id, rect: r, label = '', fontSize = null, corner = 'square', align = 'left', fill = null, note = null, opacity = null, state = null }) {
  getPage(doc, pageId);
  assertFreeId(doc, id);
  assertCornerStyle(corner);
  const el = {
    id,
    kind: 'box',
    rect: rect(r.x, r.y, r.w, r.h),
    label,
    fontSize: fontSize == null ? doc.font.size : resolveFontSize(fontSize),
    corner,
    align,
    fill,
    note,
    opacity: assertOpacity(opacity, 'element opacity'),
    state,
  };
  doc.elements[pageId].push(el);
  return el;
}

export function addImage(doc, pageId, { id, rect: r, source, mode = 'embed', fit = 'contain', opacity = null, note = null }) {
  getPage(doc, pageId);
  assertFreeId(doc, id);
  const el = {
    id,
    kind: 'image',
    rect: rect(r.x, r.y, r.w, r.h),
    source,
    mode,
    fit,
    opacity: assertOpacity(opacity, 'element opacity'),
    note,
  };
  doc.elements[pageId].push(el);
  return el;
}

export function addPath(doc, pageId, { id, pieces, stroke = null, note = null }) {
  getPage(doc, pageId);
  assertFreeId(doc, id);
  if (!pieces.length) throw new Error(`path "${id}" has no pieces — a pen program must draw at least one quadrant`);
  const el = { id, kind: 'path', pieces, stroke, note };
  doc.elements[pageId].push(el);
  return el;
}

export function addText(doc, pageId, { id, rect: r, text, fontSize = null, align = 'left' }) {
  getPage(doc, pageId);
  assertFreeId(doc, id);
  const el = { id, kind: 'text', rect: rect(r.x, r.y, r.w, r.h), text, fontSize: fontSize == null ? doc.font.size : resolveFontSize(fontSize), align };
  doc.elements[pageId].push(el);
  return el;
}

export function removeElement(doc, id, pageId = null) {
  const found = findElement(doc, id, pageId);
  if (!found) throw new Error(`no element "${id}"${pageId ? ` on page "${pageId}"` : ''}`);
  const list = doc.elements[found.page];
  list.splice(list.findIndex((e) => e.id === id), 1);
  return found;
}

export function moveElement(doc, id, dx, dy, pageId = null) {
  const found = findElement(doc, id, pageId);
  if (!found) throw new Error(`no element "${id}" to move`);
  const el = found.element;
  if (el.kind === 'path') {
    for (const p of el.pieces) { p.x += dx; p.y += dy; }
  } else {
    el.rect = rect(el.rect.x + dx, el.rect.y + dy, el.rect.w, el.rect.h);
  }
  return found;
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
  if (el.kind === 'box') return visualQuads(el.rect, el.corner);
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
      acceptances: [...doc.acceptances].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)),
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
  return {
    schema: raw.schema,
    name: raw.name,
    canvas: raw.canvas,
    font: { ...DEFAULT_FONT, ...raw.font },
    pages: raw.pages,
    elements: raw.elements,
    acceptances: raw.acceptances ?? [],
    createdAt: raw.createdAt,
  };
}
