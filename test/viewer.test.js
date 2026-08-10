import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

function response(port, path) {
  return new Promise((resolveResponse, reject) => {
    const req = request({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolveResponse({ status: res.statusCode, body }));
    });
    req.once('error', reject);
    req.end();
  });
}
