/**
 * Quantitative semantics — does the drawing agree with its own numbers?
 *
 * Every other rule in this engine asks whether a drawing is sound. These ask
 * whether it is TRUE: whether the bar drawn for 40 is really twice the bar drawn
 * for 20, and whether the axis it sits on lets that comparison mean anything.
 *
 * This is only decidable because a scale is declared. Given a value, a geometry
 * and the mapping between them, the engine has two independent statements about
 * the same quantity and can find them in disagreement. Without a scale the
 * numbers live in the author's head and every chart validates.
 *
 * SELF-ACTIVATING, like the flowchart and swimlane rules. A document with no
 * scales is not a chart and is never judged as one.
 *
 * Adapted from the quantitative types in the Diagram Design skill
 * (github.com/cathrynlavery/diagram-design, MIT, (c) 2025 Cathryn Lavery),
 * which names truncated baselines and area-vs-value mismatch as anti-patterns
 * for an author to avoid. Here the engine reports them.
 */

import { buildFinding as finding } from './collide.js';
import { project, readBack, baselineIsTruncated } from './scale.js';

export const QUANTITATIVE_RULES = Object.freeze({
  V001: { severity: 'S1', title: 'mark contradicts its value', blurb: 'the geometry drawn encodes a different number than the one declared' },
  V002: { severity: 'S2', title: 'truncated magnitude baseline', blurb: 'a length-encoded scale that misses zero exaggerates every difference on it' },
  V003: { severity: 'S3', title: 'value outside its scale', blurb: 'a value beyond the declared domain is extrapolated, not read' },
});

/** How far a mark may sit from its exact projection before it is simply wrong. */
export const MARK_TOLERANCE_QUADS = 1;

export function scalesOf(doc) {
  return doc.scales ?? {};
}

/** The extent a mark uses to encode its value, in quadrants. */
function extentOf(el, axis) {
  return axis === 'x' ? el.rect.w : el.rect.h;
}

export function quantitativeFindings(doc, pages, elementsOf) {
  const scales = scalesOf(doc);
  const ids = Object.keys(scales);
  if (ids.length === 0) return [];

  const out = [];

  // V002 is a property of the scale, not of any one mark, so it is reported
  // once per scale rather than once per bar drawn on it.
  for (const id of ids) {
    const scale = scales[id];
    if (!baselineIsTruncated(scale)) continue;
    const [lo, hi] = scale.domain;
    out.push(finding('V002', pages[0]?.id ?? 'base', {
      message:
        `scale "${id}" encodes magnitude by length but runs ${lo}..${hi}, not from zero. `
        + `${lo} maps to no length at all and ${hi} maps to the full extent, so the pair reads as `
        + `an unlimited ratio when the true one is ${round2(hi / lo)}:1. Every difference on this `
        + 'axis is exaggerated. Start the domain at zero, or declare kind "position" if length is '
        + 'not what encodes the value.',
      metrics: { domain: [lo, hi], kind: scale.kind },
      extra: `scale:${id}`,
    }));
  }

  for (const page of pages) {
    for (const el of elementsOf(doc, page.id)) {
      const bound = el.value;
      if (!bound || typeof bound !== 'object') continue;
      const scale = scales[bound.scale];
      if (!scale) continue;

      const axis = bound.axis === 'x' ? 'x' : 'y';
      const projected = project(scale, bound.value);

      if (!projected.inDomain) {
        out.push(finding('V003', page.id, {
          message:
            `"${el.id}" declares ${bound.value}, outside scale "${scale.id}" (${scale.domain.join('..')}) — `
            + 'the mark is an extrapolation rather than a reading. Widen the domain or drop the mark.',
          actors: [el.id],
          metrics: { value: bound.value, domain: scale.domain },
        }));
        continue;
      }

      const drawn = extentOf(el, axis);
      const off = Math.abs(drawn - projected.quads);
      if (off <= MARK_TOLERANCE_QUADS) continue;

      out.push(finding('V001', page.id, {
        message:
          `"${el.id}" declares ${bound.value} on scale "${scale.id}", which projects to ${projected.quads} `
          + `quadrants, but the mark is ${drawn} — it draws ${round2(readBack(scale, drawn))}. `
          + `Off by ${off} quadrants; the chart contradicts its own data.`,
        actors: [el.id],
        metrics: {
          declared: bound.value,
          expectedQuads: projected.quads,
          drawnQuads: drawn,
          drawnValue: round2(readBack(scale, drawn)),
          residual: round2(projected.residual),
        },
        fixes: [{ kind: 'resize', to: projected.quads, axis }],
      }));
    }
  }
  return out;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
