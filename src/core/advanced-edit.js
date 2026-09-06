/** Exact selection editing. Every compound mutation is rehearsed before publication. */
import {
  addPage, addPath, findElement, findGroup, getPage, groupsOf, constraintsOf,
  elementBounds, elementClaimed, elementAnchor, removeElement, moveElement,
  microMasksOf, reconcileSelectionChange, normalizeColor, normalizeStroke, moveElementToPage, removePage, updatePage,
} from './document.js';
import { parseAddress, pinPoint } from './address.js';
import { boundsOf, parseQuadKey } from './geometry.js';
import { duplicateElement } from './edit.js';

const MAX_QUADS = 250000;
const directions = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const point = (at) => pinPoint(parseAddress(at));
const integer = (value, label, min = -Infinity, max = Infinity) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`${label} must be an integer from ${min} to ${max}`);
  return value;
};

export function atomicEdit(doc, edit) {
  const draft = structuredClone(doc);
  const result = edit(draft);
  Object.assign(doc, draft);
  return result;
}

/** Apply independently chosen destinations without moving a selected follower twice. */
export function moveSelection(doc, moves, { allowNegative = false } = {}) {
  return atomicEdit(doc, draft => {
    const ids = moves.map(move => move.id);
    selection(draft, { ids });
    const edges = draft.constraints;
    draft.constraints = [];
    for (const move of moves) {
      integer(move.dx, 'selection dx'); integer(move.dy, 'selection dy');
      moveElement(draft, move.id, move.dx, move.dy);
    }
    draft.constraints = edges;
    reconcileSelectionChange(draft, ids);
    for (const element of Object.values(draft.elements).flat()) {
      const bounds = elementBounds(element);
      if (!allowNegative && (bounds.x < 0 || bounds.y < 0)) throw new RangeError(`selection movement would put "${element.id}" outside the addressable lattice`);
    }
    return moves;
  });
}

function selection(doc, { ids, group } = {}) {
  if (ids != null && group != null) throw new Error('choose ids or group, not both');
  if (group != null) {
    const found = findGroup(doc, group);
    if (!found) throw new Error(`no group "${group}"`);
    ids = found.members;
  }
  if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) {
    throw new Error('selection needs nonempty, unique element ids or a nonempty group');
  }
  return ids.map(id => {
    const found = findElement(doc, id);
    if (!found) throw new Error(`no element "${id}"`);
    return found;
  });
}

/** Stateless AND filters, inversion within page scope, stable order and bounded results. */
export function queryElements(doc, {
  page, ids, kind, role, tags, properties, text, color, within, intersecting,
  nearest, invert = false, offset = 0, limit = 100,
} = {}) {
  integer(offset, 'query offset', 0); integer(limit, 'query limit', 1, 500);
  if (page != null) getPage(doc, page);
  if (kind != null && !['path', 'box', 'text', 'image'].includes(kind)) throw new Error('query kind must be path, box, text, or image');
  for (const [name, values] of Object.entries({ ids, tags })) {
    if (values != null && (!Array.isArray(values) || values.some(v => typeof v !== 'string'))) throw new TypeError(`query ${name} must be an array of strings`);
  }
  if (properties != null && (typeof properties !== 'object' || Array.isArray(properties) || Object.values(properties).some(v => typeof v !== 'string'))) throw new TypeError('query properties must map keys to strings');
  if (text != null && typeof text !== 'string') throw new TypeError('query text must be a string');
  if (typeof invert !== 'boolean') throw new TypeError('query invert must be boolean');
  const colorKey = value => typeof value !== 'string' ? null : value.length === 4 ? `#${[...value.slice(1)].map(c => c + c).join('')}`.toLowerCase() : value.toLowerCase();
  const wantedColor = color == null ? null : colorKey(normalizeColor(color));
  const region = (value, label) => {
    if (value == null) return null;
    for (const key of ['x', 'y', 'w', 'h']) integer(value[key], `${label}.${key}`, key === 'w' || key === 'h' ? 1 : 0);
    return value;
  };
  const inside = region(within, 'within'), crossing = region(intersecting, 'intersecting');
  const target = nearest == null ? null : point(nearest);
  const candidates = [];
  for (const layer of [...doc.pages].sort((a, b) => a.z - b.z || a.id.localeCompare(b.id))) {
    if (page != null && layer.id !== page) continue;
    for (const element of doc.elements[layer.id]) {
      const bounds = elementBounds(element);
      const hasColor = () => [element.fill, element.fill?.from, element.fill?.to, element.color, element.stroke?.color, ...(element.pieces ?? []).map(p => p.color)].some(value => colorKey(value) === wantedColor);
      const match = (ids == null || ids.includes(element.id)) && (kind == null || element.kind === kind)
        && (role == null || element.role === role) && (tags == null || tags.every(t => element.tags?.includes(t)))
        && (properties == null || Object.entries(properties).every(([k, v]) => element.properties?.[k] === v))
        && (text == null || [element.label, element.text, element.description, element.id].filter(Boolean).join(' ').toLowerCase().includes(text.toLowerCase()))
        && (wantedColor == null || hasColor())
        && (!inside || bounds.x >= inside.x && bounds.y >= inside.y && bounds.x + bounds.w <= inside.x + inside.w && bounds.y + bounds.h <= inside.y + inside.h)
        && (!crossing || bounds.x < crossing.x + crossing.w && bounds.y < crossing.y + crossing.h && bounds.x + bounds.w > crossing.x && bounds.y + bounds.h > crossing.y);
      if (invert ? match : !match) continue;
      const distanceSquared = target ? Math.max(bounds.x - target.x, 0, target.x - (bounds.x + bounds.w - 1)) ** 2
        + Math.max(bounds.y - target.y, 0, target.y - (bounds.y + bounds.h - 1)) ** 2 : undefined;
      candidates.push({ id: element.id, page: layer.id, kind: element.kind, bounds, ...(target ? { distanceSquared } : {}) });
    }
  }
  if (target) candidates.sort((a, b) => a.distanceSquared - b.distanceSquared || a.id.localeCompare(b.id));
  const items = candidates.slice(offset, offset + limit);
  return { ids: items.map(item => item.id), items, total: candidates.length, offset, limit,
    nextOffset: offset + items.length < candidates.length ? offset + items.length : null,
    ...(target ? { distanceMetric: 'squared quadrant distance to occupied bounding rectangle' } : {}) };
}

/** Rotate/reflect exact path pieces; integer magnification requires explicit cell paint. */
export function transformElements(doc, args = {}) {
  return atomicEdit(doc, draft => {
    const { rotate = 0, flip = null, scaleX = 1, scaleY = 1, pivot, copyPrefix, dx = 0, dy = 0 } = args;
    if (![0, 90, 180, 270, -90, -180, -270].includes(rotate)) throw new RangeError('rotate must be a quarter turn in degrees');
    if (flip != null && !['horizontal', 'vertical', 'both'].includes(flip)) throw new Error('flip must be horizontal, vertical, or both');
    integer(scaleX, 'scaleX', 1, 100); integer(scaleY, 'scaleY', 1, 100);
    integer(dx, 'dx'); integer(dy, 'dy');
    let selected = selection(draft, args);
    const bounds = boundsOf(selected.map(({ element }) => elementBounds(element)));
    const scaling = scaleX !== 1 || scaleY !== 1;
    const center = pivot ? point(pivot) : scaling ? { x: bounds.x, y: bounds.y }
      : { x: bounds.x + (bounds.w - 1) / 2, y: bounds.y + (bounds.h - 1) / 2 };
    const vector = (x, y) => {
      if (flip === 'horizontal' || flip === 'both') x = -x;
      if (flip === 'vertical' || flip === 'both') y = -y;
      for (let i = 0; i < ((rotate % 360 + 360) % 360) / 90; i++) [x, y] = [-y, x];
      return { x, y };
    };
    const map = (x, y) => {
      const v = vector(x - center.x, y - center.y);
      const result = { x: v.x + center.x + dx, y: v.y + center.y + dy };
      for (const value of Object.values(result)) if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError('transform would produce negative or off-grid geometry; choose an explicit lattice pivot or translation');
      }
      return result;
    };
    const direction = name => {
      if (!directions[name]) throw new Error(`unsupported piece direction "${name}"`);
      const v = vector(...directions[name]);
      return Object.keys(directions).find(key => directions[key][0] === v.x && directions[key][1] === v.y);
    };
    let total = 0;
    for (const { element } of selected) {
      if (element.kind !== 'path') throw new Error(`transform "${element.id}" needs path artwork; use layout/move for upright text, boxes, or images`);
      if (element.relationship || element.source?.id || element.targets?.some(target => target.id) || element.from || element.to || element.sourceId || element.targetId) throw new Error(`transform "${element.id}" is a semantic connector; reroute its endpoints explicitly`);
      if (scaling && element.stroke?.paint !== 'cells') throw new Error(`integer scaling "${element.id}" requires stroke_to_path first to make the cell footprint explicit`);
      if (microMasksOf(draft).some(mask => mask.target === element.id)) throw new Error(`transform "${element.id}" has pixel micro-masks; remove or materialize those masks explicitly first`);
      total += element.pieces.length * scaleX * scaleY;
      if (total > MAX_QUADS) throw new RangeError(`transform exceeds ${MAX_QUADS} path pieces`);
    }
    const copies = [];
    if (copyPrefix != null) {
      if (typeof copyPrefix !== 'string' || !/^[A-Za-z0-9_-]+$/.test(copyPrefix)) throw new Error('copyPrefix must be an element id prefix');
      selected = selected.map(({ element }) => {
        const to = `${copyPrefix}-${element.id}`;
        duplicateElement(draft, { id: element.id, to }); copies.push(to);
        return findElement(draft, to);
      });
    }
    for (const { element } of selected) {
      const pieces = [];
      for (const source of element.pieces) {
        for (let sy = 0; sy < scaleY; sy++) for (let sx = 0; sx < scaleX; sx++) {
          const p = { ...source, ...map(center.x + (source.x - center.x) * scaleX + sx, center.y + (source.y - center.y) * scaleY + sy) };
          if (p.dir) p.dir = direction(p.dir);
          if (p.sides) p.sides = p.sides.map(direction);
          if (p.axis && Math.abs(rotate) % 180 === 90) p.axis = p.axis === 'h' ? 'v' : p.axis === 'v' ? 'h' : p.axis;
          pieces.push(p);
        }
      }
      element.pieces = pieces;
      delete element.end; delete element.source; delete element.targets;
      // Pen programs describe the original cursor, not the transformed geometry.
    }
    reconcileSelectionChange(draft, selected.map(s => s.element.id));
    return { transformed: selected.map(s => s.element.id), copies, rotate, flip, scaleX, scaleY, pivot: center, dx, dy, pieces: total };
  });
}

export const isConstructionGuide = element => element.properties?.constructionGuide === 'true';

/** Bake a color field into the existing pieces; all renderers consume the same colors. */
export function paintPaths(doc, { ids, group, color, width, cap, gradient } = {}) {
  return atomicEdit(doc, draft => {
    const selected = selection(draft, { ids, group });
    if (color != null && gradient != null) throw new Error('paint_path needs color or gradient, not both');
    if (color == null && width == null && cap == null && gradient == null) throw new Error('paint_path needs a color, width, cap, or gradient');
    const rgb = value => {
      let hex = normalizeColor(value);
      if (hex.length === 4) hex = `#${[...hex.slice(1)].map(c => c + c).join('')}`;
      return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    };
    let field = null;
    if (gradient != null) {
      if (!gradient || !['linear', 'radial'].includes(gradient.type)) throw new Error('gradient type must be linear or radial');
      for (const key of Object.keys(gradient)) if (!['type', 'from', 'to', 'center', 'radius', 'angle'].includes(key)) throw new Error(`unknown gradient field "${key}"`);
      const bounds = boundsOf(selected.map(({ element }) => elementBounds(element)));
      const center = gradient.center ? point(gradient.center) : { x: bounds.x + (bounds.w - 1) / 2, y: bounds.y + (bounds.h - 1) / 2 };
      const angle = gradient.angle ?? 0;
      if (!Number.isFinite(angle)) throw new Error('gradient angle must be finite degrees');
      const radius = gradient.radius ?? Math.max(bounds.w, bounds.h) / 2;
      if (!Number.isFinite(radius) || radius <= 0) throw new Error('gradient radius must be positive quadrants');
      field = { ...gradient, center, radius, fromRgb: rgb(gradient.from), toRgb: rgb(gradient.to), angle, bounds };
    }
    for (const { element } of selected) {
      if (element.kind !== 'path') throw new Error(`paint_path "${element.id}" is not path artwork`);
      element.stroke = normalizeStroke({ ...element.stroke, ...(color != null ? { color } : {}), ...(width != null ? { width } : {}), ...(cap != null ? { cap } : {}) });
      if (color != null || field) for (const p of element.pieces) {
        if (!field) { delete p.color; continue; }
        const radians = field.angle * Math.PI / 180;
        const extent = Math.max(1, Math.abs(Math.cos(radians)) * (field.bounds.w - 1) + Math.abs(Math.sin(radians)) * (field.bounds.h - 1));
        const distance = field.type === 'radial' ? Math.hypot(p.x - field.center.x, p.y - field.center.y) / field.radius
          : 0.5 + ((p.x - field.center.x) * Math.cos(radians) + (p.y - field.center.y) * Math.sin(radians)) / extent;
        const t = Math.max(0, Math.min(1, distance));
        p.color = `#${field.fromRgb.map((channel, i) => Math.round(channel + (field.toRgb[i] - channel) * t).toString(16).padStart(2, '0')).join('')}`;
      }
    }
    return { painted: selected.map(s => s.element.id), geometryChanged: false, ...(field ? { gradient: { type: field.type, center: field.center, radius: field.radius, angle: field.angle }, baked: true } : {}) };
  });
}

/** Repeat an explicit transform; the document never owns an implicit last command. */
export function repeatTransforms(doc, args = {}) {
  return atomicEdit(doc, draft => {
    const { id, mode, count, rotate = 90, pivot, stepX = 0, stepY = 0, prefix = `${id}-copy` } = args;
    if (!['radial', 'repeat'].includes(mode)) throw new Error('transform array mode must be radial or repeat');
    integer(count, 'array count including source', 2, 101);
    integer(stepX, 'stepX'); integer(stepY, 'stepY');
    if (![0, 90, 180, 270, -90, -180, -270].includes(rotate)) throw new Error('array rotate must be a quarter turn');
    if (mode === 'radial' && (!pivot || !rotate || count > (Math.abs(rotate) === 180 ? 2 : 4))) throw new Error('radial array needs an explicit pivot and at most one revolution of distinct quarter turns');
    const created = [];
    for (let i = 1; i < count; i++) {
      const to = `${prefix}-${i}`;
      duplicateElement(draft, { id, to });
      transformElements(draft, { ids: [to], rotate: (rotate * i) % 360, pivot, dx: stepX * i, dy: stepY * i });
      created.push(to);
    }
    return { mode, source: id, created, count, rotate, pivot, stepX, stepY };
  });
}

/** Construction is ordinary persisted geometry with a release-blocking semantic marker. */
export function editGuide(doc, { action = 'create', id, from, to, page = 'construction', color = '#64748b', ids, anchor = 'C' } = {}) {
  return atomicEdit(doc, draft => {
    if (action === 'create') {
      const a = point(from), b = point(to);
      if (a.x !== b.x && a.y !== b.y) throw new Error('construction guide must be horizontal or vertical');
      const count = Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + 1;
      if (count > MAX_QUADS) throw new RangeError(`guide exceeds ${MAX_QUADS} quadrants`);
      const ink = normalizeColor(color);
      if (!draft.pages.some(p => p.id === page)) addPage(draft, { id: page, z: Math.max(...draft.pages.map(p => p.z)) + 1, intent: 'overlay', title: 'Construction guides' });
      else if (getPage(draft, page).intent !== 'overlay') throw new Error('construction guides require an overlay page');
      const pieces = Array.from({ length: count }, (_, i) => ({ x: a.x + Math.sign(b.x - a.x) * i, y: a.y + Math.sign(b.y - a.y) * i, type: 'line', dir: a.x === b.x ? 'down' : 'right' }));
      const element = addPath(draft, page, { id, pieces, role: 'artwork', stroke: { color: ink, width: 1 } });
      element.properties = { constructionGuide: 'true' };
      return { action, id, page, quadrants: count, releaseBlocking: true };
    }
    const found = findElement(draft, id);
    if (!found || !isConstructionGuide(found.element)) throw new Error(`no construction guide "${id}"`);
    if (action === 'remove') { removeElement(draft, id); return { action, removed: id }; }
    if (action !== 'snap') throw new Error('guide action must be create, snap, or remove; query properties.constructionGuide for inspection');
    const selected = selection(draft, { ids });
    if (ids.includes(id)) throw new Error('a guide cannot snap to itself');
    const cells = [...elementClaimed(found.element)].map(parseQuadKey).sort((a, b) => a.y - b.y || a.x - b.x);
    const moved = selected.map(({ element }) => {
      const origin = elementAnchor(draft, element.id, anchor);
      let closest = cells[0], distance = Infinity;
      for (const p of cells) {
        const d = (p.x - origin.x) ** 2 + (p.y - origin.y) ** 2;
        if (d < distance) { closest = p; distance = d; }
      }
      return { id: element.id, dx: closest.x - origin.x, dy: closest.y - origin.y };
    });
    moveSelection(draft, moved);
    return { action, guide: id, anchor, moved };
  });
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}

/** Remove only equivalent path records. Referenced or separately meaningful objects survive. */
export function cleanupElements(doc, { ids, removeDuplicates = false, emptyGroups = false } = {}) {
  return atomicEdit(doc, draft => {
    if (typeof removeDuplicates !== 'boolean' || typeof emptyGroups !== 'boolean') throw new TypeError('cleanup flags must be boolean');
    const selected = selection(draft, { ids });
    const removed = [], skipped = [], seen = new Map();
    const referenced = id => constraintsOf(draft).some(c => c.target === id || c.dependent === id)
      || microMasksOf(draft).some(m => m.target === id)
      || Object.values(draft.elements).flat().some(e => e.id !== id && [e.from, e.to, e.source, e.parent, e.sourceId, e.targetId, e.relationship?.from, e.relationship?.to, ...(e.targets ?? [])].some(ref => ref === id || ref?.id === id || ref?.element === id))
      || JSON.stringify(draft.timelines ?? []).includes(`"${id}"`);
    for (const { element, page } of selected) {
      if (!removeDuplicates) continue;
      if (element.kind !== 'path') { skipped.push({ id: element.id, reason: 'duplicate cleanup supports paths only' }); continue; }
      const record = structuredClone(element);
      for (const key of ['id', 'provenance', 'source', 'end', 'targets']) delete record[key];
      const owner = groupsOf(draft).find(g => g.members.includes(element.id))?.id ?? null;
      const key = JSON.stringify(canonical({ page, owner, record }));
      const duplicateOf = seen.get(key);
      if (duplicateOf) {
        const list = draft.elements[page], left = list.findIndex(e => e.id === duplicateOf), right = list.indexOf(element);
        const ink = new Set(elementClaimed(element));
        const painting = e => JSON.stringify(canonical({ pieces: e.pieces, stroke: e.stroke, opacity: e.opacity, closed: e.closed }));
        const obscured = list.slice(Math.min(left, right) + 1, Math.max(left, right)).some(e => {
          if (e.kind === 'path' && painting(e) === painting(element)) return false;
          for (const cell of elementClaimed(e)) if (ink.has(cell)) return true;
          return false;
        });
        if ((element.opacity ?? 1) < 1 || obscured) {
          skipped.push({ id: element.id, duplicateOf, reason: 'opacity or intervening ink makes removal change compositing' }); continue;
        }
      }
      if (duplicateOf && referenced(element.id)) { skipped.push({ id: element.id, reason: 'referenced by another object; remove or retarget explicitly', duplicateOf }); continue; }
      if (duplicateOf) { removeElement(draft, element.id); removed.push(element.id); }
      else seen.set(key, element.id);
    }
    const removedGroups = emptyGroups ? groupsOf(draft).filter(g => !g.members.length).map(g => g.id) : [];
    if (emptyGroups) draft.groups = groupsOf(draft).filter(g => g.members.length);
    return { removed, removedGroups, skipped, compared: selected.length };
  });
}

/** Page composition remains explicit; duplicate refuses relationships it cannot copy. */
export function editPages(doc, { action, id, to } = {}) {
  return atomicEdit(doc, draft => {
    const page = getPage(draft, id);
    if (action === 'solo' || action === 'show_all') {
      for (const p of draft.pages) updatePage(draft, p.id, { visible: action === 'show_all' || p.id === id });
      return { action, visible: draft.pages.filter(p => p.visible).map(p => p.id) };
    }
    if (action === 'merge') {
      if (id === to) throw new Error('page merge needs a different destination');
      getPage(draft, to);
      if ((draft.timelines ?? []).some(timeline => timeline.page === id || timeline.generated?.pageIds?.includes(id))) throw new Error('page merge would invalidate a semantic timeline source; update or reflow that timeline explicitly first');
      const moved = draft.elements[id].map(e => e.id);
      for (const element of moved) moveElementToPage(draft, element, to);
      removePage(draft, id);
      return { action, removedPage: id, destination: to, moved };
    }
    if (action !== 'duplicate') throw new Error('page action must be duplicate, merge, solo, or show_all');
    const originals = [...draft.elements[id]];
    const ids = new Set(originals.map(e => e.id));
    if (constraintsOf(draft).some(c => ids.has(c.target) || ids.has(c.dependent)) || microMasksOf(draft).some(m => ids.has(m.target))
      || originals.some(e => e.relationship || e.from || e.to || e.properties?.generatedBy || e.properties?.constructionGuide)) {
      throw new Error('page duplicate contains relationships, generated content, guides, or micro-masks; duplicate the semantic source or selected independent artwork explicitly');
    }
    addPage(draft, { id: to, title: page.title, intent: page.intent, opacity: page.opacity, reference: page.reference });
    updatePage(draft, to, { visible: page.visible });
    const created = [];
    for (const e of originals) {
      const copyId = `${to}-${e.id}`;
      duplicateElement(draft, { id: e.id, to: copyId });
      moveElementToPage(draft, copyId, to); created.push(copyId);
      // Ownership belongs to the original page's assembly; copied objects start ungrouped.
      for (const group of groupsOf(draft)) group.members = group.members.filter(member => member !== copyId);
    }
    return { action, source: id, page: to, created };
  });
}
