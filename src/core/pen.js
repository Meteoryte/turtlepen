/**
 * The pen command language.
 *
 * Rather than declaring two endpoints and hoping a router does something sane,
 * the AI walks a cursor around the lattice laying down strokes and junction
 * pieces. Every stroke therefore has an explicit author and an exact quadrant
 * footprint, so a collision can be reported as "the segment you drew in step 4
 * claims C7.q2, already held by step 1" — a diagnosis with a fix attached,
 * rather than an opaque routing failure.
 *
 * Grammar (tokens may appear in any order; the parser is deliberately forgiving
 * so natural phrasings parse):
 *
 *   pen <address> [<pin>]                          place the cursor
 *   face <dir>                                     turn without drawing
 *   <dir> [n] [align <side>] [<style>] line        draw n cells of stroke
 *   <dir> [align <sideA> <sideB>] [<style>] corner  place a junction, turn
 *   <dir> ... line to <address|id.port>            draw until it reaches a target
 *   box span <W>x<H> at <address> label "..." [style <s>] [id <name>]
 *   text "..." at <address> [span <W>x<H>] [id <name>]
 *
 * Distances count whole 10px cells. Locations may appear on any command, so a
 * program can mix relative walking with absolute re-anchoring — an error stays
 * contained to the run between two absolute locations instead of corrupting
 * everything downstream.
 */

import { DIRECTIONS, OPPOSITE, isDirection, rect } from './geometry.js';
import { parseAddress, addressRect, pinPoint, looksLikeAddress, quadToAddress, assertOnGrid, PIN_NAMES, PINS } from './address.js';
import { alignmentFor, alignTrack, BOX_CORNER_STYLES, JUNCTION_STYLES, portPoint, approachPoint } from './shapes.js';

const SIDES = Object.freeze(['top', 'bottom', 'left', 'right']);
const SIDE_TO_DIR = Object.freeze({ top: 'up', bottom: 'down', left: 'left', right: 'right' });
const DIR_TO_INCOMING_SIDE = Object.freeze({ up: 'bottom', down: 'top', left: 'right', right: 'left' });
const ELEMENTS = Object.freeze(['line', 'corner', 'box', 'text', 'arrow', 'hop']);
const STYLES = Object.freeze([...new Set([...BOX_CORNER_STYLES, ...JUNCTION_STYLES])]);

// ---------------------------------------------------------------------------
// Tokenising
// ---------------------------------------------------------------------------

export function tokenize(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) {
    if (m[1] !== undefined) out.push({ t: m[1], quoted: true });
    else if (m[2] !== undefined) out.push({ t: m[2], quoted: true });
    else out.push({ t: m[3], quoted: false });
  }
  return out;
}

/** Strip comments and blank lines; `;` also separates commands on one line. */
export function splitProgram(program) {
  return String(program)
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .flatMap((l) => l.split(';').map((s) => s.trim()).filter(Boolean));
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseCommand(source) {
  const toks = tokenize(source);
  const cmd = { source, dir: null, n: null, align: [], style: null, element: null, at: null, from: null, to: null, label: null, span: null, id: null, font: null, fill: null, arrowEnd: false };
  const seen = [];

  for (let i = 0; i < toks.length; i++) {
    const { t, quoted } = toks[i];
    const low = t.toLowerCase();

    if (quoted) { cmd.label = t; continue; }

    if (low === 'pen' || low === 'face') { cmd.element = low; continue; }
    if (isDirection(low)) { cmd.dir = low; continue; }
    if (ELEMENTS.includes(low)) { seen.push(low); cmd.element = low; continue; }
    if (STYLES.includes(low)) { cmd.style = low; continue; }

    if (low === 'align') {
      // "center" parses here but is not a side. A stroke resolves it against the
      // corridor it is travelling through; a corner rejects it, because a corner
      // connects two named sides and "the middle" is not one of them.
      const accepted = [...SIDES, 'center', 'centre'];
      while (i + 1 < toks.length && accepted.includes(toks[i + 1].t.toLowerCase())) {
        cmd.align.push(toks[++i].t.toLowerCase());
      }
      if (!cmd.align.length) throw new SyntaxError(`"align" needs at least one side (${SIDES.join(', ')}) or "center" in: ${source}`);
      continue;
    }
    if (low === 'at') { cmd.at = requireNext(toks, ++i, 'at', source); continue; }
    if (low === 'from') { cmd.from = requireNext(toks, ++i, 'from', source); continue; }
    if (low === 'to') { cmd.to = requireNext(toks, ++i, 'to', source); continue; }
    if (low === 'label') { cmd.label = requireNext(toks, ++i, 'label', source); continue; }
    if (low === 'id') { cmd.id = requireNext(toks, ++i, 'id', source); continue; }
    if (low === 'fill') { cmd.fill = requireNext(toks, ++i, 'fill', source); continue; }
    if (low === 'span') { cmd.span = parseSpan(requireNext(toks, ++i, 'span', source), source); continue; }
    if (low === 'font') { cmd.font = Number(requireNext(toks, ++i, 'font', source)); continue; }

    if (/^\d+$/.test(low)) { cmd.n = Number(low); continue; }
    if (/^\d+x\d+$/i.test(low)) { cmd.span = parseSpan(low, source); continue; }

    if (looksLikeAddress(low)) {
      // A bare address is a location — this is the `(location)` form.
      const next = toks[i + 1]?.t.toLowerCase();
      const bare = t.replace(/^\(|\)$/g, '');
      if (next && PIN_NAMES.includes(next) && !bare.includes('.')) {
        cmd.at = `${bare}.${next}`;
        i++;
      } else {
        cmd.at = bare;
      }
      continue;
    }

    if (/^[A-Za-z0-9_-]+\.[A-Za-z]{1,2}$/.test(t)) { cmd.to = t; continue; } // id.port

    throw new SyntaxError(`unrecognised token "${t}" in: ${source}`);
  }

  // "… line … arrow" means the run's final quadrant IS the arrowhead, rather
  // than an extra quadrant after it. That is what lets `line to db.W arrow`
  // point at a box without overlapping it.
  if (seen.includes('line') && seen.includes('arrow')) {
    cmd.element = 'line';
    cmd.arrowEnd = true;
  }
  if (!cmd.element) cmd.element = cmd.dir ? 'line' : null;
  if (!cmd.element) throw new SyntaxError(`command states no element and no direction: ${source}`);
  return cmd;
}

function requireNext(toks, i, keyword, source) {
  if (i >= toks.length) throw new SyntaxError(`"${keyword}" needs a value in: ${source}`);
  return toks[i].t;
}

function parseSpan(text, source) {
  const m = /^(\d+)x(\d+)$/i.exec(String(text));
  if (!m) throw new SyntaxError(`span must look like 12x5 (cells), got "${text}" in: ${source}`);
  const w = Number(m[1]), h = Number(m[2]);
  if (w < 1 || h < 1) throw new RangeError(`span must be at least 1x1 cells, got "${text}"`);
  return { w, h };
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/** Offset from a pin point to the box's top-left, in quadrants. */
export function pinOffset(pin, w, h) {
  const [px, py] = PINS[pin] ?? PINS.tl;
  return { dx: -(px * w) / 2, dy: -(py * h) / 2 };
}

/**
 * Run a pen program.
 *
 * @param {object} ctx  { resolveTarget(idPort) -> {x,y} | null }
 * @returns {{pieces:Array, boxes:Array, texts:Array, cursor:object, facing:string,
 *            trace:Array, notes:Array}}
 */
export function runPen(program, ctx = {}) {
  // `start` lets a path be resumed where it left off, which is what makes
  // extending an existing path possible without redrawing it.
  const state = { x: ctx.start?.x ?? 0, y: ctx.start?.y ?? 0, facing: ctx.start?.facing ?? 'right' };
  const pieces = [];
  const boxes = [];
  const texts = [];
  const trace = [];
  const notes = [];
  const targets = [];
  const occupied = new Map(); // quadKey -> step index, for self-overlap detection

  const commands = splitProgram(program).map(parseCommand);
  if (!commands.length) throw new Error('pen program is empty');

  commands.forEach((cmd, step) => {
    const label = `step ${step + 1}: ${cmd.source}`;

    if (cmd.at) setCursorFromAddress(state, cmd.at);

    switch (cmd.element) {
      case 'pen': {
        // `pen from <id>.<port>` puts the cursor in the quadrant just outside a
        // box's face, already facing away from it — which is where a connector
        // has to start. Computing that address by hand is a common off-by-one:
        // the north face sits on the box's own top row, the south face does not.
        const port = cmd.from ?? (cmd.at ? null : cmd.to);
        if (port) {
          const seat = seatAtPort(port, ctx, cmd.source);
          state.x = seat.x;
          state.y = seat.y;
          state.facing = cmd.dir ?? seat.facing;
          trace.push({ step: step + 1, source: cmd.source, action: 'cursor', at: quadToAddress(state.x, state.y), facing: state.facing, from: port });
          return;
        }
        if (!cmd.at) throw new SyntaxError(`"pen" needs a location, e.g. "pen B5 bl" or "pen from gateway.S" — got: ${cmd.source}`);
        if (cmd.dir) state.facing = cmd.dir;
        trace.push({ step: step + 1, source: cmd.source, action: 'cursor', at: quadToAddress(state.x, state.y), facing: state.facing });
        return;
      }
      case 'face': {
        if (!cmd.dir) throw new SyntaxError(`"face" needs a direction — got: ${cmd.source}`);
        state.facing = cmd.dir;
        trace.push({ step: step + 1, source: cmd.source, action: 'face', facing: state.facing });
        return;
      }
      case 'box': {
        if (!cmd.span) throw new SyntaxError(`box needs a span, e.g. "span 12x5" — got: ${cmd.source}`);
        if (!cmd.at) throw new SyntaxError(`box needs a location, e.g. "at C4.tl" — got: ${cmd.source}`);
        const a = parseAddress(cmd.at);
        const p = pinPoint(a);
        const w = cmd.span.w * 2, h = cmd.span.h * 2;
        const { dx, dy } = pinOffset(a.kind === 'pin' ? a.part : 'tl', w, h);
        const r = assertOnGrid(rect(p.x + dx, p.y + dy, w, h), `box "${cmd.id ?? cmd.label ?? 'unnamed'}" pinned at ${cmd.at}`);
        boxes.push({ id: cmd.id, rect: r, label: cmd.label ?? '', corner: cmd.style ?? 'square', fontSize: cmd.font, fill: cmd.fill });
        trace.push({ step: step + 1, source: cmd.source, action: 'box', at: quadToAddress(r.x, r.y), span: `${cmd.span.w}x${cmd.span.h}` });
        return;
      }
      case 'text': {
        if (!cmd.at) throw new SyntaxError(`text needs a location — got: ${cmd.source}`);
        const a = parseAddress(cmd.at);
        const p = pinPoint(a);
        const span = cmd.span ?? { w: Math.max(1, Math.ceil(String(cmd.label ?? '').length / 3)), h: 1 };
        texts.push({ id: cmd.id, rect: rect(p.x, p.y, span.w * 2, span.h * 2), text: cmd.label ?? '', fontSize: cmd.font });
        trace.push({ step: step + 1, source: cmd.source, action: 'text', at: quadToAddress(p.x, p.y) });
        return;
      }
      case 'arrow': {
        // An arrowhead is one quadrant pointing the way the path is travelling.
        const dir = cmd.dir ?? state.facing;
        recordPiece(pieces, occupied, notes, { x: state.x, y: state.y, type: 'arrow', dir, style: cmd.style ?? 'square' }, step + 1);
        trace.push({ step: step + 1, source: cmd.source, action: 'arrow', at: quadToAddress(state.x, state.y), dir });
        state.facing = dir;
        state.x += DIRECTIONS[dir].dx;
        state.y += DIRECTIONS[dir].dy;
        return;
      }
      case 'hop': {
        // A deliberate crossing. Marking it exempts the quadrant from the
        // stroke-overlap rule, so an intended hop is not reported as a defect.
        const dir = cmd.dir ?? state.facing;
        recordPiece(pieces, occupied, notes, { x: state.x, y: state.y, type: 'hop', dir, style: cmd.style ?? 'rounded' }, step + 1);
        trace.push({ step: step + 1, source: cmd.source, action: 'hop', at: quadToAddress(state.x, state.y), dir });
        state.facing = dir;
        state.x += DIRECTIONS[dir].dx;
        state.y += DIRECTIONS[dir].dy;
        return;
      }
      case 'corner': {
        const facing = cmd.dir ?? state.facing;
        const incoming = DIR_TO_INCOMING_SIDE[facing];
        let sides = cmd.align.length ? [...cmd.align] : null;
        let outgoingSide;

        if (sides) {
          if (sides.length !== 2) {
            throw new SyntaxError(`a corner connects exactly two sides, e.g. "align right bottom" — got ${sides.length} in: ${cmd.source}`);
          }
          if (!sides.includes(incoming)) {
            throw new SyntaxError(
              `corner sides ${sides.join('+')} do not include "${incoming}", the side the path arrives on while facing ${facing}. ` +
              `A path travelling ${facing} enters its corner from the ${incoming}. In: ${cmd.source}`,
            );
          }
          outgoingSide = sides.find((s) => s !== incoming);
        } else {
          throw new SyntaxError(`corner needs "align <sideA> <sideB>", e.g. "align right bottom" — got: ${cmd.source}`);
        }

        const outDir = SIDE_TO_DIR[outgoingSide];
        recordPiece(pieces, occupied, notes, { x: state.x, y: state.y, type: 'corner', sides: [...sides].sort(), style: cmd.style ?? 'square', dir: outDir }, step + 1);
        trace.push({ step: step + 1, source: cmd.source, action: 'corner', at: quadToAddress(state.x, state.y), sides, style: cmd.style ?? 'square', turnsTo: outDir });

        state.facing = outDir;
        state.x += DIRECTIONS[outDir].dx;
        state.y += DIRECTIONS[outDir].dy;
        return;
      }
      case 'line': {
        const dir = cmd.dir ?? state.facing;
        const axis = DIRECTIONS[dir].axis;
        // Default to the track the cursor is already on. A fixed default would
        // fight a deliberately seated cursor — "pen from gateway.S" lands on the
        // port's own column, and a default of "right" would shift off it.
        const carried = axis === 'v' ? (state.x % 2 === 0 ? 'left' : 'right') : state.y % 2 === 0 ? 'top' : 'bottom';
        const requested = cmd.align[0];

        // `align center` is measured against the CORRIDOR, not the cell. Centring
        // a 5px stroke inside a 10px cell is impossible on the lattice — that
        // rejection stands — but "put me in the middle of the gap between these
        // two things" is a different, answerable question. The stroke still lands
        // on a whole quadrant; only the choice of which quadrant changes.
        let align, track;
        if (requested === 'center' || requested === 'centre') {
          const corridor = ctx.corridorAt?.(axis, axis === 'v' ? state.y : state.x, axis === 'v' ? state.x : state.y);
          if (!corridor) {
            // No document to measure against, or no bounded gap. Refusing beats
            // inventing a 2.5px offset.
            alignmentFor(axis, requested); // throws with the canonical message
          }
          const width = corridor.max - corridor.min + 1;
          track = corridor.min + Math.floor((width - 1) / 2);
          align = axis === 'v' ? (track % 2 === 0 ? 'left' : 'right') : track % 2 === 0 ? 'top' : 'bottom';
          if (width % 2 === 0) {
            notes.push({
              code: 'L018',
              step: step + 1,
              message:
                `centred in a ${width}-quadrant corridor, which has no exact middle — the stroke sits at ` +
                `${quadToAddress(axis === 'v' ? track : state.x, axis === 'v' ? state.y : track)}, half a quadrant ` +
                'below true centre. A whole-quadrant offset is the closest the lattice allows.',
              source: cmd.source,
            });
          }
        } else {
          align = alignmentFor(axis, requested ?? carried);
          // The alignment picks which half of the cell the 5px stroke hugs.
          track = axis === 'v' ? alignTrack(state.x, align) : alignTrack(state.y, align);
        }
        const currentPerp = axis === 'v' ? state.x : state.y;
        // Only a gap in an existing path is a discontinuity. Snapping the very
        // first stroke onto its track is just cursor placement, not a defect.
        if (track !== currentPerp && pieces.length > 0) {
          notes.push({
            code: 'L014',
            step: step + 1,
            message:
              `path discontinuity: the cursor sits at ${quadToAddress(state.x, state.y)} but "align ${align}" ` +
              `starts this stroke at ${quadToAddress(axis === 'v' ? track : state.x, axis === 'v' ? state.y : track)}, ` +
              `leaving a gap. The stroke is drawn where you asked; use "align ${axis === 'v' ? (state.x % 2 ? 'right' : 'left') : state.y % 2 ? 'bottom' : 'top'}" ` +
              'to continue on the current track, or place a corner to change track deliberately.',
            source: cmd.source,
          });
        }
        if (axis === 'v') state.x = track; else state.y = track;

        let quads;
        if (cmd.to) {
          const reach = distanceToTarget(state, dir, cmd.to, ctx, cmd.source);
          quads = reach.quads;
          // Record what this leg was aiming at. Whether the path actually
          // ARRIVES cannot be judged here: targeting a box on the first leg of
          // an L-shaped route is correct usage — "go right until level with it,
          // then turn". Only the finished path can be checked, so that happens
          // at validation instead.
          if (reach.targetId) targets.push({ id: reach.targetId, port: reach.targetPort, step: step + 1 });
        } else {
          const cells = cmd.n ?? 1;
          quads = cells * 2;
        }
        if (quads <= 0) {
          throw new RangeError(`"${cmd.source}" travels ${quads} quadrants — a line must move at least one quadrant in the direction it faces`);
        }

        const { dx, dy } = DIRECTIONS[dir];
        const start = { x: state.x, y: state.y };
        for (let k = 0; k < quads; k++) {
          const terminal = cmd.arrowEnd && k === quads - 1;
          recordPiece(
            pieces,
            occupied,
            notes,
            { x: state.x + dx * k, y: state.y + dy * k, type: terminal ? 'arrow' : 'line', dir, align, style: cmd.style ?? 'square' },
            step + 1,
          );
        }
        state.x += dx * quads;
        state.y += dy * quads;
        state.facing = dir;

        trace.push({
          step: step + 1,
          source: cmd.source,
          action: 'line',
          from: quadToAddress(start.x, start.y),
          to: quadToAddress(state.x - dx, state.y - dy),
          dir,
          align,
          quadrants: quads,
          cells: quads / 2,
        });
        return;
      }
      default:
        throw new SyntaxError(`unsupported element "${cmd.element}" in: ${cmd.source}`);
    }
  });

  return { pieces, boxes, texts, cursor: { x: state.x, y: state.y }, facing: state.facing, trace, notes, targets };
}

function recordPiece(pieces, occupied, notes, piece, step) {
  const key = `${piece.x},${piece.y}`;
  if (occupied.has(key)) {
    notes.push({
      code: 'L015',
      step,
      message: `path self-overlap at ${quadToAddress(piece.x, piece.y)}: already drawn in step ${occupied.get(key)}`,
    });
  } else {
    occupied.set(key, step);
  }
  pieces.push(piece);
}

function setCursorFromAddress(state, address) {
  const r = addressRect(parseAddress(address));
  state.x = r.x;
  state.y = r.y;
}

function distanceToTarget(state, dir, target, ctx, source) {
  const point = resolveTargetPoint(target, ctx, source);
  const { dx, dy } = DIRECTIONS[dir];
  const delta = dx !== 0 ? (point.x - state.x) * dx : (point.y - state.y) * dy;
  if (delta <= 0) {
    throw new RangeError(
      `"to ${target}" resolves to ${quadToAddress(point.x, point.y)}, which is not ${dir} of the cursor at ${quadToAddress(state.x, state.y)} — in: ${source}`,
    );
  }
  const named = /^([A-Za-z0-9_-]+)\.([A-Za-z]{1,2})$/.exec(target);
  return {
    quads: delta,
    point,
    targetId: named && !looksLikeAddress(target) ? named[1] : null,
    targetPort: named && !looksLikeAddress(target) ? named[2] : null,
  };
}

/** Resolve `<id>.<port>` to the quadrant just outside that face, facing away. */
function seatAtPort(target, ctx, source) {
  const m = /^([A-Za-z0-9_-]+)\.([A-Za-z]{1,2})$/.exec(target);
  if (!m) {
    throw new SyntaxError(`"pen from" expects a box port like "gateway.S" — got "${target}" in: ${source}`);
  }
  if (typeof ctx.resolveElement !== 'function') {
    throw new Error(`"pen from ${target}" needs a document to resolve against — in: ${source}`);
  }
  const el = ctx.resolveElement(m[1]);
  if (!el) throw new Error(`"pen from ${target}" — no element named "${m[1]}" in: ${source}`);
  if (el.kind !== 'box') throw new Error(`"pen from ${target}" — "${m[1]}" is a ${el.kind}; ports exist on boxes only`);
  return approachPoint(el.rect, m[2]);
}

function resolveTargetPoint(target, ctx, source) {
  if (looksLikeAddress(target)) {
    const r = addressRect(parseAddress(target));
    return { x: r.x, y: r.y };
  }
  const m = /^([A-Za-z0-9_-]+)\.([A-Za-z]{1,2})$/.exec(target);
  if (m && typeof ctx.resolveElement === 'function') {
    const el = ctx.resolveElement(m[1]);
    if (!el) throw new Error(`"to ${target}" — no element named "${m[1]}" in: ${source}`);
    if (el.kind !== 'box') throw new Error(`"to ${target}" — element "${m[1]}" is a ${el.kind}; ports exist on boxes only`);
    return portPoint(el.rect, m[2]);
  }
  throw new SyntaxError(`cannot resolve target "${target}" in: ${source} (expected an address like C4.q2 or a port like db.W)`);
}
