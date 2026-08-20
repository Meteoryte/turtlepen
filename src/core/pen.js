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
 *   <dir> ... line to <address|id.port[#slot]>     draw until it reaches a target
 *   <dir> ... line arrow [both|start|end]          head the end, both ends, or the origin
 *   pen from <id>.<face>[#slot]                    leave a box on a dedicated track
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
import { rayQuads, circleQuads, arcQuads, polygonQuads, dashQuads, discQuads, resolveDir8, DIR8, DIR8_ALIAS } from './raster.js';

const SIDES = Object.freeze(['top', 'bottom', 'left', 'right']);
const SIDE_TO_DIR = Object.freeze({ top: 'up', bottom: 'down', left: 'left', right: 'right' });
const DIR_TO_INCOMING_SIDE = Object.freeze({ up: 'bottom', down: 'top', left: 'right', right: 'left' });
const ELEMENTS = Object.freeze(['line', 'corner', 'box', 'text', 'arrow', 'hop', 'ray', 'circle', 'disc', 'arc', 'polygon', 'triangle', 'dot', 'dash']);

/**
 * Shapes that are not rectangles.
 *
 * A diagonal, a circle and an arc are the same kind of thing on this lattice: a
 * computed set of whole quadrants. They are parsed positionally rather than by
 * the general token sweep, because their arguments are numbers and addresses in
 * a fixed order and guessing at them would make errors harder to read, not
 * easier.
 */
const SHAPES = Object.freeze(['ray', 'circle', 'disc', 'arc', 'polygon', 'triangle', 'dot', 'dash']);
const STYLES = Object.freeze([...new Set([...BOX_CORNER_STYLES, ...JUNCTION_STYLES])]);
const ELEMENT_PORT_RE = /^([A-Za-z0-9_-]+)\.([A-Za-z]{1,2}(?:#\d+)?)$/;

/**
 * Compass words that a mark understands but the cursor does not — `ne`, `sw`,
 * `north`, `down-left` and so on, minus the four that ARE movement verbs.
 *
 * Derived from the mark vocabulary rather than listed, so the two can never
 * drift: a direction added to `DIR8_ALIAS` is diagnosable here the same day.
 */
const COMPASS_WORDS = Object.freeze(
  [...Object.keys(DIR8), ...Object.keys(DIR8_ALIAS)].filter((w) => !isDirection(w)),
);

const isCompassWord = (t) => COMPASS_WORDS.includes(t);

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
    // A hash at the start of a line, or " # " after a command, is a comment.
    // A compact hash token is a hex colour (`fill #001b35`) and must survive.
    .map((l) => (l.trimStart().startsWith('#') ? '' : l.replace(/\s+#(?=\s|$).*$/, '')).trim())
    .filter(Boolean)
    .flatMap((l) => l.split(';').map((s) => s.trim()).filter(Boolean));
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseCommand(source) {
  const toks = tokenize(source);
  const cmd = { source, dir: null, n: null, align: [], style: null, element: null, at: null, from: null, to: null, label: null, span: null, id: null, font: null, weight: null, fill: null, shape: null, arrowEnd: false, arrowStart: false, arrowWhere: null, args: [] };
  const seen = [];

  // Shapes read their own arguments positionally.
  const head = toks[0]?.t?.toLowerCase();
  if (SHAPES.includes(head)) {
    cmd.element = head;
    cmd.args = toks.slice(1).map((x) => x.t);
    return cmd;
  }

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
    if (low === 'shape') { cmd.shape = requireNext(toks, ++i, 'shape', source); continue; }
    if (low === 'span') { cmd.span = parseSpan(requireNext(toks, ++i, 'span', source), source); continue; }
    if (low === 'font') { cmd.font = Number(requireNext(toks, ++i, 'font', source)); continue; }
    if (low === 'weight') { cmd.weight = Number(requireNext(toks, ++i, 'weight', source)); continue; }

    // Where the heads go. Read as a modifier of `arrow`, and like every other
    // token it may appear anywhere in the command.
    if (low === 'both' || low === 'start' || low === 'end') { cmd.arrowWhere = low; continue; }

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

    if (ELEMENT_PORT_RE.test(t)) { cmd.to = t; continue; } // id.port or id.face#slot

    // A compass word where a movement verb belongs is the single most expensive
    // wrong turn in this grammar. The pen cursor runs on four orthogonal tracks
    // because a stroke has to sit on a lattice track to be aligned at all — but
    // `ray` draws at ANY angle, and `dot`/`dash` mark in all eight. An author who
    // writes `ne 8 line` has concluded the engine cannot do diagonals and starts
    // faking them, when the primitive they wanted was one token away. A generic
    // "unrecognised token" leaves them with that wrong conclusion, so this names
    // the two commands that do what they were reaching for.
    if (isCompassWord(low)) {
      throw new SyntaxError(
        `"${t}" is a compass direction, and the pen cursor only travels ${Object.keys(DIRECTIONS).join(', ')} — ` +
          `a stroke has to sit on a lattice track. For a straight line at any angle use "ray to <address>"; ` +
          `for a mark in this direction use "dash ${resolveDir8(low)} <length>" or "dot ${resolveDir8(low)}". In: ${source}`,
      );
    }

    throw new SyntaxError(`unrecognised token "${t}" in: ${source}`);
  }

  // "… line … arrow" means the run's final quadrant IS the arrowhead, rather
  // than an extra quadrant after it. That is what lets `line to db.W arrow`
  // point at a box without overlapping it.
  if (seen.includes('line') && seen.includes('arrow')) {
    cmd.element = 'line';
    cmd.arrowEnd = cmd.arrowWhere !== 'start';
    cmd.arrowStart = cmd.arrowWhere === 'start' || cmd.arrowWhere === 'both';
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
  let origin = null;   // the node this path leaves, when the author named one
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

    if (cmd.at) setCursorFromLocation(state, cmd.at, ctx, cmd.source);

    switch (cmd.element) {
      case 'pen': {
        // `pen from <id>.<port>` puts the cursor in the quadrant just outside a
        // box's face, already facing away from it — which is where a connector
        // has to start. Computing that address by hand is a common off-by-one:
        // the north face sits on the box's own top row, the south face does not.
        const port = cmd.from ?? (cmd.at ? null : cmd.to);
        if (port) {
          const seat = seatAtPort(port, ctx, cmd.source);
          // `pen from <id>.<face>` is the author stating where this connector
          // leaves. Recording it costs nothing and turns "which edges leave
          // this node" from an inference into a fact — which is the difference
          // between a rule that reports and a rule that guesses.
          if (cmd.from && origin == null) {
            const dot = String(cmd.from).indexOf('.');
            if (dot > 0) origin = { id: String(cmd.from).slice(0, dot), port: String(cmd.from).slice(dot + 1) };
          }
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
        boxes.push({ id: cmd.id, rect: r, label: cmd.label ?? '', corner: cmd.style ?? 'square', shape: cmd.shape ?? 'process', fontSize: cmd.font, fill: cmd.fill });
        trace.push({ step: step + 1, source: cmd.source, action: 'box', at: quadToAddress(r.x, r.y), span: `${cmd.span.w}x${cmd.span.h}` });
        return;
      }
      case 'text': {
        if (!cmd.at) throw new SyntaxError(`text needs a location — got: ${cmd.source}`);
        const a = parseAddress(cmd.at);
        const p = pinPoint(a);
        const span = cmd.span ?? { w: Math.max(1, Math.ceil(String(cmd.label ?? '').length / 3)), h: 1 };
        const align = cmd.align.find((value) => ['left', 'center', 'right'].includes(value)) ?? 'left';
        texts.push({ id: cmd.id, rect: rect(p.x, p.y, span.w * 2, span.h * 2), text: cmd.label ?? '', fontSize: cmd.font, align, color: cmd.fill, weight: cmd.weight });
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
        //
        // A hop is ONE quadrant, so it has no destination. `hop to <address>`
        // used to parse and then silently ignore the target, which is the
        // "named but not built, so quietly do something adjacent" failure this
        // engine refuses everywhere else. An authoring session lost real time
        // to it: the hop appeared to work, travelled one cell, and the overlap
        // it was meant to clear was still reported.
        if (cmd.to != null) {
          throw new SyntaxError(
            `"hop" marks a single crossing quadrant and takes a direction, not a destination — got: ${cmd.source}. `
            + 'To cross another path on the way somewhere, draw the run and hop only at the crossing: '
            + '"right 3 line" then "right hop" then "right line to <id>.<port> arrow".',
          );
        }
        const dir = cmd.dir ?? state.facing;
        recordPiece(pieces, occupied, notes, { x: state.x, y: state.y, type: 'hop', dir, style: cmd.style ?? 'rounded' }, step + 1);
        trace.push({ step: step + 1, source: cmd.source, action: 'hop', at: quadToAddress(state.x, state.y), dir });
        state.facing = dir;
        state.x += DIRECTIONS[dir].dx;
        state.y += DIRECTIONS[dir].dy;
        return;
      }
      case 'ray': case 'circle': case 'disc': case 'arc':
      case 'polygon': case 'triangle': case 'dot': case 'dash': {
        const quads = shapeQuads(cmd, state, ctx);
        for (const q of quads) {
          recordPiece(pieces, occupied, notes, { x: q.x, y: q.y, type: 'mark', style: cmd.style ?? 'square' }, step + 1);
        }
        // The cursor lands on the last quadrant drawn, so a shape can be
        // followed by more drawing without re-stating where you are.
        const tip = quads[quads.length - 1];
        state.x = tip.x;
        state.y = tip.y;
        trace.push({ step: step + 1, source: cmd.source, action: cmd.element, at: quadToAddress(tip.x, tip.y), quadrants: quads.length });
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
        if (cmd.arrowStart && quads < 2) {
          throw new RangeError(
            `"${cmd.source}" travels one quadrant, which is one end and not two — a run needs at least two quadrants to carry heads at both ends`,
          );
        }
        for (let k = 0; k < quads; k++) {
          const terminal = cmd.arrowEnd && k === quads - 1;
          // A head at the origin points AWAY from travel. Two heads on one run
          // mean "either direction", so they disagree about direction on
          // purpose — pointing both the same way would read as one long arrow.
          const leading = cmd.arrowStart && k === 0;
          recordPiece(
            pieces,
            occupied,
            notes,
            {
              x: state.x + dx * k,
              y: state.y + dy * k,
              type: terminal || leading ? 'arrow' : 'line',
              dir: leading ? OPPOSITE[dir] : dir,
              align,
              style: cmd.style ?? 'square',
            },
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

  return { pieces, boxes, texts, cursor: { x: state.x, y: state.y }, facing: state.facing, trace, notes, targets, origin };
}

/**
 * Resolve a shape command into the quadrants it covers.
 *
 * Everything here is integer arithmetic on the lattice, so the same command
 * always produces the same quadrants — the property every other guarantee in
 * this engine is built on.
 *
 *   ray to <address>              a straight line at ANY angle, not just the four
 *   circle <r>                    outline, midpoint algorithm, radius in quadrants
 *   disc <r>                      the same circle, filled
 *   arc <r> <startDeg> <endDeg>   part of that circle, clockwise from east
 *   polygon <addr> <addr> <addr>… closed; three points is a triangle
 *   triangle <addr> <addr> <addr> the same thing, named for what it is
 *   dot                           one quadrant, the morse dot
 *   dash <n> <dir8>               n quadrants in any of the eight directions
 */
function shapeQuads(cmd, state, ctx) {
  const at = (token) => resolveLocation(token, ctx ?? {}, cmd.source);

  // An anchored shape resolves its coordinate from a relationship at execution
  // time rather than from a value someone worked out by hand. `offset` nudges
  // that resolved point in whole quadrants.
  let origin = { x: state.x, y: state.y };
  const atIdx = cmd.args.findIndex((a) => String(a).toLowerCase() === 'at');
  if (atIdx >= 0) {
    const target = cmd.args[atIdx + 1];
    if (!target) throw new SyntaxError(`"at" needs an anchor, e.g. "at shell.C" — in: ${cmd.source}`);
    origin = at(target);
    cmd.args.splice(atIdx, 2);
  }
  const offIdx = cmd.args.findIndex((a) => String(a).toLowerCase() === 'offset');
  if (offIdx >= 0) {
    const dx = Number(cmd.args[offIdx + 1]), dy = Number(cmd.args[offIdx + 2]);
    if (!Number.isInteger(dx) || !Number.isInteger(dy)) {
      throw new SyntaxError(`"offset" needs two whole quadrant counts, e.g. "offset 4 -3" — in: ${cmd.source}`);
    }
    origin = { x: origin.x + dx, y: origin.y + dy };
    cmd.args.splice(offIdx, 3);
  }
  state.x = origin.x;
  state.y = origin.y;
  const num = (token, what) => {
    const v = Number(token);
    if (!Number.isInteger(v)) {
      throw new SyntaxError(`${cmd.element} needs a whole number for ${what} — got "${token}" in: ${cmd.source}`);
    }
    return v;
  };

  switch (cmd.element) {
    case 'ray': {
      // "ray to X" and "ray X" both read naturally; accept either.
      const target = cmd.args[0]?.toLowerCase() === 'to' ? cmd.args[1] : cmd.args[0];
      if (!target) throw new SyntaxError(`ray needs a destination address, e.g. "ray to AF20.q1" — in: ${cmd.source}`);
      const p = at(target);
      return rayQuads(state.x, state.y, p.x, p.y);
    }
    case 'circle': return circleQuads(state.x, state.y, num(cmd.args[0], 'radius'));
    case 'disc': return discQuads(state.x, state.y, num(cmd.args[0], 'radius'));
    case 'arc': {
      if (cmd.args.length < 3) throw new SyntaxError(`arc needs a radius and two angles, e.g. "arc 12 0 90" — in: ${cmd.source}`);
      return arcQuads(state.x, state.y, num(cmd.args[0], 'radius'), num(cmd.args[1], 'start angle'), num(cmd.args[2], 'end angle'));
    }
    case 'polygon': case 'triangle': {
      const pts = cmd.args.filter((a) => looksLikeAddress(a)).map(at);
      // The cursor counts as the first vertex, so "triangle A B" is legal and
      // means "from here, to A, to B, and back".
      const all = pts.length >= 3 ? pts : [{ x: state.x, y: state.y }, ...pts];
      if (cmd.element === 'triangle' && all.length !== 3) {
        throw new SyntaxError(`a triangle needs exactly three points — got ${all.length} in: ${cmd.source}. Use "polygon" for more.`);
      }
      return polygonQuads(all);
    }
    case 'dot': return dashQuads(state.x, state.y, cmd.args[0] ?? 'right', 1);
    case 'dash': {
      // "dash 6 se" and "dash se 6" both read naturally.
      const a = cmd.args[0], b = cmd.args[1];
      const isNum = (v) => v != null && /^\d+$/.test(v);
      const length = isNum(a) ? Number(a) : isNum(b) ? Number(b) : null;
      const dir = isNum(a) ? b : a;
      if (length == null) throw new SyntaxError(`dash needs a length, e.g. "dash 6 se" — in: ${cmd.source}`);
      resolveDir8(dir ?? 'right');
      return dashQuads(state.x, state.y, dir ?? 'right', length);
    }
    default:
      throw new SyntaxError(`unsupported shape "${cmd.element}" in: ${cmd.source}`);
  }
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

/**
 * A location is either an address or an ANCHOR on an existing element.
 *
 * Connectors learned this early — `pen from gateway.S` exists because a
 * hand-computed address is where the mistakes live. Shapes never learned it, so
 * every part of the first logo was an absolute coordinate worked out by hand and
 * the proportions drifted. An anchor derives position from a relationship when
 * the program runs, so the author does not have to recompute the coordinate.
 *
 * `from` gives the SEAT (one step outside the element, where a connector
 * starts); `at` gives the anchor itself (on the element, where a shape belongs).
 */
export function resolveLocation(token, ctx, source) {
  if (looksLikeAddress(token)) {
    const r = addressRect(parseAddress(token));
    return { x: r.x, y: r.y };
  }
  const m = ELEMENT_PORT_RE.exec(String(token));
  if (!m) {
    throw new SyntaxError(`"${token}" is neither an address like C4.q2 nor an anchor like shell.C — in: ${source}`);
  }
  if (typeof ctx.resolveElement !== 'function') {
    throw new Error(`"at ${token}" needs a document to resolve against — in: ${source}`);
  }
  const el = ctx.resolveElement(m[1]);
  if (!el) throw new Error(`no element "${m[1]}" to anchor to — in: ${source}`);
  return portPoint(anchorRect(el, m[1], source), m[2]);
}

/**
 * The footprint an anchor is measured against.
 *
 * Boxes and images carry a rect. A path does not — but a drawn shape is exactly
 * the thing you most want to anchor to, so its bounding box is computed from
 * the quadrants it actually covers. Without this, anchoring would work for
 * every element except the ones you drew.
 */
function anchorRect(el, id, source) {
  if (el.rect) return el.rect;
  if (!el.pieces?.length) {
    throw new Error(`"${id}" is a ${el.kind} with no footprint to anchor to — in: ${source}`);
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of el.pieces) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

function setCursorFromLocation(state, token, ctx, source) {
  const p = resolveLocation(token, ctx ?? {}, source);
  state.x = p.x;
  state.y = p.y;
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
  const named = ELEMENT_PORT_RE.exec(target);
  return {
    quads: delta,
    point,
    targetId: named && !looksLikeAddress(target) ? named[1] : null,
    targetPort: named && !looksLikeAddress(target) ? named[2] : null,
  };
}

/** Resolve `<id>.<port>` to the quadrant just outside that face, facing away. */
function seatAtPort(target, ctx, source) {
  const m = ELEMENT_PORT_RE.exec(target);
  if (!m) {
    throw new SyntaxError(`"pen from" expects a box port like "gateway.S" — got "${target}" in: ${source}`);
  }
  if (typeof ctx.resolveElement !== 'function') {
    throw new Error(`"pen from ${target}" needs a document to resolve against — in: ${source}`);
  }
  const el = ctx.resolveElement(m[1]);
  if (!el) throw new Error(`"pen from ${target}" — no element named "${m[1]}" in: ${source}`);
  if (el.kind !== 'box') throw new Error(`"pen from ${target}" — "${m[1]}" is a ${el.kind}; ports exist on boxes only`);
  return approachPoint(el.rect, m[2], el.shape, el.corner);
}

function resolveTargetPoint(target, ctx, source) {
  if (looksLikeAddress(target)) {
    const r = addressRect(parseAddress(target));
    return { x: r.x, y: r.y };
  }
  const m = ELEMENT_PORT_RE.exec(target);
  if (m && typeof ctx.resolveElement === 'function') {
    const el = ctx.resolveElement(m[1]);
    if (!el) throw new Error(`"to ${target}" — no element named "${m[1]}" in: ${source}`);
    if (el.kind !== 'box') throw new Error(`"to ${target}" — element "${m[1]}" is a ${el.kind}; ports exist on boxes only`);
    return portPoint(el.rect, m[2], el.shape, el.corner);
  }
  throw new SyntaxError(`cannot resolve target "${target}" in: ${source} (expected an address like C4.q2 or a port like db.W)`);
}
