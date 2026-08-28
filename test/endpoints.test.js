/** End-to-end coverage for every MCP tool over the real stdio transport. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { createMcpClient } from '../examples/mcp-client.js';
import { createSession, createTools } from '../src/mcp/tools.js';

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
    assert.equal(initialized.result.protocolVersion, '2025-06-18');

    await invoke('turtlepen_help');
    await invoke('measure', { text: 'Outdoor condensing unit', fontSize: 10, maxWidthCells: 12 });
    await invoke('new_diagram', { name: 'endpoint matrix', path: 'endpoint.turtlepen.json', cols: 80, rows: 50 });

    await invoke('add_page', { id: 'notes', z: 2, intent: 'overlay', title: 'Field notes' });
    await invoke('update_page', { id: 'notes', title: 'Verified field notes', visible: false });
    await invoke('place_box', { id: 'unit', at: 'C4.tl', span: { w: 6, h: 3 }, label: 'Condenser' });
    await invoke('place_box', { id: 'tag', at: 'M4.tl', span: { w: 4, h: 2 }, label: 'Disconnect' });
    await invoke('place_box', { id: 'overlap', at: 'F4.tl', span: { w: 6, h: 3 }, label: 'Conflict' });
    await invoke('pen', { id: 'run', role: 'artwork', program: 'pen C15.q1\nright 4 line' });

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
    await invoke('path_edit', { id: 'run', action: 'insert', index: 1, at: 'C18.q1' });
    await invoke('normalize_path', { id: 'run' });
    await invoke('stroke_to_path', { id: 'run', resultId: 'run-outline', removeSource: false });
    await invoke('reorder', { id: 'run-outline', action: 'bring_to_front' });
    await invoke('duplicate', { id: 'run-outline', to: 'run-outline-copy', dx: 0, dy: 8 });
    await invoke('array', {
      id: 'run-outline-copy', columns: 2, rows: 1, stepX: 12, stepY: 0, prefix: 'run-array',
    });

    await invoke('place_box', { id: 'boolean-left', at: 'A30.tl', span: { w: 2, h: 2 } });
    await invoke('place_box', { id: 'boolean-right', at: 'B30.tl', span: { w: 2, h: 2 } });
    await invoke('boolean', { action: 'union', ids: ['boolean-left', 'boolean-right'], id: 'boolean-merged' });
    assert.match(await invoke('history', { action: 'undo' }), /undid boolean "boolean-merged"/);
    assert.match(await invoke('history', { action: 'redo' }), /redid boolean "boolean-merged"/);
    await invoke('slice', { id: 'boolean-merged', axis: 'vertical', at: 'B30.tl' });
    await invoke('offset_path', {
      id: 'boolean-merged-part-2', distance: 1, resultId: 'offset-result', removeSource: false,
    });
    const inspected = JSON.parse(await invoke('inspect', {
      ids: ['boolean-merged-part-1', 'offset-result'], footprint: 'claimed',
    }));
    assert.equal(inspected.elements.length, 2);

    const importedSvg = [
      '<svg viewBox="0 0 40 20">',
      '<rect x="0" y="0" width="10" height="10" fill="#abc"/>',
      '<line x1="22.5" y1="2.5" x2="32.5" y2="2.5" stroke="#456" stroke-width="5"/>',
      '</svg>',
    ].join('');
    const svgPreview = JSON.parse(await invoke('inspect_svg', { source: importedSvg, prefix: 'svg-piece' }));
    assert.deepEqual(svgPreview.elements.map((element) => element.id), ['svg-piece-1', 'svg-piece-2']);
    const svgImport = JSON.parse(await invoke('import_svg', {
      source: importedSvg, page: 'notes', prefix: 'svg-piece',
    }));
    assert.deepEqual(svgImport.created, ['svg-piece-1', 'svg-piece-2']);
    assert.match(await invoke('history', { action: 'undo' }), /undid import_svg/);
    assert.match(await invoke('history', { action: 'redo' }), /redid import_svg/);

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
