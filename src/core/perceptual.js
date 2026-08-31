/**
 * Perceptual review — the half of quality the collision engine cannot see.
 *
 * `validate` proves a drawing is structurally undefective. It cannot prove the
 * drawing depicts what was asked for. A farm-animal session validated CLEAN
 * while a sheep read as a stegosaurus, two ears rendered as flags, and
 * half-tone spots dithered into plus-signs. Every coordinate was legal and
 * every one of those defects was real.
 *
 * So perceptual judgement lives here, deliberately OUTSIDE the geometry:
 *
 *   author -> validate (deterministic) -> render -> external multimodal review
 *          -> perceptual findings (this module) -> adjudicate -> repair -> rerender
 *
 * TWO RULES MAKE THIS SAFE.
 *
 * 1. Probabilistic judgement never enters collision geometry. Nothing here is
 *    consulted by `validate`, and a perceptual finding can never move a
 *    quadrant. A critic's opinion must not silently become an engine fact.
 *
 * 2. Structural and perceptual verdicts are never merged into one flag. They
 *    answer different questions — "is this well-formed" and "does this read as
 *    the thing" — and collapsing them loses exactly the case that matters: the
 *    clean log over the wrong picture.
 *
 * A review is BOUND TO THE RENDER IT DESCRIBES. Findings carry the hash of the
 * bytes the critic actually saw, so editing the drawing makes the review
 * visibly stale rather than quietly wrong — the same discipline that governs
 * accepted collision findings, applied to opinions instead of geometry.
 */

import crypto from 'node:crypto';

/** Severities mirror the collision log so one vocabulary covers both halves. */
export const PERCEPTUAL_SEVERITIES = Object.freeze(['P0', 'P1', 'P2', 'P3']);

/**
 * Categories are a closed set. An open vocabulary would let a critic invent a
 * label per drawing, and a category that appears once is not a category — it is
 * a sentence, and it cannot be counted, regressed, or triaged.
 */
export const PERCEPTUAL_CATEGORIES = Object.freeze([
  'semantic-identity-mismatch',   // it does not read as the thing it names
  'ambiguous-silhouette',         // the outline could be several things
  'misleading-structure',         // anatomy or assembly reads wrong
  'symbol-collision',             // marks collide perceptually, not geometrically
  'accidental-glyph',             // a mark reads as a letter or symbol by accident
  'poor-hierarchy',               // importance is not legible from the drawing
  'illegible-density',            // too much ink in too little room to resolve
  'grouping-error',               // related things do not read as related
  'perspective-implausible',      // depth cues contradict each other
  'annotation-ambiguity',         // a label appears to point at the wrong target
]);

/** A finding may only ask for a repair the engine can actually perform. */
export const REPAIR_CLASSES = Object.freeze([
  'resize', 'move', 'restyle', 'reroute', 'redraw', 'remove', 'advice-only',
]);

/**
 * Only options that change rendered bytes belong in a review profile. Paths,
 * force flags, and filesystem details are transport concerns, not properties
 * of the image a reviewer saw.
 */
export function normalizeRenderProfile(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('render profile must be an object');
  const profile = {
    showGrid: raw.showGrid ?? true,
    markFindings: raw.markFindings ?? false,
    bounds: raw.bounds ?? 'content',
    margin: raw.margin ?? 20,
  };
  if (typeof profile.showGrid !== 'boolean') fail('render profile showGrid must be boolean');
  if (typeof profile.markFindings !== 'boolean') fail('render profile markFindings must be boolean');
  if (!['content', 'canvas'].includes(profile.bounds)) fail('render profile bounds must be content or canvas');
  if (!Number.isSafeInteger(profile.margin) || profile.margin < 0) fail('render profile margin must be a non-negative whole number');
  return Object.freeze(profile);
}

/** The hash of the rendered bytes a critic actually looked at. */
export function renderHash(svg) {
  return crypto.createHash('sha256').update(String(svg), 'utf8').digest('hex').slice(0, 16);
}

function fail(what) {
  throw new SyntaxError(`perceptual finding: ${what}`);
}

/**
 * Validate one finding, refusing by name rather than coercing.
 *
 * The engine refuses malformed input everywhere else; a critique surface that
 * quietly accepted a typo'd category would be the one place where sloppiness is
 * tolerated, and it is precisely where sloppiness is hardest to notice later.
 */
export function normalizePerceptualFinding(raw, { knownIds = null } = {}) {
  if (!raw || typeof raw !== 'object') fail('expected an object');
  const { id, severity, category, symptom, consequence } = raw;

  if (!id || typeof id !== 'string') fail('needs a string id');
  if (!PERCEPTUAL_SEVERITIES.includes(severity)) {
    fail(`unknown severity "${severity}" — expected one of ${PERCEPTUAL_SEVERITIES.join(', ')}`);
  }
  if (!PERCEPTUAL_CATEGORIES.includes(category)) {
    fail(`unknown category "${category}" — expected one of ${PERCEPTUAL_CATEGORIES.join(', ')}`);
  }
  if (!symptom || typeof symptom !== 'string') {
    fail(`"${id}" needs an observed symptom — what does it LOOK like, not what is wrong with it`);
  }
  if (!consequence || typeof consequence !== 'string') {
    fail(`"${id}" needs a likely consequence — what would a reader get wrong because of it`);
  }

  const repair = raw.repair ?? 'advice-only';
  if (!REPAIR_CLASSES.includes(repair)) {
    fail(`unknown repair class "${repair}" — expected one of ${REPAIR_CLASSES.join(', ')}`);
  }

  const confidence = raw.confidence ?? 1;
  if (typeof confidence !== 'number' || confidence <= 0 || confidence > 1) {
    fail(`"${id}" confidence must be a number in (0, 1]`);
  }

  const elements = raw.elements ?? [];
  if (!Array.isArray(elements)) fail(`"${id}" elements must be an array`);
  // A critic naming an element that does not exist is reporting on a drawing
  // other than this one. Better to refuse than to file it against nothing.
  if (knownIds) {
    for (const e of elements) {
      if (!knownIds.has(e)) fail(`"${id}" names element "${e}", which is not in the document`);
    }
  }

  return Object.freeze({
    id,
    severity,
    category,
    elements: Object.freeze([...elements]),
    region: raw.region ?? null,
    symptom,
    consequence,
    confidence,
    repair,
  });
}

/**
 * Attach a review to a document.
 *
 * Stored as document state so it survives save/reopen and can be diffed, but
 * never consulted by `validate`. `renderHash` is required: a review of nothing
 * in particular cannot be shown to have gone stale, and a stale opinion
 * presented as current is the failure this binding exists to prevent.
 */
export function attachPerceptualReview(doc, {
  renderHash: hash,
  reviewer,
  findings = [],
  note = null,
  renderProfile = {},
}) {
  if (!hash || typeof hash !== 'string') fail('a review must name the renderHash it describes');
  if (!reviewer || typeof reviewer !== 'string') fail('a review must name its reviewer');

  const knownIds = new Set(Object.values(doc.elements ?? {}).flat().map((e) => e.id));
  const normalized = findings.map((f) => normalizePerceptualFinding(f, { knownIds }));

  const seen = new Set();
  for (const f of normalized) {
    if (seen.has(f.id)) fail(`duplicate finding id "${f.id}"`);
    seen.add(f.id);
  }

  doc.perceptual = {
    renderHash: hash,
    renderProfile: normalizeRenderProfile(renderProfile),
    reviewer,
    reviewedAt: new Date().toISOString(),
    note,
    findings: normalized,
  };
  return doc.perceptual;
}

/** Restore a persisted review without rewriting the timestamp it was made. */
export function restorePerceptualReview(doc, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('saved review must be an object');
  const { renderHash: hash, reviewer, reviewedAt, findings = [], note = null } = raw;
  if (!hash || typeof hash !== 'string') fail('a saved review must name the renderHash it describes');
  if (!reviewer || typeof reviewer !== 'string') fail('a saved review must name its reviewer');
  if (!reviewedAt || typeof reviewedAt !== 'string' || Number.isNaN(Date.parse(reviewedAt))) {
    fail('a saved review must carry a valid reviewedAt timestamp');
  }
  if (note != null && typeof note !== 'string') fail('saved review note must be a string or null');
  if (!Array.isArray(findings)) fail('saved review findings must be an array');

  const knownIds = new Set(Object.values(doc.elements ?? {}).flat().map((e) => e.id));
  const normalized = findings.map((finding) => normalizePerceptualFinding(finding, { knownIds }));
  const seen = new Set();
  for (const finding of normalized) {
    if (seen.has(finding.id)) fail(`duplicate finding id "${finding.id}"`);
    seen.add(finding.id);
  }

  doc.perceptual = {
    renderHash: hash,
    renderProfile: normalizeRenderProfile(raw.renderProfile ?? {}),
    reviewer,
    reviewedAt,
    note,
    findings: normalized,
  };
  return doc.perceptual;
}

/**
 * The two verdicts, side by side and never combined.
 *
 * `stale` is the load-bearing field. A drawing edited after review has a
 * perceptual verdict that describes bytes nobody is looking at any more, and
 * saying so is more useful than either re-running the critic automatically or
 * pretending the old answer still holds.
 */
export function verdicts(doc, { structural, currentRenderHash = null } = {}) {
  const review = doc.perceptual ?? null;
  const open = review?.findings ?? [];
  const blocking = open.filter((f) => f.severity === 'P0' || f.severity === 'P1');

  return {
    structural: {
      clean: Boolean(structural?.summary?.clean ?? false),
      open: structural?.open?.length ?? 0,
    },
    perceptual: review
      ? {
        reviewed: true,
        reviewer: review.reviewer,
        findings: open.length,
        blocking: blocking.length,
        clean: blocking.length === 0,
        stale: currentRenderHash != null && currentRenderHash !== review.renderHash,
      }
      : { reviewed: false, findings: 0, blocking: 0, clean: false, stale: false },
    // Deliberately no combined boolean. Asking "is it done" of a drawing means
    // asking two questions, and a caller that wants one answer should have to
    // decide for itself which failure it is willing to ship.
  };
}
