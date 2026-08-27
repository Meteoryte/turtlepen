import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { auditProjectFileNames, trackedProjectFiles } from '../src/quality/governance.js';
import { artifactCatalogCoverage, normalizeArtifactCatalog } from '../src/quality/artifact-catalog.js';

test('naming audit applies kebab-case and preserves standard project documents', () => {
  assert.deepEqual(auditProjectFileNames([
    'README.md', '.gitignore', 'src/core/workspace.js', 'test/artifact-catalog.test.js',
  ]), []);
  assert.deepEqual(auditProjectFileNames(['build_all.js', 'docs/Mixed-Case.pdf']), [
    'build_all.js', 'docs/Mixed-Case.pdf',
  ]);
});

test('catalog coverage reports both unowned and missing documents', () => {
  const catalog = normalizeArtifactCatalog({
    schema: 1,
    roles: { release: ['diagrams/release.turtlepen.json'], example: [], fixture: [], study: [] },
    releasePolicy: { required: ['structurallyClear'] },
  });
  assert.deepEqual(artifactCatalogCoverage(catalog, ['diagrams/stray.turtlepen.json']), {
    missingFromCatalog: ['diagrams/stray.turtlepen.json'],
    missingFromGit: ['diagrams/release.turtlepen.json'],
  });
});

test('repository governance explains its source-checkout boundary', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'turtlepen-governance-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.throws(() => trackedProjectFiles(root), {
    message: 'governance requires a TurtlePen source checkout with Git metadata; packaged installs should run `turtlepen doctor` instead',
  });
});
