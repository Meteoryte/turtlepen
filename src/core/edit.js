/**
 * Lattice-native editing operations.
 *
 * TurtlePen stores geometry as whole quadrants, not floating-point curves. These
 * operations therefore act on exact quadrant sets: boolean operations are set
 * algebra, offsets are square-grid morphology, and slices partition at a named
 * lattice boundary. They deliberately do not pretend to be Bézier clipping.
 */

import { boundsOf, parseQuadKey, quadKey, rect } from './geometry.js';
import { parseAddress, pinPoint, quadToAddress } from './address.js';
import { rayQuads } from './raster.js';
import {
  addPath, assertFreeId, constraintsOf, elementClaimed, elementVisual, elementsOf,
  findElement, groupsOf, normalizeColor, reconcileElementChange,
} from './document.js';

export const BOOLEAN_ACTIONS = Object.freeze(['union', 'difference', 'intersection', 'xor']);
export const SLICE_AXES = Object.freeze(['vertical', 'horizontal']);
export const SLICE_MODES = Object.freeze(['divide', 'partition']);
export const PATH_EDIT_ACTIONS = Object.freeze(['insert', 'delete', 'move', 'move_many', 'align_nodes', 'trim', 'extend_to', 'interpolate', 'reverse', 'open', 'close', 'split', 'join']);
export const REORDER_ACTIONS = Object.freeze(['bring_to_front', 'send_to_back', 'raise', 'lower', 'before', 'after']);
export const FOOTPRINTS = Object.freeze(['visual', 'claimed']);
export const MAX_ARRAY_COPIES = 100;
export const MAX_DERIVED_QUADS = 250000;

const ID_RE = /^[A-Za-z0-9_-]+$/;
const CARDINAL_OPPOSITE = Object.freeze({ up: 'down', down: 'up', left: 'right', right: 'left' });
const quadCompare = (a, b) => a.y - b.y || a.x - b.x;

function assertElementId(id, what = 'element id') {
  if (!id || !ID_RE.test(String(id))) {
    throw new SyntaxError(`${what} "${id}" must be non-empty and alphanumeric (dashes and underscores allowed)`);
  }
  return String(id);
}

function assertFootprint(footprint) {
  if (!FOOTPRINTS.includes(footprint)) {
    throw new SyntaxError(`footprint must be ${FOOTPRINTS.join(' or ')} — got ${JSON.stringify(footprint)}`);
  }
  return footprint;
}

function assertInteger(value, what) {
  if (!Number.isInteger(value)) throw new RangeError(`${what} must be a whole quadrant count — got ${JSON.stringify(value)}`);
  return value;
}

function assertPositiveInteger(value, what) {
  assertInteger(value, what);
  if (value < 1) throw new RangeError(`${what} must be at least 1 — got ${JSON.stringify(value)}`);
  return value;
}

function pointAtAddress(value, what) {
  if (typeof value !== 'string' || !value.trim()) throw new SyntaxError(`${what} must be an address such as C4.q1`);
  return pinPoint(parseAddress(value));
}

function foundElements(doc, ids, { samePage = false, what = 'ids' } = {}) {
  if (!Array.isArray(ids) || !ids.length) throw new RangeError(`${what} must name at least one element`);
  const names = ids.map((id) => String(id));
  if (new Set(names).size !== names.length) throw new Error(`${what} must not contain duplicate element ids`);
  const found = names.map((id) => {
    const result = findElement(doc, id);
    if (!result) throw new Error(`no element "${id}"`);
    return result;
  });
  if (samePage && new Set(found.map((entry) => entry.page)).size !== 1) {
    throw new Error(`${what} must all be on one page; move them to a common page before combining their geometry`);
  }
  return found;
}

function foundPath(doc, id) {
  const found = findElement(doc, id);
  if (!found) throw new Error(`no path "${id}"`);
  if (found.element.kind !== 'path') throw new Error(`"${id}" is a ${found.element.kind}, not a path`);
  return found;
}

function cellsOf(element, footprint) {
  return new Set(footprint === 'visual' ? elementVisual(element) : elementClaimed(element));
}

function sortedPoints(cells) {
  return [...cells].map(parseQuadKey).sort(quadCompare);
}

function piecesOf(cells) {
  return sortedPoints(cells).map(({ x, y }) => ({ x, y, type: 'mark', style: 'square' }));
}

function assertDerivedSet(cells, what) {
  if (!cells.size) throw new RangeError(`${what} would leave no quadrants — TurtlePen refuses to create an invisible result`);
  if (cells.size > MAX_DERIVED_QUADS) {
    throw new RangeError(`${what} would create ${cells.size} quadrants, over the ${MAX_DERIVED_QUADS} quadrant safety limit`);
  }
  for (const key of cells) {
    const { x, y } = parseQuadKey(key);
    if (x < 0 || y < 0) {
      throw new RangeError(
        `${what} would reach ${quadToAddress(x, y)}. TurtlePen has no negative lattice addresses; move the source inward or use a smaller outward offset.`,
      );
    }
  }
}

function derivedStroke(found, color) {
  const source = found.element;
  const chosen = color ?? source.stroke?.color ?? source.fill ?? source.color ?? '#2b2a26';
  return {
    color: normalizeColor(chosen, 'derived geometry color'),
    width: 5,
    cap: 'butt',
    paint: 'cells',
  };
}

function assertOutputIds(doc, sources, outputIds, { removeSources = true } = {}) {
  const sourceIds = new Set(sources.map(({ element }) => element.id));
  const seen = new Set();
  for (const raw of outputIds) {
    const id = assertElementId(raw, 'result id');
    if (seen.has(id)) throw new Error(`result ids contain duplicate "${id}"`);
    seen.add(id);
    if (sourceIds.has(id)) {
      if (!removeSources) throw new Error(`result id "${id}" already exists; choose a new id when keeping sources`);
    } else {
      assertFreeId(doc, id);
    }
  }
}

function replacementOwner(doc, sources, outputIds, removeSources) {
  if (!removeSources) return null;
  const sourceIds = new Set(sources.map(({ element }) => element.id));
  const resultIds = new Set(outputIds);
  const removedIds = [...sourceIds].filter((id) => !resultIds.has(id));
  const relationship = constraintsOf(doc).find(
    (constraint) => removedIds.includes(constraint.dependent) || removedIds.includes(constraint.target),
  );
  if (relationship) {
    throw new Error(
      `cannot replace "${removedIds.find((id) => id === relationship.dependent || id === relationship.target)}" while constraint `
      + `"${relationship.id}" refers to it — delete or retarget the relationship explicitly first`,
    );
  }

  const owners = groupsOf(doc).filter((group) => group.members.some((member) => sourceIds.has(member)));
  if (owners.length > 1) {
    throw new Error(
      `cannot replace geometry from multiple groups (${owners.map((group) => `"${group.id}"`).join(', ')}) with one ownership result; ungroup or choose sources from one group first`,
    );
  }
  return owners[0] ?? null;
}

function insertDerivedPaths(doc, sources, specs, { removeSources = true } = {}) {
  if (!sources.length) throw new Error('a derived operation needs at least one source');
  const page = sources[0].page;
  const list = elementsOf(doc, page);
  const sourceIds = new Set(sources.map(({ element }) => element.id));
  const outputIds = specs.map((spec) => spec.id);

  if (sources.some((source) => source.page !== page)) throw new Error('derived geometry sources must share a page');
  assertOutputIds(doc, sources, outputIds, { removeSources });
  const owner = replacementOwner(doc, sources, outputIds, removeSources);

  for (const spec of specs) {
    const cells = spec.cells ?? new Set(spec.pieces.map((piece) => quadKey(piece.x, piece.y)));
    assertDerivedSet(cells, `result "${spec.id}"`);
  }
  const indexes = sources.map(({ element }) => list.indexOf(element));
  if (indexes.some((index) => index < 0)) throw new Error('source element is no longer on its recorded page');
  const insertionIndex = removeSources ? Math.min(...indexes) : Math.max(...indexes) + 1;

  if (removeSources) {
    for (const index of [...indexes].sort((a, b) => b - a)) list.splice(index, 1);
  }

  const created = specs.map((spec) => {
    const path = addPath(doc, page, {
      id: spec.id,
      pieces: spec.pieces ? spec.pieces.map((piece) => ({ ...piece })) : piecesOf(spec.cells),
      stroke: spec.stroke,
      role: spec.role ?? 'artwork',
    });
    if (spec.closed) path.closed = true;
    if (spec.provenance) path.provenance = spec.provenance;
    return path;
  });

  for (const path of created) list.splice(list.indexOf(path), 1);
  list.splice(insertionIndex, 0, ...created);

  if (removeSources && owner) {
    owner.members = owner.members.filter((member) => !sourceIds.has(member));
    owner.members.push(...created.map((path) => path.id));
  }
  for (const path of created) {
    if (sourceIds.has(path.id)) reconcileElementChange(doc, path.id);
  }

  return { page, created };
}

function setUnion(sets) {
  const result = new Set();
  for (const cells of sets) for (const cell of cells) result.add(cell);
  return result;
}

function setDifference(sets) {
  const result = new Set(sets[0]);
  for (const cells of sets.slice(1)) for (const cell of cells) result.delete(cell);
  return result;
}

function setIntersection(sets) {
  const result = new Set(sets[0]);
  for (const cell of result) if (sets.some((cells) => !cells.has(cell))) result.delete(cell);
  return result;
}

function setXor(sets) {
  const seen = new Map();
  for (const cells of sets) {
    for (const cell of cells) seen.set(cell, (seen.get(cell) ?? 0) + 1);
  }
  return new Set([...seen].filter(([, count]) => count % 2 === 1).map(([cell]) => cell));
}

/**
 * Apply exact set algebra to visible or claimed lattice geometry.
 *
 * The result is a cell-painted artwork path. This makes its exported appearance,
 * collision footprint, and persisted geometry all agree exactly.
 */
export function booleanGeometry(doc, {
  action, ids, id = null, removeSources = true, footprint = 'visual', color = null,
} = {}) {
  const operation = String(action ?? '').toLowerCase();
  if (!BOOLEAN_ACTIONS.includes(operation)) {
    throw new SyntaxError(`boolean action must be ${BOOLEAN_ACTIONS.join(', ')} — got ${JSON.stringify(action)}`);
  }
  assertFootprint(footprint);
  const sources = foundElements(doc, ids, { samePage: true, what: 'boolean ids' });
  if (sources.length < 2) throw new RangeError(`boolean ${operation} needs at least two source elements`);
  const sets = sources.map(({ element }) => cellsOf(element, footprint));
  const cells = {
    union: () => setUnion(sets),
    difference: () => setDifference(sets),
    intersection: () => setIntersection(sets),
    xor: () => setXor(sets),
  }[operation]();
  assertDerivedSet(cells, `boolean ${operation}`);

  const resultId = id ?? (removeSources ? sources[0].element.id : `${sources[0].element.id}-${operation}`);
  const { page, created } = insertDerivedPaths(doc, sources, [{
    id: resultId,
    cells,
    stroke: derivedStroke(sources[0], color),
    provenance: { operation: `boolean_${operation}`, sources: sources.map(({ element }) => element.id), footprint },
  }], { removeSources });
  return {
    operation,
    page,
    sources: sources.map(({ element }) => element.id),
    result: created[0].id,
    quadrants: cells.size,
  };
}

function connectedComponents(cells) {
  const visited = new Set();
  const components = [];
  for (const seed of sortedPoints(cells)) {
    const seedKey = quadKey(seed.x, seed.y);
    if (visited.has(seedKey)) continue;
    const component = new Set();
    const queue = [seed];
    visited.add(seedKey);
    while (queue.length) {
      const current = queue.pop();
      const currentKey = quadKey(current.x, current.y);
      component.add(currentKey);
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        const x = current.x + dx, y = current.y + dy, key = quadKey(x, y);
        if (cells.has(key) && !visited.has(key)) {
          visited.add(key);
          queue.push({ x, y });
        }
      }
    }
    components.push(component);
  }
  return components.sort((a, b) => quadCompare(sortedPoints(a)[0], sortedPoints(b)[0]));
}

/**
 * Partition one element at a vertical or horizontal lattice boundary.
 *
 * `divide` emits every edge-connected output; `partition` emits just the two
 * sides, which can each contain disconnected pieces. No quadrant is guessed,
 * discarded, or split fractionally.
 */
export function sliceGeometry(doc, {
  id, axis, at, cutter = null, ids = null, mode = 'divide', footprint = 'visual', color = null,
} = {}) {
  if (cutter != null && (axis != null || at != null)) throw new Error('slice needs either cutter or axis/at, not both');
  if (cutter == null && !SLICE_AXES.includes(axis)) {
    throw new SyntaxError(`slice axis must be ${SLICE_AXES.join(' or ')} — got ${JSON.stringify(axis)}`);
  }
  if (!SLICE_MODES.includes(mode)) {
    throw new SyntaxError(`slice mode must be ${SLICE_MODES.join(' or ')} — got ${JSON.stringify(mode)}`);
  }
  assertFootprint(footprint);
  const source = foundElements(doc, [id], { samePage: true, what: 'slice id' })[0];
  if (cutter === id) throw new Error('slice cutter must differ from the source');
  const knife = cutter == null ? null : foundElements(doc, [cutter], { what: 'slice cutter' })[0];
  const knifeCells = knife ? cellsOf(knife.element, footprint) : null;
  const point = knife ? null : pointAtAddress(at, 'slice boundary');
  const cells = cellsOf(source.element, footprint);
  const before = new Set();
  const after = new Set();
  for (const cell of cells) {
    const point_ = parseQuadKey(cell);
    const isBefore = knifeCells ? !knifeCells.has(cell) : axis === 'vertical' ? point_.x < point.x : point_.y < point.y;
    (isBefore ? before : after).add(cell);
  }
  if (!before.size || !after.size) {
    throw new RangeError(
      `slice boundary ${cutter ?? at} does not partition "${source.element.id}" — it must leave geometry in both partitions`,
    );
  }

  const parts = mode === 'divide'
    ? [...connectedComponents(before), ...connectedComponents(after)]
    : [before, after];
  if (parts.length < 2) throw new Error('slice did not produce more than one addressable result');
  if (!Array.isArray(ids) && ids != null) throw new TypeError('slice ids must be an array when supplied');
  const outputIds = ids == null
    ? parts.map((_, index) => `${source.element.id}-part-${index + 1}`)
    : ids.map((entry) => String(entry));
  if (outputIds.length !== parts.length) {
    throw new RangeError(`slice produced ${parts.length} part(s), so ids must contain exactly ${parts.length} entries`);
  }
  const { page, created } = insertDerivedPaths(doc, [source], parts.map((part, index) => ({
    id: outputIds[index],
    cells: part,
    stroke: derivedStroke(source, color),
    provenance: {
      operation: 'slice',
      source: source.element.id,
      ...(cutter ? { cutter } : {}),
      axis,
      at,
      mode,
      footprint,
      part: index + 1,
    },
  })));
  return {
    page,
    source: source.element.id,
    ...(cutter ? { cutter } : {}),
    axis,
    at,
    created: created.map((path) => path.id),
    quadrants: created.map((path) => path.pieces.length),
  };
}

function dilate(cells, distance) {
  const result = new Set();
  for (const cell of cells) {
    const { x, y } = parseQuadKey(cell);
    for (let dy = -distance; dy <= distance; dy++) {
      for (let dx = -distance; dx <= distance; dx++) result.add(quadKey(x + dx, y + dy));
    }
  }
  return result;
}

function erode(cells, distance) {
  const result = new Set();
  for (const cell of cells) {
    const { x, y } = parseQuadKey(cell);
    let covered = true;
    for (let dy = -distance; dy <= distance && covered; dy++) {
      for (let dx = -distance; dx <= distance; dx++) {
        if (!cells.has(quadKey(x + dx, y + dy))) {
          covered = false;
          break;
        }
      }
    }
    if (covered) result.add(cell);
  }
  return result;
}

/** Offset lattice geometry using a square (Chebyshev) neighborhood. */
export function offsetPath(doc, {
  id, distance, resultId = null, removeSource = true, footprint = 'visual', color = null,
} = {}) {
  assertFootprint(footprint);
  assertInteger(distance, 'offset distance');
  if (distance === 0) throw new RangeError('offset distance must be non-zero; omit the operation rather than recording a fake edit');
  const source = foundElements(doc, [id], { samePage: true, what: 'offset id' })[0];
  const input = cellsOf(source.element, footprint);
  const cells = distance > 0 ? dilate(input, distance) : erode(input, Math.abs(distance));
  assertDerivedSet(cells, `offset of "${source.element.id}"`);
  const targetId = resultId ?? (removeSource ? source.element.id : `${source.element.id}-offset`);
  const { page, created } = insertDerivedPaths(doc, [source], [{
    id: targetId,
    cells,
    stroke: derivedStroke(source, color),
    provenance: {
      operation: 'offset_path',
      source: source.element.id,
      distance,
      metric: 'chebyshev',
      footprint,
    },
  }], { removeSources: removeSource });
  return { page, source: source.element.id, result: created[0].id, distance, quadrants: cells.size };
}

/**
 * Materialise a path's already-exact collision footprint as cell-painted path
 * geometry. Widths smaller than a quadrant cannot honestly gain fractional area.
 */
export function strokeToPath(doc, {
  id, resultId = null, removeSource = true, color = null,
} = {}) {
  const source = foundPath(doc, id);
  const cells = new Set(elementClaimed(source.element));
  assertDerivedSet(cells, `stroke-to-path for "${id}"`);
  const targetId = resultId ?? (removeSource ? source.element.id : `${source.element.id}-outline`);
  const { page, created } = insertDerivedPaths(doc, [source], [{
    id: targetId,
    cells,
    stroke: derivedStroke(source, color),
    provenance: {
      operation: 'stroke_to_path',
      source: source.element.id,
      sourceWidthPx: source.element.stroke?.width ?? 5,
      latticeFootprint: 'claimed quadrants',
    },
  }], { removeSources: removeSource });
  return { page, source: source.element.id, result: created[0].id, quadrants: cells.size };
}

function assertPieceIndex(index, length, { allowEnd = false, what = 'path index' } = {}) {
  assertInteger(index, what);
  const max = allowEnd ? length : length - 1;
  if (index < 0 || index > max) throw new RangeError(`${what} must be between 0 and ${max} — got ${index}`);
  return index;
}

function touching(a, b) {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

function reversePiece(piece) {
  const next = { ...piece };
  if (next.dir) next.dir = CARDINAL_OPPOSITE[next.dir] ?? next.dir;
  if (next.type === 'corner') delete next.dir;
  return next;
}

function clearPenProgramState(path) {
  delete path.end;
  delete path.targets;
  delete path.source;
}

function updatePathPieces(doc, found, pieces, { closed = null } = {}) {
  if (!pieces.length) throw new Error(`path "${found.element.id}" needs at least one quadrant`);
  for (const piece of pieces) {
    assertInteger(piece.x, 'path piece x');
    assertInteger(piece.y, 'path piece y');
    if (piece.x < 0 || piece.y < 0) throw new RangeError(`path "${found.element.id}" cannot contain an off-grid quadrant`);
  }
  found.element.pieces = pieces.map((piece) => ({ ...piece }));
  clearPenProgramState(found.element);
  const inferredClosed = found.element.pieces.length >= 4 && touching(found.element.pieces[0], found.element.pieces.at(-1));
  if (closed ?? (found.element.closed && inferredClosed)) found.element.closed = true;
  else delete found.element.closed;
  reconcileElementChange(doc, found.element.id);
  return found.element;
}

function pathSpecFrom(path, id, pieces, provenance) {
  return {
    id,
    pieces: pieces.map((piece) => ({ ...piece })),
    stroke: path.stroke ?? null,
    role: path.role ?? 'connector',
    provenance,
    closed: false,
  };
}

/** Edit explicit lattice path pieces; edits intentionally clear resumable pen state. */
export function editPath(doc, {
  id, action, index = null, at = null, ids = null, with: joinWith = null,
  indices = null, dx = 0, dy = 0, axis = null, endIndex = null, cutter = null,
} = {}) {
  if (!PATH_EDIT_ACTIONS.includes(action)) {
    throw new SyntaxError(`path_edit action must be ${PATH_EDIT_ACTIONS.join(', ')} — got ${JSON.stringify(action)}`);
  }
  const found = foundPath(doc, id);
  const path = found.element;
  const pieces = path.pieces.map((piece) => ({ ...piece }));

  if (['move_many', 'align_nodes'].includes(action)) {
    if (!Array.isArray(indices) || !indices.length || new Set(indices).size !== indices.length) throw new Error(`${action} needs unique piece indices`);
    for (const i of indices) assertPieceIndex(i, pieces.length);
    assertInteger(dx, 'node dx'); assertInteger(dy, 'node dy');
    const target = action === 'align_nodes' ? pointAtAddress(at, 'node alignment') : null;
    if (target && !SLICE_AXES.includes(axis)) throw new Error('align_nodes axis must be horizontal or vertical');
    for (const i of indices) {
      pieces[i].x = target && axis === 'vertical' ? target.x : pieces[i].x + (target ? 0 : dx);
      pieces[i].y = target && axis === 'horizontal' ? target.y : pieces[i].y + (target ? 0 : dy);
    }
    updatePathPieces(doc, found, pieces);
    return { id, action, indices, changed: indices.length };
  }
  if (action === 'trim' || action === 'interpolate') {
    assertPieceIndex(index, pieces.length); assertPieceIndex(endIndex, pieces.length);
    if (endIndex <= index) throw new Error(`${action} needs endIndex after index`);
    let result = pieces.slice(index, endIndex + 1);
    if (action === 'interpolate') {
      const a = pieces[index], b = pieces[endIndex];
      if (Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) > MAX_DERIVED_QUADS - pieces.length) throw new RangeError('interpolation exceeds derived geometry limit');
      const bridge = rayQuads(a.x, a.y, b.x, b.y).map(p => ({ ...a, ...p, type: 'line' }));
      result = [...pieces.slice(0, index + 1), ...bridge.slice(1, -1), ...pieces.slice(endIndex)];
    }
    updatePathPieces(doc, found, result, { closed: false });
    return { id, action, quadrants: result.length };
  }
  if (action === 'extend_to') {
    const other = foundElements(doc, [cutter], { what: 'extension cutter' })[0];
    if (cutter === id || pieces.length < 2) throw new Error('extend_to needs another object and a path with a terminal direction');
    const tip = pieces.at(-1);
    const previous = pieces.slice(0, -1).reverse().find(p => p.x !== tip.x || p.y !== tip.y);
    if (!previous) throw new Error('extend_to cannot infer a direction from coincident pieces');
    const vx = tip.x - previous.x, vy = tip.y - previous.y;
    const hits = [...elementClaimed(other.element)].map(parseQuadKey).filter(p => {
      const x = p.x - tip.x, y = p.y - tip.y;
      return x * vy === y * vx && x * vx + y * vy > 0;
    }).sort((a, b) => (a.x - tip.x) ** 2 + (a.y - tip.y) ** 2 - ((b.x - tip.x) ** 2 + (b.y - tip.y) ** 2));
    if (!hits.length) throw new Error('terminal ray has no forward lattice intersection with the cutter');
    const target = hits[0];
    if (Math.max(Math.abs(target.x - tip.x), Math.abs(target.y - tip.y)) + pieces.length > MAX_DERIVED_QUADS) throw new RangeError('extension exceeds derived geometry limit');
    const extension = rayQuads(tip.x, tip.y, target.x, target.y).slice(1).map(p => ({ ...p, type: 'line' }));
    updatePathPieces(doc, found, [...pieces, ...extension], { closed: false });
    return { id, action, cutter, at: quadToAddress(target.x, target.y), added: extension.length };
  }

  if (action === 'insert') {
    const position = assertPieceIndex(index, pieces.length, { allowEnd: true });
    const point = pointAtAddress(at, 'insert location');
    const next = { x: point.x, y: point.y, type: 'mark', style: 'square' };
    updatePathPieces(doc, found, [...pieces.slice(0, position), next, ...pieces.slice(position)]);
    return { page: found.page, id, action, quadrants: found.element.pieces.length };
  }
  if (action === 'move') {
    const position = assertPieceIndex(index, pieces.length);
    const point = pointAtAddress(at, 'move location');
    pieces[position] = { ...pieces[position], x: point.x, y: point.y };
    updatePathPieces(doc, found, pieces);
    return { page: found.page, id, action, quadrants: found.element.pieces.length };
  }
  if (action === 'delete') {
    const position = assertPieceIndex(index, pieces.length);
    if (pieces.length === 1) throw new Error(`cannot delete the only quadrant in path "${id}" — remove the element instead`);
    pieces.splice(position, 1);
    updatePathPieces(doc, found, pieces);
    return { page: found.page, id, action, quadrants: found.element.pieces.length };
  }
  if (action === 'reverse') {
    updatePathPieces(doc, found, pieces.reverse().map(reversePiece));
    return { page: found.page, id, action, quadrants: found.element.pieces.length };
  }
  if (action === 'open') {
    if (!path.closed) return { page: found.page, id, action, changed: false, quadrants: path.pieces.length };
    updatePathPieces(doc, found, pieces, { closed: false });
    return { page: found.page, id, action, changed: true, quadrants: found.element.pieces.length };
  }
  if (action === 'close') {
    const bridge = rayQuads(pieces.at(-1).x, pieces.at(-1).y, pieces[0].x, pieces[0].y)
      .slice(1, -1)
      .map(({ x, y }) => ({ x, y, type: 'mark', style: 'square' }));
    updatePathPieces(doc, found, [...pieces, ...bridge], { closed: true });
    return { page: found.page, id, action, added: bridge.length, quadrants: found.element.pieces.length };
  }
  if (action === 'split') {
    const position = assertPieceIndex(index, pieces.length, { allowEnd: true, what: 'split index' });
    if (position === 0 || position === pieces.length) throw new RangeError('split index must leave at least one quadrant in both results');
    if (!Array.isArray(ids) && ids != null) throw new TypeError('split ids must be an array when supplied');
    const outputIds = ids == null ? [id, `${id}-part-2`] : ids.map((entry) => String(entry));
    if (outputIds.length !== 2) throw new RangeError('split ids must contain exactly two entries');
    const { page, created } = insertDerivedPaths(doc, [found], [
      pathSpecFrom(path, outputIds[0], pieces.slice(0, position), { operation: 'path_split', source: id, part: 1 }),
      pathSpecFrom(path, outputIds[1], pieces.slice(position), { operation: 'path_split', source: id, part: 2 }),
    ]);
    return { page, id, action, created: created.map((entry) => entry.id) };
  }

  if (action === 'join') {
    if (!joinWith) throw new Error('path_edit join needs `with`, the id of the path to append');
    const other = foundPath(doc, joinWith);
    if (other.page !== found.page) throw new Error(`cannot join paths on different pages ("${found.page}" and "${other.page}")`);
    const otherPieces = other.element.pieces.map((piece) => ({ ...piece }));
    if (!touching(pieces.at(-1), otherPieces[0])) {
      throw new Error(
        `path "${id}" ends at ${quadToAddress(pieces.at(-1).x, pieces.at(-1).y)} but "${joinWith}" starts at `
        + `${quadToAddress(otherPieces[0].x, otherPieces[0].y)}; move, reverse, or explicitly bridge them before joining`,
      );
    }
    const appended = pieces.at(-1).x === otherPieces[0].x && pieces.at(-1).y === otherPieces[0].y
      ? otherPieces.slice(1)
      : otherPieces;
    const { page, created } = insertDerivedPaths(doc, [found, other], [
      pathSpecFrom(path, id, [...pieces, ...appended], { operation: 'path_join', sources: [id, joinWith] }),
    ]);
    return { page, id, action, removed: joinWith, result: created[0].id };
  }

  throw new Error(`unhandled path_edit action "${action}"`);
}

/** Remove repeated path quadrants without changing the first-occurrence drawing order. */
export function normalizePath(doc, { id } = {}) {
  const found = foundPath(doc, id);
  const appearance = piece => {
    const fields = { ...piece };
    if (piece.type === 'line') delete fields.dir;
    return JSON.stringify(Object.fromEntries(Object.keys(fields).sort().map(key => [key, fields[key]])));
  };
  const appearances = new Map();
  for (const piece of found.element.pieces) {
    const key = quadKey(piece.x, piece.y);
    if (!appearances.has(key)) appearances.set(key, new Set());
    appearances.get(key).add(appearance(piece));
  }
  const seen = new Set();
  const pieces = found.element.pieces.filter((piece) => {
    const key = quadKey(piece.x, piece.y);
    // Different colors/markers at one location may intentionally overpaint.
    if (appearances.get(key).size > 1) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const removed = found.element.pieces.length - pieces.length;
  if (!removed) return { page: found.page, id, removed: 0, normalized: false };
  updatePathPieces(doc, found, pieces);
  return { page: found.page, id, removed, normalized: true, quadrants: pieces.length };
}

/** Change only an element's draw order within its page; overlap validation is unchanged. */
export function reorderElement(doc, { id, action, relative = null } = {}) {
  if (!REORDER_ACTIONS.includes(action)) {
    throw new SyntaxError(`reorder action must be ${REORDER_ACTIONS.join(', ')} — got ${JSON.stringify(action)}`);
  }
  const found = findElement(doc, id);
  if (!found) throw new Error(`no element "${id}" to reorder`);
  const list = elementsOf(doc, found.page);
  const from = list.indexOf(found.element);
  if (['before', 'after'].includes(action)) {
    if (!relative) throw new Error(`reorder action "${action}" needs relative, an element id on the same page`);
    const target = findElement(doc, relative);
    if (!target) throw new Error(`no element "${relative}" to order against`);
    if (target.page !== found.page) throw new Error(`"${id}" and "${relative}" are on different pages`);
    if (target.element === found.element) throw new Error('an element cannot be ordered relative to itself');
  }

  const [element] = list.splice(from, 1);
  let to;
  if (action === 'bring_to_front') to = list.length;
  else if (action === 'send_to_back') to = 0;
  else if (action === 'raise') to = Math.min(from + 1, list.length);
  else if (action === 'lower') to = Math.max(from - 1, 0);
  else {
    const targetIndex = list.findIndex((entry) => entry.id === relative);
    to = action === 'before' ? targetIndex : targetIndex + 1;
  }
  list.splice(to, 0, element);
  return { page: found.page, id, action, index: to, changed: from !== to };
}

function translatedClone(element, id, dx, dy, provenance) {
  const clone = structuredClone(element);
  clone.id = assertElementId(id, 'duplicate id');
  if (clone.kind === 'path') {
    clone.pieces = clone.pieces.map((piece) => ({ ...piece, x: piece.x + dx, y: piece.y + dy }));
    if (clone.end) clone.end = { ...clone.end, x: clone.end.x + dx, y: clone.end.y + dy };
    for (const piece of clone.pieces) {
      if (piece.x < 0 || piece.y < 0) throw new RangeError(`duplicate "${clone.id}" would extend off the top-left of the lattice`);
    }
  } else {
    clone.rect = rect(clone.rect.x + dx, clone.rect.y + dy, clone.rect.w, clone.rect.h);
    if (clone.rect.x < 0 || clone.rect.y < 0) throw new RangeError(`duplicate "${clone.id}" would extend off the top-left of the lattice`);
  }
  clone.provenance = provenance;
  return clone;
}

function ownerOf(doc, id) {
  return groupsOf(doc).find((group) => group.members.includes(id)) ?? null;
}

/** Copy one element by an explicit whole-quadrant delta. Constraints are not cloned. */
export function duplicateElement(doc, { id, to, dx = 0, dy = 0 } = {}) {
  const found = findElement(doc, id);
  if (!found) throw new Error(`no element "${id}" to duplicate`);
  assertElementId(to, 'duplicate id');
  assertFreeId(doc, to);
  assertInteger(dx, 'duplicate dx');
  assertInteger(dy, 'duplicate dy');
  const clone = translatedClone(found.element, to, dx, dy, { operation: 'duplicate', source: id, dx, dy });
  const list = elementsOf(doc, found.page);
  list.splice(list.indexOf(found.element) + 1, 0, clone);
  const owner = ownerOf(doc, id);
  if (owner) owner.members.push(to);
  return { page: found.page, source: id, duplicate: to, dx, dy };
}

/** Create a bounded, deterministic rectangular array of copies around a source. */
export function arrayElements(doc, {
  id, columns, rows, stepX, stepY, prefix = null,
} = {}) {
  const found = findElement(doc, id);
  if (!found) throw new Error(`no element "${id}" to array`);
  assertPositiveInteger(columns, 'array columns');
  assertPositiveInteger(rows, 'array rows');
  assertInteger(stepX, 'array stepX');
  assertInteger(stepY, 'array stepY');
  if (columns === 1 && rows === 1) throw new RangeError('an array needs more than its source element');
  if (columns > 1 && stepX === 0) throw new RangeError('array stepX must be non-zero when columns is greater than one');
  if (rows > 1 && stepY === 0) throw new RangeError('array stepY must be non-zero when rows is greater than one');
  const count = columns * rows - 1;
  if (count > MAX_ARRAY_COPIES) {
    throw new RangeError(`array would create ${count} copies, over the ${MAX_ARRAY_COPIES} copy limit`);
  }
  const base = prefix == null ? `${id}-copy` : String(prefix);
  const requests = [];
  let ordinal = 1;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (row === 0 && column === 0) continue;
      requests.push({
        id: `${base}-${ordinal++}`,
        dx: column * stepX,
        dy: row * stepY,
        row,
        column,
      });
    }
  }
  for (const request of requests) {
    assertElementId(request.id, 'array result id');
    assertFreeId(doc, request.id);
    translatedClone(found.element, request.id, request.dx, request.dy, null);
  }

  const clones = requests.map((request) => translatedClone(found.element, request.id, request.dx, request.dy, {
    operation: 'array',
    source: id,
    row: request.row,
    column: request.column,
    stepX,
    stepY,
  }));
  const list = elementsOf(doc, found.page);
  list.splice(list.indexOf(found.element) + 1, 0, ...clones);
  const owner = ownerOf(doc, id);
  if (owner) owner.members.push(...clones.map((clone) => clone.id));
  return {
    page: found.page,
    source: id,
    created: clones.map((clone) => clone.id),
    columns,
    rows,
    stepX,
    stepY,
  };
}

function setBounds(cells) {
  return boundsOf(sortedPoints(cells).map(({ x, y }) => rect(x, y, 1, 1)));
}

function perimeterEdges(cells) {
  let count = 0;
  for (const cell of cells) {
    const { x, y } = parseQuadKey(cell);
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      if (!cells.has(quadKey(x + dx, y + dy))) count++;
    }
  }
  return count;
}

function boundsGap(a, b) {
  const gap = (a0, a1, b0, b1) => Math.max(0, a0 - b1, b0 - a1);
  const x = gap(a.x, a.x + a.w, b.x, b.x + b.w);
  const y = gap(a.y, a.y + a.h, b.y, b.y + b.h);
  return { x, y, manhattan: x + y, euclideanSquared: x * x + y * y };
}

/** Return exact lattice measurements and pairwise intersections without mutating state. */
export function inspectGeometry(doc, { ids, footprint = 'claimed', nearest = null, pieceOffset = 0, pieceLimit = 100 } = {}) {
  assertFootprint(footprint);
  assertInteger(pieceOffset, 'pieceOffset'); assertInteger(pieceLimit, 'pieceLimit');
  if (pieceOffset < 0 || pieceLimit < 1 || pieceLimit > 500) throw new RangeError('pieceOffset must be nonnegative and pieceLimit between 1 and 500');
  const target = nearest == null ? null : pointAtAddress(nearest, 'nearest point');
  const found = foundElements(doc, ids, { what: 'inspect ids' });
  const entries = found.map(({ element, page }) => {
    const cells = cellsOf(element, footprint);
    const bounds = setBounds(cells);
    const path = element.kind === 'path' ? element.pieces : null;
    let pathDetail = null;
    if (path) {
      const segments = [];
      let totalLengthQuads = 0, connectedLengthQuads = 0, subpaths = path.length ? 1 : 0;
      for (let i = 1; i < path.length; i++) {
        const dx = path[i].x - path[i - 1].x, dy = path[i].y - path[i - 1].y;
        const squared = dx * dx + dy * dy, length = Math.sqrt(squared), connected = Math.max(Math.abs(dx), Math.abs(dy)) <= 1;
        totalLengthQuads += length;
        if (connected) connectedLengthQuads += length; else subpaths++;
        if (i - 1 >= pieceOffset && segments.length < pieceLimit) segments.push({ fromIndex: i - 1, toIndex: i, dx, dy, lengthSquaredQuads: squared, lengthQuads: length, angleDegrees: Math.atan2(dy, dx) * 180 / Math.PI, connected });
      }
      pathDetail = { pieceCount: path.length, segmentCount: Math.max(0, path.length - 1), subpaths, totalLengthQuads, connectedLengthQuads,
        measurement: 'ordered piece centers; discontinuous steps are reported, not assumed to be drawn ink', segments,
        nextOffset: pieceOffset + segments.length < path.length - 1 ? pieceOffset + segments.length : null };
    }
    let nearestPoint = null;
    if (target) {
      for (const p of sortedPoints(cells)) {
        const distanceSquared = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
        if (!nearestPoint || distanceSquared < nearestPoint.distanceSquared) nearestPoint = { ...p, at: quadToAddress(p.x, p.y), distanceSquared };
      }
    }
    return {
      id: element.id,
      page,
      kind: element.kind,
      ...(pathDetail ? { path: pathDetail } : {}),
      ...(target ? { nearestPoint } : {}),
      quadrants: cells.size,
      areaPx2: cells.size * 25,
      perimeterEdges: perimeterEdges(cells),
      perimeterPx: perimeterEdges(cells) * 5,
      bounds,
      center: bounds ? {
        xNumerator: bounds.x * 2 + bounds.w,
        yNumerator: bounds.y * 2 + bounds.h,
        denominator: 2,
      } : null,
      cells,
    };
  });
  const intersections = [];
  for (let left = 0; left < entries.length; left++) {
    for (let right = left + 1; right < entries.length; right++) {
      const a = entries[left], b = entries[right];
      const shared = [...a.cells].filter((cell) => b.cells.has(cell));
      intersections.push({
        ids: [a.id, b.id],
        quadrants: shared.length,
        cells: sortedPoints(new Set(shared)).slice(0, 100).map(({ x, y }) => quadToAddress(x, y)),
        truncated: shared.length > 100,
        boundsGap: boundsGap(a.bounds, b.bounds),
      });
    }
  }
  return {
    footprint,
    elements: entries.map(({ cells, ...entry }) => entry),
    intersections,
  };
}
