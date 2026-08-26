import assert from 'node:assert/strict';
import test from 'node:test';

import * as core from '../src/core/index.js';

function architecture() {
  const doc = core.createDocument({ name: 'architecture' });
  core.placeBox(doc, 'base', { id: 'web', at: 'C4.tl', span: '6x3', label: 'Web' });
  core.placeBox(doc, 'base', { id: 'api', at: 'C14.tl', span: '6x3', label: 'API' });
  core.placeBox(doc, 'base', { id: 'db', at: 'C24.tl', span: '6x3', label: 'DB' });
  core.annotateElement(doc, 'web', { tags: ['public'], perspectives: { risk: 'medium' } });
  core.annotateElement(doc, 'api', { tags: ['service'], perspectives: { risk: 'high' } });
  core.annotateElement(doc, 'db', { tags: ['data'], perspectives: { risk: 'high' } });
  core.connectNodes(doc, { id: 'request', from: 'web.S', to: 'api.N', routing: 'direct', description: 'request' });
  core.connectNodes(doc, { id: 'query', from: 'api.S', to: 'db.N', routing: 'direct', description: 'query' });
  return doc;
}

test('schema 3 migrates old models and round-trips workspace state', () => {
  const old = JSON.parse(core.serialize(architecture()));
  delete old.views; delete old.theme; delete old.resources; delete old.modelAcceptances;
  old.schema = 2;
  const migrated = core.deserialize(old);
  assert.equal(migrated.schema, 3);
  assert.deepEqual(migrated.views, []);
  assert.equal(migrated.theme.name, 'TurtlePen');
  assert.deepEqual(migrated.resources, []);
  assert.equal(core.serialize(core.deserialize(core.serialize(migrated))), core.serialize(migrated));
});

test('filtered views project shared elements and include connecting relationships', () => {
  const doc = architecture();
  core.defineView(doc, { key: 'runtime', type: 'filtered', includeTags: ['service', 'data'] });
  const view = core.resolveView(doc, 'runtime');
  assert.deepEqual([...view.elementIds].sort(), ['api', 'db', 'query']);
  assert.equal(core.findElement(doc, 'api').element, view.elements.find((entry) => entry.id === 'api'));
});

test('dynamic views preserve explicit relationship order and endpoint context', () => {
  const doc = architecture();
  core.defineView(doc, { key: 'login', type: 'dynamic', order: ['request', 'query'], direction: 'left-right' });
  const view = core.resolveView(doc, 'login');
  assert.deepEqual([...view.relationshipOrder], [['request', 1], ['query', 2]]);
  assert.deepEqual([...view.elementIds].sort(), ['api', 'db', 'query', 'request', 'web']);
  assert.throws(() => core.defineView(doc, { key: 'bad', type: 'dynamic', order: [] }), /needs an ordered relationship list/);
});

test('tag and perspective styling produce a generated key', () => {
  const doc = architecture();
  core.configureTheme(doc, {
    name: 'Architecture',
    tagStyles: [{ tag: 'service', fill: '#ccddee', stroke: '#223344' }],
    perspectiveStyles: [{ perspective: 'risk', value: 'high', fill: '#eecccc' }],
  });
  core.defineView(doc, { key: 'risk', type: 'static', perspective: 'risk' });
  assert.equal(core.styleForElement(doc, core.findElement(doc, 'api').element, 'risk').fill, '#eecccc');
  const key = core.generatedKey(doc, 'risk');
  assert.ok(key.entries.some((entry) => entry.label === 'service'));
  assert.ok(key.entries.some((entry) => entry.label === 'risk: high'));
});

test('resources are durable references and removal never reaches their targets', () => {
  const doc = architecture();
  core.upsertResource(doc, { id: 'decision-1', type: 'adr', uri: 'docs/adr-001.md', label: 'Use queues' });
  const reopened = core.deserialize(core.serialize(doc));
  assert.equal(reopened.resources[0].uri, 'docs/adr-001.md');
  core.removeResource(reopened, 'decision-1');
  assert.deepEqual(reopened.resources, []);
});

test('semantic findings are fingerprinted, accepted with reasons, and lapse after repair', () => {
  const doc = architecture();
  const finding = core.inspectModel(doc).open.find((entry) => entry.rule === 'M001' && entry.element === 'web');
  assert.match(finding.fingerprint, /^[0-9a-f]{16}$/);
  core.acceptModelFinding(doc, finding.fingerprint, 'Description is intentionally deferred until the API contract is approved.');
  assert.ok(core.inspectModel(doc).accepted.some((entry) => entry.fingerprint === finding.fingerprint));
  const reopened = core.deserialize(core.serialize(doc));
  assert.equal(reopened.modelAcceptances[0].reason, 'Description is intentionally deferred until the API contract is approved.');
  core.annotateElement(reopened, 'web', { description: 'serves the public application' });
  assert.equal(core.inspectModel(reopened).stale.length, 1);
});
