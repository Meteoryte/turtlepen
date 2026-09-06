/**
 * Semantic timelines compiled onto TurtlePen's ordinary primitives.
 *
 * A timeline is durable source data, not a renderer shortcut. The compiler
 * emits the same place_box, pen, annotate, page, scale, and group operations an
 * author can write by hand. Stable ids make every generated primitive
 * addressable; the stored source makes create/update/reflow deterministic.
 */

import { createHash } from 'node:crypto';
import { parseAddress, pinPoint, quadToAddress } from './address.js';
import { requiredCellsFor } from './text.js';

export const TIMELINE_SCHEMA_VERSION = 1;
export const TIMELINE_ACTIONS = Object.freeze([
  'create', 'update', 'add_event', 'update_event', 'remove_event', 'reflow', 'inspect',
]);
export const TIMELINE_ORIENTATIONS = Object.freeze(['vertical', 'horizontal']);
export const TIMELINE_LAYOUTS = Object.freeze([
  'alternating', 'single-sided', 'multi-track', 'phase-band', 'compact', 'detailed',
]);
export const TIMELINE_SPACING = Object.freeze(['ordinal', 'temporal']);
export const TIMELINE_ORDERS = Object.freeze(['chronological', 'input']);
export const TIMELINE_SIDES = Object.freeze(['start', 'end']);
export const TIMELINE_EVENT_TYPES = Object.freeze([
  'point', 'period', 'phase', 'milestone', 'release', 'deadline', 'transition',
]);
export const TIMELINE_STATUSES = Object.freeze([
  'planned', 'active', 'current', 'complete', 'delayed', 'cancelled', 'unknown',
]);

export const TIMELINE_RULES = Object.freeze({
  T001: { severity: 'S1', title: 'timeline primitive missing', blurb: 'semantic timeline source names a generated primitive that no longer exists' },
  T002: { severity: 'S1', title: 'timeline association broken', blurb: 'a generated primitive no longer identifies the timeline event it represents' },
  T003: { severity: 'S1', title: 'timeline order contradiction', blurb: 'dated markers run backward or same-date events no longer preserve input order' },
  T004: { severity: 'S1', title: 'timeline reference missing', blurb: 'an event names a phase, track, parent, or related event that does not exist' },
  T005: { severity: 'S2', title: 'current state conflict', blurb: 'more than one event claims to be the single current point' },
  T006: { severity: 'S2', title: 'approximation styling lost', blurb: 'an approximate event is rendered without a non-exact visual treatment' },
  T007: { severity: 'S1', title: 'temporal position contradiction', blurb: 'a marker no longer matches the declared quantitative time scale' },
  T008: { severity: 'S2', title: 'empty timeline phase', blurb: 'a declared phase contains no events and communicates no interval' },
});

const ID = /^[A-Za-z0-9_-]+$/;
const ISO_DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const MAX_AUTO_TEMPORAL_SPAN_CELLS = 2000;
const BASELINE_PRESENTATION_FIELDS = Object.freeze([
  'role', 'fill', 'opacity', 'stroke', 'fontSize', 'weight', 'align', 'corner', 'shape', 'state',
]);
const BASELINE_CONTENT_FIELDS = Object.freeze([
  'label', 'text', 'description', 'technology', 'tags', 'properties', 'perspectives', 'relationshipLabel', 'outcome',
]);

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function unknownFields(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new SyntaxError(`${label} has unknown field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
}

function safeId(value, label) {
  if (!ID.test(String(value ?? ''))) throw new SyntaxError(`${label} must be alphanumeric with optional dashes or underscores`);
  return String(value);
}

function text(value, label, { required = false } = {}) {
  if (value == null) {
    if (required) throw new TypeError(`${label} is required`);
    return null;
  }
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

function stringList(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new TypeError(`${label} must be an array of non-empty strings`);
  }
  return [...new Set(value.map((entry) => entry.trim()))];
}

function enumValue(value, allowed, label, fallback) {
  const resolved = value ?? fallback;
  if (!allowed.includes(resolved)) throw new SyntaxError(`${label} must be ${allowed.join(', ')} — got ${JSON.stringify(resolved)}`);
  return resolved;
}

/** Parse a canonical ISO year, month, or day without inventing missing precision. */
export function parseTimelineDate(value, label = 'timeline date') {
  if (value == null) return null;
  const iso = String(value).trim();
  const match = ISO_DATE.exec(iso);
  if (!match) throw new SyntaxError(`${label} must be canonical ISO YYYY, YYYY-MM, or YYYY-MM-DD — got ${JSON.stringify(value)}`);
  const year = Number(match[1]);
  const month = match[2] == null ? 1 : Number(match[2]);
  const day = match[3] == null ? 1 : Number(match[3]);
  if (year < 1 || month < 1 || month > 12) throw new RangeError(`${label} is not a real calendar date: ${iso}`);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month, 0);
  const days = calendar.getUTCDate();
  if (day < 1 || day > days) throw new RangeError(`${label} is not a real calendar date: ${iso}`);
  const precision = match[3] != null ? 'day' : match[2] != null ? 'month' : 'year';
  calendar.setUTCFullYear(year, month - 1, day);
  return { iso, precision, value: calendar.getTime() };
}

function normalizeRelationship(value, label) {
  object(value, label);
  unknownFields(value, ['to', 'type', 'label'], label);
  return {
    to: safeId(value.to, `${label}.to`),
    type: text(value.type, `${label}.type`) ?? 'related',
    ...(value.label != null ? { label: text(value.label, `${label}.label`, { required: true }) } : {}),
  };
}

export function normalizeTimelineEvent(value, index = 0, { partial = false, inputIndex = index } = {}) {
  object(value, `timeline event ${index + 1}`);
  unknownFields(value, [
    'id', 'type', 'title', 'description', 'date', 'startDate', 'endDate', 'displayDate',
    'approximate', 'current', 'status', 'sequence', 'phase', 'track', 'category', 'parent',
    'resources', 'relationships', 'inputIndex',
    // Derived fields are accepted on a normalized record and recomputed below.
    'datePrecision', 'dateValue', 'endDatePrecision', 'endDateValue',
  ], `timeline event ${index + 1}`);

  const out = {};
  if (!partial || value.id != null) out.id = safeId(value.id, `timeline event ${index + 1} id`);
  if (!partial || value.title != null) out.title = text(value.title, `timeline event ${out.id ?? index + 1} title`, { required: !partial });

  if (value.type != null || !partial) {
    const inferred = value.endDate != null ? 'period' : 'point';
    out.type = enumValue(value.type, TIMELINE_EVENT_TYPES, `timeline event ${out.id ?? index + 1} type`, inferred);
  }
  for (const key of ['description', 'displayDate', 'phase', 'track', 'category', 'parent']) {
    if (value[key] != null) out[key] = key === 'phase' || key === 'track' || key === 'parent'
      ? safeId(value[key], `timeline event ${out.id ?? index + 1} ${key}`)
      : text(value[key], `timeline event ${out.id ?? index + 1} ${key}`, { required: true });
  }
  if (value.status != null) out.status = enumValue(value.status, TIMELINE_STATUSES, `timeline event ${out.id ?? index + 1} status`);
  if (value.approximate != null) {
    if (typeof value.approximate !== 'boolean') throw new TypeError(`timeline event ${out.id ?? index + 1} approximate must be boolean`);
    out.approximate = value.approximate;
  }
  if (value.current != null) {
    if (typeof value.current !== 'boolean') throw new TypeError(`timeline event ${out.id ?? index + 1} current must be boolean`);
    out.current = value.current;
  }
  if (value.sequence != null) {
    if (!Number.isInteger(value.sequence)) throw new TypeError(`timeline event ${out.id ?? index + 1} sequence must be a whole number`);
    out.sequence = value.sequence;
  }
  if (value.resources != null) out.resources = stringList(value.resources, `timeline event ${out.id ?? index + 1} resources`);
  if (value.relationships != null) {
    if (!Array.isArray(value.relationships)) throw new TypeError(`timeline event ${out.id ?? index + 1} relationships must be an array`);
    out.relationships = value.relationships.map((entry, relationshipIndex) => normalizeRelationship(entry, `timeline event ${out.id ?? index + 1} relationship ${relationshipIndex + 1}`));
  }

  const rawStart = value.startDate ?? value.date;
  if (value.startDate != null && value.date != null && value.startDate !== value.date) {
    throw new SyntaxError(`timeline event ${out.id ?? index + 1} supplies both date and startDate with different values`);
  }
  if (rawStart != null) {
    const parsed = parseTimelineDate(rawStart, `timeline event ${out.id ?? index + 1} date`);
    out.date = parsed.iso;
    out.datePrecision = parsed.precision;
    out.dateValue = parsed.value;
  }
  if (value.endDate != null) {
    if (rawStart == null) throw new SyntaxError(`timeline event ${out.id ?? index + 1} endDate needs date or startDate`);
    const parsed = parseTimelineDate(value.endDate, `timeline event ${out.id ?? index + 1} endDate`);
    if (parsed.value < out.dateValue) throw new RangeError(`timeline event ${out.id ?? index + 1} range ends before it starts (${out.date}..${parsed.iso})`);
    out.endDate = parsed.iso;
    out.endDatePrecision = parsed.precision;
    out.endDateValue = parsed.value;
  }
  if (value.inputIndex != null) {
    if (!Number.isInteger(value.inputIndex) || value.inputIndex < 0) throw new RangeError(`timeline event ${out.id ?? index + 1} inputIndex must be a non-negative whole number`);
    out.inputIndex = value.inputIndex;
  } else if (!partial) out.inputIndex = inputIndex;

  return out;
}

function normalizePhase(value, index) {
  object(value, `timeline phase ${index + 1}`);
  unknownFields(value, ['id', 'title', 'description', 'startDate', 'endDate', 'displayDate', 'status', 'startDateValue', 'endDateValue'], `timeline phase ${index + 1}`);
  const id = safeId(value.id, `timeline phase ${index + 1} id`);
  const start = value.startDate == null ? null : parseTimelineDate(value.startDate, `timeline phase ${id} startDate`);
  const end = value.endDate == null ? null : parseTimelineDate(value.endDate, `timeline phase ${id} endDate`);
  if ((start == null) !== (end == null)) throw new SyntaxError(`timeline phase ${id} needs both startDate and endDate, or neither`);
  if (start && end.value < start.value) throw new RangeError(`timeline phase ${id} ends before it starts (${start.iso}..${end.iso})`);
  return {
    id,
    title: text(value.title, `timeline phase ${id} title`) ?? id,
    ...(value.description != null ? { description: text(value.description, `timeline phase ${id} description`, { required: true }) } : {}),
    ...(start ? { startDate: start.iso, startDateValue: start.value, endDate: end.iso, endDateValue: end.value } : {}),
    ...(value.displayDate != null ? { displayDate: text(value.displayDate, `timeline phase ${id} displayDate`, { required: true }) } : {}),
    ...(value.status != null ? { status: enumValue(value.status, TIMELINE_STATUSES, `timeline phase ${id} status`) } : {}),
  };
}

function normalizeTrack(value, index) {
  object(value, `timeline track ${index + 1}`);
  unknownFields(value, ['id', 'title', 'description'], `timeline track ${index + 1}`);
  const id = safeId(value.id, `timeline track ${index + 1} id`);
  return {
    id,
    title: text(value.title, `timeline track ${id} title`) ?? id,
    ...(value.description != null ? { description: text(value.description, `timeline track ${id} description`, { required: true }) } : {}),
  };
}

function assertUnique(list, label) {
  const duplicate = list.map((entry) => entry.id).find((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicate) throw new Error(`${label} id "${duplicate}" is duplicated`);
}

function normalizeGenerated(value) {
  if (value == null) return null;
  object(value, 'timeline generated receipt');
  const out = structuredClone(value);
  if (out.elementIds != null && (!Array.isArray(out.elementIds) || out.elementIds.some((id) => !ID.test(String(id))))) {
    throw new TypeError('timeline generated elementIds must be valid ids');
  }
  if (out.pageIds != null && (!Array.isArray(out.pageIds) || out.pageIds.some((id) => !ID.test(String(id))))) {
    throw new TypeError('timeline generated pageIds must be valid ids');
  }
  return out;
}

export function normalizeTimelineDefinition(value, { allowGenerated = false } = {}) {
  object(value, 'timeline');
  const allowed = [
    'schema', 'id', 'title', 'page', 'at', 'orientation', 'layout', 'side', 'spacing', 'order',
    'spanCells', 'cardWidthCells', 'gapCells', 'fitCanvas', 'currentDate', 'currentDateValue', 'events', 'phases',
    'tracks', 'showRelationships', ...(allowGenerated ? ['generated'] : []),
  ];
  unknownFields(value, allowed, 'timeline');
  const id = safeId(value.id, 'timeline id');
  if (!Array.isArray(value.events) || value.events.length === 0) throw new RangeError(`timeline "${id}" needs at least one event`);
  const events = value.events.map((entry, index) => normalizeTimelineEvent(entry, index, { inputIndex: entry.inputIndex ?? index }));
  const phases = (value.phases ?? []).map(normalizePhase);
  const tracks = (value.tracks ?? []).map(normalizeTrack);
  assertUnique(events, `timeline "${id}" event`);
  assertUnique(phases, `timeline "${id}" phase`);
  assertUnique(tracks, `timeline "${id}" track`);

  const spanCells = value.spanCells ?? null;
  if (spanCells != null && (!Number.isInteger(spanCells) || spanCells < 4)) throw new RangeError(`timeline "${id}" spanCells must be a whole number of at least 4`);
  const cardWidthCells = value.cardWidthCells ?? null;
  if (cardWidthCells != null && (!Number.isInteger(cardWidthCells) || cardWidthCells < 10 || cardWidthCells > 80)) {
    throw new RangeError(`timeline "${id}" cardWidthCells must be a whole number from 10 to 80`);
  }
  const gapCells = value.gapCells ?? 4;
  if (!Number.isInteger(gapCells) || gapCells < 1 || gapCells > 20) throw new RangeError(`timeline "${id}" gapCells must be a whole number from 1 to 20`);
  if (value.fitCanvas != null && typeof value.fitCanvas !== 'boolean') throw new TypeError(`timeline "${id}" fitCanvas must be boolean`);
  if (value.showRelationships != null && typeof value.showRelationships !== 'boolean') throw new TypeError('timeline showRelationships must be boolean');
  const currentDate = value.currentDate == null ? null : parseTimelineDate(value.currentDate, `timeline "${id}" currentDate`);

  return {
    schema: TIMELINE_SCHEMA_VERSION,
    id,
    title: text(value.title, `timeline "${id}" title`) ?? id,
    page: safeId(value.page ?? 'base', `timeline "${id}" page`),
    at: String(value.at ?? 'C4'),
    orientation: enumValue(value.orientation, TIMELINE_ORIENTATIONS, `timeline "${id}" orientation`, 'vertical'),
    layout: enumValue(value.layout, TIMELINE_LAYOUTS, `timeline "${id}" layout`, 'alternating'),
    side: enumValue(value.side, TIMELINE_SIDES, `timeline "${id}" side`, 'end'),
    spacing: enumValue(value.spacing, TIMELINE_SPACING, `timeline "${id}" spacing`, 'ordinal'),
    order: enumValue(value.order, TIMELINE_ORDERS, `timeline "${id}" order`, 'chronological'),
    ...(spanCells != null ? { spanCells } : {}),
    ...(cardWidthCells != null ? { cardWidthCells } : {}),
    gapCells,
    fitCanvas: value.fitCanvas !== false,
    ...(value.showRelationships ? { showRelationships: true } : {}),
    ...(currentDate ? { currentDate: currentDate.iso, currentDateValue: currentDate.value } : {}),
    events,
    phases,
    tracks,
    ...(allowGenerated && value.generated ? { generated: normalizeGenerated(value.generated) } : {}),
  };
}

export function restoreTimelines(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError('document timelines must be an array');
  const timelines = value.map((entry) => normalizeTimelineDefinition(entry, { allowGenerated: true }));
  assertUnique(timelines, 'document timeline');
  return timelines.sort((a, b) => a.id.localeCompare(b.id));
}

export function timelinesOf(doc) {
  if (!Array.isArray(doc.timelines)) doc.timelines = [];
  return doc.timelines;
}

export function findTimeline(doc, id) {
  return timelinesOf(doc).find((entry) => entry.id === id) ?? null;
}

const DEFINITION_FIELDS = Object.freeze([
  'id', 'title', 'page', 'at', 'orientation', 'layout', 'side', 'spacing', 'order', 'spanCells',
  'cardWidthCells', 'gapCells', 'fitCanvas', 'currentDate', 'events', 'phases', 'tracks', 'showRelationships',
]);
const REFLOW_FIELDS = new Set(['page', 'at', 'orientation', 'layout', 'side', 'spacing', 'order', 'spanCells', 'cardWidthCells', 'gapCells', 'fitCanvas', 'showRelationships']);

function picked(value, fields) {
  return Object.fromEntries(fields.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
}

/** Build the next semantic source record for one timeline action. */
export function timelineMutation(doc, args) {
  object(args, 'timeline operation');
  const action = enumValue(args.action, TIMELINE_ACTIONS, 'timeline action', 'create');
  const id = safeId(args.id, 'timeline id');
  const previous = findTimeline(doc, id);
  if (action === 'inspect') {
    if (!previous) throw new Error(`no timeline "${id}"`);
    return { action, previous, next: previous };
  }
  if (action === 'create') {
    if (previous) throw new Error(`timeline "${id}" already exists — use update or reflow`);
    const next = normalizeTimelineDefinition({ ...picked(args, DEFINITION_FIELDS), id });
    return { action, previous: null, next };
  }
  if (!previous) throw new Error(`no timeline "${id}" — create it first`);

  if (action === 'update') {
    const patch = picked(args, DEFINITION_FIELDS.filter((key) => key !== 'id'));
    const { generated: _generated, ...base } = previous;
    const next = normalizeTimelineDefinition({ ...base, ...patch, id });
    return { action, previous, next };
  }
  if (action === 'reflow') {
    const attempted = Object.keys(args).filter((key) => DEFINITION_FIELDS.includes(key) && key !== 'id' && !REFLOW_FIELDS.has(key));
    if (attempted.length) throw new SyntaxError(`timeline reflow changes layout only; use update for ${attempted.join(', ')}`);
    const patch = picked(args, [...REFLOW_FIELDS]);
    const { generated: _generated, ...base } = previous;
    const next = normalizeTimelineDefinition({ ...base, ...patch, id });
    return { action, previous, next };
  }
  if (action === 'add_event') {
    if (!args.event) throw new TypeError('timeline add_event needs event');
    const inputIndex = Math.max(-1, ...previous.events.map((entry) => entry.inputIndex)) + 1;
    const event = normalizeTimelineEvent(args.event, previous.events.length, { inputIndex });
    if (previous.events.some((entry) => entry.id === event.id)) throw new Error(`timeline "${id}" already has event "${event.id}"`);
    const { generated: _generated, ...base } = previous;
    const next = normalizeTimelineDefinition({ ...base, events: [...previous.events, event] });
    return { action, previous, next, eventId: event.id };
  }
  if (action === 'update_event') {
    const eventId = safeId(args.eventId, 'timeline eventId');
    if (!args.event) throw new TypeError('timeline update_event needs event changes');
    const index = previous.events.findIndex((entry) => entry.id === eventId);
    if (index < 0) throw new Error(`timeline "${id}" has no event "${eventId}"`);
    if (args.event.id != null && args.event.id !== eventId) throw new Error('timeline update_event cannot rename an event; remove and add it with the new id');
    const current = previous.events[index];
    const updated = normalizeTimelineEvent(
      { ...current, ...args.event, id: eventId, inputIndex: current.inputIndex },
      index,
      { inputIndex: current.inputIndex },
    );
    const events = previous.events.map((entry, i) => i === index ? updated : entry);
    const { generated: _generated, ...base } = previous;
    const next = normalizeTimelineDefinition({ ...base, events });
    return { action, previous, next, eventId };
  }
  if (action === 'remove_event') {
    const eventId = safeId(args.eventId, 'timeline eventId');
    if (!previous.events.some((entry) => entry.id === eventId)) throw new Error(`timeline "${id}" has no event "${eventId}"`);
    const events = previous.events.filter((entry) => entry.id !== eventId);
    if (!events.length) throw new Error(`timeline "${id}" cannot remove its final event`);
    const { generated: _generated, ...base } = previous;
    const next = normalizeTimelineDefinition({ ...base, events });
    return { action, previous, next, eventId };
  }
  throw new SyntaxError(`unknown timeline action ${JSON.stringify(action)}`);
}

export function orderedTimelineEvents(timeline) {
  const events = [...timeline.events];
  if (timeline.order === 'input') return events.sort((a, b) => a.inputIndex - b.inputIndex);
  return events.sort((a, b) => {
    const ad = Number.isFinite(a.dateValue), bd = Number.isFinite(b.dateValue);
    if (ad !== bd) return ad ? -1 : 1;
    if (ad && a.dateValue !== b.dateValue) return a.dateValue - b.dateValue;
    if (!ad && (a.sequence ?? Infinity) !== (b.sequence ?? Infinity)) return (a.sequence ?? Infinity) - (b.sequence ?? Infinity);
    return a.inputIndex - b.inputIndex;
  });
}

function eventDateLabel(event) {
  let label = event.displayDate ?? (event.date ? (event.endDate ? `${event.date} – ${event.endDate}` : event.date) : '');
  if (!label && (event.current || event.status === 'current')) label = 'Current';
  if (event.approximate && label && !/^(?:≈|~|c\.)/i.test(label)) label = `≈ ${label}`;
  return label;
}

function eventCardLabel(event, layout) {
  const date = eventDateLabel(event);
  const lines = date ? [date, event.title] : [event.title];
  if (layout === 'detailed') {
    if (event.description) lines.push(event.description);
    const state = [event.status, event.category].filter(Boolean).join(' · ');
    if (state) lines.push(state);
    if (event.resources?.length) lines.push(`Resources: ${event.resources.join(', ')}`);
  }
  return lines.join('\n');
}

function eventRole(event) {
  if (event.current || event.status === 'current') return 'timeline-current';
  if (event.status === 'planned') return 'timeline-planned';
  if (event.type === 'milestone') return 'timeline-milestone';
  if (event.type === 'release') return 'timeline-release';
  if (event.type === 'deadline' || event.status === 'delayed') return 'timeline-deadline';
  return 'timeline-event';
}

function markerProgram(event, x, y) {
  const a = (dx, dy) => quadToAddress(x + dx, y + dy);
  if (event.current || event.status === 'current') return `pen ${a(0, 0)}\ndisc 2`;
  if (event.type === 'milestone' || event.type === 'transition') {
    return `pen ${a(0, -2)}\npolygon ${a(2, 0)} ${a(0, 2)} ${a(-2, 0)}`;
  }
  if (event.type === 'release' || event.type === 'period' || event.type === 'phase') {
    return `pen ${a(-2, -2)}\npolygon ${a(2, -2)} ${a(2, 2)} ${a(-2, 2)}${event.status === 'complete' ? ' fill' : ''}`;
  }
  if (event.type === 'deadline') return `pen ${a(0, -2)}\ntriangle ${a(2, 2)} ${a(-2, 2)}`;
  return `pen ${a(0, 0)}\ncircle 2`;
}

function lineProgram(x1, y1, x2, y2) {
  if (x1 !== x2 && y1 !== y2) throw new Error('timeline compiler attempted a non-orthogonal link');
  if (x1 === x2 && y1 === y2) return `pen ${quadToAddress(x1, y1)}\ndot`;
  const direction = x2 > x1 ? 'right' : x2 < x1 ? 'left' : y2 > y1 ? 'down' : 'up';
  return `pen ${quadToAddress(x1, y1)}\n${direction} line to ${quadToAddress(x2, y2)}`;
}

function annotation(id, properties, { description = null, tags = [] } = {}) {
  return {
    op: 'annotate', id,
    ...(description ? { description } : {}),
    tags: [...new Set(['timeline', ...tags])],
    properties: Object.fromEntries(Object.entries(properties).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)])),
  };
}

function eventProperties(timeline, event, role) {
  return {
    generatedBy: 'timeline', timelineId: timeline.id, timelineRole: role, eventId: event.id,
    eventType: event.type, date: event.date, endDate: event.endDate, displayDate: eventDateLabel(event) || null,
    datePrecision: event.datePrecision, endDatePrecision: event.endDatePrecision,
    approximate: Boolean(event.approximate), current: Boolean(event.current || event.status === 'current'),
    status: event.status, sequence: event.sequence, phase: event.phase, track: event.track,
    category: event.category, parent: event.parent,
    resources: event.resources?.length ? JSON.stringify(event.resources) : null,
    relationships: event.relationships?.length ? JSON.stringify(event.relationships) : null,
  };
}

function escaped(value) {
  return String(value).replaceAll('"', "'").replace(/\s+/g, ' ').trim();
}

function textOperation(id, page, label, x, y, width, height, font, weight = 400, align = 'left') {
  return {
    op: 'pen', page, id,
    program: `text "${escaped(label)}" at ${quadToAddress(x, y)} span ${width}x${height} id ${id} font ${font} weight ${weight} align ${align}`,
  };
}

function primaryPositions(timeline, events, minGapCells, requestedSpan) {
  const phaseTransitions = timeline.layout === 'phase-band'
    ? events.slice(1).filter((event, index) => event.phase !== events[index].phase).length
    : 0;
  const baseMin = Math.max(4, (events.length - 1) * minGapCells + phaseTransitions + 4);
  if (timeline.spacing !== 'temporal') {
    const spanCells = requestedSpan ?? baseMin;
    if (spanCells < baseMin) {
      throw new RangeError(`timeline "${timeline.id}" needs at least ${baseMin} cells along its ${timeline.orientation} axis for ${events.length} event(s); got ${spanCells}`);
    }
    const extra = spanCells - baseMin;
    let cell = 2;
    const positions = events.map((event, index) => {
      if (index > 0) cell += minGapCells + (timeline.layout === 'phase-band' && event.phase !== events[index - 1].phase ? 1 : 0);
      return {
        event,
        cell: events.length === 1 ? 2 : cell + Math.round((index / (events.length - 1)) * extra),
        expectedCell: null,
        clusterOffsetCells: 0,
      };
    });
    return { spanCells, minimumSpanCells: baseMin, positions, scale: null, spacingResolved: 'ordinal' };
  }

  const dated = events.filter((event) => Number.isFinite(event.dateValue));
  const undated = events.filter((event) => !Number.isFinite(event.dateValue));
  const distinct = [...new Set(dated.map((event) => event.dateValue))].sort((a, b) => a - b);
  if (distinct.length < 2) {
    const fallback = primaryPositions({ ...timeline, spacing: 'ordinal' }, events, minGapCells, requestedSpan);
    return { ...fallback, spacingResolved: 'ordinal-single-date', note: 'temporal spacing needs at least two distinct dated events; no date was invented, so ordinal spacing was used' };
  }

  const domain = [distinct[0], distinct.at(-1)];
  const range = domain[1] - domain[0];
  const minDateGap = Math.min(...distinct.slice(1).map((value, index) => value - distinct[index]));
  const duplicates = dated.length - distinct.length;
  const tail = (duplicates + undated.length) * minGapCells;
  const scaled = Math.ceil((range / minDateGap) * minGapCells);
  const minimumSpanCells = Math.max(baseMin, 4 + scaled + tail);
  if (requestedSpan != null && requestedSpan < minimumSpanCells) {
    throw new RangeError(
      `timeline "${timeline.id}" temporal spacing needs at least ${minimumSpanCells} cells to keep its smallest dated interval and cards distinct; got ${requestedSpan}`,
    );
  }
  if (requestedSpan == null && minimumSpanCells > MAX_AUTO_TEMPORAL_SPAN_CELLS) {
    throw new RangeError(
      `timeline "${timeline.id}" temporal spacing needs ${minimumSpanCells} cells because its smallest interval is tiny relative to the full range. `
      + `The automatic ceiling is ${MAX_AUTO_TEMPORAL_SPAN_CELLS}; use spacing "ordinal", narrow the time range, or intentionally set spanCells after reviewing the scale.`,
    );
  }
  const spanCells = requestedSpan ?? minimumSpanCells;
  const scaleCells = spanCells - 4 - tail;
  let previous = -Infinity;
  let previousDate = null;
  const positions = [];
  for (const event of dated) {
    const expected = 2 + ((event.dateValue - domain[0]) / range) * scaleCells;
    const sameDate = previousDate === event.dateValue;
    // Temporal positions may land on either half of a cell: that is one exact
    // quadrant, the finest unit the lattice can represent. Ordinal positions
    // stay on whole cells for the more relaxed layout.
    const projectedCell = Math.round(expected * 2) / 2;
    const cell = sameDate ? previous + minGapCells : Math.max(projectedCell, previous + minGapCells);
    positions.push({ event, cell, expectedCell: expected, clusterOffsetCells: sameDate ? cell - projectedCell : 0 });
    previous = cell;
    previousDate = event.dateValue;
  }
  for (const event of undated) {
    const cell = Number.isFinite(previous) ? previous + minGapCells : 2;
    positions.push({ event, cell, expectedCell: null, clusterOffsetCells: 0 });
    previous = cell;
  }
  return {
    spanCells, minimumSpanCells, positions,
    scale: { domain, quads: scaleCells * 2, offsetCells: 2 },
    spacingResolved: 'temporal',
  };
}

function trackSet(timeline) {
  const declared = timeline.tracks.length ? [...timeline.tracks] : [{ id: 'main', title: 'Timeline' }];
  if (timeline.layout === 'multi-track' && declared.length > 1) {
    for (const event of timeline.events) {
      if (!event.track) throw new Error(`timeline "${timeline.id}" uses multi-track layout with ${declared.length} tracks; event "${event.id}" must choose a track`);
    }
  }
  return declared;
}

/**
 * Compile one normalized timeline to ordinary TurtlePen operations.
 *
 * The returned operations contain no timeline-specific renderer payload. The
 * generated receipt is semantic source metadata for later update/reflow and
 * structural validation.
 */
export function compileTimeline(doc, timeline) {
  const origin = pinPoint(parseAddress(timeline.at));
  const events = orderedTimelineEvents(timeline);
  const compact = timeline.layout === 'compact';
  const detailed = timeline.layout === 'detailed';
  const cardWidth = timeline.cardWidthCells ?? (compact ? 18 : detailed ? 32 : 26);
  const fontSize = compact ? 8 : 10;
  const cards = new Map(events.map((event) => {
    const label = eventCardLabel(event, timeline.layout);
    const measured = requiredCellsFor(label, { fontSize, maxWidthCells: cardWidth, paddingQuads: 1 });
    return [event.id, { label, width: cardWidth, height: Math.max(compact ? 3 : 4, measured.cellsTall) }];
  }));
  const maxCardHeight = Math.max(...[...cards.values()].map((card) => card.height));
  const minGapCells = timeline.orientation === 'vertical'
    ? maxCardHeight + timeline.gapCells
    : cardWidth + timeline.gapCells;
  const primary = primaryPositions(timeline, events, minGapCells, timeline.spanCells ?? null);
  const tracks = trackSet(timeline);
  const trackIndex = new Map(tracks.map((track, index) => [track.id, index]));
  const defaultTrack = tracks.length === 1 ? tracks[0].id : null;
  const titleHeightCells = 3;
  const markerGapQuads = 6;
  const page = timeline.page;
  const guidePage = `${timeline.id}__guides`;
  const linkPage = `${timeline.id}__links`;
  const markerPage = `${timeline.id}__markers`;
  const groupId = `${timeline.id}__group`;
  const scaleId = `${timeline.id}__time`;
  const operations = [];
  const elementIds = [];
  const pageIds = [guidePage, linkPage, markerPage];
  for (const [id, title] of [[guidePage, 'guides'], [linkPage, 'links'], [markerPage, 'markers']]) {
    if (!doc.pages.some((entry) => entry.id === id)) operations.push({ op: 'add_page', id, intent: 'overlay', title: `${timeline.title} — ${title}` });
  }

  const multi = timeline.layout === 'multi-track';
  const alternating = ['alternating', 'phase-band', 'compact', 'detailed'].includes(timeline.layout);
  const titleId = `${timeline.id}__title`;
  let maxX = origin.x;
  let maxY = origin.y;
  const placed = [];
  const titleWidth = Math.max(cardWidth, Math.min(80, requiredCellsFor(timeline.title, { fontSize: 20 }).cellsWide));
  operations.push(textOperation(titleId, page, timeline.title, origin.x, origin.y, titleWidth, titleHeightCells, 20, 700));
  operations.push(annotation(titleId, { generatedBy: 'timeline', timelineId: timeline.id, timelineRole: 'title' }, { description: `Title for timeline ${timeline.title}`, tags: ['timeline-title'] }));
  elementIds.push(titleId);

  const eventPosition = new Map(primary.positions.map((entry) => [entry.event.id, entry]));
  if (timeline.orientation === 'vertical') {
    const phaseHeadroom = timeline.layout === 'phase-band' ? 8 : 0;
    const baseY = origin.y + titleHeightCells * 2 + 4 + phaseHeadroom;
    const trackStride = cardWidth * 2 + 16;
    const baseAxisX = alternating ? origin.x + cardWidth * 2 + 8 : timeline.side === 'start' ? origin.x + cardWidth * 2 + markerGapQuads : origin.x + 4;
    const axisByTrack = new Map(tracks.map((track, index) => [track.id, multi ? origin.x + index * trackStride + 4 : baseAxisX]));

    for (const track of tracks) {
      const axisX = axisByTrack.get(track.id);
      const axisId = tracks.length === 1 ? `${timeline.id}__axis` : `${timeline.id}__axis__${track.id}`;
      operations.push({ op: 'pen', page: guidePage, id: axisId, program: lineProgram(axisX, baseY, axisX, baseY + primary.spanCells * 2), role: 'artwork', width: 3 });
      operations.push(annotation(axisId, { generatedBy: 'timeline', timelineId: timeline.id, timelineRole: 'axis', track: track.id }, { tags: ['timeline-axis'] }));
      elementIds.push(axisId);
      if (multi || tracks.length > 1) {
        const labelId = `${timeline.id}__track__${track.id}`;
        operations.push(textOperation(labelId, page, track.title, axisX - 4, origin.y + titleHeightCells * 2, cardWidth, 2, 10, 700));
        operations.push(annotation(labelId, { generatedBy: 'timeline', timelineId: timeline.id, timelineRole: 'track', track: track.id }, { description: track.description ?? `Track ${track.title}`, tags: ['timeline-track'] }));
        elementIds.push(labelId);
      }
      maxX = Math.max(maxX, axisX + markerGapQuads + cardWidth * 2);
      maxY = Math.max(maxY, baseY + primary.spanCells * 2);
    }

    events.forEach((event, index) => {
      const track = event.track ?? defaultTrack ?? tracks[0].id;
      const axisX = axisByTrack.get(track) ?? baseAxisX;
      const y = baseY + eventPosition.get(event.id).cell * 2;
      const card = cards.get(event.id);
      const side = multi || !alternating ? timeline.side : index % 2 === 0 ? 'start' : 'end';
      const cardX = side === 'start' ? axisX - markerGapQuads - card.width * 2 : axisX + markerGapQuads;
      const cardY = y - card.height;
      const role = eventRole(event);
      const cardId = `${timeline.id}__${event.id}__card`;
      const markerId = `${timeline.id}__${event.id}__marker`;
      const linkId = `${timeline.id}__${event.id}__link`;
      const markerPattern = event.approximate ? 'dotted' : event.status === 'planned' ? 'dashed' : null;
      const props = eventProperties(timeline, event, role);
      operations.push({ op: 'place_box', page, id: cardId, at: quadToAddress(cardX, cardY), span: { w: card.width, h: card.height }, label: card.label, corner: 'rounded', role, align: 'left', fontSize });
      operations.push(annotation(cardId, { ...props, timelineRole: 'event-card' }, { description: event.description ?? event.title, tags: ['timeline-card', `timeline-${event.type}`, ...(event.status ? [`timeline-${event.status}`] : [])] }));
      operations.push({ op: 'pen', page: markerPage, id: markerId, program: markerProgram(event, axisX, y), role: 'artwork', width: 3, ...(markerPattern ? { pattern: markerPattern } : {}) });
      operations.push(annotation(markerId, { ...props, timelineRole: 'event-marker' }, { description: `Marker for ${event.title}`, tags: ['timeline-marker', `timeline-${event.type}`, ...(event.approximate ? ['timeline-approximate'] : [])] }));
      const linkEnd = side === 'start' ? cardX + card.width * 2 : cardX;
      operations.push({ op: 'pen', page: linkPage, id: linkId, program: lineProgram(axisX, y, linkEnd, y), role: 'artwork', width: 1, ...(event.approximate ? { pattern: 'dotted' } : {}) });
      operations.push(annotation(linkId, { ...props, timelineRole: 'event-link' }, { tags: ['timeline-link'] }));
      elementIds.push(cardId, markerId, linkId);
      placed.push({
        eventId: event.id, track, side,
        axisQuad: y, expectedAxisQuad: eventPosition.get(event.id).expectedCell == null ? null : baseY + Math.round(eventPosition.get(event.id).expectedCell * 2),
        clusterOffsetQuads: eventPosition.get(event.id).clusterOffsetCells * 2,
        markerAt: quadToAddress(axisX, y), cardAt: quadToAddress(cardX, cardY), cardSpan: { w: card.width, h: card.height },
      });
      maxX = Math.max(maxX, cardX + card.width * 2 + 8);
      maxY = Math.max(maxY, cardY + card.height * 2 + 8);
    });
  } else {
    // `at` is the layout's top-left, while event coordinates mark card
    // centres. Reserve half a card before the first axis position so the first
    // horizontal card never falls off the addressable canvas.
    const baseX = origin.x + cardWidth;
    const trackStride = maxCardHeight * 2 + 20;
    const phaseHeadroom = timeline.layout === 'phase-band' ? 8 : 0;
    const baseAxisY = origin.y + titleHeightCells * 2 + maxCardHeight * 2 + 10 + phaseHeadroom;
    const axisByTrack = new Map(tracks.map((track, index) => [track.id, multi ? baseAxisY + index * trackStride : baseAxisY]));

    for (const track of tracks) {
      const axisY = axisByTrack.get(track.id);
      const axisId = tracks.length === 1 ? `${timeline.id}__axis` : `${timeline.id}__axis__${track.id}`;
      operations.push({ op: 'pen', page: guidePage, id: axisId, program: lineProgram(baseX, axisY, baseX + primary.spanCells * 2, axisY), role: 'artwork', width: 3 });
      operations.push(annotation(axisId, { generatedBy: 'timeline', timelineId: timeline.id, timelineRole: 'axis', track: track.id }, { tags: ['timeline-axis'] }));
      elementIds.push(axisId);
      if (multi || tracks.length > 1) {
        const labelId = `${timeline.id}__track__${track.id}`;
        operations.push(textOperation(labelId, page, track.title, origin.x, axisY - 6, cardWidth, 2, 10, 700));
        operations.push(annotation(labelId, { generatedBy: 'timeline', timelineId: timeline.id, timelineRole: 'track', track: track.id }, { description: track.description ?? `Track ${track.title}`, tags: ['timeline-track'] }));
        elementIds.push(labelId);
      }
      maxX = Math.max(maxX, baseX + primary.spanCells * 2);
      maxY = Math.max(maxY, axisY + markerGapQuads + maxCardHeight * 2);
    }

    events.forEach((event, index) => {
      const track = event.track ?? defaultTrack ?? tracks[0].id;
      const axisY = axisByTrack.get(track) ?? baseAxisY;
      const x = baseX + eventPosition.get(event.id).cell * 2;
      const card = cards.get(event.id);
      const side = multi || !alternating ? timeline.side : index % 2 === 0 ? 'start' : 'end';
      const cardX = x - card.width;
      const cardY = side === 'start' ? axisY - markerGapQuads - card.height * 2 : axisY + markerGapQuads;
      const role = eventRole(event);
      const cardId = `${timeline.id}__${event.id}__card`;
      const markerId = `${timeline.id}__${event.id}__marker`;
      const linkId = `${timeline.id}__${event.id}__link`;
      const markerPattern = event.approximate ? 'dotted' : event.status === 'planned' ? 'dashed' : null;
      const props = eventProperties(timeline, event, role);
      operations.push({ op: 'place_box', page, id: cardId, at: quadToAddress(cardX, cardY), span: { w: card.width, h: card.height }, label: card.label, corner: 'rounded', role, align: 'left', fontSize });
      operations.push(annotation(cardId, { ...props, timelineRole: 'event-card' }, { description: event.description ?? event.title, tags: ['timeline-card', `timeline-${event.type}`, ...(event.status ? [`timeline-${event.status}`] : [])] }));
      operations.push({ op: 'pen', page: markerPage, id: markerId, program: markerProgram(event, x, axisY), role: 'artwork', width: 3, ...(markerPattern ? { pattern: markerPattern } : {}) });
      operations.push(annotation(markerId, { ...props, timelineRole: 'event-marker' }, { description: `Marker for ${event.title}`, tags: ['timeline-marker', `timeline-${event.type}`, ...(event.approximate ? ['timeline-approximate'] : [])] }));
      const linkEnd = side === 'start' ? cardY + card.height * 2 : cardY;
      operations.push({ op: 'pen', page: linkPage, id: linkId, program: lineProgram(x, axisY, x, linkEnd), role: 'artwork', width: 1, ...(event.approximate ? { pattern: 'dotted' } : {}) });
      operations.push(annotation(linkId, { ...props, timelineRole: 'event-link' }, { tags: ['timeline-link'] }));
      elementIds.push(cardId, markerId, linkId);
      placed.push({
        eventId: event.id, track, side,
        axisQuad: x, expectedAxisQuad: eventPosition.get(event.id).expectedCell == null ? null : baseX + Math.round(eventPosition.get(event.id).expectedCell * 2),
        clusterOffsetQuads: eventPosition.get(event.id).clusterOffsetCells * 2,
        markerAt: quadToAddress(x, axisY), cardAt: quadToAddress(cardX, cardY), cardSpan: { w: card.width, h: card.height },
      });
      maxX = Math.max(maxX, cardX + card.width * 2 + 8);
      maxY = Math.max(maxY, cardY + card.height * 2 + 8);
    });
  }

  if (timeline.layout === 'phase-band') {
    for (const phase of timeline.phases) {
      const members = placed.filter((entry) => timeline.events.find((event) => event.id === entry.eventId)?.phase === phase.id);
      if (!members.length) continue;
      const rects = members.map((entry) => {
        const point = pinPoint(parseAddress(entry.cardAt));
        return { x: point.x, y: point.y, w: entry.cardSpan.w * 2, h: entry.cardSpan.h * 2 };
      });
      // Reserve a heading lane above the member cards, but keep primary-axis
      // padding below the normal event gutter so adjacent phases cannot share
      // claimed border ink. The heading is separate overlay text: a group box
      // centres its own label, which would cross the axis for one-event phases.
      const x = Math.max(0, Math.min(...rects.map((rect) => rect.x)) - 2);
      const y = Math.max(0, Math.min(...rects.map((rect) => rect.y)) - 6);
      const right = Math.max(...rects.map((rect) => rect.x + rect.w)) + 2;
      const bottom = Math.max(...rects.map((rect) => rect.y + rect.h)) + 1;
      const width = Math.ceil((right - x) / 2);
      const height = Math.ceil((bottom - y) / 2);
      const phaseId = `${timeline.id}__phase__${phase.id}`;
      const phaseLabelId = `${phaseId}__label`;
      operations.push({ op: 'place_box', page, id: phaseId, at: quadToAddress(x, y), span: { w: width, h: height }, label: '', shape: 'group', role: 'timeline-phase', fontSize: 10 });
      operations.push(annotation(phaseId, {
        generatedBy: 'timeline', timelineId: timeline.id, timelineRole: 'phase-band', phase: phase.id,
        startDate: phase.startDate, endDate: phase.endDate, displayDate: phase.displayDate, status: phase.status,
      }, { description: phase.description ?? `Phase ${phase.title}`, tags: ['timeline-phase'] }));
      operations.push({ op: 'reorder', id: phaseId, action: 'send_to_back' });
      operations.push(textOperation(phaseLabelId, guidePage, phase.title, x + 2, y + 1, Math.min(cardWidth, width - 2), 2, 10, 700));
      operations.push(annotation(phaseLabelId, {
        generatedBy: 'timeline', timelineId: timeline.id, timelineRole: 'phase-label', phase: phase.id,
      }, { description: `Label for phase ${phase.title}`, tags: ['timeline-phase', 'timeline-phase-label'] }));
      elementIds.push(phaseId, phaseLabelId);
      maxX = Math.max(maxX, x + width * 2);
      maxY = Math.max(maxY, y + height * 2);
    }
  }

  const relationships = [];
  for (const event of (timeline.showRelationships ? events : [])) {
    for (const [index, relation] of (event.relationships ?? []).entries()) {
      if (!events.some(e => e.id === relation.to) || relation.to === event.id) continue;
      const source = placed.find(p => p.eventId === event.id), target = placed.find(p => p.eventId === relation.to);
      const id = `${timeline.id}__${event.id}__relation_${index + 1}`;
      const forward = source.axisQuad <= target.axisQuad;
      const ports = timeline.orientation === 'vertical' ? (forward ? ['S', 'N'] : ['N', 'S']) : (forward ? ['E', 'W'] : ['W', 'E']);
      operations.push({ op: 'connect', id, page, from: `${timeline.id}__${event.id}__card.${ports[0]}`, to: `${timeline.id}__${relation.to}__card.${ports[1]}`,
        routing: 'orthogonal', width: 1, color: '#475569', description: relation.label ?? `${event.title}: ${relation.type}`, relationshipLabel: relation.label ?? relation.type });
      operations.push({ op: 'move', id, toPage: linkPage });
      operations.push(annotation(id, { generatedBy: 'timeline', timelineId: timeline.id, timelineRole: 'event-relationship', fromEvent: event.id, toEvent: relation.to, relationshipType: relation.type }, { tags: ['timeline-relationship'] }));
      elementIds.push(id); relationships.push({ id, from: event.id, to: relation.to, type: relation.type });
    }
  }

  let currentDateMarker = null;
  if (timeline.currentDate) {
    const inDomain = primary.scale && timeline.currentDateValue >= primary.scale.domain[0] && timeline.currentDateValue <= primary.scale.domain[1];
    const mode = inDomain ? 'temporal-axis' : primary.scale ? 'outside-domain' : 'context-only';
    let markerAxis = null;
    if (inDomain) {
      const first = placed.find(entry => entry.expectedAxisQuad != null);
      const date = events.find(event => event.id === first.eventId).dateValue;
      const delta = (timeline.currentDateValue - date) / (primary.scale.domain[1] - primary.scale.domain[0]) * primary.scale.quads;
      markerAxis = first.expectedAxisQuad + Math.round(delta);
      const seenTracks = new Set();
      for (const entry of placed) {
        if (seenTracks.has(entry.track)) continue;
        seenTracks.add(entry.track);
        const p = pinPoint(parseAddress(entry.markerAt));
        const markerId = `${timeline.id}__current__${entry.track}`;
        const vertical = timeline.orientation === 'vertical';
        operations.push({ op: 'pen', page: markerPage, id: markerId, role: 'artwork', color: '#b91c1c', width: 3,
          program: vertical ? lineProgram(p.x - 3, markerAxis, p.x + 3, markerAxis) : lineProgram(markerAxis, p.y - 3, markerAxis, p.y + 3) });
        operations.push(annotation(markerId, { generatedBy: 'timeline', timelineId: timeline.id, timelineRole: 'current-date-marker', currentDate: timeline.currentDate, placementMode: mode }, { tags: ['timeline-current-date'] }));
        elementIds.push(markerId);
      }
    }
    const label = `Current date: ${timeline.currentDate}${mode === 'outside-domain' ? ' (outside axis range)' : mode === 'context-only' ? ' (ordinal axis; context only)' : ''}`;
    const width = requiredCellsFor(label, { fontSize: 10 }).cellsWide;
    const labelId = `${timeline.id}__current_date`;
    const x = inDomain && timeline.orientation === 'vertical' ? maxX + 4 : origin.x;
    const y = inDomain && timeline.orientation === 'vertical' ? Math.max(origin.y, markerAxis - 1) : maxY + 4;
    operations.push(textOperation(labelId, guidePage, label, x, y, width, 3, 10, 700));
    operations.push(annotation(labelId, { generatedBy: 'timeline', timelineId: timeline.id, timelineRole: 'current-date-label', currentDate: timeline.currentDate, placementMode: mode }, { tags: ['timeline-current-date'] }));
    elementIds.push(labelId);
    maxX = Math.max(maxX, x + width * 2); maxY = Math.max(maxY, y + 6);
    currentDateMarker = { date: timeline.currentDate, mode, axisQuad: markerAxis, labelId };
  }

  if (primary.scale) {
    operations.push({ op: 'scale', action: 'define', id: scaleId, domain: primary.scale.domain, quads: primary.scale.quads, kind: 'position' });
  }
  operations.push({ op: 'group', action: 'create', id: groupId, label: timeline.title, members: elementIds });
  if (timeline.fitCanvas) {
    const cols = Math.max(doc.canvas.cols, Math.ceil(maxX / 2) + 4);
    const rows = Math.max(doc.canvas.rows, Math.ceil(maxY / 2) + 4);
    if (cols !== doc.canvas.cols || rows !== doc.canvas.rows) operations.unshift({ op: 'set_canvas', cols, rows });
  }

  return {
    operations,
    receipt: {
      elementIds,
      pageIds,
      groupId,
      scaleId: primary.scale ? scaleId : null,
      spacingRequested: timeline.spacing,
      spacingResolved: primary.spacingResolved,
      spanCells: primary.spanCells,
      minimumSpanCells: primary.minimumSpanCells,
      orientation: timeline.orientation,
      layout: timeline.layout,
      events: placed,
      ...(relationships.length ? { relationships } : {}),
      ...(currentDateMarker ? { currentDateMarker } : {}),
      ...(primary.note ? { note: primary.note } : {}),
    },
  };
}

function fieldsOf(element, fields) {
  return Object.fromEntries(fields.filter((key) => Object.hasOwn(element, key)).map((key) => [key, structuredClone(element[key])]));
}

function geometryOf(page, element) {
  return element.kind === 'path'
    ? { page, pieces: element.pieces, end: element.end ?? null }
    : { page, rect: element.rect };
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function findElementRaw(doc, id) {
  for (const [page, elements] of Object.entries(doc.elements ?? {})) {
    const element = elements.find((entry) => entry.id === id);
    if (element) return { page, element };
  }
  return null;
}

export function timelineBaselines(doc, elementIds) {
  return Object.fromEntries([...elementIds].sort().flatMap((id) => {
    const found = findElementRaw(doc, id);
    if (!found) return [];
    return [[id, {
      kind: found.element.kind,
      geometryHash: hash(geometryOf(found.page, found.element)),
      presentation: fieldsOf(found.element, BASELINE_PRESENTATION_FIELDS),
      content: fieldsOf(found.element, BASELINE_CONTENT_FIELDS),
    }]];
  }));
}

/** Find manual changes made after the previous compile. */
export function captureTimelineOverrides(doc, timeline, { preserveContent = false } = {}) {
  const baselines = timeline.generated?.baselines ?? {};
  const overrides = [];
  const invalidated = [];
  for (const [id, baseline] of Object.entries(baselines)) {
    const found = findElementRaw(doc, id);
    if (!found) {
      invalidated.push({ id, kind: 'missing', reason: 'generated primitive was removed before reflow' });
      continue;
    }
    const currentGeometry = hash(geometryOf(found.page, found.element));
    if (currentGeometry !== baseline.geometryHash) {
      invalidated.push({ id, kind: 'geometry', reason: 'manual geometry cannot survive deterministic reflow; the new layout replaces it' });
    }
    const presentation = fieldsOf(found.element, BASELINE_PRESENTATION_FIELDS);
    const content = fieldsOf(found.element, BASELINE_CONTENT_FIELDS);
    const presentationChanged = JSON.stringify(presentation) !== JSON.stringify(baseline.presentation ?? {});
    const contentChanged = JSON.stringify(content) !== JSON.stringify(baseline.content ?? {});
    if (presentationChanged || (contentChanged && preserveContent)) {
      overrides.push({ id, kind: found.element.kind, ...(presentationChanged ? { presentation } : {}), ...(contentChanged && preserveContent ? { content } : {}) });
    }
    if (contentChanged && !preserveContent) {
      invalidated.push({ id, kind: 'content', reason: 'the semantic update changed source content, so the manually edited generated copy was not carried over' });
    }
  }
  return { overrides, invalidated };
}

export function applyTimelineOverrides(doc, overrides) {
  const preserved = [];
  const invalidated = [];
  for (const override of overrides) {
    const found = findElementRaw(doc, override.id);
    if (!found) {
      invalidated.push({ id: override.id, kind: 'removed', reason: 'the updated timeline no longer generates this primitive' });
      continue;
    }
    if (found.element.kind !== override.kind) {
      invalidated.push({ id: override.id, kind: 'type', reason: `primitive changed from ${override.kind} to ${found.element.kind}` });
      continue;
    }
    const fields = [];
    if (override.presentation) {
      for (const key of BASELINE_PRESENTATION_FIELDS) delete found.element[key];
      Object.assign(found.element, structuredClone(override.presentation));
      fields.push('presentation');
    }
    if (override.content) {
      for (const key of BASELINE_CONTENT_FIELDS) delete found.element[key];
      Object.assign(found.element, structuredClone(override.content));
      fields.push('content');
    }
    if (fields.length) preserved.push({ id: override.id, fields });
  }
  return { preserved, invalidated };
}

function markerCentre(element) {
  if (!element?.pieces?.length) return null;
  const xs = element.pieces.map((piece) => piece.x);
  const ys = element.pieces.map((piece) => piece.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** Timeline-specific semantic and layout contradictions, using normal findings. */
export function timelineFindings(doc, pages, makeFinding) {
  if (typeof makeFinding !== 'function') throw new TypeError('timelineFindings needs the shared finding factory');
  const allowedPages = new Set(pages.map((page) => page.id));
  const out = [];
  const byId = new Map(Object.values(doc.elements ?? {}).flat().map((element) => [element.id, element]));
  for (const timeline of timelinesOf(doc)) {
    if (!allowedPages.has(timeline.page) && !(timeline.generated?.pageIds ?? []).some((page) => allowedPages.has(page))) continue;
    const generated = timeline.generated ?? {};
    for (const id of generated.elementIds ?? []) {
      if (byId.has(id)) continue;
      out.push(makeFinding('T001', timeline.page, {
        message: `timeline "${timeline.id}" expects generated primitive "${id}", but it is missing — reflow the timeline or restore the element`,
        actors: [id], extra: `${timeline.id}|${id}`,
        fixes: [{ kind: 'reflow', description: `reflow timeline "${timeline.id}" to rebuild its stable primitive ids`, params: { id: timeline.id } }],
      }));
    }

    const eventById = new Map(timeline.events.map((event) => [event.id, event]));
    const phases = new Set(timeline.phases.map((phase) => phase.id));
    const tracks = new Set(timeline.tracks.map((track) => track.id));
    const current = timeline.events.filter((event) => event.current || event.status === 'current');
    if (current.length > 1) {
      out.push(makeFinding('T005', timeline.page, {
        message: `timeline "${timeline.id}" has ${current.length} current events (${current.map((event) => event.id).join(', ')}) — a single current point is needed for an unambiguous "now"`,
        actors: current.map((event) => `${timeline.id}__${event.id}__card`), extra: current.map((event) => event.id).join('|'),
      }));
    }

    for (const event of timeline.events) {
      const cardId = `${timeline.id}__${event.id}__card`;
      const markerId = `${timeline.id}__${event.id}__marker`;
      for (const [id, role] of [[cardId, 'event-card'], [markerId, 'event-marker']]) {
        const primitive = byId.get(id);
        if (!primitive) continue;
        if (primitive.properties?.timelineId !== timeline.id || primitive.properties?.eventId !== event.id || primitive.properties?.timelineRole !== role) {
          out.push(makeFinding('T002', timeline.page, {
            message: `"${id}" no longer identifies itself as ${role} for timeline "${timeline.id}" event "${event.id}"`,
            actors: [id], extra: `${timeline.id}|${event.id}|${role}|${JSON.stringify(primitive.properties ?? {})}`,
          }));
        }
      }
      for (const [kind, reference, known] of [
        ['phase', event.phase, phases], ['track', event.track, tracks], ['parent', event.parent, new Set(eventById.keys())],
      ]) {
        if (reference && !known.has(reference)) {
          out.push(makeFinding('T004', timeline.page, {
            message: `timeline "${timeline.id}" event "${event.id}" names missing ${kind} "${reference}"`,
            actors: [cardId], extra: `${timeline.id}|${event.id}|${kind}|${reference}`,
          }));
        }
      }
      for (const relationship of event.relationships ?? []) {
        if (eventById.has(relationship.to)) continue;
        out.push(makeFinding('T004', timeline.page, {
          message: `timeline "${timeline.id}" event "${event.id}" relates to missing event "${relationship.to}"`,
          actors: [cardId], extra: `${timeline.id}|${event.id}|relationship|${relationship.to}`,
        }));
      }
      const marker = byId.get(markerId);
      if (event.approximate && marker && marker.stroke?.pattern == null) {
        out.push(makeFinding('T006', timeline.page, {
          message: `timeline "${timeline.id}" event "${event.id}" is approximate, but marker "${markerId}" has no dashed or dotted treatment`,
          actors: [markerId], extra: `${timeline.id}|${event.id}|approximate`,
        }));
      }
    }

    for (const phase of timeline.phases) {
      if (timeline.events.some((event) => event.phase === phase.id)) continue;
      out.push(makeFinding('T008', timeline.page, {
        message: `timeline "${timeline.id}" phase "${phase.id}" contains no events${phase.startDate ? ` despite declaring ${phase.startDate}..${phase.endDate}` : ''}`,
        actors: [`${timeline.id}__phase__${phase.id}`], extra: `${timeline.id}|${phase.id}`,
      }));
    }

    const placed = new Map((generated.events ?? []).map((entry) => [entry.eventId, entry]));
    const chronological = timeline.order === 'chronological' ? [...timeline.events]
      .filter((event) => Number.isFinite(event.dateValue))
      .sort((a, b) => a.dateValue - b.dateValue || a.inputIndex - b.inputIndex) : [];
    let previous = null;
    for (const event of chronological) {
      const entry = placed.get(event.id);
      const marker = byId.get(`${timeline.id}__${event.id}__marker`);
      const centre = markerCentre(marker);
      if (!entry || !centre) continue;
      const actual = timeline.orientation === 'vertical' ? centre.y : centre.x;
      if (previous && actual <= previous.actual) {
        out.push(makeFinding('T003', timeline.page, {
          message: `timeline "${timeline.id}" places dated event "${event.id}" at or before "${previous.event.id}" even though chronological and same-date input order require it after`,
          actors: [`${timeline.id}__${previous.event.id}__marker`, `${timeline.id}__${event.id}__marker`],
          extra: `${timeline.id}|${previous.event.id}:${previous.actual}|${event.id}:${actual}`,
        }));
      }
      if (timeline.spacing === 'temporal' && entry.expectedAxisQuad != null) {
        const expected = entry.expectedAxisQuad + (entry.clusterOffsetQuads ?? 0);
        if (actual !== expected) {
          out.push(makeFinding('T007', timeline.page, {
            message: `timeline "${timeline.id}" marker "${event.id}" is at axis quadrant ${actual}, but its declared date projects to ${expected}`,
            actors: [`${timeline.id}__${event.id}__marker`], metrics: { actual, expected, deltaQuads: actual - expected },
            extra: `${timeline.id}|${event.id}|${actual}|${expected}`,
          }));
        }
      }
      previous = { event, actual };
    }
  }
  return out;
}

export function timelineSummary(timeline) {
  return {
    id: timeline.id,
    title: timeline.title,
    page: timeline.page,
    orientation: timeline.orientation,
    layout: timeline.layout,
    spacing: timeline.spacing,
    order: timeline.order,
    events: timeline.events.map((event) => ({
      id: event.id, type: event.type, title: event.title,
      date: event.date ?? null, endDate: event.endDate ?? null, displayDate: eventDateLabel(event) || null,
      approximate: Boolean(event.approximate), current: Boolean(event.current || event.status === 'current'),
      status: event.status ?? null, phase: event.phase ?? null, track: event.track ?? null,
      parent: event.parent ?? null, resources: event.resources ?? [], relationships: event.relationships ?? [],
    })),
    phases: timeline.phases,
    tracks: timeline.tracks,
    generated: timeline.generated ? {
      elementIds: timeline.generated.elementIds ?? [],
      pageIds: timeline.generated.pageIds ?? [],
      groupId: timeline.generated.groupId ?? null,
      scaleId: timeline.generated.scaleId ?? null,
      spanCells: timeline.generated.spanCells ?? null,
      minimumSpanCells: timeline.generated.minimumSpanCells ?? null,
      spacingResolved: timeline.generated.spacingResolved ?? timeline.spacing,
      note: timeline.generated.note ?? null,
    } : null,
  };
}
