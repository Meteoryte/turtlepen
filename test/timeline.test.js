import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../src/core/index.js';

const EVENTS = [
  { id: 'stdio', title: 'Local stdio server', date: '2025-08', type: 'milestone', description: 'Canonical local transport.' },
  { id: 'hosted', title: 'Hosted MCP endpoint', date: '2026-08-28', type: 'release', status: 'complete' },
  { id: 'schemas', title: 'Structured output schemas', date: '2026-09-03', current: true },
  { id: 'next', title: 'Next capability', displayDate: 'Planned', status: 'planned', sequence: 1 },
];

test('timeline dates preserve precision and reject impossible or non-ISO values', () => {
  assert.deepEqual(core.parseTimelineDate('2026'), { iso: '2026', precision: 'year', value: Date.UTC(2026, 0, 1) });
  assert.equal(core.parseTimelineDate('2026-09').precision, 'month');
  assert.equal(core.parseTimelineDate('2026-09-03').precision, 'day');
  assert.throws(() => core.parseTimelineDate('September 2026'), /canonical ISO/);
  assert.throws(() => core.parseTimelineDate('2026-02-30'), /real calendar date/);
});

test('a semantic timeline compiles to ordinary stable primitives and a flat group', () => {
  const doc = core.createDocument({ name: 'history' });
  const result = core.applyTimeline(doc, { id: 'history', title: 'Connection history', events: EVENTS });
  assert.equal(result.timeline.id, 'history');
  assert.equal(doc.timelines.length, 1);
  assert.equal(core.findElement(doc, 'history__stdio__card').element.kind, 'box');
  assert.equal(core.findElement(doc, 'history__stdio__marker').element.kind, 'path');
  assert.equal(core.findElement(doc, 'history__title').element.kind, 'text');
  assert.deepEqual(doc.pages.filter((page) => page.id.startsWith('history__')).map((page) => page.intent), ['overlay', 'overlay', 'overlay']);
  assert.ok(core.findGroup(doc, 'history__group').members.includes('history__schemas__marker'));
  assert.equal(core.findElement(doc, 'history__stdio__card').element.properties.timelineId, 'history');
  assert.equal(core.validate(doc).summary.verdict, 'PASS');
});

test('chronological order is default, same dates keep input order, and undated events stay undated', () => {
  const doc = core.createDocument({ name: 'order' });
  core.applyTimeline(doc, {
    id: 'order',
    events: [
      { id: 'later', title: 'Later', date: '2026-02' },
      { id: 'same-a', title: 'Same A', date: '2026-01' },
      { id: 'same-b', title: 'Same B', date: '2026-01' },
      { id: 'unknown', title: 'Unknown date', displayDate: 'Someday', sequence: 1 },
    ],
  });
  const layout = core.findTimeline(doc, 'order').generated.events;
  assert.deepEqual(layout.map((event) => event.eventId), ['same-a', 'same-b', 'later', 'unknown']);
  assert.ok(layout.every((event, index) => index === 0 || event.axisQuad > layout[index - 1].axisQuad));
  const unknown = core.findElement(doc, 'order__unknown__card').element;
  assert.equal(unknown.properties.date, undefined);
  assert.match(unknown.label, /Someday/);
});

test('temporal spacing declares a quantitative position scale and refuses a too-small explicit span', () => {
  const doc = core.createDocument({ name: 'temporal', canvas: { cols: 120, rows: 120 } });
  assert.throws(() => core.applyTimeline(doc, {
    id: 'short', spacing: 'temporal', spanCells: 20,
    events: [
      { id: 'a', title: 'A', date: '2026-01-01' },
      { id: 'b', title: 'B', date: '2026-01-02' },
      { id: 'c', title: 'C', date: '2026-12-31' },
    ],
  }), /temporal spacing needs at least \d+ cells/);
  assert.equal(doc.timelines.length, 0, 'a refused timeline is atomic');

  const result = core.applyTimeline(doc, {
    id: 'time', spacing: 'temporal', spanCells: 40,
    events: [
      { id: 'a', title: 'A', date: '2026-01-01' },
      { id: 'b', title: 'B', date: '2026-07-02' },
      { id: 'c', title: 'C', date: '2026-12-31' },
    ],
  });
  assert.equal(result.timeline.generated.scaleId, 'time__time');
  assert.equal(doc.scales.time__time.kind, 'position');
  assert.equal(core.validate(doc).open.filter((finding) => finding.rule === 'T007').length, 0);
});

test('timeline event actions keep stable ids and reflow both orientations', () => {
  const doc = core.createDocument({ name: 'actions' });
  core.applyTimeline(doc, { id: 'roadmap', events: EVENTS.slice(0, 2) });
  core.applyTimeline(doc, { action: 'add_event', id: 'roadmap', event: EVENTS[2] });
  assert.ok(core.findElement(doc, 'roadmap__schemas__card'));
  core.applyTimeline(doc, { action: 'update_event', id: 'roadmap', eventId: 'schemas', event: { title: 'Schema contract', status: 'current' } });
  assert.equal(core.findElement(doc, 'roadmap__schemas__card').element.properties.status, 'current');
  core.applyTimeline(doc, { action: 'update_event', id: 'roadmap', eventId: 'hosted', event: { endDate: '2026-09-03' } });
  assert.equal(core.findTimeline(doc, 'roadmap').events.find((event) => event.id === 'hosted').date, '2026-08-28');
  core.applyTimeline(doc, { action: 'reflow', id: 'roadmap', orientation: 'horizontal', layout: 'single-sided', side: 'end' });
  assert.equal(core.findTimeline(doc, 'roadmap').orientation, 'horizontal');
  assert.ok(core.findElement(doc, 'roadmap__schemas__card'), 'stable id survives reflow');
  const inspection = core.applyTimeline(doc, { action: 'inspect', id: 'roadmap' });
  assert.equal(inspection.events.length, 3);
  core.applyTimeline(doc, { action: 'remove_event', id: 'roadmap', eventId: 'stdio' });
  assert.equal(core.findElement(doc, 'roadmap__stdio__card'), null);
  assert.equal(core.validate(doc).summary.verdict, 'PASS');
});

test('reflow preserves safe presentation overrides and reports replaced manual geometry', () => {
  const doc = core.createDocument({ name: 'overrides' });
  core.applyTimeline(doc, { id: 'story', events: EVENTS.slice(0, 2) });
  core.restyleBox(doc, 'story__stdio__card', { fill: '#ffeeaa' });
  core.moveElement(doc, 'story__hosted__card', 2, 0);
  const result = core.applyTimeline(doc, { action: 'reflow', id: 'story', orientation: 'horizontal' });
  assert.equal(core.findElement(doc, 'story__stdio__card').element.fill, '#ffeeaa');
  assert.ok(result.preservedOverrides.some((entry) => entry.id === 'story__stdio__card'));
  assert.ok(result.invalidatedOverrides.some((entry) => entry.id === 'story__hosted__card' && entry.kind === 'geometry'));
});

test('timeline source and baseline survive deterministic serialization', () => {
  const doc = core.createDocument({ name: 'saved' });
  core.applyTimeline(doc, { id: 'history', layout: 'detailed', events: EVENTS });
  const json = core.serialize(doc);
  const reopened = core.deserialize(json);
  assert.equal(reopened.schema, 4);
  assert.equal(core.findTimeline(reopened, 'history').events.length, 4);
  assert.ok(core.findTimeline(reopened, 'history').generated.baselines['history__stdio__card']);
  assert.equal(core.serialize(reopened), json);
});

test('semantic validation detects broken associations, references, chronology, and current conflicts', () => {
  const doc = core.createDocument({ name: 'semantic' });
  core.applyTimeline(doc, {
    id: 'semantic',
    events: [
      { id: 'a', title: 'A', date: '2026-01', current: true, phase: 'missing' },
      { id: 'b', title: 'B', date: '2026-02', current: true, parent: 'ghost' },
    ],
  });
  core.findElement(doc, 'semantic__a__card').element.properties.eventId = 'wrong';
  core.moveElement(doc, 'semantic__b__marker', 0, -100);
  core.removeElement(doc, 'semantic__a__link');
  const rules = new Set(core.validate(doc).open.map((finding) => finding.rule));
  for (const rule of ['T001', 'T002', 'T003', 'T004', 'T005']) assert.ok(rules.has(rule), `${rule} should be reported`);
});

test('multi-track requires explicit choices and phase-band emits ordinary container boxes', () => {
  const doc = core.createDocument({ name: 'tracks' });
  assert.throws(() => core.applyTimeline(doc, {
    id: 'tracks', layout: 'multi-track', tracks: [{ id: 'local', title: 'Local' }, { id: 'hosted', title: 'Hosted' }],
    events: [{ id: 'a', title: 'Unassigned', date: '2026' }],
  }), /must choose a track/);
  core.applyTimeline(doc, {
    id: 'phases', layout: 'phase-band', phases: [{ id: 'build', title: 'Build' }],
    events: [{ id: 'a', title: 'A', date: '2026-01', phase: 'build' }, { id: 'b', title: 'B', date: '2026-02', phase: 'build' }],
  });
  const band = core.findElement(doc, 'phases__phase__build').element;
  assert.equal(band.kind, 'box');
  assert.equal(band.shape, 'group');
  assert.equal(band.role, 'timeline-phase');
  assert.ok(core.findElement(doc, 'phases__phase__build__label'));
  assert.ok(doc.elements.base.indexOf(band) < doc.elements.base.indexOf(core.findElement(doc, 'phases__a__card').element));
  assert.equal(core.validate(doc).summary.verdict, 'PASS');
});

test('timeline output expands the canvas deterministically and keeps monochrome state cues', () => {
  const doc = core.createDocument({ name: 'rendered', canvas: { cols: 20, rows: 20 } });
  core.applyTimeline(doc, {
    id: 'rendered', layout: 'detailed', cardWidthCells: 26,
    events: [
      { id: 'approx', title: 'Approximate milestone', date: '2026-01', approximate: true, type: 'milestone' },
      { id: 'planned', title: 'Planned deadline', displayDate: 'Planned', status: 'planned', type: 'deadline', sequence: 1 },
    ],
  });
  assert.ok(doc.canvas.cols > 20 || doc.canvas.rows > 20);
  assert.equal(core.findElement(doc, 'rendered__approx__card').element.role, 'timeline-milestone');
  assert.equal(core.findElement(doc, 'rendered__planned__card').element.role, 'timeline-planned');
  assert.equal(core.findElement(doc, 'rendered__approx__marker').element.stroke.pattern, 'dotted');
  assert.equal(core.findElement(doc, 'rendered__planned__marker').element.stroke.pattern, 'dashed');
  const first = core.renderSvg(doc, { showGrid: false });
  assert.equal(core.renderSvg(doc, { showGrid: false }), first);
  assert.match(first, /stroke-dasharray/);
});
