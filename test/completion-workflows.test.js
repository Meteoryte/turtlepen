import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as core from '../src/core/index.js';
import { createSession, createTools } from '../src/mcp/tools.js';

const path = (doc, id = 'line', program = 'pen K10.q1\nright 4 line') => core.applyPen(doc, 'base', program, { id, role: 'artwork' }).path;
const piece = (doc, id) => core.findElement(doc, id).element.pieces;

test('selected constrained artwork rotates once and followers remain attached after reload', () => {
  const doc = core.createDocument(); path(doc, 'a'); path(doc, 'b', 'pen P15.q1\nright 2 line'); path(doc, 'c', 'pen Z25.q1\nright 2 line');
  core.createConstraint(doc, { id: 'ab', target: 'a', dependent: 'b' });
  core.createConstraint(doc, { id: 'bc', target: 'b', dependent: 'c' });
  core.applyOperation(doc, { op: 'transform', ids: ['a', 'b'], rotate: 90, pivot: 'P15.q1' });
  const reopened = core.deserialize(core.serialize(doc)), before = core.serialize(reopened);
  core.syncConstraints(reopened); assert.equal(core.serialize(reopened), before);
});

test('transform rejects masked geometry atomically and radial copies preserve the original', () => {
  const doc = core.createDocument(); path(doc);
  const before = structuredClone(piece(doc, 'line'));
  const result = core.applyOperation(doc, { op: 'array', mode: 'radial', id: 'line', pivot: 'P15.q1', count: 4, rotate: 90 });
  assert.equal(result.created.length, 3); assert.deepEqual(piece(doc, 'line'), before);
  core.placeBox(doc, 'base', { id: 'node', at: 'C3', span: '4x3' });
  core.applyPen(doc, 'base', 'pen from node.E\nright 3 line', { id: 'bound', role: 'artwork' });
  const withReference = core.serialize(doc);
  assert.throws(() => core.transformElements(doc, { ids: ['bound'], dx: 3 }), /semantic connector/);
  assert.equal(core.serialize(doc), withReference);
  core.addMicroMask(doc, { id: 'mask', target: 'line', points: [{ x: 100, y: 90 }], reason: 'editing test' });
  const serialized = core.serialize(doc);
  assert.throws(() => core.transformElements(doc, { ids: ['line'], flip: 'horizontal' }), /micro-masks/);
  assert.equal(core.serialize(doc), serialized);
});

test('group styling rolls back a mixed selection and accepts measured box presentation', () => {
  const doc = core.createDocument(); path(doc);
  core.placeBox(doc, 'base', { id: 'box', at: 'C3', span: '8x3', label: 'Box' });
  core.createGroup(doc, { id: 'mixed', members: ['box', 'line'] });
  const before = core.serialize(doc);
  assert.throws(() => core.applyOperation(doc, { op: 'group', action: 'restyle', id: 'mixed', style: { fill: '#abc' } }), /path/);
  assert.equal(core.serialize(doc), before);
  core.removeGroupMembers(doc, 'mixed', ['line']);
  core.applyOperation(doc, { op: 'group', action: 'restyle', id: 'mixed', style: { fill: '#abc' } });
  assert.equal(core.findElement(doc, 'box').element.fill, '#abc');
});

test('explicit canvas alignment and fixed edge gaps preserve the chosen reference', () => {
  const doc = core.createDocument();
  core.placeBox(doc, 'base', { id: 'a', at: 'C3', span: '8x3' });
  core.placeBox(doc, 'base', { id: 'b', at: 'U5', span: '4x3' });
  const ref = structuredClone(core.findElement(doc, 'a').element.rect);
  core.applyOperation(doc, { op: 'align', ids: ['b'], edge: 'top', reference: 'a' });
  assert.deepEqual(core.findElement(doc, 'a').element.rect, ref);
  core.applyOperation(doc, { op: 'distribute', ids: ['a', 'b'], axis: 'horizontal', gap: 3 });
  assert.equal(core.findElement(doc, 'b').element.rect.x - ref.x - ref.w, 3);
  core.applyOperation(doc, { op: 'align', ids: ['b'], edge: 'right', reference: 'canvas' });
  const b = core.findElement(doc, 'b').element.rect;
  assert.equal(b.x + b.w, doc.canvas.cols * 2);
});

test('page duplicate and merge preserve ids and refuse overwriting destinations', () => {
  const doc = core.createDocument(); path(doc);
  const duplicated = core.editPages(doc, { action: 'duplicate', id: 'base', to: 'copy' });
  assert.deepEqual(duplicated.created, ['copy-line']);
  const before = core.serialize(doc);
  assert.throws(() => core.editPages(doc, { action: 'duplicate', id: 'base', to: 'copy' }));
  assert.equal(core.serialize(doc), before);
  core.editPages(doc, { action: 'merge', id: 'copy', to: 'base' });
  assert.equal(core.findElement(doc, 'copy-line').page, 'base');
  assert.ok(core.deserialize(core.serialize(doc)));
});

test('cleanup preserves compositing and semantic references', () => {
  const doc = core.createDocument(); path(doc, 'first');
  path(doc, 'cover'); core.findElement(doc, 'cover').element.stroke = { color: '#ff0000', width: 5, cap: 'butt' };
  core.duplicateElement(doc, { id: 'first', to: 'last' });
  core.reorderElement(doc, { id: 'last', action: 'bring_to_front' });
  const result = core.cleanupElements(doc, { ids: ['first', 'last'], removeDuplicates: true });
  assert.deepEqual(result.removed, []); assert.match(result.skipped[0].reason, /compositing/);
});

test('bulk path nodes, interpolation, trim and forward intersection remain exact', () => {
  const doc = core.createDocument(); path(doc);
  core.applyOperation(doc, { op: 'path_edit', id: 'line', action: 'move_many', indices: [1, 2], dy: 2 });
  core.applyOperation(doc, { op: 'path_edit', id: 'line', action: 'align_nodes', indices: [1, 2], axis: 'horizontal', at: 'K10.q1' });
  assert.ok(piece(doc, 'line').every(p => p.y === 18));
  core.applyOperation(doc, { op: 'path_edit', id: 'line', action: 'interpolate', index: 0, endIndex: piece(doc, 'line').length - 1 });
  core.applyOperation(doc, { op: 'path_edit', id: 'line', action: 'trim', index: 0, endIndex: 2 });
  core.placeBox(doc, 'base', { id: 'cut', at: 'U9', span: '2x4' });
  const result = core.applyOperation(doc, { op: 'path_edit', id: 'line', action: 'extend_to', cutter: 'cut' });
  assert.equal(core.address.pinPoint(core.address.parseAddress(result.at)).x, 40);
  const inspected = core.inspectGeometry(doc, { ids: ['line'], nearest: result.at, pieceLimit: 2 });
  assert.equal(inspected.elements[0].nearestPoint.distanceSquared, 0);
  assert.equal(inspected.elements[0].path.segments.length, 2);
  assert.equal(inspected.elements[0].path.nextOffset, 2);
});

test('pattern offset and region color mean the same thing in direct and planned pen calls', () => {
  const doc = core.createDocument();
  const op = { op: 'pen', id: 'dash', role: 'artwork', program: 'pen C3.q1\nright 10 line', pattern: 'dashed', patternOffset: 2 };
  const plan = core.planOperations(doc, [op]); assert.equal(plan.ok, true);
  core.applyOperation(doc, op);
  assert.deepEqual(piece(doc, 'dash'), piece(plan.preview, 'dash'));
  assert.equal(core.findElement(doc, 'dash').element.stroke.patternOffset, 2);
  const raw = core.createDocument(); path(raw, 'dash', op.program);
  assert.notDeepEqual(piece(doc, 'dash'), piece(raw, 'dash'));
});

test('current-date markers are projected only on a temporal domain and survive reflow', () => {
  const doc = core.createDocument();
  const events = [{ id: 'a', title: 'Start', date: '2026-01-01' }, { id: 'b', title: 'End', date: '2026-01-11' }];
  core.applyTimeline(doc, { id: 'time', spacing: 'temporal', currentDate: '2026-01-06', events });
  const timeline = core.findTimeline(doc, 'time');
  assert.equal(timeline.generated.currentDateMarker.mode, 'temporal-axis');
  assert.ok(core.findElement(doc, 'time__current__main'));
  assert.match(core.renderSvg(doc), /Current date: 2026-01-06/);
  core.applyTimeline(doc, { action: 'update', id: 'time', spacing: 'ordinal' });
  assert.equal(core.findTimeline(doc, 'time').generated.currentDateMarker.mode, 'context-only');
  assert.equal(core.findElement(doc, 'time__current__main'), null);
  assert.match(core.renderSvg(core.deserialize(core.serialize(doc))), /ordinal axis; context only/);
});

test('timeline relationships become stable native semantic connectors', () => {
  const doc = core.createDocument();
  core.applyTimeline(doc, { id: 'relations', layout: 'single-sided', showRelationships: true, events: [
    { id: 'a', title: 'Design', date: '2026-01', relationships: [{ to: 'b', type: 'enables', label: 'Enables build' }] },
    { id: 'b', title: 'Build', date: '2026-02' },
  ] });
  const id = 'relations__a__relation_1';
  assert.equal(core.findElement(doc, id).element.relationship.to.id, 'relations__b__card');
  core.applyTimeline(doc, { action: 'reflow', id: 'relations', orientation: 'horizontal' });
  assert.equal(core.findElement(doc, id).element.relationship.to.id, 'relations__b__card');
  assert.match(core.renderSvg(doc), /Enables build/);
});

test('native timeline export preserves rich fields; Mermaid refuses unsupported meaning', () => {
  const doc = core.createDocument();
  core.applyTimeline(doc, { id: 'export', events: [{ id: 'start', title: 'Start', date: '2026', type: 'milestone', resources: ['brief'] }] });
  const native = core.exportTimeline(doc, { id: 'export' });
  assert.equal(JSON.parse(native.source).events[0].resources[0], 'brief');
  assert.equal(native.lossless, true);
  const refused = core.exportTimeline(doc, { id: 'export', format: 'mermaid' });
  assert.equal(refused.exported, false); assert.equal(refused.source, null);
  assert.ok(refused.unsupported.some(item => item.field === 'events.start.resources'));
});

test('Mermaid projection reports identity mapping and round-trips point and period content', () => {
  const doc = core.createDocument();
  core.applyTimeline(doc, { id: 'export', title: 'Roadmap', events: [
    { id: 'first', title: 'Start', date: '2026-01', description: 'Ready' },
    { id: 'period', title: 'Work', date: '2026-02', endDate: '2026-03' },
  ] });
  const exported = core.exportTimeline(doc, { id: 'export', format: 'mermaid' });
  assert.equal(exported.exported, true, JSON.stringify(exported.unsupported));
  assert.equal(exported.lossless, false); assert.equal(exported.identityMapping[0].sourceId, 'first');
  const imported = core.parseMermaidTimeline(exported.source);
  assert.equal(imported.events[0].description, 'Ready'); assert.equal(imported.events[1].endDate, '2026-03');
});

test('dates before year 100 retain their true Gregorian year', () => {
  assert.equal(new Date(core.parseTimelineDate('0004-02-29').value).getUTCFullYear(), 4);
  assert.throws(() => core.parseTimelineDate('0001-02-29'), /real calendar/);
});

test('radial color fields preserve geometry and replace cleanly with a solid color', () => {
  const doc = core.createDocument(); path(doc);
  const before = [...core.elementClaimed(core.findElement(doc, 'line').element)];
  core.applyOperation(doc, { op: 'paint_path', ids: ['line'], gradient: { type: 'radial', from: '#fff', to: '#000', center: 'K10.q1', radius: 4 } });
  assert.deepEqual([...core.elementClaimed(core.findElement(doc, 'line').element)], before);
  assert.equal(piece(doc, 'line')[0].color, '#ffffff'); assert.equal(piece(doc, 'line').at(-1).color, '#000000');
  const svg = core.renderSvg(doc);
  assert.match(svg, /stop-color="#ffffff"/); assert.match(svg, /stop-color="#000000"/);
  const image = core.rasterizeDocument(doc, { bounds: 'canvas', margin: 0, showGrid: false });
  const sample = p => image.pixels[((p.y * 5 + 2) * image.width + p.x * 5 + 2) * 4];
  assert.equal(sample(piece(doc, 'line')[0]), 255); assert.equal(sample(piece(doc, 'line').at(-1)), 0);
  piece(doc, 'line').push({ ...piece(doc, 'line')[0], color: '#ff0000' });
  const coloredCount = piece(doc, 'line').length;
  core.normalizePath(doc, { id: 'line' });
  assert.equal(piece(doc, 'line').length, coloredCount, 'normalization must retain distinct overpaint at the same quadrant');
  const reopened = core.deserialize(core.serialize(doc));
  assert.deepEqual(piece(reopened, 'line'), piece(doc, 'line'));
  core.applyOperation(doc, { op: 'paint_path', ids: ['line'], color: '#123' });
  assert.ok(piece(doc, 'line').every(p => !Object.hasOwn(p, 'color')));
});

test('new MCP operations persist with undo/redo across reopen and reject malformed plans', async () => {
  const root = await mkdtemp(join(tmpdir(), 'turtlepen-completion-'));
  try {
    const session = createSession({ cwd: root });
    let tools = new Map(createTools(session).map(tool => [tool.name, tool]));
    await tools.get('new_diagram').handler({ name: 'recovery', path: 'recovery.turtlepen.json' });
    await tools.get('pen').handler({ id: 'line', role: 'artwork', program: 'pen K10.q1\nright 4 line' });
    await tools.get('transform').handler({ ids: ['line'], dx: 4 });
    const moved = structuredClone(piece(session.doc, 'line'));
    await tools.get('open_diagram').handler({ path: 'recovery.turtlepen.json' });
    await tools.get('history').handler({ action: 'undo' });
    assert.notDeepEqual(piece(session.doc, 'line'), moved);
    await tools.get('history').handler({ action: 'redo' });
    assert.deepEqual(piece(session.doc, 'line'), moved);
    const before = core.serialize(session.doc);
    await assert.rejects(async () => tools.get('plan').handler({ operations: [{ op: 'transform', ids: ['line'], rotate: 45 }], commit: true }), /rotate/);
    assert.equal(core.serialize(session.doc), before);
    assert.equal(tools.get('query').annotations.readOnlyHint, true);
    assert.equal(tools.get('transform').annotations.readOnlyHint, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
