/** A minimal newline-delimited JSON-RPC client for TurtlePen's real stdio MCP. */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(here, '..');
const SERVER = resolve(PROJECT_ROOT, 'src/mcp/server.js');

export function createMcpClient({ cwd = PROJECT_ROOT, createdAt = null } = {}) {
  const child = spawn(process.execPath, [SERVER], {
    cwd,
    env: { ...process.env, ...(createdAt ? { TURTLEPEN_CREATED_AT: createdAt } : {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map();
  let nextId = 0;
  let buffer = '';
  let stderr = '';

  const rejectPending = (error) => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };

  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const message = JSON.parse(line);
        const waiting = pending.get(message.id);
        if (waiting) {
          pending.delete(message.id);
          waiting.resolve(message);
        }
      } catch (error) {
        rejectPending(new Error(`TurtlePen MCP returned invalid JSON: ${error.message}`));
      }
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', rejectPending);
  child.on('close', (code) => {
    if (pending.size) rejectPending(new Error(`TurtlePen MCP exited ${code}: ${stderr.trim()}`));
  });

  const send = (method, params) => new Promise((resolvePromise, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve: resolvePromise, reject });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

  return {
    async call(name, args = {}) {
      const reply = await send('tools/call', { name, arguments: args });
      if (reply.error) return { error: reply.error.message, isError: true };
      return { text: reply.result.content[0].text, isError: Boolean(reply.result.isError) };
    },
    init: () => send('initialize', { protocolVersion: '2025-06-18', capabilities: {} }),
    close: () => new Promise((resolvePromise) => {
      if (child.exitCode != null) return resolvePromise();
      child.once('close', resolvePromise);
      child.stdin.end();
    }),
  };
}
