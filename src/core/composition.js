/**
 * Composition findings — does this diagram look designed?
 *
 * Every other rule in this engine measures correctness: collisions, clipping, overlap.
 * That leaves a gap a model can walk through, because "no defects" is trivially achieved
 * by drawing almost nothing. A near-empty page scores green and the author stops.
 *
 * This module measures the other axis and reports it as ordinary findings, adjudicated
 * like any other. It never mutates the document and never blocks placement.
 */

import { createHash } from 'node:crypto';
import { QUADS_PER_CELL } from './geometry.js';
import { elementsOf, elementVisual } from './document.js';
import { buildFinding } from './collide.js';
import { FOCAL_BUDGET } from './roles.js';

/**
 * Calibrated 2026-08-09 against all seven diagrams in `diagrams/`. The thinnest real
 * diagram (branching-tree) measures 0.0187, so this sits about a third below it.
 * Deliberately conservative: with no corpus of BAD diagrams to calibrate against, a
 * tighter threshold would only nag on good work.
 */
export const SPARSE_DENSITY = 0.012;

/**
 * Every quadrant a page's elements put ink on.
 *
 * Uses `elementVisual` rather than a local notion of ink so composition measures the same
 * thing the collision rules do. A second definition of "where ink lands" is exactly the
 * divergence the shared-measurement rule exists to prevent.
 */
export function pageInk(doc, pageId) {
  const ink = new Set();
  for (const el of elementsOf(doc, pageId)) {
    for (const key of elementVisual(el)) ink.add(key);
  }
  return ink;
}

export function pageDensity(doc, page) {
  const canvas = (doc.canvas.cols * QUADS_PER_CELL) * (doc.canvas.rows * QUADS_PER_CELL);
  const ink = pageInk(doc, page.id).size;
  return { density: canvas === 0 ? 0 : ink / canvas, ink, canvas };
}

/**
 * The ink digest is what makes an acceptance lapse.
 *
 * A composition finding names no actors and no quadrants, so without this its fingerprint
 * would be constant — and accepting it once would suppress it forever, even after the
 * drawing changed completely. That is exactly the failure the acceptance model forbids:
 * an acceptance that survives a geometry change is indistinguishable from a missed defect.
 *
 * The digest goes in `extra` rather than in `cells` so the finding stays small; enumerating
 * thousands of quadrant addresses would bury the message it is trying to deliver.
 */
function inkDigest(ink) {
  const material = [...ink].sort().join(' ');
  return createHash('sha256').update(material).digest('hex').slice(0, 12);
}

/**
 * Composition is judged per DOCUMENT, on its densest page — not per page.
 *
 * Judging each page independently was tried first and was wrong: an annotation overlay is
 * legitimately sparse, so `agent-session`, `branching-tree`, `example` and
 * `home-lab-network` all tripped on their `notes`/`review`/`leaves` overlays while their
 * base pages were richly composed. A sparse overlay is a normal part of a good diagram and
 * must not drag the document down.
 *
 * @param {object} doc
 * @param {object[]} pages the pages under consideration — `validate` may have narrowed them
 */
export function compositionFindings(doc, pages) {
  const considered = pages.filter((p) => p.intent !== 'schematic');
  if (considered.length === 0) return [];

  let densest = null;
  for (const page of considered) {
    const measured = { page, ...pageDensity(doc, page) };
    if (!densest || measured.density > densest.density) densest = measured;
  }

  if (densest.density >= SPARSE_DENSITY) return [];

  const { page, density, ink, canvas } = densest;
  return [
    buildFinding('C001', page.id, {
      message:
        `the densest page ("${page.id}") inks ${ink} of ${canvas} quadrants `
        + `(${(density * 100).toFixed(2)}%), below the ${(SPARSE_DENSITY * 100).toFixed(1)}% floor — `
        + 'this reads as undesigned rather than minimal. Compose it, or declare the page intent '
        + '"schematic" if the sparseness is deliberate.',
      metrics: { density: Number(density.toFixed(4)), ink, canvas, floor: SPARSE_DENSITY, pagesConsidered: considered.length },
      extra: `ink:${inkDigest(pageInk(doc, page.id))}`,
    }),
  ];
}

/**
 * C002 — the focal budget.
 *
 * A focal mark works by contrast with everything around it, so focus is a fixed
 * quantity a page spends rather than a property each node can be given. The
 * third `focal` node does not add emphasis; it takes it from the other two.
 *
 * This is counted per page and not per document, because focus is a property of
 * what a reader sees at once. It is S3 for the same reason C001 is: a taste
 * heuristic must never outrank a real defect, and an author who genuinely wants
 * three focal nodes can accept the finding and move on.
 *
 * Countable only because a role is declared. A hex fill asserts nothing about
 * importance, so nothing could be said about it — which is the argument for
 * roles over colours in one sentence.
 */
export function focalFindings(doc, pages) {
  const out = [];
  for (const page of pages) {
    const focal = elementsOf(doc, page.id)
      .filter((el) => el.kind === 'box' && el.role === 'focal');
    if (focal.length <= FOCAL_BUDGET) continue;

    const ids = focal.map((el) => el.id).sort();
    out.push(buildFinding('C002', page.id, {
      message:
        `${focal.length} nodes on page "${page.id}" claim role "focal" (budget ${FOCAL_BUDGET}) — `
        + `${ids.join(', ')}. Focus is contrast, so past the budget none of them reads as focal. `
        + 'Demote all but the one or two the reader must land on first.',
      actors: ids,
      metrics: { focal: focal.length, budget: FOCAL_BUDGET },
      extra: `focal:${ids.join('|')}`,
    }));
  }
  return out;
}
