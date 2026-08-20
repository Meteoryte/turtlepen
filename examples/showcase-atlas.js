#!/usr/bin/env node
/**
 * Two specimen sheets — every drawable thing, laid out to be looked at.
 *
 * A type foundry publishes a specimen sheet rather than a list of glyph names,
 * because the only useful answer to "what does this look like" is the thing
 * itself. These are the same idea for the lattice:
 *
 *   ATLAS 1 — NODES        every node shape, corner style, arrowhead and
 *                          connector pattern, each labelled with what draws it
 *   ATLAS 2 — MARKS        every artwork primitive, then the same primitive
 *                          swept across tone, feather and texture
 *
 * They are reference material first and a showcase second, which is the right
 * way round: a demo nobody consults is decoration.
 *
 * Run with:  node examples/showcase-atlas.js
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createSession, createTools } from '../src/mcp/tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');
const quiet = process.argv.includes('--quiet');
const say = (...a) => { if (!quiet) console.log(...a); };

function driver() {
  const session = createSession({ cwd: project });
  const tools = Object.fromEntries(createTools(session).map((t) => [t.name, t]));
  // MCP tools report failure as TEXT. `route` even reports "no clear route",
  // which a careless /clear/ test reads as success — so refusals are matched
  // deliberately, never by keyword.
  const call = async (name, args) => {
    const r = await tools[name].handler(args ?? {});
    const text = typeof r === 'string' ? r : (r?.text ?? JSON.stringify(r));
    if (/^error:/i.test(text) || r?.isError) throw new Error(`${name}: ${text}`);
    return text;
  };
  return { session, call, asJson: async (n, a) => JSON.parse(await call(n, a)) };
}

const col = (n) => {
  let s = '';
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

// ═══════════════════════════════════════════════════════════════════════════
//  ATLAS 1 — NODES
// ═══════════════════════════════════════════════════════════════════════════
async function atlasNodes() {
  const { call, asJson } = driver();
  await call('new_diagram', {
    name: 'Node Atlas', path: 'diagrams/atlas-nodes.turtlepen.json', cols: 120, rows: 78,
  });
  await call('add_page', { id: 'labels', z: 1, intent: 'overlay', title: 'Specimen captions' });

  const CAPTION = 8;                 // cells of caption under each specimen
  const GUTTER = 8;

  /** Place a specimen and caption it on the overlay, so labels never collide. */
  const specimen = async (id, at, span, opts, caption) => {
    await call('place_box', { id, at: `${at}.tl`, span: `${span.w}x${span.h}`, ...opts });
    const [, c, r] = /^([A-Z]+)(\d+)$/.exec(at);
    await call('pen', {
      page: 'labels',
      id: `cap-${id}`,
      program: `text "${caption}" at ${c}${Number(r) + span.h + 1} span ${span.w + GUTTER - 2}x2 font 8`,
    });
  };

  // ── Row 1: every node shape, each sized by `measure` for its own symbol ──
  const SHAPES = ['process', 'decision', 'terminator', 'subprocess', 'io', 'prep', 'manual', 'data', 'document'];
  let x = 2;
  let widest = 0;
  for (const shape of SHAPES) {
    const label = shape;
    const m = await asJson('measure', { text: label, shape });
    const span = { w: Math.max(m.span.w, 12), h: Math.max(m.span.h, 6) };
    await specimen(`shape-${shape}`, `${col(x)}4`, span, { shape, label, align: 'center' }, `shape: ${shape}`);
    x += span.w + GUTTER;
    widest = Math.max(widest, span.h);
  }

  // ── Row 2: corner styles, on identical boxes so only the corner varies ──
  const row2 = 4 + widest + CAPTION;
  x = 2;
  for (const corner of ['square', 'rounded', 'indented', 'chamfered']) {
    await specimen(`corner-${corner}`, `${col(x)}${row2}`, { w: 14, h: 6 },
      { corner, label: corner, align: 'center', fill: '#e8f4fd' }, `corner: ${corner}`);
    x += 14 + GUTTER;
  }

  // ── Row 3: arrowheads and connector styles, captioned underneath ──
  //
  // The first version put these between two boxes with captions beside them,
  // which buried the heads under their own labels — the one part of the sheet
  // a reader is here to see.
  const STROKES = [
    [{}, 'solid', 'right 12 line'],
    [{ pattern: 'dashed' }, 'pattern: dashed', 'right 12 line'],
    [{ pattern: 'dotted' }, 'pattern: dotted', 'right 12 line'],
    [{ width: 3 }, 'width: 3', 'right 12 line'],
    [{ cap: 'round', width: 5 }, 'cap: round, width 5', 'right 12 line'],
    // No `width` on these: a presentation width switches the renderer to a
    // simplified polyline, which is correct for a drawn stroke and drops the
    // per-quadrant arrowhead entirely.
    [{}, 'arrow', 'right 12 line arrow'],
    [{}, 'arrow both', 'right 12 line arrow both'],
    [{}, 'arrow start', 'right 12 line arrow start'],
  ];
  const PER_ROW = 4;
  const STRIDE = 30;
  for (const [i, [opts, caption, program]] of STROKES.entries()) {
    const sx = 2 + (i % PER_ROW) * STRIDE;
    const sy = (row2 + 6 + CAPTION) + Math.floor(i / PER_ROW) * 8;
    // Arrowheads only exist on a CONNECTOR. An artwork path is emitted as a
    // painted polyline — right for a drawn stroke, and it silently discards the
    // head, so the first version of this row showed three identical lines.
    const role = /arrow/.test(program) ? 'connector' : 'artwork';
    await call('pen', { id: `stroke-${i}`, role, program: `pen ${col(sx)}${sy}.q1\n${program}`, ...opts });
    await call('pen', {
      page: 'labels', id: `cap-stroke-${i}`,
      program: `text "${caption}" at ${col(sx)}${sy + 2} span ${STRIDE - 4}x2 font 8`,
    });
  }

  await call('pen', {
    page: 'labels', id: 'atlas-title',
    program: `text "NODE ATLAS — shapes, corners, arrowheads, connector styles" at C2 span 90x2 font 12 weight 700`,
  });

  return finish(call, asJson, 'atlas-nodes', 'Node Atlas');
}

// ═══════════════════════════════════════════════════════════════════════════
//  ATLAS 2 — MARKS
// ═══════════════════════════════════════════════════════════════════════════
async function atlasMarks() {
  const { call, asJson } = driver();
  await call('new_diagram', {
    name: 'Mark Atlas', path: 'diagrams/atlas-marks.turtlepen.json', cols: 116, rows: 84,
  });
  await call('add_page', { id: 'labels', z: 1, intent: 'overlay', title: 'Specimen captions' });

  const caption = async (id, at, text, span = '24x2') =>
    call('pen', { page: 'labels', id: `cap-${id}`, program: `text "${text}" at ${at} span ${span} font 8` });

  // ── Row 1: the primitives, each drawn from the same anchor ──
  // Every one of these is an integer algorithm, so the same command always
  // covers the same quadrants — a stepped diagonal is not an approximation of
  // a line, on this lattice it IS the line.
  const PRIMITIVES = [
    // Drawn on a slope, because a vertical ray demonstrates nothing a plain
    // `line` could not do. The point of a ray is an ARBITRARY angle, stepped
    // exactly — on this lattice the staircase IS the line, not an approximation.
    ['ray', (a, c, r) => `pen ${a}\nray to ${col(colIndex(c) + 7)}${r + 11}`],
    ['circle 8', (a) => `pen ${a}\ncircle 8`],
    ['disc 8', (a) => `pen ${a}\ndisc 8`],
    ['arc 8 0 180', (a) => `pen ${a}\narc 8 0 180`],
    ['triangle', (a, c, r) => `pen ${a}\ntriangle ${c}${r} ${col(colIndex(c) + 9)}${r + 9} ${col(colIndex(c) - 9)}${r + 9}`],
    ['polygon', (a, c, r) => `pen ${a}\npolygon ${c}${r} ${col(colIndex(c) + 8)}${r + 3} ${col(colIndex(c) + 5)}${r + 10} ${col(colIndex(c) - 5)}${r + 10} ${col(colIndex(c) - 8)}${r + 3}`],
    ['dash 10 ne', (a) => `pen ${a}\ndash 10 ne`],
    ['dot', (a) => `pen ${a}\ndot`],
  ];

  const COLW = 22;
  const CAPW = 18;
  let x = 12;
  const row1 = 14;
  for (const [name, build] of PRIMITIVES) {
    const c = col(x);
    await call('pen', { id: `mark-${name.split(' ')[0]}-${x}`, role: 'artwork', program: build(`${c}${row1}`, c, row1) });
    await caption(`p-${x}`, `${col(x - 6)}${row1 + 13}`, name, `${CAPW}x2`);
    x += COLW;
  }

  // ── Row 2: one shape swept across tone ──
  // Tone filters the PIECES, so a 50% disc claims exactly its 50%: density is
  // geometry here, not opacity.
  const row2 = row1 + 20;
  x = 12;
  for (const tone of [0.25, 0.5, 0.75, 1]) {
    await call('pen', {
      id: `tone-${Math.round(tone * 100)}`, role: 'artwork', paint: 'cells', tone,
      program: `pen ${col(x)}${row2}\ndisc 7`,
    });
    await caption(`t-${Math.round(tone * 100)}`, `${col(x - 6)}${row2 + 10}`, `tone ${tone}`, `${CAPW}x2`);
    x += COLW;
  }

  // ── Row 2 continued: feather and texture on the same disc ──
  await call('pen', {
    id: 'feathered', role: 'artwork', paint: 'cells', tone: 0.9, feather: 4,
    program: `pen ${col(x)}${row2}\ndisc 7`,
  });
  await caption('f', `${col(x - 6)}${row2 + 10}`, 'feather 4', `${CAPW}x2`);
  x += COLW;
  await call('pen', {
    id: 'eroded', role: 'artwork', paint: 'cells', tone: 1, texture: 'eroded',
    program: `pen ${col(x)}${row2}\ndisc 7`,
  });
  await caption('e', `${col(x - 6)}${row2 + 10}`, 'texture eroded', `${CAPW}x2`);

  // ── Row 3: arcs swept through the compass, showing the angle convention ──
  const row3 = row2 + 18;
  x = 12;
  for (const [from, to] of [[0, 90], [90, 180], [180, 270], [270, 360], [45, 315]]) {
    await call('pen', {
      id: `arc-${from}-${to}`, role: 'artwork', color: '#c2410c', width: 2,
      program: `pen ${col(x)}${row3}\narc 7 ${from} ${to}`,
    });
    await caption(`a-${from}`, `${col(x - 6)}${row3 + 10}`, `arc ${from}-${to}`, `${CAPW}x2`);
    x += COLW;
  }

  await call('pen', {
    page: 'labels', id: 'atlas-title',
    program: `text "MARK ATLAS — primitives, tone, feather, texture, arc angles" at C3 span 92x2 font 12 weight 700`,
  });
  await call('pen', {
    page: 'labels', id: 'atlas-note',
    program: `text "clockwise from east; radii in quadrants" at C6 span 60x2 font 8`,
  });

  return finish(call, asJson, 'atlas-marks', 'Mark Atlas');
}

function colIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Validate, adjudicate what a specimen sheet legitimately is, render. */
async function finish(call, asJson, slug, title) {
  // A declared size is a first guess. Grow the sheet to whatever the specimens
  // actually needed rather than cramming them into the number picked up front.
  const pages = await asJson('describe', {});
  let maxCol = 0;
  let maxRow = 0;
  for (const page of pages) {
    for (const e of page.elements) {
      const m = /^([A-Z]+)(\d+)/.exec(e.at ?? '');
      if (!m) continue;
      maxCol = Math.max(maxCol, colIndex(m[1]) + (e.cells?.w ?? 1));
      maxRow = Math.max(maxRow, Number(m[2]) + (e.cells?.h ?? 1));
    }
  }
  await call('set_canvas', { cols: maxCol + 4, rows: maxRow + 4 });

  const v = await asJson('validate', { format: 'json' });
  // A specimen sheet is deliberately sparse and deliberately unconnected: the
  // whole point is one mark per patch of paper with nothing running between
  // them. Judged individually rather than by rule, because "it is an atlas" is
  // a real reason and "C001" is not.
  for (const f of v.open ?? []) {
    if (f.rule === 'C001') {
      await call('accept_finding', {
        fingerprint: f.fingerprint,
        reason: 'a specimen sheet is meant to be sparse — each mark needs clear paper around it '
          + 'so it can be compared with its neighbours, and filling the gaps would defeat the sheet.',
      });
    } else if (f.rule === 'F002') {
      await call('accept_finding', {
        fingerprint: f.fingerprint,
        reason: 'this diamond is a specimen of the decision SHAPE, not a decision in a process. '
          + 'It has no branches because there is no process here to branch — the sheet shows what '
          + 'the symbol looks like, and wiring exits to it would be drawing a flowchart instead.',
      });
    } else if (f.rule === 'L008' || f.rule === 'L016') {
      await call('accept_finding', {
        fingerprint: f.fingerprint,
        reason: 'these strokes are specimens, not connectors: they demonstrate a stroke style and '
          + 'are meant to end in open paper rather than meet anything.',
      });
    }
  }

  const after = await asJson('validate', { format: 'json' });
  const blocking = (after.open ?? []).filter((f) => f.severity === 'S0' || f.severity === 'S1');
  await call('save', { force: true });
  const rendered = await call('render', { path: `diagrams/${slug}.svg` });
  say(`${title}: ${(after.open ?? []).length} open (${blocking.length} blocking), `
    + `${(after.accepted ?? []).length} accepted`);
  for (const f of blocking) say('   ' + f.rule + ' ' + f.message);
  say('   ' + rendered.split('\n')[0]);
  return blocking.length;
}

const failures = (await atlasNodes()) + (await atlasMarks());
if (failures) {
  console.error(`FAILED: ${failures} blocking finding(s) across the atlases`);
  process.exit(1);
}
say('\natlases drawn');
