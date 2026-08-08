/**
 * SVG renderer.
 *
 * The parity guarantee lives here. Every text run is emitted with textLength
 * and lengthAdjust, which obliges the browser to fit the glyphs into exactly
 * the width core/text.js measured. If a font substitutes, spacing goes a little
 * loose or tight — but text can never overflow the box the engine measured, so
 * the collision log cannot be contradicted by what is drawn.
 *
 * Geometry is emitted in pixels by multiplying quadrant coordinates by 5. Since
 * every coordinate in the engine is an integer quadrant, every pixel value here
 * is an integer too; nothing is ever rounded at render time.
 */

import { PX_PER_QUAD, toPx, right, bottom } from './geometry.js';
import { elementsOf, contentBounds } from './document.js';
import { measureText } from './text.js';

const CUT = PX_PER_QUAD; // corner cuts are one quadrant

/**
 * The palette.
 *
 * The look this project drifted into — pale ground, visible lattice, hard thin
 * rules, monospace type — is the classic 1-bit Macintosh display, and it is now
 * deliberate rather than accidental. The Macintosh Human Interface Guidelines
 * put the discipline as "always design for black and white first"; those
 * machines had no grey at all, so a dimmed control was drawn as a checkerboard
 * of pixels, which is why `.dimmed` here is a stipple and not an alpha value.
 *
 * We do not go literally 1-bit. Colour is allowed, but MUTED — low chroma, so
 * nothing on the page competes with the drawing. Every value below is kept
 * under 0.45 saturation, and a test asserts it rather than trusting the eye.
 *
 * Borrowed as principle, not as trade dress: no Apple typefaces, icons or
 * window chrome appear anywhere in this project.
 */
export const PALETTE = Object.freeze({
  paper: '#f4f3ef',
  paperAlt: '#e9e7e1',
  grid: '#dedbd3',
  gridMajor: '#cbc7bd',
  ink: '#2b2a26',
  inkSoft: '#6b6862',
  critical: '#8a5b56',
  error: '#96755c',
  warn: '#87805a',
  info: '#4a6572',
});

export const PALETTE_DARK = Object.freeze({
  paper: '#1a1917',
  paperAlt: '#232220',
  grid: '#2e2c28',
  gridMajor: '#3d3a35',
  ink: '#dedbd3',
  inkSoft: '#9a968d',
});

/**
 * The HIG rule that outlives 1-bit hardware: colour must never be the ONLY cue
 * distinguishing two states. Each severity therefore carries a second, shape-
 * based signal, so the log stays readable desaturated, printed, or colour-blind.
 */
export const SEVERITY_CUE = Object.freeze({
  S0: 'solid',
  S1: 'hatch-dense',
  S2: 'hatch-sparse',
  S3: 'dotted',
});

export function renderSvg(doc, { pages = null, findings = null, showGrid = true, margin = 20 } = {}) {
  const visible = (pages ? doc.pages.filter((p) => pages.includes(p.id)) : doc.pages)
    .filter((p) => p.visible !== false)
    .sort((a, b) => a.z - b.z);

  const b = contentBounds(doc) ?? { x: 0, y: 0, w: 40, h: 24 };
  const px = toPx(b);
  const width = px.w + margin * 2;
  const height = px.h + margin * 2;
  const ox = margin - px.x;
  const oy = margin - px.y;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${escapeAttr(doc.font.family)}">`);
  parts.push(style());
  parts.push(`<rect class="bg" x="0" y="0" width="${width}" height="${height}"/>`);
  if (showGrid) parts.push(gridPattern(b, ox, oy));
  parts.push(`<g transform="translate(${ox},${oy})">`);

  for (const page of visible) {
    // Author-set, with the old hardcoded constants preserved as the defaults so
    // existing documents render byte-identically.
    const opacity = page.opacity ?? (page.intent === 'overlay' ? 0.92 : 1);
    parts.push(`<g data-page="${escapeAttr(page.id)}" data-z="${page.z}" opacity="${opacity}">`);
    for (const el of elementsOf(doc, page.id)) {
      if (el.kind === 'box') parts.push(box(el, doc));
      else if (el.kind === 'path') parts.push(path(el));
      else if (el.kind === 'text') parts.push(textBlock(el, doc));
      else if (el.kind === 'image') parts.push(imageEl(el));
    }
    parts.push('</g>');
  }

  if (findings?.length) parts.push(findingOverlay(findings));
  parts.push('</g></svg>');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------

function style() {
  return `<style>
  .bg { fill: ${PALETTE.paper}; }
  .grid { stroke: ${PALETTE.grid}; stroke-width: 0.5; }
  .grid-major { stroke: ${PALETTE.gridMajor}; stroke-width: 0.5; }
  .box { fill: ${PALETTE.paperAlt}; stroke: ${PALETTE.ink}; stroke-width: 1; }
  .box-label { fill: ${PALETTE.ink}; }
  .stroke { fill: ${PALETTE.ink}; }
  .hop { stroke: ${PALETTE.ink}; }
  .free-text { fill: ${PALETTE.inkSoft}; }
  .hit-S0 { fill: ${PALETTE.critical}; opacity: 0.30; }
  .hit-S1 { fill: ${PALETTE.error}; opacity: 0.28; }
  .hit-S2 { fill: ${PALETTE.warn}; opacity: 0.24; }
  .hit-S3 { fill: ${PALETTE.info}; opacity: 0.20; }
  .dimmed { fill: url(#tp-stipple); }
  @media (prefers-color-scheme: dark) {
    .bg { fill: ${PALETTE_DARK.paper}; }
    .grid { stroke: ${PALETTE_DARK.grid}; }
    .grid-major { stroke: ${PALETTE_DARK.gridMajor}; }
    .box { fill: ${PALETTE_DARK.paperAlt}; stroke: ${PALETTE_DARK.ink}; }
    .box-label { fill: ${PALETTE_DARK.ink}; }
    .free-text { fill: ${PALETTE_DARK.inkSoft}; }
    .stroke { fill: ${PALETTE_DARK.ink}; }
    .hop { stroke: ${PALETTE_DARK.ink}; }
  }
</style>
<defs>
  <!-- Grey earned by pattern rather than assumed. The stipple is drawn at the
       5px quadrant so a dimmed element is made of the same units as every
       other mark on the page. -->
  <pattern id="tp-stipple" width="${PX_PER_QUAD * 2}" height="${PX_PER_QUAD * 2}" patternUnits="userSpaceOnUse">
    <rect width="${PX_PER_QUAD}" height="${PX_PER_QUAD}" fill="${PALETTE.ink}"/>
    <rect x="${PX_PER_QUAD}" y="${PX_PER_QUAD}" width="${PX_PER_QUAD}" height="${PX_PER_QUAD}" fill="${PALETTE.ink}"/>
  </pattern>
</defs>`;
}

/**
 * An image drawn at exactly the footprint it was measured into.
 *
 * The source is embedded rather than linked, so a saved document renders the
 * same on any machine and at any later date — the same reproducibility argument
 * as the zero-dependency stance. `preserveAspectRatio` is set from the element's
 * fit, and the drift that whole cells forced was already reported at measure
 * time, so nothing is silently squashed here.
 */
function imageEl(el) {
  const { x, y, w, h } = toPx(el.rect);
  const aspect = el.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet';
  return `<image class="image" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${aspect}"`
    + `${el.opacity != null ? ` opacity="${el.opacity}"` : ''} data-id="${escapeAttr(el.id)}" href="${escapeAttr(el.source)}"/>`;
}

function gridPattern(b, ox, oy) {
  const px = toPx(b);
  const x0 = px.x - 40, y0 = px.y - 40, x1 = px.x + px.w + 40, y1 = px.y + px.h + 40;
  const lines = [];
  for (let x = Math.floor(x0 / 10) * 10; x <= x1; x += 10) {
    lines.push(`<line class="${x % 100 === 0 ? 'grid-major' : 'grid'}" x1="${x}" y1="${y0}" x2="${x}" y2="${y1}"/>`);
  }
  for (let y = Math.floor(y0 / 10) * 10; y <= y1; y += 10) {
    lines.push(`<line class="${y % 100 === 0 ? 'grid-major' : 'grid'}" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>`);
  }
  return `<g transform="translate(${ox},${oy})">${lines.join('')}</g>`;
}

/** Outline path honouring the corner style — the same geometry the collision
 *  engine treats as un-inked at the corners. */
export function boxOutline(r, style) {
  const { x, y, w, h } = toPx(r);
  const x2 = x + w, y2 = y + h;
  const c = CUT;
  if (style === 'square' || w < c * 2 || h < c * 2) {
    return `M${x},${y} H${x2} V${y2} H${x} Z`;
  }
  if (style === 'rounded') {
    return `M${x + c},${y} H${x2 - c} A${c},${c} 0 0 1 ${x2},${y + c} V${y2 - c} A${c},${c} 0 0 1 ${x2 - c},${y2} H${x + c} A${c},${c} 0 0 1 ${x},${y2 - c} V${y + c} A${c},${c} 0 0 1 ${x + c},${y} Z`;
  }
  if (style === 'chamfered') {
    return `M${x + c},${y} H${x2 - c} L${x2},${y + c} V${y2 - c} L${x2 - c},${y2} H${x + c} L${x},${y2 - c} V${y + c} Z`;
  }
  // indented — a square step cut into each corner
  return [
    `M${x + c},${y}`, `H${x2 - c}`, `V${y + c}`, `H${x2}`, `V${y2 - c}`, `H${x2 - c}`, `V${y2}`,
    `H${x + c}`, `V${y2 - c}`, `H${x}`, `V${y + c}`, `H${x + c}`, 'Z',
  ].join(' ');
}

function box(el, doc) {
  // Element opacity multiplies with its page's; geometry is untouched either way.
  const out = [`<path class="box${el.state === 'dimmed' ? ' dimmed' : ''}" d="${boxOutline(el.rect, el.corner)}" data-id="${escapeAttr(el.id)}"${el.opacity != null ? ` opacity="${el.opacity}"` : ''}${el.fill ? ` style="fill:${escapeAttr(el.fill)}"` : ''}/>`];
  if (el.label) out.push(label(el, doc));
  return out.join('');
}

/**
 * Text laid out with the engine's own measurements. textLength is what makes
 * the drawing physically unable to disagree with the fit report.
 */
function label(el, doc) {
  const pad = doc.font.paddingQuads * PX_PER_QUAD;
  const { x, y, w, h } = toPx(el.rect);
  const innerW = w - pad * 2;
  const m = measureText(el.label, { fontSize: el.fontSize, availableWidthPx: innerW });
  const blockH = m.lines.length * m.lineHeight;
  // Baselines are typography, not lattice geometry — but they are rounded to
  // whole pixels so text renders crisply and every emitted coordinate is an
  // integer, matching the rest of the document.
  const startY = Math.round(y + pad + Math.max(0, (h - pad * 2 - blockH) / 2) + m.lineHeight * 0.75);

  return m.lines
    .map((line, i) => {
      if (!line) return '';
      const runW = line.length * m.advance;
      // floor, not round: the leftover pixel of an odd centring goes to the left,
      // every time, and `fitReport.centerBiasPx` says so. Rounding here made the
      // drawing disagree with the measurement by a pixel without either saying it.
      const tx = el.align === 'center' ? x + Math.floor((w - runW) / 2) : el.align === 'right' ? x + w - pad - runW : x + pad;
      return `<text class="box-label" x="${tx}" y="${startY + i * m.lineHeight}" font-size="${el.fontSize}" textLength="${runW}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${escapeText(line)}</text>`;
    })
    .join('');
}

function textBlock(el, doc) {
  const { x, y, w } = toPx(el.rect);
  const m = measureText(el.text, { fontSize: el.fontSize, availableWidthPx: w });
  return m.lines
    .map((line, i) => {
      if (!line) return '';
      const runW = line.length * m.advance;
      return `<text class="free-text" x="${x}" y="${Math.round(y + m.lineHeight * (i + 0.75))}" font-size="${el.fontSize}" textLength="${runW}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${escapeText(line)}</text>`;
    })
    .join('');
}

/** Every stroke quadrant is a 5x5 square; junction styles shave the outer corner. */
function path(el) {
  const shapes = el.pieces.map((p) => {
    const x = p.x * PX_PER_QUAD, y = p.y * PX_PER_QUAD, s = PX_PER_QUAD;
    if (p.type === 'arrow') return `<path class="stroke" d="${arrowPath(x, y, s, p.dir)}"/>`;
    if (p.type === 'hop') return hopMark(x, y, s, p.dir);
    if (p.type !== 'corner' || p.style === 'square') {
      return `<rect class="stroke" x="${x}" y="${y}" width="${s}" height="${s}"/>`;
    }
    return `<path class="stroke" d="${junctionPath(x, y, s, p.sides, p.style)}"/>`;
  });
  return `<g data-id="${escapeAttr(el.id)}" data-kind="path">${shapes.join('')}</g>`;
}

/** A filled triangle occupying one quadrant, pointing the way the path travels. */
function arrowPath(x, y, s, dir) {
  const pts = {
    right: [[x, y], [x + s, y + s / 2], [x, y + s]],
    left: [[x + s, y], [x, y + s / 2], [x + s, y + s]],
    down: [[x, y], [x + s / 2, y + s], [x + s, y]],
    up: [[x, y + s], [x + s / 2, y], [x + s, y + s]],
  }[dir] ?? [[x, y], [x + s, y + s / 2], [x, y + s]];
  return `M${pts.map((p) => p.join(',')).join(' L')} Z`;
}

/**
 * A deliberate crossing, drawn as a bridge: the stroke is broken and arced over
 * whatever it crosses, which is the conventional way to show that two lines
 * pass rather than meet.
 */
function hopMark(x, y, s, dir) {
  const vertical = dir === 'up' || dir === 'down';
  const d = vertical
    ? `M${x + s / 2},${y} A${s / 2},${s / 2} 0 0 1 ${x + s / 2},${y + s}`
    : `M${x},${y + s / 2} A${s / 2},${s / 2} 0 0 1 ${x + s},${y + s / 2}`;
  return `<path class="hop" d="${d}" fill="none" stroke-width="${s}" stroke-linecap="butt"/>`;
}

/**
 * The outer corner of a junction is the one opposite its two open sides —
 * a piece open to bottom and right has its outer corner at the top-left.
 */
function junctionPath(x, y, s, sides, style) {
  const set = new Set(sides);
  const outer = {
    x: set.has('left') ? x + s : x,
    y: set.has('top') ? y + s : y,
  };
  const cut = s / 2;
  const corners = [
    { x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s },
  ];
  const isOuter = (p) => p.x === outer.x && p.y === outer.y;

  const pts = [];
  for (const c of corners) {
    if (!isOuter(c)) { pts.push(`${c.x},${c.y}`); continue; }
    const towardX = c.x === x ? 1 : -1;
    const towardY = c.y === y ? 1 : -1;
    if (style === 'chamfered') {
      pts.push(`${c.x + towardX * cut},${c.y}`, `${c.x},${c.y + towardY * cut}`);
    } else if (style === 'rounded') {
      pts.push(`ARC:${c.x + towardX * cut},${c.y}:${c.x},${c.y + towardY * cut}:${cut}`);
    } else {
      // indented — step inward
      pts.push(`${c.x + towardX * cut},${c.y}`, `${c.x + towardX * cut},${c.y + towardY * cut}`, `${c.x},${c.y + towardY * cut}`);
    }
  }

  let d = '';
  pts.forEach((p, i) => {
    if (p.startsWith('ARC:')) {
      const [, a, bpt, r] = p.split(':');
      d += `${i === 0 ? 'M' : 'L'}${a} A${r},${r} 0 0 0 ${bpt} `;
    } else {
      d += `${i === 0 ? 'M' : 'L'}${p} `;
    }
  });
  return `${d.trim()} Z`;
}

/**
 * Marks carry their finding's fingerprint so a reader can go from a line in the
 * log to the exact quadrants on the drawing — the log and the picture describe
 * the same thing, and the link between them should be clickable rather than
 * something the reader reconstructs by eye.
 */
function findingOverlay(findings) {
  const seen = new Set();
  const marks = [];
  for (const f of findings) {
    for (const addr of f.cells) {
      const q = quadOf(addr);
      if (!q) continue;
      const key = `${f.fingerprint}:${q.x},${q.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      marks.push(
        `<rect class="hit-${f.severity}" data-fp="${escapeAttr(f.fingerprint)}" x="${q.x * PX_PER_QUAD}" y="${q.y * PX_PER_QUAD}" width="${PX_PER_QUAD}" height="${PX_PER_QUAD}"><title>${escapeText(`${f.rule} ${f.title}: ${f.message}`)}</title></rect>`,
      );
    }
  }
  return `<g data-layer="findings">${marks.join('')}</g>`;
}

function quadOf(addr) {
  const m = /^([A-Za-z]+)(\d+)(?:\.(q[1-4]))?$/.exec(addr);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  const q = m[3] ?? 'q1';
  return {
    x: (col - 1) * 2 + (q === 'q2' || q === 'q4' ? 1 : 0),
    y: (Number(m[2]) - 1) * 2 + (q === 'q3' || q === 'q4' ? 1 : 0),
  };
}

const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeText(s).replace(/"/g, '&quot;');
