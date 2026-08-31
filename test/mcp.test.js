/**
 * Tests for the MCP layer.
 *
 * These exist partly to assert behaviour and partly because the core tests
 * never import the server modules — so a syntax error in the tool definitions
 * used to pass a fully green suite and only surface when an agent connected.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { createSession, createTools } from '../src/mcp/tools.js';
import * as core from '../src/core/index.js';
import { VERSION } from '../src/version.js';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(here, '../src/mcp/server.js');

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

test('the tool module loads and every tool is well formed', () => {
  const tools = createTools(createSession());
  assert.ok(tools.length > 0, 'the live tool registry is not empty');
  for (const t of tools) {
    assert.match(t.name, /^[a-z_]+$/, `bad tool name "${t.name}"`);
    assert.ok(t.description.length > 30, `${t.name} needs a real description`);
    assert.equal(t.inputSchema.type, 'object', `${t.name} schema`);
    assert.equal(typeof t.handler, 'function', `${t.name} handler`);
  }
  assert.equal(new Set(tools.map((t) => t.name)).size, tools.length, 'names are unique');
});

test('every core operation has a matching tool, so a plan can be built by hand', () => {
  const names = new Set(createTools(createSession()).map((t) => t.name));
  for (const op of Object.keys(core.OPERATIONS)) {
    assert.ok(names.has(op), `operation "${op}" has no tool of the same name`);
  }
});

/**
 * The other direction, and the one that actually rotted: `plan` used to
 * describe its batch vocabulary with a hand-written list, which silently went
 * stale and left `wireframe`, `perspective_scene` and `perceptual_review`
 * dispatchable but undiscoverable to any client reading the schema.
 */
test('the plan schema advertises exactly the operations it dispatches', () => {
  const plan = createTools(createSession()).find((t) => t.name === 'plan');
  const advertised = plan.inputSchema.properties.operations.description
    .match(/vocabulary is exactly: (.+)\.$/)?.[1]
    ?.split(' ') ?? [];
  assert.deepEqual(
    [...advertised].sort(),
    Object.keys(core.OPERATIONS).sort(),
    'the advertised plan vocabulary drifted from core.OPERATIONS',
  );
});

test('runtime diagnostics report the one package version and live capability fingerprint', async () => {
  const tools = createTools(createSession());
  const info = JSON.parse(await tools.find((tool) => tool.name === 'runtime_info').handler({}));
  assert.equal(info.version, VERSION);
  assert.equal(info.schemaVersion, 3);
  assert.equal(info.toolCount, tools.length);
  assert.match(info.capabilityFingerprint, /^[0-9a-f]{16}$/);
  assert.equal(info.activeDocument, null);
});

test('runtime schemas refuse unknown direct fields and name their exact location', () => {
  const help = createTools(createSession()).find((tool) => tool.name === 'turtlepen_help');
  assert.throws(() => help.handler({ surprise: true }), /turtlepen_help\.arguments\.surprise: is not allowed/);
});

test('plan validates nested operation arguments against the same tool schema', () => {
  const session = createSession();
  session.doc = core.createDocument({ name: 'nested-schema' });
  const plan = createTools(session).find((tool) => tool.name === 'plan');
  assert.throws(
    () => plan.handler({ operations: [{ op: 'set_canvas', cols: 20, rows: 10, typo: true }] }),
    /plan\.operations\[0\]\.typo: is not allowed/,
  );
});

test('plan JSON exposes an approval diff and rehearsal never mutates', async () => {
  const session = createSession();
  session.doc = core.createDocument({ name: 'plan diff' });
  core.placeBox(session.doc, 'base', { id: 'node', at: 'C4.tl', span: { w: 4, h: 2 } });
  const before = core.serialize(session.doc);
  const plan = createTools(session).find((tool) => tool.name === 'plan');
  const rehearsed = JSON.parse(await plan.handler({
    operations: [{ op: 'move', id: 'node', cellsX: 2 }], format: 'json',
  }));
  assert.equal(rehearsed.ok, true);
  assert.equal(rehearsed.committed, false);
  assert.deepEqual(rehearsed.diff.elements.changed, ['node']);
  assert.equal(core.serialize(session.doc), before, 'rehearsal stays non-mutating');
  const committed = JSON.parse(await plan.handler({
    operations: [{ op: 'move', id: 'node', cellsX: 2 }], commit: true, format: 'json',
  }));
  assert.equal(committed.committed, true);
  assert.notEqual(core.serialize(session.doc), before);
});

test('tools that need a document say so instead of throwing something cryptic', async () => {
  const tools = createTools(createSession());
  const validate = tools.find((t) => t.name === 'validate');
  await assert.rejects(async () => validate.handler({}), /no diagram is open/);
});

test('measure, place_box, describe, and validate agree on subprocess label fit', async () => {
  const session = createSession();
  session.doc = core.createDocument({ name: 'subprocess-contract' });
  const tools = new Map(createTools(session).map((tool) => [tool.name, tool]));
  const label = 'createTools(session)';

  const measured = JSON.parse(await tools.get('measure').handler({ text: label, shape: 'subprocess' }));
  assert.deepEqual(measured.span, { w: 14, h: 3 });
  assert.match(measured.shapeNote, /exact label aperture/);

  const badPlacement = await tools.get('place_box').handler({
    id: 'too-small', at: 'C4.tl', span: { w: 13, h: 3 }, label, shape: 'subprocess',
  });
  assert.match(badPlacement, /label fit: OVERFLOW/);
  assert.match(badPlacement, /widen box to 14 cells/);
  assert.doesNotMatch(badPlacement, /widen box to 13 cells/);
  const described = JSON.parse(await tools.get('describe').handler({}));
  assert.equal(described[0].elements.find((element) => element.id === 'too-small').fit.fits, false);

  const goodPlacement = await tools.get('place_box').handler({
    id: 'measured', at: 'C10.tl', span: measured.span, label, shape: 'subprocess',
  });
  assert.match(goodPlacement, /label fit: OK/);
  const validation = core.validate(session.doc);
  assert.equal(
    validation.open.some((finding) => ['L002', 'L003'].includes(finding.rule) && finding.actors.includes('measured')),
    false,
  );
});

test('the validate tool surfaces composition findings to the agent', async () => {
  // An INFO finding the tool layer filters out cannot change any model's behaviour,
  // which would defeat the point of having it. Drive the real handler, not core.validate.
  // Write into a temp dir, never the repo — a relative path here lands in the
  // project root and gets committed by accident.
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  const tools = createTools(createSession({ cwd: dir }));
  await tools.find((t) => t.name === 'new_diagram').handler({
    name: 'sparse', path: resolve(dir, 'sparse.turtlepen.json'), cols: 40, rows: 20,
  });

  const validate = tools.find((t) => t.name === 'validate');
  const asJson = JSON.parse(await validate.handler({ format: 'json' }));
  const c001 = asJson.open.find((f) => f.rule === 'C001');

  assert.ok(c001, 'a near-empty diagram must reach the agent as C001');
  assert.equal(c001.severity, 'S3');
  assert.ok(c001.message.length > 0, 'every finding must carry a message an agent can act on');

  const asLog = await validate.handler({});
  assert.match(asLog, /C001/, 'the human-readable log must mention it too');

  await rm(dir, { recursive: true, force: true });
});

test('help documents the lattice, the grammar and every rule', () => {
  const tools = createTools(createSession());
  const help = tools.find((t) => t.name === 'turtlepen_help').handler({ section: 'all' });
  for (const needle of ['PEN GRAMMAR', 'scope="stack"', 'searched_pages', 'REGIONAL DESCRIPTION', 'exact claimed', 'LATTICE-NATIVE EDITING', 'boolean', 'stroke_to_path', 'STRICT SVG IMPORT', 'inspect_svg', 'quantize:"nearest"', 'DIMENSIONED COMPOSITIONS', 'stale geometry is refused by name', 'HISTORY AND RECOVERY', 'exact document hash', 'new edit after undo clears redo', 'GROUPS AND FOLLOW RELATIONSHIPS', 'cycles are refused', 'explicit constraint', 'S#2', 'align', 'hop', 'arrow', 'EVERY FIX HAS A TOOL', 'L001', 'L015', 'L021']) {
    assert.ok(help.includes(needle), `help is missing "${needle}"`);
  }
});

// ---------------------------------------------------------------------------
// The server, over a real pipe
// ---------------------------------------------------------------------------

/** Drive the real server over stdio and collect its replies. */
function rpc(messages, cwd, { env = {} } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`server exited ${code}: ${err}`));
      try {
        resolvePromise(out.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
      } catch (e) {
        reject(new Error(`unparseable output: ${e.message}\n${out}`));
      }
    });
    for (const m of messages) child.stdin.write(`${typeof m === 'string' ? m : JSON.stringify(m)}\n`);
    child.stdin.end();
  });
}

const call = (id, name, args = {}) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const textOf = (replies, id) => replies.find((r) => r.id === id).result.content[0].text;

test('the JSON-RPC method and notification contract is complete over stdio', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-protocol-'));
  try {
    const replies = await rpc([
      '{not valid json',
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 'unsupported-version', capabilities: {} } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 91 } },
      { jsonrpc: '2.0', id: 2, method: 'ping' },
      { jsonrpc: '2.0', id: 3, method: 'tools/list' },
      { jsonrpc: '2.0', method: 'unknown/notification' },
      { jsonrpc: '2.0', id: 4, method: 'unknown/request' },
    ], dir);

    assert.equal(replies.length, 5, 'notifications must not receive JSON-RPC replies');
    assert.equal(replies.find((reply) => reply.id === null).error.code, -32700);
    assert.equal(replies.find((reply) => reply.id === 1).result.protocolVersion, '2025-06-18',
      'an unsupported protocol version falls back to the current supported version');
    assert.deepEqual(replies.find((reply) => reply.id === 2).result, {});

    const liveNames = createTools(createSession()).map((tool) => tool.name).sort();
    const listedNames = replies.find((reply) => reply.id === 3).result.tools.map((tool) => tool.name).sort();
    assert.deepEqual(listedNames, liveNames);
    assert.equal(replies.find((reply) => reply.id === 4).error.code, -32601);
    for (const reply of replies) assert.equal(reply.jsonrpc, '2.0');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the server accepts an injected creation time for reproducible builds', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  const createdAt = '2026-08-10T13:29:24.372Z';
  try {
    await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'new_diagram', { name: 'reproducible', path: 'd.turtlepen.json' }),
      ],
      dir,
      { env: { TURTLEPEN_CREATED_AT: createdAt } },
    );
    const saved = JSON.parse(await readFile(resolve(dir, 'd.turtlepen.json'), 'utf8'));
    assert.equal(saved.createdAt, createdAt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the server initializes, lists tools, and answers calls in order', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    const replies = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        call(3, 'new_diagram', { name: 'rpc', path: 'd.turtlepen.json' }),
        call(4, 'pen', { program: 'pen B5 bl\nup 1 align right line\nup indented corner align right bottom\nright 2 align bottom line', id: 'demo' }),
        call(5, 'validate', {}),
        call(6, 'nope', {}),
      ],
      dir,
    );

    assert.equal(replies.find((r) => r.id === 1).result.serverInfo.name, 'turtlepen');
    assert.ok(replies.find((r) => r.id === 2).result.tools.length >= 20);

    // Async handlers must still have replied before the process exited.
    assert.match(textOf(replies, 3), /created "rpc"/);
    assert.match(textOf(replies, 4), /path "demo": 7 quadrant\(s\)/);
    assert.match(textOf(replies, 5), /collision log/);
    assert.equal(replies.find((r) => r.id === 6).error.code, -32602, 'unknown tool is a protocol error');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('overlay text occlusion reaches the agent over the real wire', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    const replies = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'new_diagram', { name: 'occlusion', path: 'd.turtlepen.json' }),
        call(3, 'place_box', { id: 'checkout', at: 'C4.tl', span: { w: 16, h: 3 }, label: 'Checkout Orchestrator' }),
        call(4, 'add_page', { id: 'review', z: 1, intent: 'overlay' }),
        call(5, 'place_box', { id: 'slow', page: 'review', at: 'E4.tl', span: { w: 10, h: 3 }, label: 'p95 4.2s' }),
        call(6, 'validate', {}),
      ],
      dir,
    );
    assert.match(textOf(replies, 6), /L021 overlay obscures text/);
    assert.match(textOf(replies, 6), /status: FAIL/);
    assert.match(textOf(replies, 6), /move "slow" clear of the text in "checkout"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('free_space defaults to the whole stack and exposes a page-only override over the real wire', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    const replies = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'new_diagram', { name: 'stack space', path: 'd.turtlepen.json', cols: 40, rows: 20 }),
        call(3, 'place_box', { id: 'base-blocker', at: 'C4.tl', span: { w: 6, h: 3 } }),
        call(4, 'add_page', { id: 'future', z: 1, intent: 'exclusive' }),
        call(5, 'free_space', { page: 'future', cellsW: 6, cellsH: 3, region: 'C4:H6' }),
        call(6, 'free_space', { page: 'future', scope: 'page', cellsW: 6, cellsH: 3, region: 'C4:H6' }),
        call(7, 'free_space', { page: 'future', cellsW: 6 }),
      ],
      dir,
    );
    const stack = JSON.parse(textOf(replies, 5));
    const page = JSON.parse(textOf(replies, 6));

    assert.equal(stack.fits, false, 'the lower exclusive page blocks the default stack search');
    assert.equal(stack.scope, 'stack');
    assert.deepEqual(stack.searched_pages, ['base', 'future']);
    assert.equal(page.fits, true, 'page scope preserves the intentional single-page search');
    assert.equal(page.scope, 'page');
    assert.deepEqual(page.searched_pages, ['future']);
    const incomplete = replies.find((reply) => reply.id === 7).result;
    assert.equal(incomplete.isError, true);
    assert.match(incomplete.content[0].text, /needs cellsW and cellsH together/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('describe filters by exact region over the real wire without path bounding-box false positives', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    const replies = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'new_diagram', { name: 'regional describe', path: 'd.turtlepen.json', cols: 40, rows: 30 }),
        call(3, 'place_box', { id: 'near', at: 'C4.tl', span: { w: 4, h: 2 } }),
        call(4, 'place_box', { id: 'far', at: 'W4.tl', span: { w: 4, h: 2 } }),
        call(5, 'pen', { id: 'elbow', role: 'artwork', program: 'pen C10.q1\nright 10 line\nright corner align left bottom\ndown 10 line' }),
        call(6, 'describe', { region: 'C4:F5' }),
        call(7, 'describe', { region: 'C15:F17' }),
        call(8, 'describe', { page: 'missing', region: 'C4:F5' }),
        call(9, 'describe', { region: 'F5:C4' }),
      ],
      dir,
    );
    const near = JSON.parse(textOf(replies, 6));
    const emptyInsideElbowBounds = JSON.parse(textOf(replies, 7));

    assert.deepEqual(near[0].elements.map((element) => element.id), ['near']);
    assert.deepEqual(near[0].filter, { region: 'C4:F5', cells: { w: 4, h: 2 } });
    assert.deepEqual(emptyInsideElbowBounds[0].elements, [], 'an empty part of an L-path bounding box is not a hit');
    const missing = replies.find((reply) => reply.id === 8).result;
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /no such page "missing"/);
    assert.deepEqual(JSON.parse(textOf(replies, 9))[0].filter, near[0].filter, 'reversed corners normalize to one effective region');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a saved wireframe can still export its composition prompt after reopen', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    const replies = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'new_diagram', { name: 'persistent wireframe', path: 'd.turtlepen.json', cols: 60, rows: 40 }),
        call(3, 'wireframe', {
          widthIn: 120,
          depthIn: 96,
          scale: 2,
          clearance: false,
          items: [{
            id: 'condenser', widthIn: 30, depthIn: 30, atXIn: 48, atYIn: 36,
            describe: 'outdoor condensing unit',
          }],
          runs: [{
            id: 'lineset', kind: 'lineset',
            waypoints: [{ xIn: 0, yIn: 12 }, { xIn: 48, yIn: 12 }, { xIn: 48, yIn: 36 }],
          }],
        }),
        call(4, 'open_diagram', { path: 'd.turtlepen.json' }),
        call(5, 'export_prompt', { subject: 'HVAC equipment layout' }),
        call(6, 'move', { id: 'condenser', cellsX: 1 }),
        call(7, 'export_prompt', { subject: 'stale layout' }),
        call(8, 'history', { action: 'undo' }),
        call(9, 'export_prompt', { subject: 'restored layout' }),
      ],
      dir,
    );

    assert.equal(replies.find((reply) => reply.id === 5).result.isError, undefined, textOf(replies, 5));
    assert.match(textOf(replies, 5), /HVAC equipment layout/);
    assert.match(textOf(replies, 5), /outdoor condensing unit/);
    assert.match(textOf(replies, 5), /RUNS[\s\S]*lineset/);
    assert.equal(replies.find((reply) => reply.id === 7).result.isError, true);
    assert.match(textOf(replies, 7), /wireframe source is stale at "condenser"/);
    assert.match(textOf(replies, 9), /restored layout/, 'undo restores source and generated geometry together');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('history undoes and redoes successful edits over the real wire', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    const replies = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'new_diagram', { name: 'recoverable edits', path: 'd.turtlepen.json' }),
        call(3, 'place_box', { id: 'unit', at: 'C4.tl', span: { w: 6, h: 3 } }),
        call(4, 'move', { id: 'unit', at: 'M20.tl' }),
        call(5, 'history', { action: 'status' }),
        call(6, 'history', { action: 'undo' }),
        call(7, 'describe', {}),
        call(8, 'history', { action: 'redo' }),
        call(9, 'describe', {}),
      ],
      dir,
    );

    const status = JSON.parse(textOf(replies, 5));
    assert.equal(status.undo_available, 2);
    assert.equal(status.next_undo, 'move "unit"');
    assert.equal(JSON.parse(textOf(replies, 7))[0].elements[0].at, 'C4.q1');
    assert.equal(JSON.parse(textOf(replies, 9))[0].elements[0].at, 'M20.q1');

    const saved = JSON.parse(await readFile(resolve(dir, 'd.turtlepen.json'), 'utf8'));
    assert.equal(saved.elements.base[0].rect.x, 24, 'redo is checkpointed, not only changed in memory');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('failed and no-op mutations do not consume history or destroy redo', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    const replies = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'new_diagram', { name: 'honest history', path: 'd.turtlepen.json' }),
        call(3, 'place_box', { id: 'unit', at: 'C4.tl', span: { w: 6, h: 3 } }),
        call(4, 'history', { action: 'undo' }),
        call(5, 'move', { id: 'missing', cellsX: 2 }),
        call(6, 'unaccept_finding', { fingerprint: 'not-recorded' }),
        call(7, 'history', { action: 'status' }),
        call(8, 'history', { action: 'redo' }),
        call(9, 'place_box', { id: 'other', at: 'M4.tl', span: { w: 4, h: 2 } }),
        call(10, 'history', { action: 'status' }),
      ],
      dir,
    );

    assert.equal(replies.find((reply) => reply.id === 5).result.isError, true);
    const beforeRedo = JSON.parse(textOf(replies, 7));
    assert.equal(beforeRedo.undo_available, 0);
    assert.equal(beforeRedo.redo_available, 1, 'a rejected edit must preserve the recovery route');
    const afterDivergence = JSON.parse(textOf(replies, 10));
    assert.equal(afterDivergence.redo_available, 0, 'a new successful edit invalidates the old future');
    assert.equal(afterDivergence.undo_available, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('history rolls back a partially applied composite mutation in memory and on disk', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    const replies = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'new_diagram', { name: 'composite rollback', path: 'd.turtlepen.json', cols: 80, rows: 50 }),
        call(3, 'place_box', { id: 'seed', at: 'C4.tl', span: { w: 6, h: 3 } }),
        call(4, 'perspective_scene', {
          roomIn: { widthIn: 120, depthIn: 96, heightIn: 96 },
          eyeIn: { x: 60, y: 66, z: -48 },
          targetIn: { x: 60, y: 48, z: 48 },
          items: [
            { id: 'duplicate', xIn: 24, yIn: 0, zIn: 24, widthIn: 24, heightIn: 36, depthIn: 18 },
            { id: 'duplicate', xIn: 72, yIn: 0, zIn: 24, widthIn: 24, heightIn: 36, depthIn: 18 },
          ],
        }),
        call(5, 'describe', {}),
        call(6, 'history', { action: 'status' }),
        call(7, 'history', { action: 'sideways' }),
      ],
      dir,
    );

    assert.equal(replies.find((reply) => reply.id === 4).result.isError, true);
    assert.deepEqual(JSON.parse(textOf(replies, 5))[0].elements.map((element) => element.id), ['seed']);
    assert.equal(JSON.parse(textOf(replies, 6)).undo_available, 1);
    assert.equal(replies.find((reply) => reply.id === 7).result.isError, true);
    assert.match(textOf(replies, 7), /status, undo, redo, or clear/);

    const saved = JSON.parse(await readFile(resolve(dir, 'd.turtlepen.json'), 'utf8'));
    assert.deepEqual(saved.elements.base.map((element) => element.id), ['seed'], 'the autosave matches the rolled-back live document');
    assert.equal(saved.perspective_scene, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('history honors a configured retention bound and reports exhaustion honestly', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    const messages = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
      call(2, 'new_diagram', { name: 'bounded history', path: 'd.turtlepen.json' }),
      call(3, 'place_box', { id: 'unit', at: 'C4.tl', span: { w: 4, h: 2 } }),
      ...Array.from({ length: 22 }, (_, index) => call(4 + index, 'move', { id: 'unit', cellsX: 1 })),
      call(26, 'history', { action: 'status' }),
      ...Array.from({ length: 20 }, (_, index) => call(27 + index, 'history', { action: 'undo' })),
      call(47, 'history', { action: 'undo' }),
      call(48, 'describe', {}),
    ];
    const replies = await rpc(messages, dir, { env: { TURTLEPEN_HISTORY_LIMIT: '20' } });

    assert.equal(JSON.parse(textOf(replies, 26)).undo_available, 20);
    assert.equal(replies.find((reply) => reply.id === 47).result.isError, true);
    assert.match(textOf(replies, 47), /nothing to undo/);
    assert.equal(JSON.parse(textOf(replies, 48))[0].elements[0].at, 'E4.q1', 'the two evicted oldest moves remain applied');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('undo and redo history survive reopen and separate MCP server processes', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'new_diagram', { name: 'restart history', path: 'd.turtlepen.json' }),
        call(3, 'place_box', { id: 'unit', at: 'C4.tl', span: { w: 4, h: 2 } }),
        call(4, 'move', { id: 'unit', cellsX: 5, cellsY: 2 }),
      ],
      dir,
    );

    const afterRestart = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'open_diagram', { path: 'd.turtlepen.json' }),
        call(3, 'history', { action: 'status' }),
        call(4, 'history', { action: 'undo' }),
        call(5, 'describe', {}),
      ],
      dir,
    );
    const restored = JSON.parse(textOf(afterRestart, 3));
    assert.equal(restored.undo_available, 2);
    assert.equal(restored.limit, 100);
    assert.match(restored.persistence, /restored 2 undo/);
    assert.equal(JSON.parse(textOf(afterRestart, 5))[0].elements[0].at, 'C4.q1');

    const afterSecondRestart = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'open_diagram', { path: 'd.turtlepen.json' }),
        call(3, 'history', { action: 'status' }),
        call(4, 'history', { action: 'redo' }),
        call(5, 'describe', {}),
      ],
      dir,
    );
    assert.equal(JSON.parse(textOf(afterSecondRestart, 3)).redo_available, 1);
    assert.equal(JSON.parse(textOf(afterSecondRestart, 5))[0].elements[0].at, 'H6.q1');

    const sidecar = JSON.parse(await readFile(resolve(dir, 'd.turtlepen.json.history.json'), 'utf8'));
    assert.equal(sidecar.schema, 1);
    assert.match(sidecar.currentHash, /^[a-f0-9]{64}$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an externally changed document invalidates its stale history sidecar without applying it', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'new_diagram', { name: 'before external edit', path: 'd.turtlepen.json' }),
        call(3, 'place_box', { id: 'unit', at: 'C4.tl', span: { w: 4, h: 2 } }),
      ],
      dir,
    );
    const path = resolve(dir, 'd.turtlepen.json');
    const external = JSON.parse(await readFile(path, 'utf8'));
    external.name = 'changed outside TurtlePen';
    await writeFile(path, JSON.stringify(external, null, 2), 'utf8');

    const replies = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'open_diagram', { path: 'd.turtlepen.json' }),
        call(3, 'history', { action: 'status' }),
        call(4, 'history', { action: 'undo' }),
      ],
      dir,
    );
    const status = JSON.parse(textOf(replies, 3));
    assert.equal(status.undo_available, 0);
    assert.equal(status.redo_available, 0);
    assert.match(status.persistence, /document content changed outside this history/);
    assert.equal(replies.find((reply) => reply.id === 4).result.isError, true);
    assert.match(textOf(replies, 4), /nothing to undo/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a subsystem group moves atomically, survives reopen, and participates in history over the real wire', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    const replies = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'new_diagram', { name: 'grouped subsystem', path: 'd.turtlepen.json' }),
        call(3, 'plan', {
          commit: true,
          operations: [
            { op: 'place_box', id: 'unit', at: 'C4.tl', span: { w: 4, h: 2 } },
            { op: 'place_box', id: 'disconnect', at: 'M4.tl', span: { w: 4, h: 2 } },
            { op: 'group', action: 'create', id: 'outdoor', label: 'Outdoor assembly', members: ['unit', 'disconnect'] },
          ],
        }),
        call(4, 'group', { action: 'move', id: 'outdoor', cellsX: 3, cellsY: 2 }),
        call(5, 'describe', {}),
        call(6, 'history', { action: 'undo' }),
        call(7, 'describe', {}),
        call(8, 'group', { action: 'add', id: 'outdoor', members: ['missing'] }),
        call(9, 'open_diagram', { path: 'd.turtlepen.json' }),
        call(10, 'group', { action: 'list' }),
      ],
      dir,
    );

    const moved = JSON.parse(textOf(replies, 5))[0];
    assert.equal(moved.elements.find((element) => element.id === 'unit').at, 'F6.q1');
    assert.equal(moved.elements.find((element) => element.id === 'disconnect').at, 'P6.q1');
    assert.deepEqual(moved.groups[0].members, ['unit', 'disconnect']);

    const restored = JSON.parse(textOf(replies, 7))[0];
    assert.equal(restored.elements.find((element) => element.id === 'unit').at, 'C4.q1');
    assert.equal(restored.elements.find((element) => element.id === 'disconnect').at, 'M4.q1');
    assert.equal(replies.find((reply) => reply.id === 8).result.isError, true);
    assert.deepEqual(JSON.parse(textOf(replies, 10))[0].members, ['disconnect', 'unit'], 'serialized members are deterministic');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('durable follow constraints cascade, describe themselves, reject cycles, and survive reopen over the real wire', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    const replies = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'new_diagram', { name: 'constrained subsystem', path: 'd.turtlepen.json' }),
        call(3, 'plan', {
          commit: true,
          operations: [
            { op: 'place_box', id: 'unit', at: 'C4.tl', span: { w: 4, h: 2 } },
            { op: 'place_box', id: 'tag', at: 'M4.tl', span: { w: 2, h: 1 } },
            { op: 'constraint', action: 'create', id: 'tag-follows-unit', dependent: 'tag', target: 'unit' },
          ],
        }),
        call(4, 'move', { id: 'unit', cellsX: 3, cellsY: 2 }),
        call(5, 'describe', {}),
        call(6, 'constraint', { action: 'list' }),
        call(7, 'history', { action: 'undo' }),
        call(8, 'describe', {}),
        call(9, 'constraint', { action: 'create', id: 'cycle', dependent: 'unit', target: 'tag' }),
        call(10, 'open_diagram', { path: 'd.turtlepen.json' }),
        call(11, 'move', { id: 'unit', cellsX: 1 }),
        call(12, 'describe', {}),
        call(13, 'constraint', { action: 'create', id: 'bad-offset', dependent: 'unit', target: 'tag', offsetX: 2 }),
      ],
      dir,
    );

    const moved = JSON.parse(textOf(replies, 5))[0];
    assert.equal(moved.elements.find((element) => element.id === 'unit').at, 'F6.q1');
    assert.equal(moved.elements.find((element) => element.id === 'tag').at, 'P6.q1');
    assert.deepEqual(moved.elements.find((element) => element.id === 'unit').constraints.followedBy, ['tag-follows-unit']);
    assert.deepEqual(moved.elements.find((element) => element.id === 'tag').constraints.follows, ['tag-follows-unit']);
    assert.equal(moved.constraints[0].target.id, 'unit');

    const listed = JSON.parse(textOf(replies, 6));
    assert.equal(listed[0].id, 'tag-follows-unit');
    assert.deepEqual(listed[0].offset.quadrants, { x: 18, y: -1 });

    const restored = JSON.parse(textOf(replies, 8))[0];
    assert.equal(restored.elements.find((element) => element.id === 'unit').at, 'C4.q1');
    assert.equal(restored.elements.find((element) => element.id === 'tag').at, 'M4.q1');
    assert.equal(replies.find((reply) => reply.id === 9).result.isError, true);
    assert.match(textOf(replies, 9), /cycle/);

    const reopenedAndMoved = JSON.parse(textOf(replies, 12))[0];
    assert.equal(reopenedAndMoved.elements.find((element) => element.id === 'unit').at, 'D4.q1');
    assert.equal(reopenedAndMoved.elements.find((element) => element.id === 'tag').at, 'N4.q1');
    assert.equal(replies.find((reply) => reply.id === 13).result.isError, true);
    assert.match(textOf(replies, 13), /both offsetX and offsetY/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('five indexed seats on one face survive a dense real MCP session', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    const boxes = [
      ['worker-a', 'C28.tl'],
      ['worker-b', 'Q28.tl'],
      ['worker-c', 'AE28.tl'],
      ['worker-d', 'AS28.tl'],
      ['worker-e', 'BG28.tl'],
    ];
    const routes = [
      ['route-a', 'hub.S#4', 2, 'left', 'worker-a'],
      ['route-b', 'hub.S#2', 4, 'left', 'worker-b'],
      ['route-e', 'hub.S#5', 6, 'right', 'worker-e'],
      ['route-d', 'hub.S#3', 8, 'right', 'worker-d'],
      ['route-c', 'hub.S#1', 10, 'right', 'worker-c'],
    ];
    const messages = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
      call(2, 'new_diagram', { name: 'constraint stress', path: 'd.turtlepen.json', cols: 80, rows: 40 }),
      call(3, 'place_box', { id: 'hub', at: 'U4.tl', span: { w: 24, h: 5 }, label: 'Dispatch Hub' }),
      ...boxes.map(([id, at], index) => call(4 + index, 'place_box', { id, at, span: { w: 10, h: 3 }, label: id })),
      ...routes.map(([id, from, depth, dirName, target], index) => {
        const firstCorner = dirName === 'left' ? 'top left' : 'top right';
        const secondCorner = dirName === 'left' ? 'right bottom' : 'left bottom';
        const program = [
          `pen from ${from}`,
          `down ${depth} line`,
          `down corner align ${firstCorner}`,
          `${dirName} line to ${target}.N`,
          `${dirName} corner align ${secondCorner}`,
          `down line to ${target}.N arrow`,
        ].join('\n');
        return call(9 + index, 'pen', { id, program });
      }),
      call(14, 'validate', { format: 'json' }),
      call(15, 'describe', {}),
    ];
    const replies = await rpc(messages, dir);
    for (let id = 9; id <= 13; id++) {
      const reply = replies.find((candidate) => candidate.id === id);
      assert.equal(reply.result.isError, undefined, reply.result.content[0].text);
    }
    const validation = JSON.parse(textOf(replies, 14));
    const blockingRules = new Set(['L001', 'L004', 'L006', 'L008', 'L014', 'L015', 'L016']);
    const blocking = validation.open.filter((finding) => blockingRules.has(finding.rule));

    assert.deepEqual(blocking, [], core.formatLog(validation));
    const described = JSON.parse(textOf(replies, 15));
    const hub = described[0].elements.find((element) => element.id === 'hub');
    assert.ok(hub.seatSlots.S >= 5, 'the agent can discover at least five distinct seats on the south face');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mutations are applied in the order they arrive, not as they schedule', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    const replies = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'new_diagram', { name: 'order', path: 'd.turtlepen.json' }),
        call(3, 'place_box', { id: 'a', at: 'C4.tl', span: '4x2' }),
        call(4, 'move', { id: 'a', at: 'M20.tl' }),
        call(5, 'rename', { id: 'a', to: 'z' }),
        call(6, 'describe', {}),
      ],
      dir,
    );
    const described = JSON.parse(textOf(replies, 6));
    assert.equal(described[0].elements.length, 1);
    assert.equal(described[0].elements[0].id, 'z', 'the rename landed after the move');
    assert.equal(described[0].elements[0].at, 'M20.q1');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('plan rehearses over the wire and commit applies', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    const ops = [
      { op: 'place_box', id: 'a', at: 'C4.tl', span: { w: 6, h: 3 }, label: 'Immutable Audit Trail' },
    ];
    const replies = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'new_diagram', { name: 'planning', path: 'd.turtlepen.json' }),
        call(3, 'plan', { operations: ops }),
        call(4, 'describe', {}),
        call(5, 'plan', { operations: ops, commit: true }),
        call(6, 'describe', {}),
        call(7, 'plan', { operations: [{ op: 'place_box', id: 'a', at: 'Z4.tl', span: { w: 2, h: 1 } }], commit: true }),
      ],
      dir,
    );

    assert.match(textOf(replies, 3), /rehearsed 1 operation\(s\).*unchanged/s);
    assert.match(textOf(replies, 3), /L002 label too wide/);
    assert.equal(JSON.parse(textOf(replies, 4))[0].elements.length, 0, 'the rehearsal wrote nothing');

    assert.match(textOf(replies, 5), /committed 1 operation\(s\)/);
    assert.equal(JSON.parse(textOf(replies, 6))[0].elements.length, 1, 'the commit wrote');

    assert.match(textOf(replies, 7), /plan FAILED at operation 1/, 'a duplicate id fails the batch');
    assert.match(textOf(replies, 7), /nothing was applied/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a tool error comes back as a readable result, not a dead call', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    const replies = await rpc(
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
        call(2, 'new_diagram', { name: 'errors', path: 'd.turtlepen.json' }),
        call(3, 'pen', { program: 'pen B5 bl\nup 1 align right line\nup corner align left top' }),
      ],
      dir,
    );
    const reply = replies.find((r) => r.id === 3);
    assert.equal(reply.result.isError, true);
    assert.match(reply.result.content[0].text, /do not include "bottom"/, 'the model can read why and fix it');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// The handshake instructions are the only text a client is guaranteed to put
// in the model's context. Tool schemas are frequently deferred, so a capability
// named nowhere in here is one the model will reimplement by hand.
// ---------------------------------------------------------------------------
test('initialize instructions name every tool and its modes', async () => {
  const { createSession, createTools } = await import('../src/mcp/tools.js');
  const tools = createTools(createSession({ cwd: process.cwd() }));

  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  try {
    const replies = await rpc(
      [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } }],
      dir,
    );
    const text = replies.find((r) => r.id === 1).result.instructions;

    for (const t of tools) {
      assert.ok(text.includes(t.name), `instructions omit the tool "${t.name}"`);
    }

    // Regression on a real incident: place_image's first sentence never says
    // "dither", so a first-sentence-only inventory let a session hand-roll a
    // Bayer matrix it already had. Enum modes must survive into the summary.
    assert.match(text, /dither/, 'the dither mode must be discoverable at handshake');
    assert.match(text, /overlay/, 'overlay pages must be discoverable at handshake');
    assert.match(text, /not a budget/, 'the canvas-size guidance must be present');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
