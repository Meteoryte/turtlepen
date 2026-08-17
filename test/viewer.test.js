import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, connect as connectSocket } from 'node:net';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import * as core from '../src/core/index.js';
import { VIEWER_STATIC_FILES, VIEWER_TOOLS } from '../src/viewer/capabilities.js';
import { dataUri, encodePng, solidPng } from './helpers/png-fixture.js';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function lineArtPng(width = 96, height = 64) {
  const samples = new Uint8Array(width * height * 3).fill(255);
  for (let y = 8; y < height - 8; y++) for (let x = 12; x < width - 12; x++) {
    if (x > 14 && x < width - 15 && y > 10 && y < height - 11) continue;
    const index = (y * width + x) * 3;
    samples[index] = 0; samples[index + 1] = 0; samples[index + 2] = 0;
  }
  return encodePng(width, height, samples, { colorType: 2 });
}

test('the live viewer serves its UI, brand, and cheap unchanged state responses', async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, [
    'src/viewer/server.js', '--port', String(port), '--doc', 'diagrams/example.turtlepen.json',
  ], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());

  const root = await waitForResponse(port, '/');
  assert.equal(root.status, 200);
  assert.match(root.body, /TurtlePen/);
  assert.match(root.body, /brand-logo\.svg/);
  assert.match(root.body, /app\.js/);
  assert.match(root.body, /style\.css/);
  assert.match(root.headers['content-security-policy'], /script-src 'self'/);

  const head = await response(port, '/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');

  const source = await response(port, '/server.js');
  assert.equal(source.status, 404, 'server-side source is not a public static asset');

  const post = await response(port, '/api/state', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');

  const app = await response(port, '/app.js');
  assert.equal(app.status, 200);
  assert.match(app.body, /new WebSocket/);
  assert.match(app.body, /data-unaccept/);
  assert.match(app.body, /Stale acceptances/);
  assert.match(app.body, /addEventListener\('keydown'/);
  assert.match(app.body, /Readability/);
  assert.match(app.body, /element\.mode !== 'embed'/, 'the inspector must not offer stale-grid resize for any rasterized image');
  assert.match(app.body, /Simplification/);
  assert.match(app.body, /selection-hit/, 'sparse images need a full-footprint selection target');
  assert.doesNotMatch(app.body, /setInterval|700/, 'the browser must not poll for document state');

  const brand = await response(port, '/brand-logo.svg');
  assert.equal(brand.status, 200);
  assert.match(brand.body, /<svg/);

  const favicon = await response(port, '/favicon.ico');
  assert.equal(favicon.status, 204);
  assert.equal(favicon.body, '');

  const state = await response(port, '/api/state');
  assert.equal(state.status, 200);
  const initial = JSON.parse(state.body);
  assert.equal(initial.ok, true);
  assert.equal(initial.unchanged, undefined);
  assert.match(initial.svg, /<svg/);

  const unchanged = await response(port, `/api/state?since=${encodeURIComponent(initial.mtime)}`);
  assert.equal(unchanged.status, 200);
  assert.deepEqual(JSON.parse(unchanged.body), { ok: true, unchanged: true, mtime: initial.mtime });
  assert.ok(unchanged.body.length < state.body.length / 10);

  const staticRoutes = VIEWER_STATIC_FILES.map((file) => file === 'index.html' ? '/' : `/${file}`);
  assert.deepEqual(staticRoutes, ['/', '/style.css', '/app.js']);
  const publicRoutes = [
    ...staticRoutes.map((path) => ({ path, status: 200 })),
    { path: '/brand-logo.svg', status: 200 },
    { path: '/favicon.ico', status: 204 },
    { path: '/api/state', status: 200 },
  ];
  for (const route of publicRoutes) {
    const get = await response(port, route.path);
    assert.equal(get.status, route.status, `GET ${route.path}`);
    assert.equal(get.headers['x-content-type-options'], 'nosniff', `GET ${route.path} security headers`);
    assert.equal(get.headers['referrer-policy'], 'no-referrer', `GET ${route.path} security headers`);

    const routeHead = await response(port, route.path, { method: 'HEAD' });
    assert.equal(routeHead.status, route.status, `HEAD ${route.path}`);
    assert.equal(routeHead.body, '', `HEAD ${route.path} must not include a body`);

    const routePost = await response(port, route.path, { method: 'POST' });
    assert.equal(routePost.status, 405, `POST ${route.path}`);
    assert.equal(routePost.headers.allow, 'GET, HEAD');
  }

  for (const path of ['/server.js', '/capabilities.js', '/missing', '/..%2Fpackage.json']) {
    assert.equal((await response(port, path)).status, 404, `GET ${path} must remain private`);
  }
});

test('the live viewer reports a missing document without crashing', async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, [
    'src/viewer/server.js', '--port', String(port), '--doc', 'diagrams/does-not-exist.json',
  ], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());

  const state = await waitForResponse(port, '/api/state');
  assert.equal(state.status, 200);
  assert.equal(JSON.parse(state.body).ok, false);
});

test('the live viewer exposes image scale, readability, and simplification state', async (t) => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-viewer-image-'));
  const path = resolve(dir, 'image.turtlepen.json');
  const doc = core.createDocument({ name: 'image state' });
  core.placeImage(doc, 'base', {
    id: 'trace', at: 'C4.tl', span: '8x4', mode: 'dither',
    source: dataUri(solidPng(80, 40, [0, 0, 0])),
  });
  core.placeImage(doc, 'base', {
    id: 'simplified', at: 'M4.tl', span: '24x16', mode: 'simplify', supersample: 4,
    source: dataUri(lineArtPng()),
  });
  await core.checkpointDocument(doc, path);

  const port = await freePort();
  const child = spawn(process.execPath, [
    'src/viewer/server.js', '--port', String(port), '--doc', path,
  ], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  t.after(() => rm(dir, { recursive: true, force: true }));

  const response_ = await waitForResponse(port, '/api/state');
  const state = JSON.parse(response_.body);
  const image = state.elements.find((element) => element.id === 'trace');
  assert.equal(image.mode, 'dither');
  assert.equal(image.fit, 'contain');
  assert.equal(image.scale.sampling.direction, 'downscale');
  assert.deepEqual(image.scale.sampling.target, { width: 16, height: 8, unit: 'quadrants' });
  assert.equal(image.ditherStats.readability, 'pass');
  const simplified = state.elements.find((element) => element.id === 'simplified');
  assert.equal(simplified.mode, 'simplify');
  assert.equal(simplified.detail, 'auto');
  assert.equal(simplified.supersample, 4);
  assert.equal(simplified.processing.strategy, 'threshold-simplify');
  assert.equal(simplified.processing.resolvedSupersample, 4);
  assert.deepEqual(simplified.processing.workingCanvas, { width: 192, height: 128, unit: 'quadrants' });
  assert.equal(simplified.processing.nearBinary, true);
  assert.equal(simplified.ditherStats.readability, 'pass');
});

test('the WebSocket editor persists mutations, broadcasts exact state, restores history, and reloads outside edits', async (t) => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-viewer-'));
  const path = resolve(dir, 'live.turtlepen.json');
  const doc = core.createDocument({ name: 'live edit' });
  core.placeBox(doc, 'base', { id: 'unit', at: 'C4.tl', span: { w: 4, h: 2 } });
  core.placeBox(doc, 'base', { id: 'tag', at: 'M4.tl', span: { w: 2, h: 1 } });
  core.createConstraint(doc, { id: 'tag-follows-unit', dependent: 'tag', target: 'unit' });
  await core.checkpointDocument(doc, path);

  const port = await freePort();
  const child = spawn(process.execPath, [
    'src/viewer/server.js', '--port', String(port), '--doc', path,
  ], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  t.after(() => rm(dir, { recursive: true, force: true }));
  await waitForResponse(port, '/');

  const first = await websocketClient(port);
  const second = await websocketClient(port);
  t.after(() => first.close());
  t.after(() => second.close());
  const initialFirst = await first.next((message) => message.type === 'state');
  const initialSecond = await second.next((message) => message.type === 'state');
  assert.equal(initialFirst.state.ok, true);
  assert.equal(initialSecond.state.revision, initialFirst.state.revision);

  first.send({ type: 'call', id: 'move-1', tool: 'move', args: { id: 'unit', cellsX: 2, cellsY: 1 } });
  assert.equal((await first.next((message) => message.id === 'move-1')).ok, true);
  const changedFirst = await first.next((message) => message.type === 'state' && message.state.revision > initialFirst.state.revision);
  const changedSecond = await second.next((message) => message.type === 'state' && message.state.revision === changedFirst.state.revision);
  assert.equal(changedFirst.state.elements.find((element) => element.id === 'unit').at, 'E5.q1');
  assert.equal(changedFirst.state.elements.find((element) => element.id === 'tag').at, 'O5.q1');
  assert.equal(changedSecond.state.history.undo, 1);
  const saved = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(saved.elements.base.find((element) => element.id === 'unit').rect.x, 8);
  assert.equal(saved.elements.base.find((element) => element.id === 'tag').rect.x, 28);

  second.send({ type: 'call', id: 'undo-1', tool: 'history', args: { action: 'undo' } });
  assert.equal((await second.next((message) => message.id === 'undo-1')).ok, true);
  const undone = await first.next((message) => message.type === 'state' && message.state.revision > changedFirst.state.revision);
  assert.equal(undone.state.elements.find((element) => element.id === 'unit').at, 'C4.q1');
  assert.equal(undone.state.history.redo, 1);

  first.send({ type: 'call', id: 'blocked-1', tool: 'render', args: {} });
  const blocked = await first.next((message) => message.id === 'blocked-1');
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /not available in the live editor/);
  first.sendRaw('{not json');
  assert.match((await first.next((message) => message.type === 'error')).error, /valid JSON/);
  first.sendBatch([
    { type: 'call', id: 'batch-1', tool: 'render', args: {} },
    { type: 'call', id: 'batch-2', tool: 'render', args: {} },
  ]);
  assert.equal((await first.next((message) => message.id === 'batch-1')).ok, false);
  assert.equal((await first.next((message) => message.id === 'batch-2')).ok, false);

  const outside = await core.loadDocument(path);
  core.moveElement(outside, 'unit', 2, 0);
  await core.checkpointDocument(outside, path);
  const reloaded = await first.next((message) => message.type === 'state' && message.state.revision > undone.state.revision);
  assert.equal(reloaded.state.elements.find((element) => element.id === 'unit').at, 'D4.q1');
  assert.equal(reloaded.state.elements.find((element) => element.id === 'tag').at, 'N4.q1');
  assert.equal(reloaded.state.history.undo, 0, 'outside changes invalidate the prior hash-bound history');
});

test('the WebSocket editor validates, audits, and withdraws finding acceptances', async (t) => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-viewer-accept-'));
  const path = resolve(dir, 'accept.turtlepen.json');
  const doc = core.createDocument({ name: 'acceptance audit' });
  core.placeBox(doc, 'base', { id: 'a', at: 'C4.tl', span: { w: 6, h: 3 } });
  core.placeBox(doc, 'base', { id: 'b', at: 'F4.tl', span: { w: 6, h: 3 } });
  await core.checkpointDocument(doc, path);

  const port = await freePort();
  const child = spawn(process.execPath, [
    'src/viewer/server.js', '--port', String(port), '--doc', path,
  ], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  t.after(() => rm(dir, { recursive: true, force: true }));
  await waitForResponse(port, '/');

  const client = await websocketClient(port);
  t.after(() => client.close());
  const initial = await client.next((message) => message.type === 'state');
  const finding = initial.state.findings.find((entry) => entry.rule === 'L001');
  assert.ok(finding);

  client.send({ type: 'call', id: 'accept-unknown', tool: 'accept_finding', args: { fingerprint: 'unknown', reason: 'invalid' } });
  const refused = await client.next((message) => message.id === 'accept-unknown');
  assert.equal(refused.ok, false);
  assert.match(refused.error, /not a current finding/);

  client.send({ type: 'call', id: 'accept-live', tool: 'accept_finding', args: { fingerprint: finding.fingerprint, reason: 'intentional overlap' } });
  assert.equal((await client.next((message) => message.id === 'accept-live')).ok, true);
  const accepted = await client.next((message) => message.type === 'state' && message.state.revision > initial.state.revision);
  assert.equal(accepted.state.accepted.length, 1);
  assert.equal(accepted.state.accepted[0].rule, 'L001');
  assert.equal(accepted.state.summary.accepted, 1);

  client.send({ type: 'call', id: 'move-after-accept', tool: 'move', args: { id: 'b', cellsX: 2 } });
  assert.equal((await client.next((message) => message.id === 'move-after-accept')).ok, true);
  const stale = await client.next((message) => message.type === 'state' && message.state.revision > accepted.state.revision);
  assert.equal(stale.state.stale.length, 1);
  assert.equal(stale.state.stale[0].rule, 'L001');
  assert.equal(stale.state.summary.stale, 1);

  client.send({ type: 'call', id: 'withdraw', tool: 'unaccept_finding', args: { fingerprint: finding.fingerprint } });
  assert.equal((await client.next((message) => message.id === 'withdraw')).ok, true);
  const withdrawn = await client.next((message) => message.type === 'state' && message.state.revision > stale.state.revision);
  assert.equal(withdrawn.state.accepted.length, 0);
  assert.equal(withdrawn.state.stale.length, 0);
});

test('every browser-authorized tool completes through the WebSocket editor', async (t) => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-viewer-tools-'));
  const path = resolve(dir, 'tools.turtlepen.json');
  const doc = core.createDocument({ name: 'viewer tool contract', canvas: { cols: 60, rows: 40 } });
  core.placeBox(doc, 'base', { id: 'unit', at: 'C4.tl', span: { w: 5, h: 3 }, label: 'Unit' });
  core.placeBox(doc, 'base', { id: 'tag', at: 'M4.tl', span: { w: 3, h: 2 }, label: 'Tag' });
  core.placeBox(doc, 'base', { id: 'overlap', at: 'F4.tl', span: { w: 5, h: 3 }, label: 'Overlap' });
  core.applyPen(doc, 'base', 'pen C15.q1\nright 4 line', { id: 'run', role: 'artwork' });
  await core.checkpointDocument(doc, path);

  const port = await freePort();
  const child = spawn(process.execPath, [
    'src/viewer/server.js', '--port', String(port), '--doc', path,
  ], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  t.after(() => rm(dir, { recursive: true, force: true }));
  await waitForResponse(port, '/');

  const client = await websocketClient(port);
  t.after(() => client.close());
  let latest = (await client.next((message) => message.type === 'state')).state;
  const covered = new Set();
  let callId = 0;

  const invoke = async (tool, args, { mutates = true } = {}) => {
    const id = `contract-${++callId}`;
    client.send({ type: 'call', id, tool, args });
    const result = await client.next((message) => message.id === id);
    assert.equal(result.ok, true, `${tool} failed: ${result.error}`);
    covered.add(tool);
    if (mutates) {
      latest = (await client.next((message) => message.type === 'state'
        && message.state.revision > latest.revision)).state;
    }
    return result;
  };

  await invoke('restyle', { id: 'unit', label: 'Outdoor unit', corner: 'rounded', fill: '#dceef8' });
  await invoke('resize', { id: 'unit', cellsW: 6, cellsH: 4 });
  await invoke('group', { action: 'create', id: 'package', members: ['unit', 'tag'] });
  await invoke('constraint', {
    action: 'create', id: 'tag-follows-unit', dependent: 'tag', target: 'unit',
    dependentAnchor: 'W', targetAnchor: 'E', offsetX: 4, offsetY: 0,
  });
  await invoke('move', { id: 'unit', cellsX: 1, cellsY: 1 });
  await invoke('extend_path', { id: 'run', program: 'right 2 line' });
  await invoke('replace_path', { id: 'run', program: 'pen C18.q1\nright 4 line' });

  const finding = latest.findings[0];
  assert.ok(finding, 'the acceptance endpoint needs a current finding');
  await invoke('accept_finding', { fingerprint: finding.fingerprint, reason: 'viewer endpoint contract' });
  await invoke('unaccept_finding', { fingerprint: finding.fingerprint });
  await invoke('remove', { id: 'run' });
  assert.match((await invoke('history', { action: 'status' }, { mutates: false })).text, /undo_available/);

  assert.deepEqual([...covered].sort(), [...VIEWER_TOOLS].sort(),
    'a viewer tool was added or removed without updating its WebSocket contract');
  const saved = await core.loadDocument(path);
  assert.equal(core.findElement(saved, 'run'), null, 'the WebSocket mutation contract persists to disk');
});

test('the WebSocket upgrade rejects foreign origins and closes unmasked client frames', async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, [
    'src/viewer/server.js', '--port', String(port), '--doc', 'diagrams/example.turtlepen.json',
  ], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  await waitForResponse(port, '/');

  const rejected = await rawUpgrade(port, 'http://foreign.example');
  assert.match(rejected, /^HTTP\/1\.1 403 Forbidden/);

  const client = await websocketClient(port);
  t.after(() => client.close());
  await client.next((message) => message.type === 'state');
  client.sendUnmasked('{}');
  const closed = await client.nextClose();
  assert.equal(closed.code, 1002);
  assert.match(closed.reason, /masked/);

  const reserved = await websocketClient(port);
  t.after(() => reserved.close());
  await reserved.next((message) => message.type === 'state');
  reserved.sendOpcode(0xB, '');
  assert.equal((await reserved.nextClose()).code, 1002);
});

test('the WebSocket frame contract handles controls and rejects every unsupported frame class', async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, [
    'src/viewer/server.js', '--port', String(port), '--doc', 'diagrams/example.turtlepen.json',
  ], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  await waitForResponse(port, '/');

  const freshClient = async () => {
    const client = await websocketClient(port);
    t.after(() => client.close());
    await client.next((message) => message.type === 'state');
    return client;
  };

  const healthy = await freshClient();
  healthy.sendFrame({ opcode: 0x9, payload: 'health' });
  const pong = await healthy.nextControl((frame) => frame.opcode === 0xA);
  assert.equal(pong.payload.toString('utf8'), 'health');
  healthy.sendFrame({ opcode: 0xA, payload: 'client-pong' });
  healthy.send({ type: 'call', id: 'after-pong', tool: 'history', args: { action: 'status' } });
  assert.equal((await healthy.next((message) => message.id === 'after-pong')).ok, true,
    'a client pong must leave the connection usable');

  const fragmented = await freshClient();
  fragmented.sendFrame({ fin: false, payload: '{}' });
  assert.equal((await fragmented.nextClose()).code, 1003);

  const binary = await freshClient();
  binary.sendFrame({ opcode: 0x2, payload: Buffer.from('{}') });
  assert.equal((await binary.nextClose()).code, 1003);

  const invalidUtf8 = await freshClient();
  invalidUtf8.sendFrame({ payload: Buffer.from([0xc3, 0x28]) });
  assert.equal((await invalidUtf8.nextClose()).code, 1007);

  const oversized = await freshClient();
  oversized.sendFrame({ payload: Buffer.alloc((64 * 1024) + 1, 0x61) });
  assert.equal((await oversized.nextClose()).code, 1009);

  const oversizedControl = await freshClient();
  oversizedControl.sendFrame({ opcode: 0x9, payload: Buffer.alloc(126) });
  assert.equal((await oversizedControl.nextClose()).code, 1002);

  const malformedClose = await freshClient();
  malformedClose.sendFrame({ opcode: 0x8, payload: Buffer.from([0x03]) });
  assert.equal((await malformedClose.nextClose()).code, 1002);

  const reservedBits = await freshClient();
  reservedBits.sendFrame({ rsv: 0x40, payload: '{}' });
  assert.equal((await reservedBits.nextClose()).code, 1002);

  const cleanClose = await freshClient();
  const closePayload = Buffer.alloc(2 + Buffer.byteLength('done'));
  closePayload.writeUInt16BE(1000, 0);
  closePayload.write('done', 2);
  cleanClose.sendFrame({ opcode: 0x8, payload: closePayload });
  assert.deepEqual(await cleanClose.nextClose(), { code: 1000, reason: 'done' });
});

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close((err) => err ? reject(err) : resolvePort(port));
    });
  });
}

async function waitForResponse(port, path) {
  let last;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { return await response(port, path); }
    catch (err) { last = err; await new Promise((resolveWait) => setTimeout(resolveWait, 25)); }
  }
  throw last;
}

function response(port, path, { method = 'GET' } = {}) {
  return new Promise((resolveResponse, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolveResponse({ status: res.statusCode, headers: res.headers, body }));
    });
    req.once('error', reject);
    req.end();
  });
}

function rawUpgrade(port, origin) {
  return new Promise((resolveUpgrade, reject) => {
    const socket = connectSocket(port, '127.0.0.1');
    let data = '';
    socket.setEncoding('utf8');
    socket.once('error', reject);
    socket.on('data', (chunk) => {
      data += chunk;
      if (data.includes('\r\n\r\n')) { socket.destroy(); resolveUpgrade(data); }
    });
    socket.on('connect', () => socket.write(upgradeRequest(port, origin)));
  });
}

function upgradeRequest(port, origin, key = randomBytes(16).toString('base64')) {
  return [
    'GET /ws HTTP/1.1',
    `Host: 127.0.0.1:${port}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Origin: ${origin}`,
    'Sec-WebSocket-Version: 13',
    `Sec-WebSocket-Key: ${key}`,
    '', '',
  ].join('\r\n');
}

function websocketClient(port) {
  return new Promise((resolveClient, reject) => {
    const socket = connectSocket(port, '127.0.0.1');
    let pendingBytes = Buffer.alloc(0);
    let upgraded = false;
    const messages = [];
    const closes = [];
    const controls = [];
    const messageWaiters = [];
    const closeWaiters = [];
    const controlWaiters = [];

    const deliver = (queue, waiters, value) => {
      const index = waiters.findIndex((waiter) => !waiter.predicate || waiter.predicate(value));
      if (index >= 0) {
        const [waiter] = waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(value);
      } else queue.push(value);
    };
    const awaitValue = (queue, waiters, predicate = null) => {
      const index = queue.findIndex((value) => !predicate || predicate(value));
      if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
      return new Promise((resolveValue, rejectValue) => {
        const waiter = { predicate, resolve: resolveValue, timer: null };
        waiter.timer = setTimeout(() => {
          const at = waiters.indexOf(waiter);
          if (at >= 0) waiters.splice(at, 1);
          rejectValue(new Error('timed out waiting for WebSocket frame'));
        }, 3000);
        waiters.push(waiter);
      });
    };

    const parseFrames = () => {
      while (pendingBytes.length >= 2) {
        const opcode = pendingBytes[0] & 0x0f;
        let length = pendingBytes[1] & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (pendingBytes.length < 4) return;
          length = pendingBytes.readUInt16BE(2); offset = 4;
        } else if (length === 127) {
          if (pendingBytes.length < 10) return;
          length = Number(pendingBytes.readBigUInt64BE(2)); offset = 10;
        }
        if (pendingBytes.length < offset + length) return;
        const payload = pendingBytes.subarray(offset, offset + length);
        pendingBytes = pendingBytes.subarray(offset + length);
        if (opcode === 0x1) deliver(messages, messageWaiters, JSON.parse(payload.toString('utf8')));
        if (opcode === 0x8) deliver(closes, closeWaiters, {
          code: payload.length >= 2 ? payload.readUInt16BE(0) : 1005,
          reason: payload.length > 2 ? payload.subarray(2).toString('utf8') : '',
        });
        if (opcode === 0x9 || opcode === 0xA) deliver(controls, controlWaiters, { opcode, payload });
      }
    };

    socket.once('error', reject);
    socket.on('data', (chunk) => {
      pendingBytes = Buffer.concat([pendingBytes, chunk]);
      if (!upgraded) {
        const boundary = pendingBytes.indexOf('\r\n\r\n');
        if (boundary < 0) return;
        const header = pendingBytes.subarray(0, boundary).toString('utf8');
        if (!header.startsWith('HTTP/1.1 101')) return reject(new Error(`upgrade failed: ${header}`));
        pendingBytes = pendingBytes.subarray(boundary + 4);
        upgraded = true;
        resolveClient({
          next: (predicate) => awaitValue(messages, messageWaiters, predicate),
          nextClose: () => awaitValue(closes, closeWaiters),
          nextControl: (predicate) => awaitValue(controls, controlWaiters, predicate),
          send: (message) => socket.write(clientFrame(JSON.stringify(message), true)),
          sendBatch: (messages_) => socket.write(Buffer.concat(messages_.map((message) => clientFrame(JSON.stringify(message), true)))),
          sendRaw: (text) => socket.write(clientFrame(text, true)),
          sendUnmasked: (text) => socket.write(clientFrame(text, false)),
          sendOpcode: (opcode, text) => socket.write(clientFrame(text, true, opcode)),
          sendFrame: ({ payload = '', opcode = 0x1, fin = true, rsv = 0 }) =>
            socket.write(clientFrame(payload, true, opcode, { fin, rsv })),
          close: () => socket.destroy(),
        });
      }
      parseFrames();
    });
    socket.on('connect', () => socket.write(upgradeRequest(port, `http://127.0.0.1:${port}`)));
  });
}

function clientFrame(value, masked, opcode = 0x1, { fin = true, rsv = 0 } = {}) {
  const payload = Buffer.isBuffer(value) ? value : Buffer.from(value);
  let header;
  if (payload.length < 126) {
    header = Buffer.from([(fin ? 0x80 : 0) | rsv | opcode, payload.length]);
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = (fin ? 0x80 : 0) | rsv | opcode;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = (fin ? 0x80 : 0) | rsv | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  if (!masked) return Buffer.concat([header, payload]);
  const mask = randomBytes(4);
  const body = Buffer.from(payload);
  for (let index = 0; index < body.length; index += 1) body[index] ^= mask[index % 4];
  header[1] |= 0x80;
  return Buffer.concat([header, mask, body]);
}
