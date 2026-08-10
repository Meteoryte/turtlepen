#!/usr/bin/env node
/**
 * Live viewer — a small static server plus a state endpoint.
 *
 * The MCP server writes the document to disk on every mutation, so the viewer
 * only needs to watch that file. Keeping the two processes decoupled through
 * the file means the AI can work headless and a human can watch, without either
 * depending on the other being up.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, extname, relative, isAbsolute } from 'node:path';

import * as core from '../core/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const BRAND_MARK = resolve(here, '../../brand/logo-mark.svg');
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const PORT = Number(argOf('port', 8791));
const HOST = argOf('host', '127.0.0.1');
const DOC_PATH = resolve(process.cwd(), argOf('doc', 'diagrams/example.turtlepen.json'));

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

async function state(since = null) {
  let doc;
  let info;
  try {
    // Check the cheap file timestamp before loading, validating, and rendering
    // the whole document. Large artwork documents otherwise made every quiet
    // poll as expensive as the initial page load.
    info = await stat(DOC_PATH);
    if (since !== null && Number(since) === info.mtimeMs) {
      return { ok: true, unchanged: true, mtime: info.mtimeMs };
    }
    doc = await core.loadDocument(DOC_PATH);
  } catch (err) {
    return { ok: false, path: DOC_PATH, error: err.code === 'ENOENT' ? `no diagram at ${DOC_PATH}` : err.message };
  }
  const validation = core.validate(doc);
  return {
    ok: true,
    path: DOC_PATH,
    mtime: info.mtimeMs,
    name: doc.name,
    pages: doc.pages,
    lattice: core.latticeInfo(doc),
    summary: validation.summary,
    findings: validation.open,
    accepted: validation.accepted,
    stale: validation.staleAcceptances,
    ascii: core.renderAscii(doc, { findings: validation.open }).text,
    svg: core.renderSvg(doc, { findings: validation.open, showGrid: true }),
  };
}

const server = createServer(async (req, res) => {
  try {
    // The viewer is local-only; a Host header should never influence routing.
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/api/state') {
      const body = JSON.stringify(await state(url.searchParams.get('since')));
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(body);
    }
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204, { 'cache-control': 'public, max-age=86400' });
      return res.end();
    }
    if (url.pathname === '/brand-logo.svg') {
      const body = await readFile(BRAND_MARK);
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' });
      return res.end(body);
    }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const full = join(here, file);
    const rel = relative(here, full);
    if (rel.startsWith('..') || isAbsolute(rel)) { res.writeHead(403); return res.end('forbidden'); }
    const body = await readFile(full);
    res.writeHead(200, { 'content-type': MIME[extname(full)] ?? 'application/octet-stream' });
    return res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain' });
    res.end(err.code === 'ENOENT' ? 'not found' : `error: ${err.message}`);
  }
});

// An occupied port usually means an older viewer is still running and serving
// stale code, which is a confusing thing to debug. Say so plainly instead of
// dying on an unhandled error event.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    process.stderr.write(
      `TurtlePen viewer: port ${PORT} is already in use — most likely an earlier viewer is still running.\n` +
        `  Stop it, or start this one elsewhere:  node src/viewer/server.js --port ${PORT + 1}\n`,
    );
    process.exit(1);
  }
  process.stderr.write(`TurtlePen viewer failed to start: ${err.message}\n`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`TurtlePen viewer  http://${HOST}:${PORT}/\n  watching ${DOC_PATH}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
