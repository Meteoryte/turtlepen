/**
 * MCP tool surface.
 *
 * The tools return numbers, not adjectives. Every response that matters carries
 * exact quadrant counts, character capacities, pixel shortfalls, and addresses,
 * because the AI's job here is arithmetic over an explicit model rather than
 * guessing at rendered sizes.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as core from '../core/index.js';

const REQUIRE_DOC = 'no diagram is open — call new_diagram or open_diagram first';

export function createSession({ cwd = process.cwd() } = {}) {
  return { doc: null, path: null, cwd };
}

const need = (s) => {
  if (!s.doc) throw new Error(REQUIRE_DOC);
  return s.doc;
};

const MIME = Object.freeze({ png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif' });

/** Read an image from a data: URI or from disk, relative to the session cwd. */
async function imageBytes(session, source) {
  const inline = core.image.bytesOfDataUri(source);
  if (inline) return inline.bytes;
  return readFile(resolve(session.cwd, source));
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
    if (['place_image', 'place_reference'].includes(op?.op) && op.source && !String(op.source).startsWith('data:')) {
      const bytes = await imageBytes(session, op.source);
      const probed = core.image.probe(bytes);
      out.push({ ...op, source: `data:${MIME[probed.format]};base64,${bytes.toString('base64')}` });
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

const json = (o) => JSON.stringify(o, null, 2);

export function createTools(session) {
  return [
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
        session.path = path ? resolve(session.cwd, path) : resolve(session.cwd, `diagrams/${name.replace(/\W+/g, '-').toLowerCase()}.turtlepen.json`);
        await persist(session);
        return `created "${name}" (${cols}x${rows} cells) at ${session.path}\npages: base (z:0, exclusive)\n\n${json(core.latticeInfo(session.doc))}`;
      },
    },

    {
      name: 'open_diagram',
      description: 'Open an existing diagram file and make it active.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
      handler: async ({ path }) => {
        session.path = resolve(session.cwd, path);
        session.doc = await core.loadDocument(session.path);
        const v = core.validate(session.doc);
        return `opened "${session.doc.name}" from ${session.path}\npages: ${session.doc.pages.map((p) => `${p.id} (z:${p.z}, ${p.intent})`).join(', ')}\n\n${core.formatLog(v)}`;
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
          align: { type: 'string', enum: ['left', 'center', 'right'] },
          fontSize: { type: 'integer' },
          fill: { type: 'string' },
        },
        required: ['id', 'at', 'span'],
        additionalProperties: false,
      },
      handler: async ({ id, at, span, label = '', page = 'base', corner = 'square', align = 'left', fontSize = null, fill = null }) => {
        const doc = need(session);
        const el = core.placeBox(doc, page, { id, at, span, label, corner, align, fontSize, fill });
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
        const result = core.validate(need(session), { page });
        return format === 'json' ? json(result) : core.formatLog(result);
      },
    },

    {
      name: 'accept_finding',
      description:
        'Record a finding as deliberate rather than an error — this is where intent is declared. Keyed to the finding fingerprint, which encodes the exact geometry, so the acceptance lapses automatically if anything moves.',
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
        'Where is there room? Returns maximal empty rectangles, largest first, with addresses and cell sizes — or the first rectangle that fits a given cell span. This is the solver input for deciding placement.',
      inputSchema: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          cellsW: { type: 'integer', description: 'if given with cellsH, returns the first spot that fits' },
          cellsH: { type: 'integer' },
          limit: { type: 'integer' },
          region: { type: 'string', description: 'search area as a cell range, e.g. "A1:AZ40". Defaults to the content plus a 4-cell margin, so pass this to find space further out.' },
        },
        additionalProperties: false,
      },
      handler: ({ page = 'base', cellsW = null, cellsH = null, limit = 12, region = null }) => {
        const doc = need(session);
        const area = region ? parseRegion(region) : null;
        if (cellsW && cellsH) {
          const spot = core.occupancy.firstFitting(doc, page, cellsW, cellsH, { region: area });
          return spot
            ? json({ fits: true, place_at: spot.at, cell: spot.cell, within: { at: spot.within.at, cells: spot.within.cells } })
            : json({ fits: false, note: `no free ${cellsW}x${cellsH} cell region in the searched area; widen the region or move something` });
        }
        return json({ stats: core.occupancy.stats(doc, page), free: core.occupancy.freeRects(doc, page, { limit, region: area }) });
      },
    },

    {
      name: 'describe',
      description: 'List every element with its computed geometry, so the AI can reason over exact positions rather than remembering them.',
      inputSchema: { type: 'object', properties: { page: { type: 'string' } }, additionalProperties: false },
      handler: ({ page = null }) => {
        const doc = need(session);
        const pages = page ? doc.pages.filter((p) => p.id === page) : doc.pages;
        return json(
          pages.map((p) => ({
            page: p.id,
            z: p.z,
            intent: p.intent,
            elements: core.elementsOf(doc, p.id).map((el) => describeElement(doc, el)),
          })),
        );
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
            description: 'ordered operations, each { "op": "<name>", ...args }. Names: add_page update_page remove_page place_box place_image place_reference pen extend_path replace_path resize restyle move rename remove set_canvas accept_finding unaccept_finding. Args match the same-named tool, including pen role/color/width/cap.',
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
        return `wrote ${target}`;
      },
    },

    {
      name: 'measure_image',
      description: 'Read the real dimensions from an image header and report the whole-cell footprint it needs, plus any aspect drift that rounding forces. Call this BEFORE place_image, for the same reason you measure a label before sizing a box.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'a data: URI, or a path relative to the document' },
          maxWidthCells: { type: 'integer' },
          maxHeightCells: { type: 'integer' },
        },
        required: ['source'],
        additionalProperties: false,
      },
      handler: async ({ source, maxWidthCells = null, maxHeightCells = null }) => {
        const bytes = await imageBytes(session, source);
        const probed = core.image.probe(bytes);
        const m = core.image.measure(probed, { maxWidthCells, maxHeightCells });
        return JSON.stringify({ ...probed, ...m }, null, 2);
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
        return core.wireframe.toPrompt(doc.wireframe, { subject, style, view });
      },
    },

    {
      name: 'place_image',
      description: 'Place an image, claiming an exact quadrant footprint like any other element. It participates in every collision rule — an image over a stroke is an ordinary L001, not a special case. The source is embedded so a saved document stays self-contained.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          at: { type: 'string' },
          span: { type: ['string', 'object'] },
          source: { type: 'string' },
          mode: { type: 'string', enum: ['embed', 'dither'] },
          fit: { type: 'string', enum: ['contain', 'cover'] },
          opacity: { type: 'number' },
          page: { type: 'string' },
        },
        required: ['id', 'at', 'span', 'source'],
        additionalProperties: false,
      },
      handler: async ({ id, at, span, source, mode = 'embed', fit = 'contain', opacity = null, page = 'base' }) => {
        const doc = need(session);
        const bytes = await imageBytes(session, source);
        const probed = core.image.probe(bytes);
        const cells = core.normalizeSpan(span, `span for "${id}"`);
        const m = core.image.measure(probed, { maxWidthCells: cells.w });
        const dataUri = source.startsWith('data:') ? source : `data:${MIME[probed.format]};base64,${bytes.toString('base64')}`;
        const el = core.placeImage(doc, page, { id, at, span, source: dataUri, mode, fit, opacity });
        await persist(session);
        return `placed image "${id}" on page "${page}" at ${core.address.quadToAddress(el.rect.x, el.rect.y)}, ${cells.w}x${cells.h} cells
`
          + `source: ${probed.format} ${probed.width}x${probed.height}
`
          + (m.aspectDriftPct > 0
            ? `aspect: drawn at ${m.drawnAspect} against a source of ${m.sourceAspect} — ${m.aspectDriftPct}% drift from rounding to whole cells`
            : 'aspect: exact — the source ratio survives whole-cell rounding');
      },
    },
    {
      name: 'place_reference',
      description:
        'Lay a reference image UNDER the drawing to trace over. Dithers it onto the lattice, puts it on a page below the base at low opacity, and flags it — L020 then reminds you it is still there, because scaffolding that ships is worse than no scaffolding. Draw on top, then remove_page it.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'page id; defaults to "reference"' },
          source: { type: 'string', description: 'a data: URI, or a path relative to the document' },
          at: { type: 'string' },
          span: { type: ['string', 'object'] },
          opacity: { type: 'number', description: 'default 0.25 — faint enough to draw over' },
        },
        required: ['source', 'span'],
        additionalProperties: false,
      },
      handler: async ({ id = 'reference', source, at = 'A1.tl', span, opacity = undefined }) => {
        const doc = need(session);
        const bytes = await imageBytes(session, source);
        const probed = core.image.probe(bytes);
        const page = core.placeReference(doc, {
          id, at, span, opacity,
          source: source.startsWith('data:') ? source : `data:${MIME[probed.format]};base64,${bytes.toString('base64')}`,
        });
        await persist(session);
        const cells = core.normalizeSpan(span, 'reference span');
        const m = core.image.measure(probed, { maxWidthCells: cells.w });
        return `laid reference "${page.id}" at z:${page.z}, opacity ${page.opacity}, ${cells.w}x${cells.h} cells
`
          + `source: ${probed.format} ${probed.width}x${probed.height}${m.aspectDriftPct > 0 ? `, ${m.aspectDriftPct}% aspect drift from whole-cell rounding` : ', aspect exact'}
`
          + `draw on top, then remove_page { id: "${page.id}" } — L020 will remind you until you do`;
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
        return force && doc.forcedSave
          ? `saved ${session.path} — FORCED past ${doc.forcedSave.findingCount} outstanding finding(s); the document records this`
          : `saved ${session.path}`;
      },
    },
  ];
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
    // Where a connector should start to leave this box on each face. Reported
    // because deriving it by hand is a reliable source of off-by-one errors.
    seats: el.kind === 'box' ? portSeats(el) : null,
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

function formatPorts(el) {
  const seats = portSeats(el);
  return Object.entries(seats).map(([k, v]) => `${k} ${v}`).join('  ');
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

THE LATTICE
  1 cell = 10x10 px.  1 quadrant = 5x5 px.  Strokes are 5px = 1 quadrant thick.
  Every legal position is a whole number of quadrants, so results are exact.

ADDRESSING (Excel)
  C4        whole cell            C4.tl     pin point (tl t tr l c r bl b br)
  C4.q2     quadrant (q1..q4)     origin A1 top-left, unbounded right and down
  Start at an inset origin such as T20 if the drawing may grow up or left.

PEN GRAMMAR
  pen from <id>.<N|S|E|W>                      START HERE for connectors: seats
                                               the cursor just outside a box's
                                               face, already facing away from it
  pen <address> [<pin>]                        place the cursor by address
  face <dir>                                   turn without drawing
  <dir> [n] [align <side>] [<style>] line      draw n cells of 5px stroke
  <dir> [<style>] corner align <sideA> <sideB> place a junction and turn
  <dir> ... line to <address|id.port>          draw until it reaches a target

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
  avoids hand-computed placement drift when the program runs. It is not a live
  stored constraint: moving the target later does not move existing dependents;
  rerun the declarative program to recompute them.

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
  place_image  id at span source [mode] [fit] [opacity] [page]
    mode "dither"  quantises the image ONTO the lattice through a 4x4 Bayer
                   matrix. Real quadrants, merged into runs, byte-identical
                   every run. PNG decodes on node:zlib alone.
    mode "embed"   (default) keeps a picture as a picture; it still claims an
                   exact footprint and collides like any other element.
  place_reference source span [at] [opacity] [id]
    Lays a dithered copy UNDER the drawing to trace over, flagged L020 until
    remove_page takes it out, so scaffolding cannot ship.

  If a shape has to LOOK like something real — a brain, a leaf, a face — a
  formula will not get there. Sine waves are not cortex. Dither a source or
  trace a reference. Hand-computing a bitmap is the long way round, and the
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

CONNECTORS: THE TWO MISTAKES WORTH KNOWING
  1. Starting at an address you worked out yourself. A box's south face is
     already outside it, but its north face is its own top row — so leaving
     northward starts one quadrant higher. Use "pen from <id>.<face>" instead;
     place_box and describe also report the seat address for every face.
  2. Assuming "to <id>.<port>" arrives. It only sets the DISTANCE along the way
     you are travelling. If the run is on a different row or column from the
     target, it stops level with it and never touches it — reported as L016.

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

EVERY FIX HAS A TOOL
  widen / heighten -> resize        shorten / font -> restyle
  move             -> move          rename         -> rename
  intent           -> update_page   canvas         -> set_canvas
  extend           -> extend_path   reroute        -> replace_path
  offset / hop     -> replace_path with a hop piece or the other alignment`;
