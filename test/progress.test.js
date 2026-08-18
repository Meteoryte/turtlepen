/**
 * No-progress detection.
 *
 * It watches the sequence of attempts, never the drawing. So the tests care
 * about when it stays quiet as much as when it speaks: a guard that cries wolf
 * teaches you to ignore it, which is worse than not having one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createProgressLog, recordCheck, stagnationNote, digestOf, STAGNATION_AFTER,
} from '../src/core/progress.js';

const log = (...fingerprints) => ({ open: fingerprints.map((f) => ({ fingerprint: f })) });

test('the digest tracks WHICH findings are open, not how many', () => {
  // Trading one finding for another leaves the count identical but is not the
  // same state, and must not read as stagnation.
  assert.equal(digestOf(log('a', 'b')), digestOf(log('b', 'a')), 'order must not matter');
  assert.notEqual(digestOf(log('a', 'b')), digestOf(log('a', 'c')));
});

test('it stays quiet until there is a pattern', () => {
  const p = createProgressLog();
  recordCheck(p, log('a'), 1);
  assert.equal(stagnationNote(p), null);
  recordCheck(p, log('a'), 2);
  assert.equal(stagnationNote(p), null, `fewer than ${STAGNATION_AFTER} checks is not a loop`);
});

test('it speaks when edits stop changing what is reported', () => {
  const p = createProgressLog();
  recordCheck(p, log('a', 'b'), 1);
  recordCheck(p, log('a', 'b'), 2);
  recordCheck(p, log('a', 'b'), 3);
  const note = stagnationNote(p);
  assert.match(note, /NO PROGRESS/);
  assert.match(note, /2 edit\(s\)/);
  assert.match(note, /the same findings/);
});

test('validating repeatedly without editing is not stagnation', () => {
  // Looking twice is allowed. Only edits that change nothing count.
  const p = createProgressLog();
  for (let i = 0; i < 4; i++) recordCheck(p, log('a'), 7);
  assert.equal(stagnationNote(p), null);
});

test('a clean document repeatedly checked is never nagged', () => {
  const p = createProgressLog();
  recordCheck(p, log(), 1);
  recordCheck(p, log(), 2);
  recordCheck(p, log(), 3);
  assert.equal(stagnationNote(p), null, 'being finished is not being stuck');
});

test('real progress silences it', () => {
  const p = createProgressLog();
  recordCheck(p, log('a', 'b'), 1);
  recordCheck(p, log('a', 'b'), 2);
  recordCheck(p, log('a'), 3);
  assert.equal(stagnationNote(p), null);
});

test('swapping one finding for another is not treated as standing still', () => {
  const p = createProgressLog();
  recordCheck(p, log('a'), 1);
  recordCheck(p, log('b'), 2);
  recordCheck(p, log('c'), 3);
  assert.equal(stagnationNote(p), null, 'the set changed every time, so something is happening');
});

test('the log does not grow without bound', () => {
  const p = createProgressLog();
  for (let i = 0; i < 40; i++) recordCheck(p, log('a'), i);
  assert.ok(p.checks.length <= 12);
});
