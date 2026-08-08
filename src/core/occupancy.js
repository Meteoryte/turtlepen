/**
 * Occupancy index and free-space search.
 *
 * These are the "solver inputs" the AI reasons over: what holds each quadrant,
 * and where the empty rectangles are. Handing back exact numbers — free regions,
 * their sizes, their addresses — lets the AI do arithmetic instead of guessing,
 * which is where it is strong.
 */

import { rect, right, bottom, quadKey } from './geometry.js';
import { quadToAddress, quadToCell } from './address.js';
import { elementsOf, elementClaimed, elementVisual, contentBounds } from './document.js';

/**
 * @returns {Map<string, Array<{id:string, kind:string, ink:boolean}>>}
 *   quadKey -> occupants. `ink` is false for a box's cut-away corner quadrant,
 *   which is claimed but not drawn.
 */
export function buildIndex(doc, pageId) {
  const index = new Map();
  for (const el of elementsOf(doc, pageId)) {
    const visual = elementVisual(el);
    for (const key of elementClaimed(el)) {
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ id: el.id, kind: el.kind, ink: visual.has(key) });
    }
  }
  return index;
}

/** What occupies a given quadrant, by address. */
export function occupantsAt(doc, pageId, x, y) {
  return buildIndex(doc, pageId).get(quadKey(x, y)) ?? [];
}

/** Region to search when the caller does not name one: content plus a margin. */
export function defaultRegion(doc, pageId, marginCells = 4) {
  const b = contentBounds(doc, pageId);
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
export function freeRects(doc, pageId, { region = null, minCellsW = 1, minCellsH = 1, limit = 20 } = {}) {
  const r = region ?? defaultRegion(doc, pageId);
  const index = buildIndex(doc, pageId);
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

/** Coverage statistics for a page — how full it is, in exact quadrant counts. */
export function stats(doc, pageId) {
  const index = buildIndex(doc, pageId);
  const b = contentBounds(doc, pageId);
  const claimed = index.size;
  const inked = [...index.values()].filter((occ) => occ.some((o) => o.ink)).length;
  return {
    elements: elementsOf(doc, pageId).length,
    claimedQuadrants: claimed,
    inkedQuadrants: inked,
    cutCornerQuadrants: claimed - inked,
    bounds: b ? { at: quadToAddress(b.x, b.y), cells: { w: b.w / 2, h: b.h / 2 } } : null,
  };
}
