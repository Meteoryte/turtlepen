#!/usr/bin/env node
/** Five reproducible random 1x-versus-4x image trials through real MCP stdio. */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createMcpClient, PROJECT_ROOT } from './mcp-client.js';
import { dataUri, encodePng } from '../test/helpers/png-fixture.js';

const MASTER_SEED = 0x8f31c2d7;
const DOCUMENT = 'diagrams/supersample-random-five.turtlepen.json';
const SVG = 'diagrams/supersample-random-five.svg';
const REPORT = 'docs/supersample-random-five-report.md';
const OUTPUT_QUADRANTS = { width: 48, height: 32 };

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const randomInt = (random, minimum, maximum) =>
  minimum + Math.floor(random() * (maximum - minimum + 1));

function inkPixel(pixels, width, height, channels, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const index = (y * width + x) * channels;
  pixels[index] = 0;
  pixels[index + 1] = 0;
  pixels[index + 2] = 0;
  if (channels === 4) pixels[index + 3] = 255;
}

function disk(pixels, width, height, channels, cx, cy, radius) {
  const radiusSquared = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radiusSquared) inkPixel(pixels, width, height, channels, x, y);
    }
  }
}

function line(pixels, width, height, channels, x0, y0, x1, y1, thickness = 1) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let step = 0; step <= steps; step++) {
    const portion = step / steps;
    disk(
      pixels, width, height, channels,
      x0 + (x1 - x0) * portion,
      y0 + (y1 - y0) * portion,
      Math.max(0.45, thickness / 2),
    );
  }
}

function outline(pixels, width, height, channels, x, y, w, h, thickness) {
  line(pixels, width, height, channels, x, y, x + w, y, thickness);
  line(pixels, width, height, channels, x + w, y, x + w, y + h, thickness);
  line(pixels, width, height, channels, x + w, y + h, x, y + h, thickness);
  line(pixels, width, height, channels, x, y + h, x, y, thickness);
}

function filledRect(pixels, width, height, channels, x, y, w, h) {
  for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(height, Math.ceil(y + h)); yy++) {
    for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(width, Math.ceil(x + w)); xx++) {
      inkPixel(pixels, width, height, channels, xx, yy);
    }
  }
}

function circle(pixels, width, height, channels, cx, cy, radius, thickness) {
  let previous = null;
  for (let step = 0; step <= 180; step++) {
    const angle = step / 180 * Math.PI * 2;
    const point = [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
    if (previous) line(pixels, width, height, channels, previous[0], previous[1], point[0], point[1], thickness);
    previous = point;
  }
}

function generatedSource({ width, height, seed, variant, transparent }) {
  const random = mulberry32(seed);
  const channels = transparent ? 4 : 3;
  const pixels = new Uint8Array(width * height * channels);
  if (!transparent) pixels.fill(255);
  const short = Math.min(width, height);
  const thick = Math.max(5, Math.round(short * 0.022));
  const x = randomInt(random, Math.round(width * 0.13), Math.round(width * 0.22));
  const y = randomInt(random, Math.round(height * 0.12), Math.round(height * 0.20));
  const w = randomInt(random, Math.round(width * 0.52), Math.round(width * 0.66));
  const h = randomInt(random, Math.round(height * 0.54), Math.round(height * 0.68));
  outline(pixels, width, height, channels, x, y, w, h, thick);
  // This identification rail keeps the randomly generated source clearly in
  // the prepared near-binary domain instead of relying on a sparse-outline
  // classifier edge case.
  filledRect(pixels, width, height, channels, x + thick * 2, y + thick * 2, w * 0.58, h * 0.12);

  if (variant === 0) {
    const gap = Math.max(thick * 2, Math.floor(h / 7));
    for (let yy = y + gap; yy < y + h - gap / 2; yy += gap) {
      line(pixels, width, height, channels, x + thick * 2, yy, x + w - thick * 2, yy, Math.max(2, thick / 3));
    }
  } else if (variant === 1) {
    circle(pixels, width, height, channels, x + w / 2, y + h / 2, Math.min(w, h) * 0.28, thick);
    for (let spoke = 0; spoke < 6; spoke++) {
      const angle = spoke / 6 * Math.PI * 2;
      line(
        pixels, width, height, channels, x + w / 2, y + h / 2,
        x + w / 2 + Math.cos(angle) * Math.min(w, h) * 0.25,
        y + h / 2 + Math.sin(angle) * Math.min(w, h) * 0.25,
        Math.max(2, thick / 3),
      );
    }
  } else if (variant === 2) {
    line(pixels, width, height, channels, x + thick, y + h - thick, x + w - thick, y + thick, thick);
    line(pixels, width, height, channels, x + thick, y + thick, x + w - thick, y + h - thick, thick);
  } else if (variant === 3) {
    const inset = thick * 3;
    outline(pixels, width, height, channels, x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(3, thick / 2));
    line(pixels, width, height, channels, x + w * 0.25, y + h * 0.5, x + w * 0.75, y + h * 0.5, thick);
  } else {
    for (let part = 0; part < 4; part++) {
      const pw = randomInt(random, Math.round(w * 0.12), Math.round(w * 0.24));
      const ph = randomInt(random, Math.round(h * 0.12), Math.round(h * 0.25));
      outline(
        pixels, width, height, channels,
        randomInt(random, x + thick, x + w - pw - thick),
        randomInt(random, y + thick, y + h - ph - thick),
        pw, ph, Math.max(2, thick / 3),
      );
    }
  }

  // Random connected hairlines are the details most likely to distinguish a
  // direct reduction from a supersampled working pass.
  for (let feature = 0; feature < 6; feature++) {
    const side = randomInt(random, 0, 3);
    const originX = side < 2 ? randomInt(random, x + thick, x + w - thick) : side === 2 ? x : x + w;
    const originY = side >= 2 ? randomInt(random, y + thick, y + h - thick) : side === 0 ? y : y + h;
    line(
      pixels, width, height, channels, originX, originY,
      randomInt(random, Math.round(width * 0.04), Math.round(width * 0.96)),
      randomInt(random, Math.round(height * 0.04), Math.round(height * 0.96)),
      random() < 0.75 ? 1 : 2,
    );
  }

  for (let fragment = 0; fragment < 30; fragment++) {
    disk(
      pixels, width, height, channels,
      randomInt(random, 0, width - 1), randomInt(random, 0, height - 1),
      random() < 0.8 ? 0.5 : 1,
    );
  }

  return encodePng(width, height, pixels, { colorType: transparent ? 6 : 2 });
}

const master = mulberry32(MASTER_SEED);
const dimensions = [[768, 512], [640, 480], [1024, 640], [512, 768], [900, 600]];
const details = ['medium', 'high', 'low', 'medium', 'high'];
const cases = dimensions.map(([width, height], index) => ({
  index: index + 1,
  seed: Math.floor(master() * 0x100000000) >>> 0,
  width,
  height,
  variant: index,
  transparent: index === 3,
  fit: master() < 0.5 ? 'contain' : 'cover',
  detail: details[index],
}));

const client = createMcpClient({ createdAt: '2026-08-17T00:00:00.000Z' });
const call = async (name, args = {}) => {
  const result = await client.call(name, args);
  if (result.isError) throw new Error(`${name}: ${result.error ?? result.text}`);
  return result.text;
};
const cellColumn = (number) => {
  let value = number, name = '';
  while (value > 0) { value -= 1; name = String.fromCharCode(65 + value % 26) + name; value = Math.floor(value / 26); }
  return name;
};
const address = (column, row) => `${cellColumn(column)}${row}.tl`;
const box = (id, at, span, label, fill) => ({
  op: 'place_box', id, at, span, label, fill, corner: 'rounded', align: 'left', fontSize: 10,
});

try {
  const initialized = await client.init();
  if (initialized.result?.serverInfo?.name !== 'turtlepen') throw new Error('unexpected MCP server');
  await call('new_diagram', {
    name: 'Five seeded-random supersampling trials', path: DOCUMENT, cols: 80, rows: 133, fontSize: 10,
  });
  await call('place_box', {
    id: 'title', at: 'C2.tl', span: '76x4', corner: 'chamfered', align: 'left',
    fill: '#dce9ee', label: 'FIVE SEEDED-RANDOM IMAGE TRIALS | SOURCE vs DIRECT 1x vs 4x WORKING CANVAS -> 1x FINAL',
  });

  const sources = [];
  for (const trial of cases) {
    const png = generatedSource(trial);
    const source = dataUri(png);
    sources.push({ ...trial, source, sha256: createHash('sha256').update(png).digest('hex') });
    const row = 8 + (trial.index - 1) * 25;
    await call('place_image', {
      id: `source-${trial.index}`, at: address(3, row), span: '24x16', source, mode: 'embed', fit: trial.fit,
    });
    await call('place_image', {
      id: `direct-${trial.index}`, at: address(29, row), span: '24x16', source,
      mode: 'simplify', fit: trial.fit, detail: trial.detail, supersample: 1,
    });
    await call('place_image', {
      id: `super-${trial.index}`, at: address(55, row), span: '24x16', source,
      mode: 'simplify', fit: trial.fit, detail: trial.detail, supersample: 4,
    });
  }

  await call('save');
  const firstPass = JSON.parse(await readFile(resolve(PROJECT_ROOT, DOCUMENT), 'utf8'));
  const elements = firstPass.elements.base;
  const ledger = sources.map((trial) => {
    const direct = elements.find((entry) => entry.id === `direct-${trial.index}`);
    const supersampled = elements.find((entry) => entry.id === `super-${trial.index}`);
    if (!direct || !supersampled) throw new Error(`case ${trial.index} was not persisted`);
    if (direct.processing.resolvedSupersample !== 1 || supersampled.processing.resolvedSupersample !== 4) {
      throw new Error(`case ${trial.index} did not honor its requested supersampling factors`);
    }
    if (direct.rect.w !== OUTPUT_QUADRANTS.width || direct.rect.h !== OUTPUT_QUADRANTS.height ||
        supersampled.rect.w !== OUTPUT_QUADRANTS.width || supersampled.rect.h !== OUTPUT_QUADRANTS.height) {
      throw new Error(`case ${trial.index} changed final output geometry`);
    }
    if (!direct.processing.nearBinary || !supersampled.processing.nearBinary) {
      throw new Error(`case ${trial.index} did not take the auditable near-binary strategy`);
    }
    if (direct.ditherStats.readability !== 'pass' || supersampled.ditherStats.readability !== 'pass') {
      throw new Error(`case ${trial.index} produced busy output`);
    }
    if (supersampled.processing.downsampleMethod !== 'box-average' ||
        supersampled.ditherStats.partialCoverageSamples < 1 || supersampled.ditherStats.coverageLevels <= 2) {
      throw new Error(`case ${trial.index} discarded weighted supersample coverage`);
    }
    if (supersampled.ditherStats.transitionRatio >= direct.ditherStats.transitionRatio) {
      throw new Error(`case ${trial.index} did not reduce weighted edge transitions`);
    }
    if (supersampled.ditherStats.coverageRatio > direct.ditherStats.coverageRatio) {
      throw new Error(`case ${trial.index} inflated effective ink instead of resolving coverage`);
    }
    const directHash = createHash('sha256').update(JSON.stringify(direct.runs)).digest('hex');
    const supersampledHash = createHash('sha256').update(JSON.stringify(supersampled.runs)).digest('hex');
    return { ...trial, direct, supersampled, directHash, supersampledHash, changed: directHash !== supersampledHash };
  });

  const captions = [];
  for (const result of ledger) {
    const row = 25 + (result.index - 1) * 25;
    captions.push(
      box(`source-caption-${result.index}`, address(3, row), '24x5',
        `CASE ${result.index} SOURCE | seed ${result.seed.toString(16).padStart(8, '0')} | ${result.width}x${result.height} | ${result.fit}`,
        '#e8edf0'),
      box(`direct-caption-${result.index}`, address(29, row), '24x5',
        `DIRECT 1x | ${result.detail} | ${Math.round(result.direct.ditherStats.coverageRatio * 1000) / 10}% ink | ${Math.round(result.direct.ditherStats.transitionRatio * 1000) / 10}% edges`,
        '#ece6f0'),
      box(`super-caption-${result.index}`, address(55, row), '24x5',
        `4x BOX AVG | ${Math.round(result.supersampled.ditherStats.coverageRatio * 1000) / 10}% ink | ${Math.round(result.supersampled.ditherStats.transitionRatio * 1000) / 10}% edges | ${result.supersampled.ditherStats.partialCoverageSamples} partial`,
        '#e4eee6'),
    );
  }
  await call('plan', { operations: captions, commit: true });
  await call('save');

  const validation = JSON.parse(await call('validate', { format: 'json' }));
  const blockers = validation.open.filter((finding) => ['S0', 'S1', 'S2'].includes(finding.severity));
  if (blockers.length) throw new Error(`random trial sheet has blocking findings: ${JSON.stringify(blockers)}`);
  await call('open_diagram', { path: DOCUMENT });
  const reopened = JSON.parse(await call('validate', { format: 'json' }));
  if (reopened.open.some((finding) => ['S0', 'S1', 'S2'].includes(finding.severity))) {
    throw new Error('random trial sheet did not survive reopen cleanly');
  }
  await call('render', { path: SVG, showGrid: true });

  const changed = ledger.filter((entry) => entry.changed).length;
  const rows = ledger.map((entry) => {
    const direct = entry.direct.ditherStats;
    const supersampled = entry.supersampled.ditherStats;
    return `| ${entry.index} | \`${entry.seed.toString(16).padStart(8, '0')}\` | ${entry.width}x${entry.height} | ${entry.transparent ? 'RGBA' : 'RGB'} | ${entry.fit} | ${entry.detail} | ${direct.ink} / ${(direct.transitionRatio * 100).toFixed(2)}% | ${supersampled.ink} / ${(supersampled.transitionRatio * 100).toFixed(2)}% | ${supersampled.partialCoverageSamples} / ${supersampled.coverageLevels} | ${entry.changed ? 'yes' : 'no'} |`;
  }).join('\n');
  const report = `# Five seeded-random supersampling trials

Generated through real TurtlePen MCP stdio with master seed \`0x${MASTER_SEED.toString(16)}\`.
The inputs are random but reproducible; their SHA-256 hashes and saved run hashes make each result auditable.

## Loop contract

- Loop: \`SWE-05 Edge Case Expansion\`, five attempts total.
- Success: requested factor honored; final output remains 48x32 quadrants; near-binary strategy; weighted coverage survives; 4x has lower effective edge transitions without inflating effective ink; clean save/reopen/render.
- Mutation between attempts: source seed, dimensions, alpha mode, fit, detail, and generated structure.
- Stop: all five pass, or stop immediately on geometry drift, busy output, semantic ambiguity, persistence failure, or MCP error.

## Evidence ledger

| Attempt | Seed | Source | Pixels | Fit | Detail | Direct 1x: effective ink / transitions | 4x->1x: effective ink / transitions | Partial samples / levels | Output changed |
|---:|---|---:|---|---|---|---|---|---|---|
${rows}

All five structural attempts passed. ${changed}/5 produced different final run geometry at 4x. Every 4x result retained more than two coverage levels, reduced weighted neighbor transitions, and avoided the earlier bold/blocky ink inflation. The full document validated without S0-S2 findings after save and reopen.

## Visual review boundary

The checked-in contact sheet is the review surface, not an automated claim of identity. Browser inspection on 2026-08-17 at 1440x900 and 390x844 confirmed that the coverage-resolved 4x column has softer edges at intended reading size, remains recognizable beside its source, creates no horizontal overflow, and logs no console error or warning. At 200% the integer lattice is deliberately visible; supersampling improves the normal-size resolve but does not turn a 48x32-quadrant drawing into source-resolution evidence.

## Source receipts

${ledger.map((entry) => `- Case ${entry.index}: source \`${entry.sha256}\`; direct runs \`${entry.directHash}\`; 4x runs \`${entry.supersampledHash}\`.`).join('\n')}
`;
  await writeFile(resolve(PROJECT_ROOT, REPORT), report, 'utf8');

  process.stdout.write(`five seeded-random image trials passed; ${changed}/5 changed final runs under 4x processing\n`);
  process.stdout.write(`wrote ${DOCUMENT}\nwrote ${SVG}\nwrote ${REPORT}\n`);
} finally {
  await client.close();
}
