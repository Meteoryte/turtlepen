import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { capabilityRegistry } from '../capabilities.js';
import { hashBytes } from '../io.js';
import { VERSION } from '../version.js';
import * as core from '../core/index.js';
import { createSession, createTools } from '../mcp/tools.js';
import { artifactCatalogCoverage, loadArtifactCatalog } from './artifact-catalog.js';

const STANDARD_FILES = new Set(['README.md', 'CHANGELOG.md', 'LICENSE', 'QUICKSTART.md']);
const KEBAB_FILE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export function auditProjectFileNames(paths) {
  return paths.filter((path) => {
    const name = basename(path);
    return !name.startsWith('.') && !STANDARD_FILES.has(name) && !KEBAB_FILE.test(name);
  }).sort();
}

export function trackedProjectFiles(root = process.cwd()) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: resolve(root), encoding: 'utf8', windowsHide: true })
    .split('\0').filter(Boolean).map((path) => path.replaceAll('\\', '/'));
}

async function fileHash(path) {
  try {
    return hashBytes(await readFile(path));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function check(id, ok, detail, evidence = null) {
  return { id, ok, detail, ...(evidence == null ? {} : { evidence }) };
}

export async function governanceReport(root = process.cwd()) {
  const projectRoot = resolve(root);
  const tracked = trackedProjectFiles(projectRoot);
  const tools = createTools(createSession({ cwd: projectRoot }));
  const registry = capabilityRegistry(tools);
  const duplicateTools = registry.entries.map((entry) => entry.name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  const catalog = await loadArtifactCatalog(resolve(projectRoot, 'artifacts/artifact-catalog.json'));
  const trackedDocuments = tracked.filter((path) => /^(brand|diagrams)\/.+\.turtlepen\.json$/.test(path));
  const coverage = artifactCatalogCoverage(catalog, trackedDocuments);
  const namingViolations = auditProjectFileNames(tracked);

  const fullHelp = tools.find((tool) => tool.name === 'turtlepen_help').handler({ section: 'all' }) + '\n';
  const helpSnapshot = await readFile(resolve(projectRoot, 'docs/turtlepen-help.txt'), 'utf8');
  const manifest = JSON.parse(await readFile(resolve(projectRoot, 'artifacts/manifest.json'), 'utf8'));
  const manifestPaths = manifest.artifacts.map((artifact) => artifact.source.path).sort();
  const catalogPaths = catalog.entries.map((entry) => entry.path).sort();
  const roleDrift = manifest.artifacts.filter((artifact) => catalog.byPath.get(artifact.source.path)?.role !== artifact.catalog?.role)
    .map((artifact) => artifact.source.path);
  const sourceDrift = [];
  const exportDrift = [];
  for (const artifact of manifest.artifacts) {
    if (await fileHash(resolve(projectRoot, artifact.source.path)) !== artifact.source.sha256) sourceDrift.push(artifact.source.path);
    for (const output of Object.values(artifact.exports)) {
      const actual = await fileHash(resolve(projectRoot, output.path));
      if ((actual != null) !== output.present || actual !== output.sha256) exportDrift.push(output.path);
    }
  }

  const checks = [
    check('naming', namingViolations.length === 0,
      namingViolations.length ? `${namingViolations.length} non-compliant tracked filename(s)` : 'all tracked filenames follow kebab-case or an approved core-doc convention', namingViolations),
    check('artifact-catalog', coverage.missingFromCatalog.length === 0 && coverage.missingFromGit.length === 0,
      `${catalog.entries.length} catalog entries cover ${trackedDocuments.length} tracked TurtlePen documents`, coverage),
    check('artifact-roles', roleDrift.length === 0 && JSON.stringify(manifestPaths) === JSON.stringify(catalogPaths),
      roleDrift.length ? `${roleDrift.length} manifest role assignment(s) drifted` : 'generated manifest scope and roles match the catalog', roleDrift),
    check('artifact-hashes', sourceDrift.length === 0 && exportDrift.length === 0,
      sourceDrift.length || exportDrift.length ? 'manifest hashes are stale' : 'manifest source and export hashes match disk', { sourceDrift, exportDrift }),
    check('help-snapshot', helpSnapshot === fullHelp,
      helpSnapshot === fullHelp ? 'docs/turtlepen-help.txt matches live full help byte-for-byte' : 'generated help snapshot differs from the live tool surface'),
    check('runtime-version', VERSION === JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8')).version,
      `package/runtime version ${VERSION}`),
    check('runtime-registry', registry.count === tools.length && duplicateTools.length === 0,
      `${registry.count} live tools; capability fingerprint ${registry.fingerprint}`),
    check('source-map', await fileHash(resolve(projectRoot, 'docs/source-of-truth-map.md')) != null,
      'docs/source-of-truth-map.md exists as the ownership map'),
    check('schema-owner', core.SCHEMA_VERSION === 3,
      `src/core/document.js owns document schema ${core.SCHEMA_VERSION}`),
  ];
  return {
    schema: 1,
    state: checks.every((entry) => entry.ok) ? 'ready' : 'blocked',
    project: 'TurtlePen',
    checks,
  };
}
