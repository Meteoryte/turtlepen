#!/usr/bin/env node
/** Local live editor: static UI, compatibility state endpoint, and WebSocket. */

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, extname, resolve } from 'node:path';

import * as core from '../core/index.js';
import { createSession, createTools } from '../mcp/tools.js';
import { VIEWER_STATIC_FILES, VIEWER_TOOLS } from './capabilities.js';

const here = dirname(fileURLToPath(import.meta.url));
const BRAND_MARK = resolve(here, '../../brand/logo-mark.svg');
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const PORT = Number(argOf('port', 8791));
const HOST = argOf('host', '127.0.0.1');
const DOC_PATH = resolve(process.cwd(), argOf('doc', 'diagrams/example.turtlepen.json'));
const MAX_MESSAGE_BYTES = 64 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const STATIC_FILES = new Set(VIEWER_STATIC_FILES);
const SECURITY_HEADERS = {
  // The trusted core renderer emits an SVG <style> block and per-element fill
  // styles. Script remains external-only; inline style is limited to rendering.
  'content-security-policy': "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};
const ALLOWED_TOOLS = new Set(VIEWER_TOOLS);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  process.stderr.write(`TurtlePen viewer: --port must be a whole number from 1 to 65535, got ${JSON.stringify(PORT)}\n`);
  process.exit(1);
}

// The operator named this document on the command line, so its directory is
// part of what this server was pointed at — even when it sits outside the
// project. An agent's own path arguments are still confined.
const session = createSession({ cwd: process.cwd(), roots: [dirname(DOC_PATH)] });
const tools = createTools(session);
const byName = new Map(tools.map((tool) => [tool.name, tool]));
const clients = new Set();
let revision = 0;
let knownDocument = null;
let loadError = null;
let reloadTimer = null;
let operationQueue = Promise.resolve();

function publicElement(doc, element, page) {
  const bounds = core.geometry.boundsOf(core.elementRects(element));
  const content = element.kind === 'text' ? element.text : element.label;
  const microMasks = core.microMasksOf(doc).filter((mask) => mask.target === element.id);
  return {
    id: element.id,
    page,
    kind: element.kind,
    role: element.role ?? (element.kind === 'path' ? 'connector' : null),
    at: bounds ? core.address.quadToAddress(bounds.x, bounds.y) : null,
    bounds,
    cells: bounds ? { w: bounds.w / 2, h: bounds.h / 2 } : null,
    label: content ?? null,
    corner: element.corner ?? null,
    align: element.align ?? null,
    fontSize: element.fontSize ?? null,
    fill: element.fill ?? null,
    mode: element.mode ?? null,
    fit: element.fit ?? null,
    detail: element.detail ?? null,
    supersample: element.supersample ?? null,
    scale: element.scale ?? null,
    ditherStats: element.ditherStats ?? null,
    processing: element.processing ?? null,
    relationship: element.relationship ?? null,
    relationshipLabel: element.relationshipLabel ?? null,
    outcome: element.outcome ?? null,
    description: element.description ?? null,
    technology: element.technology ?? null,
    tags: element.tags ?? [],
    properties: element.properties ?? {},
    perspectives: element.perspectives ?? {},
    microMasks,
    microMaskStatus: microMasks.length ? core.microMaskStatus(doc, element.id) : null,
    groups: core.groupsOf(doc).filter((group) => group.members.includes(element.id)).map((group) => group.id),
    follows: core.constraintsOf(doc).filter((constraint) => constraint.dependent === element.id).map((constraint) => constraint.id),
    followedBy: core.constraintsOf(doc).filter((constraint) => constraint.target === element.id).map((constraint) => constraint.id),
  };
}

function publicGroup(doc, group) {
  const bounds = core.groupBounds(doc, group.id);
  return {
    id: group.id,
    label: group.label,
    members: [...group.members],
    bounds,
    pages: [...new Set(group.members.map((id) => core.findElement(doc, id)?.page).filter(Boolean))],
  };
}

function publicConstraint(doc, constraint) {
  const dependentAt = core.elementAnchor(doc, constraint.dependent, constraint.dependentAnchor);
  const targetAt = core.elementAnchor(doc, constraint.target, constraint.targetAnchor);
  const actualOffset = { x: dependentAt.x - targetAt.x, y: dependentAt.y - targetAt.y };
  return {
    ...constraint,
    offset: { ...constraint.offset },
    dependentAt,
    targetAt,
    actualOffset,
    synchronized: actualOffset.x === constraint.offset.x && actualOffset.y === constraint.offset.y,
  };
}

async function state(since = null, view = null, detail = 'full') {
  if (loadError || !session.doc) {
    return { ok: false, path: DOC_PATH, revision, error: loadError ?? `no diagram at ${DOC_PATH}` };
  }
  let mtime = null;
  try { mtime = (await stat(DOC_PATH)).mtimeMs; } catch { /* represented by the live document */ }
  if (since !== null && Number(since) === mtime) return { ok: true, unchanged: true, mtime };

  if (!['full', 'canvas'].includes(detail)) {
    return { ok: false, path: DOC_PATH, revision, error: `state detail must be full or canvas — got ${JSON.stringify(detail)}` };
  }
  const doc = session.doc;
  let resolved;
  try { resolved = core.resolveView(doc, view); }
  catch (err) { return { ok: false, path: DOC_PATH, revision, error: err.message }; }
  const selected = resolved.elementIds;
  const validation = core.validate(doc);
  const svg = core.renderSvg(doc, { view, findings: validation.open, showGrid: true });
  const canonicalSvg = view == null ? svg : core.renderSvg(doc, { findings: validation.open, showGrid: true });
  const quality = core.perceptualVerdicts(doc, {
    structural: validation,
    currentRenderHash: core.renderHash(canonicalSvg),
  });
  const readiness = validation.summary.state !== 'structurally-clear'
    ? validation.summary.state
    : !quality.perceptual.reviewed
      ? 'review-missing'
      : quality.perceptual.stale
        ? 'review-stale'
        : quality.perceptual.blocking
          ? 'perceptual-blockers'
          : 'publishable';
  return {
    ok: true,
    path: DOC_PATH,
    mtime,
    revision,
    hash: core.documentHash(doc),
    name: doc.name,
    view: resolved.view,
    views: doc.views,
    theme: doc.theme,
    resources: doc.resources,
    pages: doc.pages,
    elements: doc.pages.flatMap((page) => core.elementsOf(doc, page.id)
      .filter((element) => selected.has(element.id))
      .map((element) => publicElement(doc, element, page.id))),
    groups: core.groupsOf(doc).filter((group) => group.members.some((id) => selected.has(id))).map((group) => publicGroup(doc, group)),
    constraints: core.constraintsOf(doc).filter((constraint) => selected.has(constraint.dependent) && selected.has(constraint.target))
      .map((constraint) => publicConstraint(doc, constraint)),
    history: {
      undo: session.history.length,
      redo: session.future.length,
      nextUndo: session.history.at(-1)?.label ?? null,
      nextRedo: session.future.at(-1)?.label ?? null,
      limit: session.historyLimit,
      persistence: session.historyNotice,
      entries: session.history.slice(-50).reverse().map((entry, index) => ({ index, label: entry.label })),
      futureEntries: session.future.slice(-50).reverse().map((entry, index) => ({ index, label: entry.label })),
    },
    lattice: core.latticeInfo(doc),
    summary: validation.summary,
    quality,
    readiness,
    findings: validation.open,
    accepted: validation.accepted,
    stale: validation.staleAcceptances,
    model: core.inspectModel(doc),
    ascii: detail === 'full' ? core.renderAscii(doc, { findings: validation.open }).text : null,
    svg,
  };
}

function sendFrame(socket, opcode, payload = Buffer.alloc(0)) {
  if (typeof payload === 'string') payload = Buffer.from(payload);
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x80 | opcode, payload.length]);
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  if (!socket.destroyed) socket.write(Buffer.concat([header, payload]));
}

function closeSocket(socket, code, reason) {
  const reasonBytes = Buffer.from(reason).subarray(0, 123);
  const payload = Buffer.alloc(2 + reasonBytes.length);
  payload.writeUInt16BE(code, 0);
  reasonBytes.copy(payload, 2);
  sendFrame(socket, 0x8, payload);
  socket.end();
}

function sendJson(socket, message) {
  sendFrame(socket, 0x1, JSON.stringify(message));
}

async function publishState() {
  const payload = { type: 'state', state: await state() };
  for (const socket of clients) sendJson(socket, payload);
}

function queuePublish() {
  operationQueue = operationQueue.then(publishState).catch((err) => {
    process.stderr.write(`TurtlePen viewer broadcast failed: ${err.message}\n`);
  });
}

async function loadFromDisk({ broadcast = true } = {}) {
  try {
    const candidate = await core.loadDocument(DOC_PATH);
    const serialized = core.serialize(candidate);
    if (serialized === knownDocument && !loadError) return false;
    await byName.get('open_diagram').handler({ path: DOC_PATH });
    knownDocument = core.serialize(session.doc);
    loadError = null;
    revision += 1;
  } catch (err) {
    const nextError = err.code === 'ENOENT' ? `no diagram at ${DOC_PATH}` : `cannot load ${DOC_PATH}: ${err.message}`;
    if (nextError === loadError) return false;
    loadError = nextError;
    revision += 1;
  }
  if (broadcast) await publishState();
  return true;
}

async function handleMessage(socket, text) {
  let message;
  try { message = JSON.parse(text); } catch { return sendJson(socket, { type: 'error', error: 'message must be valid JSON' }); }
  if (!message || message.type !== 'call' || typeof message.id !== 'string' || typeof message.tool !== 'string') {
    return sendJson(socket, { type: 'error', id: message?.id ?? null, error: 'expected { type:"call", id, tool, args }' });
  }
  if (!ALLOWED_TOOLS.has(message.tool)) {
    return sendJson(socket, { type: 'result', id: message.id, ok: false, error: `tool "${message.tool}" is not available in the live editor` });
  }
  if (loadError || !session.doc) {
    return sendJson(socket, { type: 'result', id: message.id, ok: false, error: loadError ?? 'no diagram loaded' });
  }

  operationQueue = operationQueue.then(async () => {
    const before = core.serialize(session.doc);
    try {
      const result = await byName.get(message.tool).handler(message.args ?? {});
      const after = core.serialize(session.doc);
      sendJson(socket, { type: 'result', id: message.id, ok: true, text: String(result) });
      if (after !== before) {
        knownDocument = after;
        loadError = null;
        revision += 1;
        await publishState();
      } else if (message.tool === 'history' && message.args?.action === 'clear') {
        await publishState();
      }
    } catch (err) {
      sendJson(socket, { type: 'result', id: message.id, ok: false, error: err.message });
    }
  }).catch((err) => {
    process.stderr.write(`TurtlePen viewer operation failed: ${err.stack ?? err.message}\n`);
  });
}

function attachFrames(socket) {
  let pending = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 2) {
      const first = pending[0];
      const second = pending[1];
      const fin = Boolean(first & 0x80);
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;
      if (first & 0x70) return closeSocket(socket, 1002, 'reserved frame bits are not supported');
      if (!fin) return closeSocket(socket, 1003, 'fragmented messages are not supported');
      if (!masked) return closeSocket(socket, 1002, 'client frames must be masked');
      if (length === 126) {
        if (pending.length < 4) return;
        length = pending.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (pending.length < 10) return;
        const large = pending.readBigUInt64BE(2);
        if (large > BigInt(MAX_MESSAGE_BYTES)) return closeSocket(socket, 1009, 'message too large');
        length = Number(large);
        offset = 10;
      }
      if (length > MAX_MESSAGE_BYTES) return closeSocket(socket, 1009, 'message too large');
      if (opcode >= 0x8 && length > 125) return closeSocket(socket, 1002, 'control frame is too large');
      if (pending.length < offset + 4 + length) return;
      const mask = pending.subarray(offset, offset + 4);
      const payload = Buffer.from(pending.subarray(offset + 4, offset + 4 + length));
      pending = pending.subarray(offset + 4 + length);
      for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];

      if (opcode === 0x8) {
        if (payload.length === 1) return closeSocket(socket, 1002, 'invalid close frame');
        sendFrame(socket, 0x8, payload); socket.end(); return;
      }
      if (opcode === 0x9) { sendFrame(socket, 0xA, payload); continue; }
      if (opcode === 0xA) continue;
      if (opcode === 0x0 || opcode > 0xA) return closeSocket(socket, 1002, 'reserved opcode');
      if (opcode !== 0x1) return closeSocket(socket, 1003, 'text messages only');
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(payload); }
      catch { return closeSocket(socket, 1007, 'text message must be valid UTF-8'); }
      handleMessage(socket, text);
    }
  });
  socket.on('close', () => clients.delete(socket));
  socket.on('error', () => clients.delete(socket));
}

function validOrigin(req) {
  try {
    const origin = new URL(req.headers.origin);
    const allowedHosts = new Set([HOST, '127.0.0.1', 'localhost', '::1']);
    return ['http:', 'https:'].includes(origin.protocol)
      && allowedHosts.has(origin.hostname)
      && Number(origin.port || (origin.protocol === 'https:' ? 443 : 80)) === PORT;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  try {
    const end = (body) => res.end(req.method === 'HEAD' ? undefined : body);
    if (!['GET', 'HEAD'].includes(req.method ?? 'GET')) {
      res.writeHead(405, { ...SECURITY_HEADERS, allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' });
      return end('method not allowed');
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/api/state') {
      const view = url.searchParams.get('view');
      const body = JSON.stringify(await state(url.searchParams.get('since'), view || null, url.searchParams.get('detail') ?? 'full'));
      res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' });
      return end(body);
    }
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204, { ...SECURITY_HEADERS, 'cache-control': 'public, max-age=86400' });
      return end();
    }
    if (url.pathname === '/brand-logo.svg') {
      const body = await readFile(BRAND_MARK);
      res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' });
      return end(body);
    }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    if (!STATIC_FILES.has(file)) {
      res.writeHead(404, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' });
      return end('not found');
    }
    const full = resolve(here, file);
    const body = await readFile(full);
    res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': MIME[extname(full)] ?? 'application/octet-stream' });
    return end(body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' });
    return res.end(req.method === 'HEAD' ? undefined : (err.code === 'ENOENT' ? 'not found' : `error: ${err.message}`));
  }
});

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const key = req.headers['sec-websocket-key'];
  let decodedKey = null;
  try { decodedKey = Buffer.from(String(key), 'base64'); } catch { /* invalid below */ }
  if (url.pathname !== '/ws' || !validOrigin(req) || req.headers['sec-websocket-version'] !== '13'
      || !decodedKey || decodedKey.length !== 16 || !/websocket/i.test(req.headers.upgrade ?? '')) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n',
  ].join('\r\n'));
  clients.add(socket);
  attachFrames(socket);
  state().then((current) => sendJson(socket, { type: 'state', state: current }));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    process.stderr.write(
      `TurtlePen viewer: port ${PORT} is already in use — most likely an earlier viewer is still running.\n`
      + `  Stop it, or start this one elsewhere:  node src/viewer/server.js --port ${PORT + 1}\n`,
    );
    process.exit(1);
  }
  process.stderr.write(`TurtlePen viewer failed to start: ${err.message}\n`);
  process.exit(1);
});

await loadFromDisk({ broadcast: false });

let fileWatcher = null;
try {
  fileWatcher = watch(dirname(DOC_PATH), (_event, filename) => {
    if (filename && basename(String(filename)) !== basename(DOC_PATH)) return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      operationQueue = operationQueue.then(() => loadFromDisk()).catch((err) => {
        process.stderr.write(`TurtlePen viewer reload failed: ${err.message}\n`);
      });
    }, 80);
  });
} catch (err) {
  process.stderr.write(`TurtlePen viewer file watch unavailable: ${err.message}\n`);
}

server.listen(PORT, HOST, () => {
  process.stdout.write(`TurtlePen live editor  http://${HOST}:${PORT}/\n  watching ${DOC_PATH}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearTimeout(reloadTimer);
    fileWatcher?.close();
    for (const socket of clients) socket.end();
    server.close(() => process.exit(0));
  });
}
