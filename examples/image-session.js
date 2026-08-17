#!/usr/bin/env node
/** Exercise TurtlePen's complete image workflow through real MCP stdio. */

import { createMcpClient } from './mcp-client.js';

const client = createMcpClient({ createdAt: '2026-08-17T00:00:00.000Z' });
const SOURCE = '../assets/generated/p01-condenser-site-overview-illustrative.png';
const DOCUMENT = 'diagrams/condenser-image-workflow.turtlepen.json';
const SVG = 'diagrams/condenser-image-workflow.svg';

async function call(name, args = {}) {
  const result = await client.call(name, args);
  if (result.isError) throw new Error(`${name}: ${result.error ?? result.text}`);
  return result.text;
}

const box = (id, at, span, label, fill, corner = 'rounded') => ({
  op: 'place_box', id, at, span, label, fill, corner, align: 'left', fontSize: 10,
});

try {
  const initialized = await client.init();
  if (initialized.result?.serverInfo?.name !== 'turtlepen') throw new Error('unexpected MCP server');

  await call('new_diagram', {
    name: 'Condenser image workflow test', path: DOCUMENT, cols: 106, rows: 58, fontSize: 10,
  });

  const measurement = JSON.parse(await call('measure_image', { source: SOURCE, maxWidthCells: 48 }));
  if (measurement.width !== 1536 || measurement.height !== 1024) {
    throw new Error(`generated source dimensions drifted: ${measurement.width}x${measurement.height}`);
  }
  if (measurement.cellsWide !== 48 || measurement.cellsTall !== 32 || measurement.aspectDriftPct !== 0) {
    throw new Error(`unexpected lattice measurement: ${JSON.stringify(measurement)}`);
  }

  // A reference is intentionally temporary. Prove the shipping gate sees it,
  // then remove it before any deliverable is written.
  await call('place_reference', { id: 'temporary-trace', source: SOURCE, at: 'C8.tl', span: '24x16' });
  const withReference = JSON.parse(await call('validate', { format: 'json' }));
  if (!withReference.open.some((finding) => finding.rule === 'L020')) {
    throw new Error('temporary reference did not produce L020');
  }
  await call('remove_page', { id: 'temporary-trace' });

  // Direct endpoint: the image stays a self-contained bitmap.
  await call('place_image', {
    id: 'field-photo', at: 'C8.tl', span: '48x32', source: SOURCE, mode: 'embed', fit: 'contain',
  });

  // Planned endpoint: the same real source becomes deterministic lattice ink.
  const operations = [
    box('title', 'C2.tl', '101x4',
      'REAL IMAGE WORKFLOW | EMBED + DITHER + REFERENCE GATE', '#dce9ee', 'chamfered'),
    { op: 'place_image', id: 'lattice-photo', at: 'BA8.tl', span: '48x32', source: SOURCE, mode: 'dither' },
    box('embed-caption', 'C41.tl', '48x6',
      'EMBED | Original PNG bytes are stored inside the document. Exact 48x32-cell footprint; no external file is needed after save.',
      '#e8edf0'),
    box('dither-caption', 'BA41.tl', '48x6',
      'DITHER | The PNG is decoded once into deterministic quadrant runs. Original bitmap bytes are discarded after conversion.',
      '#ece6f0'),
    box('boundary', 'C49.tl', '101x7',
      'ILLUSTRATIVE TEST ASSET | This generated image verifies TurtlePen image handling only. It is not equipment-specific evidence, a code-compliance example, or a substitute for the P01 field photograph captured on site.',
      '#f5edce', 'square'),
  ];

  const rehearsal = await call('plan', { operations });
  if (/plan FAILED/.test(rehearsal)) throw new Error(rehearsal);
  const committed = await call('plan', { operations, commit: true });
  if (/plan FAILED/.test(committed)) throw new Error(committed);

  const validation = JSON.parse(await call('validate', { format: 'json' }));
  const blocking = validation.open.filter((finding) => ['S0', 'S1', 'S2'].includes(finding.severity));
  if (blocking.length) {
    throw new Error(blocking.map((finding) => `${finding.rule}: ${finding.message}`).join('\n'));
  }
  if (validation.open.some((finding) => finding.rule === 'L020')) {
    throw new Error('reference scaffolding survived removal');
  }

  await call('save');
  await call('open_diagram', { path: DOCUMENT });
  const reopened = JSON.parse(await call('validate', { format: 'json' }));
  if (!reopened.summary.clean || reopened.open.some((finding) => ['S0', 'S1', 'S2'].includes(finding.severity))) {
    throw new Error('saved image document did not reopen cleanly');
  }
  await call('render', { path: SVG, bounds: 'canvas', showGrid: false, markFindings: false });

  process.stdout.write(`measured ${measurement.width}x${measurement.height} -> ${measurement.cellsWide}x${measurement.cellsTall} cells, ${measurement.aspectDriftPct}% drift\n`);
  process.stdout.write('reference gate raised L020 and cleared after removal\n');
  process.stdout.write('embed and dither survived save, reopen, validation, and render\n');
  process.stdout.write(`wrote ${DOCUMENT}\nwrote ${SVG}\n`);
} finally {
  await client.close();
}
