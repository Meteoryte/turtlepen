/**
 * Recreate the supplied branching-tree reference with TurtlePen itself.
 *
 * This intentionally drives the same tool handlers exposed by the MCP server:
 * new_diagram -> plan/commit -> validate -> save/render. The SVG is generated
 * by TurtlePen; it is never hand-authored.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import * as core from '../src/core/index.js';
import { createSession, createTools } from '../src/mcp/tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');
const session = createSession({ cwd: project });
const tools = Object.fromEntries(createTools(session).map((tool) => [tool.name, tool]));
const q = (x, y) => core.address.quadToAddress(x, y);
// The study data was sketched on a generous logical grid. Compress its crown
// into the reference's narrower, lower silhouette before converting to cells.
const treeQ = (x, y) => q(
  54 + Math.round((x - 54) * 0.86),
  y < 84 ? 84 - Math.round((84 - y) * 0.92) : y,
);

const branches = [
  // trunk and primary fork
  [54, 99, 54, 84], [54, 84, 47, 72], [54, 84, 61, 72],
  // left crown
  [47, 72, 47, 61], [47, 61, 42, 52], [42, 52, 42, 42],
  [42, 42, 37, 38], [42, 42, 47, 35], [47, 61, 37, 58],
  [37, 58, 33, 52], [33, 52, 33, 44], [33, 44, 29, 40],
  [33, 44, 27, 46], [37, 58, 29, 58], [29, 58, 24, 54],
  [24, 54, 19, 53], [24, 54, 21, 49], [29, 58, 24, 63],
  [24, 63, 18, 67], [18, 67, 22, 72], [18, 67, 15, 64],
  [47, 72, 37, 67], [37, 67, 29, 67], [29, 67, 24, 63],
  [29, 67, 24, 72], [24, 72, 20, 77],
  // right crown
  [61, 72, 61, 61], [61, 61, 66, 52], [66, 52, 66, 43],
  [66, 43, 61, 38], [66, 43, 72, 40], [61, 61, 71, 58],
  [71, 58, 74, 51], [74, 51, 74, 44], [74, 44, 80, 40],
  [74, 44, 70, 39], [71, 58, 79, 58], [79, 58, 84, 54],
  [84, 54, 89, 55], [84, 54, 87, 49], [79, 58, 84, 64],
  [84, 64, 90, 68], [90, 68, 86, 73], [90, 68, 93, 73],
  [61, 72, 70, 67], [70, 67, 79, 67], [79, 67, 84, 64],
  [79, 67, 85, 72],
  // dense inner canopy
  [47, 61, 54, 52], [54, 52, 54, 42], [54, 42, 50, 37],
  [54, 42, 58, 37], [54, 52, 61, 45], [61, 45, 61, 38],
  [61, 45, 66, 40], [42, 52, 48, 45], [48, 45, 48, 38],
  [48, 45, 52, 41], [37, 38, 35, 34], [47, 35, 45, 32],
  [50, 37, 49, 33], [58, 37, 59, 33], [61, 38, 64, 34],
  [70, 39, 72, 35], [80, 40, 82, 36],
];

const leaves = [
  [20, 77, 'sw'], [22, 72, 'se'], [15, 64, 'w'], [18, 67, 'w'],
  [19, 53, 'w'], [21, 49, 'nw'], [27, 46, 'w'], [29, 40, 'nw'],
  [35, 34, 'nw'], [37, 38, 'w'], [42, 35, 'n'], [45, 32, 'n'],
  [47, 35, 'ne'], [49, 33, 'n'], [50, 37, 'w'], [52, 41, 'ne'],
  [54, 42, 'e'], [58, 37, 'ne'], [59, 33, 'n'], [61, 38, 'w'],
  [64, 34, 'ne'], [66, 40, 'e'], [70, 39, 'w'], [72, 35, 'ne'],
  [72, 40, 'e'], [74, 44, 'e'], [80, 40, 'ne'], [82, 36, 'ne'],
  [87, 49, 'ne'], [89, 55, 'e'], [84, 54, 'ne'], [86, 73, 'sw'],
  [93, 73, 'se'], [90, 68, 'e'], [85, 72, 'se'], [84, 64, 'ne'],
  [24, 72, 'w'], [24, 63, 'sw'], [29, 58, 'w'], [33, 52, 'w'],
  [33, 44, 'w'], [42, 42, 'w'], [48, 38, 'n'], [54, 52, 'w'],
  [61, 45, 'e'], [66, 43, 'e'], [71, 58, 'e'], [79, 58, 'e'],
  [79, 67, 'e'], [70, 67, 'ne'],
];

const branchProgram = branches
  .map(([x1, y1, x2, y2]) => `pen ${treeQ(x1, y1)}\nray to ${treeQ(x2, y2)}`)
  .join('\n');
const leafProgram = leaves
  .map(([x, y, dir]) => `pen ${treeQ(x, y)}\ndash 2 ${dir}`)
  .join('\n');

await tools.new_diagram.handler({
  name: 'Branching Tree Study',
  path: 'diagrams/branching-tree.turtlepen.json',
  cols: 54,
  rows: 96,
});
// Keep the checked-in artifact byte-reproducible across runs. The tool still
// creates the document normally; only its presentation metadata is pinned.
session.doc.createdAt = '2026-08-08T00:00:00.000Z';

const operations = [
  { op: 'add_page', id: 'leaves', z: 1, intent: 'overlay', title: 'Leaves' },
  {
    op: 'pen', id: 'branches', page: 'base', program: branchProgram,
    role: 'artwork', color: '#84635b', width: 2, cap: 'round',
  },
  {
    op: 'pen', id: 'leaves', page: 'leaves', program: leafProgram,
    role: 'artwork', color: '#168b2a', width: 5, cap: 'round',
  },
];

const planned = await tools.plan.handler({ operations, commit: false });
if (/FAILED/.test(planned)) throw new Error(planned);
const committed = await tools.plan.handler({ operations, commit: true });
if (/FAILED/.test(committed)) throw new Error(committed);

const validation = core.validate(session.doc);
const blocking = validation.open.filter((finding) => finding.severity !== 'S3');
if (blocking.length) throw new Error(core.formatLog(validation));

await tools.save.handler({});
await tools.render.handler({
  path: 'diagrams/branching-tree.svg',
  showGrid: false,
  bounds: 'canvas',
  margin: 0,
});

console.log(`tree authored with TurtlePen: ${branches.length} branch segments, ${leaves.length} leaves`);
console.log(`document: ${session.path}`);
console.log('render: diagrams/branching-tree.svg (540x960)');
console.log(core.formatLog(validation));
