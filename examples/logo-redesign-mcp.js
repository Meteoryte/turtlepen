#!/usr/bin/env node
/** Native TurtlePen MCP brand mark — no raster source. */
import { createMcpClient } from './mcp-client.js';

const OUT_JSON = 'brand/logo-redesign.turtlepen.json';
const OUT_SVG = 'brand/logo-redesign.svg';
const CREATED_AT = '2026-08-29T20:05:00.000Z';

function colName(n) {
  let s = '';
  while (n > 0) { n -= 1; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
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
async function planCommit(mcp, operations, label) {
  const rehearsal = await call(mcp, 'plan', { operations }, { print: true });
  if (/\(([1-9]\d*) critical,|, ([1-9]\d*) error,|, ([1-9]\d*) warn,/.test(rehearsal)) {
    throw new Error(`${label}: rehearsal produced a non-INFO finding`);
  }
  await call(mcp, 'plan', { operations, commit: true });
}

const NAVY = '#0B1F33';
const TEAL = '#18B6A4';
const GREEN = '#8EDB54';
const CREAM = '#FFF8E8';
const CORAL = '#FF6B5F';
const VIOLET = '#7A5AF8';
const CYAN = '#35C6F4';

const mcp = createMcpClient({ createdAt: CREATED_AT });
await mcp.init();

try {
  await call(mcp, 'turtlepen_help');
  await call(mcp, 'new_diagram', {
    name: 'TurtlePen MCP — Native Lattice Mark', path: OUT_JSON, cols: 122, rows: 100,
  }, { print: true });

  for (const [id, z] of [['shell',1],['facets',2],['grid',3],['nodes',4],['nib',5],['trail',6],['type',7]]) {
    await call(mcp, 'add_page', { id, z, intent: 'overlay' });
  }

  // Turtle silhouette: exact primitives -> BOOLEAN UNION.
  await planCommit(mcp, [
    { op:'pen', id:'seed-shell', role:'artwork', color:NAVY, paint:'cells', program:`pen ${at(57,41)}\ndisc 34` },
    { op:'pen', id:'seed-head', role:'artwork', color:NAVY, paint:'cells', program:`pen ${at(87,41)}\ndisc 11` },
    { op:'pen', id:'seed-neck', role:'artwork', color:NAVY, paint:'cells', program:`pen ${at(73,36)}\npolygon ${at(87,36)} ${at(87,46)} ${at(73,46)}` },
    { op:'pen', id:'seed-front-leg', role:'artwork', color:NAVY, paint:'cells', program:`pen ${at(70,57)}\npolygon ${at(82,65)} ${at(67,64)} ${at(61,55)}` },
    { op:'pen', id:'seed-rear-leg', role:'artwork', color:NAVY, paint:'cells', program:`pen ${at(42,57)}\npolygon ${at(35,65)} ${at(51,63)} ${at(55,54)}` },
    { op:'pen', id:'seed-tail', role:'artwork', color:NAVY, paint:'cells', program:`pen ${at(23,41)}\npolygon ${at(34,34)} ${at(34,48)}` },
    { op:'boolean', action:'union', ids:['seed-shell','seed-head','seed-neck','seed-front-leg','seed-rear-leg','seed-tail'], id:'turtle-silhouette', removeSources:true },
  ], 'silhouette');

  // Shell: BOOLEAN DIFFERENCE creates a ring, then SLICE splits it exactly.
  await planCommit(mcp, [
    { op:'pen', id:'shell-outer', page:'shell', role:'artwork', color:GREEN, paint:'cells', program:`pen ${at(57,41)}\ndisc 29` },
    { op:'pen', id:'shell-hole', page:'shell', role:'artwork', color:GREEN, paint:'cells', program:`pen ${at(57,41)}\ndisc 24` },
    { op:'boolean', action:'difference', ids:['shell-outer','shell-hole'], id:'shell-ring', removeSources:true },
    { op:'slice', id:'shell-ring', axis:'vertical', at:`${colName(57)}1.tl`, mode:'partition', ids:['shell-ring-left','shell-ring-right'] },
    { op:'pen', id:'shell-field', page:'shell', role:'artwork', color:TEAL, paint:'cells', program:`pen ${at(57,41)}\ndisc 22` },
  ], 'shell');

  // Vector-editing motif: separate layers make all visual crossings deliberate.
  await planCommit(mcp, [
    { op:'pen', id:'shell-facet', page:'facets', role:'artwork', color:CREAM, width:3, cap:'round', program:`pen ${at(57,27)}\npolygon ${at(70,34)} ${at(70,48)} ${at(57,55)} ${at(44,48)} ${at(44,34)}` },
    { op:'pen', id:'facet-cross', page:'grid', role:'artwork', color:CREAM, width:2, cap:'round', program:`pen ${at(44,41)}\nray to ${at(70,41)}\npen ${at(57,27)}\nray to ${at(57,55)}` },
  ], 'vector facets');

  // ARRAY creates control handles from one exact source node.
  await call(mcp, 'pen', { id:'anchor-node', page:'nodes', role:'artwork', color:CREAM, paint:'cells', program:`pen ${at(47,32)}\ndisc 2` });
  await call(mcp, 'array', { id:'anchor-node', columns:3, rows:2, stepX:20, stepY:18, prefix:'anchor' }, { print:true });
  await planCommit(mcp, [
    { op:'pen', id:'anchor-top', page:'nodes', role:'artwork', color:CREAM, paint:'cells', program:`pen ${at(57,27)}\ndisc 2` },
    { op:'pen', id:'anchor-bottom', page:'nodes', role:'artwork', color:CREAM, paint:'cells', program:`pen ${at(57,55)}\ndisc 2` },
  ], 'extra anchors');

  // Pen nib is one layer; drawn trail is another. The trail is converted from
  // a stroke into exact editable artwork with STROKE_TO_PATH.
  await planCommit(mcp, [
    { op:'pen', id:'pen-nib', page:'nib', role:'artwork', color:CORAL, paint:'cells', program:`pen ${at(92,39)}\npolygon ${at(105,45)} ${at(92,51)} ${at(95,45)}` },
    { op:'pen', id:'nib-hole', page:'nodes', role:'artwork', color:NAVY, paint:'cells', program:`pen ${at(96,45)}\ndisc 2` },
  ], 'pen nib');
  await planCommit(mcp, [
    { op:'pen', id:'drawn-stroke', page:'trail', role:'artwork', color:VIOLET, width:4, cap:'round', program:`pen ${at(105,45)}\nray to ${at(112,51)}\nray to ${at(106,58)}\nray to ${at(114,65)}\nray to ${at(107,71)}` },
    { op:'stroke_to_path', id:'drawn-stroke', resultId:'editable-ink', removeSource:true },
  ], 'editable trail');

  // Eye + MCP ports are integrated into the turtle rather than feature badges.
  await planCommit(mcp, [
    { op:'pen', id:'eye', page:'nodes', role:'artwork', color:CREAM, paint:'cells', program:`pen ${at(89,39)}\ndisc 2` },
    { op:'pen', id:'mcp-port', page:'nodes', role:'artwork', color:CYAN, paint:'cells', program:`pen ${at(48,61)}\ndisc 2` },
  ], 'eye and MCP port');
  await call(mcp, 'array', { id:'mcp-port', columns:3, rows:1, stepX:18, stepY:0, prefix:'mcp-port' }, { print:true });

  // Measurement-first brand lockup.
  for (const [text, width, size] of [['TurtlePen',62,46],['MCP',22,24]]) {
    console.log(`[measure] ${text}: ${(await call(mcp,'measure',{text,maxWidthCells:width,fontSize:size})).replaceAll('\n',' ')}`);
  }
  await planCommit(mcp, [
    { op:'pen', id:'brand-name', page:'type', role:'artwork', program:`text "TurtlePen" at ${tl(24,78)} span 68x10 id turtlepen-wordmark font 46 fill ${NAVY} weight 900 align center` },
    { op:'pen', id:'brand-mcp', page:'type', role:'artwork', program:`text "MCP" at ${tl(47,88)} span 22x6 id mcp-wordmark font 24 fill ${VIOLET} weight 900 align center` },
    { op:'pen', id:'brand-rule', page:'trail', role:'artwork', color:TEAL, width:4, cap:'round', program:`pen ${at(38,94)}\nray to ${at(78,94)}` },
  ], 'brand lockup');

  await call(mcp, 'annotate', {
    id:'turtle-silhouette', description:'Native turtle silhouette assembled with boolean union', technology:'TurtlePen lattice artwork',
    tags:['brand','turtle','boolean-union','native'], properties:{ rasterSource:'none', construction:'boolean union' },
  });
  await call(mcp, 'annotate', {
    id:'editable-ink', description:'Drawing flourish converted from stroke to exact editable lattice artwork', technology:'stroke_to_path',
    tags:['brand','pen','editable-path','native'], properties:{ rasterSource:'none', conversion:'stroke_to_path' },
  });

  console.log('\n[inspect]\n' + await call(mcp, 'inspect', {
    ids:['turtle-silhouette','shell-ring-left','shell-ring-right','editable-ink'], footprint:'visual',
  }));

  const validation = await call(mcp, 'validate', {}, { print:true });
  if (/\(([1-9]\d*) critical,|, ([1-9]\d*) error,|, ([1-9]\d*) warn,/.test(validation)) throw new Error('final validation has a non-INFO finding');
  await call(mcp, 'render', { path:OUT_SVG }, { print:true });
  console.log(`\nNative TurtlePen MCP logo built with no raster source:\n  ${OUT_JSON}\n  ${OUT_SVG}`);
} finally {
  await mcp.close();
}
