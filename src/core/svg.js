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
import { elementsOf, contentBounds, microMasksOf } from './document.js';
import { shapeTextRect, isContainer, containerBand, capQuads, skewQuads } from './shapes.js';
import { treatmentFor } from './roles.js';
import { layoutTextRuns } from './text.js';
import { generatedKey, resolveView, styleForElement } from './workspace.js';

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
  // One accent, deliberately. A second competing hue does not add emphasis, it
  // removes it from the first — which is why L026 can count focal marks at all.
  accent: '#b47868',
  link: '#556c8c',
  critical: '#8a5b56',
  error: '#96755c',
  warn: '#87805a',
  info: '#4a6572',
});

export const PALETTE_DARK = Object.freeze({
  paper: '#1a1917',
  paperAlt: '#232220',
  accent: '#d19a86',
  link: '#7f9ac0',
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

export function renderSvg(doc, {
  pages = null, findings = null, showGrid = true, margin = 20, bounds = 'content',
  view = null, title = null, description = null, showKey = null,
} = {}) {
  const resolved = resolveView(doc, view);
  const selected = resolved.elementIds;
  const selectedPages = pages ?? (resolved.view?.pages.length ? resolved.view.pages : null);
  const visible = (selectedPages ? doc.pages.filter((p) => selectedPages.includes(p.id)) : doc.pages)
    .filter((p) => p.visible !== false)
    .sort((a, b) => a.z - b.z);

  if (!['content', 'canvas'].includes(bounds)) throw new SyntaxError(`SVG bounds must be "content" or "canvas" — got ${JSON.stringify(bounds)}`);
  if (!Number.isInteger(margin) || margin < 0) throw new RangeError(`SVG margin must be a whole non-negative pixel count — got ${JSON.stringify(margin)}`);
  const projected = view == null ? doc : {
    ...doc,
    elements: Object.fromEntries(doc.pages.map((page) => [page.id, elementsOf(doc, page.id).filter((element) => selected.has(element.id))])),
  };
  const b = bounds === 'canvas'
    ? { x: 0, y: 0, w: doc.canvas.cols * 2, h: doc.canvas.rows * 2 }
    : contentBounds(projected) ?? { x: 0, y: 0, w: 40, h: 24 };
  const px = toPx(b);
  const key = (showKey ?? resolved.view?.showKey ?? false) ? generatedKey(doc, view) : null;
  const keyWidth = key?.entries.length ? 180 : 0;
  const width = px.w + margin * 2 + keyWidth;
  const height = px.h + margin * 2;
  const ox = margin - px.x;
  const oy = margin - px.y;

  const parts = [];
  const titleText = title ?? resolved.view?.title ?? doc.name;
  const descriptionText = description ?? resolved.view?.description
    ?? `${resolved.elements.length} diagram elements across ${visible.length} visible page(s)`;
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${escapeAttr(doc.font.family)}" role="img" aria-labelledby="tp-title tp-desc">`);
  parts.push(`<title id="tp-title">${escapeText(titleText)}</title>`);
  parts.push(`<desc id="tp-desc">${escapeText(descriptionText)}</desc>`);
  parts.push(`<metadata>${escapeText(JSON.stringify({ schema: doc.schema, name: doc.name, view: view ?? null, elements: resolved.elements.length }))}</metadata>`);
  const semanticRoles = [...new Set(
    projected.pages.flatMap((page) => elementsOf(projected, page.id))
      // Paths also use a separate execution role vocabulary (artwork,
      // connector, label). Only box roles resolve through NODE_ROLES.
      .filter((element) => element.kind === 'box')
      .map((element) => element.role)
      .filter((role) => role && role !== 'plain'),
  )].sort();
  parts.push(style(doc.background ?? null, gradients(projected), microMaskDefs(projected), doc.theme?.tokens, semanticRoles));
  parts.push(`<rect class="bg" x="0" y="0" width="${width}" height="${height}"/>`);
  if (showGrid) parts.push(gridPattern(b, ox, oy));
  parts.push(`<g transform="translate(${ox},${oy})">`);

  for (const page of visible) {
    // Author-set, with the old hardcoded constants preserved as the defaults so
    // existing documents render byte-identically.
    const opacity = page.opacity ?? (page.intent === 'overlay' ? 0.92 : 1);
    parts.push(`<g data-page="${escapeAttr(page.id)}" data-z="${page.z}" opacity="${opacity}">`);
    for (const el of elementsOf(doc, page.id).filter((element) => selected.has(element.id))) {
      const masked = microMasksOf(doc).some((mask) => mask.target === el.id);
      const themeStyle = styleForElement(doc, el, resolved.view?.perspective ?? null);
      const accessible = elementAccessibleLabel(el, resolved.relationshipOrder.get(el.id));
      parts.push(`<g data-element="${escapeAttr(el.id)}" role="group" aria-label="${escapeAttr(accessible)}"${masked ? ` mask="url(#tp-mask-${escapeAttr(el.id)})"` : ''}>`);
      if (el.kind === 'box') parts.push(box(el, doc, themeStyle));
      else if (el.kind === 'path') parts.push(path(el, themeStyle, resolved.relationshipOrder.get(el.id)));
      else if (el.kind === 'text') parts.push(textBlock(el, doc, themeStyle));
      else if (el.kind === 'image') parts.push(imageEl(el));
      parts.push('</g>');
    }
    parts.push('</g>');
  }

  if (findings?.length) parts.push(findingOverlay(findings));
  parts.push('</g>');
  if (key?.entries.length) parts.push(renderGeneratedKey(key, px.w + margin * 2, margin));
  parts.push('</svg>');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------

function elementAccessibleLabel(element, order = null) {
  if (element.relationship) {
    const prefix = order ? `Step ${order}. ` : '';
    const meaning = element.description ? `. ${element.description}` : '';
    return `${prefix}Relationship ${element.id}, from ${element.relationship.from.id} to ${element.relationship.to.id}${meaning}`;
  }
  const content = element.label ?? element.text ?? element.description ?? '';
  return `${element.kind} ${element.id}${content ? `: ${content}` : ''}`;
}

function renderGeneratedKey(key, x, y) {
  const out = [`<g class="generated-key" role="group" aria-label="${escapeAttr(key.title)}" transform="translate(${x + 12},${y})">`];
  const titleWidth = Math.max(1, key.title.length * 6);
  out.push(`<text class="key-title" x="0" y="10" font-size="10" textLength="${titleWidth}" lengthAdjust="spacingAndGlyphs">${escapeText(key.title)}</text>`);
  key.entries.forEach((entry, index) => {
    const yy = 24 + index * 18;
    const paint = entry.fill ?? PALETTE.paperAlt;
    const stroke = entry.stroke ?? PALETTE.ink;
    out.push(`<rect x="0" y="${yy - 10}" width="12" height="12" fill="${escapeAttr(paint)}" stroke="${escapeAttr(stroke)}"/>`);
    out.push(`<text class="key-label" x="18" y="${yy}" font-size="10" textLength="${Math.max(1, entry.label.length * 6)}" lengthAdjust="spacingAndGlyphs">${escapeText(entry.label)}</text>`);
  });
  out.push('</g>');
  return out.join('');
}

/**
 * One `<linearGradient>` per box that asked for one, keyed by element id.
 *
 * Emitted as defs rather than inline because SVG has nowhere else to put a
 * gradient, and keyed by id so a box and its fill can never drift apart.
 */
/**
 * A flat hex paints directly; a gradient points at the def built for this box.
 *
 * Emitted as an INLINE STYLE, not a `fill` attribute. The stylesheet carries
 * `.box { fill: ... }`, and a CSS rule beats a presentation attribute — a
 * gradient set as an attribute renders as the flat default and looks like the
 * feature is broken.
 */
function fillAttr(el, themed = {}) {
  // Precedence: an explicit fill, then a theme rule, then the semantic role.
  // Roles live in the generated stylesheet so dark-mode and document-token
  // palettes can resolve them. Inline author/theme decisions still win.
  const value = el.fill ?? themed.fill ?? null;
  const declarations = [];
  if (value) declarations.push(`fill:${escapeAttr(typeof value === 'string' ? value : `url(#tp-grad-${el.id})`)}`);
  const stroke = themed.stroke ?? null;
  if (stroke) declarations.push(`stroke:${escapeAttr(stroke)}`);
  if (themed.stroke && ['optional', 'security'].includes(el.role)) declarations.push('stroke-dasharray:none');
  return declarations.length ? ` style="${declarations.join(';')}"` : '';
}

function roleStyles(palette, roles, indent = '  ') {
  return roles
    .map((role) => {
      const treatment = treatmentFor(role, palette);
      const declarations = [`fill: ${treatment.fill}`, `stroke: ${treatment.stroke}`];
      if (treatment.dash) declarations.push(`stroke-dasharray: ${treatment.dash}`);
      return `${indent}.box.role-${role} { ${declarations.join('; ')}; }`;
    })
    .join('\n');
}

function gradients(doc) {
  const out = [];
  for (const page of doc.pages) {
    for (const el of elementsOf(doc, page.id)) {
      const f = el.fill;
      if (!f || typeof f !== 'object') continue;
      const a = ((f.angle ?? 0) * Math.PI) / 180;
      const x2 = (Math.cos(a) * 0.5 + 0.5).toFixed(4);
      const y2 = (Math.sin(a) * 0.5 + 0.5).toFixed(4);
      const x1 = (0.5 - Math.cos(a) * 0.5).toFixed(4);
      const y1 = (0.5 - Math.sin(a) * 0.5).toFixed(4);
      out.push(
        `  <linearGradient id="tp-grad-${escapeAttr(el.id)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">`
        + `<stop offset="0" stop-color="${escapeAttr(f.from)}"/>`
        + `<stop offset="1" stop-color="${escapeAttr(f.to)}"/>`
        + '</linearGradient>',
      );
    }
  }
  return out.join('\n');
}

/** One subtractive SVG mask per edited target; document geometry is untouched. */
function microMaskDefs(doc) {
  const byTarget = new Map();
  for (const mask of microMasksOf(doc)) {
    if (!byTarget.has(mask.target)) byTarget.set(mask.target, []);
    byTarget.get(mask.target).push(mask);
  }
  const out = [];
  for (const [target, masks] of byTarget) {
    out.push(`<mask id="tp-mask-${escapeAttr(target)}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000" style="mask-type:luminance">`);
    out.push('<rect x="-100000" y="-100000" width="200000" height="200000" fill="white"/>');
    for (const mask of masks) {
      if (mask.points.length === 1) {
        const point = mask.points[0];
        out.push(`<rect data-micro-mask="${escapeAttr(mask.id)}" x="${point.x}" y="${point.y}" width="1" height="1" fill="black"/>`);
      } else {
        const points = mask.points.map((point) => `${point.x + 0.5},${point.y + 0.5}`).join(' ');
        out.push(`<polyline data-micro-mask="${escapeAttr(mask.id)}" points="${points}" fill="none" stroke="black" stroke-width="${mask.width}" stroke-linecap="${escapeAttr(mask.cap)}" stroke-linejoin="round"/>`);
      }
    }
    out.push('</mask>');
  }
  return out.join('\n');
}

function style(background = null, gradientDefs = '', microMaskDefinitions = '', tokens = {}, semanticRoles = []) {
  const definitions = [gradientDefs, microMaskDefinitions].filter(Boolean).join('\n');
  const palette = { ...PALETTE, ...tokens };
  const custom = Object.keys(tokens ?? {}).length > 0;
  const lightRoleRules = roleStyles(palette, semanticRoles);
  const darkRoleRules = roleStyles(PALETTE_DARK, semanticRoles, '    ');
  const darkMode = custom ? '' : `  @media (prefers-color-scheme: dark) {
    .bg { fill: ${background ?? PALETTE_DARK.paper}; }
    .grid { stroke: ${PALETTE_DARK.grid}; }
    .grid-major { stroke: ${PALETTE_DARK.gridMajor}; }
    .box { fill: ${PALETTE_DARK.paperAlt}; stroke: ${PALETTE_DARK.ink}; }
    .box-label { fill: ${PALETTE_DARK.ink}; }
    .free-text { fill: ${PALETTE_DARK.inkSoft}; }
    .stroke { fill: ${PALETTE_DARK.ink}; }
    .hop { stroke: ${PALETTE_DARK.ink}; }
${darkRoleRules ? `${darkRoleRules}\n` : ''}  }
`;
  return `<style>
  .bg { fill: ${background ?? palette.paper}; }
  .grid { stroke: ${palette.grid}; stroke-width: 0.5; }
  .grid-major { stroke: ${palette.gridMajor}; stroke-width: 0.5; }
  .box { fill: ${palette.paperAlt}; stroke: ${palette.ink}; stroke-width: 1; }
  .box-label, .key-title, .key-label { fill: ${palette.ink}; }
  .stroke { fill: ${palette.ink}; }
  .hop { stroke: ${palette.ink}; }
  .free-text { fill: ${palette.inkSoft}; }
${lightRoleRules ? `${lightRoleRules}\n` : ''}  .hit-S0 { fill: ${palette.critical}; opacity: 0.30; }
  .hit-S1 { fill: ${palette.error}; opacity: 0.28; }
  .hit-S2 { fill: ${palette.warn}; opacity: 0.24; }
  .hit-S3 { fill: ${palette.info}; opacity: 0.20; }
  .dimmed { fill: url(#tp-stipple); }
  .dither-run { fill: ${PALETTE.ink}; }
  .simplify-run { fill: ${PALETTE.ink}; }
${darkMode}
</style>
<defs>
${definitions}
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
  if (el.mode !== 'embed') return rasterEl(el, x, y);
  const aspect = el.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet';
  return `<image class="image" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${aspect}"`
    + `${el.opacity != null ? ` opacity="${el.opacity}"` : ''} data-id="${escapeAttr(el.id)}" href="${escapeAttr(el.source)}"/>`;
}

/**
 * A picture drawn IN the lattice rather than laid on top of it.
 *
 * The runs were computed at placement time and stored on the element, so this
 * is pure emission — re-rendering an old document cannot drift from what its
 * author saw. Every rect is a whole number of quadrants by construction.
 */
function rasterEl(el, x, y) {
  const q = PX_PER_QUAD;
  const parts = (el.runs ?? []).map(
    (r) => `<rect class="${el.mode}-run" x="${x + r.x * q}" y="${y + r.y * q}" width="${r.w * q}" height="${q}"${r.opacity != null ? ` fill-opacity="${r.opacity}"` : ''}/>`,
  );
  return `<g class="${el.mode}" data-id="${escapeAttr(el.id)}"${el.mode === 'simplify' ? ' shape-rendering="geometricPrecision"' : ''}${el.opacity != null ? ` opacity="${el.opacity}"` : ''}>${parts.join('')}</g>`;
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

/**
 * Outline for a flowchart node shape.
 *
 * The path traces the same boundary the collision engine carved in
 * `shapeCutQuads`, so what a reader sees and what the log reasons about are the
 * same shape. Returns null for shapes that are plain rectangles.
 */
export function shapeOutline(r, shape) {
  const { x, y, w, h } = toPx(r);
  const x2 = x + w, y2 = y + h;
  const mx = x + w / 2, my = y + h / 2;
  // Whole quadrants, from the one authority. A fractional cap cannot land on a
  // quadrant boundary, so it rasterises into an uneven arc and disagrees with the
  // aperture validate reasons about.
  const sk = skewQuads(r.w) * PX_PER_QUAD, cap = capQuads(r.h) * PX_PER_QUAD;
  switch (shape) {
    case 'decision':
      return `M${mx},${y} L${x2},${my} L${mx},${y2} L${x},${my} Z`;
    case 'terminator': {
      const rad = Math.min(h / 2, w / 2);
      return `M${x + rad},${y} H${x2 - rad} A${rad},${h / 2} 0 0 1 ${x2 - rad},${y2} H${x + rad} A${rad},${h / 2} 0 0 1 ${x + rad},${y} Z`;
    }
    case 'io':
      return `M${x + sk},${y} H${x2} L${x2 - sk},${y2} H${x} Z`;
    case 'manual':
      return `M${x},${y} H${x2} L${x2 - sk},${y2} H${x + sk} Z`;
    case 'prep':
      return `M${x + sk},${y} H${x2 - sk} L${x2},${my} L${x2 - sk},${y2} H${x + sk} L${x},${my} Z`;
    case 'data':
      return `M${x},${y + cap} A${w / 2},${cap} 0 0 1 ${x2},${y + cap} V${y2 - cap} A${w / 2},${cap} 0 0 1 ${x},${y2 - cap} Z`;
    case 'document':
      // The mask inks FULL height at the left and right edges and cuts upward
      // in the middle by `cap`. This outline had it inverted — both edges
      // raised to `y2 - cap` with a control point 0.15 of a cap from them —
      // which drew a rectangle with an 0.8px ripple and made a document
      // indistinguishable from a process box in two shipped diagrams.
      //
      // A quadratic sits halfway to its control at the midpoint, so a control
      // at `y2 - 2 * cap` puts the deepest point of the scoop exactly on the
      // `y2 - cap` the mask cuts to. Edges and middle now both say what is
      // actually inked.
      return `M${x},${y} H${x2} V${y2} Q${mx},${y2 - cap * 2} ${x},${y2} Z`;
    case 'bar': {
      const t = h * 0.34;
      const top = y + h / 2 - t;
      return `M${x},${top} H${x2} V${top + t * 2} H${x} Z`;
    }
    case 'lane':
    case 'group':
      // The frame only. The hole is left empty because the container does not
      // claim it — members are drawn there by their own elements.
      return `M${x},${y} H${x2} V${y2} H${x} Z`;
    default:
      return null;
  }
}

function box(el, doc, themed = {}) {
  // Element opacity multiplies with its page's; geometry is untouched either way.
  const shape = el.shape ?? 'process';
  const d = shapeOutline(el.rect, shape) ?? boxOutline(el.rect, el.corner);
  const effectiveOpacity = el.opacity ?? themed.opacity ?? null;
  const className = `box${el.role && el.role !== 'plain' ? ` role-${el.role}` : ''}${el.state === 'dimmed' ? ' dimmed' : ''}`;
  const out = [`<path class="${className}" d="${d}" data-id="${escapeAttr(el.id)}"${effectiveOpacity != null ? ` opacity="${effectiveOpacity}"` : ''}${fillAttr(el, themed)}/>`];
  if (isContainer(shape)) {
    // A rule under the title band, so the band reads as a heading rather than
    // as empty space at the top of a big rectangle.
    const { x, y, w } = toPx(el.rect);
    const bandPx = containerBand(el.rect) * PX_PER_QUAD;
    out.push(`<path class="${className}" d="M${x},${y + bandPx} H${x + w}" fill="none"/>`);
  }
  if (shape === 'data') {
    // The back edge of the top ellipse. Without it the outline is a drum: both
    // ends bulge outward and it reads as a barrel rather than stored data. The
    // mask is unchanged — this is a second mark, not a different footprint.
    const { x, y, w } = toPx(el.rect);
    const capPx = capQuads(el.rect.h) * PX_PER_QUAD;
    out.push(`<path class="${className}" d="M${x},${y + capPx} A${w / 2},${capPx} 0 0 0 ${x + w},${y + capPx}" fill="none"/>`);
  }
  if (shape === 'subprocess') {
    // Double side bars — the mark that says "this step is another process".
    const { x, y, w, h } = toPx(el.rect);
    out.push(`<path class="${className}" d="M${x + 10},${y} V${y + h}" fill="none"/>`);
    out.push(`<path class="${className}" d="M${x + w - 10},${y} V${y + h}" fill="none"/>`);
  }
  if (el.label) out.push(label(el, doc, themed));
  return out.join('');
}

/**
 * Text laid out with the engine's own measurements. textLength is what makes
 * the drawing physically unable to disagree with the fit report.
 */
function label(el, doc, themed = {}) {
  const layout = layoutTextRuns(el.label, shapeTextRect(el.rect, el.shape ?? 'process'), {
    fontSize: el.fontSize,
    paddingQuads: doc.font.paddingQuads,
    align: el.align,
    verticalAlign: 'center',
  });
  return layout.runs
    .map((run) => `<text class="box-label" x="${run.x}" y="${run.baseline}" font-size="${el.fontSize}" textLength="${run.width}" lengthAdjust="spacingAndGlyphs"${themed.text ? ` style="fill:${escapeAttr(themed.text)}"` : ''} xml:space="preserve">${escapeText(run.text)}</text>`)
    .join('');
}

function textBlock(el, doc, themed = {}) {
  const layout = layoutTextRuns(el.text, el.rect, { fontSize: el.fontSize, align: el.align });
  return layout.runs
    .map((run) => `<text class="free-text" x="${run.x}" y="${run.baseline}" font-size="${el.fontSize}" font-weight="${el.weight ?? 400}" textLength="${run.width}" lengthAdjust="spacingAndGlyphs"${el.color || themed.text ? ` style="fill:${escapeAttr(el.color ?? themed.text)}"` : ''} xml:space="preserve">${escapeText(run.text)}</text>`)
    .join('');
}

/** Every stroke quadrant is a 5x5 square; junction styles shave the outer corner. */
function path(el, themed = {}, order = null) {
  if (el.stroke || themed.stroke) return styledPath(el, themed, order);
  const shapes = el.pieces.map((p) => {
    const x = p.x * PX_PER_QUAD, y = p.y * PX_PER_QUAD, s = PX_PER_QUAD;
    if (p.type === 'arrow') return `<path class="stroke" d="${arrowPath(x, y, s, p.dir)}"/>`;
    if (p.type === 'hop') return hopMark(x, y, s, p.dir);
    if (p.type !== 'corner' || p.style === 'square') {
      return `<rect class="stroke" x="${x}" y="${y}" width="${s}" height="${s}"/>`;
    }
    return `<path class="stroke" d="${junctionPath(x, y, s, p.sides, p.style)}"/>`;
  });
  return `<g data-id="${escapeAttr(el.id)}" data-kind="path">${shapes.join('')}${orderMarker(el, order)}${relationshipLabel(el)}</g>`;
}

/** Paint a path as continuous vector ink while retaining its quadrant claim. */
function styledPath(el, themed = {}, order = null) {
  const stroke = el.stroke ?? { color: themed.stroke, width: 5, cap: 'butt' };
  if (stroke.paint === 'cells') return paintedCells(el, themed, order);
  const groups = [];
  let group = [];
  for (const piece of el.pieces) {
    const prev = group.at(-1);
    if (prev && (Math.abs(piece.x - prev.x) > 1 || Math.abs(piece.y - prev.y) > 1)) {
      groups.push(group);
      group = [];
    }
    group.push(piece);
  }
  if (group.length) groups.push(group);

  const color = escapeAttr(themed.stroke ?? stroke.color);
  const width = stroke.width;
  const cap = stroke.cap;
  const ink = groups.map((pieces) => {
    // The collision model deliberately keeps every Bresenham quadrant. Painting
    // every one of those cell centres, however, turns a straight diagonal into
    // a visible staircase. Simplify only the presentation polyline: the stored
    // pieces (and therefore collision/selection geometry) remain byte-for-byte
    // exact, while explicit bends survive because they exceed half a quadrant.
    const points = simplifyPolyline(
      pieces.map((p) => ({
        x: p.x * PX_PER_QUAD + Math.floor(PX_PER_QUAD / 2),
        y: p.y * PX_PER_QUAD + Math.floor(PX_PER_QUAD / 2),
      })),
      PX_PER_QUAD / 2,
    );
    if (points.length === 1) {
      // A zero-length line renders NOTHING with a butt cap — that is the SVG
      // spec, not a quirk — so `pattern: "dotted"` drew a whole row of nothing
      // while validating perfectly. A single point is a dot, and a dot needs a
      // cap that has area. Found by rendering the pattern and looking at it.
      const dotCap = cap === 'butt' ? 'round' : cap;
      return `<line x1="${points[0].x}" y1="${points[0].y}" x2="${points[0].x}" y2="${points[0].y}" stroke="${color}" stroke-width="${width}" stroke-linecap="${dotCap}"/>`;
    }
    const encoded = points.map((p) => `${p.x},${p.y}`).join(' ');
    return `<polyline points="${encoded}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="${cap}" stroke-linejoin="round"/>`;
  });
  // A continuous styled polyline still needs its authored arrow markers.
  // Previously the styled branch ignored piece types entirely, so adding a
  // colour to a connector silently erased its direction.
  const arrows = el.pieces
    .filter((piece) => piece.type === 'arrow')
    .map((piece) => `<path d="${arrowPath(piece.x * PX_PER_QUAD, piece.y * PX_PER_QUAD, PX_PER_QUAD, piece.dir)}" fill="${piece.color ? escapeAttr(piece.color) : color}" stroke="none"/>`);
  return `<g data-id="${escapeAttr(el.id)}" data-kind="path" data-role="${escapeAttr(el.role ?? 'connector')}">${ink.join('')}${arrows.join('')}${orderMarker(el, order)}${relationshipLabel(el)}</g>`;
}

/** Colour exact claimed quadrants, merging adjacent cells into compact runs. */
function paintedCells(el, themed = {}, order = null) {
  // Runs break on a colour change as well as on a gap. A run-length encoder
  // that only watched position would paint a whole gradient in whichever
  // colour happened to start the row.
  const rows = new Map();
  for (const piece of el.pieces) {
    if (!rows.has(piece.y)) rows.set(piece.y, new Map());
    rows.get(piece.y).set(piece.x, piece.color ?? themed.stroke ?? el.stroke.color);
  }
  const rects = [];
  for (const y of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(y);
    const xs = [...row.keys()].sort((a, b) => a - b);
    let start = xs[0], previous = xs[0];
    const emit = () => rects.push(`<rect x="${start * PX_PER_QUAD}" y="${y * PX_PER_QUAD}" width="${(previous - start + 1) * PX_PER_QUAD}" height="${PX_PER_QUAD}" fill="${escapeAttr(row.get(start))}"/>`);
    for (let i = 1; i < xs.length; i += 1) {
      if (xs[i] !== previous + 1 || row.get(xs[i]) !== row.get(previous)) { emit(); start = xs[i]; }
      previous = xs[i];
    }
    emit();
  }
  return `<g data-id="${escapeAttr(el.id)}" data-kind="path" data-role="${escapeAttr(el.role ?? 'connector')}" data-paint="cells">${rects.join('')}${orderMarker(el, order)}${relationshipLabel(el)}</g>`;
}

function relationshipLabel(el) {
  if (!el.relationshipLabel || !el.pieces.length) return '';
  const point = el.pieces[Math.floor(el.pieces.length / 2)];
  const width = Math.max(6, el.relationshipLabel.length * 6);
  const x = point.x * PX_PER_QUAD + Math.floor(PX_PER_QUAD / 2) - Math.floor(width / 2);
  const y = point.y * PX_PER_QUAD - 5;
  return `<rect x="${x - 2}" y="${y - 10}" width="${width + 4}" height="14" fill="${PALETTE.paper}" opacity="0.92"/>`
    + `<text class="box-label" x="${x}" y="${y}" font-size="10" textLength="${width}" lengthAdjust="spacingAndGlyphs">${escapeText(el.relationshipLabel)}</text>`;
}

function orderMarker(el, order) {
  if (!order || !el.pieces.length) return '';
  const point = el.pieces[Math.floor(el.pieces.length / 2)];
  const x = point.x * PX_PER_QUAD + Math.floor(PX_PER_QUAD / 2);
  const y = point.y * PX_PER_QUAD + Math.floor(PX_PER_QUAD / 2);
  const label_ = String(order);
  return `<circle cx="${x}" cy="${y}" r="8" fill="${PALETTE.paper}" stroke="${PALETTE.ink}"/>`
    + `<text class="box-label" x="${x - 3}" y="${y + 3}" font-size="10" textLength="6" lengthAdjust="spacingAndGlyphs">${label_}</text>`;
}

/** Ramer-Douglas-Peucker simplification for presentation-only artwork ink. */
function simplifyPolyline(points, tolerance) {
  if (points.length <= 2) return points;
  const first = points[0], last = points.at(-1);
  let split = -1, furthest = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = distanceToSegment(points[i], first, last);
    if (distance > furthest) { furthest = distance; split = i; }
  }
  if (furthest <= tolerance) return [first, last];
  const left = simplifyPolyline(points.slice(0, split + 1), tolerance);
  const right = simplifyPolyline(points.slice(split), tolerance);
  return [...left.slice(0, -1), ...right];
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x, dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
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
