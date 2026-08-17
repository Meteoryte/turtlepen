#!/usr/bin/env node
/**
 * Dense authoring and rework over the real MCP server.
 *
 * Five connectors compete for one box face. The first rehearsal deliberately
 * uses the midpoint seat for all five and must report merged strokes. The
 * repaired rehearsal assigns deterministic indexed seats, commits cleanly,
 * proves a fully occupied search region says so, and renders the result.
 */

import { createMcpClient } from './mcp-client.js';

const QUIET = process.argv.includes('--quiet');
const FIXED_CREATED_AT = '2026-08-17T16:00:00.000Z';
const mcp = createMcpClient({ createdAt: FIXED_CREATED_AT });
const failures = [];

const boxes = [
  { op: 'place_box', id: 'hub', at: 'U4.tl', span: { w: 24, h: 5 }, label: 'Dispatch Hub', corner: 'rounded' },
  ...[
    ['worker-a', 'C28.tl'],
    ['worker-b', 'Q28.tl'],
    ['worker-c', 'AE28.tl'],
    ['worker-d', 'AS28.tl'],
    ['worker-e', 'BG28.tl'],
  ].map(([id, at]) => ({ op: 'place_box', id, at, span: { w: 10, h: 3 }, label: id, corner: 'rounded' })),
];

const routeSpecs = [
  ['route-a', 4, 2, 'left', 'worker-a'],
  ['route-b', 2, 4, 'left', 'worker-b'],
  ['route-e', 5, 6, 'right', 'worker-e'],
  ['route-d', 3, 8, 'right', 'worker-d'],
  ['route-c', 1, 10, 'right', 'worker-c'],
];

function routeOperation([id, slot, depth, direction, target], indexed) {
  const firstCorner = direction === 'left' ? 'top left' : 'top right';
  const secondCorner = direction === 'left' ? 'right bottom' : 'left bottom';
  return {
    op: 'pen',
    id,
    program: [
      `pen from hub.S${indexed ? `#${slot}` : ''}`,
      `down ${depth} line`,
      `down corner align ${firstCorner}`,
      `${direction} line to ${target}.N`,
      `${direction} corner align ${secondCorner}`,
      `down line to ${target}.N arrow`,
    ].join('\n'),
  };
}

async function call(name, args) {
  const result = await mcp.call(name, args);
  if (result.isError) failures.push(`${name}: ${result.error ?? result.text}`);
  return result.text ?? result.error ?? '';
}

await mcp.init();
const help = await call('turtlepen_help', {});
if (!help.includes('gateway.S#2')) failures.push('help does not teach indexed face seats');

await call('new_diagram', {
  name: 'constraint stress',
  path: 'diagrams/constraint-stress.turtlepen.json',
  cols: 80,
  rows: 40,
});

const midpointPlan = await call('plan', {
  operations: [...boxes, ...routeSpecs.map((spec) => routeOperation(spec, false))],
});
if (!/L006 stroke overlap/.test(midpointPlan)) {
  failures.push('midpoint rehearsal did not expose competing same-face connectors as L006');
}

const afterRehearsal = JSON.parse(await call('describe', {}));
if (afterRehearsal[0].elements.length !== 0) failures.push('rehearsal mutated the live document');

const repairedPlan = await call('plan', {
  operations: [...boxes, ...routeSpecs.map((spec) => routeOperation(spec, true))],
  commit: true,
});
if (/L00[1468]|L01[456]/.test(repairedPlan)) failures.push('indexed-seat rework still has a blocking geometry finding');

const exhausted = JSON.parse(await call('free_space', {
  page: 'base', cellsW: 24, cellsH: 5, region: 'U4:AR8',
}));
if (exhausted.fits !== false) failures.push('a fully occupied bounded region was reported as available');
if (exhausted.scope !== 'stack' || exhausted.searched_pages.join(',') !== 'base') {
  failures.push('free_space did not disclose its effective stack scope');
}

const validation = JSON.parse(await call('validate', { format: 'json' }));
const blocking = validation.open.filter((finding) => ['S0', 'S1', 'S2'].includes(finding.severity));
if (blocking.length) failures.push(`final validation has ${blocking.length} blocking finding(s): ${blocking.map((f) => f.rule).join(', ')}`);

await call('render', { path: 'diagrams/constraint-stress.svg' });
await mcp.close();

if (!QUIET) {
  console.log('midpoint rehearsal: L006 reproduced');
  console.log('indexed-seat rework: committed');
  console.log('occupied region U4:AR8: no 24x5-cell opening');
  console.log(`final validation: ${blocking.length} blocking finding(s)`);
  console.log('rendered diagrams/constraint-stress.svg');
}

if (failures.length) {
  for (const failure of failures) console.error(`constraint stress FAILED: ${failure}`);
  process.exitCode = 1;
} else {
  console.log('constraint stress passed');
}
