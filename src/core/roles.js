/**
 * Semantic node roles.
 *
 * A role says what a node IS — focal, a datastore, someone else's system, an
 * optional path — and the skin decides what that looks like. Authors stop
 * writing hex into documents, and a drawing's meaning survives a change of skin
 * because the meaning was never stored as a colour in the first place.
 *
 * Two things follow that a raw `fill` could never give:
 *
 *   1. A role is CHECKABLE. `focal` is the one role whose whole job is to be
 *      scarce, so `C002` can count it. A hex fill carries no such claim and
 *      nothing can be said about it.
 *   2. A role is SKIN-INDEPENDENT. Light and dark resolve the same role to
 *      different values, so a document does not encode one theme.
 *
 * The vocabulary is adapted from the Diagram Design skill
 * (github.com/cathrynlavery/diagram-design, MIT, (c) 2025 Cathryn Lavery),
 * which states these as authoring discipline in prose. The contribution here is
 * mechanical enforcement: the same rules, but as findings the engine reports
 * rather than advice a reader has to remember. Palette values are TurtlePen's
 * own — the source's brand colours are its identity, not a spec to copy.
 */

/** Roles a box may declare. `plain` is the default and asserts nothing. */
export const NODE_ROLES = Object.freeze([
  'plain', 'focal', 'backend', 'store', 'external', 'input', 'optional', 'security',
  'timeline-event', 'timeline-milestone', 'timeline-release', 'timeline-deadline',
  'timeline-current', 'timeline-planned', 'timeline-phase',
]);

/**
 * How scarce `focal` has to be to still mean anything.
 *
 * Not a taste threshold. A focal mark works by contrast with everything around
 * it; the third one does not add emphasis, it removes it from the other two.
 */
export const FOCAL_BUDGET = 2;

export function assertNodeRole(role) {
  if (!NODE_ROLES.includes(role)) {
    throw new SyntaxError(`unknown node role "${role}" — expected one of ${NODE_ROLES.join(', ')}`);
  }
  return role;
}

/** Roles that make a visible claim about importance, and so can be overspent. */
export function isFocalRole(role) {
  return role === 'focal';
}

/**
 * Resolve a role against a skin.
 *
 * Returns presentation only — fill, stroke, and an optional dash. None of this
 * reaches the collision engine, which is why a role can never change a
 * document's geometry or its findings about that geometry.
 */
export function treatmentFor(role, skin) {
  const ink = skin.ink;
  // Opacity is resolved to a flat hex HERE, not left for each renderer to
  // composite. The SVG renderer would happily take `rgba()`, but the native
  // PNG/PDF rasteriser takes hex only — and letting the two derive the same
  // appearance by different routes is precisely how the cylinder cap ended up
  // drawn one way in SVG and another in PNG. One function, one answer.
  const on = (hex, alpha) => blend(hex, alpha, skin.paper);
  switch (role) {
    case 'focal':
      return { fill: on(skin.accent, 0.10), stroke: skin.accent };
    case 'backend':
      return { fill: skin.paper, stroke: ink };
    case 'store':
      return { fill: on(ink, 0.05), stroke: skin.inkSoft };
    case 'external':
      return { fill: on(ink, 0.03), stroke: on(ink, 0.30) };
    case 'input':
      return { fill: on(skin.inkSoft, 0.10), stroke: skin.inkSoft };
    case 'optional':
      return { fill: on(ink, 0.02), stroke: on(ink, 0.20), dash: '4,3' };
    case 'security':
      return { fill: on(skin.accent, 0.05), stroke: on(skin.accent, 0.50), dash: '4,4' };
    case 'timeline-event':
      return { fill: skin.paperAlt, stroke: ink };
    case 'timeline-milestone':
      return { fill: on(skin.accent, 0.07), stroke: skin.accent };
    case 'timeline-release':
      return { fill: on(skin.accent, 0.14), stroke: skin.accent };
    case 'timeline-deadline':
      return { fill: skin.paper, stroke: ink, dash: '2,2' };
    case 'timeline-current':
      return { fill: on(skin.accent, 0.18), stroke: skin.accent };
    case 'timeline-planned':
      return { fill: on(ink, 0.02), stroke: on(ink, 0.45), dash: '5,3' };
    case 'timeline-phase':
      return { fill: on(ink, 0.015), stroke: on(ink, 0.28), dash: '6,4' };
    default:
      return { fill: skin.paperAlt, stroke: ink };
  }
}

/** `hex` at `alpha` composited over `onto`, returned as flat `#rrggbb`. */
export function blend(hex, alpha, onto) {
  const fg = channels(hex);
  const bg = channels(onto);
  const t = Math.max(0, Math.min(1, alpha));
  const out = fg.map((c, i) => Math.round(c * t + bg[i] * (1 - t)));
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** `#rrggbb` at an alpha, as `rgba()`. Kept for callers that want real alpha. */
export function withAlpha(hex, alpha) {
  const [r, g, b] = channels(hex);
  return `rgba(${r},${g},${b},${round2(alpha)})`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export function channels(hex) {
  const raw = String(hex).replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new SyntaxError(`not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

/** WCAG relative luminance. */
export function luminance(hex) {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio, 1 to 21.
 *
 * Reported rather than enforced by refusal: a drawing may legitimately place
 * quiet text on quiet paper, and the engine's job is to say so with a number,
 * not to overrule the author.
 */
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return round2((hi + 0.05) / (lo + 0.05));
}

/** AA for normal-size text. 3.0 is the large-text bar; this is the strict one. */
export const AA_NORMAL = 4.5;
