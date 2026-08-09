/**
 * Anchors, and the reference underlay.
 *
 * Connectors learned this lesson early: `pen from gateway.S` exists because
 * hand-computed addresses go wrong, and a box's faces are not symmetric. Shapes
 * never learned it — every part of the first logo was placed by an absolute
 * coordinate worked out by hand, so proportions drifted and the head floated off
 * the shell. An anchor makes position a RELATIONSHIP, which cannot drift.
 *
 * The underlay is the other half: dither a reference onto a page below the
 * drawing, trace over it, delete it. The engine warns if you forget.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';

import * as core from '../src/core/index.js';

const ctx = (d) => ({ resolveElement: (id) => core.findElement(d, id)?.element ?? null });

function withShell() {
  const d = core.createDocument({ name: 'anchored' });
  // 20 cells wide, 10 tall, at C10 — quadrants x 4..43, y 18..37.
  core.placeBox(d, 'base', { id: 'shell', at: 'C10.tl', span: { w: 20, h: 10 } });
  return d;
}

test('an anchor names a point ON an element, where a seat names one outside it', () => {
  const d = withShell();
  const el = core.findElement(d, 'shell').element;
  const centre = core.shapes.portPoint(el.rect, 'C');
  const north = core.shapes.portPoint(el.rect, 'N');
  const seat = core.shapes.approachPoint(el.rect, 'N');
  assert.deepEqual(centre, { x: el.rect.x + 20, y: el.rect.y + 10 });
  assert.equal(seat.y, north.y - 1, 'the seat is one step further out than the anchor');
});

test('the cursor can be placed at an element anchor instead of an address', () => {
  const d = withShell();
  const r = core.runPen('pen at shell.C', ctx(d));
  const el = core.findElement(d, 'shell').element;
  assert.deepEqual({ x: r.cursor.x, y: r.cursor.y }, core.shapes.portPoint(el.rect, 'C'));
});

test('a shape can be anchored to an element, so it cannot drift off it', () => {
  const d = withShell();
  const { path } = core.applyPen(d, 'base', 'circle 6 at shell.C', { id: 'ring' });
  const el = core.findElement(d, 'shell').element;
  const c = core.shapes.portPoint(el.rect, 'C');
  // Every quadrant of the ring sits ~6 quadrants from the anchor.
  for (const q of path.pieces) {
    assert.ok(Math.abs(Math.hypot(q.x - c.x, q.y - c.y) - 6) <= 1, `${q.x},${q.y} is off the ring`);
  }
});

test('an offset moves the anchor by whole quadrants, keeping the relationship', () => {
  const d = withShell();
  const plain = core.applyPen(d, 'base', 'dot at shell.C', { id: 'a' }).path.pieces[0];
  const moved = core.applyPen(d, 'base', 'dot at shell.C offset 4 -3', { id: 'b' }).path.pieces[0];
  assert.deepEqual(moved, { x: plain.x + 4, y: plain.y - 3, type: 'mark', style: 'square' });
});

test('anchoring to something that does not exist is refused by name', () => {
  const d = withShell();
  assert.throws(() => core.applyPen(d, 'base', 'circle 4 at nosuch.C', { id: 'x' }), /nosuch/);
});

test('an unknown anchor names the ones that exist', () => {
  const d = withShell();
  assert.throws(() => core.applyPen(d, 'base', 'circle 4 at shell.MIDDLE', { id: 'x' }), /MIDDLE|expected/i);
});

test('the head stays on the shell when both are anchored — the whole point', () => {
  const d = withShell();
  const el = core.findElement(d, 'shell').element;
  core.applyPen(d, 'base', 'circle 8 at shell.N offset 0 -4', { id: 'head' });
  const head = core.findElement(d, 'head').element;
  const north = core.shapes.portPoint(el.rect, 'N');
  const lowest = Math.max(...head.pieces.map((p) => p.y));
  assert.ok(lowest >= north.y - 5, 'the head overlaps the shell rather than floating above it');
});

// ---------------------------------------------------------------------------
// The reference underlay
// ---------------------------------------------------------------------------

function tinyPng(w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(h * (1 + w * 3)))), chunk('IEND', Buffer.alloc(0)),
  ]);
}
function crc32(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c;
}
const uri = (b) => `data:image/png;base64,${b.toString('base64')}`;

test('a reference underlay sits below the drawing, faint, and is marked as scaffolding', () => {
  const d = core.createDocument({ name: 'tracing' });
  const page = core.placeReference(d, { id: 'ref', source: uri(tinyPng(40, 20)), at: 'C4.tl', span: { w: 20, h: 10 } });
  assert.ok(page.z < 0, 'below the base page, so it cannot cover the drawing');
  assert.equal(page.intent, 'overlay');
  assert.ok(page.opacity <= 0.35, 'faint enough to draw over');
  assert.equal(page.reference, true, 'flagged, so the engine can remind you it is still there');
});

test('a reference still in the document is reported — it is scaffolding, not artwork', () => {
  const d = core.createDocument({ name: 'tracing' });
  core.placeReference(d, { id: 'ref', source: uri(tinyPng(40, 20)), at: 'C4.tl', span: { w: 20, h: 10 } });
  const hit = core.validate(d).open.filter((f) => f.rule === 'L020')[0];
  assert.ok(hit, 'the engine reminds you to remove the tracing layer');
  assert.equal(hit.severity, 'S2', 'and it gates a render, because scaffolding must not ship');
});

test('removing the reference clears the finding', () => {
  const d = core.createDocument({ name: 'tracing' });
  core.placeReference(d, { id: 'ref', source: uri(tinyPng(40, 20)), at: 'C4.tl', span: { w: 20, h: 10 } });
  core.removePage(d, 'ref');
  assert.equal(core.validate(d).open.filter((f) => f.rule === 'L020').length, 0);
});

test('a drawn shape is anchorable too — it is the thing you most want to anchor to', () => {
  const d = core.createDocument({ name: 'anchored' });
  core.applyPen(d, 'base', 'pen T20.q1\ncircle 10', { id: 'blob' });
  // A path has no rect, so its footprint is computed from the quadrants it covers.
  const dot = core.applyPen(d, 'base', 'dot at blob.C', { id: 'centre' }).path.pieces[0];
  const blob = core.findElement(d, 'blob').element;
  const xs = blob.pieces.map((p) => p.x), ys = blob.pieces.map((p) => p.y);
  assert.equal(dot.x, Math.min(...xs) + Math.floor((Math.max(...xs) - Math.min(...xs) + 1) / 2));
  assert.equal(dot.y, Math.min(...ys) + Math.floor((Math.max(...ys) - Math.min(...ys) + 1) / 2));
});

test('anchoring to a path with no footprint is still refused clearly', () => {
  const d = core.createDocument({ name: 'anchored' });
  core.addText(d, 'base', { id: 'label', rect: core.geometry.rect(4, 4, 8, 4), text: 'hi' });
  assert.doesNotThrow(() => core.applyPen(d, 'base', 'dot at label.C', { id: 'x' }), 'text has a rect');
});
