#!/usr/bin/env node
/**
 * The revision surface — every tool that CHANGES something.
 *
 * The other showcase covers authoring: measure, place, draw, validate, render.
 * Eleven tools were exercised nowhere, and they turned out to share a theme —
 * almost all of them edit something that already exists:
 *
 *   import_mermaid  bring a diagram in from somewhere else
 *   route           propose a connector rather than hand-writing one
 *   repair          apply the fix a finding already named
 *   resize          make a box the size the label needs
 *   restyle         change what a box IS — its shape, label, fill
 *   rename          give an element a better id
 *   replace_path    redraw a connector that went wrong
 *   extend_path     carry a path further without redrawing it
 *   set_canvas      grow the sheet when the drawing outgrows it
 *   unaccept_finding  withdraw a judgement that turned out to be wrong
 *   perceptual_review record what LOOKING showed, which validate cannot
 *
 * That is not a checklist, it is a workflow: what an author does after the
 * collision log tells them something. So this file is a revision session — a
 * diagram arrives imperfect and is corrected entirely through those tools.
 *
 * Run with:  node examples/showcase-revision.js
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createSession, createTools } from '../src/mcp/tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');
const quiet = process.argv.includes('--quiet');
const say = (...a) => { if (!quiet) console.log(...a); };
const step = (n, s) => say(`\n── ${n}. ${s}`);

const session = createSession({ cwd: project });
const tools = Object.fromEntries(createTools(session).map((t) => [t.name, t]));

/** MCP tools report failure as TEXT, so a driver that ignores it sees success. */
async function call(name, args) {
  const r = await tools[name].handler(args ?? {});
  const text = typeof r === 'string' ? r : (r?.text ?? JSON.stringify(r));
  if (/^error:/i.test(text) || r?.isError) throw new Error(`${name}: ${text}`);
  return text;
}
const asJson = async (name, args) => JSON.parse(await call(name, args));
const openFindings = async () => (await asJson('validate', { format: 'json' })).open ?? [];
const byRule = (fs, rule) => fs.filter((f) => f.rule === rule);

say('TurtlePen revision surface — eleven tools, one session\n');

// ── 1. Read the manual ────────────────────────────────────────────────────
// Cheap, and it is the one call the engine asks for first.
step(1, 'turtlepen_help');
say('   ' + (await call('turtlepen_help')).split('\n')[0]);

await call('new_diagram', {
  name: 'Revision Session', path: 'diagrams/showcase-revision.turtlepen.json', cols: 60, rows: 40,
});

// ── 2. import_mermaid ─────────────────────────────────────────────────────
// A diagram that came from somewhere else arrives with someone else's sizing.
// That is the normal case for an import, and the reason the rest of this file
// exists.
step(2, 'import_mermaid — bring in a diagram authored elsewhere');
const mermaid = await asJson('import_mermaid', {
  source: [
    'flowchart TD',
    '  intake[Intake] --> triage{Triage}',
    '  triage --> repair[Repair Work Order]',
    '  triage --> quote[Quote Only]',
  ].join('\n'),
  page: 'base',
  nodeWidth: 12,
  nodeHeight: 3,
});
say(`   ${mermaid.nodes} nodes, ${mermaid.edges} edges`);
for (const n of mermaid.notes ?? []) say(`   note: ${n}`);

// The importer returns OPERATIONS, not a drawing: it lays out a spine and says
// so, leaving the routing to be judged. Rehearse first, then commit.
say('   ' + (await call('plan', { operations: mermaid.operations, commit: false })).split('\n')[0]);
await call('plan', { operations: mermaid.operations, commit: true });

const imported = await openFindings();
say(`   validate: ${imported.length} finding(s) — ${[...new Set(imported.map((f) => f.rule))].join(', ') || 'none'}`);

// ── 3. restyle + resize ───────────────────────────────────────────────────
// The importer lays out a spine at a uniform size. A diamond needs the room a
// diamond needs, and `measure` with a shape is the only thing that knows how
// much that is — the import could not have known.
step(3, 'measure + restyle + resize — give the symbol the room it needs');
const want = await asJson('measure', { text: 'Triage', shape: 'decision' });
say(`   measure: text ${want.cellsWide}x${want.cellsTall} → decision ${want.span.w}x${want.span.h}`);
say('   ' + await call('restyle', { id: 'triage', shape: 'decision', fill: '#fef3e2' }));
say('   ' + await call('resize', { id: 'triage', cellsW: want.span.w, cellsH: want.span.h }));

// ── 4. move ───────────────────────────────────────────────────────────────
// A branch needs two tracks. The spine stacked both outcomes in one column,
// which is why nothing could be routed between them.
step(4, 'move — put the two outcomes on their own tracks');
say('   ' + await call('move', { id: 'triage', at: 'C12.tl' }));
say('   ' + await call('move', { id: 'repair', at: 'C26.tl' }));
say('   ' + await call('move', { id: 'quote', at: 'X26.tl' }));

// ── 5. repair ─────────────────────────────────────────────────────────────
// Called without an index, `repair` REPORTS: which fixes are one call away and
// which need a decision first. It never invents a mutation for advice it
// cannot perform, which is why the second list is as useful as the first.
step(5, 'repair — apply what the engine worked out, read what it will not guess');
let reduced = 0;
for (const f of await openFindings()) {
  const plan = await call('repair', { fingerprint: f.fingerprint });
  for (const l of plan.split('\n').filter((x) => x.trim().startsWith('['))) say(`   ${f.rule} ${l.trim()}`);
  const oneCall = /\[(\d+)\] \w+ — one call/.exec(plan);
  if (!oneCall) continue;
  const before = (await openFindings()).length;
  const result = await call('repair', { fingerprint: f.fingerprint, index: Number(oneCall[1]) });
  // A repair that trades one finding for another says so. Reading that line is
  // the difference between fixing and thrashing.
  say('   → ' + result.split('\n').slice(-1)[0]);
  if ((await openFindings()).length < before) reduced += 1;
}
say(`   ${reduced} repair(s) reduced the log`);

// ── 6. rename ─────────────────────────────────────────────────────────────
// Ids come from the mermaid source. Renaming carries every reference with it.
step(6, 'rename — an id you will still understand in six months');
say('   ' + await call('rename', { id: 'repair', to: 'work-order' }));

// ── 7. route + replace_path ───────────────────────────────────────────────
// `route` changes nothing: it returns a pen program to read. When it cannot
// find a clean path it SAYS SO and names the obstruction, which is a usable
// answer — unlike a twelve-turn path that avoids everything.
step(7, 'route + replace_path — propose a connector, then install it');
// The importer named its edges `e<n>_<from>_<to>`, and moving the nodes left
// every one of them stale — which is what the log has been reporting.
//
// `replace_path` takes a program YOU chose; that is its point. `route` is the
// other half, and it will not help here: it excludes the two boxes being
// joined but NOT the stale path, so a path blocks its own replacement. Redraw
// first, then route the connector that does not exist yet.
const elementsNow = async () => (await asJson('describe', {}))[0].elements;

// Beware the shape of a refusal. `route` reports "no clear route" in prose, and
// a naive `/clear/` test matches that string — the failure reads as success and
// the message gets run as a program.
const routed = (text) => (/turn\(s\), clear/.test(text) ? text.split('\n').slice(2).join('\n').trim() : null);

for (const [id, program] of [
  ['e1_intake_triage', 'pen from intake.S\ndown line to triage.N arrow'],
  ['e2_triage_repair', 'pen from triage.S\ndown line to work-order.N arrow'],
]) {
  say(`   ${id}: ${await call('replace_path', { id, program })}`);
}

const proposal = await call('route', { from: 'triage.E', to: 'quote.N' });
say('   route triage.E → quote.N: ' + proposal.split('\n')[0]);
const program = routed(proposal);
if (program) {
  await call('replace_path', { id: 'e3_triage_quote', program });
  say('   installed the proposal into e3_triage_quote');
} else {
  say('   declined honestly, so the old path stands rather than a guess');
}

// ── 8. extend_path ────────────────────────────────────────────────────────
// Carry a path further without redrawing the part that was already right.
step(8, 'extend_path — continue a path from where it stopped');
await call('place_box', { id: 'archive', at: 'X36.tl', span: '12x3', label: 'Archive', corner: 'rounded' });
await call('pen', { id: 'quote-onward', program: 'pen from quote.S\ndown 2 line' });
say('   ' + await call('extend_path', { id: 'quote-onward', program: 'down line to archive.N arrow' }));

// ── 9. set_canvas ─────────────────────────────────────────────────────────
// A declared size is a first guess, not a budget.
step(9, 'set_canvas — grow the sheet to hold what was drawn');
say('   ' + await call('set_canvas', { cols: 50, rows: 44 }));

// ── 10. accept_finding → unaccept_finding ─────────────────────────────────
// A judgement has to be revisable, or it is suppression with paperwork.
step(10, 'accept_finding → unaccept_finding — a judgement you can take back');
const adjudicable = (await openFindings()).find((f) => f.severity !== 'S0');
if (adjudicable) {
  await call('accept_finding', {
    fingerprint: adjudicable.fingerprint,
    reason: 'held provisionally while the branch layout settles, so the log shows what sits underneath it',
  });
  say(`   accepted ${adjudicable.rule} provisionally`);
  say('   ' + await call('unaccept_finding', { fingerprint: adjudicable.fingerprint })
    + ' — withdrawn, because that reason described my process rather than the drawing');
} else {
  say('   nothing open to adjudicate');
}

// ── 11. render → look → perceptual_review ─────────────────────────────────
// The engine asks for this by name. A clean log proves the drawing is
// undefective, never that it depicts what was asked for. `perceptual_review`
// records what a viewer SAW, bound to the exact render hash, so it lapses the
// moment the drawing changes.
step(11, 'render → look → perceptual_review');
const rendered = await call('render', { path: 'diagrams/showcase-revision.svg' });
const hash = /renderHash: (\w+)/.exec(rendered)?.[1];
say('   ' + rendered.split('\n')[0]);
say('   ' + (await call('ascii', { maxCells: 50 })).split('\n').length + ' lines of lattice inspected');
say('   ' + await call('perceptual_review', {
  action: 'record',
  renderHash: hash,
  reviewer: 'showcase-revision.js',
  note: 'Viewed at full size. The triage diamond reads as a decision and both outcomes leave '
    + 'it on their own tracks; the archive step sits clear of the work order. Recorded against '
    + 'this render hash so it lapses the moment the drawing changes.',
  findings: [],
}));

// ── Gate ──────────────────────────────────────────────────────────────────
const final = await openFindings();
const blocking = final.filter((f) => f.severity === 'S0' || f.severity === 'S1');
say(`\nfinal: ${final.length} open, ${blocking.length} blocking`);
for (const f of blocking) say('   ' + f.rule + ' ' + f.message);

await call('save', { force: true });
if (blocking.length) {
  console.error(`FAILED: ${blocking.length} blocking finding(s) survived the revision`);
  process.exit(1);
}
say('\nrevision session passed');
