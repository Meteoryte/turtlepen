/**
 * MCP tool surface.
 *
 * The tools return numbers, not adjectives. Every response that matters carries
 * exact quadrant counts, character capacities, pixel shortfalls, and addresses,
 * because the AI's job here is arithmetic over an explicit model rather than
 * guessing at rendered sizes.
 */

import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import * as core from '../core/index.js';

const REQUIRE_DOC = 'no diagram is open — call new_diagram or open_diagram first';
const HISTORY_SCHEMA = 1;
const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = 1000;
// Core owns the mutation vocabulary. Deriving this set means a future
// operation cannot silently bypass recovery because this file forgot a name.
const MUTATING_TOOLS = new Set(Object.keys(core.OPERATIONS));
MUTATING_TOOLS.add('plan');

export function createSession({ cwd = process.cwd(), createdAt = null, historyLimit = DEFAULT_HISTORY_LIMIT } = {}) {
  if (createdAt != null && Number.isNaN(Date.parse(createdAt))) {
    throw new TypeError(`session createdAt must be an ISO timestamp — got ${JSON.stringify(createdAt)}`);
  }
  if (!Number.isInteger(historyLimit) || historyLimit < 1 || historyLimit > MAX_HISTORY_LIMIT) {
    throw new RangeError(`historyLimit must be a whole number from 1 to ${MAX_HISTORY_LIMIT} — got ${JSON.stringify(historyLimit)}`);
  }
  return {
    doc: null, path: null, cwd, createdAt, historyLimit, progress: core.createProgressLog(),
    history: [], future: [], historyNotice: 'no diagram is open',
  };
}

const need = (s) => {
  if (!s.doc) throw new Error(REQUIRE_DOC);
  return s.doc;
};

async function applyAndPersist(session, operation, args) {
  const result = core.applyOperation(need(session), { ...args, op: operation });
  await persist(session);
  return result;
}

/** Read and canonicalise an image relative to the active diagram. */
async function readImage(session, source) {
  if (String(source).startsWith('data:')) {
    const info = core.image.assertEmbeddedSource(source);
    return { bytes: info.bytes, info, dataUri: source };
  }
  const base = session.path ? dirname(session.path) : session.cwd;
  const path = resolve(base, source);
  const file = await stat(path);
  if (!file.isFile()) throw new Error(`image source is not a file: ${path}`);
  if (file.size > core.image.MAX_IMAGE_BYTES) {
    throw new RangeError(`image is ${file.size} bytes; the embedded-image limit is ${core.image.MAX_IMAGE_BYTES} bytes`);
  }
  const bytes = await readFile(path);
  const info = core.image.probe(bytes);
  return { bytes, info, dataUri: `data:${core.image.MIME_BY_FORMAT[info.format]};base64,${bytes.toString('base64')}` };
}

/**
 * Turn any file-path image source into a data: URI before the operation reaches
 * core.
 *
 * Core is pure — no file I/O — so reading bytes has to happen out here. The
 * trap is doing it in ONE path: `place_image` resolved its source in the tool
 * handler but not inside `plan`, so the same operation meant two different
 * things depending on how it was invoked. `place_box` had exactly this bug with
 * span formats once already. Both entry points now go through this.
 */
async function resolveSources(session, operations) {
  const out = [];
  for (const op of operations) {
    if (['place_image', 'place_reference'].includes(op?.op) && op.source) {
      const resolved = await readImage(session, op.source);
      out.push({ ...op, source: resolved.dataUri });
    } else {
      out.push(op);
    }
  }
  return out;
}

async function persist(session) {
  // Working state, not a deliverable: checkpoints never adjudicate, so an
  // author can place roughly and repair afterwards exactly as before.
  if (session.doc && session.path) await core.checkpointDocument(session.doc, session.path);
}

function resetHistory(session, notice = 'history reset') {
  session.history = [];
  session.future = [];
  session.historyNotice = notice;
}

const stateHash = (state) => createHash('sha256').update(state).digest('hex');
const historyPath = (session) => (session.path ? `${session.path}.history.json` : null);

function trimHistory(session, entries) {
  return entries.slice(-session.historyLimit);
}

function validateHistoryEntries(entries, name) {
  if (!Array.isArray(entries)) throw new TypeError(`saved ${name} must be an array`);
  return entries.map((entry, index) => {
    if (!entry || typeof entry.label !== 'string' || typeof entry.state !== 'string') {
      throw new TypeError(`saved ${name} entry ${index + 1} is malformed`);
    }
    // Refuse an unusable recovery point at open time, not halfway through undo.
    core.deserialize(entry.state);
    return { label: entry.label, state: entry.state };
  });
}

async function persistHistory(session) {
  if (!session.doc || !session.path) return;
  const state = core.serialize(session.doc);
  await writeFile(historyPath(session), JSON.stringify({
    schema: HISTORY_SCHEMA,
    currentHash: stateHash(state),
    limit: session.historyLimit,
    history: trimHistory(session, session.history),
    future: trimHistory(session, session.future),
  }, null, 2), 'utf8');
  session.historyNotice = `saved to ${historyPath(session)}`;
}

async function restoreHistory(session) {
  resetHistory(session, 'no saved history');
  let raw;
  try {
    raw = JSON.parse(await readFile(historyPath(session), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return;
    session.historyNotice = `ignored unreadable history sidecar: ${err.message}`;
    return;
  }

  try {
    if (raw.schema !== HISTORY_SCHEMA) throw new Error(`unsupported history schema ${JSON.stringify(raw.schema)}`);
    const currentHash = stateHash(core.serialize(session.doc));
    if (raw.currentHash !== currentHash) throw new Error('document content changed outside this history');
    session.history = trimHistory(session, validateHistoryEntries(raw.history, 'history'));
    session.future = trimHistory(session, validateHistoryEntries(raw.future, 'future'));
    session.historyNotice = `restored ${session.history.length} undo and ${session.future.length} redo entries from ${historyPath(session)}`;
  } catch (err) {
    resetHistory(session, `ignored stale or invalid history sidecar: ${err.message}`);
  }
}

function historyLabel(name, args) {
  if (name === 'plan') return `plan (${args.operations?.length ?? 0} operations)`;
  const subject = args.id ?? args.to ?? null;
  return subject == null ? name : `${name} "${subject}"`;
}

function historyReceipt(session) {
  return {
    undo_available: session.history.length,
    redo_available: session.future.length,
    limit: session.historyLimit,
    next_undo: session.history.at(-1)?.label ?? null,
    next_redo: session.future.at(-1)?.label ?? null,
    sidecar: historyPath(session),
    persistence: session.historyNotice,
  };
}

/**
 * One recovery boundary around every document mutation.
 *
 * A successful no-op records nothing. A thrown mutation is restored in memory
 * even if a lower layer ever loses its own transaction guard. Successful edits
 * invalidate redo, exactly like a desktop editor.
 */
async function withHistory(session, name, args, handler) {
  const before = core.serialize(need(session));
  const historyBefore = [...session.history];
  const futureBefore = [...session.future];
  const noticeBefore = session.historyNotice;
  try {
    const result = await handler(args);
    const after = core.serialize(session.doc);
    if (after !== before) {
      session.history.push({ label: historyLabel(name, args), state: before });
      session.history = trimHistory(session, session.history);
      session.future = [];
      await persistHistory(session);
    }
    return result;
  } catch (err) {
    session.history = historyBefore;
    session.future = futureBefore;
    session.historyNotice = noticeBefore;
    if (session.doc && core.serialize(session.doc) !== before) {
      session.doc = core.deserialize(before);
      try {
        await persist(session);
        await persistHistory(session);
      } catch (rollbackError) {
        throw new Error(`${err.message}; rollback checkpoint also failed: ${rollbackError.message}`, { cause: err });
      }
    }
    throw err;
  }
}

const json = (o) => JSON.stringify(o, null, 2);

export function createTools(session) {
  const tools = [
    {
      name: 'turtlepen_help',
      description:
        'Read this first. Returns the lattice constants, the Excel addressing scheme, the pen command grammar, the corner/alignment vocabulary, and the full collision rule table with severities. Everything needed to author a diagram correctly on the first attempt.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: () => [HELP, '', 'lattice:', json(core.latticeInfo(session.doc)), '', 'rules:', json(core.RULES)].join('\n'),
    },

    {
      name: 'new_diagram',
      description: 'Create a new diagram and make it active. Creates a "base" page at z:0 with exclusive intent.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'diagram name' },
          path: { type: 'string', description: 'file path to save to, e.g. diagrams/pipeline.turtlepen.json' },
          cols: { type: 'integer', description: 'declared canvas width in cells (default 160)' },
          rows: { type: 'integer', description: 'declared canvas height in cells (default 100)' },
          fontSize: { type: 'integer', description: 'default label font size in px (default 10)' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      handler: async ({ name, path, cols = 160, rows = 100, fontSize = 10 }) => {
        session.doc = core.createDocument({ name, canvas: { cols, rows }, font: { size: fontSize } });
        if (session.createdAt) session.doc.createdAt = session.createdAt;
        session.path = path ? resolve(session.cwd, path) : resolve(session.cwd, `diagrams/${name.replace(/\W+/g, '-').toLowerCase()}.turtlepen.json`);
        resetHistory(session, 'new diagram starts with empty history');
        await persist(session);
        await persistHistory(session);
        return `created "${name}" (${cols}x${rows} cells) at ${session.path}\npages: base (z:0, exclusive)\n\n${json(core.latticeInfo(session.doc))}`;
      },
    },

    {
      name: 'open_diagram',
      description: 'Open an existing diagram file and make it active.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
      handler: async ({ path }) => {
        const target = resolve(session.cwd, path);
        const opened = await core.loadDocument(target);
        session.path = target;
        session.doc = opened;
        await restoreHistory(session);
        const v = core.validate(session.doc);
        return `opened "${session.doc.name}" from ${session.path}\npages: ${session.doc.pages.map((p) => `${p.id} (z:${p.z}, ${p.intent})`).join(', ')}\nhistory: ${session.historyNotice}\n\n${core.formatLog(v)}`;
      },
    },

    {
      name: 'add_page',
      description:
        'Add a Z-page. intent="exclusive" means nothing below may be overlapped (overlap is an error); intent="overlay" means overlap is expected and is reported as information. Choose deliberately — this is what stops annotation layers generating endless warnings.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          z: { type: 'integer', description: 'stacking order; defaults to one above the highest existing page' },
          intent: { type: 'string', enum: ['exclusive', 'overlay'] },
          title: { type: 'string' },
        },
        required: ['id', 'intent'],
        additionalProperties: false,
      },
      handler: async ({ id, z = null, intent, title = null }) => {
        const page = core.addPage(need(session), { id, z, intent, title });
        await persist(session);
        return `added page "${page.id}" at z:${page.z} (${page.intent})`;
      },
    },

    {
      name: 'remove_page',
      description:
        'Remove an entire Z-page and every element on it. This is the repair for L020 after a tracing reference has served its purpose. A document must retain at least one page.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false,
      },
      handler: async ({ id }) => {
        const page = core.removePage(need(session), id);
        await persist(session);
        return `removed page "${page.id}" and all of its elements`;
      },
    },

    {
      name: 'measure',
      description:
        'Measure text BEFORE placing a box. Returns advance width, characters per line, wrapped line count, and the cell span the label actually needs. Use this to size boxes rather than estimating.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          fontSize: { type: 'integer' },
          maxWidthCells: { type: 'integer', description: 'if given, wraps to this width and reports the height needed' },
        },
        required: ['text'],
        additionalProperties: false,
      },
      handler: ({ text, fontSize = session.doc?.font?.size ?? 10, maxWidthCells = null }) =>
        json({
          text,
          fontSize,
          ...core.text.requiredCellsFor(text, { fontSize, maxWidthCells }),
          note: `advance ${core.text.advanceWidth(fontSize)}px per character; a box of N cells holds floor((N*10 - 10) / ${core.text.advanceWidth(fontSize)}) characters per line`,
        }),
    },

    {
      name: 'place_box',
      description:
        'Place a box by address and cell span. The address may name a pin point (C4.tl, C4.c, C4.br) which decides which of the box\'s own corners lands there. Measure the label first — this tool reports overflow but never resizes anything.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          at: { type: 'string', description: 'e.g. C4, C4.tl, C4.c' },
          span: { description: 'cells, either "12x5" or { "w": 12, "h": 5 }' },
          label: { type: 'string' },
          page: { type: 'string' },
          corner: { type: 'string', enum: ['square', 'rounded', 'indented', 'chamfered'] },
          shape: { description: 'flowchart symbol: process (default), decision, terminator, subprocess, io, prep, manual, data, document, bar; or a container — lane, group — which reserves only its title band and border ring so members sit inside without colliding', type: 'string', enum: [...core.NODE_SHAPES] },
          align: { type: 'string', enum: ['left', 'center', 'right'] },
          fontSize: { type: 'integer' },
          fill: { type: 'string' },
        },
        required: ['id', 'at', 'span'],
        additionalProperties: false,
      },
      handler: async ({ id, at, span, label = '', page = 'base', corner = 'square', shape = 'process', align = 'left', fontSize = null, fill = null }) => {
        const doc = need(session);
        const el = core.placeBox(doc, page, { id, at, span, label, corner, shape, align, fontSize, fill });
        await persist(session);
        const fit = label ? core.text.fitReport(label, el.rect, { fontSize: el.fontSize, paddingQuads: doc.font.paddingQuads, align: el.align }) : null;
        return [
          `placed "${id}" on page "${page}" at ${core.address.quadToAddress(el.rect.x, el.rect.y)}, ${el.rect.w / 2}x${el.rect.h / 2} cells, ${corner} corners`,
          fit ? `label fit: ${fit.fits ? 'OK' : 'OVERFLOW'} — ${fit.charsPerLine} chars/line, ${fit.lineCount} line(s), ${fit.visibleLines} visible` : '',
          fit && !fit.fits ? fit.fixes.map((f) => `  fix: ${f.description}`).join('\n') : '',
          `connector seats: ${formatPorts(el)} — or just write "pen from ${id}.S" and skip the arithmetic`,
        ].filter(Boolean).join('\n');
      },
    },

    {
      name: 'pen',
      description:
        'Run a pen program. Each command draws and advances a cursor. Geometry always claims exact 5px quadrants. Set role="artwork" for open illustrations, optional hex color/width/cap for line ink, or paint="cells" for solid lattice artwork. Call turtlepen_help for the grammar.',
      inputSchema: {
        type: 'object',
        properties: {
          program: { type: 'string', description: 'one command per line; a line-leading # or spaced " # comment" starts a comment' },
          page: { type: 'string' },
          id: { type: 'string', description: 'id for the path this program creates' },
          role: { type: 'string', enum: ['connector', 'artwork'], description: 'connector (default) is checked for loose ends; artwork may be intentionally open' },
          color: { type: 'string', pattern: '^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$', description: 'optional 3- or 6-digit hex ink colour' },
          width: { type: 'integer', minimum: 1, maximum: 5, description: 'presentation width in px; collision geometry remains quadrant-exact' },
          cap: { type: 'string', enum: ['butt', 'round', 'square'] },
          paint: { type: 'string', enum: ['line', 'cells'], description: 'line paints continuous ink; cells paints every exact 5px claimed quadrant' },
          tone: { type: ['number', 'string'], description: 'density 0.0625..1, or quarter | half | three-quarter | solid. A toned shape inks fewer real quadrants, so it CLAIMS fewer — unlike opacity, which changes nothing about geometry' },
          feather: { type: 'integer', minimum: 0, description: 'quadrants of tone falloff inward from the region boundary' },
          texture: { type: 'string', enum: ['eroded'], description: 'seeded roughening of the boundary; deterministic from the path id' },
          pattern: { type: 'string', enum: ['dashed', 'dotted'], description: 'rhythm ALONG the path — a projected trendline or an inferred boundary. Keyed to distance travelled, so a dash survives a corner' },
        },
        required: ['program'],
        additionalProperties: false,
      },
      handler: async ({ program, page = 'base', id = null, role = 'connector', color = null, width = null, cap = null, paint = null, tone = null, feather = null, texture = null, pattern = null }) => {
        const doc = need(session);
        const r = core.applyPen(doc, page, program, { id, role, color, width, cap, paint, tone, feather, texture, pattern });
        await persist(session);
        const lines = [`pen program applied to page "${page}" as ${role}`];
        if (r.path) {
          lines.push(`path "${r.path.id}": ${r.path.pieces.length} quadrant(s)`);
          // Say what tone removed. A silently thinner shape is the kind of
          // surprise this project exists to prevent.
          const s = r.path.stroke ?? {};
          if (s.tone != null || s.feather != null || s.texture != null || s.pattern != null) {
            lines.push(`  tone ${s.tone ?? 1}`
              + `${s.feather ? `, feather ${s.feather}` : ''}`
              + `${s.texture ? `, texture ${s.texture}` : ''}`
              + `${s.pattern ? `, ${s.pattern}` : ''}`
              + ' — the count above is what actually inked, and what the path claims');
          }
        }
        for (const b of r.boxes) lines.push(`box "${b.id}" at ${core.address.quadToAddress(b.rect.x, b.rect.y)} ${b.rect.w / 2}x${b.rect.h / 2} cells`);
        lines.push('', 'trace:');
        for (const t of r.trace) lines.push(`  ${String(t.step).padStart(2)}. ${t.action.padEnd(6)} ${describeTrace(t)}   << ${t.source}`);
        lines.push('', `cursor now ${core.address.quadToAddress(r.cursor.x, r.cursor.y)} facing ${r.facing}`);
        if (r.notes.length) {
          lines.push('', 'pen notes (also surfaced by validate):');
          for (const n of r.notes) lines.push(`  [${n.code}] step ${n.step}: ${n.message}`);
        }
        return lines.join('\n');
      },
    },

    {
      name: 'validate',
      description:
        'Validate the whole composition and return the severity-ranked collision log. This is the plan -> validate step: draw everything first, then check it as a unit. Findings carry a fingerprint for accept_finding.',
      inputSchema: {
        type: 'object',
        properties: {
          page: { type: 'string', description: 'limit to one page; omit to check every page and all cross-page stacking' },
          format: { type: 'string', enum: ['log', 'json'] },
        },
        additionalProperties: false,
      },
      handler: ({ page = null, format = 'log' }) => {
        const doc = need(session);
        const result = core.validate(doc, { page });
        // Watch the SEQUENCE of checks, not the drawing. Editing repeatedly
        // without changing what is reported is the loop a weaker author cannot
        // see itself in, and nothing else here would ever mention it.
        session.progress ??= core.createProgressLog();
        core.recordCheck(session.progress, result, session.doc?.history?.undo?.length ?? 0);
        const stalled = core.stagnationNote(session.progress);
        if (format === 'json') return json(stalled ? { ...result, progress: stalled } : result);
        return stalled ? `${core.formatLog(result)}

${stalled}` : core.formatLog(result);
      },
    },

    {
      name: 'accept_finding',
      description:
        'Record a current finding as deliberate rather than an error — this is where intent is declared. Unknown or expired fingerprints are refused. The exact fingerprint and finding metadata remain auditable when geometry changes, and unaccept_finding withdraws the record.',
      inputSchema: {
        type: 'object',
        properties: { fingerprint: { type: 'string' }, reason: { type: 'string', description: 'why this overlap is intended' } },
        required: ['fingerprint', 'reason'],
        additionalProperties: false,
      },
      handler: async ({ fingerprint, reason }) => {
        core.acceptFinding(need(session), fingerprint, reason);
        await persist(session);
        const v = core.validate(session.doc);
        return `accepted #${fingerprint} — "${reason}"\n\n${core.formatLog(v)}`;
      },
    },

    {
      name: 'ascii',
      description:
        'Render the diagram as text at quadrant resolution — two characters per cell, with Excel headers. Use it to see what was actually drawn. Optionally marks colliding quadrants.',
      inputSchema: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          maxCells: { type: 'integer' },
          withFindings: { type: 'boolean', description: 'mark colliding quadrants with x' },
        },
        additionalProperties: false,
      },
      handler: ({ page = null, maxCells = 90, withFindings = true }) => {
        const doc = need(session);
        const findings = withFindings ? core.validate(doc, { page }).open : null;
        return core.renderAscii(doc, { page, maxCells, findings }).text;
      },
    },

    {
      name: 'free_space',
      description:
        'Where is there room? Returns maximal empty rectangles, largest first, with addresses and cell sizes — or the first rectangle that fits a given cell span. Defaults to scope="stack", where every non-reference page constrains placement, including hidden pages because they are still validated. Use scope="page" only when cross-page overlap is intentional.',
      inputSchema: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          scope: { type: 'string', enum: ['stack', 'page'], description: 'stack (default) searches against all non-reference pages; page searches only the named page' },
          cellsW: { type: 'integer', minimum: 1, description: 'if given with cellsH, returns the first spot that fits' },
          cellsH: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1 },
          region: { type: 'string', description: 'search area as a cell range, e.g. "A1:AZ40". Defaults to the content plus a 4-cell margin, so pass this to find space further out.' },
        },
        additionalProperties: false,
      },
      handler: ({ page = 'base', scope = 'stack', cellsW = null, cellsH = null, limit = 12, region = null }) => {
        const doc = need(session);
        if ((cellsW == null) !== (cellsH == null)) {
          throw new SyntaxError('free_space needs cellsW and cellsH together, or neither when listing free rectangles');
        }
        const area = region ? parseRegion(region) : null;
        const context = core.occupancy.freeSpaceContext(doc, page, scope);
        const receipt = {
          scope: context.scope,
          target_page: context.targetPage,
          searched_pages: context.pageIds,
          ignored_reference_pages: context.ignoredReferencePages,
        };
        if (cellsW && cellsH) {
          const spot = core.occupancy.firstFitting(doc, page, cellsW, cellsH, { region: area, scope });
          return spot
            ? json({ ...receipt, fits: true, place_at: spot.at, cell: spot.cell, within: { at: spot.within.at, cells: spot.within.cells } })
            : json({ ...receipt, fits: false, note: `no free ${cellsW}x${cellsH} cell region across ${context.pageIds.join(', ')}; widen the region, move something, or use scope="page" only when cross-page overlap is intentional` });
        }
        return json({
          ...receipt,
          stats: core.occupancy.stats(doc, page, { scope }),
          free: core.occupancy.freeRects(doc, page, { limit, region: area, scope }),
        });
      },
    },

    {
      name: 'describe',
      description: 'List elements with their computed geometry, optionally narrowed to a page and/or cell region. Region filtering tests exact claimed rectangles, including each path quadrant, so an empty part of a path bounding box is not returned.',
      inputSchema: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          region: { type: 'string', description: 'optional cell range, e.g. "C4:AZ40"' },
        },
        additionalProperties: false,
      },
      handler: ({ page = null, region = null }) => {
        const doc = need(session);
        const pages = page ? [core.getPage(doc, page)] : doc.pages;
        const area = region ? parseRegion(region) : null;
        const filter = area ? formatRegionFilter(area) : null;
        return json(
          pages.map((p) => ({
            page: p.id,
            z: p.z,
            intent: p.intent,
            ...(filter ? { filter } : {}),
            groups: core.groupsOf(doc)
              .filter((group) => group.members.some((member) => core.findElement(doc, member)?.page === p.id))
              .map((group) => formatGroup(doc, group)),
            constraints: core.constraintsOf(doc)
              .filter((constraint) => [constraint.dependent, constraint.target]
                .some((id) => core.findElement(doc, id)?.page === p.id))
              .map((constraint) => formatConstraint(doc, constraint)),
            elements: core.elementsOf(doc, p.id)
              .filter((el) => !area || core.elementRects(el).some((footprint) => core.geometry.rectsOverlap(footprint, area)))
              .map((el) => describeElement(doc, el)),
          })),
        );
      },
    },

    {
      name: 'group',
      description:
        'Create and maintain a flat subsystem group, or move every member atomically by a relative whole-cell delta. An element belongs to at most one group. action="list" is read-only; create/add/remove/delete/move are persistent and participate in plan, history, save/open, and describe.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'create', 'add', 'remove', 'delete', 'move'] },
          id: { type: 'string', description: 'group id; required except for list' },
          label: { type: 'string', description: 'human-readable label when creating' },
          members: { type: 'array', items: { type: 'string' }, description: 'element ids for create, add, or remove' },
          cellsX: { type: 'integer', description: 'relative horizontal movement in cells' },
          cellsY: { type: 'integer', description: 'relative vertical movement in cells' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      handler: async ({ action, id = null, label = null, members = null, cellsX = 0, cellsY = 0 }) => {
        const doc = need(session);
        if (action === 'list') return json(core.groupsOf(doc).map((entry) => formatGroup(doc, entry)));
        if (!id) throw new Error(`group action "${action}" needs id`);
        if (action === 'move' && !cellsX && !cellsY) throw new Error('group move needs a non-zero cellsX or cellsY');
        const result = core.applyOperation(doc, { op: 'group', action, id, label, members, cellsX, cellsY });
        await persist(session);
        if (action === 'delete') return `deleted group "${id}"; its elements remain unchanged`;
        return json(formatGroup(doc, result));
      },
    },

    {
      name: 'constraint',
      description:
        'Create, inspect, delete, or re-sync a durable follow relationship. One anchor on a dependent element follows one anchor on a target element with an exact quadrant offset. Each dependent has one parent; cycles are refused. Relationships persist, cascade through chains, participate in plan/history, and update when elements move, resize, or are redrawn.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'create', 'delete', 'sync'] },
          id: { type: 'string', description: 'constraint id; optional only for list and sync-all' },
          dependent: { type: 'string', description: 'element that follows the target; required for create' },
          target: { type: 'string', description: 'element being followed; required for create' },
          dependentAnchor: { type: 'string', description: 'dependent anchor: N, S, E, W, C, or an indexed face such as E#2 (default C)' },
          targetAnchor: { type: 'string', description: 'target anchor: N, S, E, W, C, or an indexed face such as S#3 (default C)' },
          offsetX: { type: 'integer', description: 'optional exact horizontal offset in quadrants; provide with offsetY' },
          offsetY: { type: 'integer', description: 'optional exact vertical offset in quadrants; provide with offsetX' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      handler: async ({ action, id = null, dependent = null, target = null, dependentAnchor = 'C', targetAnchor = 'C', offsetX = null, offsetY = null }) => {
        const doc = need(session);
        if (action === 'list') return json(core.constraintsOf(doc).map((entry) => formatConstraint(doc, entry)));
        if (action === 'create') {
          if (!id || !dependent || !target) throw new Error('constraint create needs id, dependent, and target');
          if ((offsetX == null) !== (offsetY == null)) throw new Error('constraint create needs both offsetX and offsetY, or neither');
        } else if (action === 'delete' && !id) {
          throw new Error('constraint delete needs id');
        } else if (!['sync', 'delete'].includes(action)) {
          throw new SyntaxError(`constraint action must be list, create, delete, or sync — got ${JSON.stringify(action)}`);
        }
        const result = core.applyOperation(doc, {
          op: 'constraint', action, id, dependent, target, dependentAnchor, targetAnchor,
          offset: offsetX == null ? null : { x: offsetX, y: offsetY },
        });
        await persist(session);
        if (action === 'delete') return `deleted constraint "${id}"; element geometry remains unchanged`;
        if (action === 'sync') return `synchronized ${result} constraint(s)\n${json(core.constraintsOf(doc).map((entry) => formatConstraint(doc, entry)))}`;
        return json(formatConstraint(doc, result));
      },
    },

    {
      name: 'remove',
      description:
        'Delete an element permanently. Prefer a repair tool where one applies: resize or restyle for a box that is the wrong size or label, replace_path to redraw a connector, move to reposition. Removing and re-adding loses the id, and with it any acceptances recorded against findings about that element.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' }, page: { type: 'string' } }, required: ['id'], additionalProperties: false },
      handler: async ({ id, page = null }) => {
        const found = core.removeElement(need(session), id, page);
        await persist(session);
        return `removed "${id}" from page "${found.page}"`;
      },
    },

    // --- repair tools: one per fix kind the collision engine can emit ---------

    {
      name: 'resize',
      description:
        'Resize a box by cell span, keeping one corner pinned. This is the tool behind the "widen" and "heighten" fixes; it re-measures the label and reports the new fit.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          cellsW: { type: 'integer' },
          cellsH: { type: 'integer' },
          anchor: { type: 'string', description: 'which corner stays put: tl t tr l c r bl b br (default tl)' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: async ({ id, cellsW = null, cellsH = null, anchor = 'tl' }) => {
        const r = core.resizeBox(need(session), id, { cellsW, cellsH, anchor });
        await persist(session);
        return [
          `resized "${id}" to ${r.element.rect.w / 2}x${r.element.rect.h / 2} cells at ${core.address.quadToAddress(r.element.rect.x, r.element.rect.y)}`,
          r.fit ? `label fit: ${r.fit.fits ? 'OK' : 'STILL OVERFLOWING'} — ${r.fit.charsPerLine} chars/line, ${r.fit.lineCount} line(s), ${r.fit.visibleLines} visible` : '',
          r.fit && !r.fit.fits ? r.fit.fixes.map((f) => `  fix: ${f.description}`).join('\n') : '',
        ].filter(Boolean).join('\n');
      },
    },

    {
      name: 'restyle',
      description:
        'Change a box\'s label, corner style, text alignment, font size, or fill. This is the tool behind the "shorten" and "font" fixes; it re-measures the label.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          corner: { type: 'string', enum: ['square', 'rounded', 'indented', 'chamfered'] },
          align: { type: 'string', enum: ['left', 'center', 'right'] },
          fontSize: { type: 'integer' },
          fill: { type: 'string' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: async ({ id, ...changes }) => {
        const r = core.restyleBox(need(session), id, changes);
        await persist(session);
        return [
          `restyled "${id}"`,
          r.fit ? `label fit: ${r.fit.fits ? 'OK' : 'OVERFLOW'} — ${r.fit.charsPerLine} chars/line, ${r.fit.lineCount} line(s), ${r.fit.visibleLines} visible` : '',
        ].filter(Boolean).join('\n');
      },
    },

    {
      name: 'move',
      description:
        'Move an element, either to an address (its pin corner lands there) or by a delta in cells. This is the tool behind the "move" fix.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          at: { type: 'string', description: 'absolute destination, e.g. "F12.tl"' },
          pin: { type: 'string', description: 'which corner of the element lands on `at` (default tl)' },
          cellsX: { type: 'integer', description: 'relative move instead, in cells' },
          cellsY: { type: 'integer' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: async ({ id, at = null, pin = 'tl', cellsX = 0, cellsY = 0 }) => {
        const doc = need(session);
        if (at) core.moveElementTo(doc, id, at, pin);
        else if (cellsX || cellsY) core.moveElement(doc, id, cellsX * 2, cellsY * 2);
        else throw new Error('move needs either `at` or a non-zero `cellsX`/`cellsY`');
        await persist(session);
        const found = core.findElement(doc, id);
        const b = found.element.kind === 'path' ? found.element.pieces[0] : found.element.rect;
        return `moved "${id}" — now at ${core.address.quadToAddress(b.x, b.y)} on page "${found.page}"`;
      },
    },

    {
      name: 'rename',
      description: 'Rename an element. This is the tool behind the "rename" fix for duplicate ids.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' }, to: { type: 'string' } }, required: ['id', 'to'], additionalProperties: false },
      handler: async ({ id, to }) => {
        core.renameElement(need(session), id, to);
        await persist(session);
        return `renamed "${id}" to "${to}"`;
      },
    },

    {
      name: 'update_page',
      description:
        'Change a page\'s intent, stacking order, title, or visibility. This is the tool behind the "intent" fix — the one that turns an L005 error into an L010 note when the stacking really is deliberate.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          intent: { type: 'string', enum: ['exclusive', 'overlay'] },
          z: { type: 'integer' },
          title: { type: 'string' },
          visible: { type: 'boolean' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: async ({ id, ...changes }) => {
        const page = core.updatePage(need(session), id, changes);
        await persist(session);
        return `page "${page.id}" is now z:${page.z}, ${page.intent}, ${page.visible ? 'visible' : 'hidden'}\n\n${core.formatLog(core.validate(session.doc))}`;
      },
    },

    {
      name: 'set_canvas',
      description: 'Change the declared canvas bounds in cells. This is the tool behind the "canvas" fix.',
      inputSchema: { type: 'object', properties: { cols: { type: 'integer' }, rows: { type: 'integer' } }, required: ['cols', 'rows'], additionalProperties: false },
      handler: async ({ cols, rows }) => {
        core.setCanvas(need(session), cols, rows);
        await persist(session);
        return `canvas is now ${cols}x${rows} cells (${cols * 10}x${rows * 10} px)`;
      },
    },

    {
      name: 'extend_path',
      description:
        'Continue an existing path from where its pen stopped, without redrawing it. This is the tool behind the "extend" fix for a dangling connector.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' }, program: { type: 'string' } }, required: ['id', 'program'], additionalProperties: false },
      handler: async ({ id, program }) => {
        const r = core.extendPath(need(session), id, program);
        await persist(session);
        const lines = [`extended "${id}" — now ${r.path.pieces.length} quadrant(s)`, '', 'trace:'];
        for (const t of r.trace) lines.push(`  ${String(t.step).padStart(2)}. ${t.action.padEnd(6)} ${describeTrace(t)}   << ${t.source}`);
        lines.push('', `cursor now ${core.address.quadToAddress(r.cursor.x, r.cursor.y)} facing ${r.facing}`);
        for (const n of r.notes) lines.push(`  [${n.code}] step ${n.step}: ${n.message}`);
        return lines.join('\n');
      },
    },

    {
      name: 'replace_path',
      description: 'Redraw a path from scratch, keeping its id and its place in draw order. This is the tool behind the "reroute" fix.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' }, program: { type: 'string' } }, required: ['id', 'program'], additionalProperties: false },
      handler: async ({ id, program }) => {
        const r = core.replacePath(need(session), id, program);
        await persist(session);
        return `redrew "${id}" — ${r.path.pieces.length} quadrant(s)\n${r.notes.map((n) => `  [${n.code}] ${n.message}`).join('\n')}`.trimEnd();
      },
    },

    {
      name: 'boolean',
      description:
        'Combine two or more elements with exact lattice set algebra. action union, difference, intersection, or xor uses each element’s visual footprint by default and creates a cell-painted artwork path. This is not floating-point Bézier clipping: every output quadrant is explicit, collision-checked, persistent, undoable, and available to plan.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: [...core.edit.BOOLEAN_ACTIONS] },
          ids: { type: 'array', items: { type: 'string' }, minItems: 2, description: 'source element ids, in subtraction order for difference' },
          id: { type: 'string', description: 'result id; defaults to the first source id when replacing sources' },
          removeSources: { type: 'boolean', description: 'replace sources (default true), or retain them and create a separate result' },
          footprint: { type: 'string', enum: [...core.edit.FOOTPRINTS], description: 'visual (default) uses visible shape ink; claimed uses layout reservation geometry' },
          color: { type: 'string', pattern: '^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$', description: 'optional result colour' },
        },
        required: ['action', 'ids'],
        additionalProperties: false,
      },
      handler: async (args) => json(await applyAndPersist(session, 'boolean', args)),
    },

    {
      name: 'slice',
      description:
        'Divide one element at an explicit vertical or horizontal lattice boundary. divide (default) returns every edge-connected result in deterministic order; partition returns the two sides. The boundary is an address, never an inferred mouse gesture, so no fractional quadrants are discarded or approximated.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'element to partition' },
          axis: { type: 'string', enum: [...core.edit.SLICE_AXES] },
          at: { type: 'string', description: 'lattice boundary address, such as M1.tl for a vertical slice' },
          ids: { type: 'array', items: { type: 'string' }, description: 'optional deterministic ids for every result, in returned order' },
          mode: { type: 'string', enum: [...core.edit.SLICE_MODES] },
          footprint: { type: 'string', enum: [...core.edit.FOOTPRINTS] },
          color: { type: 'string', pattern: '^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$' },
        },
        required: ['id', 'axis', 'at'],
        additionalProperties: false,
      },
      handler: async (args) => json(await applyAndPersist(session, 'slice', args)),
    },

    {
      name: 'offset_path',
      description:
        'Offset visible or claimed lattice geometry by a signed whole-quadrant distance. Positive distances dilate and negative distances erode using an exact square-grid (Chebyshev) neighborhood; the operation fails rather than creating an empty or off-grid result.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          distance: { type: 'integer', description: 'signed offset in whole quadrants; positive outward, negative inward' },
          resultId: { type: 'string', description: 'result id; defaults to the source id when replacing it' },
          removeSource: { type: 'boolean', description: 'replace the source (default true), or retain it' },
          footprint: { type: 'string', enum: [...core.edit.FOOTPRINTS] },
          color: { type: 'string', pattern: '^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$' },
        },
        required: ['id', 'distance'],
        additionalProperties: false,
      },
      handler: async (args) => json(await applyAndPersist(session, 'offset_path', args)),
    },

    {
      name: 'stroke_to_path',
      description:
        'Materialise a path’s exact claimed quadrants as cell-painted artwork geometry. TurtlePen widths are at most one 5px quadrant, so this produces the only honest editable outline instead of inventing sub-lattice fractional geometry.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'source path id' },
          resultId: { type: 'string', description: 'result id; defaults to the source id when replacing it' },
          removeSource: { type: 'boolean', description: 'replace the path (default true), or retain it' },
          color: { type: 'string', pattern: '^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: async (args) => json(await applyAndPersist(session, 'stroke_to_path', args)),
    },

    {
      name: 'path_edit',
      description:
        'Edit explicit lattice path pieces. insert/move use an address and piece index; delete removes one piece; reverse flips path order; close draws the exact Bresenham bridge; open removes closure; split returns two paths; join appends an adjacent path. Direct piece edits clear resumable pen-program state so a stale cursor can never silently continue edited geometry.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          action: { type: 'string', enum: [...core.edit.PATH_EDIT_ACTIONS] },
          index: { type: 'integer', minimum: 0, description: 'piece index for insert, move, delete, or split' },
          at: { type: 'string', description: 'address for insert or move' },
          ids: { type: 'array', items: { type: 'string' }, description: 'two result ids for split; defaults to source id and source-part-2' },
          with: { type: 'string', description: 'adjacent path id to append for join' },
        },
        required: ['id', 'action'],
        additionalProperties: false,
      },
      handler: async (args) => json(await applyAndPersist(session, 'path_edit', args)),
    },

    {
      name: 'normalize_path',
      description:
        'Remove repeated lattice quadrants from one path while preserving first-occurrence order. This is a narrow, explicit cleanup operation; it never simplifies, moves, or approximates geometry that the caller did not name.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false,
      },
      handler: async (args) => json(await applyAndPersist(session, 'normalize_path', args)),
    },

    {
      name: 'reorder',
      description:
        'Change an element’s presentation order within its page: bring_to_front, send_to_back, raise, lower, before, or after. Same-page collisions remain validation errors; use an overlay page and an accepted finding for deliberate stacking.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          action: { type: 'string', enum: [...core.edit.REORDER_ACTIONS] },
          relative: { type: 'string', description: 'required by before and after; must be on the same page' },
        },
        required: ['id', 'action'],
        additionalProperties: false,
      },
      handler: async (args) => json(await applyAndPersist(session, 'reorder', args)),
    },

    {
      name: 'duplicate',
      description:
        'Deep-copy one element with a caller-chosen deterministic id and exact whole-quadrant delta. A duplicate joins the source’s flat group when it has one, but does not silently clone follow constraints.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          to: { type: 'string', description: 'new element id' },
          dx: { type: 'integer', description: 'horizontal delta in quadrants (default 0)' },
          dy: { type: 'integer', description: 'vertical delta in quadrants (default 0)' },
        },
        required: ['id', 'to'],
        additionalProperties: false,
      },
      handler: async (args) => json(await applyAndPersist(session, 'duplicate', args)),
    },

    {
      name: 'array',
      description:
        'Create a bounded rectangular array of exact copies, retaining the source at row 0 column 0. New ids are deterministic prefix-1, prefix-2, … in row-major order; values are capped at 100 copies and all steps are whole quadrants.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          columns: { type: 'integer', minimum: 1 },
          rows: { type: 'integer', minimum: 1 },
          stepX: { type: 'integer', description: 'horizontal copy spacing in quadrants' },
          stepY: { type: 'integer', description: 'vertical copy spacing in quadrants' },
          prefix: { type: 'string', description: 'new id prefix; defaults to source-copy' },
        },
        required: ['id', 'columns', 'rows', 'stepX', 'stepY'],
        additionalProperties: false,
      },
      handler: async (args) => json(await applyAndPersist(session, 'array', args)),
    },

    {
      name: 'inspect',
      description:
        'Inspect exact claimed or visual lattice geometry without changing the document. Returns areas, perimeters, integer bounds, rational centers, pairwise shared quadrants, and bounding-box gaps for explicit element ids.',
      inputSchema: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
          footprint: { type: 'string', enum: [...core.edit.FOOTPRINTS], description: 'claimed (default) or visual geometry' },
        },
        required: ['ids'],
        additionalProperties: false,
      },
      handler: ({ ids, footprint = 'claimed' }) => json(core.inspectGeometry(need(session), { ids, footprint })),
    },

    {
      name: 'unaccept_finding',
      description: 'Withdraw a previously recorded acceptance, putting the finding back in the open log.',
      inputSchema: { type: 'object', properties: { fingerprint: { type: 'string' } }, required: ['fingerprint'], additionalProperties: false },
      handler: async ({ fingerprint }) => {
        const removed = core.unacceptFinding(need(session), fingerprint);
        await persist(session);
        return removed ? `withdrew acceptance #${fingerprint}\n\n${core.formatLog(core.validate(session.doc))}` : `no acceptance recorded for #${fingerprint}`;
      },
    },

    {
      name: 'plan',
      description:
        'Map out a whole composition and see whether it conflicts BEFORE committing any of it. Applies a batch of operations to a throwaway copy and returns the collision log. Set commit:true to apply for real — and then it applies all-or-nothing, so a failure part-way leaves the document untouched.',
      inputSchema: {
        type: 'object',
        properties: {
          operations: {
            type: 'array',
            description: 'ordered operations, each { "op": "<name>", ...args }. Names: add_page update_page remove_page place_box place_image place_reference pen extend_path replace_path boolean slice offset_path stroke_to_path path_edit normalize_path reorder duplicate array resize restyle move rename remove set_canvas accept_finding unaccept_finding group constraint. Args match the same-named tool, including pen role/color/width/cap.',
            items: { type: 'object' },
          },
          commit: { type: 'boolean', description: 'false (default) rehearses; true applies all-or-nothing' },
        },
        required: ['operations'],
        additionalProperties: false,
      },
      handler: async ({ operations, commit = false }) => {
        const doc = need(session);
        const ops = await resolveSources(session, operations);
        const result = commit ? core.commitOperations(doc, ops) : core.planOperations(doc, ops);
        if (!result.ok) {
          return [
            `plan FAILED at operation ${result.failedAt + 1} of ${operations.length}: ${result.error}`,
            `nothing was applied — the document is unchanged.`,
            `operation ${result.failedAt + 1} was: ${JSON.stringify(operations[result.failedAt])}`,
          ].join('\n');
        }
        if (commit) await persist(session);
        return [
          commit
            ? `committed ${result.applied} operation(s).`
            : `rehearsed ${result.applied} operation(s) on a copy — the document is unchanged. Re-send with commit:true to apply.`,
          '',
          core.formatLog(result.validation),
        ].join('\n');
      },
    },

    {
      name: 'render',
      description: 'Write the diagram to an SVG file. Text is emitted with textLength, so what is drawn cannot disagree with what was measured.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          showGrid: { type: 'boolean' },
          markFindings: { type: 'boolean' },
          force: { type: 'boolean', description: 'render even with findings outstanding' },
          bounds: { type: 'string', enum: ['content', 'canvas'], description: 'crop to occupied content (default), or preserve the declared canvas composition' },
          margin: { type: 'integer', minimum: 0, description: 'outer margin in px (default 20)' },
        },
        additionalProperties: false,
      },
      handler: async ({ path = null, showGrid = true, markFindings = false, force = false, bounds = 'content', margin = 20 }) => {
        const doc = need(session);
        const target = resolve(session.cwd, path ?? (session.path ? session.path.replace(/\.turtlepen\.json$/, '.svg') : 'diagram.svg'));
        const findings = markFindings ? core.validate(doc).open : null;
        await core.exportSvg(doc, target, { showGrid, findings, force, bounds, margin });
        // The hash of the bytes actually written. A perceptual review binds to
        // it, so a review of an older render is visibly stale rather than
        // quietly wrong. Returning it here is what makes that loop closeable.
        const { readFile } = await import('node:fs/promises');
        const hash = core.renderHash(await readFile(target, 'utf8'));
        return `wrote ${target}\nrenderHash: ${hash}\n\nNow LOOK at it. When you have, record what you saw with perceptual_review — validate cannot tell you whether the drawing depicts what was asked for.`;
      },
    },

    {
      name: 'perceptual_review',
      description:
        'Record what a drawing LOOKS like, after rendering and looking at it. validate proves a drawing is structurally undefective; it cannot prove the drawing depicts what was asked for — a corpus once validated CLEAN while a sheep read as a stegosaurus and half-tone spots dithered into plus-signs. Nothing recorded here reaches collision geometry, and the structural and perceptual verdicts are returned side by side, never merged into one flag. A review binds to the renderHash that "render" returned, so editing the drawing afterwards marks the review stale instead of leaving a stale opinion looking current.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { description: 'record (default) attaches a review; status returns both verdicts without changing anything', type: 'string', enum: ['record', 'status'] },
          renderHash: { description: 'the renderHash "render" reported for the bytes you actually looked at', type: 'string' },
          reviewer: { description: 'who or what looked at it', type: 'string' },
          note: { type: 'string' },
          findings: {
            description: 'what you SAW. Each finding needs a symptom (what it looks like) and a consequence (what a reader would get wrong).',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
                category: { type: 'string', enum: [...core.PERCEPTUAL_CATEGORIES] },
                elements: { type: 'array', items: { type: 'string' } },
                region: { type: 'string' },
                symptom: { description: 'what it LOOKS like, not what is wrong with it', type: 'string' },
                consequence: { description: 'what a reader would conclude because of it', type: 'string' },
                confidence: { type: 'number' },
                repair: { type: 'string', enum: [...core.REPAIR_CLASSES] },
              },
              required: ['id', 'severity', 'category', 'symptom', 'consequence'],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
      handler: async ({ action = 'record', renderHash = null, reviewer = null, findings = [], note = null }) => {
        const doc = need(session);
        if (action === 'record') {
          core.OPERATIONS.perceptual_review(doc, { renderHash, reviewer, findings, note });
        }
        const current = core.renderHash(core.renderSvg(doc, {}));
        const v = core.perceptualVerdicts(doc, { structural: core.validate(doc), currentRenderHash: current });
        const p = v.perceptual;
        const lines = [
          `structural: ${v.structural.clean ? 'CLEAN' : 'NOT CLEAN'} (${v.structural.open} open finding(s))`,
          p.reviewed
            ? `perceptual: ${p.clean ? 'no blocking findings' : `${p.blocking} blocking`} of ${p.findings} recorded by ${p.reviewer}${p.stale ? ' — STALE: the drawing changed since this review, so it describes bytes nobody is looking at now' : ''}`
            : 'perceptual: NOT REVIEWED — render it, look at it, and record what you saw. Absence of a review is not a pass.',
          '',
          'These are two answers to two different questions and are deliberately not combined. A clean log over the wrong picture is the case that matters.',
        ];
        return lines.join('\n');
      },
    },

    {
      name: 'import_mermaid',
      description:
        'Compile a Mermaid flowchart into TurtlePen operations. Returns the operations; it does NOT change the document. Feed them to "plan" to rehearse, read the collision log, then commit — so an import is subject to exactly the same validation as anything drawn by hand, and cannot produce geometry the normal path could not. Node brackets map onto the symbol vocabulary: ([x]) terminator, {x} decision, [/x/] io, {{x}} prep, [(x)] data, [[x]] subprocess, backslash-delimited manual, [x] process. It lays out a top-to-bottom spine; it does NOT route, and says so when an edge is not a straight drop. Unsupported syntax (subgraph, classDef, style, click) is refused by name rather than silently dropped.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { description: 'the mermaid flowchart text, including its "flowchart TD" header', type: 'string' },
          page: { type: 'string' },
          nodeWidth: { type: 'integer' },
          nodeHeight: { type: 'integer' },
        },
        required: ['source'],
        additionalProperties: false,
      },
      handler: async ({ source, page = 'base', nodeWidth = 26, nodeHeight = 8 }) => {
        const result = core.mermaidToOperations(source, { page, nodeWidth, nodeHeight });
        return JSON.stringify({
          nodes: result.nodes,
          edges: result.edges,
          notes: result.notes,
          next: 'Pass these to plan (commit:false) and read the log before committing.',
          operations: result.operations,
        }, null, 2);
      },
    },

    {
      name: 'route',
      description:
        'Propose a connector between two faces. Returns a PEN PROGRAM and changes nothing — you read it, then run it through "pen" like anything you wrote yourself, and it validates identically. There is no hidden router: the path stays inspectable, which is the condition auto-routing was deferred on. It tries the three shapes a person would draw (straight, one turn, two turns) against everything already on the page. If none is clear it says so and NAMES what is in the way, because a twelve-turn path that avoids everything is not a connector anyone can follow.',
      inputSchema: {
        type: 'object',
        properties: {
          from: { description: 'source face, e.g. "gateway.S"', type: 'string' },
          to: { description: 'target face, e.g. "checkout.N"', type: 'string' },
          page: { type: 'string' },
        },
        required: ['from', 'to'],
        additionalProperties: false,
      },
      handler: async ({ from, to, page = 'base' }) => {
        const doc = need(session);
        const r = core.routeProgram(doc, page, from, to);
        if (!r.clear) {
          return `no clear route from ${from} to ${to}.
`
            + (r.blockedBy ? `blocked by "${r.blockedBy.by}" at ${r.blockedBy.at}
` : '')
            + `${r.note}
tried: ${r.tried.map((t) => `${t.turns} turn(s)`).join(', ') || 'nothing applicable'}`;
        }
        return `${r.turns} turn(s), clear. Run this with "pen" — nothing has changed yet:

${r.program}`;
      },
    },

    {
      name: 'repair',
      description:
        'Turn a finding\'s fix into the call that performs it. With no index it LISTS the fixes, saying which are one call away and which need a decision from you first. With an index it performs that fix through the same operations as any other mutation — rehearsable, undoable, and nothing it could not have done by hand. It does NOT guess: a fix that lacks the information to be performed (reroute, offset, hop, extend, rename, shorten) is refused by name with what is missing and which tool takes it, because inventing a plausible mutation you did not ask for is the failure this engine exists to prevent.',
      inputSchema: {
        type: 'object',
        properties: {
          fingerprint: { description: 'the fingerprint of a CURRENT open finding', type: 'string' },
          index: { description: 'which fix to apply; omit to list them', type: 'integer' },
        },
        required: ['fingerprint'],
        additionalProperties: false,
      },
      handler: async ({ fingerprint, index = null }) => {
        const doc = need(session);
        if (index == null) {
          const plan = core.repairPlan(doc, fingerprint);
          const lines = [`${plan.rule} [${plan.severity}] ${plan.actors.join(', ')}`];
          for (const f of plan.fixes) {
            lines.push(f.executable
              ? `  [${f.index}] ${f.kind} — one call: ${f.op} ${JSON.stringify(f.args)}`
              : `  [${f.index}] ${f.kind} — needs you: ${f.why}`);
          }
          lines.push('', 'Apply one with repair { fingerprint, index }.');
          return lines.join('\n');
        }
        const r = core.applyFix(doc, fingerprint, index, core.OPERATIONS);
        return `applied ${r.applied.kind} via ${r.applied.op} ${JSON.stringify(r.applied.args)}\n`
          + `findings ${r.findingsBefore} -> ${r.findingsAfter}`
          + (r.improved ? '' : ' — no reduction; this repair traded one finding for another, or the log is unchanged');
      },
    },

    {
      name: 'measure_image',
      description: 'Read real image dimensions and report the measured whole-cell footprint, aspect rounding, rendered-pixel scale, and dither/simplify quadrant-sampling scales. Call this BEFORE place_image. Reports say exactly whether each stage upscales, downscales, or stays exact; upscaling never creates detail.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'a data: URI, or a path relative to the document' },
          maxWidthCells: { type: 'integer' },
          maxHeightCells: { type: 'integer' },
          fit: { type: 'string', enum: ['contain', 'cover'], description: 'scale policy to report; default contain' },
        },
        required: ['source'],
        additionalProperties: false,
      },
      handler: async ({ source, maxWidthCells = null, maxHeightCells = null, fit = 'contain' }) => {
        const resolved = await readImage(session, source);
        const probed = resolved.info;
        const m = core.image.measure(probed, { maxWidthCells, maxHeightCells });
        const simplifyScale = core.image.scaleReport(probed, {
          cellsWide: m.cellsWide, cellsTall: m.cellsTall, mode: 'simplify', fit,
        });
        const simplifyTarget = { width: m.cellsWide * 2, height: m.cellsTall * 2 };
        const simplifyTargetSize = simplifyTarget.width * simplifyTarget.height;
        const simplifySupersample = simplifyTargetSize <= core.dither.MAX_SIMPLIFY_QUADRANTS
          ? core.dither.resolveSupersample('auto', simplifyTarget.width, simplifyTarget.height)
          : null;
        return JSON.stringify({
          ...probed,
          ...m,
          scale: {
            embed: core.image.scaleReport(probed, { cellsWide: m.cellsWide, cellsTall: m.cellsTall, mode: 'embed', fit }),
            dither: core.image.scaleReport(probed, { cellsWide: m.cellsWide, cellsTall: m.cellsTall, mode: 'dither', fit }),
            simplify: {
              ...simplifyScale,
              workingCanvas: simplifySupersample === null
                ? {
                    available: false,
                    reason: `final simplify target exceeds ${core.dither.MAX_SIMPLIFY_QUADRANTS} quadrants`,
                    downsampleTo: { ...simplifyTarget, unit: 'quadrants' },
                  }
                : {
                    available: true,
                    requestedSupersample: 'auto', resolvedSupersample: simplifySupersample,
                    width: simplifyTarget.width * simplifySupersample,
                    height: simplifyTarget.height * simplifySupersample,
                    unit: 'quadrants',
                    downsampleTo: { ...simplifyTarget, unit: 'quadrants' },
                  },
            },
          },
        }, null, 2);
      },
    },
    {
      name: 'wireframe',
      description:
        'Lay a dimensioned area and its equipment onto the page, to scale. Authored in INCHES and converted at a declared scale, so the drawing is measurable rather than suggestive. Walls are drawn as walls and service clearance as bands around each unit, which means an encroachment reports as an ordinary collision — a unit too near a wall or another unit fails validate. Supply clearance values from the equipment listing and governing code; this tool invents none. Follow with export_prompt to brief an image model.',
      inputSchema: {
        type: 'object',
        properties: {
          widthIn: { type: 'number', description: 'area width in inches' },
          depthIn: { type: 'number', description: 'area depth in inches' },
          scale: { type: ['number', 'string'], description: 'quadrants per foot (2 = one quadrant per 6in), or 1/4in=1ft | 1/2in=1ft | 1in=1ft' },
          items: {
            type: 'array',
            description: 'equipment; positions are inches from the area top-left corner',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                widthIn: { type: 'number' },
                depthIn: { type: 'number' },
                atXIn: { type: 'number' },
                atYIn: { type: 'number' },
                clearanceIn: { type: 'number', description: 'required service clearance on all sides, from the listing or code' },
                describe: { type: 'string', description: 'what an image model should draw here' },
              },
              required: ['id', 'widthIn', 'depthIn', 'atXIn', 'atYIn'],
              additionalProperties: false,
            },
          },
          heightIn: { type: 'number', description: 'for an elevation: wall height in inches (use instead of depthIn)' },
          view: { type: 'string', enum: ['plan', 'elevation'], description: 'plan looks down; elevation looks at a wall, where items may be positioned by atAffIn' },
          runs: {
            type: 'array',
            description: 'routed paths — line sets, drain, control wiring, conduit. Length is measured along the route, not estimated.',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                kind: { type: 'string', enum: ['lineset', 'drain', 'control', 'power'], description: 'sets the stroke pattern so the runs tell apart without a legend' },
                waypoints: {
                  type: 'array',
                  description: 'corners of the route, in inches from the area top-left',
                  items: { type: 'object', properties: { xIn: { type: 'number' }, yIn: { type: 'number' } }, required: ['xIn', 'yIn'], additionalProperties: false },
                },
                allowanceIn: { type: 'number', description: 'extra length not visible in this view — an interior leg beyond a wall, or service slack' },
                describe: { type: 'string' },
              },
              required: ['id', 'waypoints'],
              additionalProperties: false,
            },
          },
          clearance: { type: 'boolean', description: 'draw clearance bands (default true)' },
          page: { type: 'string' },
        },
        required: ['widthIn', 'items'],
        additionalProperties: false,
      },
      handler: async ({ widthIn, depthIn, heightIn = null, items, runs = [], scale = 2, clearance = true, view = 'plan', page = 'base' }) => {
        const doc = need(session);
        const r = core.applyWireframe(doc, { page, widthIn, depthIn, heightIn, items, runs, scale, clearance, view });
        await persist(session);
        const v = core.validate(doc);
        const errs = v.open.filter((f) => ['S0', 'S1'].includes(f.severity));
        return [
          `wireframe on page "${page}": ${core.wireframe.feetInches(widthIn)} x ${core.wireframe.feetInches(depthIn)}`,
          `scale ${typeof scale === 'number' ? `${scale} quadrants per foot` : scale} — one quadrant is ${core.wireframe.feetInches(1 / r.plan.quadrantsPerInch)}`,
          `${r.boxes.length} boxes placed (4 walls + ${items.length} unit(s)${clearance ? ' + clearance bands' : ''})`,
          ...(r.plan.runs?.length
            ? r.plan.runs.map((run) => `run ${run.id} (${run.kind}): ${core.wireframe.feetInches(run.lengthIn + (run.allowanceIn || 0))}`
              + (run.allowanceIn ? ` = ${core.wireframe.feetInches(run.lengthIn)} routed + ${core.wireframe.feetInches(run.allowanceIn)} allowance` : ' measured along the route')
              + (run.penetrations?.length ? `, ${run.penetrations.length} penetration(s)` : ''))
            : []),
          '',
          ...(r.plan.drift.length
            ? ['ROUNDING — these do not land on a whole quadrant:',
              ...r.plan.drift.map((d) => `  ${d}`),
              '  Use a finer scale if any of these matter.']
            : ['rounding: every dimension lands exactly on the lattice']),
          '',
          errs.length
            ? `${errs.length} clearance/collision error(s) — run validate for the detail. A unit whose clearance band reaches a wall does not have its stated clearance.`
            : 'clearance: CLEAR — every unit has the clearance it declared',
        ].join('\n');
      },
    },

    {
      name: 'perspective_scene',
      description:
        'Project a room and its contents onto the lattice through a real camera, in three dimensions. Use this when a flat plan or elevation cannot carry what matters — a receding stair, a ceiling far behind the wall, equipment at different depths, or matching the geometry of a photograph. Authored in room INCHES: X rightward, Y up from the finished floor, Z away from the camera. Boxes draw far-to-near because the lattice has no z-buffer, and run lengths are measured in the room rather than off the projection.',
      inputSchema: {
        type: 'object',
        properties: {
          roomIn: {
            type: 'object',
            properties: { widthIn: { type: 'number' }, depthIn: { type: 'number' }, heightIn: { type: 'number' } },
            required: ['widthIn', 'depthIn', 'heightIn'],
            additionalProperties: false,
          },
          eyeIn: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } }, required: ['x', 'y', 'z'], additionalProperties: false, description: 'camera position; a standing eye is about y:66, and z is negative when outside the room' },
          targetIn: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } }, required: ['x', 'y', 'z'], additionalProperties: false },
          fovDeg: { type: 'number', description: 'vertical field of view; a phone photo in a cramped room is usually 60-75' },
          items: {
            type: 'array',
            description: 'equipment as boxes in room inches',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                xIn: { type: 'number' }, yIn: { type: 'number' }, zIn: { type: 'number' },
                widthIn: { type: 'number' }, heightIn: { type: 'number' }, depthIn: { type: 'number' },
              },
              required: ['id', 'xIn', 'yIn', 'zIn', 'widthIn', 'heightIn', 'depthIn'],
              additionalProperties: false,
            },
          },
          runs: {
            type: 'array',
            description: 'routed 3D paths — line sets, conduit. Length is measured in the room, so a run that recedes is not a shorter run.',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                waypoints: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } }, required: ['x', 'y', 'z'], additionalProperties: false } },
                color: { type: 'string', pattern: '^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$' },
                pattern: { type: 'string', enum: ['dashed', 'dotted'] },
              },
              required: ['id', 'waypoints'],
              additionalProperties: false,
            },
          },
          page: { type: 'string' },
        },
        required: ['roomIn', 'eyeIn', 'targetIn'],
        additionalProperties: false,
      },
      handler: async (args) => {
        const doc = need(session);
        const r = core.applyPerspectiveScene(doc, args);
        await persist(session);
        const lines = [
          `projected ${r.boxes.length} box(es) through a ${args.fovDeg ?? 60} degree lens, drawn far to near`,
          ...r.boxes.map((b) => `  ${b.id.padEnd(12)} depth ${b.depth}"${b.dropped ? `  — ${b.dropped} edge(s) behind the camera, not drawn` : ''}`),
        ];
        for (const run of r.runs) {
          lines.push(`  run ${run.id}: ${core.wireframe.feetInches(run.lengthIn)} measured in the room`);
        }
        const dropped = r.boxes.reduce((s2, b) => s2 + b.dropped, 0);
        if (dropped) lines.push('', 'Edges behind the camera are dropped rather than clipped, so a hole means the camera is inside the geometry — move eyeIn back.');
        return lines.join('\n');
      },
    },

    {
      name: 'export_prompt',
      description:
        'Emit the composition brief for an image-generation model: the area in feet and inches, each item as a normalised box within it, its real size, its position in plain words, and its description. Read-only. Serves both kinds of model — one that accepts regional conditioning reads the numbers, one that only reads prose gets the same arrangement stated in words.',
      inputSchema: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'opening line; defaults to a plain description of the area' },
          style: { type: 'string', description: 'rendering style, e.g. "clean architectural line drawing, top-down"' },
          view: { type: 'string', description: 'plan | elevation | isometric (default plan)' },
        },
        additionalProperties: false,
      },
      handler: ({ subject = null, style = null, view = 'plan' }) => {
        const doc = need(session);
        if (!doc.wireframe) throw new Error('no wireframe on this document — call wireframe first');
        assertWireframeCurrent(doc);
        return core.wireframe.toPrompt(doc.wireframe, { subject, style, view });
      },
    },

    {
      name: 'place_image',
      description: 'Place an image at an exact footprint. Embed preserves verified source bytes; dither reproduces tone with deterministic ordered ink; simplify intentionally discards low-salience texture and may process on a 1x, 2x, or 4x working canvas before box-averaging weighted coverage onto the final lattice. Rasterized modes report readability and must be removed/re-placed to change sampling size. All modes preserve aspect through contain or cover.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          at: { type: 'string' },
          span: { type: ['string', 'object'] },
          source: { type: 'string', description: 'a supported image data URI, or a path relative to the active diagram' },
          mode: { type: 'string', enum: ['embed', 'dither', 'simplify'] },
          fit: { type: 'string', enum: ['contain', 'cover'] },
          detail: { type: 'string', enum: ['auto', 'low', 'medium', 'high'], description: 'simplify only; auto resolves from output size and scale severity' },
          supersample: { enum: ['auto', 1, 2, 4], description: 'simplify only; linear working-canvas factor. 4 means 4x width and height, then deterministic 16-sample coverage averaging onto the final 1x lattice' },
          opacity: { type: 'number' },
          page: { type: 'string' },
        },
        required: ['id', 'at', 'span', 'source'],
        additionalProperties: false,
      },
      handler: async ({ id, at, span, source, mode = 'embed', fit = 'contain', detail = 'auto', supersample = 'auto', opacity = null, page = 'base' }) => {
        const doc = need(session);
        const resolved = await readImage(session, source);
        const probed = resolved.info;
        const cells = core.normalizeSpan(span, `span for "${id}"`);
        const recommended = core.image.measure(probed, { maxWidthCells: cells.w });
        const el = core.placeImage(doc, page, { id, at, span, source: resolved.dataUri, mode, fit, detail, supersample, opacity });
        await persist(session);
        return `placed image "${id}" on page "${page}" at ${core.address.quadToAddress(el.rect.x, el.rect.y)}, ${cells.w}x${cells.h} cells
`
          + `source: ${probed.format} ${probed.width}x${probed.height}
`
          + (recommended.cellsTall === cells.h
            ? `footprint: matches the measured ${recommended.cellsWide}x${recommended.cellsTall}-cell recommendation at this width (${recommended.aspectDriftPct}% whole-cell aspect drift)`
            : `footprint: requested ${cells.w}x${cells.h} cells; measured recommendation at this width is ${recommended.cellsWide}x${recommended.cellsTall}. ${fit} preserves source aspect and will ${fit === 'cover' ? 'crop overflow' : 'pad unused space'}`)
          + `\nrender: ${el.scale.render.direction.toUpperCase()} to ${el.scale.render.contentPx.width}x${el.scale.render.contentPx.height}px inside a ${el.scale.renderedPx.width}x${el.scale.renderedPx.height}px ${fit} viewport`
          + `\nsampling: ${el.scale.sampling.direction.toUpperCase()} to ${el.scale.sampling.content.width}x${el.scale.sampling.content.height} ${el.scale.sampling.content.unit}; ${el.scale.sampling.procedure}`
          + (mode !== 'embed'
            ? `\nreadability: ${el.ditherStats.readability.toUpperCase()} — ${(el.ditherStats.transitionRatio * 100).toFixed(1)}% neighbour transitions, ${(el.ditherStats.coverageRatio * 100).toFixed(1)}% ink, ${el.ditherStats.runCount} runs`
            : '')
          + (mode === 'simplify'
            ? el.processing.strategy === 'threshold-simplify'
              ? `\nsimplification: ${el.processing.resolvedDetail.toUpperCase()} detail (${el.processing.requestedDetail} requested), ${el.processing.resolvedSupersample}:1 working canvas ${el.processing.workingCanvas.width}x${el.processing.workingCanvas.height} -> 1:1 final lattice by ${el.processing.downsampleMethod} (${el.processing.workingSamplesPerOutput} weighted samples/output; ${el.processing.partialCoverageSamples} partially covered final quadrants), near-binary threshold at ${el.processing.contrastFloor} background contrast, removed ${el.processing.removedSamples} working samples in ${el.processing.removedComponents} small fragments; perceptual approximation, not a 1:1 copy`
              : `\nsimplification: ${el.processing.resolvedDetail.toUpperCase()} detail (${el.processing.requestedDetail} requested), ${el.processing.resolvedSupersample}:1 working canvas ${el.processing.workingCanvas.width}x${el.processing.workingCanvas.height} -> 1:1 final lattice by ${el.processing.downsampleMethod} (${el.processing.workingSamplesPerOutput} weighted samples/output; ${el.processing.partialCoverageSamples} partially covered final quadrants), ${el.processing.blurRadius}-working-quadrant smoothing, ${el.processing.inkBudget}-working-quadrant strong-feature budget plus ${el.processing.expandedSamples} contour extensions, removed ${el.processing.removedSamples} working samples in ${el.processing.removedComponents} small fragments; perceptual approximation, not a 1:1 copy`
            : '');
      },
    },
    {
      name: 'place_reference',
      description:
        'Lay an aspect-preserved image UNDER the drawing to trace over, checked for busy raster output and flagged by L020 until remove_page removes it. Dither is exact tonal lattice ink; simplify is a sparse perceptual approximation for sources whose literal dither is unreadable.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'page id; defaults to "reference"' },
          source: { type: 'string', description: 'a data: URI, or a path relative to the document' },
          at: { type: 'string' },
          span: { type: ['string', 'object'] },
          opacity: { type: 'number', description: 'default 0.25 — faint enough to draw over' },
          mode: { type: 'string', enum: ['dither', 'simplify'], description: 'default dither; use simplify when literal tonal reproduction is too busy' },
          fit: { type: 'string', enum: ['contain', 'cover'] },
          detail: { type: 'string', enum: ['auto', 'low', 'medium', 'high'], description: 'simplify only' },
          supersample: { enum: ['auto', 1, 2, 4], description: 'simplify only; linear working-canvas factor before reduction to final size' },
        },
        required: ['source', 'span'],
        additionalProperties: false,
      },
      handler: async ({ id = 'reference', source, at = 'A1.tl', span, opacity = undefined, mode = 'dither', fit = 'contain', detail = 'auto', supersample = 'auto' }) => {
        const doc = need(session);
        const resolved = await readImage(session, source);
        const probed = resolved.info;
        const page = core.placeReference(doc, {
          id, at, span, opacity, mode, fit, detail, supersample,
          source: resolved.dataUri,
        });
        await persist(session);
        const cells = core.normalizeSpan(span, 'reference span');
        const m = core.image.measure(probed, { maxWidthCells: cells.w });
        const image = core.elementsOf(doc, page.id).find((element) => element.kind === 'image');
        return `laid reference "${page.id}" at z:${page.z}, opacity ${page.opacity}, ${cells.w}x${cells.h} cells
`
          + `source: ${probed.format} ${probed.width}x${probed.height}${m.aspectDriftPct > 0 ? `, ${m.aspectDriftPct}% aspect drift from whole-cell rounding` : ', aspect exact'}
`
          + `sampling: ${image.scale.sampling.direction.toUpperCase()} to ${image.scale.sampling.content.width}x${image.scale.sampling.content.height} ${image.scale.sampling.content.unit} — ${image.scale.sampling.procedure}
`
          + `readability: ${image.ditherStats.readability.toUpperCase()} — ${(image.ditherStats.transitionRatio * 100).toFixed(1)}% neighbour transitions
`
          + `draw on top, then remove_page { id: "${page.id}" } — L020 will remind you until you do`;
      },
    },
    {
      name: 'history',
      description:
        'Inspect, clear, or navigate the active diagram\'s durable bounded edit history. Undo/redo survives open_diagram and MCP restarts through a hash-bound sidecar. Stale or corrupt sidecars are ignored. Failed and no-op calls create no entry, and a new edit clears redo.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['status', 'undo', 'redo', 'clear'], description: 'defaults to status' },
        },
        additionalProperties: false,
      },
      handler: async ({ action = 'status' }) => {
        need(session);
        if (!['status', 'undo', 'redo', 'clear'].includes(action)) {
          throw new SyntaxError(`history action must be status, undo, redo, or clear — got ${JSON.stringify(action)}`);
        }
        if (action === 'status') return json(historyReceipt(session));
        if (action === 'clear') {
          resetHistory(session, 'history cleared explicitly');
          await persistHistory(session);
          return `cleared undo and redo history\n${json(historyReceipt(session))}`;
        }

        const before = core.serialize(session.doc);
        const historyBefore = [...session.history];
        const futureBefore = [...session.future];
        const noticeBefore = session.historyNotice;
        const source = action === 'undo' ? session.history : session.future;
        if (!source.length) throw new Error(`nothing to ${action}`);
        const entry = source.at(-1);
        try {
          if (action === 'undo') {
            session.history = session.history.slice(0, -1);
            session.future = trimHistory(session, [...session.future, { label: entry.label, state: before }]);
          } else {
            session.future = session.future.slice(0, -1);
            session.history = trimHistory(session, [...session.history, { label: entry.label, state: before }]);
          }
          session.doc = core.deserialize(entry.state);
          await persist(session);
          await persistHistory(session);
          return `${action === 'undo' ? 'undid' : 'redid'} ${entry.label}\n${json(historyReceipt(session))}`;
        } catch (err) {
          session.doc = core.deserialize(before);
          session.history = historyBefore;
          session.future = futureBefore;
          session.historyNotice = noticeBefore;
          try {
            await persist(session);
            await persistHistory(session);
          } catch (rollbackError) {
            throw new Error(`${err.message}; history rollback checkpoint also failed: ${rollbackError.message}`, { cause: err });
          }
          throw err;
        }
      },
    },

    {
      name: 'save',
      description: 'Save the active diagram, optionally to a new path.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          force: { type: 'boolean', description: 'write even with findings outstanding; the document records that you did' },
        },
        additionalProperties: false,
      },
      handler: async ({ path = null, force = false }) => {
        const doc = need(session);
        if (path) session.path = resolve(session.cwd, path);
        await core.saveDocument(doc, session.path, { force });
        await persistHistory(session);
        return force && doc.forcedSave
          ? `saved ${session.path} — FORCED past ${doc.forcedSave.findingCount} outstanding finding(s); the document records this`
          : `saved ${session.path}`;
      },
    },
  ];

  return tools.map((tool) => (MUTATING_TOOLS.has(tool.name)
    ? { ...tool, handler: (args) => withHistory(session, tool.name, args, tool.handler) }
    : tool));
}

/** Element geometry plus, for anything carrying a label, its live fit status —
 *  so the AI can see a sizing problem without a separate validate call. */
function describeElement(doc, el) {
  if (el.kind === 'path') {
    return {
      id: el.id,
      kind: 'path',
      quadrants: el.pieces.length,
      from: core.address.quadToAddress(el.pieces[0].x, el.pieces[0].y),
      to: core.address.quadToAddress(el.pieces.at(-1).x, el.pieces.at(-1).y),
      end: el.end ? { at: core.address.quadToAddress(el.end.x, el.end.y), facing: el.end.facing } : null,
      pieces: countBy(el.pieces.map((p) => p.type)),
      groups: core.groupsOf(doc).filter((group) => group.members.includes(el.id)).map((group) => group.id),
      constraints: constraintRefs(doc, el.id),
    };
  }
  const content = el.kind === 'text' ? el.text : el.label;
  const fit = content ? core.text.fitReport(content, el.rect, { fontSize: el.fontSize, paddingQuads: doc.font.paddingQuads, align: el.align }) : null;
  return {
    id: el.id,
    kind: el.kind,
    at: core.address.quadToAddress(el.rect.x, el.rect.y),
    cells: { w: el.rect.w / 2, h: el.rect.h / 2 },
    label: content,
    corner: el.corner,
    fontSize: el.fontSize,
    fit: fit ? { fits: fit.fits, charsPerLine: fit.charsPerLine, lines: fit.lineCount, visibleLines: fit.visibleLines } : null,
    groups: core.groupsOf(doc).filter((group) => group.members.includes(el.id)).map((group) => group.id),
    constraints: constraintRefs(doc, el.id),
    // Where a connector should start to leave this box on each face. Reported
    // because deriving it by hand is a reliable source of off-by-one errors.
    seats: el.kind === 'box' ? portSeats(el) : null,
    seatSlots: el.kind === 'box' ? portSlotCapacities(el) : null,
  };
}

function formatGroup(doc, group) {
  const bounds = core.groupBounds(doc, group.id);
  return {
    id: group.id,
    label: group.label,
    members: [...group.members],
    pages: [...new Set(group.members.map((member) => core.findElement(doc, member)?.page).filter(Boolean))],
    bounds: bounds ? {
      at: core.address.quadToAddress(bounds.x, bounds.y),
      cells: { w: bounds.w / 2, h: bounds.h / 2 },
    } : null,
  };
}

function constraintRefs(doc, id) {
  return {
    follows: core.constraintsOf(doc).filter((constraint) => constraint.dependent === id).map((constraint) => constraint.id),
    followedBy: core.constraintsOf(doc).filter((constraint) => constraint.target === id).map((constraint) => constraint.id),
  };
}

function formatConstraint(doc, constraint) {
  const dependentAt = core.elementAnchor(doc, constraint.dependent, constraint.dependentAnchor);
  const targetAt = core.elementAnchor(doc, constraint.target, constraint.targetAnchor);
  const actualOffset = { x: dependentAt.x - targetAt.x, y: dependentAt.y - targetAt.y };
  return {
    id: constraint.id,
    dependent: {
      id: constraint.dependent,
      anchor: constraint.dependentAnchor,
      at: core.address.quadToAddress(dependentAt.x, dependentAt.y),
    },
    target: {
      id: constraint.target,
      anchor: constraint.targetAnchor,
      at: core.address.quadToAddress(targetAt.x, targetAt.y),
    },
    offset: {
      quadrants: { ...constraint.offset },
      cells: { x: constraint.offset.x / 2, y: constraint.offset.y / 2 },
    },
    synchronized: actualOffset.x === constraint.offset.x && actualOffset.y === constraint.offset.y,
    actualOffset: {
      quadrants: actualOffset,
      cells: { x: actualOffset.x / 2, y: actualOffset.y / 2 },
    },
  };
}

function portSeats(el) {
  const out = {};
  for (const face of ['N', 'S', 'E', 'W']) {
    const p = core.shapes.approachPoint(el.rect, face);
    out[face] = core.address.quadToAddress(p.x, p.y);
  }
  return out;
}

function portSlotCapacities(el) {
  return Object.fromEntries(
    ['N', 'S', 'E', 'W'].map((face) => [face, core.shapes.portSlotCapacity(el.rect, face)]),
  );
}

function formatPorts(el) {
  const seats = portSeats(el);
  const capacities = portSlotCapacities(el);
  const defaults = Object.entries(seats).map(([k, v]) => `${k} ${v}`).join('  ');
  const slots = Object.entries(capacities).map(([face, max]) => `${face}#1..#${max}`).join('  ');
  return `${defaults}; indexed tracks ${slots}`;
}

/** "A1:AZ40" -> a quadrant rect covering both cells inclusive. */
function parseRegion(text) {
  const [from, to] = String(text).split(':');
  if (!from || !to) throw new SyntaxError(`region must look like "A1:AZ40", got "${text}"`);
  const a = core.address.parseAddress(from);
  const b = core.address.parseAddress(to);
  const x0 = Math.min(a.col, b.col) * 2, y0 = Math.min(a.row, b.row) * 2;
  const x1 = (Math.max(a.col, b.col) + 1) * 2, y1 = (Math.max(a.row, b.row) + 1) * 2;
  return core.geometry.rect(x0, y0, x1 - x0, y1 - y0);
}

function formatRegionFilter(region) {
  const from = core.address.quadToCell(region.x, region.y);
  const to = core.address.quadToCell(core.geometry.right(region) - 1, core.geometry.bottom(region) - 1);
  return { region: `${from}:${to}`, cells: { w: region.w / 2, h: region.h / 2 } };
}

function assertWireframeCurrent(doc) {
  const plan = doc.wireframe;
  const page = plan.page ?? 'base';
  const sameRect = (a, b) => a && b
    && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

  for (const expected of core.wireframe.boxes(plan, { includeClearance: plan.clearanceDrawn ?? true })) {
    const found = core.findElement(doc, expected.id, page)?.element;
    if (!found || !sameRect(found.rect, expected.rect)) {
      throw new Error(`wireframe source is stale at "${expected.id}" — its generated geometry was moved, resized, renamed, or removed; undo that edit or rerun wireframe before export_prompt`);
    }
  }

  for (const run of plan.runs ?? []) {
    const found = core.findElement(doc, run.id, page)?.element;
    if (!found || found.kind !== 'path') {
      throw new Error(`wireframe source is stale at run "${run.id}" — undo that edit or rerun wireframe before export_prompt`);
    }
    const scratch = core.createDocument({ name: 'wireframe-integrity', canvas: doc.canvas, font: doc.font });
    const expected = core.applyPen(scratch, 'base', core.wireframe.runProgram(run), {
      id: run.id, role: 'artwork', pattern: run.pattern,
    }).path;
    const actualPieces = found.pieces.map(({ x, y, type }) => ({ x, y, type }));
    const expectedPieces = expected.pieces.map(({ x, y, type }) => ({ x, y, type }));
    if (JSON.stringify(actualPieces) !== JSON.stringify(expectedPieces)) {
      throw new Error(`wireframe source is stale at run "${run.id}" — its route no longer matches the measured source; undo that edit or rerun wireframe before export_prompt`);
    }
  }
}

function countBy(list) {
  return list.reduce((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {});
}

function describeTrace(t) {
  if (t.action === 'line') return `${t.from} -> ${t.to}  ${t.dir} ${t.cells} cell(s), align ${t.align}`;
  if (t.action === 'corner') return `${t.at}  ${t.style} ${t.sides.join('+')}, turns ${t.turnsTo}`;
  if (t.action === 'box') return `${t.at}  ${t.span} cells`;
  if (t.action === 'cursor') return `${t.at} facing ${t.facing}`;
  if (t.action === 'face') return `facing ${t.facing}`;
  return t.at ?? '';
}

const HELP = `TurtlePen — an integer-exact grid for AI-authored diagrams.

WHY IT EXISTS
  Diagram tools measure text at render time, long after a layout was chosen, so
  labels overflow their boxes and nothing notices. Here measurement happens
  before placement, every coordinate is an integer, and every defect is reported
  with a severity and a numeric fix. Nothing is ever silently resized.

THE CANVAS IS NOT A BUDGET
  The grid is unbounded right and down. 160x100 is a starting size, not a limit,
  and set_canvas grows it. If a shape is cramped, MAKE IT BIGGER — an author who
  fights for room inside a size they picked early has mistaken their own first
  guess for a constraint.

  Two more things that are easy to forget you have:
    - A feature can be MORE THAN ONE STROKE. If detail would damage a shape by
      being carved out of it, draw a second mark beside it instead. Additive
      beats subtractive: subtracting from a stroke that carries the meaning
      destroys the thing you are annotating.
    - Layers. add_page with intent "overlay" puts marks ON TOP without an L001,
      so annotation, texture, and construction can live apart from the artwork
      instead of competing with it for the same quadrants.

WORKFLOW
  measure -> plan -> commit -> validate -> render -> LOOK AT IT
                                        -> accept_finding for anything deliberate.

  DONE MEANS ALL FOUR. A drawing is not delivered until it has been:
    1. validated AFTER the last edit, not before it. An earlier clean log says
       nothing about the state you finished in.
    2. adjudicated to zero open findings — every one either fixed or accepted
       with a reason. "Only three minor ones left" is not done; it is a report
       of three known defects.
    3. rendered to a file. The SVG is PART OF THE DELIVERABLE, not an extra
       produced when someone asks. Nobody asked you to keep it to yourself.
    4. looked at. An author who has not seen the drawing does not know what
       they made.
  Report what the final validation actually said. Three sessions have announced
  finished work whose last real check was several edits old.

  Only a fingerprint in the current validation may be accepted. Geometry changes
  make the old acceptance visibly stale; unaccept_finding withdraws that record.
  A committed edit that proves wrong is recoverable with history action="undo".

  Rendering and looking is part of the loop, not an optional last step. A clean
  log is evidence the drawing is undefective, never that it is finished — a
  corpus once validated clean while a rug sat 60 cells from the sofa and an
  apple's stem floated clear of the fruit. Use "ascii" to read the actual
  quadrants; it is cheaper than a render and catches a malformed shape fastest.

  "plan" is the important one: send the whole composition as a batch of
  operations and read the collision log BEFORE anything is committed. The
  document is untouched until you re-send with commit:true, and a batch that
  fails part-way applies nothing at all.

  Findings are ranked S0 critical, S1 error, S2 warn, S3 info. Accepting a
  finding records intent; it lapses automatically if the geometry changes.

IMPORTING A MERMAID FLOWCHART
  import_mermaid { source: "flowchart TD ..." }  ->  operations, NOT a change

  It compiles onto operations you already have and hands them back. Feed them
  to plan, read the log, then commit — so an import faces exactly the same
  validation as anything you draw, and cannot make geometry the normal path
  could not. F001 and F002 apply to it too: a decision imported from Mermaid
  still has to branch.

  ([x]) terminator   {x} decision    [/x/] io      {{x}} prep
  [(x)] data         [[x]] subprocess              [x] process

  It lays out a top-to-bottom spine. It does NOT route, and it tells you which
  edges are not a straight drop so you can reroute them yourself. subgraph,
  classDef, style and click are refused by name rather than silently dropped —
  half a diagram reported as a success is worse than an error.

PERCEPTUAL REVIEW — the half validate cannot see
  render  ->  LOOK  ->  perceptual_review

  validate proves the drawing is UNDEFECTIVE. It cannot prove the drawing
  depicts what you were asked for. This corpus validated CLEAN while a sheep
  read as a stegosaurus, two ears rendered as flags, and half-tone spots
  dithered into plus-signs. Every coordinate was legal. Every one was wrong.

  "render" returns a renderHash. Look at the image, then record what you SAW:

    perceptual_review { renderHash, reviewer, findings: [{
      id, severity: P0..P3, category, symptom, consequence,
      elements: [...], repair }] }

  symptom is what it LOOKS like. consequence is what a reader would get wrong.
  Categories are a closed set: semantic-identity-mismatch, ambiguous-silhouette,
  misleading-structure, symbol-collision, accidental-glyph, poor-hierarchy,
  illegible-density, grouping-error, perspective-implausible,
  annotation-ambiguity.

  Nothing recorded here touches collision geometry — an opinion must never
  silently become an engine fact. The two verdicts come back SIDE BY SIDE and
  are never merged, because a clean log over the wrong picture is the case that
  matters. Editing the drawing marks an existing review STALE rather than
  leaving a stale opinion looking current, and a document with no review is
  NOT REVIEWED, never clean: absence of a review is not a pass.

THE LATTICE
  1 cell = 10x10 px.  1 quadrant = 5x5 px.  Strokes are 5px = 1 quadrant thick.
  Every legal position is a whole number of quadrants, so results are exact.

ADDRESSING (Excel)
  C4        whole cell            C4.tl     pin point (tl t tr l c r bl b br)
  C4.q2     quadrant (q1..q4)     origin A1 top-left, unbounded right and down
  Start at an inset origin such as T20 if the drawing may grow up or left.

FREE SPACE
  free_space defaults to scope="stack": all non-reference pages constrain the
  answer, including hidden pages because validation still checks them. Every
  response names searched_pages. Use scope="page" only when cross-page overlap
  is intentional. Supply cellsW and cellsH together, or neither to list regions.

REGIONAL DESCRIPTION
  describe { region: "C4:AZ40" } returns only elements whose exact claimed
  rectangles touch that range. Paths are tested piece by piece, not by a loose
  bounding box. Add page to narrow both page and region; the response repeats
  the normalized effective filter.

DIMENSIONED COMPOSITIONS
  wireframe authors a plan/elevation in real inches and measures routed runs;
  export_prompt turns that stored composition into a normalized image brief.
  The source survives save/open. Before export, TurtlePen verifies every
  generated box and route still matches it; stale geometry is refused by name.
  Undo the manual edit or rerun wireframe rather than exporting old facts.
  perspective_scene projects real room inches through a declared camera and
  preserves those inputs as provenance with the document.

HISTORY AND RECOVERY
  history { action: "status" }                  inspect the recovery boundary
  history { action: "undo" }                    reverse the newest mutation
  history { action: "redo" }                    reapply the newest undone edit
  history { action: "clear" }                   discard undo and redo entries

  The newest 100 successful document mutations are recoverable by default
  (TURTLEPEN_HISTORY_LIMIT accepts 1..1000). Failed and no-op calls do not consume
  history; a new edit after undo clears redo. A versioned sidecar is bound to the
  exact document hash, so undo/redo survives open and process restart. Outside
  edits invalidate stale history rather than replaying it against the wrong file.

GROUPS AND FOLLOW RELATIONSHIPS
  group { action: "create", id, members }        own a flat subsystem
  group { action: "move", id, cellsX, cellsY }  move every member exactly once
  constraint { action: "create", id,
               dependent, target }              keep current anchor relationship
  constraint { action: "sync", id }             restore the stored offset

  An element belongs to at most one group. A dependent has at most one parent;
  chains cascade and cycles are refused. Named and indexed anchors work, offsets
  are whole quadrants, and describe reports groups plus relationship sync state.

PEN GRAMMAR
  pen from <id>.<N|S|E|W>                      START HERE for connectors: seats
                                               the cursor just outside a box's
                                               face, already facing away from it
  pen from <id>.<face>#<slot>                  fan out competing connectors;
                                               #1 is the midpoint, #2 left/up,
                                               #3 right/down, then alternate by
                                               one cell (example: gateway.S#2)
  pen <address> [<pin>]                        place the cursor by address
  face <dir>                                   turn without drawing
  <dir> [n] [align <side>] [<style>] line      draw n cells of 5px stroke
  <dir> [<style>] corner align <sideA> <sideB> place a junction and turn
  <dir> ... line to <address|id.port>          draw until it reaches a target;
                                               indexed target faces also work

FLOWCHART NODES — the symbol carries the meaning
  place_box ... shape <name>        or  box ... shape decision  in a pen program

  process     the basic step, named with a verb phrase       rectangle
  decision    branches the process on a test                 diamond
  terminator  start or end of the process                    stadium
  subprocess  enters another process and returns             double side bars
  io          input or output                                parallelogram
  prep        preparation or setup                           hexagon
  manual      a step a person performs                       trapezoid
  data        stored data                                    cylinder
  document    a printed or written artifact                  wavy foot
  bar         fork or join                                   solid bar

  lane        a swimlane: who performs these steps          titled band + frame
  group       a named container around a sub-process         titled band + frame

  CONTAINERS ARE THE EXCEPTION. lane and group reserve only their title band
  and border ring and leave their hole FREE, so members placed inside collide
  with nothing. A node straddling the frame still reports L001, because it
  really does cross the border. Flow crossing a lane border is a real L004 and
  is exactly what accept_finding is for — handing over between lanes is what a
  swimlane depicts, not a defect.

  A shape still CLAIMS its whole bounding box, so gutters, free_space and
  layout are unchanged; it only INKS the symbol. A stroke clipping a diamond's
  empty corner is therefore L013 information, not an L004 error.

  TEXT IS MEASURED AGAINST THE SYMBOL, NOT THE BOX. A diamond gives a label
  about half its bounding width and half its height; a parallelogram gives
  three quarters of its width. A label that fits the rectangle can still
  overflow the diamond, and the log says so. Measure, then choose the span.

  Below 3x3 quadrants a shape has no room to read as itself, so it stays a
  rectangle rather than degrading into a blob.

  The four rules the symbols exist to serve:
    1. order runs left-to-right and top-to-bottom unless you mean otherwise
    2. exactly ONE start; zero or many ends
    3. one arrow per path, and no bend without a reason
    4. avoid crossings; where one is unavoidable, say so with a "hop"

  Rules 2 and part of 3 are CHECKED, not merely advised:
    F001  more than one terminator with nothing leading into it
    F002  a decision with fewer than two ways out

  They wake up on their own as soon as a document uses a decision or a
  terminator, so nothing you drew before is reclassified. An edge is read from
  what you stated — "pen from <id>.<face>" records the source and "line to
  <id>.<port>" the target — never from which strokes happen to sit near which
  box. Rules about branch labels and verb phrases are deliberately NOT checked:
  deciding that a floating "NO" belongs to one edge, or that a label is not a
  verb phrase, means guessing, and a rule that guesses teaches you to ignore
  the log.

SHAPES — anything that is not a rectangle
  ray to <address>                             a straight line at ANY angle
  circle <r>                                   outline; radius in quadrants
  disc <r>                                     the same circle, filled
  arc <r> <startDeg> <endDeg>                  clockwise from east
  polygon <addr> <addr> <addr> ...             closed
  triangle <addr> <addr> <addr>                exactly three points
  dot [<dir8>]                                 one quadrant
  dash <n> <dir8>                              n quadrants, any of eight ways
  dir8 = n ne e se s sw w nw  (up/down/left/right also accepted)

ANCHORS — position as a relationship, not a coordinate
  pen at <id>.<anchor>                         put the cursor ON an element
  <shape> ... at <id>.<anchor>                 anchor a shape to one
  <shape> ... at <id>.<anchor> offset <dx> <dy>   nudge in whole quadrants
  anchors: N NE E SE S SW W NW C

  "from" gives the SEAT, one step OUTSIDE the element, where a connector starts.
  "at" gives the anchor itself, on the element, where a shape belongs. Anchoring
  avoids hand-computed placement drift when the program runs. This grammar alone
  does not store a relationship: rerun the declarative program to recompute it,
  or create an explicit constraint when the dependent must follow later edits.

  These are integer algorithms — Bresenham for lines, midpoint for circles — so
  the same command always covers the same quadrants. A stepped diagonal is not
  an approximation of a line; on a lattice it IS the line.
  <dir> arrow                                  arrowhead pointing that way
  <dir> hop                                    deliberate crossing (exempt from L006)
  box span <W>x<H> at <address> label "..." [style <s>] [id <name>]
  text "..." at <address> [span <W>x<H>] [id <name>]
       [font <px>] [fill <#hex>] [weight <100..900>] [align left|center|right]

ARTWORK PRESENTATION (arguments on the pen tool or plan operation)
  role: "artwork"                              open marks are not connectors
  color: "#rrggbb", width: 1..5, cap: "round" continuous presentation ink
  paint: "cells"                               colour every exact claimed quadrant

TONE — density, and why it is not opacity
  tone: 0.0625..1                              or "quarter" "half"
                                               "three-quarter" "solid"
  feather: <n>                                 quadrants of falloff inward
                                               from the region boundary
  texture: "eroded"                            seeded rough edge, deterministic

  tone changes WHAT IS INKED. A half-tone shape inks half its quadrants through
  the same ordered matrix that dithers images, so it CLAIMS half — collision
  stays honest and the result survives into a font as real contours.
  opacity changes how the SAME geometry is painted; the element still claims
  every quadrant it did at full strength, which is what L019 exists to catch.
  They are separate controls on purpose. Do not reach for opacity to make an
  overlap go away.

  pattern: "dashed" | "dotted"                rhythm ALONG the path

  A dash is keyed to DISTANCE TRAVELLED, not to the lattice, so it keeps its
  rhythm around a corner and reads as one broken line. Keying it to the lattice
  the way tone is keyed would restart the cycle at every turn and produce a line
  that looks damaged rather than dashed. Use it for a projected trendline, a
  leader, or any boundary the reader should understand as inferred.

  The threshold keys off absolute lattice position, so two toned shapes tile
  seamlessly where they meet and the same command always inks the same
  quadrants. Below 0.0625 nothing inks at all, so it is rejected rather than
  drawn as an invisible element that still occupies space.

DRAWING FROM A SOURCE — reach for this BEFORE deriving geometry by hand
  measure_image source [maxWidthCells|maxHeightCells] [fit]
    Reports the measured whole-cell footprint plus separate embedded-pixel and
    dither/simplify quadrant scales. Read UPSCALE, DOWNSCALE, or EXACT before placement.
    Upscaling repeats/interpolates existing information; it creates no detail.
  place_image  id at span source [mode] [fit] [detail] [supersample] [opacity] [page]
    mode "simplify" intentionally makes a perceptual approximation rather than
                   a 1:1 copy. Near-binary sources use clean contrast thresholding;
                   continuous-tone sources use colour-aware contour selection and
                   raise L023 because geometry cannot know the subject. detail is
                   auto|low|medium|high. Fewer than 24 quadrants on the short side
                   is refused; use a larger span or purpose-built icon artwork.
                   supersample is auto|1|2|4. A factor of 4 builds a working canvas
                   at 4x width and height, then box-averages each 16-sample block
                   into one of 17 exact final coverage levels. Runs retain that
                   coverage through save/reopen. auto prefers 4x within limits.
    mode "dither"  quantises the image ONTO the lattice through a 4x4 Bayer
                   matrix. Real quadrants, merged into runs, byte-identical
                   every run. Downscale area-averages; upscale repeats nearest
                   samples. PNG decodes on node:zlib alone. L022 blocks a busy
                   checker result. Remove and re-place to change its span.
    mode "embed"   (default) keeps a picture as a picture; it still claims an
                   exact footprint and collides like any other element. Use it
                   for photos and evidence. Resize recomputes its scale report.
    fit  "contain" (default) preserves every edge with possible padding;
         "cover" fills the footprint by cropping overflow. Both preserve aspect.
  place_reference source span [at] [opacity] [id] [mode] [fit] [detail] [supersample]
    Lays a dithered or simplified copy UNDER the drawing to trace over, flagged
    L020 until remove_page takes it out, so scaffolding cannot ship.

  If a shape has to LOOK like something real — a brain, a leaf, a face — a
  formula will not get there. Sine waves are not cortex. Simplify prepared
  source art, dither it, or trace a reference. Hand-computing a bitmap is the long way round, and the
  usual reason an author reaches for it is that they did not know these exist.

  dir     up down left right          n counts whole 10px cells
  align   vertical strokes: left|right    horizontal strokes: top|bottom
          (no centre — a 5px stroke centred in a 10px cell starts at 2.5px)
  style   square rounded indented chamfered
  sides   top bottom left right — a corner names the two sides it connects;
          one of them must be the side the path arrives on

EXAMPLE — a connector between two boxes, with no address arithmetic
  pen from gateway.S
  down align right line to checkout.N arrow

ROUTING — a proposal, never a change
  route { from: "gateway.S", to: "checkout.N" }  ->  a pen program

  It hands back a program and changes NOTHING. Read it, then run it with "pen"
  like anything you wrote; it validates identically. That is the condition
  auto-routing was deferred on — the path stays inspectable, and there is no
  router hiding inside the kernel producing geometry nobody can account for.

  It tries the three shapes a person would draw — straight, one turn, two turns
  — against everything already on the page. If none is clear it SAYS SO and
  names what is in the way. A twelve-turn path that technically avoids every
  obstacle is not a connector anyone can follow, so it is not offered.

CONNECTORS: THE TWO MISTAKES WORTH KNOWING
  1. Starting at an address you worked out yourself. A box's south face is
     already outside it, but its north face is its own top row — so leaving
     northward starts one quadrant higher. Use "pen from <id>.<face>" instead;
     place_box and describe also report the seat address for every face.
  2. Assuming "to <id>.<port>" arrives. It only sets the DISTANCE along the way
     you are travelling. If the run is on a different row or column from the
     target, it stops level with it and never touches it — reported as L016.

IF YOU ARE GOING ROUND IN CIRCLES, validate WILL SAY SO
  Three checks in a row with edits between them and the SAME findings still
  open — not merely the same count, the same findings — and validate appends a
  NO PROGRESS note. It means what is being changed is not what is being
  reported. Read one finding, use "repair" to see whether any of its fixes is a
  single call, and if none is, change the approach rather than the edit.

  It watches the sequence of attempts, never the drawing, so it advises and
  never blocks. Validating twice without editing is not stagnation, and a clean
  document checked repeatedly is never nagged.

EVERY FIX IS ALSO A CALL
  repair { fingerprint }          list the fixes for a current finding
  repair { fingerprint, index }   perform that one

  Listing says which fixes are one call away and which need a decision from you
  first. Performing goes through the ordinary operations — rehearsable,
  undoable, nothing it could not have done by hand; it only saves you working
  out the arguments.

  It does NOT guess. reroute, offset, hop, extend, rename and shorten are
  refused by name, because where a path should go instead, or which words to
  cut, is yours to decide. Inventing a plausible mutation you did not ask for
  is the failure this engine exists to prevent.

EVERY FIX HAS A TOOL
  widen / heighten -> resize        shorten / font -> restyle
  move             -> move          rename         -> rename
  intent           -> update_page   canvas         -> set_canvas
  extend           -> extend_path   reroute        -> replace_path
  offset / hop     -> replace_path with a hop piece or the other alignment`;
