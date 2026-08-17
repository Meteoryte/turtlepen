#!/usr/bin/env node
/**
 * MCP stdio server — hand-rolled JSON-RPC 2.0, zero dependencies.
 *
 * The MCP stdio transport is newline-delimited JSON on stdin/stdout: one
 * message per line, no embedded newlines. That is small enough to implement
 * directly, which keeps this project installable-free and immune to SDK drift.
 *
 * Anything written to stdout that is not a protocol message corrupts the
 * stream, so all diagnostics go to stderr.
 */

import { createInterface } from 'node:readline';
import { createSession, createTools } from './tools.js';

const SERVER_INFO = { name: 'turtlepen', version: '0.1.0' };
const DEFAULT_PROTOCOL = '2025-06-18';
const SUPPORTED_PROTOCOLS = new Set([DEFAULT_PROTOCOL, '2025-03-26', '2024-11-05']);

const session = createSession({
  cwd: process.cwd(),
  // Canonical example builds inject this value so their checked-in document is
  // byte-reproducible. Normal interactive sessions still use the real clock.
  createdAt: process.env.TURTLEPEN_CREATED_AT ?? null,
  historyLimit: process.env.TURTLEPEN_HISTORY_LIMIT == null
    ? undefined
    : Number(process.env.TURTLEPEN_HISTORY_LIMIT),
});
const tools = createTools(session);
const byName = new Map(tools.map((t) => [t.name, t]));

/**
 * The handshake instructions are the ONLY text a client is guaranteed to put in
 * the model's context. Individual tool schemas are frequently deferred — loaded
 * on demand, by name — so a capability the model never hears of is a capability
 * it will reimplement by hand.
 *
 * That is not hypothetical. An authoring session hand-rolled a Bayer dither in a
 * generator script and then failed five times to derive a brain silhouette from
 * formulas, because `place_image` and `place_reference` were never named
 * anywhere it looked. So the inventory is DERIVED from the live tool list rather
 * than written out: a tool added without a first line of description will show
 * up here as obviously undescribed, and the two can never drift apart.
 */
function buildInstructions() {
  const firstSentence = (t) => String(t.description ?? '').split(/(?<=\.)\s/)[0].trim();

  // A first sentence alone is not enough, and that is not a guess: place_image
  // opens with "Place an image, claiming an exact quadrant footprint" and never
  // says "dither" — precisely the capability the session above failed to find.
  // The MODES are what distinguish a tool, so its enums come too. Enums are
  // structural, so unlike a hand-written blurb they cannot drift from the code.
  const modes = (t) => Object.entries(t.inputSchema?.properties ?? {})
    .filter(([, v]) => Array.isArray(v.enum) && v.enum.length > 1)
    .map(([k, v]) => `${k}: ${v.enum.join('|')}`)
    .join('  ');

  const summary = (t) => {
    const m = modes(t);
    return m ? `${firstSentence(t)}  [${m}]` : firstSentence(t);
  };
  const inventory = tools.map((t) => `  ${t.name} — ${summary(t)}`).join('\n');
  return [
    'Call turtlepen_help first. Measure text before sizing boxes, draw the whole',
    'composition, then call validate and adjudicate each finding. Nothing is ever',
    'silently resized. Render the result and LOOK at it — a clean log means the',
    'drawing is undefective, never that it is finished.',
    '',
    'The canvas is unbounded right and down; a declared size is a starting point,',
    'not a budget. A feature may be more than one stroke, and overlay pages let',
    'annotation sit on top without colliding. Before concluding the lattice cannot',
    'express something, check this list — three separate sessions have reported an',
    'engine limit that was really a capability they had not found:',
    '',
    `EVERY TOOL (${tools.length}):`,
    inventory,
  ].join('\n');
}

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const log = (...a) => process.stderr.write(`[turtlepen] ${a.join(' ')}\n`);

const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message, data) => send({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });

async function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return reply(id, {
        protocolVersion: SUPPORTED_PROTOCOLS.has(asked) ? asked : DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: buildInstructions(),
      });
    }

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return; // notifications take no response

    case 'ping':
      return reply(id, {});

    case 'tools/list':
      return reply(id, {
        tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });

    case 'tools/call': {
      const tool = byName.get(params?.name);
      if (!tool) return fail(id, -32602, `unknown tool "${params?.name}"`, { available: [...byName.keys()] });
      try {
        const text = await tool.handler(params.arguments ?? {});
        return reply(id, { content: [{ type: 'text', text: String(text) }] });
      } catch (err) {
        // Tool errors are returned as results, not protocol errors, so the model
        // can read the message and correct itself rather than seeing a dead call.
        return reply(id, { content: [{ type: 'text', text: `error: ${err.message}` }], isError: true });
      }
    }

    default:
      if (isNotification) return;
      return fail(id, -32601, `method not found: ${method}`);
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

/**
 * Every tool mutates one shared document, so requests are applied strictly in
 * arrival order rather than concurrently — otherwise the saved file would
 * depend on scheduling instead of on the order the caller asked for. The same
 * chain is drained on shutdown so no in-flight reply is lost when stdin closes.
 */
let queue = Promise.resolve();

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return fail(null, -32700, 'parse error');
  }
  queue = queue.then(async () => {
    try {
      await handle(msg);
    } catch (err) {
      log('handler failure:', err.stack ?? err.message);
      if (msg.id !== undefined && msg.id !== null) fail(msg.id, -32603, `internal error: ${err.message}`);
    }
  });
});

rl.on('close', async () => {
  await queue;
  process.exit(0);
});
process.on('uncaughtException', (err) => log('uncaught:', err.stack ?? err.message));

log(`ready — ${tools.length} tools, cwd ${process.cwd()}`);
