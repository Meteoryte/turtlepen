#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as core from '../src/core/index.js';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const createdAt = '2026-09-03T12:00:00.000Z';
const events = [
  {
    id: 'original-prototype',
    date: '2026-08-29',
    displayDate: 'August 29, 2026',
    title: 'Original hosted prototype',
    description: 'The first hosted connector exposed five stateless TurtlePen tools.',
    type: 'milestone',
    status: 'complete',
    phase: 'engine',
  },
  {
    id: 'canonical-engine',
    date: '2026-08-29',
    displayDate: 'Later that day',
    title: 'Canonical stateful engine',
    description: 'The hosted route adopted the full stateful TurtlePen tool inventory.',
    type: 'release',
    status: 'complete',
    phase: 'engine',
    relationships: [{ to: 'original-prototype', type: 'supersedes' }],
  },
  {
    id: 'stale-beta-connector',
    displayDate: 'After the engine upgrade',
    sequence: 1,
    title: 'Installed beta connector stayed stale',
    description: 'ChatGPT retained the original five-tool schema instead of rediscovering the canonical inventory.',
    type: 'transition',
    status: 'delayed',
    phase: 'connection',
    relationships: [{ to: 'canonical-engine', type: 'lags' }],
  },
  {
    id: 'unsupported-sites-key',
    displayDate: 'Before restoration',
    sequence: 2,
    title: 'Sites declaration removed',
    description: 'An unsupported discovery key was removed rather than left as a misleading capability claim.',
    type: 'transition',
    phase: 'connection',
    relationships: [{ to: 'stale-beta-connector', type: 'diagnoses' }],
  },
  {
    id: 'capability-restored',
    date: '2026-09-03',
    displayDate: 'September 3, 2026',
    title: 'Supported MCP capability published',
    description: 'Brainn.dev declared the supported Sites MCP capability and restored native discovery.',
    type: 'release',
    status: 'complete',
    phase: 'connection',
    relationships: [{ to: 'unsupported-sites-key', type: 'resolves' }],
  },
  {
    id: 'account-feature-setting',
    date: '2026-09-03',
    displayDate: 'Current',
    title: 'Account setting still controls access',
    description: 'Native Sites MCP availability remains controlled by the user account feature setting.',
    type: 'point',
    status: 'current',
    current: true,
    phase: 'availability',
    relationships: [{ to: 'capability-restored', type: 'depends-on' }],
  },
];

const phases = [
  { id: 'engine', title: 'Engine foundation', description: 'The hosted implementation became canonical.' },
  { id: 'connection', title: 'Connector correction', description: 'Discovery was made truthful and current.' },
  { id: 'availability', title: 'Account availability', description: 'Capability and user enablement remain separate states.' },
];

const variants = [
  {
    name: 'turtlepen-connection-history-vertical',
    canvas: { cols: 110, rows: 130 },
    timeline: { orientation: 'vertical', layout: 'phase-band', at: 'C4', cardWidthCells: 30 },
  },
  {
    name: 'turtlepen-connection-history-horizontal',
    canvas: { cols: 230, rows: 55 },
    timeline: { orientation: 'horizontal', layout: 'detailed', at: 'C4', cardWidthCells: 30 },
  },
];

for (const variant of variants) {
  const stem = resolve(project, 'diagrams', variant.name);
  const documentPath = `${stem}.turtlepen.json`;
  const previous = await core.loadDocument(documentPath).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const doc = core.createDocument({ name: 'TurtlePen connection history', canvas: variant.canvas });
  doc.createdAt = createdAt;
  core.applyTimeline(doc, {
    id: 'turtlepen-history',
    title: 'TurtlePen connection history',
    order: 'input',
    spacing: 'ordinal',
    gapCells: 4,
    events,
    phases,
    ...variant.timeline,
  });
  core.upsertResource(doc, {
    id: 'timeline-contract',
    type: 'documentation',
    uri: 'docs/semantic-timelines.md',
    label: 'Semantic timeline contract',
  });

  const validation = core.validate(doc);
  if (validation.summary.verdict === 'FAIL') {
    throw new Error(`${variant.name} failed validation\n${core.formatLog(validation)}`);
  }
  core.preservePerceptualReview(doc, previous);
  await core.saveDocument(doc, documentPath);
  await core.exportSvg(doc, `${stem}.svg`, { showGrid: true, bounds: 'content', margin: 20 });
  await core.exportPng(doc, `${stem}.png`, { showGrid: true, bounds: 'content', margin: 20 });
  process.stdout.write(`${variant.name}: ${validation.summary.verdict}, ${core.timelineSummary(doc.timelines[0]).events.length} events\n`);
}
