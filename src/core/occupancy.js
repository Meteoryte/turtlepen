/**
 * Occupancy index and free-space search.
 *
 * These are the "solver inputs" the AI reasons over: what holds each quadrant,
 * and where the empty rectangles are. Handing back exact numbers — free regions,
 * their sizes, their addresses — lets the AI do arithmetic instead of guessing,
 * which is where it is strong.
 */

import { rect, right, bottom, quadKey, boundsOf } from './geometry.js';
import { quadToAddress, quadToCell } from './address.js';
import { elementsOf, elementClaimed, elementVisual, elementRects, getPage } from './document.js';

export const FREE_SPACE_SCOPES = Object.freeze(['page', 'stack']);

/** Resolve the exact pages that constrain a free-space query. */
export function freeSpaceContext(doc, pageId, scope = 'page') {
  const target = getPage(doc, pageId);
  if (!FREE_SPACE_SCOPES.includes(scope)) {
    throw new SyntaxError(`free-space scope must be ${FREE_SPACE_SCOPES.join(' or ')} — got ${JSON.stringify(scope)}`);
  }
  if (scope === 'page') {
    return { scope, targetPage: target.id, pageIds: [target.id], ignoredReferencePages: [] };
  }

  // A tracing reference is scaffolding whose declared purpose is to be drawn
  // over. Counting it as occupied would make every useful trace region appear
  // unavailable. The target itself remains included if someone explicitly
  // searches a reference page.
  const included = doc.pages.filter((page) => page.id === target.id || !page.reference);
  const ignored = doc.pages.filter((page) => page.id !== target.id && page.reference);
  return {
    scope,
    targetPage: target.id,
    pageIds: included.map((page) => page.id),
    ignoredReferencePages: ignored.map((page) => page.id),
  };
}

/**
 * @returns {Map<string, Array<{id:string, kind:string, ink:boolean}>>}
 *   quadKey -> occupants. `ink` is false for a box's cut-away corner quadrant,
 *   which is claimed but not drawn.
 */
export function buildIndex(doc, pageId) {
  return buildIndexForPages(doc, [getPage(doc, pageId).id]);
}

/** Merge claimed occupancy across an explicit set of pages. */
export function buildIndexForPages(doc, pageIds) {
  const index = new Map();
  for (const pageId of pageIds) {
    getPage(doc, pageId);
    for (const el of elementsOf(doc, pageId)) {
      const visual = elementVisual(el);
      for (const key of elementClaimed(el)) {
        if (!index.has(key)) index.set(key, []);
        index.get(key).push({ id: el.id, kind: el.kind, ink: visual.has(key) });
      }
    }
  }
  return index;
}

/** What occupies a given quadrant, by address. */
export function occupantsAt(doc, pageId, x, y) {
  return buildIndex(doc, pageId).get(quadKey(x, y)) ?? [];
}

/** Region to search when the caller does not name one: content plus a margin. */
export function defaultRegion(doc, pageId, marginCells = 4, { scope = 'page' } = {}) {
  const context = freeSpaceContext(doc, pageId, scope);
  const b = boundsOf(
    context.pageIds.flatMap((id) => elementsOf(doc, id).flatMap(elementRects)),
  );
  const m = marginCells * 2;
  if (!b) return rect(0, 0, Math.min(doc.canvas.cols, 40) * 2, Math.min(doc.canvas.rows, 30) * 2);
  return rect(Math.max(0, b.x - m), Math.max(0, b.y - m), b.w + m * 2, b.h + m * 2);
}

/**
 * Maximal free rectangles inside a region, largest first.
 *
 * Uses the standard largest-rectangle-in-histogram sweep: for each row, treat
 * the run of free quadrants above each column as a bar, then pop the stack to
 * emit every maximal rectangle whose bottom edge is that row.
 *
 * @returns {Array<{rect:object, cells:{w:number,h:number}, area:number, at:string}>}
 */
export function freeRects(doc, pageId, { region = null, minCellsW = 1, minCellsH = 1, limit = 20, scope = 'page' } = {}) {
  assertPositiveCellCount(minCellsW, 'minimum width');
  assertPositiveCellCount(minCellsH, 'minimum height');
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`free-space limit must be a positive integer — got ${JSON.stringify(limit)}`);
  const context = freeSpaceContext(doc, pageId, scope);
  const r = region ?? defaultRegion(doc, pageId, 4, { scope });
  const index = buildIndexForPages(doc, context.pageIds);
  const W = r.w, H = r.h;
  const minW = minCellsW * 2, minH = minCellsH * 2;

  const occupied = (x, y) => index.has(quadKey(r.x + x, r.y + y));
  const heights = new Array(W).fill(0);
  const found = new Map();

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) heights[x] = occupied(x, y) ? 0 : heights[x] + 1;

    const stack = [];
    for (let x = 0; x <= W; x++) {
      const h = x === W ? 0 : heights[x];
      let startX = x;
      while (stack.length && stack[stack.length - 1].h >= h) {
        const top = stack.pop();
        emit(found, r, top.x, y - top.h + 1, x - top.x, top.h, minW, minH);
        startX = top.x;
      }
      if (h > 0) stack.push({ x: startX, h });
    }
  }

  return [...found.values()]
    .sort((a, b) => b.area - a.area || a.rect.y - b.rect.y || a.rect.x - b.rect.x)
    .slice(0, limit);
}

function emit(found, region, x, y, w, h, minW, minH) {
  if (w < minW || h < minH) return;
  const abs = rect(region.x + x, region.y + y, w, h);
  const key = `${abs.x},${abs.y},${abs.w},${abs.h}`;
  if (found.has(key)) return;
  found.set(key, {
    rect: abs,
    cells: { w: abs.w / 2, h: abs.h / 2 },
    area: abs.w * abs.h,
    at: quadToAddress(abs.x, abs.y),
    cellRange: `${quadToCell(abs.x, abs.y)}:${quadToCell(right(abs) - 1, bottom(abs) - 1)}`,
  });
}

/**
 * The first free rectangle large enough to hold something of a given cell size,
 * searched in reading order. The common question an AI asks: "where can I put a
 * 12x5 box without touching anything?"
 */
export function firstFitting(doc, pageId, cellsW, cellsH, opts = {}) {
  assertPositiveCellCount(cellsW, 'width');
  assertPositiveCellCount(cellsH, 'height');
  const candidates = freeRects(doc, pageId, { ...opts, minCellsW: cellsW, minCellsH: cellsH, limit: 200 });
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const spot = sorted[0];
  return {
    at: quadToAddress(spot.rect.x, spot.rect.y),
    cell: quadToCell(spot.rect.x, spot.rect.y),
    rect: rect(spot.rect.x, spot.rect.y, cellsW * 2, cellsH * 2),
    within: spot,
  };
}

function assertPositiveCellCount(value, what) {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`free-space ${what} must be a positive whole-cell count — got ${JSON.stringify(value)}`);
  }
}

/** Coverage statistics for a page — how full it is, in exact quadrant counts. */
export function stats(doc, pageId, { scope = 'page' } = {}) {
  const context = freeSpaceContext(doc, pageId, scope);
  const index = buildIndexForPages(doc, context.pageIds);
  const b = boundsOf(
    context.pageIds.flatMap((id) => elementsOf(doc, id).flatMap(elementRects)),
  );
  const claimed = index.size;
  const inked = [...index.values()].filter((occ) => occ.some((o) => o.ink)).length;
  return {
    elements: context.pageIds.reduce((count, id) => count + elementsOf(doc, id).length, 0),
    claimedQuadrants: claimed,
    inkedQuadrants: inked,
    cutCornerQuadrants: claimed - inked,
    bounds: b ? { at: quadToAddress(b.x, b.y), cells: { w: b.w / 2, h: b.h / 2 } } : null,
  };
}
