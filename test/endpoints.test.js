/** End-to-end coverage for every MCP tool over the real stdio transport. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { createMcpClient } from '../examples/mcp-client.js';
import { createSession, createTools } from '../src/mcp/tools.js';
import { VERSION } from '../src/version.js';

test('every advertised MCP tool completes a representative use case over stdio', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-endpoints-'));
  const client = createMcpClient({ cwd: dir, createdAt: '2026-08-17T00:00:00.000Z' });
  const advertised = createTools(createSession()).map((tool) => tool.name).sort();
  const covered = new Set();

  const invoke = async (name, args = {}) => {
    const result = await client.call(name, args);
    assert.equal(result.isError, false, `${name} failed: ${result.error ?? result.text}`);
    assert.equal(typeof result.text, 'string', `${name} must return text content`);
    assert.ok(result.text.length > 0, `${name} returned empty content`);
    covered.add(name);
    return result.text;
  };

  try {
    const initialized = await client.init();
    assert.equal(initialized.result.serverInfo.name, 'turtlepen');
    assert.equal(initialized.result.serverInfo.version, VERSION);
    assert.equal(initialized.result.protocolVersion, '2025-06-18');

    await invoke('turtlepen_help');
    assert.match(await invoke('search_help', { query: 'views' }), /match\(es\)/);
    assert.match(await invoke('doctor'), /TurtlePen doctor: READY/);
    const runtime = JSON.parse(await invoke('runtime_info'));
    assert.equal(runtime.version, VERSION);
    assert.equal(runtime.toolCount, advertised.length);
    await invoke('measure', { text: 'Outdoor condensing unit', fontSize: 10, maxWidthCells: 12 });
    await invoke('new_diagram', { name: 'endpoint matrix', path: 'endpoint.turtlepen.json', cols: 80, rows: 50 });

    await invoke('add_page', { id: 'notes', z: 2, intent: 'overlay', title: 'Field notes' });
    await invoke('update_page', { id: 'notes', title: 'Verified field notes', visible: false });
    await invoke('place_box', { id: 'unit', at: 'C4.tl', span: { w: 6, h: 3 }, label: 'Condenser' });
    await invoke('place_box', { id: 'tag', at: 'M4.tl', span: { w: 4, h: 2 }, label: 'Disconnect' });
    await invoke('place_box', { id: 'overlap', at: 'F4.tl', span: { w: 6, h: 3 }, label: 'Conflict' });
    await invoke('annotate', {
      id: 'unit', description: 'rejects heat outdoors', technology: 'refrigerant circuit',
      tags: ['equipment'], properties: { owner: 'facilities' }, perspectives: { service: 'field maintained' },
    });
    await invoke('connect', {
      id: 'unit-tag', from: 'unit.N', to: 'tag.N', routing: 'curved', via: ['J2.q1'],
      description: 'control relationship', tags: ['control'],
    });
    const model = JSON.parse(await invoke('inspect_model', { minimum: 'warning', format: 'json' }));
    assert.match(model.summary.state, /model-incomplete|model-errors/);
    const modelFinding = model.open[0];
    await invoke('accept_model_finding', { fingerprint: modelFinding.fingerprint, reason: 'endpoint semantic review contract' });
    await invoke('unaccept_model_finding', { fingerprint: modelFinding.fingerprint });
    await invoke('define_view', { key: 'equipment', title: 'Equipment', type: 'filtered', includeTags: ['equipment'] });
    await invoke('configure_theme', {
      name: 'Endpoint theme', tokens: { paper: '#ffffff' }, tagStyles: [{ tag: 'equipment', fill: '#dceef8' }],
    });
    await invoke('attach_resource', { id: 'runbook', type: 'runbook', uri: 'docs/runbook.md', label: 'Runbook' });
    await invoke('remove_resource', { id: 'runbook' });
    await invoke('remove_view', { key: 'equipment' });
    // Layout operations: the arithmetic every diagram in this repo used to do
    // by hand, done once and named.
    await invoke('align', { ids: ['unit', 'tag'], edge: 'top' });
    await invoke('distribute', { ids: ['unit', 'overlap', 'tag'], axis: 'horizontal' });
    await invoke('pen', { id: 'run', role: 'artwork', program: 'pen C15.q1\nright 4 line' });
    await invoke('micro_mask', { action: 'add', id: 'run-cleanup', target: 'run', points: [{ x: 22, y: 141 }] });

    const image = pngDataUri(20, 10);
    const measurement = JSON.parse(await invoke('measure_image', { source: image, maxWidthCells: 4 }));
    assert.equal(measurement.width, 20);
    assert.equal(measurement.height, 10);
    await invoke('place_image', { id: 'photo', at: 'T15.tl', span: '4x2', source: image, mode: 'embed' });
    await invoke('place_reference', { id: 'trace', at: 'A1.tl', span: '2x1', source: image });
    await invoke('remove_page', { id: 'trace' });

    const space = JSON.parse(await invoke('free_space', {
      scope: 'stack', cellsW: 3, cellsH: 2, region: 'A1:AZ30',
    }));
    assert.equal(space.fits, true);
    const description = JSON.parse(await invoke('describe', { region: 'A1:AZ30' }));
    assert.ok(description.some((page) => page.elements.length > 0));
    assert.match(await invoke('ascii', { maxCells: 45, withFindings: true }), /A/);

    await invoke('group', { action: 'create', id: 'outdoor-package', label: 'Outdoor package', members: ['unit', 'tag'] });
    assert.match(await invoke('group', { action: 'list' }), /outdoor-package/);
    await invoke('group', { action: 'move', id: 'outdoor-package', cellsX: 1, cellsY: 1 });
    await invoke('group', { action: 'remove', id: 'outdoor-package', members: ['tag'] });
    await invoke('group', { action: 'add', id: 'outdoor-package', members: ['tag'] });
    await invoke('group', { action: 'delete', id: 'outdoor-package' });

    await invoke('constraint', {
      action: 'create', id: 'tag-follows-unit', dependent: 'tag', target: 'unit',
      dependentAnchor: 'W', targetAnchor: 'E', offsetX: 4, offsetY: 0,
    });
    assert.match(await invoke('constraint', { action: 'list' }), /tag-follows-unit/);
    await invoke('constraint', { action: 'sync', id: 'tag-follows-unit' });
    await invoke('move', { id: 'unit', cellsX: 1 });
    await invoke('resize', { id: 'unit', cellsW: 7, cellsH: 4, anchor: 'tl' });
    await invoke('restyle', { id: 'unit', label: 'Outdoor condenser', corner: 'rounded', align: 'center', fill: '#dceef8' });
    await invoke('constraint', { action: 'delete', id: 'tag-follows-unit' });

    await invoke('rename', { id: 'overlap', to: 'obstacle' });
    await invoke('extend_path', { id: 'run', program: 'right 2 line' });
    await invoke('replace_path', { id: 'run', program: 'pen C18.q1\nright 4 line' });

    const validation = JSON.parse(await invoke('validate', { format: 'json' }));
    assert.ok(validation.open.length > 0, 'the acceptance workflow needs a current finding');
    const fingerprint = validation.open[0].fingerprint;
    // A finding's fix must be reachable as a call, not just as prose.
    assert.match(await invoke('repair', { fingerprint }), /\[0\]/);

    await invoke('accept_finding', { fingerprint, reason: 'endpoint contract verifies the audit workflow' });
    await invoke('unaccept_finding', { fingerprint });

    const operations = [{
      op: 'place_box', id: 'planned', at: 'Z4.tl', span: { w: 4, h: 2 }, label: 'Planned',
    }];
    assert.match(await invoke('plan', { operations }), /rehearsed 1 operation/);
    assert.match(await invoke('plan', { operations, commit: true }), /committed 1 operation/);
    await invoke('set_canvas', { cols: 100, rows: 60 });
    // Paper is document state, so it has to survive the same round trip as the
    // geometry does.
    await invoke('set_background', { color: '#0b1020' });
    await invoke('remove', { id: 'obstacle' });
    // An import is a compiler onto ordinary operations, so exercise it over the
    // real transport too: it must return operations and change nothing.
    const imported = JSON.parse(await invoke('import_mermaid', {
      source: ['flowchart TD', '  M1([Begin]) --> M2[Work]', '  M2 --> M3([End])'].join('\n'),
    }));
    assert.equal(imported.nodes, 3);
    assert.ok(imported.operations.length >= 5);

    // Routing must be exercised over the transport too: it returns a program
    // and changes nothing, so running what it emits has to validate.
    const routed = await invoke('route', { from: 'unit.S', to: 'tag.N' });
    assert.match(routed, /turn\(s\)|no clear route/);

    const rendered = await invoke('render', { path: 'endpoint.svg', showGrid: false, force: true, bounds: 'canvas' });
    // render must hand back the hash a perceptual review binds to, and the
    // review must come back with BOTH verdicts rather than one merged flag.
    const renderHash = /renderHash: ([0-9a-f]{16})/.exec(rendered)[1];
    const reviewed = await invoke('perceptual_review', {
      renderHash,
      reviewer: 'endpoint-matrix',
      findings: [{
        id: 'p1',
        severity: 'P2',
        category: 'annotation-ambiguity',
        elements: ['tag'],
        symptom: 'the disconnect label sits nearer the condenser than the run it names',
        consequence: 'a reader attaches the label to the wrong element',
        repair: 'move',
      }],
    });
    assert.match(reviewed, /structural:/);
    assert.match(reviewed, /perceptual:/);
    await invoke('save', { path: 'endpoint-copy.turtlepen.json', force: true });

    // Layout gets its own document, because it MOVES things: the point of the
    // tool is that it chooses the arrangement rather than tidying one. Two
    // parents feeding the opposite child is the smallest graph where the order
    // boxes were declared in is provably the wrong order to draw them in.
    await invoke('new_diagram', { name: 'layout endpoint', path: 'layout.turtlepen.json', cols: 90, rows: 60 });
    await invoke('place_box', { id: 'intake', at: 'C4.tl', span: { w: 6, h: 3 }, label: 'Intake' });
    await invoke('place_box', { id: 'review', at: 'S4.tl', span: { w: 6, h: 3 }, label: 'Review' });
    await invoke('place_box', { id: 'approve', at: 'C16.tl', span: { w: 6, h: 3 }, label: 'Approve' });
    await invoke('place_box', { id: 'reject', at: 'S16.tl', span: { w: 6, h: 3 }, label: 'Reject' });
    await invoke('pen', { id: 'intake-reject', program: 'pen from intake.S\ndown align right line to reject.N arrow' });
    await invoke('pen', { id: 'review-approve', program: 'pen from review.S\ndown align right line to approve.N arrow' });
    const arranged = await invoke('layout', {});
    assert.match(arranged, /laid out 4 box\(es\) over 2 rank\(s\)/);
    assert.match(arranged, /edge crossings 1 -> 0/, `layout must remove the crossing: ${arranged}`);

    // TurtleFont: words as ink. Exercised over the transport because the
    // refusal path matters as much as the drawing one.
    const cover = JSON.parse(await invoke('font_coverage', { text: 'Ship it — Δx ≤ 5μm' }));
    assert.equal(cover.drawable, true, 'the face covers accents, maths and arrows');
    await invoke('stroke_text', { id: 'inked', at: 'C34.tl', text: 'RELEASE PIPELINE', scale: 2, align: 'center' });
    // Looking at one glyph, and the fingerprint that tells an edit from a no-op.
    const picture = await invoke('glyph', { char: 'a', compare: 'o' });
    assert.match(picture, /baseline/, 'the picture is drawn against the metrics');
    assert.match(await invoke('glyph', { char: 'A', compare: 'Α' }), /SAME INK/, 'an alias is reported as one drawing');
    // An inked label, which is what makes a whole diagram font-free.
    await invoke('place_box', { id: 'inkbox', at: 'C56.tl', span: { w: 44, h: 16 }, label: '' });
    await invoke('stroke_label', { id: 'inklbl', target: 'inkbox', text: 'Build' });
    const tooBig = await client.call('stroke_label', { id: 'nope2', target: 'inkbox', text: 'Far too long to fit in here at all' });
    assert.equal(tooBig.isError, true, 'a label that does not fit is refused, not shrunk');

    const refused = await client.call('stroke_text', { id: 'nope', at: 'C46.tl', text: 'ok 字' });
    assert.equal(refused.isError, true, 'a glyph the face lacks is refused, never skipped');

    await invoke('new_diagram', { name: 'wireframe endpoint', path: 'wireframe.turtlepen.json', cols: 80, rows: 50 });
    await invoke('wireframe', {
      widthIn: 120,
      depthIn: 96,
      scale: 2,
      clearance: false,
      items: [{
        id: 'condenser', widthIn: 30, depthIn: 30, atXIn: 48, atYIn: 36,
        describe: 'outdoor condensing unit on a level pad',
      }],
      runs: [{
        id: 'lineset', kind: 'lineset',
        waypoints: [{ xIn: 0, yIn: 12 }, { xIn: 48, yIn: 12 }, { xIn: 48, yIn: 36 }],
      }],
    });
    assert.match(await invoke('export_prompt', {
      subject: 'HVAC equipment layout', view: 'plan', style: 'clean field sketch',
    }), /outdoor condensing unit/);
    await invoke('open_diagram', { path: 'wireframe.turtlepen.json' });

    await invoke('new_diagram', { name: 'perspective endpoint', path: 'perspective.turtlepen.json', cols: 80, rows: 50 });
    await invoke('perspective_scene', {
      roomIn: { widthIn: 120, depthIn: 96, heightIn: 96 },
      eyeIn: { x: 60, y: 66, z: -48 },
      targetIn: { x: 60, y: 48, z: 48 },
      items: [{ id: 'equipment', xIn: 42, yIn: 0, zIn: 30, widthIn: 36, heightIn: 36, depthIn: 24 }],
      runs: [{
        id: 'conduit', pattern: 'dashed',
        waypoints: [{ x: 0, y: 72, z: 12 }, { x: 60, y: 72, z: 48 }],
      }],
    });
    assert.match(await invoke('history', { action: 'status' }), /undo_available/);
    assert.match(await invoke('history', { action: 'undo' }), /undid perspective_scene/);
    assert.match(await invoke('history', { action: 'redo' }), /redid perspective_scene/);
    assert.match(await invoke('history', { action: 'clear' }), /cleared undo and redo history/);

    assert.deepEqual([...covered].sort(), advertised,
      'a tool was added or removed without updating the real endpoint contract');
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
});

function pngDataUri(width, height) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(height * (1 + width * 3));
  const bytes = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

function crc32(buffer) {
  let value = ~0;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return ~value;
}
