#!/usr/bin/env node
/**
 * Native TurtlePen MCP brand mark.
 *
 * The previous experiment proved that TurtlePen could compose and render a logo,
 * but it cheated the interesting part by simplifying an existing PNG mascot.
 * This version makes the LOGO ITSELF a TurtlePen capability demonstration:
 *
 *   - turtle silhouette: native lattice primitives -> boolean union
 *   - shell ring: native discs -> boolean difference -> vertical slice
 *   - shell control points: one native dot -> array operation
 *   - drawing flourish: pen stroke -> stroke_to_path editable artwork
 *   - every major geometry group: inspectable + semantically annotated
 *
 * No raster source is used anywhere.
 */

import { createMcpClient } from './mcp-client.js';

const OUT_JSON = 'brand/logo-redesign.turtlepen.json';
const OUT_SVG = 'brand/logo-redesign.svg';
const CREATED_AT = '2026-08-29T20:05:00.000Z';

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
    name: 'TurtlePen MCP — Native Lattice Mark',
    path: OUT_JSON,
    cols: 122,
    rows: 100,
  }, { print: true });

  // Purposeful visual layers. Overlap between these pages is intentional and
  // should resolve only to L010 INFO findings, never hidden same-page collisions.
  await call(mcp, 'add_page', { id: 'shell', z: 1, intent: 'overlay' });
  await call(mcp, 'add_page', { id: 'facets', z: 2, intent: 'overlay' });
  await call(mcp, 'add_page', { id: 'grid', z: 3, intent: 'overlay' });
  await call(mcp, 'add_page', { id: 'nodes', z: 4, intent: 'overlay' });
  await call(mcp, 'add_page', { id: 'ink', z: 5, intent: 'overlay' });
  await call(mcp, 'add_page', { id: 'type', z: 6, intent: 'overlay' });

  // -------------------------------------------------------------------------
  // 1. The turtle silhouette is not traced. It is constructed from exact
  //    lattice primitives and then boolean-unioned into one editable object.
  // -------------------------------------------------------------------------
  const silhouetteSeeds = [
    {
      op: 'pen', id: 'seed-shell', role: 'artwork', color: NAVY, paint: 'cells',
      program: `pen ${at(57, 41)}\ndisc 34`,
    },
    {
      op: 'pen', id: 'seed-head', role: 'artwork', color: NAVY, paint: 'cells',
      program: `pen ${at(87, 41)}\ndisc 11`,
    },
    {
      op: 'pen', id: 'seed-neck', role: 'artwork', color: NAVY, paint: 'cells',
      program: `pen ${at(73, 36)}\npolygon ${at(87, 36)} ${at(87, 46)} ${at(73, 46)}`,
    },
    {
      op: 'pen', id: 'seed-front-leg', role: 'artwork', color: NAVY, paint: 'cells',
      program: `pen ${at(70, 57)}\npolygon ${at(82, 65)} ${at(67, 64)} ${at(61, 55)}`,
    },
    {
      op: 'pen', id: 'seed-rear-leg', role: 'artwork', color: NAVY, paint: 'cells',
      program: `pen ${at(42, 57)}\npolygon ${at(35, 65)} ${at(51, 63)} ${at(55, 54)}`,
    },
    {
      op: 'pen', id: 'seed-tail', role: 'artwork', color: NAVY, paint: 'cells',
      program: `pen ${at(23, 41)}\npolygon ${at(34, 34)} ${at(34, 48)}`,
    },
    {
      op: 'boolean', action: 'union',
      ids: ['seed-shell', 'seed-head', 'seed-neck', 'seed-front-leg', 'seed-rear-leg', 'seed-tail'],
      id: 'turtle-silhouette', removeSources: true,
    },
  ];
  await planCommit(mcp, silhouetteSeeds, 'silhouette');

  // -------------------------------------------------------------------------
  // 2. The shell is also edited geometry: two discs become a boolean ring,
  //    then slice divides that result through the center. The split is subtle
  //    visually, but the saved source proves the mark is truly editable.
  // -------------------------------------------------------------------------
  const shellOps = [
    {
      op: 'pen', id: 'shell-outer', page: 'shell', role: 'artwork', color: GREEN, paint: 'cells',
      program: `pen ${at(57, 41)}\ndisc 29`,
    },
    {
      op: 'pen', id: 'shell-hole', page: 'shell', role: 'artwork', color: GREEN, paint: 'cells',
      program: `pen ${at(57, 41)}\ndisc 24`,
    },
    {
      op: 'boolean', action: 'difference', ids: ['shell-outer', 'shell-hole'],
      id: 'shell-ring', removeSources: true,
    },
    {
      op: 'slice', id: 'shell-ring', axis: 'vertical', at: `${colName(57)}1.tl`, mode: 'partition',
      ids: ['shell-ring-left', 'shell-ring-right'],
    },
    {
      op: 'pen', id: 'shell-field', page: 'shell', role: 'artwork', color: TEAL, paint: 'cells',
      program: `pen ${at(57, 41)}\ndisc 22`,
    },
  ];
  await planCommit(mcp, shellOps, 'shell');

  // -------------------------------------------------------------------------
  // 3. The shell doubles as a vector-editing surface. The facet outline and
  //    crosshair deliberately live on separate overlay pages so their visual
  //    intersection is explicit rather than a hidden same-page collision.
  // -------------------------------------------------------------------------
  const facetOps = [
    {
      op: 'pen', id: 'shell-facet', page: 'facets', role: 'artwork', color: CREAM, width: 3, cap: 'round',
      program: `pen ${at(57, 27)}\npolygon ${at(70, 34)} ${at(70, 48)} ${at(57, 55)} ${at(44, 48)} ${at(44, 34)}`,
    },
    {
      op: 'pen', id: 'facet-cross', page: 'grid', role: 'artwork', color: CREAM, width: 2, cap: 'round',
      program: `pen ${at(44, 41)}\nray to ${at(70, 41)}\npen ${at(57, 27)}\nray to ${at(57, 55)}`,
    },
  ];
  await planCommit(mcp, facetOps, 'facets');

  await call(mcp, 'pen', {
    id: 'anchor-node', page: 'nodes', role: 'artwork', color: CREAM, paint: 'cells',
    program: `pen ${at(47, 32)}\ndisc 2`,
  });
  await call(mcp, 'array', {
    id: 'anchor-node', columns: 3, rows: 2, stepX: 20, stepY: 18, prefix: 'anchor',
  }, { print: true });

  // Extra anchor points at the top/bottom reinforce the vector-control motif.
  await planCommit(mcp, [
    {
      op: 'pen', id: 'anchor-top', page: 'nodes', role: 'artwork', color: CREAM, paint: 'cells',
      program: `pen ${at(57, 27)}\ndisc 2`,
    },
    {
      op: 'pen', id: 'anchor-bottom', page: 'nodes', role: 'artwork', color: CREAM, paint: 'cells',
      program: `pen ${at(57, 55)}\ndisc 2`,
    },
  ], 'extra anchors');

  // -------------------------------------------------------------------------
  // 4. Pen nib + editable drawing path. The flourish begins as a TurtlePen
  //    stroke and is then converted through stroke_to_path, so what looks like
  //    "ink" in the logo is literally editable lattice artwork.
  // -------------------------------------------------------------------------
  await planCommit(mcp, [
    {
      op: 'pen', id: 'nib', page: 'ink', role: 'artwork', color: CORAL, paint: 'cells',
      program: `pen ${at(92, 39)}\npolygon ${at(105, 45)} ${at(92, 51)} ${at(95, 45)}`,
    },
    {
      op: 'pen', id: 'nib-hole', page: 'nodes', role: 'artwork', color: NAVY, paint: 'cells',
      program: `pen ${at(96, 45)}\ndisc 2`,
    },
    {
      op: 'pen', id: 'drawn-stroke', page: 'ink', role: 'artwork', color: VIOLET, width: 4, cap: 'round',
      program: `pen ${at(105, 45)}\nray to ${at(112, 51)}\nray to ${at(106, 58)}\nray to ${at(114, 65)}\nray to ${at(107, 71)}`,
    },
    {
      op: 'stroke_to_path', id: 'drawn-stroke', resultId: 'editable-ink', removeSource: true,
    },
  ], 'pen and editable ink');

  // Eye and three MCP "ports" are minimal but integrated into the mark rather
  // than floating feature badges.
  await planCommit(mcp, [
    {
      op: 'pen', id: 'eye', page: 'nodes', role: 'artwork', color: CREAM, paint: 'cells',
      program: `pen ${at(89, 39)}\ndisc 2`,
    },
    {
      op: 'pen', id: 'mcp-port', page: 'nodes', role: 'artwork', color: CYAN, paint: 'cells',
      program: `pen ${at(48, 61)}\ndisc 2`,
    },
  ], 'eye and first MCP port');
  await call(mcp, 'array', {
    id: 'mcp-port', columns: 3, rows: 1, stepX: 18, stepY: 0, prefix: 'mcp-port',
  }, { print: true });

  // -------------------------------------------------------------------------
  // 5. Brand lockup. Text is measured before placement, keeping the type part
  //    of the same measurement-first contract as the geometry.
  // -------------------------------------------------------------------------
  for (const [text, width, size] of [['TurtlePen', 62, 46], ['MCP', 22, 24]]) {
    const measured = await call(mcp, 'measure', { text, maxWidthCells: width, fontSize: size });
    console.log(`[measure] ${text}: ${measured.replaceAll('\n', ' ')}`);
  }

  await planCommit(mcp, [
    {
      op: 'pen', id: 'brand-name', page: 'type', role: 'artwork',
      program: `text "TurtlePen" at ${tl(24, 78)} span 68x10 id turtlepen-wordmark font 46 fill ${NAVY} weight 900 align center`,
    },
    {
      op: 'pen', id: 'brand-mcp', page: 'type', role: 'artwork',
      program: `text "MCP" at ${tl(47, 88)} span 22x6 id mcp-wordmark font 24 fill ${VIOLET} weight 900 align center`,
    },
    {
      op: 'pen', id: 'brand-rule', page: 'ink', role: 'artwork', color: TEAL, width: 4, cap: 'round',
      program: `pen ${at(38, 94)}\nray to ${at(78, 94)}`,
    },
  ], 'brand lockup');

  // Semantics make the construction inspectable to another agent instead of
  // leaving the artwork as a pile of anonymous coordinates.
  await call(mcp, 'annotate', {
    id: 'turtle-silhouette',
    description: 'Native TurtlePen turtle silhouette assembled from primitives with boolean union',
    technology: 'TurtlePen lattice artwork',
    tags: ['brand', 'turtle', 'boolean-union', 'native'],
    properties: { rasterSource: 'none', construction: 'boolean union' },
  });
  await call(mcp, 'annotate', {
    id: 'editable-ink',
    description: 'Pen flourish converted from a stroke into exact editable lattice artwork',
    technology: 'stroke_to_path',
    tags: ['brand', 'pen', 'editable-path', 'native'],
    properties: { conversion: 'stroke_to_path', rasterSource: 'none' },
  });

  // Report exact evidence that the mark is built from editable geometry.
  console.log('\n[inspect]');
  console.log(await call(mcp, 'inspect', {
    ids: ['turtle-silhouette', 'shell-ring-left', 'shell-ring-right', 'editable-ink'],
    footprint: 'visual',
  }));

  const validation = await call(mcp, 'validate', {}, { print: true });
  if (/\(([1-9]\d*) critical,|, ([1-9]\d*) error,|, ([1-9]\d*) warn,/.test(validation)) {
    throw new Error('final validation has a non-INFO finding');
  }

  await call(mcp, 'render', { path: OUT_SVG }, { print: true });
  console.log(`\nNative TurtlePen MCP logo built with no raster source:\n  ${OUT_JSON}\n  ${OUT_SVG}`);
} finally {
  await mcp.close();
}
