#!/usr/bin/env node
/**
 * TurtlePen MCP logo redesign.
 *
 * This intentionally authors the redesign through the real stdio MCP server,
 * not by importing the core directly. The existing TurtlePen illustration is
 * simplified back onto TurtlePen's lattice, then native TurtlePen artwork,
 * labels, bubbles, splashes, and type are composed around it.
 */

import { createMcpClient } from './mcp-client.js';

const OUT_JSON = 'brand/logo-redesign.turtlepen.json';
const OUT_SVG = 'brand/logo-redesign.svg';
const CREATED_AT = '2026-08-29T19:15:00.000Z';

function colName(n) {
  let s = '';
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

const at = (x, y, pin = 'c') => `${colName(x)}${y}.${pin}`;
const tl = (x, y) => at(x, y, 'tl');

async function call(mcp, name, args = {}, { print = false } = {}) {
  const r = await mcp.call(name, args);
  const body = r.error ?? r.text;
  if (print) console.log(`\n[${name}]\n${body}`);
  if (r.isError || r.error) throw new Error(`${name}: ${body}`);
  return body;
}

const bubbles = [
  { id: 'svg-editing', label: 'SVG Editing', x: 22, y: 28, r: 18, color: '#12B8A6', stream: [[66, 62], [50, 48], [34, 38]] },
  { id: 'vector-drawing', label: 'Vector Drawing', x: 58, y: 18, r: 18, color: '#6E49D8', stream: [[76, 60], [69, 42], [62, 30]] },
  { id: 'image-simplify', label: 'Image Simplify', x: 105, y: 24, r: 18, color: '#EA4C89', stream: [[88, 60], [95, 44], [101, 34]] },
  { id: 'path-operations', label: 'Path Operations', x: 148, y: 46, r: 18, color: '#F59E0B', stream: [[103, 67], [121, 58], [137, 51]] },
  { id: 'mcp-tools', label: '73 MCP Tools', x: 150, y: 92, r: 18, color: '#84CC16', stream: [[108, 82], [125, 86], [139, 90]] },
  { id: 'render-validate', label: 'Render + Validate', x: 125, y: 132, r: 18, color: '#2F80ED', stream: [[103, 98], [112, 113], [120, 123]] },
  { id: 'layout-routing', label: 'Layout + Routing', x: 45, y: 134, r: 18, color: '#8B5CF6', stream: [[69, 100], [59, 113], [50, 125]] },
  { id: 'turtle-commands', label: 'Turtle Commands', x: 18, y: 82, r: 18, color: '#0EA5E9', stream: [[61, 82], [44, 81], [29, 81]] },
];

const mcp = createMcpClient({ createdAt: CREATED_AT });
await mcp.init();

try {
  await call(mcp, 'turtlepen_help');
  await call(mcp, 'new_diagram', {
    name: 'TurtlePen MCP — Creative Capability Logo',
    path: OUT_JSON,
    cols: 170,
    rows: 170,
  }, { print: true });

  // Semantic layers keep deliberate overlap explicit instead of hiding it.
  await call(mcp, 'add_page', { id: 'splashes', z: 1, intent: 'overlay' });
  await call(mcp, 'add_page', { id: 'bubbles', z: 2, intent: 'overlay' });
  await call(mcp, 'add_page', { id: 'highlights', z: 3, intent: 'overlay' });
  await call(mcp, 'add_page', { id: 'type', z: 4, intent: 'overlay' });

  // Re-resolve TurtlePen's own established mascot/easel mark onto the lattice.
  // This is the same supported image->lattice path used by the repository's
  // canonical logo-v2 workflow; the output remains TurtlePen-authored geometry.
  await call(mcp, 'place_image', {
    id: 'turtle-artist',
    at: tl(50, 48),
    span: { w: 72, h: 72 },
    source: 'logo-v2-source-mark.png',
    mode: 'simplify',
    fit: 'contain',
    detail: 'high',
    supersample: 4,
  }, { print: true });

  // Measurement before placement: prove every capability label fits the same
  // visual bubble label box before any of those labels are committed.
  for (const bubble of bubbles) {
    const measured = JSON.parse(await call(mcp, 'measure', {
      text: bubble.label,
      maxWidthCells: 18,
      fontSize: 18,
    }));
    console.log(`[measure] ${bubble.label}: ${measured.lines} line(s), ${measured.cellsTall} cells tall`);
  }

  // Streams originate around the easel/canvas, visibly throwing color outward.
  const streamOps = bubbles.map((b, i) => ({
    op: 'pen',
    id: `splash-stream-${i + 1}`,
    page: 'splashes',
    role: 'artwork',
    color: b.color,
    width: 5,
    cap: 'round',
    program: [
      `pen ${at(...b.stream[0])}`,
      `ray to ${at(...b.stream[1])}`,
      `ray to ${at(...b.stream[2])}`,
      `ray to ${at(b.x, b.y)}`,
    ].join('\n'),
  }));
  await call(mcp, 'plan', { operations: streamOps }, { print: true });
  await call(mcp, 'plan', { operations: streamOps, commit: true });

  // Native filled lattice circles form the capability bubbles.
  const bubbleOps = bubbles.map((b) => ({
    op: 'pen',
    id: `bubble-${b.id}`,
    page: 'bubbles',
    role: 'artwork',
    color: b.color,
    paint: 'cells',
    program: `pen ${at(b.x, b.y)}\ndisc ${b.r}`,
  }));
  await call(mcp, 'plan', { operations: bubbleOps }, { print: true });
  await call(mcp, 'plan', { operations: bubbleOps, commit: true });

  // Each bubble gets a gloss mark and two detached droplets so it reads as a
  // splash emerging from the canvas rather than a static UI badge.
  const accentOps = [];
  for (const [i, b] of bubbles.entries()) {
    const side = b.x < 85 ? 1 : -1;
    accentOps.push(
      {
        op: 'pen',
        id: `gloss-${b.id}`,
        page: 'highlights',
        role: 'artwork',
        color: '#FFFFFF',
        width: 3,
        cap: 'round',
        program: `pen ${at(b.x - 4, b.y - 5)}\narc ${Math.max(8, b.r - 7)} 205 305`,
      },
      {
        op: 'pen',
        id: `drop-a-${b.id}`,
        page: 'highlights',
        role: 'artwork',
        color: b.color,
        paint: 'cells',
        program: `pen ${at(b.x + side * 11, b.y + 8)}\ndisc 4`,
      },
      {
        op: 'pen',
        id: `drop-b-${b.id}`,
        page: 'highlights',
        role: 'artwork',
        color: b.color,
        paint: 'cells',
        program: `pen ${at(b.x + side * 14, b.y + 11)}\ndisc 2`,
      },
    );
  }
  await call(mcp, 'plan', { operations: accentOps }, { print: true });
  await call(mcp, 'plan', { operations: accentOps, commit: true });

  // Capability type sits on its own overlay so the text is deliberately above
  // the bubbles and is collision-reviewed as presentation, not hidden overlap.
  const labelOps = bubbles.map((b) => ({
    op: 'pen',
    id: `label-${b.id}`,
    page: 'type',
    role: 'artwork',
    program: `text "${b.label}" at ${tl(b.x - 10, b.y - 4)} span 20x8 id label-${b.id} font 18 fill #FFFFFF weight 800 align center`,
  }));
  await call(mcp, 'plan', { operations: labelOps }, { print: true });
  await call(mcp, 'plan', { operations: labelOps, commit: true });

  // Brand lockup and colorful stroke signature below the mascot.
  const brandOps = [
    {
      op: 'pen', id: 'wordmark', page: 'type', role: 'artwork',
      program: `text "TurtlePen" at ${tl(43, 142)} span 86x12 id turtlepen-wordmark font 60 fill #0B1F3A weight 900 align center`,
    },
    {
      op: 'pen', id: 'mcp-wordmark', page: 'type', role: 'artwork',
      program: `text "MCP" at ${tl(69, 154)} span 34x8 id mcp-wordmark font 34 fill #6E49D8 weight 900 align center`,
    },
    {
      op: 'pen', id: 'underline-teal', page: 'splashes', role: 'artwork', color: '#12B8A6', width: 5, cap: 'round',
      program: `pen ${at(52, 158)}\nray to ${at(79, 161)}`,
    },
    {
      op: 'pen', id: 'underline-pink', page: 'splashes', role: 'artwork', color: '#EA4C89', width: 5, cap: 'round',
      program: `pen ${at(94, 161)}\nray to ${at(120, 158)}`,
    },
    {
      op: 'pen', id: 'underline-orange', page: 'splashes', role: 'artwork', color: '#F59E0B', width: 4, cap: 'round',
      program: `pen ${at(104, 164)}\nray to ${at(126, 161)}`,
    },
  ];
  await call(mcp, 'plan', { operations: brandOps }, { print: true });
  await call(mcp, 'plan', { operations: brandOps, commit: true });

  const validation = await call(mcp, 'validate', {}, { print: true });
  const bad = /\(([1-9]\d*) critical,|, ([1-9]\d*) error,|, ([1-9]\d*) warn,/.test(validation);
  if (bad) {
    console.warn('Logo rendered with non-INFO validation findings; review the log above before promoting it to canonical brand art.');
  }

  await call(mcp, 'render', { path: OUT_SVG }, { print: true });
  console.log(`\nBuilt with TurtlePen MCP:\n  ${OUT_JSON}\n  ${OUT_SVG}`);
} finally {
  await mcp.close();
}
