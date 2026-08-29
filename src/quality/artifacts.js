import { readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import * as core from '../core/index.js';
import { hashBytes } from '../io.js';

function portablePath(path, root) {
  return relative(root, path).replaceAll('\\', '/') || '.';
}

async function exported(path, root) {
  try {
    const bytes = await readFile(path);
    const info = await stat(path);
    return { path: portablePath(path, root), present: true, bytes: info.size, sha256: hashBytes(bytes) };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { path: portablePath(path, root), present: false, bytes: 0, sha256: null };
  }
}

export async function inspectArtifact(path, { root = process.cwd(), catalogEntry = null } = {}) {
  const manifestRoot = resolve(root);
  const sourcePath = resolve(path);
  const record = await core.loadDocumentRecord(sourcePath);
  const doc = record.document;
  const validation = core.validate(doc);
  const model = core.inspectModel(doc);
  const svg = core.renderSvg(doc);
  const perceptual = core.perceptualVerdicts(doc, {
    structural: validation,
    currentRenderHash: core.renderHash(svg),
  }).perceptual;
  const base = sourcePath.replace(/\.turtlepen\.json$/i, '');
  const exports = {
    svg: await exported(base + '.svg', manifestRoot),
    png: await exported(base + '.png', manifestRoot),
    pdf: await exported(base + '.pdf', manifestRoot),
  };
  const blocking = validation.open.filter((finding) => finding.severity !== 'S3');
  const contract = {
    structurallyClear: blocking.length === 0,
    modelHasNoErrors: model.summary.error === 0,
    perceptuallyReviewed: perceptual.reviewed === true,
    perceptualCurrent: perceptual.reviewed === true && perceptual.stale === false,
    perceptualHasNoBlockers: perceptual.reviewed === true && perceptual.blocking === 0,
    hasPortableVector: exports.svg.present,
    publishable: blocking.length === 0 && model.summary.error === 0
      && perceptual.reviewed === true && perceptual.stale === false && perceptual.blocking === 0
      && exports.svg.present,
  };
  const catalog = catalogEntry
    ? { role: catalogEntry.role, releaseRequired: catalogEntry.releaseRequired }
    : { role: 'unclassified', releaseRequired: false };
  return {
    id: doc.name,
    catalog,
    source: { path: portablePath(sourcePath, manifestRoot), schema: doc.schema, sha256: record.hash, bytes: Buffer.byteLength(core.serialize(doc)) },
    document: { pages: doc.pages.length, elements: Object.values(doc.elements).flat().length, views: doc.views.length, resources: doc.resources.length },
    structural: { state: validation.summary.state, open: validation.open.length, accepted: validation.accepted.length, stale: validation.staleAcceptances.length, summary: validation.summary },
    model: { state: model.summary.state, open: model.open.length, accepted: model.accepted.length, stale: model.stale.length, summary: model.summary },
    perceptual,
    exports,
    contract,
  };
}

export async function buildArtifactManifest(paths, { generatedAt = null, root = process.cwd(), catalog = null } = {}) {
  if (!Array.isArray(paths) || !paths.length) throw new RangeError('artifact manifest needs at least one TurtlePen document path');
  const artifacts = [];
  for (const path of [...new Set(paths)].sort()) {
    const portable = portablePath(resolve(path), resolve(root));
    artifacts.push(await inspectArtifact(path, { root, catalogEntry: catalog?.byPath.get(portable) ?? null }));
  }
  const byRole = Object.fromEntries(
    [...new Set(artifacts.map((artifact) => artifact.catalog.role))].sort().map((role) => {
      const selected = artifacts.filter((artifact) => artifact.catalog.role === role);
      return [role, {
        artifacts: selected.length,
        publishable: selected.filter((artifact) => artifact.contract.publishable).length,
      }];
    }),
  );
  const release = artifacts.filter((artifact) => artifact.catalog.releaseRequired);
  const summary = {
    artifacts: artifacts.length,
    publishable: artifacts.filter((artifact) => artifact.contract.publishable).length,
    structurallyClear: artifacts.filter((artifact) => artifact.contract.structurallyClear).length,
    missingSvg: artifacts.filter((artifact) => !artifact.exports.svg.present).length,
    byRole,
    release: {
      artifacts: release.length,
      ready: release.filter((artifact) => artifact.contract.publishable).length,
      blocked: release.filter((artifact) => !artifact.contract.publishable).length,
    },
  };
  return {
    schema: 2,
    generatedAt,
    qualityContract: {
      required: ['structurallyClear', 'modelHasNoErrors', 'perceptuallyReviewed', 'perceptualCurrent', 'perceptualHasNoBlockers', 'hasPortableVector'],
      note: 'Every dimension remains visible. A missing perceptual review is not silently treated as a pass.',
      releasePolicy: catalog?.releasePolicy ?? null,
    },
    summary,
    artifacts,
  };
}
