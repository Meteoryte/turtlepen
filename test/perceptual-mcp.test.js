/**
 * The perceptual review loop through the real tool surface.
 *
 * The core module is already tested. What matters here is that an AGENT can
 * reach it: a capability the tools do not expose and the help does not name is
 * invisible, however good the module behind it is.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createTools } from '../src/mcp/tools.js';
import * as core from '../src/core/index.js';

function session() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-perceptual-'));
  return { cwd, doc: null, path: null };
}

const call = (tools, name, args = {}) => tools.find((t) => t.name === name).handler(args);

async function drawSomething(tools) {
  await call(tools, 'new_diagram', { name: 'sheep', cols: 40, rows: 20 });
  await call(tools, 'place_box', { id: 'sheep', at: 'D4', span: '14x6', label: 'sheep' });
}

test('the tool surface exposes perceptual review', () => {
  const tools = createTools(session());
  const t = tools.find((x) => x.name === 'perceptual_review');
  assert.ok(t, 'an agent must be able to reach it');
  const cat = t.inputSchema.properties.findings.items.properties.category.enum;
  assert.deepEqual([...cat], [...core.PERCEPTUAL_CATEGORIES], 'schema must track the closed set');
  // A finding without both halves is not a finding.
  assert.ok(t.inputSchema.properties.findings.items.required.includes('symptom'));
  assert.ok(t.inputSchema.properties.findings.items.required.includes('consequence'));
});

test('help names the capability', () => {
  const tools = createTools(session());
  const help = call(tools, 'turtlepen_help');
  const text = typeof help === 'string' ? help : help.text;
  for (const needle of ['PERCEPTUAL REVIEW', 'perceptual_review', 'renderHash', 'absence of a review is not a pass']) {
    assert.ok(text.toLowerCase().includes(needle.toLowerCase()), `help is missing "${needle}"`);
  }
});

test('render reports a renderHash so a review has something to bind to', async () => {
  const s = session();
  const tools = createTools(s);
  await drawSomething(tools);
  const out = await call(tools, 'render', { path: path.join(s.cwd, 'a.svg') });
  const match = /renderHash: ([0-9a-f]{16})/.exec(out);
  assert.ok(match, `render must report a renderHash, got: ${out}`);
  assert.equal(core.renderHash(fs.readFileSync(path.join(s.cwd, 'a.svg'), 'utf8')), match[1]);
});

test('an unreviewed document reports NOT REVIEWED, not clean', async () => {
  const tools = createTools(session());
  await drawSomething(tools);
  const out = await call(tools, 'perceptual_review', { action: 'status' });
  assert.match(out, /structural: CLEAN/);
  assert.match(out, /NOT REVIEWED/);
});

test('a recorded review returns both verdicts, unmerged', async () => {
  const s = session();
  const tools = createTools(s);
  await drawSomething(tools);
  const rendered = await call(tools, 'render', { path: path.join(s.cwd, 'a.svg') });
  const hash = /renderHash: ([0-9a-f]{16})/.exec(rendered)[1];

  const out = await call(tools, 'perceptual_review', {
    renderHash: hash,
    reviewer: 'test-critic',
    findings: [{
      id: 'p1',
      severity: 'P1',
      category: 'semantic-identity-mismatch',
      elements: ['sheep'],
      symptom: 'the back reads as a row of hard spikes',
      consequence: 'a reader identifies it as a stegosaurus',
      repair: 'redraw',
    }],
  });

  assert.match(out, /structural: CLEAN/, 'geometry is fine');
  assert.match(out, /1 blocking/, 'the picture is not');
  assert.match(out, /deliberately not combined/);
  assert.doesNotMatch(out, /STALE/);
});

test('editing after a review marks it stale through the tool surface', async () => {
  const s = session();
  const tools = createTools(s);
  await drawSomething(tools);
  const rendered = await call(tools, 'render', { path: path.join(s.cwd, 'a.svg') });
  const hash = /renderHash: ([0-9a-f]{16})/.exec(rendered)[1];
  await call(tools, 'perceptual_review', {
    renderHash: hash,
    reviewer: 'test-critic',
    findings: [{
      id: 'p1', severity: 'P1', category: 'ambiguous-silhouette',
      symptom: 'outline could be several animals', consequence: 'reader cannot name it',
    }],
  });

  await call(tools, 'place_box', { id: 'extra', at: 'X4', span: '6x4', label: 'new' });
  const out = await call(tools, 'perceptual_review', { action: 'status' });
  assert.match(out, /STALE/, 'the review describes bytes nobody is looking at now');
});

test('a bad category is refused at the tool boundary', async () => {
  const tools = createTools(session());
  await drawSomething(tools);
  await assert.rejects(
    async () => call(tools, 'perceptual_review', {
      renderHash: 'deadbeefdeadbeef', reviewer: 'r',
      findings: [{ id: 'x', severity: 'P1', category: 'vibes-off', symptom: 's', consequence: 'c' }],
    }),
    /unknown category/,
  );
});

test('recording a review is a rehearsable operation, not a tool-only mutation', () => {
  // llm.md: a mutation only the tool layer can perform is invisible to `plan`.
  assert.equal(typeof core.OPERATIONS.perceptual_review, 'function');
});
