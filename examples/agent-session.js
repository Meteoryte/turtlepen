#!/usr/bin/env node
/**
 * An agent session, driven over the real MCP server.
 *
 * This is the "use it in anger" exercise: it authors a genuine system diagram
 * the way an AI actually would — orient, measure, find room, rehearse, repair,
 * commit, render — talking JSON-RPC to a spawned server rather than importing
 * the core. Anything awkward here is awkward for a real agent too.
 *
 *   node examples/agent-session.js          # transcript
 *   node examples/agent-session.js --quiet  # just the verdict
 */

import { createMcpClient } from './mcp-client.js';

const QUIET = process.argv.includes('--quiet');
const FIXED_CREATED_AT = '2026-08-10T13:29:24.372Z';

// --- transcript helpers -----------------------------------------------------

const friction = [];
let step = 0;

function note(what) {
  friction.push(what);
  if (!QUIET) console.log(`\n  !! FRICTION: ${what}`);
}

async function act(mcp, intent, name, args, { show = 12 } = {}) {
  step++;
  if (!QUIET) {
    console.log(`\n${'─'.repeat(74)}`);
    console.log(`${String(step).padStart(2)}. ${intent}`);
    console.log(`    ${name}(${JSON.stringify(args).slice(0, 160)})`);
    console.log('─'.repeat(74));
  }
  const r = await mcp.call(name, args);
  const body = r.error ?? r.text;
  if (!QUIET) console.log(body.split('\n').slice(0, show).join('\n'));
  if (r.isError || r.error) note(`${name} failed: ${body.split('\n')[0]}`);
  return body;
}

// --- the session ------------------------------------------------------------

const mcp = createMcpClient({ createdAt: FIXED_CREATED_AT });
await mcp.init();

// 1. Orient. An agent that skips this is guessing at the grammar.
const help = await mcp.call('turtlepen_help');
if (!QUIET) console.log('1. read turtlepen_help —', help.text.length, 'chars of grammar, lattice and rules');
step = 1;

await act(mcp, 'start a diagram', 'new_diagram', { name: 'checkout service', path: 'diagrams/agent-session.turtlepen.json', cols: 140, rows: 80 }, { show: 3 });

// 2. Measure every label BEFORE choosing any size. This is the whole thesis.
const NODES = [
  { id: 'client', label: 'Web & Mobile Clients' },
  { id: 'gateway', label: 'API Gateway' },
  { id: 'checkout', label: 'Checkout Orchestrator' },
  { id: 'payments', label: 'Payment Provider Adapter' },
  { id: 'inventory', label: 'Inventory Service' },
  { id: 'ledger', label: 'Postgres Ledger' },
  { id: 'events', label: 'Event Bus' },
];

const WIDTH = 16; // cells, chosen once so the column reads as a column
if (!QUIET) console.log(`\n${'─'.repeat(74)}\n 2. measure all ${NODES.length} labels at ${WIDTH} cells wide\n${'─'.repeat(74)}`);
for (const n of NODES) {
  const m = JSON.parse((await mcp.call('measure', { text: n.label, maxWidthCells: WIDTH })).text);
  n.cellsTall = m.cellsTall;
  n.lines = m.lines;
  if (!QUIET) console.log(`   ${n.id.padEnd(10)} ${String(m.lines)} line(s), ${m.charsPerLine} chars/line -> ${m.cellsTall} cells tall`);
}
const HEIGHT = Math.max(...NODES.map((n) => n.cellsTall));
if (!QUIET) console.log(`   tallest label needs ${HEIGHT} cells — using that for every box so the row reads evenly`);
step = 2;

// 3. Lay out on a grid the agent can compute: two columns, even gutters.
const COL = { left: 'C', right: 'W' };
const positions = {
  client: 'C4', gateway: 'C12', checkout: 'C20', payments: 'W12', inventory: 'W20', ledger: 'W28', events: 'C28',
};

const ops = NODES.map((n) => ({
  op: 'place_box',
  id: n.id,
  at: `${positions[n.id]}.tl`,
  span: { w: WIDTH, h: HEIGHT },
  label: n.label,
  corner: n.id === 'ledger' ? 'indented' : 'rounded',
}));

// 4. Connectors. `pen from <id>.<face>` seats the cursor for us, so no address
//    is computed by hand — the previous run of this session got three of them
//    wrong that way.
ops.push(
  { op: 'pen', id: 'client-gateway', program: 'pen from client.S\ndown align right line to gateway.N arrow' },
  { op: 'pen', id: 'gateway-checkout', program: 'pen from gateway.S\ndown align right line to checkout.N arrow' },
  { op: 'pen', id: 'checkout-events', program: 'pen from checkout.S\ndown align right line to events.N arrow' },
  // checkout and payments are in different columns AND different rows, and
  // inventory sits directly between them, so this needs a real three-leg route:
  // out of checkout, up the gutter between the columns, then into payments.
  {
    op: 'pen',
    id: 'checkout-payments',
    program: `
      pen from checkout.E
      right 1 line                        # into the gutter, clear of inventory
      right corner align left top
      up line to payments.W               # climb until level with payments
      up corner align bottom right
      right line to payments.W arrow      # and in
    `,
  },
  { op: 'pen', id: 'payments-inventory', program: 'pen from payments.S\ndown align right line to inventory.N arrow' },
  { op: 'pen', id: 'inventory-ledger', program: 'pen from inventory.S\ndown align right line to ledger.N arrow' },
);

const rehearsal = await act(mcp, 'rehearse the whole composition — nothing written yet', 'plan', { operations: ops }, { show: 40 });
countFindings(rehearsal, 'rehearsal');

const described = await mcp.call('describe');
if (JSON.parse(described.text)[0].elements.length !== 0) note('plan wrote to the live document');

// 5. Commit, then annotate on an overlay page.
await act(mcp, 'commit the composition', 'plan', { operations: ops, commit: true }, { show: 3 });

await act(mcp, 'add a review layer', 'add_page', { id: 'review', z: 1, intent: 'overlay' }, { show: 2 });
await act(mcp, 'place a legible review callout above the affected node', 'place_box',
  { id: 'slow', page: 'review', at: 'I16.tl', span: { w: 10, h: 3 }, label: 'p95 4.2s', corner: 'chamfered' }, { show: 3 });
await act(mcp, 'mark the node edge on the overlay without covering its label', 'pen',
  { id: 'slow-marker', page: 'review', program: 'pen R20.q1\ndot', role: 'artwork' }, { show: 3 });

const final = await act(mcp, 'validate the finished diagram', 'validate', {}, { show: 30 });
countFindings(final, 'final');

await act(mcp, 'render', 'render', { path: 'diagrams/agent-session.svg' }, { show: 2 });
if (!QUIET) console.log(`\n${(await mcp.call('ascii', { page: 'base', withFindings: true })).text}`);

await mcp.close();

/** Anything above INFO in a diagram the agent believes is correct is friction. */
function countFindings(log, phase) {
  const m = /\((\d+) critical, (\d+) error, (\d+) warn, (\d+) info\)/.exec(log);
  if (!m) return note(`could not read the ${phase} summary`);
  const [, crit, err, warn] = m.map(Number);
  if (crit || err || warn) {
    note(`${phase}: ${crit} critical, ${err} error, ${warn} warn — an agent following the documented path should produce none`);
  }
}

// --- verdict ----------------------------------------------------------------

console.log(`\n${'═'.repeat(74)}`);
if (friction.length) {
  console.log(`friction encountered: ${friction.length}`);
  friction.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
} else {
  console.log('no friction: the session ran clean');
}
console.log('═'.repeat(74));
process.exitCode = friction.length ? 1 : 0;
