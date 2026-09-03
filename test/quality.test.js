import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import * as core from '../src/core/index.js';
import { buildArtifactManifest } from '../src/quality/artifacts.js';
import { normalizeArtifactCatalog } from '../src/quality/artifact-catalog.js';
import { documentationBundle } from '../src/quality/documentation.js';
import { benchmarkWorksheet, loadCorpus, scoreBenchmarkRun } from '../src/benchmark/runner.js';

async function saved(t) {
  const root = await mkdtemp(join(tmpdir(), 'turtlepen-quality-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'architecture.turtlepen.json');
  const doc = core.createDocument({ name: 'architecture' });
  core.placeBox(doc, 'base', { id: 'browser', at: 'C4.tl', span: '8x4', label: 'Browser' });
  core.placeBox(doc, 'base', { id: 'app-server', at: 'C14.tl', span: '8x4', label: 'App server' });
  core.placeBox(doc, 'base', { id: 'database', at: 'C24.tl', span: '8x4', label: 'Database' });
  core.connectNodes(doc, { id: 'http', from: 'browser.S', to: 'app-server.N', description: 'request', technology: 'HTTPS' });
  core.connectNodes(doc, { id: 'sql', from: 'app-server.S', to: 'database.N', description: 'query', technology: 'SQL' });
  core.defineView(doc, { key: 'system', type: 'static', description: 'System context' });
  core.upsertResource(doc, { id: 'adr-1', type: 'adr', uri: 'docs/adr-1.md' });
  await core.checkpointDocument(doc, path);
  await core.exportSvg(doc, path.replace('.turtlepen.json', '.svg'), { force: true });
  return { root, path, doc };
}

test('artifact manifests expose every quality dimension and never call unreviewed a pass', async (t) => {
  const { root, path } = await saved(t);
  const manifest = await buildArtifactManifest([path], { generatedAt: '2026-08-26T00:00:00.000Z', root });
  assert.equal(manifest.artifacts.length, 1);
  assert.equal(manifest.artifacts[0].contract.structurallyClear, true);
  assert.equal(manifest.artifacts[0].contract.perceptuallyReviewed, false);
  assert.equal(manifest.artifacts[0].contract.releaseGatePassed, false);
  assert.equal(manifest.artifacts[0].contract.reviewedExportMatches, false);
  assert.equal(manifest.artifacts[0].contract.publishable, false);
  assert.equal(manifest.artifacts[0].exports.svg.present, true);
  assert.equal(manifest.artifacts[0].source.path, 'architecture.turtlepen.json');
  assert.equal(manifest.artifacts[0].exports.svg.path, 'architecture.svg');
});

test('artifact catalog is the sole owner of release scope', async (t) => {
  const { root, path } = await saved(t);
  const catalog = normalizeArtifactCatalog({
    schema: 1,
    roles: { release: ['architecture.turtlepen.json'], example: [], fixture: [], study: [] },
    releasePolicy: { required: ['structurallyClear', 'perceptuallyReviewed'], note: 'test policy' },
  });
  const manifest = await buildArtifactManifest([path], { root, catalog });
  assert.equal(manifest.schema, 2);
  assert.equal(manifest.artifacts[0].catalog.role, 'release');
  assert.equal(manifest.summary.release.artifacts, 1);
  assert.equal(manifest.summary.release.blocked, 1);
  assert.equal(manifest.qualityContract.releasePolicy.note, 'test policy');
  assert.throws(() => normalizeArtifactCatalog({
    schema: 1,
    roles: { release: ['same.turtlepen.json'], example: ['same.turtlepen.json'], fixture: [], study: [] },
    releasePolicy: { required: ['structurallyClear'] },
  }), /appears more than once/);
});

test('a current clean perceptual review satisfies the numeric blocker-count gate', async (t) => {
  const { root, path, doc } = await saved(t);
  const renderHash = core.renderHash(core.renderSvg(doc));
  core.attachPerceptualReview(doc, { renderHash, reviewer: 'test/quality', findings: [] });
  await core.checkpointDocument(doc, path);
  const catalog = normalizeArtifactCatalog({
    schema: 1,
    roles: { release: ['architecture.turtlepen.json'], example: [], fixture: [], study: [] },
    releasePolicy: { required: ['structurallyClear', 'modelHasNoErrors', 'perceptuallyReviewed', 'perceptualCurrent', 'perceptualHasNoBlockers', 'releaseGatePassed', 'reviewedExportMatches', 'hasPortableVector'] },
  });
  const manifest = await buildArtifactManifest([path], { root, catalog });
  assert.equal(manifest.artifacts[0].perceptual.blocking, 0);
  assert.equal(manifest.artifacts[0].contract.perceptualHasNoBlockers, true);
  assert.equal(manifest.artifacts[0].contract.releaseGatePassed, true);
  assert.equal(manifest.artifacts[0].contract.reviewedExportMatches, true);
  assert.equal(manifest.artifacts[0].contract.publishable, true);
  assert.deepEqual(manifest.summary.release, { artifacts: 1, ready: 1, blocked: 0 });
});

test('documentation bundles derive model, view, resource, and machine-readable files', async (t) => {
  const { doc } = await saved(t);
  const bundle = documentationBundle(doc);
  assert.match(bundle['README.md'], /System context/);
  assert.match(bundle['model.md'], /browser/);
  assert.match(bundle['views/system.md'], /System context/);
  assert.match(bundle['resources.md'], /adr-1/);
  assert.equal(JSON.parse(bundle['workspace.json']).schema, 4);
});

test('benchmark scoring keeps four dimensions separate and preserves unreviewed truth', async (t) => {
  const { path } = await saved(t);
  const corpus = await loadCorpus(new URL('../benchmark/corpus-v1.json', import.meta.url));
  const worksheet = benchmarkWorksheet(corpus, { partition: 'dev' });
  assert.ok(worksheet.tasks.length > 0);
  const scored = await scoreBenchmarkRun(corpus, {
    system: 'turtlepen', model: 'same-model',
    results: [{ task: 'T01-arch-three-tier', artifact: path, metrics: { toolCalls: 4, tokens: 100, durationMs: 20 } }],
  });
  assert.deepEqual(scored.dimensions, ['structural', 'semantic', 'perceptual', 'workflow']);
  assert.equal(scored.tasks[0].perceptual.state, 'unreviewed');
  assert.equal(scored.tasks[0].semantic.completenessGate, 'passed-automatic-signals');
});

test('native outputs written during quality work remain readable', async (t) => {
  const { root, doc } = await saved(t);
  const path = join(root, 'artifact.png');
  await core.exportPng(doc, path, { force: true });
  assert.equal(core.png.decode(await readFile(path)).width > 0, true);
});
