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
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { createSession, createTools } from '../src/mcp/tools.js';
import * as core from '../src/core/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(here, '../src/mcp/server.js');

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

test('the tool module loads and every tool is well formed', () => {
  const tools = createTools(createSession());
  assert.equal(tools.length, 31, `the documented tool count drifted: got ${tools.length}`);
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

test('tools that need a document say so instead of throwing something cryptic', async () => {
  const tools = createTools(createSession());
  const validate = tools.find((t) => t.name === 'validate');
  await assert.rejects(async () => validate.handler({}), /no diagram is open/);
});

test('the validate tool surfaces composition findings to the agent', async () => {
  // An INFO finding the tool layer filters out cannot change any model's behaviour,
  // which would defeat the point of having it. Drive the real handler, not core.validate.
  // Write into a temp dir, never the repo — a relative path here lands in the
  // project root and gets committed by accident.
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-'));
  const tools = createTools(createSession());
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
  const help = tools.find((t) => t.name === 'turtlepen_help').handler({});
  for (const needle of ['PEN GRAMMAR', 'align', 'hop', 'arrow', 'EVERY FIX HAS A TOOL', 'L001', 'L015']) {
    assert.ok(help.includes(needle), `help is missing "${needle}"`);
  }
});

// ---------------------------------------------------------------------------
// The server, over a real pipe
// ---------------------------------------------------------------------------

/** Drive the real server over stdio and collect its replies. */
function rpc(messages, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [SERVER], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
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
    for (const m of messages) child.stdin.write(`${JSON.stringify(m)}\n`);
    child.stdin.end();
  });
}

const call = (id, name, args = {}) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const textOf = (replies, id) => replies.find((r) => r.id === id).result.content[0].text;

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
