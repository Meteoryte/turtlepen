#!/usr/bin/env node
/** Exercise TurtlePen's complete image workflow through real MCP stdio. */

import { createMcpClient } from './mcp-client.js';

const client = createMcpClient({ createdAt: '2026-08-17T00:00:00.000Z' });
const PHOTO_SOURCE = '../assets/generated/p01-condenser-site-overview-illustrative.png';
const TRACE_SOURCE = '../assets/generated/p01-condenser-site-overview-line-art.png';
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
    name: 'Condenser image workflow test', path: DOCUMENT, cols: 156, rows: 58, fontSize: 10,
  });

  const photoMeasurement = JSON.parse(await call('measure_image', { source: PHOTO_SOURCE, maxWidthCells: 48 }));
  const traceMeasurement = JSON.parse(await call('measure_image', { source: TRACE_SOURCE, maxWidthCells: 48 }));
  for (const measurement of [photoMeasurement, traceMeasurement]) {
    if (measurement.width !== 1536 || measurement.height !== 1024) {
      throw new Error(`generated source dimensions drifted: ${measurement.width}x${measurement.height}`);
    }
    if (measurement.cellsWide !== 48 || measurement.cellsTall !== 32 || measurement.aspectDriftPct !== 0) {
      throw new Error(`unexpected lattice measurement: ${JSON.stringify(measurement)}`);
    }
  }
  if (traceMeasurement.scale.dither.sampling.sourcePixelsPerSample.x !== 16 ||
      traceMeasurement.scale.dither.sampling.sourcePixelsPerSample.y !== 16) {
    throw new Error(`unexpected dither sampling scale: ${JSON.stringify(traceMeasurement.scale.dither)}`);
  }
  if (traceMeasurement.scale.simplify.sampling.sourcePixelsPerSample.x !== 16 ||
      traceMeasurement.scale.simplify.sampling.sourcePixelsPerSample.y !== 16) {
    throw new Error(`unexpected simplify sampling scale: ${JSON.stringify(traceMeasurement.scale.simplify)}`);
  }
  if (traceMeasurement.scale.simplify.workingCanvas.resolvedSupersample !== 4 ||
      traceMeasurement.scale.simplify.workingCanvas.width !== 384 ||
      traceMeasurement.scale.simplify.workingCanvas.height !== 256) {
    throw new Error(`unexpected simplify working canvas: ${JSON.stringify(traceMeasurement.scale.simplify.workingCanvas)}`);
  }

  // A raw photo can be simplified geometrically, but TurtlePen cannot infer
  // which object matters. Prove L023 blocks that heuristic result, then remove
  // it rather than publishing an ambiguous approximation.
  await call('place_image', {
    id: 'heuristic-photo', at: 'C8.tl', span: '48x32', source: PHOTO_SOURCE, mode: 'simplify', detail: 'auto', supersample: 4,
  });
  const heuristic = JSON.parse(await call('validate', { format: 'json' }));
  if (!heuristic.open.some((finding) => finding.rule === 'L023' && finding.actors?.includes('heuristic-photo'))) {
    throw new Error('continuous-tone simplification did not require semantic review');
  }
  await call('remove', { id: 'heuristic-photo' });

  // A reference is intentionally temporary. Prove the shipping gate sees it,
  // then remove it before any deliverable is written.
  await call('place_reference', { id: 'temporary-trace', source: TRACE_SOURCE, at: 'C8.tl', span: '24x16' });
  const withReference = JSON.parse(await call('validate', { format: 'json' }));
  if (!withReference.open.some((finding) => finding.rule === 'L020')) {
    throw new Error('temporary reference did not produce L020');
  }
  await call('remove_page', { id: 'temporary-trace' });

  // Direct endpoint: the image stays a self-contained bitmap.
  await call('place_image', {
    id: 'field-photo', at: 'C8.tl', span: '48x32', source: PHOTO_SOURCE, mode: 'embed', fit: 'contain',
  });

  // Planned endpoint: a purpose-built high-contrast derivative becomes lattice ink.
  const operations = [
    box('title', 'C2.tl', '151x4',
      'REAL IMAGE WORKFLOW | EMBED + DITHER + SIMPLIFY + REVIEW GATES', '#dce9ee', 'chamfered'),
    { op: 'place_image', id: 'lattice-trace', at: 'BA8.tl', span: '48x32', source: TRACE_SOURCE, mode: 'dither' },
    { op: 'place_image', id: 'simplified-trace', at: 'CY8.tl', span: '48x32', source: TRACE_SOURCE, mode: 'simplify', detail: 'auto', supersample: 4 },
    box('embed-caption', 'C41.tl', '48x6',
      'EMBED | Original PNG bytes are stored inside the document. Exact 48x32-cell footprint; no external file is needed after save.',
      '#e8edf0'),
    box('dither-caption', 'BA41.tl', '48x6',
      'DITHER | Prepared line art keeps tonal threshold behavior at 96x64 quadrants. Deterministic and source-like, but fine tone can become pattern.',
      '#ece6f0'),
    box('simplify-caption', 'CY41.tl', '48x6',
      'SIMPLIFY | Prepared line art is processed on a 384x256 working canvas (4x each axis), then reduced to the final 96x64 lattice. Intentional approximation, not a 1:1 copy.',
      '#e4eee6'),
    box('boundary', 'C49.tl', '151x7',
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
  const lattice = validation.open.find((finding) => finding.actors?.includes('lattice-trace'));
  if (lattice) throw new Error(`line-art dither produced ${lattice.rule}: ${lattice.message}`);
  const simplified = validation.open.find((finding) => finding.actors?.includes('simplified-trace'));
  if (simplified) throw new Error(`line-art simplify produced ${simplified.rule}: ${simplified.message}`);

  await call('save');
  await call('open_diagram', { path: DOCUMENT });
  const reopened = JSON.parse(await call('validate', { format: 'json' }));
  if (!reopened.summary.clean || reopened.open.some((finding) => ['S0', 'S1', 'S2'].includes(finding.severity))) {
    throw new Error('saved image document did not reopen cleanly');
  }
  await call('render', { path: SVG, bounds: 'canvas', showGrid: false, markFindings: false });

  process.stdout.write(`measured photo and trace at ${photoMeasurement.width}x${photoMeasurement.height} -> ${photoMeasurement.cellsWide}x${photoMeasurement.cellsTall} cells, ${photoMeasurement.aspectDriftPct}% drift\n`);
  process.stdout.write('dither sampling: 1536x1024 source -> 96x64 quadrants (16x16 source pixels per sample)\n');
  process.stdout.write('simplify processing: 384x256 working canvas (4x each axis) -> 96x64 final lattice\n');
  process.stdout.write('raw-photo simplify raised L023 and was removed before publication\n');
  process.stdout.write('reference gate raised L020 and cleared after removal\n');
  process.stdout.write('photo embed, line-art dither, and non-fidelity simplify survived save, reopen, validation, and render\n');
  process.stdout.write(`wrote ${DOCUMENT}\nwrote ${SVG}\n`);
} finally {
  await client.close();
}
