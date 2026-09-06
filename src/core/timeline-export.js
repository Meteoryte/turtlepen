import { findTimeline, orderedTimelineEvents } from './timeline.js';
import { parseMermaidTimeline } from './mermaid.js';

/** Native source is lossless. Mermaid is a labelled semantic projection with identity mapping. */
export function exportTimeline(doc, { id, format = 'json' } = {}) {
  const timeline = findTimeline(doc, id);
  if (!timeline) throw new Error(`no timeline "${id}"`);
  if (!['json', 'mermaid'].includes(format)) throw new Error('timeline export format must be json or mermaid');
  const native = structuredClone(timeline); delete native.generated;
  if (format === 'json') return { format, exported: true, lossless: true, mediaType: 'application/json', source: JSON.stringify(native, null, 2) };
  const unsupported = [];
  const fail = (field, reason) => unsupported.push({ field, reason });
  const content = (value, field) => {
    if (/[:\r\n"%<>]/.test(value ?? '')) fail(field, 'contains Mermaid separators, directives, quotes, or markup that cannot round-trip as plain text');
    return value;
  };
  if (timeline.currentDate) fail('currentDate', 'Mermaid timeline has no current-date marker');
  if (timeline.tracks.length) fail('tracks', 'Mermaid timeline has no parallel tracks');
  const lines = ['timeline', `  title ${content(timeline.title, 'title')}`];
  const events = orderedTimelineEvents(timeline);
  let phase = null;
  const seenPhases = new Set();
  for (const [index, event] of events.entries()) {
    const path = `events.${event.id}`;
    for (const key of ['status', 'category', 'parent', 'track']) if (event[key]) fail(`${path}.${key}`, 'field has no Mermaid timeline equivalent');
    for (const key of ['approximate', 'current']) if (event[key]) fail(`${path}.${key}`, 'marker semantics have no Mermaid timeline equivalent');
    for (const key of ['resources', 'relationships']) if (event[key]?.length) fail(`${path}.${key}`, 'field has no Mermaid timeline equivalent');
    if (!['point', 'period'].includes(event.type)) fail(`${path}.type`, `Mermaid has no ${event.type} event marker`);
    if (event.phase !== phase && event.phase != null) {
      if (seenPhases.has(event.phase)) fail(`${path}.phase`, 'noncontiguous phase would acquire a different identity on import');
      seenPhases.add(event.phase); phase = event.phase;
      const sourcePhase = timeline.phases.find(p => p.id === phase);
      if (!sourcePhase) fail(`${path}.phase`, 'phase does not exist');
      else lines.push(`  section ${content(sourcePhase.title, `phases.${phase}.title`)}`);
    } else if (phase != null && event.phase == null) fail(`${path}.phase`, 'Mermaid cannot return to an unsectioned event after a section');
    const date = event.endDate ? `${event.date} to ${event.endDate}` : event.date;
    const period = event.displayDate ?? date;
    if (!period) fail(`${path}.displayDate`, 'Mermaid requires a period label; no date or label will be invented');
    if (event.displayDate && date && event.displayDate !== date) {
      // A separate human label and machine date are different facts.
      fail(`${path}.displayDate`, 'a different display label would hide its machine date');
    }
    if (event.sequence != null && event.sequence !== index + 1) fail(`${path}.sequence`, 'nonsequential explicit order cannot round-trip');
    lines.push(`  ${content(period ?? '', `${path}.displayDate`)} : ${content(event.title, `${path}.title`)}${event.description ? ` : ${content(event.description, `${path}.description`)}` : ''}`);
  }
  for (const p of timeline.phases) {
    if (!seenPhases.has(p.id)) fail(`phases.${p.id}`, 'empty phases have no event representation');
    for (const key of ['description', 'startDate', 'endDate', 'displayDate', 'status']) if (p[key]) fail(`phases.${p.id}.${key}`, 'section headings cannot preserve phase metadata');
  }
  if (unsupported.length) return { format, exported: false, lossless: false, source: null, unsupported, alternative: 'Use format:"json" for the complete semantic source.' };
  const source = lines.join('\n') + '\n';
  const parsed = parseMermaidTimeline(source);
  return { format, exported: true, lossless: false, mediaType: 'text/vnd.mermaid', source, unsupported: [],
    identityMapping: events.map((event, index) => ({ sourceId: event.id, mermaidImportId: parsed.events[index].id })),
    omitted: ['TurtlePen document/page/group identity, canvas geometry, layout preferences, theme, and manual overrides are not Mermaid timeline syntax. Use native JSON/document for recovery.'],
  };
}
