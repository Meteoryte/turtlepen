/**
 * Turning a finding's fix into the call that performs it.
 *
 * Every finding already carries `fixes`, and every fix kind already has a tool
 * that applies it — `test/edit.test.js` asserts that mapping so a diagnostic
 * vocabulary cannot outgrow the action vocabulary. What was missing is the step
 * between: the caller still had to read prose, pick a tool, and invent the
 * arguments.
 *
 * A 0.5B model driving the MCP surface failed precisely there — "translating
 * finding fixes into mutation calls" was one of the named gaps — and it is the
 * most mechanical of them, which is why it is worth closing first.
 *
 * WHAT THIS DOES NOT DO. It does not guess. A fix that does not carry enough
 * information to be performed is refused BY NAME, saying what is missing and
 * which tool takes it. Half the fixes in the engine are advice — "reroute
 * around this box" cannot be executed without knowing where the author wants
 * the path to go — and inventing a plausible-looking mutation for those would
 * be exactly the silent wrongness the rest of the engine refuses.
 */

import { validate } from './collide.js';

/** Fix kind -> the operation that performs it, and how to build its arguments. */
const EXECUTABLE = Object.freeze({
  widen: {
    op: 'resize',
    build: (fix, f) => (fix.to == null ? null : { id: f.actors[0], cellsW: fix.to }),
    needs: 'a target width (`to`)',
  },
  heighten: {
    op: 'resize',
    build: (fix, f) => (fix.to == null ? null : { id: f.actors[0], cellsH: fix.to }),
    needs: 'a target height (`to`)',
  },
  font: {
    op: 'restyle',
    build: (fix, f) => (fix.to == null ? null : { id: f.actors[0], fontSize: fix.to }),
    needs: 'a target font size (`to`)',
  },
  shape: {
    op: 'restyle',
    build: (fix, f) => (fix.to == null ? null : { id: f.actors[0], shape: fix.to }),
    needs: 'a target shape (`to`)',
  },
  move: {
    op: 'move',
    build: (fix) => {
      const p = fix.params ?? {};
      if (p.dCellsX == null && p.dCellsY == null) return null;
      return { id: p.id, cellsX: p.dCellsX ?? 0, cellsY: p.dCellsY ?? 0 };
    },
    needs: 'a distance (`params.dCellsX` or `params.dCellsY`)',
  },
  canvas: {
    op: 'set_canvas',
    build: (fix) => {
      const p = fix.params ?? {};
      return p.cols == null && p.rows == null ? null : { cols: p.cols, rows: p.rows };
    },
    needs: 'the new bounds (`params.cols` / `params.rows`)',
  },
  intent: {
    op: 'update_page',
    build: (fix) => {
      const p = fix.params ?? {};
      return p.id == null || p.intent == null ? null : { id: p.id, intent: p.intent };
    },
    needs: 'a page and an intent (`params.id`, `params.intent`)',
  },
  remove: {
    op: 'remove',
    build: (fix, f) => ({ id: fix.params?.id ?? f.actors[f.actors.length - 1] }),
    needs: 'an element id',
  },
  remove_page: {
    op: 'remove_page',
    build: (fix) => (fix.params?.id == null ? null : { id: fix.params.id }),
    needs: 'a page id (`params.id`)',
  },
});

/** Fixes that are advice by nature: performing them needs a human decision. */
const ADVISORY = Object.freeze({
  reroute: 'where the path should go instead is a design decision — use `route` to propose one, or `replace_path` with a program you chose',
  offset: 'which side to shift onto is a design decision — use `replace_path` with the other alignment',
  hop: 'where to cross is a design decision — use `replace_path` with a hop piece at the crossing',
  extend: 'how far to extend, and to what, is a design decision — use `extend_path`',
  rename: 'the new name is yours to choose — use `rename`',
  shorten: 'which words to cut is yours to choose — use `restyle` with a shorter label',
});

/**
 * Describe what could be done about a finding, without doing any of it.
 *
 * Returned per fix so a caller can see at a glance which are one call away and
 * which need a decision first.
 */
export function repairPlan(doc, fingerprint) {
  const log = validate(doc);
  const finding = log.open.find((f) => f.fingerprint === fingerprint);
  if (!finding) {
    throw new Error(
      `no open finding "${fingerprint}" in the current validation. `
      + 'Findings are fingerprinted to exact geometry, so a stale fingerprint means the drawing '
      + 'has changed since it was reported — validate again and use a current one.',
    );
  }

  return {
    fingerprint,
    rule: finding.rule,
    severity: finding.severity,
    actors: finding.actors,
    fixes: (finding.fixes ?? []).map((fix, index) => {
      const spec = EXECUTABLE[fix.kind];
      if (!spec) {
        return {
          index,
          kind: fix.kind,
          executable: false,
          description: fix.description,
          why: ADVISORY[fix.kind] ?? 'this fix has no operation that performs it',
        };
      }
      const args = spec.build(fix, finding);
      return args
        ? { index, kind: fix.kind, executable: true, description: fix.description, op: spec.op, args }
        : {
          index,
          kind: fix.kind,
          executable: false,
          description: fix.description,
          why: `this ${fix.kind} fix does not carry ${spec.needs}`,
        };
    }),
  };
}

/**
 * Perform one fix.
 *
 * Goes through `OPERATIONS`, so it is the same code path as any other mutation:
 * rehearsable, undoable, and visible to `plan`. It cannot do anything a caller
 * could not have done by hand — it only saves them working out the arguments.
 */
export function applyFix(doc, fingerprint, index, OPERATIONS) {
  const plan = repairPlan(doc, fingerprint);
  const fix = plan.fixes[index];
  if (!fix) throw new Error(`finding "${fingerprint}" has no fix at index ${index}`);
  if (!fix.executable) {
    throw new Error(
      `fix ${index} ("${fix.kind}") cannot be applied automatically: ${fix.why}. `
      + 'Refusing rather than guessing at a mutation you did not ask for.',
    );
  }
  const before = validate(doc).open.length;
  OPERATIONS[fix.op](doc, fix.args);
  const after = validate(doc).open.length;
  return {
    applied: { kind: fix.kind, op: fix.op, args: fix.args },
    findingsBefore: before,
    findingsAfter: after,
    // Reported plainly. A repair that does not reduce the count is not
    // necessarily wrong — it may have traded one finding for another — but the
    // caller should be told rather than left to assume progress.
    improved: after < before,
  };
}
