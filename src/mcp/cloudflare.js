/**
 * Canonical TurtlePen MCP for Cloudflare-hosted runtimes.
 *
 * This is a deployment adapter over the same core and tool registry used by
 * stdio and the Node HTTP server. D1 owns session metadata and optimistic
 * concurrency; R2 owns versioned session state and the confined filesystem.
 * Bind them as DB and ARTIFACTS respectively.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import * as core from "../core/index.js";
import {
  buildInstructions,
  DEFAULT_PROTOCOL,
  SERVER_INFO,
  SUPPORTED_PROTOCOLS
} from "./protocol.js";
import {
  createSession,
  createTools,
  structuredToolOutput
} from "./tools.js";
const dynamic = "force-dynamic";
const MiB = 1024 * 1024;
const BODY_LIMIT = 12 * MiB;
const RESPONSE_LIMIT = 16 * MiB;
const STATE_LIMIT = 24 * MiB;
const FILE_LIMIT = 16 * MiB;
const TOTAL_FILE_LIMIT = 24 * MiB;
const FILE_COUNT_LIMIT = 64;
const IDLE_TTL_MS = 60 * 60 * 1e3;
const ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1e3;
const REQUESTS_PER_MINUTE = 120;
const INITIALIZATIONS_PER_MINUTE = 30;
const MAX_SESSIONS = 500;
const HOSTED_HISTORY_LIMIT = 20;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class HostedError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
async function defaultBindings() {
  const { env } = await import("cloudflare:workers");
  const bound = env;
  if (!bound.DB || !bound.ARTIFACTS) {
    throw new HostedError(
      "TurtlePen hosted storage is unavailable; bind Cloudflare D1 as DB and R2 as ARTIFACTS (ChatGPT Sites declares these in .openai/hosting.json).",
      503,
      -32003
    );
  }
  return { db: bound.DB, artifacts: bound.ARTIFACTS };
}
async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS turtlepen_sessions (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    rate_started_at INTEGER NOT NULL,
    rate_count INTEGER NOT NULL
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS turtlepen_sessions_expires_at ON turtlepen_sessions(expires_at)").run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS turtlepen_initializers (
    client_key TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    request_count INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`).run();
}
const errorPayload = (id, code, message) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message }
});
function baseHeaders(contentType, sessionId) {
  return {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, OAI-Sites-Authorization",
    "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...sessionId ? { "Mcp-Session-Id": sessionId } : {}
  };
}
function jsonResponse(payload, status, sessionId) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: baseHeaders("application/json; charset=utf-8", sessionId)
  });
}
function sseResponse(payload, sessionId) {
  return new Response(`event: message
data: ${JSON.stringify(payload)}

`, {
    status: 200,
    headers: {
      ...baseHeaders("text/event-stream; charset=utf-8", sessionId),
      "X-Accel-Buffering": "no"
    }
  });
}
function isRpcMessage(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && value.jsonrpc === "2.0");
}
function accepts(request, mediaType) {
  return String(request.headers.get("accept") ?? "").split(",").map((part) => part.split(";", 1)[0].trim().toLowerCase()).includes(mediaType);
}
function clientKey(request) {
  const address = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",", 1)[0].trim() ?? "unknown";
  return createHash("sha256").update(address).digest("hex").slice(0, 24);
}
const stateKey = (id, version) => `turtlepen/${id}/v${version}/state.json`;
const filesPrefix = (id, version) => `turtlepen/${id}/v${version}/files/`;
const sessionPrefix = (id) => `turtlepen/${id}/`;
const sessionRoot = (id) => join(tmpdir(), "turtlepen-hosted", id);
async function removeSessionRoot(root) {
  try {
    await rm(root, { recursive: true });
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
}
async function listAll(bucket, prefix) {
  const objects = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 256 });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : void 0;
  } while (cursor);
  return objects;
}
async function purgePrefix(bucket, prefix) {
  const objects = await listAll(bucket, prefix);
  for (let index = 0; index < objects.length; index += 128) {
    await bucket.delete(objects.slice(index, index + 128).map((object) => object.key));
  }
}
async function cleanupExpired(db, bucket, now = Date.now()) {
  const expired = await db.prepare(
    "SELECT id FROM turtlepen_sessions WHERE expires_at <= ? ORDER BY expires_at LIMIT 10"
  ).bind(now).all();
  for (const row of expired.results ?? []) {
    await db.prepare("DELETE FROM turtlepen_sessions WHERE id = ? AND expires_at <= ?").bind(row.id, now).run();
    await purgePrefix(bucket, sessionPrefix(row.id));
  }
  await db.prepare("DELETE FROM turtlepen_initializers WHERE expires_at <= ?").bind(now).run();
}
async function takeInitializerSlot(db, key, now = Date.now()) {
  const row = await db.prepare(
    "SELECT started_at, request_count FROM turtlepen_initializers WHERE client_key = ?"
  ).bind(key).first();
  if (!row || now - row.started_at >= 6e4) {
    await db.prepare(`INSERT INTO turtlepen_initializers (client_key, started_at, request_count, expires_at)
      VALUES (?, ?, 1, ?) ON CONFLICT(client_key) DO UPDATE SET
      started_at = excluded.started_at, request_count = 1, expires_at = excluded.expires_at`).bind(key, now, now + 6e4).run();
    return true;
  }
  if (row.request_count >= INITIALIZATIONS_PER_MINUTE) return false;
  await db.prepare("UPDATE turtlepen_initializers SET request_count = request_count + 1, expires_at = ? WHERE client_key = ?").bind(now + 6e4, key).run();
  return true;
}
function blankState(now = Date.now()) {
  const startedAt = new Date(now).toISOString();
  return {
    schema: 1,
    createdAt: startedAt,
    startedAt,
    historyLimit: HOSTED_HISTORY_LIMIT,
    document: null,
    path: null,
    diskHash: null,
    history: [],
    future: [],
    historyNotice: "no diagram is open",
    progress: { checks: [] },
    reviewCandidate: null,
    lastRender: null
  };
}
async function putState(bucket, id, version, state) {
  const encoded = JSON.stringify(state);
  if (Buffer.byteLength(encoded) > STATE_LIMIT) {
    throw new HostedError(
      `TurtlePen session state exceeds the hosted ${STATE_LIMIT}-byte limit; shorten history or split the diagram. Nothing was truncated.`,
      413,
      -32004
    );
  }
  await bucket.put(stateKey(id, version), encoded);
}
async function getState(bucket, row) {
  const object = await bucket.get(stateKey(row.id, row.version));
  if (!object) throw new HostedError("MCP session state is missing", 410, -32001);
  const state = JSON.parse(Buffer.from(await object.arrayBuffer()).toString("utf8"));
  if (state.schema !== 1) throw new HostedError("MCP session state uses an unsupported schema", 409, -32001);
  return state;
}
async function createStoredSession(db, bucket, now = Date.now()) {
  const active = await db.prepare("SELECT COUNT(*) AS count FROM turtlepen_sessions WHERE expires_at > ?").bind(now).first();
  if ((active?.count ?? 0) >= MAX_SESSIONS) {
    throw new HostedError("TurtlePen session capacity reached", 503, -32003);
  }
  const id = randomUUID();
  const version = 1;
  await putState(bucket, id, version, blankState(now));
  try {
    await db.prepare(`INSERT INTO turtlepen_sessions
      (id, version, created_at, last_seen, expires_at, rate_started_at, rate_count)
      VALUES (?, ?, ?, ?, ?, ?, 1)`).bind(id, version, now, now, now + IDLE_TTL_MS, now).run();
  } catch (error) {
    await purgePrefix(bucket, sessionPrefix(id));
    throw error;
  }
  return await db.prepare("SELECT * FROM turtlepen_sessions WHERE id = ?").bind(id).first();
}
async function loadStoredSession(db, bucket, id, now = Date.now()) {
  if (!SESSION_ID.test(id)) throw new HostedError("Mcp-Session-Id is malformed", 400, -32600);
  const row = await db.prepare("SELECT * FROM turtlepen_sessions WHERE id = ?").bind(id).first();
  if (!row || row.expires_at <= now) {
    if (row) {
      await db.prepare("DELETE FROM turtlepen_sessions WHERE id = ?").bind(id).run();
      await purgePrefix(bucket, sessionPrefix(id));
    }
    throw new HostedError("MCP session not found or expired", 404, -32001);
  }
  let rateStarted = row.rate_started_at;
  let rateCount = row.rate_count;
  if (now - rateStarted >= 6e4) {
    rateStarted = now;
    rateCount = 0;
  }
  if (rateCount >= REQUESTS_PER_MINUTE) {
    throw new HostedError("TurtlePen session rate limit exceeded", 429, -32002);
  }
  row.rate_started_at = rateStarted;
  row.rate_count = rateCount + 1;
  await db.prepare(`UPDATE turtlepen_sessions SET rate_started_at = ?, rate_count = ?, last_seen = ?
    WHERE id = ? AND version = ?`).bind(row.rate_started_at, row.rate_count, now, id, row.version).run();
  return { row, state: await getState(bucket, row) };
}
function safeRelativePath(root, target) {
  const result = relative(root, target);
  if (!result || result === ".") return null;
  if (result === ".." || result.startsWith(`..${sep}`) || resolve(root, result) !== resolve(target)) {
    throw new HostedError("session path escaped its confined root", 500, -32603);
  }
  return result.split(sep).join("/");
}
function resolveStoredPath(root, stored) {
  if (!stored) return null;
  if (stored.startsWith("/") || stored.includes("..") || /^[A-Za-z]:/.test(stored)) {
    throw new HostedError("stored session path is invalid", 500, -32603);
  }
  const target = resolve(root, ...stored.split("/"));
  safeRelativePath(root, target);
  return target;
}
async function materializeFiles(bucket, row, root) {
  await removeSessionRoot(root);
  await mkdir(root, { recursive: true });
  const prefix = filesPrefix(row.id, row.version);
  for (const object of await listAll(bucket, prefix)) {
    const stored = object.key.slice(prefix.length);
    const target = resolveStoredPath(root, stored);
    if (!target) continue;
    const body = await bucket.get(object.key);
    if (!body) throw new HostedError(`stored artifact disappeared: ${stored}`, 500, -32603);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await body.arrayBuffer()));
  }
}
async function walkFiles(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const target = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(root, target));
    else if (entry.isFile()) files.push(target);
    else throw new HostedError(`unsupported session filesystem entry: ${safeRelativePath(root, target)}`, 400, -32602);
  }
  return files;
}
async function uploadFiles(bucket, id, version, root) {
  const files = await walkFiles(root);
  if (files.length > FILE_COUNT_LIMIT) {
    throw new HostedError(`TurtlePen session has ${files.length} files; hosted limit is ${FILE_COUNT_LIMIT}. Nothing was truncated.`, 413, -32004);
  }
  let total = 0;
  const prefix = filesPrefix(id, version);
  for (const file of files) {
    const info = await stat(file);
    if (info.size > FILE_LIMIT) {
      throw new HostedError(`${safeRelativePath(root, file)} is ${info.size} bytes; hosted per-file limit is ${FILE_LIMIT}.`, 413, -32004);
    }
    total += info.size;
    if (total > TOTAL_FILE_LIMIT) {
      throw new HostedError(`TurtlePen session files exceed the hosted ${TOTAL_FILE_LIMIT}-byte total. Nothing was truncated.`, 413, -32004);
    }
    const stored = safeRelativePath(root, file);
    if (stored) await bucket.put(`${prefix}${stored}`, await readFile(file));
  }
}
function hydrateSession(state, root) {
  const session = createSession({
    cwd: root,
    historyLimit: state.historyLimit
  });
  Object.assign(session, {
    createdAt: state.createdAt,
    startedAt: state.startedAt,
    doc: state.document ? core.deserialize(state.document) : null,
    path: resolveStoredPath(root, state.path),
    diskHash: state.diskHash,
    history: state.history,
    future: state.future,
    historyNotice: state.historyNotice,
    progress: state.progress ?? core.createProgressLog(),
    reviewCandidate: state.reviewCandidate ? core.deserialize(state.reviewCandidate) : null,
    lastRender: state.lastRender ?? null
  });
  return session;
}
function snapshotSession(session, root) {
  return {
    schema: 1,
    createdAt: session.createdAt ?? session.startedAt,
    startedAt: session.startedAt,
    historyLimit: session.historyLimit,
    document: session.doc ? core.serialize(session.doc) : null,
    path: session.path ? safeRelativePath(root, session.path) : null,
    diskHash: session.diskHash,
    history: session.history,
    future: session.future,
    historyNotice: session.historyNotice,
    progress: session.progress,
    reviewCandidate: session.reviewCandidate ? core.serialize(session.reviewCandidate) : null,
    lastRender: session.lastRender ?? null
  };
}
async function commitSession(db, bucket, row, state, root, now = Date.now()) {
  const nextVersion = row.version + 1;
  try {
    await uploadFiles(bucket, row.id, nextVersion, root);
    await putState(bucket, row.id, nextVersion, state);
    const expires = Math.min(now + IDLE_TTL_MS, row.created_at + ABSOLUTE_TTL_MS);
    const updated = await db.prepare(`UPDATE turtlepen_sessions SET version = ?, last_seen = ?, expires_at = ?
      WHERE id = ? AND version = ?`).bind(nextVersion, now, expires, row.id, row.version).run();
    if ((updated.meta?.changes ?? 0) !== 1) {
      throw new HostedError("MCP session changed concurrently; retry the call against the latest session state", 409, -32005);
    }
  } catch (error) {
    await purgePrefix(bucket, `turtlepen/${row.id}/v${nextVersion}/`);
    throw error;
  }
  await purgePrefix(bucket, `turtlepen/${row.id}/v${row.version}/`);
}
async function inlineRenderArtifact(text, root) {
  const match = /^wrote (.+)\r?\nrenderHash: ([0-9a-f]{16})/m.exec(text);
  if (!match) return text;
  const path = resolve(match[1]);
  safeRelativePath(root, path);
  const svg = await readFile(path, "utf8");
  return `${text}

hostedArtifact:
${JSON.stringify({
    name: safeRelativePath(root, path),
    mediaType: "image/svg+xml",
    renderHash: match[2],
    source: svg
  })}`;
}
async function invoke(message, session, root) {
  const tools = createTools(session);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const id = message.id ?? null;
  const params = message.params ?? {};
  switch (message.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : DEFAULT_PROTOCOL;
      const protocolVersion = SUPPORTED_PROTOCOLS.includes(asked) ? asked : DEFAULT_PROTOCOL;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: buildInstructions(tools)
        }
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            outputSchema: tool.outputSchema,
            annotations: tool.annotations
          }))
        }
      };
    case "tools/call": {
      if (message.id === void 0 || message.id === null) {
        return errorPayload(null, -32600, "tools/call requires a request id");
      }
      const name = typeof params.name === "string" ? params.name : "";
      const tool = byName.get(name);
      if (!tool) return errorPayload(id, -32602, `unknown tool "${name}"`);
      try {
        const canonicalText = String(await tool.handler(
          params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments : {}
        ));
        const structuredContent = structuredToolOutput(tool, canonicalText);
        let text = canonicalText;
        if (name === "render") text = await inlineRenderArtifact(text, root);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], structuredContent } };
      } catch (error) {
        const text = error instanceof Error ? error.message : "Tool execution failed";
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `error: ${text}` }], isError: true } };
      }
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    default:
      if (message.id === void 0 || message.id === null) return null;
      return errorPayload(id, -32601, `method not found: ${message.method}`);
  }
}
function OPTIONS() {
  return new Response(null, { status: 204, headers: baseHeaders("text/plain; charset=utf-8") });
}
function GET() {
  return new Response("TurtlePen MCP uses POST Streamable HTTP at this URL.", {
    status: 405,
    headers: { ...baseHeaders("text/plain; charset=utf-8"), Allow: "POST, OPTIONS" }
  });
}
async function post(request, getBindings) {
  let message = null;
  let sessionId = request.headers.get("mcp-session-id") ?? void 0;
  let root = null;
  try {
    if (!accepts(request, "application/json") || !accepts(request, "text/event-stream")) {
      throw new HostedError("Accept must include application/json and text/event-stream", 406, -32600);
    }
    if (!String(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      throw new HostedError("Content-Type must be application/json", 415, -32600);
    }
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > BODY_LIMIT) throw new HostedError(`request body exceeds ${BODY_LIMIT} bytes`, 413, -32600);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > BODY_LIMIT) throw new HostedError(`request body exceeds ${BODY_LIMIT} bytes`, 413, -32600);
    try {
      const parsed = JSON.parse(raw);
      if (!isRpcMessage(parsed)) throw new HostedError("body must be one JSON-RPC 2.0 object; batches are not accepted", 400, -32600);
      message = parsed;
    } catch (error) {
      if (error instanceof HostedError) throw error;
      throw new HostedError("parse error", 400, -32700);
    }
    const protocol = request.headers.get("mcp-protocol-version");
    if (protocol && !SUPPORTED_PROTOCOLS.includes(protocol)) {
      throw new HostedError(`unsupported MCP-Protocol-Version; supported: ${SUPPORTED_PROTOCOLS.join(", ")}`, 400, -32600);
    }
    const { db, artifacts } = await getBindings();
    await ensureSchema(db);
    await cleanupExpired(db, artifacts);
    let row;
    let stored;
    if (message.method === "initialize" && !sessionId) {
      if (message.id === void 0 || message.id === null) {
        throw new HostedError("initialize requires a request id", 400, -32600);
      }
      if (!await takeInitializerSlot(db, clientKey(request))) {
        throw new HostedError("initialization rate limit exceeded", 429, -32002);
      }
      row = await createStoredSession(db, artifacts);
      stored = await getState(artifacts, row);
      sessionId = row.id;
    } else {
      if (!sessionId) throw new HostedError("Mcp-Session-Id is required after initialization", 400, -32600);
      ({ row, state: stored } = await loadStoredSession(db, artifacts, sessionId));
    }
    root = sessionRoot(row.id);
    await materializeFiles(artifacts, row, root);
    const session = hydrateSession(stored, root);
    const payload = await invoke(message, session, root);
    await commitSession(db, artifacts, row, snapshotSession(session, root), root);
    await removeSessionRoot(root);
    root = null;
    if (message.id === void 0 || message.id === null) {
      return new Response(null, { status: 202, headers: baseHeaders("text/plain; charset=utf-8", row.id) });
    }
    if (!payload) return jsonResponse(errorPayload(message.id, -32603, "request produced no response"), 500, row.id);
    if (Buffer.byteLength(JSON.stringify(payload)) > RESPONSE_LIMIT) {
      return sseResponse(errorPayload(message.id, -32004, `response exceeds hosted limit of ${RESPONSE_LIMIT} bytes`), row.id);
    }
    return sseResponse(payload, row.id);
  } catch (error) {
    if (root) await removeSessionRoot(root).catch(() => void 0);
    const hosted = error instanceof HostedError ? error : new HostedError("internal server error", 500, -32603);
    if (!(error instanceof HostedError)) console.error("turtlepen hosted MCP failure", error);
    return jsonResponse(errorPayload(message?.id ?? null, hosted.code, hosted.message), hosted.status, sessionId);
  }
}
function createCloudflareHandlers({ getBindings = defaultBindings } = {}) {
  if (typeof getBindings !== "function") throw new TypeError("getBindings must be a function returning { db, artifacts }");
  return {
    dynamic,
    OPTIONS,
    GET,
    POST: (request) => post(request, getBindings)
  };
}
const hostedHandlers = createCloudflareHandlers();
const POST = hostedHandlers.POST;
export {
  GET,
  OPTIONS,
  POST,
  createCloudflareHandlers,
  dynamic
};
