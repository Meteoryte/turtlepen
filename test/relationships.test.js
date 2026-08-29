import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../src/core/index.js';
import { createSession, createTools } from '../src/mcp/tools.js';

function pair() {
  const doc = core.createDocument({ name: 'relationships', canvas: { cols: 50, rows: 30 } });
  core.placeBox(doc, 'base', { id: 'source', at: 'C10.tl', span: '6x3', label: 'Source' });
  core.placeBox(doc, 'base', { id: 'target', at: 'S10.tl', span: '6x3', label: 'Target' });
  return doc;
}

test('a curved relationship starts and ends at named node ports through an explicit bend', () => {
  const doc = pair();
  const result = core.connectNodes(doc, {
    id: 'request', from: 'source.E', to: 'target.W', routing: 'curved', via: ['K5.q1'],
    description: 'sends an approval request', technology: 'HTTPS', tags: ['sync', 'critical'],
  });

  assert.deepEqual(result.path.source, { id: 'source', port: 'E' });
  assert.deepEqual(result.path.targets, [{ id: 'target', port: 'W', step: 1 }]);
  assert.deepEqual(result.path.relationship, {
    from: { id: 'source', port: 'E' }, to: { id: 'target', port: 'W' }, routing: 'curved', via: ['K5.q1'],
  });
  assert.equal(result.path.pieces.at(-1).type, 'arrow');
  assert.equal(result.path.pieces.at(-1).dir, 'right');
  assert.equal(core.validate(doc).summary.state, 'structurally-clear');
});

test('curved routing refuses to invent its bend', () => {
  const doc = pair();
  const before = core.serialize(doc);
  assert.throws(
    () => core.connectNodes(doc, { id: 'request', from: 'source.E', to: 'target.W', routing: 'curved' }),
    /needs at least one explicit via address/,
  );
  assert.equal(core.serialize(doc), before, 'a refused curve leaves the document byte-identical');
});

test('direct, orthogonal, and curved routing remain literal and persistent', () => {
  const direct = pair();
  core.connectNodes(direct, { id: 'edge', from: 'source.E', to: 'target.W', routing: 'direct' });
  assert.equal(core.findElement(direct, 'edge').element.relationship.routing, 'direct');

  const orthogonal = core.createDocument({ name: 'orthogonal', canvas: { cols: 30, rows: 35 } });
  core.placeBox(orthogonal, 'base', { id: 'top', at: 'H4.tl', span: '6x3', label: 'Top' });
  core.placeBox(orthogonal, 'base', { id: 'bottom', at: 'H18.tl', span: '6x3', label: 'Bottom' });
  core.connectNodes(orthogonal, { id: 'edge', from: 'top.S', to: 'bottom.N', routing: 'orthogonal' });
  assert.equal(core.findElement(orthogonal, 'edge').element.relationship.routing, 'orthogonal');

  const curved = pair();
  core.connectNodes(curved, { id: 'edge', from: 'source.E', to: 'target.W', routing: 'curved', via: ['K5.q1'] });
  const reopened = core.deserialize(core.serialize(curved));
  assert.deepEqual(core.findElement(reopened, 'edge').element.relationship, core.findElement(curved, 'edge').element.relationship);
});

test('semantic annotations persist and describe returns them for nodes and relationships', async () => {
  const doc = pair();
  core.annotateElement(doc, 'source', {
    description: 'accepts work', technology: 'Node.js', tags: ['service'],
    properties: { owner: 'platform' }, perspectives: { security: 'internet-facing' },
  });
  core.connectNodes(doc, {
    id: 'request', from: 'source.E', to: 'target.W', routing: 'curved', via: ['K5.q1'],
    description: 'delivers work', tags: ['async'],
  });

  const reopened = core.deserialize(core.serialize(doc));
  assert.equal(core.findElement(reopened, 'source').element.properties.owner, 'platform');
  assert.equal(core.findElement(reopened, 'request').element.description, 'delivers work');

  const session = createSession();
  session.doc = reopened;
  const describe = createTools(session).find((tool) => tool.name === 'describe');
  const output = JSON.parse(await describe.handler({}));
  const elements = output.flatMap((page) => page.elements);
  assert.equal(elements.find((element) => element.id === 'source').perspectives.security, 'internet-facing');
  assert.equal(elements.find((element) => element.id === 'request').relationship.routing, 'curved');
});

test('styled semantic relationships retain a visible arrowhead', () => {
  const doc = pair();
  core.connectNodes(doc, {
    id: 'request', from: 'source.E', to: 'target.W', routing: 'curved', via: ['K5.q1'], color: '#336699', width: 3,
  });
  const svg = core.renderSvg(doc);
  assert.match(svg, /fill="#336699" stroke="none"/, 'continuous styled ink still renders the authored arrow marker');
});

test('replace_path preserves relationship meaning only when endpoints still agree', () => {
  const doc = pair();
  core.connectNodes(doc, {
    id: 'request', from: 'source.E', to: 'target.W', routing: 'curved', via: ['K5.q1'], description: 'delivers work',
  });
  const replaced = core.replacePath(doc, 'request', 'pen from source.E\nright line to target.W arrow');
  assert.equal(replaced.path.description, 'delivers work');
  assert.equal(replaced.path.relationship.routing, 'manual');
  assert.deepEqual(replaced.path.relationship.from, { id: 'source', port: 'E' });
});

test('renaming a node updates relationship topology and pen endpoint references', () => {
  const doc = pair();
  core.connectNodes(doc, { id: 'request', from: 'source.E', to: 'target.W', routing: 'direct' });
  core.renameElement(doc, 'target', 'destination');
  const edge = core.findElement(doc, 'request').element;
  assert.equal(edge.targets[0].id, 'destination');
  assert.equal(edge.relationship.to.id, 'destination');
});

test('saved semantic metadata is validated on load instead of crashing later inspection', () => {
  const doc = pair();
  core.connectNodes(doc, { id: 'request', from: 'source.E', to: 'target.W', routing: 'direct' });
  const raw = JSON.parse(core.serialize(doc));
  raw.elements.base.find((element) => element.id === 'request').description = { unsafe: true };
  assert.throws(() => core.deserialize(raw), /description must be a non-empty string/);

  const topology = JSON.parse(core.serialize(doc));
  topology.elements.base.find((element) => element.id === 'request').relationship.routing = 'teleport';
  assert.throws(() => core.deserialize(topology), /unknown routing "teleport"/);
});
