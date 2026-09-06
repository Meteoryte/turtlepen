/** Schemas for native selection workflows; lifecycle stays in the common tool wrapper. */
export function editingTools({ core, session, need, applyAndPersist, json }) {
  const string = { type: 'string' }, integer = { type: 'integer' }, boolean = { type: 'boolean' };
  const ids = { type: 'array', items: string, minItems: 1, uniqueItems: true };
  const region = { type: 'object', properties: { x: { ...integer, minimum: 0 }, y: { ...integer, minimum: 0 }, w: { ...integer, minimum: 1 }, h: { ...integer, minimum: 1 } }, required: ['x', 'y', 'w', 'h'], additionalProperties: false };
  const mutation = (name, description, properties, required = []) => ({ name, description,
    inputSchema: { type: 'object', properties, required, additionalProperties: false },
    handler: async args => json(await applyAndPersist(session, name, args)) });
  return [
    mutation('paint_path', 'Restyle named paths or a flat artwork group with color, width, cap, or a baked linear/radial color field. Exact quadrant occupancy stays unchanged. Per-piece colors are shared by SVG and raster output; no opaque SVG gradient definition or second renderer is introduced.', {
      ids, group: string, color: string, width: { ...integer, minimum: 1, maximum: 5 }, cap: { type: 'string', enum: ['butt', 'round', 'square'] },
      gradient: { type: 'object', properties: { type: { type: 'string', enum: ['linear', 'radial'] }, from: string, to: string, center: string,
        radius: { type: 'number', exclusiveMinimum: 0 }, angle: { type: 'number' } }, required: ['type', 'from', 'to'], additionalProperties: false },
    }),
    { name: 'export_timeline', description: 'Export complete native timeline source as JSON, or a representable Mermaid timeline projection. Mermaid reports identity/layout omissions and an id mapping, and refuses rich fields it cannot preserve. Returns source text only; never writes a file or drops unsupported event meaning.',
      inputSchema: { type: 'object', properties: { id: string, format: { type: 'string', enum: ['json', 'mermaid'] } }, required: ['id'], additionalProperties: false },
      handler: args => json(core.exportTimeline(need(session), args)) },
    mutation('transform', 'Transform explicit path artwork or a flat group with quarter turns, reflections, whole-quadrant translation, and integer cell magnification. Scaling requires cell paint (stroke_to_path). Off-grid results, pixel masks, or non-path objects refuse atomically. Default pivot is bounding cell center, or top-left for scaling; an explicit address removes ambiguity. Copies use prefix-originalId and do not clone constraints.', {
      ids, group: string, rotate: { type: 'integer', enum: [0, 90, 180, 270, -90, -180, -270] },
      flip: { type: 'string', enum: ['horizontal', 'vertical', 'both'] },
      scaleX: { ...integer, minimum: 1, maximum: 100 }, scaleY: { ...integer, minimum: 1, maximum: 100 },
      pivot: string, copyPrefix: string, dx: integer, dy: integer,
    }),
    mutation('guide', 'Create or remove a named horizontal/vertical construction guide, or snap named element anchors to its nearest occupied quadrant. Guides are ordinary overlay paths, persist through restart, and block release even when hidden. Inspect them with query(properties:{constructionGuide:"true"}).', {
      action: { type: 'string', enum: ['create', 'snap', 'remove'] }, id: string, from: string, to: string,
      page: string, color: string, ids, anchor: string,
    }, ['id']),
    mutation('cleanup', 'Remove exact duplicate path artwork in caller order, retaining the first. Different semantics, pages, groups, relationships, and masks prevent deletion. Optionally remove empty groups. Returns every removal and protected duplicate; never approximates geometry.', {
      ids, removeDuplicates: boolean, emptyGroups: boolean,
    }, ['ids']),
    mutation('page', 'Duplicate independent page artwork, merge a page into another, solo one page, or show all pages. Copies have destination-originalId ids. Duplication refuses semantic relationships and generated content instead of losing them; merge preserves existing ids.', {
      action: { type: 'string', enum: ['duplicate', 'merge', 'solo', 'show_all'] }, id: string, to: string,
    }, ['action', 'id']),
    {
      name: 'query', description: 'Find elements with explicit AND filters: page, ids, kind, role, tags, properties, text, color, contained/intersecting quadrant bounds. Invert within page scope; sort nearest by bounding-rectangle distance to an address. Stable bounded pagination, at most 500 results, no selection state or mutation.',
      inputSchema: { type: 'object', properties: {
        page: string, ids, kind: { type: 'string', enum: ['path', 'box', 'text', 'image'] }, role: string,
        tags: { type: 'array', items: string }, properties: { type: 'object', additionalProperties: string },
        text: string, color: string, within: region, intersecting: region, nearest: string, invert: boolean,
        offset: { ...integer, minimum: 0 }, limit: { ...integer, minimum: 1, maximum: 500 },
      }, additionalProperties: false }, handler: args => json(core.queryElements(need(session), args)),
    },
  ];
}
