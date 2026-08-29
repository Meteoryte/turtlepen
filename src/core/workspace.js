/** Durable semantic views, themes, resources, and generated keys. */

export const VIEW_TYPES = Object.freeze(['static', 'filtered', 'dynamic']);
export const VIEW_DIRECTIONS = Object.freeze(['top-down', 'bottom-up', 'left-right', 'right-left']);
export const RESOURCE_TYPES = Object.freeze(['documentation', 'adr', 'runbook', 'url', 'file']);

const idPattern = /^[A-Za-z0-9_-]+$/;
const colorPattern = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;

function stringList(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new TypeError(label + ' must be an array of non-empty strings');
  }
  return [...new Set(value.map((entry) => entry.trim()))];
}

function color(value, label) {
  if (value == null) return null;
  if (!colorPattern.test(String(value))) throw new SyntaxError(label + ' must be a 3- or 6-digit hex colour');
  return String(value).toLowerCase();
}

function safeId(value, label) {
  if (!idPattern.test(String(value ?? ''))) throw new SyntaxError(label + ' must be alphanumeric with optional dashes or underscores');
  return String(value);
}

export function createWorkspaceState() {
  return {
    views: [],
    theme: { name: 'TurtlePen', tokens: {}, tagStyles: [], perspectiveStyles: [] },
    resources: [],
    modelAcceptances: [],
  };
}

function normalizeTagStyle(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('theme tagStyles[' + index + '] must be an object');
  if (typeof entry.tag !== 'string' || !entry.tag.trim()) throw new TypeError('theme tagStyles[' + index + '].tag must be a non-empty string');
  const out = { tag: entry.tag.trim() };
  for (const key of ['fill', 'stroke', 'text']) {
    if (entry[key] != null) out[key] = color(entry[key], 'theme tagStyles[' + index + '].' + key);
  }
  if (entry.opacity != null) {
    if (typeof entry.opacity !== 'number' || entry.opacity < 0.05 || entry.opacity > 1) {
      throw new RangeError('theme tagStyles[' + index + '].opacity must be between 0.05 and 1');
    }
    out.opacity = entry.opacity;
  }
  return out;
}

function normalizePerspectiveStyle(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('theme perspectiveStyles[' + index + '] must be an object');
  if (typeof entry.perspective !== 'string' || !entry.perspective.trim()) throw new TypeError('theme perspectiveStyles[' + index + '].perspective is required');
  if (typeof entry.value !== 'string' || !entry.value.trim()) throw new TypeError('theme perspectiveStyles[' + index + '].value is required');
  const out = { perspective: entry.perspective.trim(), value: entry.value.trim() };
  for (const key of ['fill', 'stroke', 'text']) {
    if (entry[key] != null) out[key] = color(entry[key], 'theme perspectiveStyles[' + index + '].' + key);
  }
  return out;
}

export function normalizeTheme(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('theme must be an object');
  const tokens = {};
  for (const [name, token] of Object.entries(value.tokens ?? {})) {
    if (!idPattern.test(name)) throw new SyntaxError('theme token ' + JSON.stringify(name) + ' has an invalid name');
    tokens[name] = color(token, 'theme token ' + name);
  }
  if (value.tagStyles != null && !Array.isArray(value.tagStyles)) throw new TypeError('theme tagStyles must be an array');
  if (value.perspectiveStyles != null && !Array.isArray(value.perspectiveStyles)) throw new TypeError('theme perspectiveStyles must be an array');
  return {
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : 'TurtlePen',
    tokens,
    tagStyles: (value.tagStyles ?? []).map(normalizeTagStyle),
    perspectiveStyles: (value.perspectiveStyles ?? []).map(normalizePerspectiveStyle),
  };
}

export function normalizeView(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('view must be an object');
  const key = safeId(value.key, 'view key');
  const type = value.type ?? 'static';
  if (!VIEW_TYPES.includes(type)) throw new SyntaxError('view type must be ' + VIEW_TYPES.join(', '));
  const direction = value.direction ?? 'top-down';
  if (!VIEW_DIRECTIONS.includes(direction)) throw new SyntaxError('view direction must be ' + VIEW_DIRECTIONS.join(', '));
  const order = stringList(value.order, 'view ' + key + ' order');
  if (type === 'dynamic' && !order.length) throw new RangeError('dynamic view "' + key + '" needs an ordered relationship list');
  return {
    key,
    title: typeof value.title === 'string' && value.title.trim() ? value.title.trim() : key,
    type,
    description: typeof value.description === 'string' ? value.description.trim() : '',
    includeTags: stringList(value.includeTags, 'view ' + key + ' includeTags'),
    excludeTags: stringList(value.excludeTags, 'view ' + key + ' excludeTags'),
    includeElements: stringList(value.includeElements, 'view ' + key + ' includeElements'),
    excludeElements: stringList(value.excludeElements, 'view ' + key + ' excludeElements'),
    pages: stringList(value.pages, 'view ' + key + ' pages'),
    order,
    direction,
    perspective: value.perspective == null ? null : String(value.perspective).trim() || null,
    showKey: value.showKey !== false,
  };
}

export function normalizeResource(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('resource must be an object');
  const id = safeId(value.id, 'resource id');
  const type = value.type ?? 'documentation';
  if (!RESOURCE_TYPES.includes(type)) throw new SyntaxError('resource type must be ' + RESOURCE_TYPES.join(', '));
  if (typeof value.uri !== 'string' || !value.uri.trim()) throw new TypeError('resource "' + id + '" needs a URI or local path');
  return {
    id,
    type,
    label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : id,
    uri: value.uri.trim(),
    description: typeof value.description === 'string' ? value.description.trim() : '',
    tags: stringList(value.tags, 'resource ' + id + ' tags'),
  };
}

export function restoreWorkspaceState(raw = {}) {
  if (raw.views != null && !Array.isArray(raw.views)) throw new TypeError('document views must be an array');
  if (raw.resources != null && !Array.isArray(raw.resources)) throw new TypeError('document resources must be an array');
  if (raw.modelAcceptances != null && !Array.isArray(raw.modelAcceptances)) throw new TypeError('document modelAcceptances must be an array');
  const views = (raw.views ?? []).map(normalizeView);
  if (new Set(views.map((view) => view.key)).size !== views.length) throw new Error('document view keys must be unique');
  const resources = (raw.resources ?? []).map(normalizeResource);
  if (new Set(resources.map((resource) => resource.id)).size !== resources.length) throw new Error('document resource ids must be unique');
  const modelAcceptances = (raw.modelAcceptances ?? []).map((entry) => {
    if (!entry || typeof entry.fingerprint !== 'string' || typeof entry.reason !== 'string' || !entry.reason.trim()) {
      throw new TypeError('model acceptance entries need fingerprint and non-empty reason');
    }
    return { fingerprint: entry.fingerprint, reason: entry.reason.trim() };
  });
  return { views, theme: normalizeTheme(raw.theme ?? {}), resources, modelAcceptances };
}

export function defineView(doc, value) {
  const view = normalizeView(value);
  const index = doc.views.findIndex((entry) => entry.key === view.key);
  if (index >= 0) doc.views[index] = view;
  else doc.views.push(view);
  doc.views.sort((a, b) => a.key.localeCompare(b.key));
  return view;
}

export function removeView(doc, key) {
  const index = doc.views.findIndex((entry) => entry.key === key);
  if (index < 0) throw new Error('no view "' + key + '"');
  return doc.views.splice(index, 1)[0];
}

export function configureTheme(doc, value) {
  doc.theme = normalizeTheme(value);
  return doc.theme;
}

export function upsertResource(doc, value) {
  const resource = normalizeResource(value);
  const index = doc.resources.findIndex((entry) => entry.id === resource.id);
  if (index >= 0) doc.resources[index] = resource;
  else doc.resources.push(resource);
  doc.resources.sort((a, b) => a.id.localeCompare(b.id));
  return resource;
}

export function removeResource(doc, id) {
  const index = doc.resources.findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error('no resource "' + id + '"');
  return doc.resources.splice(index, 1)[0];
}

const allElements = (doc) => Object.values(doc.elements ?? {}).flat();
const tagsOf = (element) => new Set(element.tags ?? []);

export function resolveView(doc, key = null) {
  const elements = allElements(doc);
  if (key == null) {
    return { view: null, elements, elementIds: new Set(elements.map((entry) => entry.id)), relationshipOrder: new Map() };
  }
  const view = doc.views.find((entry) => entry.key === key);
  if (!view) throw new Error('no view "' + key + '" — available: ' + (doc.views.map((entry) => entry.key).join(', ') || '(none)'));
  const includeElements = new Set(view.includeElements);
  const excludeElements = new Set(view.excludeElements);
  const includeTags = new Set(view.includeTags);
  const excludeTags = new Set(view.excludeTags);
  const pageSet = new Set(view.pages);
  const pageOf = new Map(Object.entries(doc.elements).flatMap(([page, list]) => list.map((entry) => [entry.id, page])));
  const hasPositiveFilter = includeElements.size > 0 || includeTags.size > 0;
  const selected = new Set(elements.filter((element) => {
    const tags = tagsOf(element);
    if (pageSet.size && !pageSet.has(pageOf.get(element.id))) return false;
    if (excludeElements.has(element.id) || [...excludeTags].some((tag) => tags.has(tag))) return false;
    return !hasPositiveFilter || includeElements.has(element.id) || [...includeTags].some((tag) => tags.has(tag));
  }).map((entry) => entry.id));

  if (view.type === 'dynamic') {
    selected.clear();
    for (const id of view.order) {
      const relationship = elements.find((entry) => entry.id === id && entry.relationship);
      if (!relationship) throw new Error('dynamic view "' + key + '" names missing relationship "' + id + '"');
      selected.add(id);
      selected.add(relationship.relationship.from.id);
      selected.add(relationship.relationship.to.id);
    }
  } else {
    for (const element of elements.filter((entry) => entry.relationship)) {
      if (selected.has(element.relationship.from.id) && selected.has(element.relationship.to.id)) selected.add(element.id);
    }
  }
  const relationshipOrder = new Map(view.order.map((id, index) => [id, index + 1]));
  return { view, elements: elements.filter((entry) => selected.has(entry.id)), elementIds: selected, relationshipOrder };
}

export function styleForElement(doc, element, perspective = null) {
  const combined = {};
  const tags = tagsOf(element);
  for (const rule of doc.theme?.tagStyles ?? []) if (tags.has(rule.tag)) Object.assign(combined, rule);
  if (perspective && element.perspectives?.[perspective] != null) {
    const value = String(element.perspectives[perspective]);
    for (const rule of doc.theme?.perspectiveStyles ?? []) {
      if (rule.perspective === perspective && rule.value === value) Object.assign(combined, rule);
    }
  }
  delete combined.tag;
  delete combined.perspective;
  delete combined.value;
  return combined;
}

export function generatedKey(doc, viewKey = null) {
  const resolved = resolveView(doc, viewKey);
  const tags = new Set(resolved.elements.flatMap((element) => element.tags ?? []));
  const tagEntries = (doc.theme?.tagStyles ?? [])
    .filter((style) => tags.has(style.tag))
    .map((style) => ({ type: 'tag', label: style.tag, fill: style.fill ?? null, stroke: style.stroke ?? null, text: style.text ?? null }));
  const perspective = resolved.view?.perspective ?? null;
  const perspectiveEntries = perspective
    ? (doc.theme?.perspectiveStyles ?? [])
      .filter((style) => style.perspective === perspective && resolved.elements.some((element) => String(element.perspectives?.[perspective]) === style.value))
      .map((style) => ({ type: 'perspective', label: perspective + ': ' + style.value, fill: style.fill ?? null, stroke: style.stroke ?? null, text: style.text ?? null }))
    : [];
  return { title: (resolved.view?.title ?? doc.name) + ' key', entries: [...tagEntries, ...perspectiveEntries] };
}
