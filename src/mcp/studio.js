import { relative } from "node:path";
import { VERSION } from "../version.js";

export const STUDIO_URI = "ui://turtlepen/studio/v1";
export const STUDIO_MIME_TYPE = "text/html;profile=mcp-app";

const STUDIO_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TurtlePen Studio</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --bg: #f5f7f8;
      --panel: #ffffff;
      --panel-2: #eef2f3;
      --ink: #172025;
      --muted: #64727a;
      --line: #d7dfe3;
      --accent: #15966f;
      --accent-ink: #ffffff;
      --danger: #b74c4c;
      --shadow: 0 14px 40px rgba(20, 32, 39, 0.10);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #111618;
        --panel: #171e21;
        --panel-2: #20292d;
        --ink: #edf4f2;
        --muted: #9aabb2;
        --line: #314047;
        --accent: #4bd0a3;
        --accent-ink: #08251b;
        --danger: #ff8c8c;
        --shadow: none;
      }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--ink); }
    body { padding: 14px; }
    button, input { font: inherit; }
    .shell { min-height: calc(100vh - 28px); display: grid; grid-template-rows: auto auto minmax(360px, 1fr); gap: 12px; }
    .bar, .toolbar, .preview, .inspector { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 14px 16px; }
    .brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
    .mark { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 11px; background: var(--accent); color: var(--accent-ink); font-weight: 900; letter-spacing: -0.08em; }
    h1 { font-size: 17px; margin: 0; line-height: 1.2; }
    .sub { color: var(--muted); font-size: 12px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .status { display: flex; gap: 7px; flex-wrap: wrap; justify-content: flex-end; }
    .chip { border: 1px solid var(--line); background: var(--panel-2); color: var(--muted); border-radius: 999px; padding: 5px 8px; font-size: 11px; }
    .chip[data-live="true"] { color: var(--ink); }
    .toolbar { display: flex; align-items: center; gap: 8px; padding: 9px; flex-wrap: wrap; }
    .toolbar button { appearance: none; border: 1px solid var(--line); background: var(--panel-2); color: var(--ink); border-radius: 10px; min-height: 34px; padding: 0 11px; cursor: pointer; }
    .toolbar button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 700; }
    .toolbar button:hover { filter: brightness(0.98); }
    .toolbar button:disabled { opacity: 0.5; cursor: wait; }
    .toolbar .spacer { flex: 1; }
    .toggle { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; padding: 0 3px; }
    .workspace { min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 340px); gap: 12px; }
    .preview { position: relative; min-height: 360px; overflow: auto; padding: 18px; display: grid; place-items: center; background-image: linear-gradient(45deg, color-mix(in srgb, var(--line) 35%, transparent) 25%, transparent 25%), linear-gradient(-45deg, color-mix(in srgb, var(--line) 35%, transparent) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, color-mix(in srgb, var(--line) 35%, transparent) 75%), linear-gradient(-45deg, transparent 75%, color-mix(in srgb, var(--line) 35%, transparent) 75%); background-size: 24px 24px; background-position: 0 0, 0 12px, 12px -12px, -12px 0; }
    .preview svg { display: block; max-width: 100%; height: auto; filter: drop-shadow(0 8px 20px rgba(0,0,0,.08)); }
    .empty { color: var(--muted); text-align: center; max-width: 330px; line-height: 1.5; padding: 40px 20px; }
    .inspector { min-height: 0; display: grid; grid-template-rows: auto auto 1fr; overflow: hidden; }
    .section { padding: 13px 14px; border-bottom: 1px solid var(--line); }
    .section:last-child { border-bottom: 0; }
    .section h2 { margin: 0 0 9px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    .new-row { display: flex; gap: 7px; }
    .new-row input { min-width: 0; flex: 1; border: 1px solid var(--line); background: var(--bg); color: var(--ink); border-radius: 9px; padding: 8px 9px; }
    .new-row button { border: 1px solid var(--line); background: var(--panel-2); color: var(--ink); border-radius: 9px; padding: 0 10px; cursor: pointer; }
    .facts { display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; font-size: 12px; }
    .facts dt { color: var(--muted); }
    .facts dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
    #log { margin: 0; height: 100%; min-height: 170px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--muted); }
    body[data-busy="true"] .toolbar button, body[data-busy="true"] .new-row button { pointer-events: none; }
    .error { color: var(--danger) !important; }
    @media (max-width: 760px) {
      body { padding: 8px; }
      .shell { min-height: calc(100vh - 16px); }
      .workspace { grid-template-columns: 1fr; }
      .inspector { min-height: 330px; }
      .status { display: none; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="bar">
      <div class="brand">
        <div class="mark" aria-hidden="true">TP</div>
        <div>
          <h1>TurtlePen Studio</h1>
          <div class="sub" id="doc-label">No active diagram</div>
        </div>
      </div>
      <div class="status" aria-label="Session status">
        <span class="chip" id="runtime-chip">runtime —</span>
        <span class="chip" id="history-chip">undo 0 · redo 0</span>
        <span class="chip" id="bridge-chip">connecting</span>
      </div>
    </header>

    <nav class="toolbar" aria-label="TurtlePen actions">
      <button class="primary" id="render-btn">Render</button>
      <button id="validate-btn">Validate</button>
      <button id="inspect-btn">Inspect</button>
      <button id="undo-btn">Undo</button>
      <button id="redo-btn">Redo</button>
      <button id="save-btn">Save</button>
      <button id="refresh-btn">Refresh</button>
      <span class="spacer"></span>
      <label class="toggle"><input id="grid-toggle" type="checkbox" /> Grid</label>
      <label class="toggle"><input id="findings-toggle" type="checkbox" checked /> Findings</label>
      <label class="toggle"><input id="force-toggle" type="checkbox" /> Force</label>
    </nav>

    <main class="workspace">
      <section class="preview" id="preview" aria-label="Diagram preview">
        <div class="empty" id="empty-preview">Render an active TurtlePen diagram to see the exact SVG here.</div>
      </section>

      <aside class="inspector">
        <section class="section">
          <h2>New diagram</h2>
          <div class="new-row">
            <input id="new-name" type="text" maxlength="80" placeholder="Diagram name" />
            <button id="new-btn">Create</button>
          </div>
        </section>
        <section class="section">
          <h2>Session</h2>
          <dl class="facts">
            <dt>Document</dt><dd id="fact-doc">—</dd>
            <dt>Path</dt><dd id="fact-path">—</dd>
            <dt>Pages</dt><dd id="fact-pages">—</dd>
            <dt>Workflow</dt><dd>measure → validate → render → review</dd>
          </dl>
        </section>
        <section class="section">
          <h2>Output</h2>
          <pre id="log">Studio is connecting to the MCP host…</pre>
        </section>
      </aside>
    </main>
  </div>

  <script type="module">
    const $ = (selector) => document.querySelector(selector);
    const logEl = $("#log");
    const previewEl = $("#preview");
    const emptyEl = $("#empty-preview");
    const bridgeChip = $("#bridge-chip");
    let rpcId = 0;
    let busy = false;
    const pending = new Map();

    function notify(method, params) {
      window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
    }

    function request(method, params) {
      return new Promise((resolve, reject) => {
        const id = ++rpcId;
        pending.set(id, { resolve, reject });
        window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
      });
    }

    function envelope(response) {
      return response && response.structuredContent ? response.structuredContent : null;
    }

    function resultOf(response) {
      const wrapped = envelope(response);
      return wrapped && Object.prototype.hasOwnProperty.call(wrapped, "result") ? wrapped.result : null;
    }

    function compact(value) {
      if (typeof value === "string") return value;
      try { return JSON.stringify(value, null, 2); } catch { return String(value); }
    }

    function writeLog(value, isError = false) {
      const text = compact(value);
      logEl.textContent = text.length > 12000 ? text.slice(0, 12000) + "\n…truncated in Studio" : text;
      logEl.classList.toggle("error", isError);
    }

    function setBusy(next) {
      busy = next;
      document.body.dataset.busy = String(next);
      document.querySelectorAll("button").forEach((button) => { button.disabled = next; });
    }

    function updateStudioState(state) {
      if (!state || typeof state !== "object") return;
      $("#runtime-chip").textContent = "runtime " + (state.version || "—");
      $("#runtime-chip").dataset.live = state.version ? "true" : "false";
      const undo = state.history && Number.isFinite(state.history.undo) ? state.history.undo : 0;
      const redo = state.history && Number.isFinite(state.history.redo) ? state.history.redo : 0;
      $("#history-chip").textContent = "undo " + undo + " · redo " + redo;
      $("#doc-label").textContent = state.hasDocument ? (state.name || state.path || "Active diagram") : "No active diagram";
      $("#fact-doc").textContent = state.name || (state.hasDocument ? "Untitled" : "None");
      $("#fact-path").textContent = state.path || "—";
      $("#fact-pages").textContent = state.pageCount == null ? "—" : String(state.pageCount);
    }

    function extractArtifact(response) {
      const items = response && Array.isArray(response.content) ? response.content : [];
      for (const item of items) {
        if (!item || item.type !== "text" || typeof item.text !== "string") continue;
        const marker = "\nhostedArtifact:\n";
        const at = item.text.lastIndexOf(marker);
        if (at < 0) continue;
        try {
          const artifact = JSON.parse(item.text.slice(at + marker.length));
          if (artifact && artifact.mediaType === "image/svg+xml" && typeof artifact.source === "string") return artifact;
        } catch {}
      }
      return null;
    }

    function showArtifact(artifact) {
      if (!artifact) return false;
      const oldSvg = previewEl.querySelector("svg");
      if (oldSvg) oldSvg.remove();
      if (emptyEl) emptyEl.hidden = true;
      previewEl.insertAdjacentHTML("beforeend", artifact.source);
      const svg = previewEl.querySelector("svg");
      if (svg) {
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", "TurtlePen diagram render");
      }
      writeLog({ rendered: artifact.name, renderHash: artifact.renderHash });
      return true;
    }

    function consume(response) {
      const wrapped = envelope(response);
      if (wrapped && wrapped.tool === "open_studio") updateStudioState(wrapped.result);
      const artifact = extractArtifact(response);
      if (artifact) return showArtifact(artifact);
      if (wrapped) writeLog(wrapped.result);
      else if (response) writeLog(response);
      return false;
    }

    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      const message = event.data;
      if (!message || message.jsonrpc !== "2.0") return;
      if (Object.prototype.hasOwnProperty.call(message, "id")) {
        const waiter = pending.get(message.id);
        if (!waiter) return;
        pending.delete(message.id);
        if (message.error) waiter.reject(message.error);
        else waiter.resolve(message.result);
        return;
      }
      if (message.method === "ui/notifications/tool-result") consume(message.params);
    }, { passive: true });

    const bridgeReady = (async () => {
      await request("ui/initialize", {
        appInfo: { name: "turtlepen-studio", version: "1.0.0" },
        appCapabilities: {},
        protocolVersion: "2026-01-26"
      });
      notify("ui/notifications/initialized", {});
      bridgeChip.textContent = "connected";
      bridgeChip.dataset.live = "true";
    })().catch((error) => {
      bridgeChip.textContent = "bridge error";
      writeLog(error, true);
      throw error;
    });

    async function callTool(name, args = {}) {
      if (busy) return null;
      setBusy(true);
      try {
        await bridgeReady;
        const response = await request("tools/call", { name, arguments: args });
        consume(response);
        return response;
      } catch (error) {
        writeLog(error, true);
        return null;
      } finally {
        setBusy(false);
      }
    }

    async function refreshState() {
      const response = await callTool("open_studio", {});
      if (response) updateStudioState(resultOf(response));
    }

    async function render() {
      await callTool("render", {
        showGrid: $("#grid-toggle").checked,
        markFindings: $("#findings-toggle").checked,
        force: $("#force-toggle").checked,
        bounds: "content"
      });
      await refreshState();
    }

    $("#render-btn").addEventListener("click", render);
    $("#validate-btn").addEventListener("click", () => callTool("validate", { format: "json" }));
    $("#inspect-btn").addEventListener("click", () => callTool("describe", {}));
    $("#save-btn").addEventListener("click", () => callTool("save", {}));
    $("#refresh-btn").addEventListener("click", refreshState);
    $("#undo-btn").addEventListener("click", async () => { await callTool("history", { action: "undo" }); await render(); });
    $("#redo-btn").addEventListener("click", async () => { await callTool("history", { action: "redo" }); await render(); });
    $("#new-btn").addEventListener("click", async () => {
      const input = $("#new-name");
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      await callTool("new_diagram", { name });
      input.value = "";
      await refreshState();
    });
    $("#new-name").addEventListener("keydown", (event) => {
      if (event.key === "Enter") $("#new-btn").click();
    });

    bridgeReady.then(refreshState).catch(() => {});
  </script>
</body>
</html>`;

export const STUDIO_RESOURCE = {
  uri: STUDIO_URI,
  name: "TurtlePen Studio",
  description: "Interactive TurtlePen canvas, validation console, history controls, and SVG preview.",
  mimeType: STUDIO_MIME_TYPE,
};

export const STUDIO_RESOURCE_CONTENT = {
  uri: STUDIO_URI,
  mimeType: STUDIO_MIME_TYPE,
  text: STUDIO_HTML,
  _meta: {
    ui: {
      prefersBorder: false,
      csp: { connectDomains: [], resourceDomains: [] },
    },
    "openai/ui": {
      availableDisplayModes: ["inline", "fullscreen"],
      preferredDisplayMode: "fullscreen",
    },
  },
};

function pageCount(doc) {
  if (!doc || doc.pages == null) return 0;
  if (Array.isArray(doc.pages)) return doc.pages.length;
  if (typeof doc.pages === "object") return Object.keys(doc.pages).length;
  return 0;
}

function studioState(session, root) {
  const storedPath = session.path ? relative(root, session.path).replaceAll("\\", "/") : null;
  return {
    version: VERSION,
    hasDocument: Boolean(session.doc),
    name: session.doc?.name ?? session.doc?.meta?.name ?? null,
    path: storedPath,
    pageCount: pageCount(session.doc),
    history: {
      undo: Array.isArray(session.history) ? session.history.length : 0,
      redo: Array.isArray(session.future) ? session.future.length : 0,
    },
    startedAt: session.startedAt ?? null,
    workflow: ["measure", "plan", "validate", "render", "perceptual_review", "save"],
  };
}

export function createStudioTool(session, root) {
  return {
    name: "open_studio",
    description: "Open TurtlePen Studio. Use when the user asks to open TurtlePen, show the canvas, inspect the visual result, or work interactively with the current diagram.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: {
      ui: { resourceUri: STUDIO_URI, visibility: ["model", "app"] },
      "openai/outputTemplate": STUDIO_URI,
      "openai/ui": { entrypoints: [{ type: "global" }] },
      "openai/toolInvocation/invoking": "Opening TurtlePen Studio…",
      "openai/toolInvocation/invoked": "TurtlePen Studio ready",
    },
    handler: async () => JSON.stringify(studioState(session, root)),
  };
}
