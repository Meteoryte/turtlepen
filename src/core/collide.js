/**
 * The collision engine — every defect this substrate can detect, ranked.
 *
 * Two design commitments run through this file.
 *
 * First, nothing here mutates the document. The engine measures and reports;
 * the AI decides. A placement is never rejected, so the AI can sketch roughly
 * and repair afterwards rather than fighting per-call rejections.
 *
 * Second, the AI adjudicates intent, not the engine. Findings carry a stable
 * fingerprint derived from the rule, the page, the actors, and the exact
 * quadrants involved. Accepting a finding records that fingerprint as
 * deliberate. If the geometry later changes, the fingerprint changes with it
 * and the acceptance lapses automatically — so "I meant that" can never quietly
 * suppress a genuinely new problem.
 */

import { createHash } from 'node:crypto';
import { rect, rectsOverlap, intersection, expand, right, bottom, quadKey, parseQuadKey } from './geometry.js';
import { quadToAddress, quadToCell, describeRegion } from './address.js';
import { elementsOf, elementClaimed, elementVisual, elementRects, findElement } from './document.js';
import { shapeCutQuads, fitReportForShape, isContainer, SHAPE_PROPORTION, aspectOf } from './shapes.js';
import { layoutTextRuns, MIN_LEGIBLE_FONT_PX } from './text.js';
// Cycle with composition.js is deliberate and safe: every use on both sides is inside a
// function body, so neither module reads the other's bindings during initialisation.
import { compositionFindings } from './composition.js';
import { flowchartFindings, FLOWCHART_RULES } from './flowchart.js';
import { analyseRuns, MAX_READABLE_TRANSITION_RATIO } from './dither.js';

export const SEVERITIES = Object.freeze(['S0', 'S1', 'S2', 'S3']);
export const SEVERITY_LABEL = Object.freeze({ S0: 'CRITICAL', S1: 'ERROR', S2: 'WARN', S3: 'INFO' });
const RANK = Object.freeze({ S0: 0, S1: 1, S2: 2, S3: 3 });

export const RULES = Object.freeze({
  L001: { severity: 'S0', title: 'node overlap', blurb: 'two elements claim the same quadrants on one page' },
  L002: { severity: 'S1', title: 'label too wide', blurb: 'measured text is wider than the box interior' },
  L003: { severity: 'S1', title: 'label too tall', blurb: 'wrapped text needs more lines than the box can show' },
  L004: { severity: 'S1', title: 'stroke crosses node', blurb: 'a path runs through the inked body of a box' },
  L005: { severity: 'S1', title: 'exclusive page overlap', blurb: 'a page declared exclusive overlaps content below it' },
  L006: { severity: 'S2', title: 'stroke overlap', blurb: 'two paths claim the same quadrant with no junction' },
  L007: { severity: 'S2', title: 'no gutter', blurb: 'two boxes touch with no separating quadrant' },
  L008: { severity: 'S2', title: 'dangling path end', blurb: 'a path ends without meeting a box or another path' },
  L009: { severity: 'S2', title: 'below legibility floor', blurb: `font size under ${MIN_LEGIBLE_FONT_PX}px` },
  L010: { severity: 'S3', title: 'overlay overlap', blurb: 'expected overlap from a page declared as an overlay' },
  L011: { severity: 'S2', title: 'outside canvas', blurb: 'an element extends past the declared canvas bounds' },
  L012: { severity: 'S0', title: 'duplicate id', blurb: 'the same element id appears more than once' },
  L013: { severity: 'S3', title: 'passes through corner cut', blurb: 'a path crosses a claimed but un-inked corner quadrant' },
  L014: { severity: 'S2', title: 'path discontinuity', blurb: 'a stroke was drawn on a track the cursor was not on' },
  L015: { severity: 'S2', title: 'path self-overlap', blurb: 'a path re-draws a quadrant it already covered' },
  L016: { severity: 'S2', title: 'target not reached', blurb: 'a path named a destination but stops short of touching it' },
  L017: { severity: 'S3', title: 'centring bias', blurb: 'centred text could not be split evenly, so a pixel went left' },
  L018: { severity: 'S3', title: 'centring bias', blurb: 'a stroke centred in an even corridor could not sit exactly in the middle' },
  L019: { severity: 'S2', title: 'invisible but claiming', blurb: 'an element faded past legibility still occupies its quadrants' },
  L020: { severity: 'S2', title: 'reference still present', blurb: 'a tracing underlay is still in the document' },
  L021: { severity: 'S1', title: 'overlay obscures text', blurb: 'opaque overlay content crosses a lower text run' },
  L022: { severity: 'S2', title: 'busy raster image', blurb: 'high-frequency black/white transitions obscure image identity' },
  L023: { severity: 'S2', title: 'heuristic image approximation', blurb: 'continuous-tone source was simplified without semantic understanding' },
  L024: { severity: 'S2', title: 'symbol out of proportion', blurb: 'a shape is stretched until its silhouette no longer distinguishes it' },
  L025: { severity: 'S1', title: 'depth flattened onto one page', blurb: 'things at different depths share a page, so neither can pass behind the other' },
  // Composition rules. S3 by design: a taste heuristic must never outrank a real defect.
  C001: { severity: 'S3', title: 'sparse canvas', blurb: 'the page has so little ink that nothing was really composed' },
  ...FLOWCHART_RULES,
});

/**
 * Below this, an element is effectively not there to a reader — but it still
 * claims every quadrant it did at full opacity. That gap is the trap: fading
 * something is the intuitive way to "resolve" an overlap, and it resolves
 * nothing. Opacity is presentation; geometry is truth.
 */
export const INVISIBLE_OPACITY = 0.15;

/**
 * How far apart two things must be, in room inches, before their overlap is a
 * question of occlusion rather than of a flat drawing.
 *
 * Six inches is roughly the point where a viewer expects one object to pass in
 * front of another rather than to sit alongside it. Below that, a projected
 * scene is entitled to be flat — two cabinets against the same wall genuinely
 * are coplanar, and flagging them would make every elevation unbuildable.
 */
export const DEPTH_TOLERANCE_IN = 6;

/**
 * `extra` carries material for findings that name no actors and no quadrants.
 *
 * A composition finding is document-shaped, not element-shaped, so without something that
 * varies it would hash to a constant — and one acceptance would suppress it forever, which
 * is the exact failure this fingerprint exists to prevent. The separator is appended only
 * when `extra` is non-empty so every acceptance already on disk stays valid.
 */
export function fingerprintOf(rule, page, actors, cells, extra = '') {
  const base = [rule, page, [...actors].sort().join('+'), [...cells].sort().join(' ')].join('|');
  const material = extra ? `${base}|${extra}` : base;
  return createHash('sha256').update(material).digest('hex').slice(0, 12);
}

/**
 * The one findings factory. Exported so `composition.js` builds findings identically —
 * same severity lookup, same fingerprint construction — instead of growing a second shape.
 */
export function buildFinding(rule, page, { message, actors = [], cells = [], metrics = {}, fixes = [], extra = '' }) {
  const spec = RULES[rule];
  return {
    fingerprint: fingerprintOf(rule, page, actors, cells, extra),
    rule,
    severity: spec.severity,
    severityLabel: SEVERITY_LABEL[spec.severity],
    title: spec.title,
    page,
    message,
    actors,
    cells,
    cellSummary: cells.length ? summariseCells(cells) : null,
    metrics,
    fixes,
  };
}

// The ~20 rule call sites below were written against `finding`; keeping the short local
// alias means exporting the factory changed no existing line.
const finding = buildFinding;

function summariseCells(cells, limit = 8) {
  const unique = [...new Set(cells.map((c) => c.split('.')[0]))];
  return unique.length <= limit ? unique.join(' ') : `${unique.slice(0, limit).join(' ')} …+${unique.length - limit} more`;
}

const addrList = (keys, limit = 24) => {
  const list = [...keys].map((k) => { const { x, y } = parseQuadKey(k); return quadToAddress(x, y); });
  return list.sort().slice(0, limit);
};

const intersect = (a, b) => { const out = []; for (const k of a) if (b.has(k)) out.push(k); return out; };

function quadsForPixelRect(r) {
  const out = new Set();
  if (r.width <= 0 || r.height <= 0) return out;
  const x0 = Math.floor(r.x / 5);
  const y0 = Math.floor(r.y / 5);
  const x1 = Math.ceil((r.x + r.width) / 5);
  const y1 = Math.ceil((r.y + r.height) / 5);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.add(quadKey(x, y));
  return out;
}

/** The quadrants occupied by the exact text runs emitted by svg.js. */
function textQuads(doc, el) {
  const content = el.kind === 'text' ? el.text : el.label;
  if (!content) return new Set();
  const layout = layoutTextRuns(content, el.rect, {
    fontSize: el.fontSize,
    paddingQuads: el.kind === 'box' ? doc.font.paddingQuads : 0,
    align: el.align,
    verticalAlign: el.kind === 'box' ? 'center' : 'top',
  });
  const out = new Set();
  for (const run of layout.runs) for (const key of quadsForPixelRect(run)) out.add(key);
  return out;
}

/** Boxes and images paint their whole claim; paths and text paint their ink. */
function obscuringQuads(doc, el) {
  return el.kind === 'text' ? textQuads(doc, el) : elementClaimed(el);
}

// ---------------------------------------------------------------------------

/**
 * Run every rule.
 * @returns {{open:Array, accepted:Array, staleAcceptances:Array, summary:object}}
 */
export function validate(doc, { page = null } = {}) {
  const pages = page ? doc.pages.filter((p) => p.id === page) : doc.pages;
  const found = [];

  for (const p of pages) {
    found.push(...withinPage(doc, p));
    found.push(...againstLowerPages(doc, p));
  }
  found.push(...documentWide(doc, pages));
  // Document-wide, not per page: a sparse annotation overlay is part of a good diagram.
  found.push(...compositionFindings(doc, pages));
  found.push(...flowchartFindings(doc, pages));

  found.sort(
    (a, b) =>
      RANK[a.severity] - RANK[b.severity] ||
      a.rule.localeCompare(b.rule) ||
      a.page.localeCompare(b.page) ||
      (a.cells[0] ?? '').localeCompare(b.cells[0] ?? ''),
  );

  const accepted = new Map(doc.acceptances.map((a) => [a.fingerprint, a]));
  const open = [];
  const acknowledged = [];
  for (const f of found) {
    const hit = accepted.get(f.fingerprint);
    if (hit) acknowledged.push({ ...f, accepted: true, reason: hit.reason, acceptedAt: hit.acceptedAt });
    else open.push(f);
  }

  const live = new Set(found.map((f) => f.fingerprint));
  const stale = doc.acceptances.filter((a) => !live.has(a.fingerprint));

  const summary = { S0: 0, S1: 0, S2: 0, S3: 0, total: open.length, accepted: acknowledged.length, stale: stale.length };
  for (const f of open) summary[f.severity]++;
  summary.clean = summary.S0 === 0 && summary.S1 === 0 && summary.S2 === 0;
  summary.state = summary.S0 || summary.S1
    ? 'blocking-errors'
    : summary.S2
      ? 'needs-decisions'
      : 'structurally-clear';

  return { open, accepted: acknowledged, staleAcceptances: stale, summary };
}

// ---------------------------------------------------------------------------
// Rules confined to a single page
// ---------------------------------------------------------------------------

function withinPage(doc, p) {
  const out = [];
  const els = elementsOf(doc, p.id);
  const boxes = els.filter((e) => e.kind === 'box');
  const paths = els.filter((e) => e.kind === 'path');
  const solids = els.filter((e) => e.kind !== 'path');

  // L022 — a deterministic result can still be unreadable. Dense alternation
  // is the checkerboard failure mode: detail was reduced, but not simplified.
  for (const el of els.filter((entry) => entry.kind === 'image' && entry.mode !== 'embed')) {
    const stats = el.ditherStats ?? analyseRuns(el.runs, el.rect.w, el.rect.h);
    if (stats.transitionRatio <= MAX_READABLE_TRANSITION_RATIO) continue;
    const remedy = el.mode === 'dither'
      ? 'Use embed mode for photographic evidence, or prepare sparse high-contrast line art and place it again.'
      : 'Use lower simplify detail, a larger footprint, a clearer source, or embed mode when source fidelity matters.';
    out.push(
      finding('L022', p.id, {
        message:
          `${el.mode} image "${el.id}" changes ink state across ${(stats.transitionRatio * 100).toFixed(1)}% of neighbouring samples ` +
          `(limit ${(MAX_READABLE_TRANSITION_RATIO * 100).toFixed(0)}%). The checker pattern is likely to obscure the subject. ` +
          remedy,
        actors: [el.id],
        cells: [quadToAddress(el.rect.x, el.rect.y)],
        metrics: stats,
        fixes: [{
          kind: 'remove',
          description: el.mode === 'dither'
            ? `remove "${el.id}", simplify its source or choose embed mode, then place_image again`
            : `remove "${el.id}" and place it again with lower simplify detail, a larger span, or embed mode`,
          params: { id: el.id },
        }],
      }),
    );
  }

  // L023 — an algorithm can simplify contrast but cannot know the subject.
  // Near-binary source art has already made that semantic decision; a raw
  // continuous-tone image has not, so publication requires explicit review.
  for (const el of els.filter((entry) => entry.kind === 'image' && entry.mode === 'simplify' && entry.processing?.nearBinary === false)) {
    out.push(
      finding('L023', p.id, {
        message:
          `simplified image "${el.id}" came from continuous-tone source material. TurtlePen discarded texture by contrast and contour, ` +
          'but it cannot know which object or features matter. Perform a normal-size blind identity check, replace it with a purpose-built ' +
          'simplified derivative if the subject is unclear, or accept this exact result with the review outcome.',
        actors: [el.id],
        cells: [quadToAddress(el.rect.x, el.rect.y)],
        metrics: { ...el.ditherStats, processing: el.processing },
        fixes: [{
          kind: 'remove',
          description: `remove "${el.id}" and place a reviewed high-contrast derivative, or use embed mode when source fidelity matters`,
          params: { id: el.id },
        }],
      }),
    );
  }

  // L001 — solid overlap
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i], b = solids[j];
      // Bounding-box overlap is only a cheap pre-filter. What actually counts is
      // whether the two elements CLAIM any of the same quadrants — which for a
      // solid box is the same thing, but for a container is not: a lane claims
      // a ring and leaves its hole free, so a member sitting inside overlaps
      // its bounding box and collides with nothing.
      if (!rectsOverlap(a.rect, b.rect)) continue;
      const shared = new Set([...elementClaimed(a)].filter((k) => elementClaimed(b).has(k)));
      if (!shared.size) continue;
      const region = intersection(a.rect, b.rect);
      const cells = addrList(shared);
      out.push(
        finding('L001', p.id, {
          message: `"${a.id}" and "${b.id}" overlap over ${shared.size} quadrants at ${describeRegion(region)}`,
          actors: [a.id, b.id],
          cells,
          metrics: { overlapQuadrants: shared.size, overlapCells: { w: region.w / 2, h: region.h / 2 } },
          fixes: [
            { kind: 'move', description: `move "${b.id}" right by ${Math.ceil(region.w / 2)} cells to clear`, params: { id: b.id, dCellsX: Math.ceil(region.w / 2) } },
            { kind: 'move', description: `or move "${b.id}" down by ${Math.ceil(region.h / 2)} cells to clear`, params: { id: b.id, dCellsY: Math.ceil(region.h / 2) } },
          ],
        }),
      );
    }
  }

  // L007 — gutter
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (rectsOverlap(a.rect, b.rect)) continue;
      if (!rectsOverlap(expand(a.rect, 1), b.rect)) continue;
      out.push(
        finding('L007', p.id, {
          message: `"${a.id}" and "${b.id}" touch with no separating quadrant — the border reads as a single shape`,
          actors: [a.id, b.id],
          cells: [quadToCell(b.rect.x, b.rect.y)],
          metrics: { gapQuadrants: 0 },
          fixes: [{ kind: 'move', description: `separate them by at least 1 cell`, params: { id: b.id, minGapCells: 1 } }],
        }),
      );
    }
  }

  // L025 — depth flattened onto one page.
  //
  // Only elements that KNOW their depth are judged. A flowchart has no depth to
  // get wrong, and inventing one for it would make the rule an opinion. Depth
  // arrives from a projection, so this fires on exactly the scenes where
  // occlusion is a real question.
  const deep = els.filter((e) => Number.isFinite(e.depth));
  for (let i = 0; i < deep.length; i++) {
    for (let j = i + 1; j < deep.length; j++) {
      const a = deep[i], b = deep[j];
      const gap = Math.abs(a.depth - b.depth);
      if (gap < DEPTH_TOLERANCE_IN) continue;
      const shared = new Set([...elementClaimed(a)].filter((k) => elementClaimed(b).has(k)));
      if (!shared.size) continue;

      const [near, far] = a.depth < b.depth ? [a, b] : [b, a];
      const above = doc.pages.filter((q) => q.z > p.z).sort((x, y) => x.z - y.z)[0];
      const toPage = above?.id ?? `${p.id}-near`;
      out.push(
        finding('L025', p.id, {
          message: `"${near.id}" (${near.depth}in from the camera) and "${far.id}" (${far.depth}in) `
            + `overlap on page "${p.id}", ${gap}in apart in depth. This lattice has no z-buffer, so nothing here `
            + `can pass behind anything else — put "${near.id}" on a page above "${far.id}" and the occlusion becomes real.`,
          actors: [a.id, b.id],
          cells: addrList(shared),
          metrics: { near: near.id, far: far.id, gapIn: gap },
          fixes: [
            {
              // Not `move`: that kind means a distance in cells, and the repair
              // table builds it from one. Changing layer is its own action.
              kind: 'layer',
              description: above
                ? `move "${near.id}" onto the existing page "${toPage}", which already sits in front`
                : `add an overlay page "${toPage}" above "${p.id}", then move "${near.id}" onto it`,
              params: { id: near.id, toPage },
            },
          ],
        }),
      );
    }
  }

  // L024 — proportion. A symbol stretched past its limit is drawn exactly as
  // asked and still fails at the only job a shape has, which is to be
  // recognisable. Reported rather than corrected: the engine never resizes a
  // box the author placed.
  for (const b of boxes) {
    const spec = SHAPE_PROPORTION[b.shape];
    if (!spec) continue;
    const aspect = aspectOf(b.rect);
    if (aspect <= spec.maxAspect) continue;
    const wantH = Math.ceil(b.rect.w / spec.ideal);
    out.push(
      finding('L024', p.id, {
        message: `"${b.id}" is ${/^[aeiou]/.test(b.shape) ? 'an' : 'a'} ${b.shape} at ${aspect}:1, past the ${spec.maxAspect}:1 limit — `
          + `at this width its silhouette reads as a plain box. ${spec.ideal}:1 is the shape's natural proportion.`,
        actors: [b.id],
        cells: [quadToCell(b.rect.x, b.rect.y)],
        metrics: { shape: b.shape, aspect, maxAspect: spec.maxAspect, ideal: spec.ideal },
        fixes: [
          // `to` is the vocabulary the repair table builds from. Carrying the
          // change in `params` instead made both of these unexecutable: the
          // AI could read the advice and had no call to perform it.
          {
            kind: 'heighten',
            to: Math.ceil(wantH / 2),
            description: `grow "${b.id}" to ${b.rect.w / 2}x${Math.ceil(wantH / 2)} cells`,
          },
          {
            kind: 'shape',
            to: 'process',
            description: `or restyle "${b.id}" to a process box if the symbol is not carrying meaning`,
          },
        ],
      }),
    );
  }

  // L002 / L003 / L009 — text fit
  for (const b of boxes) {
    if (b.fontSize < MIN_LEGIBLE_FONT_PX) {
      out.push(
        finding('L009', p.id, {
          message: `"${b.id}" uses ${b.fontSize}px, below the ${MIN_LEGIBLE_FONT_PX}px legibility floor`,
          actors: [b.id],
          cells: [quadToCell(b.rect.x, b.rect.y)],
          metrics: { fontSize: b.fontSize, floor: MIN_LEGIBLE_FONT_PX },
          fixes: [{ kind: 'font', to: MIN_LEGIBLE_FONT_PX, description: `raise to ${MIN_LEGIBLE_FONT_PX}px and re-measure`, params: { id: b.id, fontSize: MIN_LEGIBLE_FONT_PX } }],
        }),
      );
    }
    const effective = (p.opacity ?? 1) * (b.opacity ?? 1);
    if (effective < INVISIBLE_OPACITY) {
      out.push(
        finding('L019', p.id, {
          message:
            `"${b.id}" renders at ${effective.toFixed(2)} effective opacity — below the ${INVISIBLE_OPACITY} legibility floor — ` +
            'but still claims every quadrant it would at full strength. Fading an element does not free the space it occupies.',
          actors: [b.id],
          cells: [quadToCell(b.rect.x, b.rect.y)],
          metrics: { effectiveOpacity: effective, pageOpacity: p.opacity ?? 1, elementOpacity: b.opacity ?? 1 },
          fixes: [
            { kind: 'remove', description: `remove "${b.id}" if it is not meant to be seen`, params: { id: b.id } },
            { kind: 'font', description: `raise its opacity to at least ${INVISIBLE_OPACITY}`, params: { id: b.id, opacity: INVISIBLE_OPACITY } },
          ],
        }),
      );
    }
    if (!b.label) continue;
    // Text is measured against the shape's usable interior, not its bounding
    // box. A diamond twice as wide as its label still overflows if the label
    // does not fit the diamond, and reporting otherwise would reintroduce the
    // overflow bug this engine exists to eliminate.
    const fit = fitReportForShape(b.label, b.rect, b.shape ?? 'process', { fontSize: b.fontSize, paddingQuads: doc.font.paddingQuads, align: b.align });
    const where = [quadToCell(b.rect.x, b.rect.y)];
    // L017 — centring that could not be exact. The leftover pixel always goes
    // left, so the drawing is deterministic; this is what says so out loud.
    if (fit.centerBiasPx > 0) {
      out.push(
        finding('L017', p.id, {
          message:
            `"${b.id}" label is centred with a ${fit.centerBiasPx}px bias to the left — the interior is ${fit.innerWidthPx}px ` +
            `and the text measures ${fit.measuredWidthPx}px, an odd difference that cannot be split evenly`,
          actors: [b.id],
          cells: where,
          metrics: { centerBiasPx: fit.centerBiasPx, innerWidthPx: fit.innerWidthPx, measuredWidthPx: fit.measuredWidthPx },
          fixes: [
            { kind: 'widen', to: Math.ceil((fit.measuredWidthPx + doc.font.paddingQuads * 10 + 1) / 10), description: 'widen the box by one cell so the difference is even' },
          ],
        }),
      );
    }
    if (fit.widthOverflowPx > 0) {
      out.push(
        finding('L002', p.id, {
          message:
            `"${b.id}" label "${b.label}" needs ${fit.requiredUnbrokenWidthPx}px of unbroken width but the interior is ${fit.innerWidthPx}px ` +
            `(${fit.charsPerLine} chars per line at ${b.fontSize}px) — over by ${fit.widthOverflowPx}px`,
          actors: [b.id],
          cells: where,
          metrics: {
            overflowPx: fit.widthOverflowPx,
            requiredUnbrokenWidthPx: fit.requiredUnbrokenWidthPx,
            measuredWidthPx: fit.measuredWidthPx,
            charsPerLine: fit.charsPerLine,
            advance: fit.advance,
            innerWidthPx: fit.innerWidthPx,
          },
          fixes: fit.fixes.filter((f) => f.kind !== 'heighten'),
        }),
      );
    }
    if (fit.heightOverflowPx > 0) {
      out.push(
        finding('L003', p.id, {
          message:
            `"${b.id}" label wraps to ${fit.lineCount} lines but only ${fit.visibleLines} fit — ` +
            `${fit.clippedLines} line(s) would be clipped`,
          actors: [b.id],
          cells: where,
          metrics: { lines: fit.lineCount, visibleLines: fit.visibleLines, clipped: fit.clippedLines, lineHeight: fit.lineHeight },
          fixes: fit.fixes.filter((f) => f.kind !== 'widen' || fit.widthOverflowPx === 0),
        }),
      );
    }
  }

  // L004 / L013 — strokes against boxes
  for (const path of paths) {
    const pq = elementClaimed(path);
    for (const b of boxes) {
      // A stroke label lives INSIDE the box it labels, on purpose. The author
      // said which box that is when they placed it, so this is authored fact —
      // the same kind of fact as a connector naming its origin — and not a
      // guess made from proximity. It exempts that ONE box: an inked label
      // sprawling across a different node is still exactly the defect L004
      // exists to catch.
      if (path.labels === b.id) continue;
      const body = elementVisual(b);
      const cut = shapeCutQuads(b.rect, b.shape ?? 'process', b.corner);
      const hitsBody = intersect(pq, body);
      const hitsCut = intersect(pq, cut);
      if (hitsBody.length) {
        out.push(
          finding('L004', p.id, {
            message: `path "${path.id}" runs through the body of "${b.id}" across ${hitsBody.length} quadrant(s)`,
            actors: [path.id, b.id],
            cells: addrList(hitsBody),
            metrics: { quadrants: hitsBody.length },
            fixes: [{ kind: 'reroute', description: `route around "${b.id}" — its claimed block is ${describeRegion(b.rect)}`, params: { avoid: b.id } }],
          }),
        );
      }
      if (hitsCut.length && !hitsBody.length) {
        out.push(
          finding('L013', p.id, {
            message: isContainer(b.shape)
              ? `path "${path.id}" runs through the interior of "${b.id}" — a container leaves its hole free, so nothing visibly touches`
              : `path "${path.id}" passes through the ${b.corner} corner cut of "${b.id}" — claimed but not inked, so nothing visibly touches`,
            actors: [path.id, b.id],
            cells: addrList(hitsCut),
            metrics: { quadrants: hitsCut.length, cornerStyle: b.corner },
            fixes: [],
          }),
        );
      }
    }
  }

  // L006 — stroke against stroke, excluding quadrants either path marked as a
  // deliberate hop. An intended crossing is not a defect.
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      const a = paths[i], b = paths[j];
      const hops = new Set(
        [...a.pieces, ...b.pieces].filter((piece) => piece.type === 'hop').map((piece) => quadKey(piece.x, piece.y)),
      );
      const shared = intersect(elementClaimed(a), elementClaimed(b)).filter((k) => !hops.has(k));
      if (!shared.length) continue;
      out.push(
        finding('L006', p.id, {
          message: `paths "${a.id}" and "${b.id}" share ${shared.length} quadrant(s) with no junction or hop — they will render as a merged line`,
          actors: [a.id, b.id],
          cells: addrList(shared),
          metrics: { quadrants: shared.length },
          fixes: [
            { kind: 'offset', description: 'shift one path to the opposite alignment within its cell (left/right or top/bottom)' },
            { kind: 'hop', description: 'or mark the crossing deliberate with a "hop" piece in one of the paths' },
          ],
        }),
      );
    }
  }

  // L008 — dangling endpoints, reported once per path rather than once per end.
  // A half-drawn connector otherwise generates two findings that say the same
  // thing, which is the kind of duplication that trains a reader to skim.
  const occupied = new Map();
  for (const el of els) for (const k of elementClaimed(el)) occupied.set(k, el.id);
  for (const path of paths) {
    // A closed shape has no loose ends by definition; its "ends" are the same
    // point. Reporting them was the single largest source of false findings.
    if (path.closed || path.role === 'artwork') continue;
    const loose = [];
    for (const [which, piece] of [['start', path.pieces[0]], ['end', path.pieces[path.pieces.length - 1]]]) {
      if (!piece) continue;
      const neighbours = [
        quadKey(piece.x + 1, piece.y), quadKey(piece.x - 1, piece.y),
        quadKey(piece.x, piece.y + 1), quadKey(piece.x, piece.y - 1),
      ];
      const meets = neighbours.map((k) => occupied.get(k)).filter((id) => id && id !== path.id);
      if (!meets.length) loose.push({ which, piece });
    }
    if (!loose.length) continue;
    const both = loose.length === 2;
    out.push(
      finding('L008', p.id, {
        message: both
          ? `path "${path.id}" touches nothing at either end (${quadToAddress(path.pieces[0].x, path.pieces[0].y)} and ${quadToAddress(path.pieces.at(-1).x, path.pieces.at(-1).y)}) — the connector is free-floating`
          : `path "${path.id}" ${loose[0].which}s at ${quadToAddress(loose[0].piece.x, loose[0].piece.y)} touching nothing — the connector leads nowhere`,
        actors: [path.id],
        cells: loose.map((l) => quadToAddress(l.piece.x, l.piece.y)),
        metrics: { looseEnds: loose.map((l) => l.which) },
        fixes: [
          { kind: 'extend', description: 'extend the path to a box port, e.g. "… line to <id>.W"', params: { id: path.id } },
          // Advice, not an action: which box to move, and how far, is the
          // author's decision. Calling it `move` made it look executable and
          // then refused for want of a distance it was never going to have.
          { kind: 'reposition', description: 'or move the box it should meet so the path reaches it' },
        ],
      }),
    );
  }

  // L016 — a path that named a destination but did not reach it.
  //
  // Checked on the FINISHED path rather than per command: targeting a box on an
  // intermediate leg is correct usage ("go right until level with it, then
  // turn"), so only the final endpoint can say whether the path arrived.
  for (const path of paths) {
    if (path.role === 'artwork') continue;
    const aim = path.targets?.at(-1);
    if (!aim) continue;
    const target = els.find((e) => e.id === aim.id);
    if (!target) continue;
    const tip = path.pieces.at(-1);
    const claimed = elementClaimed(target);
    const touches = [
      quadKey(tip.x + 1, tip.y), quadKey(tip.x - 1, tip.y),
      quadKey(tip.x, tip.y + 1), quadKey(tip.x, tip.y - 1),
      quadKey(tip.x, tip.y),
    ].some((k) => claimed.has(k));
    if (touches) continue;

    const gapX = tip.x < target.rect.x ? target.rect.x - tip.x : tip.x >= right(target.rect) ? tip.x - right(target.rect) + 1 : 0;
    const gapY = tip.y < target.rect.y ? target.rect.y - tip.y : tip.y >= bottom(target.rect) ? tip.y - bottom(target.rect) + 1 : 0;
    out.push(
      finding('L016', p.id, {
        message:
          `path "${path.id}" aimed at "${aim.id}.${aim.port}" but stops at ${quadToAddress(tip.x, tip.y)}, ` +
          `${gapX ? `${gapX} quadrant(s) sideways` : ''}${gapX && gapY ? ' and ' : ''}${gapY ? `${gapY} quadrant(s) short` : ''} of it. ` +
          '"to" sets the distance along the way you are travelling, not the track you travel on — a run on the wrong row or column stops level with its target without touching it.',
        actors: [path.id, aim.id],
        cells: [quadToAddress(tip.x, tip.y)],
        metrics: { gapQuadrantsX: gapX, gapQuadrantsY: gapY, target: `${aim.id}.${aim.port}`, step: aim.step },
        fixes: [
          { kind: 'extend', description: `add a corner and a final leg onto ${aim.id}'s track`, params: { id: path.id } },
          { kind: 'reroute', description: `or start the run with "pen from ${aim.id}.<face>" and draw back the other way`, params: { id: path.id } },
        ],
      }),
    );
  }

  // L014 / L015 — notes carried over from pen execution
  for (const path of paths) {
    for (const note of path.penNotes ?? []) {
      if (path.role === 'artwork' && note.code === 'L015') continue;
      out.push(
        finding(note.code, p.id, {
          message: `path "${path.id}" — ${note.message}`,
          actors: [path.id],
          cells: note.at ? [note.at] : [],
          metrics: { step: note.step },
          fixes: note.code === 'L016'
            ? [{ kind: 'reroute', description: 'redraw the run on the target\'s track, or begin it with "pen from <id>.<port>"', params: { id: path.id } }]
            : [],
        }),
      );
    }
  }

  // L011 — canvas bounds
  const maxX = doc.canvas.cols * 2, maxY = doc.canvas.rows * 2;
  for (const el of els) {
    for (const r of elementRects(el)) {
      if (r.x < 0 || r.y < 0 || right(r) > maxX || bottom(r) > maxY) {
        out.push(
          finding('L011', p.id, {
            message: `"${el.id}" extends past the declared canvas (${doc.canvas.cols}x${doc.canvas.rows} cells) at ${quadToAddress(r.x, r.y)}`,
            actors: [el.id],
            cells: [quadToAddress(r.x, r.y)],
            metrics: { canvas: doc.canvas },
            fixes: [{ kind: 'canvas', description: `grow the canvas, or move "${el.id}" inside it` }],
          }),
        );
        break;
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Cross-page rules — where the page's declared intent decides the severity
// ---------------------------------------------------------------------------

function againstLowerPages(doc, p) {
  const out = [];
  const mine = elementsOf(doc, p.id);
  if (!mine.length) return out;

  for (const lower of doc.pages.filter((q) => q.z < p.z && !q.reference)) {
    for (const a of mine) {
      const aq = elementClaimed(a);
      for (const b of elementsOf(doc, lower.id)) {
        const shared = intersect(aq, elementClaimed(b));
        if (!shared.length) continue;
        const overlay = p.intent === 'overlay';
        out.push(
          finding(overlay ? 'L010' : 'L005', p.id, {
            message: overlay
              ? `"${a.id}" (z:${p.z}, overlay) covers "${b.id}" on page "${lower.id}" (z:${lower.z}) over ${shared.length} quadrant(s) — expected for an overlay`
              : `"${a.id}" on exclusive page "${p.id}" (z:${p.z}) overlaps "${b.id}" on "${lower.id}" (z:${lower.z}) over ${shared.length} quadrant(s)`,
            actors: [a.id, b.id],
            cells: addrList(shared),
            metrics: { quadrants: shared.length, zAbove: p.z, zBelow: lower.z, intent: p.intent },
            fixes: overlay
              ? []
              : [
                  { kind: 'intent', description: `declare page "${p.id}" as an overlay if this stacking is deliberate`, params: { page: p.id, intent: 'overlay' } },
                  { kind: 'move', description: `or move "${a.id}" clear of "${b.id}"`, params: { id: a.id } },
                ],
          }),
        );

        const obscured = overlay ? intersect(obscuringQuads(doc, a), textQuads(doc, b)) : [];
        if (obscured.length) {
          out.push(
            finding('L021', p.id, {
              message: `"${a.id}" on overlay page "${p.id}" obscures text in "${b.id}" over ${obscured.length} quadrant(s)`,
              actors: [a.id, b.id],
              cells: addrList(obscured),
              metrics: { quadrants: obscured.length, zAbove: p.z, zBelow: lower.z },
              fixes: [{ kind: 'move', description: `move "${a.id}" clear of the text in "${b.id}"`, params: { id: a.id } }],
            }),
          );
        }
      }
    }
  }
  return out;
}

function documentWide(doc, pages) {
  const out = [];

  // L020 — a tracing reference is still in the document.
  //
  // An underlay is scaffolding: it exists to be drawn over and then removed.
  // Forgetting it is easy, because at 0.25 opacity it looks like part of the
  // drawing rather than a mistake. This is the one thing the tracing workflow
  // needs the engine to remember, so it warns rather than trusting a habit.
  for (const p of pages) {
    if (!p.reference) continue;
    out.push(
      finding('L020', p.id, {
        message:
          `page "${p.id}" is a tracing reference and is still in the document. It was laid down to draw over, ` +
          'not to ship — remove it before this becomes artwork.',
        actors: [p.id],
        cells: [],
        metrics: { z: p.z, opacity: p.opacity },
        fixes: [{ kind: 'remove_page', description: `remove the page: remove_page { id: "${p.id}" }`, params: { id: p.id } }],
      }),
    );
  }

  const seen = new Map();
  for (const p of pages) {
    for (const el of elementsOf(doc, p.id)) {
      if (seen.has(el.id)) {
        out.push(
          finding('L012', p.id, {
            message: `id "${el.id}" is used on both "${seen.get(el.id)}" and "${p.id}" — targets like "to ${el.id}.W" become ambiguous`,
            actors: [el.id],
            cells: [],
            fixes: [{ kind: 'rename', description: `rename one of them` }],
          }),
        );
      } else seen.set(el.id, p.id);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** The collision log, as text. This is what the AI reads. */
export function formatLog(result, { showAccepted = true, showFixes = true } = {}) {
  const lines = [];
  const s = result.summary;
  lines.push(
    `collision log — ${s.total} open  ` +
      `(${s.S0} critical, ${s.S1} error, ${s.S2} warn, ${s.S3} info)` +
      `${s.accepted ? `, ${s.accepted} accepted` : ''}${s.stale ? `, ${s.stale} stale acceptance(s)` : ''}`,
  );
  lines.push(s.clean
    ? '  status: CLEAN — STRUCTURALLY CLEAR; no unresolved critical, error, or decision findings'
    : `  status: NOT CLEAN — ${s.state === 'needs-decisions' ? 'NEEDS DECISIONS' : 'BLOCKING ERRORS'}`);
  lines.push('');

  for (const f of result.open) {
    lines.push(`[${f.severityLabel.padEnd(8)}] ${f.rule} ${f.title}  page:${f.page}  #${f.fingerprint}`);
    lines.push(`             ${f.message}`);
    if (f.cellSummary) lines.push(`             at: ${f.cellSummary}`);
    if (showFixes) for (const fix of f.fixes) lines.push(`             fix: ${fix.description}`);
    lines.push('');
  }

  if (showAccepted && result.accepted.length) {
    lines.push('accepted as intentional:');
    for (const f of result.accepted) lines.push(`  [${f.rule}] #${f.fingerprint} ${f.message}  — "${f.reason}"`);
    lines.push('');
  }
  if (result.staleAcceptances.length) {
    lines.push('stale acceptances (geometry changed, acceptance no longer applies):');
    for (const a of result.staleAcceptances) {
      const identity = [a.rule, a.page ? `page:${a.page}` : null].filter(Boolean).join(' ') || 'recorded finding';
      lines.push(`  #${a.fingerprint} ${identity} — "${a.reason}"`);
    }
  }
  return lines.join('\n').trimEnd();
}
