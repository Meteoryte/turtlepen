import test from 'node:test';
import assert from 'node:assert/strict';

import { createCloudflareHandlers } from '../src/mcp/cloudflare.js';

class MemoryBucket {
  constructor() { this.objects = new Map(); }
  async get(key) {
    const value = this.objects.get(key);
    return value == null ? null : { arrayBuffer: async () => Buffer.from(value) };
  }
  async put(key, value) { this.objects.set(key, Buffer.from(value)); }
  async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key); }
  async list({ prefix }) {
    return {
      objects: [...this.objects.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })),
      truncated: false,
    };
  }
}

class MemoryD1 {
  constructor() {
    this.sessions = new Map();
    this.initializers = new Map();
  }
  prepare(sql) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const db = this;
    let values = [];
    return {
      bind(...next) { values = next; return this; },
      async first() {
        if (normalized.startsWith('SELECT COUNT(*)')) {
          return { count: [...db.sessions.values()].filter((row) => row.expires_at > values[0]).length };
        }
        if (normalized.startsWith('SELECT started_at')) return db.initializers.get(values[0]) ?? null;
        if (normalized.startsWith('SELECT * FROM turtlepen_sessions')) {
          const row = db.sessions.get(values[0]);
          return row ? structuredClone(row) : null;
        }
        throw new Error(`unhandled D1 first: ${normalized}`);
      },
      async all() {
        if (normalized.startsWith('SELECT id FROM turtlepen_sessions')) {
          return { results: [...db.sessions.values()].filter((row) => row.expires_at <= values[0]).slice(0, 10) };
        }
        throw new Error(`unhandled D1 all: ${normalized}`);
      },
      async run() {
        if (normalized.startsWith('CREATE ')) return { meta: { changes: 0 } };
        if (normalized.startsWith('DELETE FROM turtlepen_initializers')) {
          for (const [key, row] of db.initializers) if (row.expires_at <= values[0]) db.initializers.delete(key);
          return { meta: { changes: 0 } };
        }
        if (normalized.startsWith('INSERT INTO turtlepen_initializers')) {
          db.initializers.set(values[0], { started_at: values[1], request_count: 1, expires_at: values[2] });
          return { meta: { changes: 1 } };
        }
        if (normalized.startsWith('UPDATE turtlepen_initializers')) {
          const row = db.initializers.get(values[1]);
          if (row) Object.assign(row, { request_count: row.request_count + 1, expires_at: values[0] });
          return { meta: { changes: row ? 1 : 0 } };
        }
        if (normalized.startsWith('INSERT INTO turtlepen_sessions')) {
          const [id, version, created_at, last_seen, expires_at, rate_started_at] = values;
          db.sessions.set(id, { id, version, created_at, last_seen, expires_at, rate_started_at, rate_count: 1 });
          return { meta: { changes: 1 } };
        }
        if (normalized.startsWith('UPDATE turtlepen_sessions SET rate_started_at')) {
          const [rate_started_at, rate_count, last_seen, id, version] = values;
          const row = db.sessions.get(id);
          if (!row || row.version !== version) return { meta: { changes: 0 } };
          Object.assign(row, { rate_started_at, rate_count, last_seen });
          return { meta: { changes: 1 } };
        }
        if (normalized.startsWith('UPDATE turtlepen_sessions SET version')) {
          const [version, last_seen, expires_at, id, expected] = values;
          const row = db.sessions.get(id);
          if (!row || row.version !== expected) return { meta: { changes: 0 } };
          Object.assign(row, { version, last_seen, expires_at });
          return { meta: { changes: 1 } };
        }
        if (normalized.startsWith('DELETE FROM turtlepen_sessions')) {
          const row = db.sessions.get(values[0]);
          if (row && (values.length === 1 || row.expires_at <= values[1])) db.sessions.delete(values[0]);
          return { meta: { changes: row ? 1 : 0 } };
        }
        throw new Error(`unhandled D1 run: ${normalized}`);
      },
    };
  }
}

const rpcRequest = (body, session = null) => new Request('https://example.test/api/mcp/turtlepen', {
  method: 'POST',
  headers: {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    ...(session ? { 'Mcp-Session-Id': session } : {}),
  },
  body: JSON.stringify(body),
});

async function message(response) {
  const body = await response.text();
  const match = /^event: message\ndata: (.+)\n\n$/s.exec(body);
  assert.ok(match, `response uses MCP SSE framing; got ${body}`);
  return JSON.parse(match[1]);
}

test('the Cloudflare adapter exposes and preserves the canonical registry through D1/R2', async () => {
  const db = new MemoryD1();
  const artifacts = new MemoryBucket();
  const handlers = createCloudflareHandlers({ getBindings: async () => ({ db, artifacts }) });

  const initialized = await handlers.POST(rpcRequest({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {} },
  }));
  assert.equal(initialized.status, 200);
  const session = initialized.headers.get('mcp-session-id');
  assert.match(session, /^[0-9a-f-]{36}$/);
  assert.equal((await message(initialized)).result.serverInfo.name, 'turtlepen');
  assert.deepEqual([...artifacts.objects.keys()], [`turtlepen/${session}/v2/state.json`]);
  assert.equal(db.sessions.get(session).version, 2);

  const listed = await handlers.POST(rpcRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, session));
  const tools = (await message(listed)).result.tools;
  assert.equal(tools.length, 74);
  assert.ok(tools.some((tool) => tool.name === 'release_check'));
  assert.equal(db.sessions.get(session).version, 3, 'each request commits one optimistic state version');
});

test('the Cloudflare adapter refuses bad content negotiation before touching storage', async () => {
  let touched = false;
  const handlers = createCloudflareHandlers({ getBindings: async () => { touched = true; throw new Error('should not run'); } });
  const response = await handlers.POST(new Request('https://example.test/api/mcp/turtlepen', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: '{}',
  }));
  assert.equal(response.status, 406);
  assert.equal(touched, false);
});
