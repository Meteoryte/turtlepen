/**
 * Noticing when an authoring loop has stopped getting anywhere.
 *
 * A 0.5B model driving this surface produced runs where it edited, validated,
 * edited, validated, and never reduced the finding set — "recognizing
 * no-progress loops" was named as something the interface silently assumes the
 * caller can do. A stronger model does it by noticing; a weaker one does not do
 * it at all, and neither is told.
 *
 * This is not a collision rule and never becomes one. It says nothing about the
 * drawing — only about the sequence of attempts on it — so it lives outside the
 * geometry like perceptual review does, and it advises rather than blocks. An
 * author repeating themselves deliberately is allowed to; they just get told
 * that is what is happening.
 */

import crypto from 'node:crypto';

/** How many identical checks in a row before it is worth saying something. */
export const STAGNATION_AFTER = 3;

/**
 * A comparable fingerprint of a validation result.
 *
 * The COUNT alone is not enough: fixing one finding while introducing another
 * leaves the count unchanged and is real progress, or real churn, depending on
 * whether the set changed. Hashing the finding identities distinguishes them.
 */
export function digestOf(log) {
  const ids = (log.open ?? []).map((f) => f.fingerprint ?? `${f.rule}:${(f.actors ?? []).join(',')}`);
  return crypto.createHash('sha256').update(ids.sort().join('|')).digest('hex').slice(0, 12);
}

export function createProgressLog() {
  return { checks: [] };
}

/**
 * Record one validation.
 *
 * `mutations` is whatever monotonically counts edits — the history depth is the
 * natural source. It matters because validating twice without editing is not
 * stagnation, it is just looking twice.
 */
export function recordCheck(progress, log, mutations) {
  progress.checks.push({ digest: digestOf(log), open: (log.open ?? []).length, mutations });
  if (progress.checks.length > 12) progress.checks.shift();
  return progress;
}

/**
 * Has the loop stopped moving?
 *
 * Returns a message or null. Three consecutive checks with the same finding set
 * AND edits between them means the edits are not addressing what is being
 * reported — which is the moment to change approach rather than try again.
 */
export function stagnationNote(progress) {
  const checks = progress.checks ?? [];
  if (checks.length < STAGNATION_AFTER) return null;

  const recent = checks.slice(-STAGNATION_AFTER);
  const sameSet = recent.every((c) => c.digest === recent[0].digest);
  if (!sameSet) return null;
  if (recent[0].open === 0) return null;                       // repeatedly clean is fine

  const edits = recent[recent.length - 1].mutations - recent[0].mutations;
  if (edits <= 0) return null;                                 // looked twice, did not edit

  return `NO PROGRESS: ${edits} edit(s) across the last ${STAGNATION_AFTER} checks and the same `
    + `${recent[0].open} finding(s) are still open — not merely the same count, the same findings. `
    + 'Whatever is being changed is not what is being reported. Read one finding, use `repair` to see '
    + 'which of its fixes is a single call, and if none is, change the approach rather than the edit.';
}
