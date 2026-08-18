/**
 * Flowchart semantics.
 *
 * The rest of the engine checks whether a drawing is geometrically sound. These
 * rules check whether a flowchart is a flowchart: that it has one beginning,
 * and that every judgement actually branches. They are the two conventions from
 * the standard drawing rules that can be decided from authored fact rather than
 * inferred from appearance.
 *
 * WHY ONLY TWO. The convention list is longer — branches should be labelled,
 * process steps should be named with a verb phrase — but those cannot be
 * checked without guessing. Deciding that a floating "NO" belongs to one edge
 * rather than another means reading intent out of proximity, and deciding that
 * "Invoice" is not a verb phrase means shipping an English grammar. A rule that
 * guesses is worse than no rule: it trains the author to ignore the log, which
 * is the exact failure this engine exists to design out.
 *
 * SELF-ACTIVATING. These rules apply only to a document that actually uses
 * flowchart symbols. No flag, and no retroactive reclassification of the
 * existing corpus, whose nodes are all plain `process` rectangles.
 */

import { buildFinding as finding } from './collide.js';

export const FLOWCHART_RULES = Object.freeze({
  F001: { severity: 'S1', title: 'more than one start', blurb: 'a flowchart has exactly one beginning' },
  F002: { severity: 'S1', title: 'decision does not branch', blurb: 'a judgement with fewer than two ways out decides nothing' },
});

/** Does this document use flowchart symbols at all? */
export function isFlowchart(boxes) {
  return boxes.some((b) => b.shape === 'decision' || b.shape === 'terminator');
}

/**
 * Build the edge list from what the author stated.
 *
 * `pen from <id>.<face>` records its origin and `line to <id>.<port>` records
 * its target, so an edge is a fact the author wrote down — never a guess made
 * by looking at which quadrants happen to sit next to which box.
 */
function edgesOf(paths) {
  const out = [];
  for (const p of paths) {
    if (!p.source) continue;
    for (const t of p.targets ?? []) out.push({ from: p.source.id, to: t.id, via: p.id });
  }
  return out;
}

export function flowchartFindings(doc, pages) {
  const found = [];
  for (const page of pages) {
    const els = doc.elements[page.id] ?? [];
    const boxes = els.filter((e) => e.kind === 'box');
    if (!isFlowchart(boxes)) continue;

    const paths = els.filter((e) => e.kind === 'path');
    const edges = edgesOf(paths);
    const inbound = new Set(edges.map((e) => e.to));

    // F001 — a terminator nothing points at is a beginning. Two beginnings
    // means a reader cannot tell where to start, which is the whole job of the
    // symbol.
    const starts = boxes.filter((b) => b.shape === 'terminator' && !inbound.has(b.id));
    if (starts.length > 1) {
      found.push(
        finding('F001', page.id, {
          message:
            `${starts.length} terminators have nothing leading into them (${starts.map((b) => `"${b.id}"`).join(', ')}) — ` +
            'a flowchart has one beginning, and may have many ends',
          actors: starts.map((b) => b.id),
          cells: starts.map((b) => b.id),
          metrics: { starts: starts.length },
          fixes: [
            { kind: 'reroute', description: 'connect the extra terminators into the flow so they read as ends, not beginnings' },
            { kind: 'remove', description: 'or remove the terminator that is not the start' },
          ],
        }),
      );
    }

    // F002 — a decision with one way out is a process step wearing a diamond.
    for (const b of boxes.filter((x) => x.shape === 'decision')) {
      const outgoing = edges.filter((e) => e.from === b.id);
      if (outgoing.length >= 2) continue;
      found.push(
        finding('F002', page.id, {
          message:
            `decision "${b.id}" has ${outgoing.length} way(s) out — a judgement needs at least two, ` +
            'or it is a process step drawn as a diamond',
          actors: [b.id],
          cells: [b.id],
          metrics: { outgoing: outgoing.length },
          fixes: [
            { kind: 'reroute', description: `draw the missing branch, e.g. "pen from ${b.id}.W"` },
            { kind: 'shape', to: 'process', description: `or restyle "${b.id}" to shape "process" if it does not actually branch` },
          ],
        }),
      );
    }
  }
  return found;
}
