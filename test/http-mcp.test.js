import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { createHttpMcpServer } from '../src/mcp/http-server.js';
import { createSession, createTools } from '../src/mcp/tools.js';

const ACCEPT = 'application/json, text/event-stream';
const USER_AGENT = 'TurtlePen-Remote-Contract-Test/0.3.2';

function request(id, method, params = {}) {
  return { jsonrpc: '2.0', id, method, params };
}

function call(id, name, args = {}) {
  return request(id, 'tools/call', { name, arguments: args });
}

async function start(options = {}) {
  const dataDir = options.dataDir ?? await mkdtemp(resolve(tmpdir(), 'turtlepen-http-test-'));
  const service = createHttpMcpServer({
    host: '127.0.0.1',
    port: 8792,
    dataDir,
    allowAnonymous: true,
    logger: null,
    ...options,
  });
  const address = await service.listen({ port: 0, host: '127.0.0.1' });
  return {
    service,
    dataDir,
    url: `http://127.0.0.1:${address.port}${service.config.endpoint}`,
    async close() {
      await service.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

async function post(url, body, { session = null, token = null, headers = {} } = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: ACCEPT,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      Connection: 'close',
      ...(session ? { 'Mcp-Session-Id': session, 'MCP-Protocol-Version': '2025-06-18' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return response;
}

async function sseMessage(response) {
  assert.match(response.headers.get('content-type') ?? '', /^text\/event-stream/);
  const wire = await response.text();
  assert.match(wire, /^event: message\r?\ndata: /, 'POST responses use request-scoped SSE message frames');
  const data = wire.split(/\r?\n/).find((line) => line.startsWith('data: '));
  assert.ok(data, 'SSE response carries a data line');
  return JSON.parse(data.slice('data: '.length));
}

async function initialize(url, options = {}) {
  const response = await post(url, request(1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'remote-contract-test', version: '1.0.0' },
  }), options);
  assert.equal(response.status, 200);
  const session = response.headers.get('mcp-session-id');
  assert.match(session ?? '', /^[!-~]+$/, 'initialization returns a visible-ASCII session id');
  return { session, message: await sseMessage(response) };
}

test('Streamable HTTP exposes the canonical 73-tool registry with SSE framing', async () => {
  const fixture = await start();
  try {
    const initialized = await initialize(fixture.url);
    assert.equal(initialized.message.result.protocolVersion, '2025-06-18');
    assert.match(initialized.message.result.instructions, /EVERY TOOL \(73\):/);

    const notification = await post(fixture.url, {
      jsonrpc: '2.0', method: 'notifications/initialized',
    }, { session: initialized.session });
    assert.equal(notification.status, 202);
    assert.equal(await notification.text(), '');

    const listedResponse = await post(fixture.url, request(2, 'tools/list'), {
      session: initialized.session,
    });
    assert.equal(listedResponse.status, 200);
    const listed = await sseMessage(listedResponse);
    const remoteNames = listed.result.tools.map((tool) => tool.name).sort();
    const localNames = createTools(createSession()).map((tool) => tool.name).sort();
    assert.equal(remoteNames.length, 73);
    assert.deepEqual(remoteNames, localNames, 'HTTP is a transport over the same registry, not a subset');
  } finally {
    await fixture.close();
  }
});

test('one remote session keeps an active document across separate POST requests', async () => {
  const fixture = await start();
  try {
    const { session } = await initialize(fixture.url);

    const created = await sseMessage(await post(fixture.url, call(2, 'new_diagram', {
      name: 'stateful remote', path: 'diagram.turtlepen.json', cols: 80, rows: 40,
    }), { session }));
    assert.equal(created.result.isError, undefined, created.result.content[0].text);

    const placed = await sseMessage(await post(fixture.url, call(3, 'place_box', {
      id: 'api', at: 'C4.tl', span: { w: 12, h: 4 }, label: 'Remote API',
    }), { session }));
    assert.equal(placed.result.isError, undefined, placed.result.content[0].text);

    const runtime = await sseMessage(await post(fixture.url, call(4, 'runtime_info'), { session }));
    const runtimeInfo = JSON.parse(runtime.result.content[0].text);
    assert.equal(runtimeInfo.toolCount, 73);
    assert.equal(runtimeInfo.activeDocument.name, 'stateful remote');

    const described = await sseMessage(await post(fixture.url, call(5, 'describe'), { session }));
    const pages = JSON.parse(described.result.content[0].text);
    assert.deepEqual(pages[0].elements.map((element) => element.id), ['api']);

    const rendered = await sseMessage(await post(fixture.url, call(6, 'render', {
      path: 'diagram.svg', showGrid: false,
    }), { session }));
    assert.equal(rendered.result.isError, undefined, rendered.result.content[0].text);
    await access(resolve(fixture.dataDir, session, 'diagram.svg'));
  } finally {
    await fixture.close();
  }
});

test('remote sessions are isolated and can be explicitly terminated', async () => {
  const fixture = await start();
  try {
    const first = await initialize(fixture.url);
    const second = await initialize(fixture.url);
    assert.notEqual(first.session, second.session);

    await sseMessage(await post(fixture.url, call(2, 'new_diagram', {
      name: 'first only', path: 'first.turtlepen.json',
    }), { session: first.session }));

    const secondInfo = await sseMessage(await post(fixture.url, call(2, 'runtime_info'), {
      session: second.session,
    }));
    assert.equal(JSON.parse(secondInfo.result.content[0].text).activeDocument, null);

    const deleted = await fetch(fixture.url, {
      method: 'DELETE',
      headers: { 'Mcp-Session-Id': first.session, 'User-Agent': USER_AGENT, Connection: 'close' },
    });
    assert.equal(deleted.status, 204);
    await assert.rejects(access(resolve(fixture.dataDir, first.session)), { code: 'ENOENT' },
      'explicit teardown purges the isolated session filesystem');

    const afterDelete = await post(fixture.url, request(3, 'ping'), { session: first.session });
    assert.equal(afterDelete.status, 404);
  } finally {
    await fixture.close();
  }
});

test('HTTP boundary enforces content negotiation, sessions, origins, and protocol versions', async () => {
  const fixture = await start({ allowedOrigins: ['https://brainn.dev'] });
  try {
    const badAccept = await post(fixture.url, request(1, 'initialize', {
      protocolVersion: '2025-06-18', capabilities: {},
    }), { headers: { Accept: 'application/json' } });
    assert.equal(badAccept.status, 406);

    const missingSession = await post(fixture.url, request(2, 'tools/list'));
    assert.equal(missingSession.status, 400);

    const badOrigin = await post(fixture.url, request(1, 'initialize', {
      protocolVersion: '2025-06-18', capabilities: {},
    }), { headers: { Origin: 'https://attacker.example' } });
    assert.equal(badOrigin.status, 403);

    const initialized = await initialize(fixture.url, {
      headers: { Origin: 'https://brainn.dev' },
    });
    const badProtocol = await post(fixture.url, request(3, 'ping'), {
      session: initialized.session,
      headers: { 'MCP-Protocol-Version': '2099-01-01', Origin: 'https://brainn.dev' },
    });
    assert.equal(badProtocol.status, 400);

    const get = await fetch(fixture.url, {
      headers: { Accept: ACCEPT, 'User-Agent': USER_AGENT, Connection: 'close' },
    });
    assert.equal(get.status, 405, 'no unrelated long-lived GET stream is advertised');
  } finally {
    await fixture.close();
  }
});

test('bearer authentication is deny-by-default and never appears in audit events', async () => {
  const token = 'test-secret-that-must-not-be-logged';
  const events = [];
  const fixture = await start({
    allowAnonymous: false,
    bearerToken: token,
    logger: (event) => events.push(event),
  });
  try {
    const denied = await post(fixture.url, request(1, 'initialize', {
      protocolVersion: '2025-06-18', capabilities: {},
    }));
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get('www-authenticate'), 'Bearer');

    const allowed = await initialize(fixture.url, { token });
    assert.equal(allowed.message.result.serverInfo.name, 'turtlepen');

    assert.equal(JSON.stringify(events).includes(token), false, 'audit metadata never contains the bearer token');
    assert.ok(events.some((event) => event.outcome === 'auth_denied'));
    assert.ok(events.some((event) => event.event === 'session_created'));
  } finally {
    await fixture.close();
  }
});

test('request bodies are bounded before JSON parsing', async () => {
  const fixture = await start({ bodyLimit: 256 });
  try {
    const oversized = await post(fixture.url, request(1, 'initialize', {
      protocolVersion: '2025-06-18', capabilities: {}, padding: 'x'.repeat(512),
    }));
    assert.equal(oversized.status, 413);
  } finally {
    await fixture.close();
  }
});
