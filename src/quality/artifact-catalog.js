import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const ARTIFACT_ROLES = Object.freeze(['release', 'example', 'fixture', 'study']);

function assertPortableDocumentPath(path, label) {
  if (typeof path !== 'string' || !path.endsWith('.turtlepen.json')) {
    throw new TypeError(`${label} must be a .turtlepen.json path`);
  }
  if (path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split('/').includes('..')) {
    throw new TypeError(`${label} must be a repository-relative forward-slash path`);
  }
}

export function normalizeArtifactCatalog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('artifact catalog must be an object');
  if (value.schema !== 1) throw new RangeError(`artifact catalog schema must be 1 — got ${JSON.stringify(value.schema)}`);
  if (!value.roles || typeof value.roles !== 'object' || Array.isArray(value.roles)) throw new TypeError('artifact catalog roles must be an object');

  const extraRoles = Object.keys(value.roles).filter((role) => !ARTIFACT_ROLES.includes(role));
  if (extraRoles.length) throw new RangeError(`unknown artifact role(s): ${extraRoles.join(', ')}`);
  const seen = new Set();
  const entries = [];
  for (const role of ARTIFACT_ROLES) {
    const paths = value.roles[role];
    if (!Array.isArray(paths)) throw new TypeError(`artifact catalog role ${role} must be an array`);
    for (const path of paths) {
      assertPortableDocumentPath(path, `artifact catalog ${role} entry`);
      if (seen.has(path)) throw new Error(`artifact catalog path appears more than once: ${path}`);
      seen.add(path);
      entries.push(Object.freeze({ path, role, releaseRequired: role === 'release' }));
    }
  }
  if (!entries.length) throw new RangeError('artifact catalog must contain at least one document');

  const required = value.releasePolicy?.required;
  if (!Array.isArray(required) || !required.length || required.some((entry) => typeof entry !== 'string')) {
    throw new TypeError('artifact catalog releasePolicy.required must be a non-empty string array');
  }
  const releasePolicy = Object.freeze({
    required: Object.freeze([...new Set(required)]),
    note: String(value.releasePolicy?.note ?? '').trim(),
  });
  return Object.freeze({
    schema: 1,
    entries: Object.freeze(entries.sort((a, b) => a.path.localeCompare(b.path))),
    byPath: new Map(entries.map((entry) => [entry.path, entry])),
    releasePolicy,
  });
}

export async function loadArtifactCatalog(path = 'artifacts/artifact-catalog.json') {
  const sourcePath = resolve(path);
  const value = JSON.parse(await readFile(sourcePath, 'utf8'));
  return { ...normalizeArtifactCatalog(value), sourcePath };
}

export function artifactCatalogCoverage(catalog, trackedPaths) {
  const expected = new Set(catalog.entries.map((entry) => entry.path));
  const actual = new Set(trackedPaths);
  return {
    missingFromCatalog: [...actual].filter((path) => !expected.has(path)).sort(),
    missingFromGit: [...expected].filter((path) => !actual.has(path)).sort(),
  };
}
