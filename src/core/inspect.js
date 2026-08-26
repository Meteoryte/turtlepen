/**
 * Semantic model inspections, separate from collision validation.
 *
 * Geometry asks whether the drawing is structurally possible. These checks ask
 * whether the model says enough for a person or AI to reason about it. Keeping
 * the axes separate prevents an incomplete model from masquerading as a
 * geometric defect, while still making omissions enumerable and actionable.
 */

export const INSPECTION_SEVERITIES = Object.freeze(['error', 'warning', 'info']);

export const INSPECTION_RULES = Object.freeze({
  M001: { severity: 'warning', title: 'node missing description' },
  M002: { severity: 'warning', title: 'relationship missing description' },
  M003: { severity: 'warning', title: 'disconnected node' },
  M004: { severity: 'info', title: 'relationship missing technology' },
  M005: { severity: 'error', title: 'relationship endpoint missing' },
  M006: { severity: 'info', title: 'visual connector lacks relationship semantics' },
});

function finding(rule, element, message, details = {}) {
  return { rule, severity: INSPECTION_RULES[rule].severity, title: INSPECTION_RULES[rule].title, element, message, ...details };
}

export function inspectModel(doc, { minimum = 'info' } = {}) {
  if (!INSPECTION_SEVERITIES.includes(minimum)) {
    throw new SyntaxError(`inspection minimum must be ${INSPECTION_SEVERITIES.join(', ')} — got ${JSON.stringify(minimum)}`);
  }
  const elements = Object.values(doc.elements ?? {}).flat();
  const byId = new Map(elements.map((element) => [element.id, element]));
  const nodes = elements.filter((element) => element.kind === 'box');
  const paths = elements.filter((element) => element.kind === 'path' && (element.role ?? 'connector') === 'connector');
  const relationships = paths.filter((path) => path.relationship);
  const connected = new Set();
  const findings = [];

  for (const relationship of relationships) {
    const { from, to } = relationship.relationship;
    if (from?.id) connected.add(from.id);
    if (to?.id) connected.add(to.id);
    if (!from?.id || !to?.id || !byId.has(from.id) || !byId.has(to.id)) {
      findings.push(finding(
        'M005', relationship.id,
        `relationship "${relationship.id}" references a missing endpoint`,
        { from: from?.id ?? null, to: to?.id ?? null },
      ));
    }
    if (!relationship.description?.trim()) {
      findings.push(finding('M002', relationship.id, `relationship "${relationship.id}" needs a description of what crosses it`));
    }
    if (!relationship.technology?.trim()) {
      findings.push(finding('M004', relationship.id, `relationship "${relationship.id}" does not name its transport or technology`));
    }
  }

  for (const path of paths.filter((entry) => !entry.relationship)) {
    findings.push(finding(
      'M006', path.id,
      `connector "${path.id}" has geometry but no semantic relationship; redraw it with connect or annotate its intended role`,
    ));
  }

  for (const node of nodes) {
    if (!node.description?.trim()) findings.push(finding('M001', node.id, `node "${node.id}" needs a description of its responsibility`));
    if (!connected.has(node.id)) findings.push(finding('M003', node.id, `node "${node.id}" is not part of any semantic relationship`));
  }

  const rank = { error: 0, warning: 1, info: 2 };
  const filtered = findings
    .filter((entry) => rank[entry.severity] <= rank[minimum])
    .sort((a, b) => rank[a.severity] - rank[b.severity] || a.rule.localeCompare(b.rule) || a.element.localeCompare(b.element));
  const summary = { error: 0, warning: 0, info: 0, total: filtered.length };
  for (const entry of filtered) summary[entry.severity] += 1;
  summary.state = summary.error ? 'model-errors' : summary.warning ? 'model-incomplete' : 'model-clear';
  return { findings: filtered, summary };
}

export function formatInspection(result) {
  const lines = [
    `model inspection — ${result.summary.total} finding(s)`,
    `  status: ${result.summary.state.toUpperCase().replaceAll('-', ' ')}`,
    `  ${result.summary.error} error, ${result.summary.warning} warning, ${result.summary.info} info`,
  ];
  for (const entry of result.findings) {
    lines.push('', `[${entry.severity.toUpperCase().padEnd(7)}] ${entry.rule} ${entry.title}  ${entry.element}`, `          ${entry.message}`);
  }
  return lines.join('\n');
}
