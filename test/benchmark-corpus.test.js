/**
 * The frozen benchmark corpus.
 *
 * "Frozen" is worth nothing as a promise. The digest lock below is what makes
 * it real: editing an existing task changes the hash and fails the build, so
 * the evaluation cannot be quietly rewritten around whatever the implementation
 * currently does. That is the single most important property a benchmark can
 * have, and the easiest one to lose.
 *
 * Adding a task is allowed — with a new id, and by updating the lock in the
 * same commit, so the change is visible in review rather than invisible in a
 * score.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const corpus = JSON.parse(fs.readFileSync(new URL('../benchmark/corpus-v1.json', import.meta.url), 'utf8'));

/** Bump this ONLY when deliberately adding tasks, never to make a test pass. */
const FROZEN_DIGEST = 'faa3b77133f8db81';

test('the corpus is frozen', () => {
  const digest = crypto.createHash('sha256').update(JSON.stringify(corpus.tasks)).digest('hex').slice(0, 16);
  assert.equal(
    digest, FROZEN_DIGEST,
    'the corpus changed. If you ADDED a task, update FROZEN_DIGEST in the same commit so it is '
    + 'reviewable. If you EDITED an existing task, do not — a benchmark you can rewrite around '
    + 'current behaviour measures nothing.',
  );
});

test('every task is fully specified', () => {
  const required = ['id', 'partition', 'category', 'intent', 'requiredObjects',
    'requiredRelationships', 'requiredText', 'structural', 'perceptual', 'humanQuestion'];
  for (const t of corpus.tasks) {
    for (const key of required) {
      assert.ok(key in t, `${t.id ?? '(unnamed)'} is missing "${key}"`);
    }
    assert.ok(t.intent.length > 20, `${t.id} needs a real intent, not a stub`);
  }
});

test('task ids are unique and stable in shape', () => {
  const ids = corpus.tasks.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate task id');
  for (const id of ids) assert.match(id, /^T\d{2}-[a-z0-9-]+$/, `${id} does not follow T##-slug`);
});

test('there is a holdout partition that is not merely decorative', () => {
  const holdout = corpus.tasks.filter((t) => t.partition === 'holdout');
  assert.ok(holdout.length >= 3, 'a holdout of one or two tasks proves nothing');
  for (const t of holdout) assert.ok(t.humanQuestion, `${t.id} needs a human question`);
});

test('negative cases exist and state what a correct scorer should do', () => {
  // Without these a benchmark rewards whatever the system already does well.
  const negatives = corpus.tasks.filter((t) => t.category === 'negative');
  assert.ok(negatives.length >= 4, 'a benchmark with no traps measures enthusiasm');
  for (const t of negatives) {
    assert.ok(t.expectation, `${t.id} must say what a correct scorer concludes`);
  }
});

test('the rubric refuses to let a sparse artifact win', () => {
  assert.match(corpus.scoring.rule, /sparse artifact never wins/i);
  assert.ok(corpus.scoring.structural.length && corpus.scoring.semantic.length
    && corpus.scoring.perceptual.length && corpus.scoring.workflow.length,
  'all four score dimensions must be present — collapsing them is how a clean log passes a wrong drawing');
});
