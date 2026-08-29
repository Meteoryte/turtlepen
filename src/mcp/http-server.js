#!/usr/bin/env node
/**
 * Stateful MCP Streamable HTTP transport for TurtlePen.
 *
 * This is a transport over the canonical tool registry, not a second diagram
 * implementation. Each cryptographically random MCP session owns one isolated
 * filesystem root, one active TurtlePen document, and one serial request queue.
 */

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_PROTOCOL,
  SERVER_INFO,
  SUPPORTED_PROTOCOLS,
  createProtocolRuntime,
  error as protocolError,
} from './protocol.js';

const MiB = 1024 * 1024;
const DEFAULT_BODY_LIMIT = 12 * MiB;
const DEFAULT_RESPONSE_LIMIT = 16 * MiB;
const DEFAULT_IDLE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_RATE_LIMIT = 120;
const DEFAULT_MAX_SESSIONS = 100;
const ACCEPT_JSON = 'application/json';
const ACCEPT_SSE = 'text/event-stream';

function positiveInteger(value, fallback, name) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new RangeError(`${name} must be a positive whole number`);
  }
  return parsed;
}

function csv(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

function digestLabel(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 12);
}

function secureEqual(actual, expected) {
  const left = createHash('sha256').update(String(actual)).digest();
  const right = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(left, right);
}

function parseBearer(header) {
  const match = /^Bearer[ \t]+(.+)$/i.exec(String(header ?? ''));
  return match?.[1] ?? null;
}

function accepts(header, mime) {
  return String(header ?? '')
    .split(',')
    .map((part) => part.split(';', 1)[0].trim().toLowerCase())
    .includes(mime);
}

function baseHeaders(extra = {}) {
  return {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  };
}

function sendJson(response, status, body, extra = {}) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, baseHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(encoded),
    ...extra,
  }));
  response.end(encoded);
}

function sendEmpty(response, status, extra = {}) {
  response.writeHead(status, baseHeaders(extra));
  response.end();
}

function sendSse(response, body, extra = {}) {
  const encoded = JSON.stringify(body);
  response.writeHead(200, baseHeaders({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
    ...extra,
  }));
  response.end(`event: message\ndata: ${encoded}\n\n`);
}

async function readBody(request, limit) {
  const chunks = [];
  let total = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > limit) {
      tooLarge = true;
      continue;
    }
    chunks.push(chunk);
  }
  if (tooLarge) {
    const error = new RangeError(`request body exceeds ${limit} bytes`);
    error.code = 'E_BODY_TOO_LARGE';
    throw error;
  }
  return Buffer.concat(chunks).toString('utf8');
}

function clientAddress(request, trustProxy) {
  if (trustProxy) {
    const forwarded = String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return request.socket.remoteAddress ?? 'unknown';
}

function isJsonRpcObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value) && value.jsonrpc === '2.0';
}

function isNotification(message) {
  return message.id === undefined || message.id === null;
}

function isClientResponse(message) {
  return message.method == null && ('result' in message || 'error' in message);
}

/**
 * @param {{
 *   host?: string, port?: number, endpoint?: string, healthPath?: string,
 *   dataDir?: string, bearerToken?: string|null, allowAnonymous?: boolean,
 *   allowedOrigins?: string[]|string, trustProxy?: boolean,
 *   bodyLimit?: number, responseLimit?: number, idleTtlMs?: number,
 *   absoluteTtlMs?: number, maxSessions?: number, requestsPerMinute?: number,
 *   historyLimit?: number, logger?: ((event: object) => void)|null
 * }} options
 */
export function createHttpMcpServer(options = {}) {
  if (process.env.TURTLEPEN_ALLOW_ANY_PATH === '1') {
    throw new Error('remote MCP refuses TURTLEPEN_ALLOW_ANY_PATH=1; every session must stay filesystem-confined');
  }

  const allowAnonymous = options.allowAnonymous
    ?? process.env.TURTLEPEN_HTTP_ALLOW_ANONYMOUS === '1';
  const bearerToken = options.bearerToken
    ?? process.env.TURTLEPEN_HTTP_BEARER_TOKEN
    ?? null;
  if (!allowAnonymous && !bearerToken) {
    throw new Error('remote MCP requires TURTLEPEN_HTTP_BEARER_TOKEN; set TURTLEPEN_HTTP_ALLOW_ANONYMOUS=1 only for isolated development');
  }

  const config = Object.freeze({
    host: options.host ?? process.env.TURTLEPEN_HTTP_HOST ?? '127.0.0.1',
    port: positiveInteger(options.port ?? process.env.TURTLEPEN_HTTP_PORT, 8792, 'HTTP port'),
    endpoint: options.endpoint ?? process.env.TURTLEPEN_HTTP_PATH ?? '/mcp',
    healthPath: options.healthPath ?? process.env.TURTLEPEN_HTTP_HEALTH_PATH ?? '/healthz',
    dataDir: resolve(options.dataDir ?? process.env.TURTLEPEN_HTTP_DATA_DIR ?? join(tmpdir(), 'turtlepen-http')),
    allowAnonymous,
    bearerToken,
    allowedOrigins: new Set(csv(options.allowedOrigins ?? process.env.TURTLEPEN_HTTP_ALLOWED_ORIGINS)),
    trustProxy: options.trustProxy ?? process.env.TURTLEPEN_HTTP_TRUST_PROXY === '1',
    bodyLimit: positiveInteger(options.bodyLimit ?? process.env.TURTLEPEN_HTTP_BODY_LIMIT, DEFAULT_BODY_LIMIT, 'body limit'),
    responseLimit: positiveInteger(options.responseLimit ?? process.env.TURTLEPEN_HTTP_RESPONSE_LIMIT, DEFAULT_RESPONSE_LIMIT, 'response limit'),
    idleTtlMs: positiveInteger(options.idleTtlMs ?? process.env.TURTLEPEN_HTTP_IDLE_TTL_MS, DEFAULT_IDLE_TTL_MS, 'idle TTL'),
    absoluteTtlMs: positiveInteger(options.absoluteTtlMs ?? process.env.TURTLEPEN_HTTP_ABSOLUTE_TTL_MS, DEFAULT_ABSOLUTE_TTL_MS, 'absolute TTL'),
    maxSessions: positiveInteger(options.maxSessions ?? process.env.TURTLEPEN_HTTP_MAX_SESSIONS, DEFAULT_MAX_SESSIONS, 'max sessions'),
    requestsPerMinute: positiveInteger(options.requestsPerMinute ?? process.env.TURTLEPEN_HTTP_REQUESTS_PER_MINUTE, DEFAULT_RATE_LIMIT, 'requests per minute'),
    historyLimit: options.historyLimit == null ? undefined : positiveInteger(options.historyLimit, null, 'history limit'),
  });

  const logger = options.logger === undefined
    ? (event) => process.stderr.write(`${JSON.stringify(event)}\n`)
    : options.logger;
  const sessions = new Map();
  const initializerRates = new Map();

  const audit = (event) => {
    if (logger) logger({ at: new Date().toISOString(), service: 'turtlepen-http', ...event });
  };

  const removeSession = async (id, reason) => {
    const entry = sessions.get(id);
    if (!entry) return false;
    sessions.delete(id);
    try {
      await rm(entry.cwd, { recursive: true, force: true });
      audit({ event: 'session_closed', session: entry.label, reason, storage: 'purged' });
    } catch (caught) {
      audit({
        event: 'session_closed',
        session: entry.label,
        reason,
        storage: 'purge_failed',
        error: caught?.code ?? caught?.name ?? 'Error',
      });
    }
    return true;
  };

  const expireSessions = async (now = Date.now()) => {
    const expired = [];
    for (const [id, entry] of sessions) {
      if (now - entry.lastSeen > config.idleTtlMs || now - entry.createdAt > config.absoluteTtlMs) {
        expired.push(removeSession(id,
          now - entry.createdAt > config.absoluteTtlMs ? 'absolute_ttl' : 'idle_ttl'));
      }
    }
    for (const [key, rate] of initializerRates) {
      if (now - rate.startedAt > 60_000) initializerRates.delete(key);
    }
    await Promise.all(expired);
  };

  const takeRateSlot = (rate, now = Date.now()) => {
    if (now - rate.startedAt >= 60_000) {
      rate.startedAt = now;
      rate.count = 0;
    }
    rate.count += 1;
    return rate.count <= config.requestsPerMinute;
  };

  const createEntry = async () => {
    await expireSessions();
    if (sessions.size >= config.maxSessions) return null;
    const id = randomUUID();
    const cwd = join(config.dataDir, id);
    await mkdir(cwd, { recursive: false });
    const runtime = createProtocolRuntime({
      cwd,
      historyLimit: config.historyLimit,
    });
    const now = Date.now();
    const entry = {
      id,
      label: digestLabel(id),
      cwd,
      runtime,
      createdAt: now,
      lastSeen: now,
      queue: Promise.resolve(),
      rate: { startedAt: now, count: 0 },
    };
    sessions.set(id, entry);
    audit({ event: 'session_created', session: entry.label });
    return entry;
  };

  const enqueue = async (entry, message) => {
    const run = entry.queue.then(() => entry.runtime.handle(message));
    entry.queue = run.catch(() => {});
    return run;
  };

  const server = createServer(async (request, response) => {
    const started = performance.now();
    let message = null;
    let entry = null;
    const url = new URL(request.url ?? '/', 'http://localhost');
    const remote = digestLabel(clientAddress(request, config.trustProxy));

    const finishAudit = (status, outcome, extra = {}) => audit({
      event: 'request_complete',
      remote,
      session: entry?.label ?? null,
      method: message?.method ?? request.method,
      tool: message?.method === 'tools/call' ? String(message.params?.name ?? '') : null,
      status,
      outcome,
      duration_ms: Math.round((performance.now() - started) * 100) / 100,
      ...extra,
    });

    try {
      if (url.pathname === config.healthPath && request.method === 'GET') {
        sendJson(response, 200, {
          status: 'ready',
          server: SERVER_INFO,
          protocol: DEFAULT_PROTOCOL,
          toolCount: createProtocolRuntime({ cwd: config.dataDir }).tools.length,
        });
        return finishAudit(200, 'health');
      }

      if (url.pathname !== config.endpoint) {
        sendJson(response, 404, protocolError(null, -32601, 'MCP endpoint not found'));
        return finishAudit(404, 'not_found');
      }

      const origin = request.headers.origin;
      if (origin && !config.allowedOrigins.has(origin)) {
        sendJson(response, 403, protocolError(null, -32000, 'origin is not allowed'));
        return finishAudit(403, 'origin_denied');
      }

      if (!config.allowAnonymous) {
        const supplied = parseBearer(request.headers.authorization);
        if (!supplied || !secureEqual(supplied, config.bearerToken)) {
          sendJson(response, 401, protocolError(null, -32001, 'authentication required'), {
            'WWW-Authenticate': 'Bearer',
          });
          return finishAudit(401, 'auth_denied');
        }
      }

      await expireSessions();

      if (request.method === 'GET') {
        sendEmpty(response, 405, { Allow: 'POST, DELETE' });
        return finishAudit(405, 'get_stream_not_supported');
      }

      if (request.method === 'DELETE') {
        const id = request.headers['mcp-session-id'];
        if (!id) {
          sendJson(response, 400, protocolError(null, -32600, 'Mcp-Session-Id is required'));
          return finishAudit(400, 'session_missing');
        }
        entry = sessions.get(String(id)) ?? null;
        if (!entry) {
          sendJson(response, 404, protocolError(null, -32001, 'MCP session not found'));
          return finishAudit(404, 'session_not_found');
        }
        await removeSession(entry.id, 'client_delete');
        sendEmpty(response, 204);
        return finishAudit(204, 'session_deleted');
      }

      if (request.method !== 'POST') {
        sendEmpty(response, 405, { Allow: 'POST, DELETE' });
        return finishAudit(405, 'method_not_allowed');
      }

      if (!accepts(request.headers.accept, ACCEPT_JSON) || !accepts(request.headers.accept, ACCEPT_SSE)) {
        sendJson(response, 406, protocolError(null, -32600,
          'Accept must include application/json and text/event-stream'));
        return finishAudit(406, 'accept_rejected');
      }
      if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
        sendJson(response, 415, protocolError(null, -32600, 'Content-Type must be application/json'));
        return finishAudit(415, 'content_type_rejected');
      }

      let body;
      try {
        body = await readBody(request, config.bodyLimit);
      } catch (caught) {
        if (caught.code === 'E_BODY_TOO_LARGE') {
          sendJson(response, 413, protocolError(null, -32600, caught.message));
          return finishAudit(413, 'body_too_large');
        }
        throw caught;
      }
      try {
        message = JSON.parse(body);
      } catch {
        sendJson(response, 400, protocolError(null, -32700, 'parse error'));
        return finishAudit(400, 'parse_error');
      }
      if (!isJsonRpcObject(message)) {
        sendJson(response, 400, protocolError(message?.id ?? null, -32600,
          'body must be one JSON-RPC 2.0 object; batches are not accepted'));
        return finishAudit(400, 'invalid_request');
      }

      const suppliedSession = request.headers['mcp-session-id'];
      if (message.method === 'initialize' && !suppliedSession) {
        const rateKey = remote;
        const rate = initializerRates.get(rateKey) ?? { startedAt: Date.now(), count: 0 };
        initializerRates.set(rateKey, rate);
        if (!takeRateSlot(rate)) {
          sendJson(response, 429, protocolError(message.id ?? null, -32002, 'rate limit exceeded'), {
            'Retry-After': '60',
          });
          return finishAudit(429, 'rate_limited');
        }
        if (isNotification(message)) {
          sendJson(response, 400, protocolError(null, -32600, 'initialize requires a request id'));
          return finishAudit(400, 'invalid_initialize');
        }
        entry = await createEntry();
        if (!entry) {
          sendJson(response, 503, protocolError(message.id, -32003, 'session capacity reached'));
          return finishAudit(503, 'session_capacity');
        }
      } else {
        if (!suppliedSession) {
          sendJson(response, 400, protocolError(message.id ?? null, -32600,
            'Mcp-Session-Id is required after initialization'));
          return finishAudit(400, 'session_missing');
        }
        entry = sessions.get(String(suppliedSession)) ?? null;
        if (!entry) {
          sendJson(response, 404, protocolError(message.id ?? null, -32001, 'MCP session not found'));
          return finishAudit(404, 'session_not_found');
        }
      }

      const protocolHeader = request.headers['mcp-protocol-version'];
      if (protocolHeader && !SUPPORTED_PROTOCOLS.includes(String(protocolHeader))) {
        sendJson(response, 400, protocolError(message.id ?? null, -32600,
          `unsupported MCP-Protocol-Version; supported: ${SUPPORTED_PROTOCOLS.join(', ')}`));
        return finishAudit(400, 'protocol_rejected');
      }
      if (protocolHeader && entry.runtime.protocolVersion
          && protocolHeader !== entry.runtime.protocolVersion) {
        sendJson(response, 400, protocolError(message.id ?? null, -32600,
          `MCP-Protocol-Version does not match negotiated ${entry.runtime.protocolVersion}`));
        return finishAudit(400, 'protocol_mismatch');
      }

      entry.lastSeen = Date.now();
      if (!takeRateSlot(entry.rate)) {
        sendJson(response, 429, protocolError(message.id ?? null, -32002, 'rate limit exceeded'), {
          'Retry-After': '60',
        });
        return finishAudit(429, 'rate_limited');
      }

      if (isClientResponse(message)) {
        sendEmpty(response, 202);
        return finishAudit(202, 'client_response_accepted');
      }
      if (message.method === 'tools/call' && isNotification(message)) {
        sendJson(response, 400, protocolError(null, -32600, 'tools/call requires a request id'));
        return finishAudit(400, 'tool_notification_rejected');
      }

      const protocolResponse = await enqueue(entry, message);
      if (isNotification(message)) {
        sendEmpty(response, 202);
        return finishAudit(202, 'notification_accepted');
      }
      if (!protocolResponse) {
        sendJson(response, 500, protocolError(message.id ?? null, -32603, 'request produced no response'));
        return finishAudit(500, 'empty_response');
      }
      const responseBytes = Buffer.byteLength(JSON.stringify(protocolResponse));
      if (responseBytes > config.responseLimit) {
        sendSse(response, protocolError(message.id ?? null, -32004,
          `response exceeds remote limit of ${config.responseLimit} bytes`), {
          'Mcp-Session-Id': entry.id,
        });
        return finishAudit(200, 'response_limited', { response_bytes: responseBytes });
      }
      sendSse(response, protocolResponse, { 'Mcp-Session-Id': entry.id });
      return finishAudit(200, protocolResponse.error ? 'protocol_error' : 'ok', {
        response_bytes: responseBytes,
      });
    } catch (caught) {
      if (!response.headersSent) {
        sendJson(response, 500, protocolError(message?.id ?? null, -32603, 'internal server error'));
      } else {
        response.end();
      }
      audit({
        event: 'internal_error',
        remote,
        session: entry?.label ?? null,
        error: caught?.code ?? caught?.name ?? 'Error',
      });
      return finishAudit(500, 'internal_error');
    }
  });

  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;

  const cleanupTimer = setInterval(() => {
    void expireSessions();
  }, Math.min(config.idleTtlMs, 60_000));
  cleanupTimer.unref();

  return {
    server,
    sessions,
    config,
    async listen({ port = config.port, host = config.host } = {}) {
      await mkdir(config.dataDir, { recursive: true });
      return new Promise((resolvePromise, reject) => {
        const onError = (caught) => {
          server.off('listening', onListening);
          reject(caught);
        };
        const onListening = () => {
          server.off('error', onError);
          resolvePromise(server.address());
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
    },
    async close() {
      clearInterval(cleanupTimer);
      if (server.listening) {
        await new Promise((resolvePromise, reject) => server.close((caught) => (
          caught ? reject(caught) : resolvePromise()
        )));
      }
      await Promise.all([...sessions.keys()].map((id) => removeSession(id, 'server_close')));
    },
  };
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  try {
    const service = createHttpMcpServer();
    const address = await service.listen();
    process.stderr.write(`[turtlepen-http] ready — ${SERVER_INFO.version}, ${address.address}:${address.port}${service.config.endpoint}\n`);
    const stop = async () => {
      await service.close();
      process.exit(0);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (caught) {
    process.stderr.write(`[turtlepen-http] startup failed: ${caught.message}\n`);
    process.exit(1);
  }
}
