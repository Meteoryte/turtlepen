/**
 * Swimlane semantics.
 *
 * A swimlane says who owns each step. That claim is only worth making if every
 * lane says whose it is, and if every step sits in exactly one of them — so
 * those are the two things checked here.
 *
 * WHY ONLY TWO, again. The convention list is longer: arrows should not snake
 * back and forth, handoffs across lanes are the edges that matter most, lanes
 * need not hold equal step counts. None of those can be decided from authored
 * fact. "Snaking" means judging a route's aesthetics, and "the handoff that
 * introduces the most coupling" is a claim about a system the drawing only
 * depicts. A rule that guesses trains the author to ignore the log, which is
 * the failure this engine exists to design out — the same reasoning that keeps
 * flowchart.js to two rules.
 *
 * SELF-ACTIVATING. These apply to a document that actually uses lane
 * containers. There is no flag to set and no reclassification of drawings that
 * merely happen to have rows.
 *
 * Adapted from the Diagram Design skill's swimlane anti-patterns
 * (github.com/cathrynlavery/diagram-design, MIT, (c) 2025 Cathryn Lavery),
 * which states them as prose for an author to remember. Here they are findings.
 */

import { rectsOverlap } from './geometry.js';
import { buildFinding as finding } from './collide.js';
import { isContainer } from './shapes.js';

export const SWIMLANE_RULES = Object.freeze({
  W001: { severity: 'S2', title: 'unlabelled lane', blurb: 'a lane that does not say whose it is explains no ownership' },
  W002: { severity: 'S1', title: 'step spans two lanes', blurb: 'a step drawn across a lane boundary claims two owners' },
});

/** Does this page use lanes at all? */
export function isSwimlane(boxes) {
  return boxes.filter((b) => b.shape === 'lane').length >= 2;
}

/**
 * A lane is a container, so it CLAIMS only its title band and border ring. A
 * member sitting inside collides with nothing — which is exactly why spanning
 * has to be checked separately: two lanes can both contain a box's rect without
 * either reporting an overlap.
 */
export function swimlaneFindings(doc, pages, elementsOf) {
  const out = [];
  for (const page of pages) {
    const boxes = elementsOf(doc, page.id).filter((el) => el.kind === 'box');
    const lanes = boxes.filter((b) => b.shape === 'lane');
    if (!isSwimlane(boxes)) continue;

    for (const lane of lanes) {
      if (String(lane.label ?? '').trim()) continue;
      out.push(finding('W001', page.id, {
        message:
          `lane "${lane.id}" has no label — a swimlane's whole claim is who owns each step, `
          + 'and an unnamed lane makes that claim about nobody.',
        actors: [lane.id],
      }));
    }

    for (const step of boxes) {
      if (isContainer(step.shape)) continue;
      const spanned = lanes.filter((lane) => rectsOverlap(step.rect, lane.rect));
      if (spanned.length < 2) continue;
      const names = spanned.map((l) => l.id).sort();
      out.push(finding('W002', page.id, {
        message:
          `"${step.id}" lies across ${spanned.length} lanes (${names.join(', ')}) — a step has one owner. `
          + 'Move it wholly inside one lane, or split it into the steps each lane actually performs.',
        actors: [step.id, ...names],
      }));
    }
  }
  return out;
}
