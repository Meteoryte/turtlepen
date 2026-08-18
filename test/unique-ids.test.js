/**
 * Unique ids, and refusals that offer a way forward.
 *
 * The engine always refused duplicates. What it did not do was say what to use
 * instead — and "maintaining unique IDs" was one of the things a small model
 * could not do unaided.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { suggestFreeId } from '../src/core/document.js';
import { createDocument, placeBox, createGroup } from '../src/core/index.js';

function docWith(...ids) {
  const doc = createDocument({ name: 'ids', canvas: { cols: 60, rows: 40 } });
  ids.forEach((id, i) => placeBox(doc, 'base', { id, at: `C${3 + i * 5}`, span: '6x3', label: id }));
  return doc;
}

test('a duplicate id is still refused', () => {
  const doc = docWith('step');
  assert.throws(() => placeBox(doc, 'base', { id: 'step', at: 'W3', span: '6x3', label: 'x' }),
    /already exists/);
});

test('the refusal names a free id', () => {
  const doc = docWith('step');
  assert.throws(() => placeBox(doc, 'base', { id: 'step', at: 'W3', span: '6x3', label: 'x' }),
    /"step-2" is free/);
});

test('it skips ids that are also taken', () => {
  const doc = docWith('step', 'step-2', 'step-3');
  assert.equal(suggestFreeId(doc, 'step'), 'step-4');
});

test('it does not stack suffixes on an already-numbered id', () => {
  // "step-2" must suggest "step-3", never "step-2-2".
  const doc = docWith('step', 'step-2');
  assert.equal(suggestFreeId(doc, 'step-2'), 'step-3');
});

test('a group id collision is refused and suggests too', () => {
  const doc = docWith('a', 'b');
  createGroup(doc, { id: 'team', members: ['a', 'b'] });
  assert.throws(() => placeBox(doc, 'base', { id: 'team', at: 'W3', span: '6x3', label: 'x' }),
    /"team-2" is free/);
});

test('the suggestion is actually usable', () => {
  const doc = docWith('step');
  const free = suggestFreeId(doc, 'step');
  assert.doesNotThrow(() => placeBox(doc, 'base', { id: free, at: 'W3', span: '6x3', label: 'x' }));
});
