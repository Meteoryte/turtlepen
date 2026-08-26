import * as core from '../core/index.js';

function elementLine(element) {
  const tags = element.tags?.length ? ' [' + element.tags.join(', ') + ']' : '';
  const meaning = element.description ? ' — ' + element.description : '';
  return '- **' + element.id + '** (' + element.kind + ')' + tags + meaning;
}

export function documentationBundle(doc) {
  const all = Object.values(doc.elements).flat();
  const nodes = all.filter((element) => element.kind === 'box');
  const relationships = all.filter((element) => element.relationship);
  const model = core.inspectModel(doc);
  const files = {};
  files['README.md'] = [
    '# ' + doc.name,
    '',
    'TurtlePen architecture workspace, document schema ' + doc.schema + '.',
    '',
    '## Views',
    '',
    ...(doc.views.length ? doc.views.map((view) => '- [' + view.title + '](views/' + view.key + '.md) — ' + view.type + ', ' + view.direction + (view.description ? '. ' + view.description : '')) : ['No durable views are defined.']),
    '',
    '## Linked resources',
    '',
    ...(doc.resources.length ? doc.resources.map((resource) => '- [' + resource.label + '](' + resource.uri + ') — ' + resource.type) : ['No resources are linked.']),
  ].join('\n');
  files['model.md'] = [
    '# Model',
    '',
    '## Elements',
    '',
    ...nodes.map(elementLine),
    '',
    '## Relationships',
    '',
    ...relationships.map((relationship) => {
      const topology = relationship.relationship.from.id + ' → ' + relationship.relationship.to.id;
      return '- **' + relationship.id + '**: ' + topology + (relationship.description ? ' — ' + relationship.description : '');
    }),
    '',
    '## Semantic inspection',
    '',
    'State: **' + model.summary.state + '**. ' + model.open.length + ' open, ' + model.accepted.length + ' accepted, ' + model.stale.length + ' stale.',
  ].join('\n');
  for (const view of doc.views) {
    const resolved = core.resolveView(doc, view.key);
    files['views/' + view.key + '.md'] = [
      '# ' + view.title,
      '',
      view.description || 'No description.',
      '',
      '- Type: ' + view.type,
      '- Direction: ' + view.direction,
      '- Perspective: ' + (view.perspective ?? 'none'),
      '- Elements: ' + resolved.elements.length,
      '',
      ...resolved.elements.map(elementLine),
    ].join('\n');
  }
  files['resources.md'] = [
    '# Resources and decisions',
    '',
    ...doc.resources.map((resource) => '- **' + resource.id + '** [' + resource.type + '](' + resource.uri + ') — ' + (resource.description || resource.label)),
  ].join('\n');
  files['workspace.json'] = JSON.stringify({
    schema: doc.schema,
    name: doc.name,
    views: doc.views,
    theme: doc.theme,
    resources: doc.resources,
    modelInspection: model,
  }, null, 2);
  return files;
}
