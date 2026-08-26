/** Public viewer surfaces. Tests import these lists so endpoint coverage cannot drift. */

export const VIEWER_STATIC_FILES = Object.freeze([
  'index.html',
  'style.css',
  'app.js',
]);

export const VIEWER_TOOLS = Object.freeze([
  'move',
  'resize',
  'restyle',
  'remove',
  'group',
  'constraint',
  'history',
  'extend_path',
  'replace_path',
  'micro_mask',
  'accept_finding',
  'unaccept_finding',
]);
