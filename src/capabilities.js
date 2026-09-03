import { createHash } from 'node:crypto';

const CATEGORY_RULES = Object.freeze([
  ['workspace', /view|theme|resource|model|annotate|connect/],
  ['authoring', /place|pen|stroke|wireframe|timeline|perspective|mermaid/],
  ['layout', /layout|align|distribute|route|constraint|group|move|resize/],
  ['review', /validate|inspect|finding|perceptual|repair|progress/],
  ['file', /diagram|save|render|image|export|history/],
  ['discovery', /help|runtime|doctor|describe|measure|coverage|free_space/],
]);

function categoryOf(name) {
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(name))?.[0] ?? 'other';
}

export function capabilityRegistry(tools) {
  const entries = tools.map((tool) => ({
    name: tool.name,
    category: categoryOf(tool.name),
    description: tool.description,
    required: tool.inputSchema.required ?? [],
    properties: Object.keys(tool.inputSchema.properties ?? {}),
    structuredOutput: tool.outputSchema?.type === 'object',
    outputSchemaVersion: tool.outputSchema?.properties?.schemaVersion?.enum?.[0] ?? null,
    mutating: !/^(turtlepen_help|search_help|doctor|runtime_info|validate|inspect|describe|measure|font_|ascii|render|free_space|route|export_prompt)/.test(tool.name),
  })).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const fingerprint = createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  return { count: entries.length, fingerprint, categories: [...new Set(entries.map((entry) => entry.category))], entries };
}

export function searchCapabilities(tools, query = '') {
  const registry = capabilityRegistry(tools);
  const terms = String(query).toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = terms.length
    ? registry.entries.filter((entry) => terms.every((term) =>
      [entry.name, entry.category, entry.description, ...entry.properties].join(' ').toLowerCase().includes(term)))
    : registry.entries;
  return { query, count: matches.length, fingerprint: registry.fingerprint, matches };
}

export function doctorReport(tools, { schemaVersion, version, cwd }) {
  const registry = capabilityRegistry(tools);
  const duplicateNames = registry.entries.map((entry) => entry.name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  const missingOutputSchemas = registry.entries
    .filter((entry) => !entry.structuredOutput || !entry.outputSchemaVersion)
    .map((entry) => entry.name);
  const checks = [
    { id: 'node', ok: Number(process.versions.node.split('.')[0]) >= 20, detail: process.version + ' (requires >=20)' },
    { id: 'tools', ok: registry.count > 0 && duplicateNames.length === 0, detail: registry.count + ' tools; duplicates: ' + (duplicateNames.join(', ') || 'none') },
    { id: 'outputs', ok: missingOutputSchemas.length === 0, detail: missingOutputSchemas.length ? 'missing: ' + missingOutputSchemas.join(', ') : 'all tools publish versioned output schemas' },
    { id: 'schema', ok: Number.isInteger(schemaVersion) && schemaVersion > 0, detail: 'document schema ' + schemaVersion },
    { id: 'version', ok: /^\d+\.\d+\.\d+/.test(version), detail: 'runtime ' + version },
    { id: 'cwd', ok: typeof cwd === 'string' && cwd.length > 0, detail: cwd },
  ];
  return {
    state: checks.every((check) => check.ok) ? 'ready' : 'degraded',
    checks,
    capabilityFingerprint: registry.fingerprint,
    toolCount: registry.count,
  };
}
