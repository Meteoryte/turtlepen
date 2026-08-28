import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import * as core from '../src/core/index.js';
import { createSession, createTools } from '../src/mcp/tools.js';

const source = `
<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
  <rect id="panel" x="10" y="20" width="10" height="10" fill="#abc"/>
  <line id="wire" x1="2.5" y1="2.5" x2="12.5" y2="2.5" stroke="#123456" stroke-width="5"/>
  <polyline id="corner" points="2.5,42.5 12.5,42.5 12.5,52.5" fill="none" stroke="#456" stroke-width="5" stroke-linejoin="round"/>
  <path id="loop" d="M 22.5 2.5 h 10 v 10 z" fill="none" stroke="#789abc" stroke-width="5" stroke-linejoin="round"/>
</svg>
`;

test('a strict SVG subset compiles to exact editable lattice paths', () => {
  const preview = core.inspectSvg(source, { prefix: 'fixture' });
  assert.equal(preview.format, 'lattice-svg-subset-v1');
  assert.equal(preview.importedElements, 4);
  assert.equal(preview.importedQuadrants, 19);
  assert.deepEqual(preview.sourceElements, ['rect', 'line', 'polyline', 'path']);
  assert.deepEqual(preview.elements.map((element) => element.id), ['fixture-1', 'fixture-2', 'fixture-3', 'fixture-4']);
  assert.deepEqual(preview.elements[0].bounds, { x: 2, y: 4, w: 2, h: 2 });
  assert.equal(preview.elements[0].paint, 'cells');
  assert.equal(preview.elements[3].closed, true);
  assert.equal(preview.elements[3].sourceId, 'loop');

  const d = core.createDocument({ name: 'strict SVG import' });
  const imported = core.importSvg(d, { source, prefix: 'fixture' });
  assert.deepEqual(imported.created, ['fixture-1', 'fixture-2', 'fixture-3', 'fixture-4']);
  assert.equal(core.findElement(d, 'fixture-1').element.stroke.paint, 'cells');
  assert.deepEqual(core.findElement(d, 'fixture-4').element.provenance, {
    operation: 'svg_import', sourceElement: 'path', sourceIndex: 4, sourceId: 'loop',
  });
  assert.match(core.renderSvg(d), /data-element="fixture-4"/);

  const saved = core.serialize(d);
  assert.ok(!saved.includes('<svg'), 'source markup is compiled, never persisted or emitted verbatim');
  assert.equal(core.serialize(core.deserialize(saved)), saved, 'compiled SVG stays durable');
});

test('the SVG compiler refuses unsupported or unsafe constructs before document mutation', () => {
  const rejected = [
    ['<script>alert(1)</script>', /<script>/i],
    ['<g transform="translate(5,0)"></g>', /attribute "transform"/],
    ['<path d="M 2.5 2.5 C 7.5 2.5 12.5 7.5 17.5 7.5" fill="none" stroke="#123" stroke-width="5"/>', /path command "C"/],
    ['<line x1="0" y1="0" x2="10" y2="0" stroke="#123" stroke-width="5"/>', /quadrant centre/],
    ['<image href="https://example.test/logo.svg"/>', /<image>/],
    ['<rect width="1000000000000" height="5" fill="#123"/>', /safety limit/],
  ];

  for (const [fragment, expected] of rejected) {
    const d = core.createDocument({ name: 'atomic SVG import' });
    const before = core.serialize(d);
    assert.throws(
      () => core.importSvg(d, { source: `<svg>${fragment}</svg>` }),
      expected,
    );
    assert.equal(core.serialize(d), before, `${fragment} must not partially import`);
  }
});

test('nearest SVG quantization is opt-in and reports every shifted coordinate', () => {
  const offGrid = '<svg><rect x="1" y="1" width="9" height="9" fill="#abc"/></svg>';
  assert.throws(() => core.inspectSvg(offGrid), /quantize:"nearest"/);

  const preview = core.inspectSvg(offGrid, { quantize: 'nearest' });
  assert.equal(preview.quantization.policy, 'nearest');
  assert.equal(preview.quantization.adjustedCoordinates, 4);
  assert.deepEqual(preview.elements[0].bounds, { x: 0, y: 0, w: 2, h: 2 });
  assert.ok(preview.quantization.adjustments.every((entry) => entry.sourcePx !== entry.emittedPx));
});

test('SVG import shares plan semantics and leaves source markup out of document state', () => {
  const d = core.createDocument({ name: 'planned SVG import' });
  const operations = [{ op: 'import_svg', source, prefix: 'planned' }];
  const before = core.serialize(d);

  const rehearsal = core.planOperations(d, operations);
  assert.equal(rehearsal.ok, true);
  assert.equal(core.serialize(d), before, 'a dry run cannot import into the live document');

  const committed = core.commitOperations(d, operations);
  assert.equal(committed.ok, true);
  assert.equal(core.serialize(d), core.serialize(rehearsal.preview));
  assert.ok(!core.serialize(d).includes('<svg'));
});

test('direct SVG import and plan resolve a file relative to the active diagram alike', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-svg-import-'));
  try {
    const tools = createTools(createSession({ cwd: dir }));
    await tools.find((tool) => tool.name === 'new_diagram').handler({
      name: 'SVG file source', path: 'diagrams/imported.turtlepen.json',
    });
    await writeFile(resolve(dir, 'diagrams', 'asset.svg'), source, 'utf8');

    const inspect = tools.find((tool) => tool.name === 'inspect_svg');
    const imported = tools.find((tool) => tool.name === 'import_svg');
    const plan = tools.find((tool) => tool.name === 'plan');
    const report = JSON.parse(await inspect.handler({ source: 'asset.svg', prefix: 'file' }));
    assert.deepEqual(report.elements.map((element) => element.id), ['file-1', 'file-2', 'file-3', 'file-4']);

    const direct = JSON.parse(await imported.handler({ source: 'asset.svg', prefix: 'file' }));
    assert.deepEqual(direct.created, ['file-1', 'file-2', 'file-3', 'file-4']);
    assert.match(
      await plan.handler({ operations: [{ op: 'import_svg', source: 'asset.svg', prefix: 'planned-file' }] }),
      /rehearsed 1 operation/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
