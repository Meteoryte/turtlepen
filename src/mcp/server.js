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
import { createProtocolRuntime, error as protocolError } from './protocol.js';

const runtime = createProtocolRuntime({
  cwd: process.cwd(),
  // Canonical example builds inject this value so their checked-in document is
  // byte-reproducible. Normal interactive sessions still use the real clock.
  createdAt: process.env.TURTLEPEN_CREATED_AT ?? null,
  historyLimit: process.env.TURTLEPEN_HISTORY_LIMIT == null
    ? undefined
    : Number(process.env.TURTLEPEN_HISTORY_LIMIT),
});
const tools = runtime.tools;

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const log = (...a) => process.stderr.write(`[turtlepen] ${a.join(' ')}\n`);

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
    return send(protocolError(null, -32700, 'parse error'));
  }
  queue = queue.then(async () => {
    try {
      const response = await runtime.handle(msg);
      if (response) send(response);
    } catch (err) {
      log('handler failure:', err.stack ?? err.message);
      if (msg.id !== undefined && msg.id !== null) {
        send(protocolError(msg.id, -32603, `internal error: ${err.message}`));
      }
    }
  });
});

rl.on('close', async () => {
  await queue;
  process.exit(0);
});
process.on('uncaughtException', (err) => log('uncaught:', err.stack ?? err.message));

log(`ready — ${tools.length} tools, cwd ${process.cwd()}`);
