import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../src/core/index.js';

function model() {
  const doc = core.createDocument({ name: 'model', canvas: { cols: 50, rows: 30 } });
  core.placeBox(doc, 'base', { id: 'api', at: 'C8.tl', span: '6x3', label: 'API' });
  core.placeBox(doc, 'base', { id: 'db', at: 'S8.tl', span: '6x3', label: 'DB' });
  core.placeBox(doc, 'base', { id: 'orphan', at: 'C20.tl', span: '6x3', label: 'Orphan' });
  core.connectNodes(doc, { id: 'query', from: 'api.E', to: 'db.W', routing: 'direct' });
  return doc;
}

test('model inspections enumerate semantic omissions without changing geometry validation', () => {
  const doc = model();
  const geometryBefore = JSON.stringify(core.validate(doc));
  const result = core.inspectModel(doc);
  assert.ok(result.findings.some((entry) => entry.rule === 'M001' && entry.element === 'api'));
  assert.ok(result.findings.some((entry) => entry.rule === 'M002' && entry.element === 'query'));
  assert.ok(result.findings.some((entry) => entry.rule === 'M003' && entry.element === 'orphan'));
  assert.ok(result.findings.some((entry) => entry.rule === 'M004' && entry.element === 'query'));
  assert.equal(JSON.stringify(core.validate(doc)), geometryBefore);
});

test('annotations clear the relevant inspections and severity filtering is exact', () => {
  const doc = model();
  core.annotateElement(doc, 'api', { description: 'serves requests' });
  core.annotateElement(doc, 'db', { description: 'stores records' });
  core.annotateElement(doc, 'orphan', { description: 'awaiting integration' });
  core.annotateElement(doc, 'query', { description: 'queries records', technology: 'SQL/TCP' });

  const all = core.inspectModel(doc);
  assert.ok(!all.findings.some((entry) => ['M001', 'M002', 'M004'].includes(entry.rule)));
  assert.deepEqual(core.inspectModel(doc, { minimum: 'error' }).findings, []);
});

test('a broken semantic endpoint is an inspection error, not a crash', () => {
  const doc = model();
  core.removeElement(doc, 'db');
  const result = core.inspectModel(doc, { minimum: 'error' });
  assert.equal(result.summary.error, 1);
  assert.equal(result.findings[0].rule, 'M005');
});
