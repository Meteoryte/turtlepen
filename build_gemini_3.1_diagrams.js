import { createSession, createTools } from './src/mcp/tools.js';

async function run() {
  const session = createSession({ cwd: process.cwd() });
  const tools = createTools(session);
  const toolMap = new Map(tools.map((t) => [t.name, t.handler]));

  async function call(name, args) {
    const handler = toolMap.get(name);
    if (!handler) throw new Error(`Unknown tool: ${name}`);
    return await handler(args);
  }

  console.log('=== TurtlePen Diagram Generator (Gemini 3.1 Pro) ===\n');

  // ---------------------------------------------------------------------------
  // Diagram 1: Server Structures
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 1: Load Balanced Architecture...');
  await call('new_diagram', {
    name: 'Server Structures - Load Balanced',
    path: 'diagrams/gemini31-server-structure.turtlepen.json',
    cols: 160,
    rows: 100,
  });

  const nodes1 = [
    { id: 'lb', label: 'Global Load Balancer', at: 'N4.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'web1', label: 'Web Server A', at: 'C14.tl', w: 16, h: 4, corner: 'square' },
    { id: 'web2', label: 'Web Server B', at: 'AA14.tl', w: 16, h: 4, corner: 'square' },
    { id: 'db_master', label: 'Primary Database', at: 'N24.tl', w: 18, h: 4, corner: 'indented' },
    { id: 'db_replica', label: 'Read Replica', at: 'N34.tl', w: 18, h: 4, corner: 'indented' },
  ];

  const ops1 = nodes1.map((n) => ({
    op: 'place_box', id: n.id, at: n.at, span: { w: n.w, h: n.h }, label: n.label, corner: n.corner,
  }));

  ops1.push(
    { op: 'pen', id: 'c1', program: 'pen from lb.S\ndown 2 align right line\nleft corner align top left\nleft 9 align top line\ndown corner align left bottom\ndown line to web1.N arrow' },
    { op: 'pen', id: 'c2', program: 'pen from lb.S\ndown 2 align right line\nright corner align top right\nright 13 align top line\ndown corner align right bottom\ndown line to web2.N arrow' },
    { op: 'pen', id: 'c3', program: 'pen from web1.S\ndown 2 align right line\nright corner align top right\nright 9 align top line\ndown corner align right bottom\ndown line to db_master.N arrow' },
    { op: 'pen', id: 'c4', program: 'pen from web2.S\ndown 2 align left line\nleft corner align top left\nleft 13 align top line\ndown corner align left bottom\ndown line to db_master.N arrow' },
    { op: 'pen', id: 'c5', program: 'pen from db_master.S\ndown align right line to db_replica.N arrow' }
  );

  await call('plan', { operations: ops1, commit: true });
  await call('render', { path: 'diagrams/gemini31-server-structure.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // Diagram 2: Teaching & Education
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 2: Learning Feedback Loop...');
  await call('new_diagram', {
    name: 'Teaching and Education - Feedback Loop',
    path: 'diagrams/gemini31-teaching-loop.turtlepen.json',
    cols: 160,
    rows: 100,
  });

  const nodes2 = [
    { id: 'theory', label: 'Theory & Lecture', at: 'W4.tl', w: 16, h: 4, corner: 'rounded' },
    { id: 'practice', label: 'Applied Practice', at: 'AL4.tl', w: 16, h: 4, corner: 'rounded' },
    { id: 'eval', label: 'Evaluation', at: 'AL14.tl', w: 16, h: 4, corner: 'rounded' },
    { id: 'review', label: 'Review & Refine', at: 'W14.tl', w: 16, h: 4, corner: 'rounded' },
  ];

  const ops2 = nodes2.map((n) => ({
    op: 'place_box', id: n.id, at: n.at, span: { w: n.w, h: n.h }, label: n.label, corner: n.corner,
  }));

  ops2.push(
    { op: 'pen', id: 'c1', program: 'pen from theory.E\nright line to practice.W arrow' },
    { op: 'pen', id: 'c2', program: 'pen from practice.S\ndown align right line to eval.N arrow' },
    { op: 'pen', id: 'c3', program: 'pen from eval.W\nleft line to review.E arrow' },
    { op: 'pen', id: 'c4', program: 'pen from review.N\nup align right line to theory.S arrow' }
  );

  await call('plan', { operations: ops2, commit: true });
  await call('render', { path: 'diagrams/gemini31-teaching-loop.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // Diagram 3: Technical Analysis
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 3: Algorithmic Trading...');
  await call('new_diagram', {
    name: 'Technical Analysis - Algorithmic Trading',
    path: 'diagrams/gemini31-technical-analysis.turtlepen.json',
    cols: 160,
    rows: 100,
  });

  const nodes3 = [
    { id: 'data', label: 'Market Tick Data', at: 'C4.tl', w: 16, h: 4, corner: 'chamfered' },
    { id: 'sma', label: 'SMA Crossover', at: 'W4.tl', w: 16, h: 4, corner: 'rounded' },
    { id: 'rsi', label: 'RSI Oscillator', at: 'W14.tl', w: 16, h: 4, corner: 'rounded' },
    { id: 'logic', label: 'Trading Logic', at: 'AL9.tl', w: 16, h: 4, corner: 'square' },
    { id: 'broker', label: 'Broker Execution', at: 'BA9.tl', w: 16, h: 4, corner: 'chamfered' },
  ];

  const ops3 = nodes3.map((n) => ({
    op: 'place_box', id: n.id, at: n.at, span: { w: n.w, h: n.h }, label: n.label, corner: n.corner,
  }));

  ops3.push(
    { op: 'pen', id: 'c1', program: 'pen from data.E\nright line to sma.W arrow' },
    { op: 'pen', id: 'c2', program: 'pen from data.S\ndown 10 align right line\nright corner align top right\nright 4 align top line\ndown corner align right bottom\nright line to rsi.W arrow' },
    { op: 'pen', id: 'c3', program: 'pen from sma.E\nright 4 align bottom line\ndown corner align left bottom\ndown 3 align left line\nright corner align top right\nright line to logic.W arrow' },
    { op: 'pen', id: 'c4', program: 'pen from rsi.E\nright 4 align top line\nup corner align left top\nup 3 align left line\nright corner align bottom right\nright line to logic.W arrow' },
    { op: 'pen', id: 'c5', program: 'pen from logic.E\nright line to broker.W arrow' }
  );

  await call('plan', { operations: ops3, commit: true });
  await call('render', { path: 'diagrams/gemini31-technical-analysis.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // Diagram 4: Workflow
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 4: DevOps CI/CD...');
  await call('new_diagram', {
    name: 'Workflow - CI/CD',
    path: 'diagrams/gemini31-workflow.turtlepen.json',
    cols: 160,
    rows: 100,
  });

  const nodes4 = [
    { id: 'git', label: 'Source Control', at: 'C4.tl', w: 16, h: 4, corner: 'rounded' },
    { id: 'build', label: 'Container Build', at: 'W4.tl', w: 16, h: 4, corner: 'square' },
    { id: 'test', label: 'Automated Tests', at: 'AL4.tl', w: 16, h: 4, corner: 'square' },
    { id: 'push', label: 'Registry Push', at: 'BA4.tl', w: 16, h: 4, corner: 'chamfered' },
    { id: 'deploy', label: 'K8s Deployment', at: 'BA14.tl', w: 16, h: 4, corner: 'rounded' },
  ];

  const ops4 = nodes4.map((n) => ({
    op: 'place_box', id: n.id, at: n.at, span: { w: n.w, h: n.h }, label: n.label, corner: n.corner,
  }));

  ops4.push(
    { op: 'pen', id: 'c1', program: 'pen from git.E\nright line to build.W arrow' },
    { op: 'pen', id: 'c2', program: 'pen from build.E\nright line to test.W arrow' },
    { op: 'pen', id: 'c3', program: 'pen from test.E\nright line to push.W arrow' },
    { op: 'pen', id: 'c4', program: 'pen from push.S\ndown align right line to deploy.N arrow' }
  );

  await call('plan', { operations: ops4, commit: true });
  await call('render', { path: 'diagrams/gemini31-workflow.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // Diagram 5: Scene - Apple
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 5: Scene - Apple...');
  await call('new_diagram', {
    name: 'Scene - Apple',
    path: 'diagrams/gemini31-scene-apple.turtlepen.json',
    cols: 80,
    rows: 60,
  });

  const ops5 = [
    { op: 'pen', id: 'apple_body', role: 'artwork', paint: 'cells', color: '#D90429', program: 'pen at J12\ncircle 8\ndisc 7' },
    { op: 'pen', id: 'apple_stem', role: 'artwork', color: '#5C4033', width: 4, program: 'pen at J4\ndown 4 line' },
    { op: 'pen', id: 'apple_leaf', role: 'artwork', paint: 'cells', color: '#2A9D8F', program: 'pen at M6\ndisc 3' },
    { op: 'place_box', id: 'label_apple', at: 'D24.tl', span: { w: 12, h: 4 }, label: 'Juicy Apple', corner: 'rounded' },
  ];

  await call('plan', { operations: ops5, commit: true });
  await call('render', { path: 'diagrams/gemini31-scene-apple.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // Diagram 6: Scene - Tree
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 6: Scene - Tree...');
  await call('new_diagram', {
    name: 'Scene - Tree',
    path: 'diagrams/gemini31-scene-tree.turtlepen.json',
    cols: 100,
    rows: 80,
  });
  
  await call('add_page', { id: 'leaves', z: 1, intent: 'overlay', title: 'Leaves Overlay' });

  const ops6 = [
    { op: 'place_box', id: 'trunk', at: 'O20.tl', span: { w: 4, h: 10 }, label: '', fill: '#8B5A2B', corner: 'square' },
    { op: 'pen', id: 'ground', role: 'artwork', color: '#4CAF50', width: 5, program: 'pen at C30\nright line to AC30' },
    { op: 'pen', id: 'canopy1', page: 'leaves', role: 'artwork', paint: 'cells', color: '#2E8B57', program: 'pen at M15\ndisc 7' },
    { op: 'pen', id: 'canopy2', page: 'leaves', role: 'artwork', paint: 'cells', color: '#3CB371', program: 'pen at Q15\ndisc 7' },
    { op: 'pen', id: 'canopy3', page: 'leaves', role: 'artwork', paint: 'cells', color: '#228B22', program: 'pen at O10\ndisc 8' },
    { op: 'place_box', id: 'label_tree', at: 'K34.tl', span: { w: 12, h: 4 }, label: 'Green Tree', corner: 'rounded' },
  ];

  await call('plan', { operations: ops6, commit: true });
  await call('render', { path: 'diagrams/gemini31-scene-tree.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // Diagram 7: Scene - Fence
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 7: Scene - Fence...');
  await call('new_diagram', {
    name: 'Scene - Fence',
    path: 'diagrams/gemini31-scene-fence.turtlepen.json',
    cols: 120,
    rows: 60,
  });

  await call('add_page', { id: 'posts', z: 1, intent: 'overlay', title: 'Fence Posts' });

  const ops7 = [
    { op: 'pen', id: 'bar1', role: 'artwork', color: '#A0522D', width: 5, program: 'pen at B10\nright line to AJ10' },
    { op: 'pen', id: 'bar2', role: 'artwork', color: '#A0522D', width: 5, program: 'pen at B18\nright line to AJ18' },
    { op: 'place_box', id: 'p1', page: 'posts', at: 'E6.tl', span: { w: 3, h: 16 }, label: '', corner: 'chamfered', fill: '#DEB887' },
    { op: 'place_box', id: 'p2', page: 'posts', at: 'M6.tl', span: { w: 3, h: 16 }, label: '', corner: 'chamfered', fill: '#DEB887' },
    { op: 'place_box', id: 'p3', page: 'posts', at: 'U6.tl', span: { w: 3, h: 16 }, label: '', corner: 'chamfered', fill: '#DEB887' },
    { op: 'place_box', id: 'p4', page: 'posts', at: 'AC6.tl', span: { w: 3, h: 16 }, label: '', corner: 'chamfered', fill: '#DEB887' },
    { op: 'place_box', id: 'label_fence', at: 'M24.tl', span: { w: 12, h: 4 }, label: 'White Fence', corner: 'rounded' },
  ];

  await call('plan', { operations: ops7, commit: true });
  await call('render', { path: 'diagrams/gemini31-scene-fence.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // Diagram 8: Scene - Living Room Family
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 8: Scene - Living Room Family...');
  await call('new_diagram', {
    name: 'Scene - Living Room Family',
    path: 'diagrams/gemini31-scene-living-room-family.turtlepen.json',
    cols: 160,
    rows: 100,
  });

  await call('add_page', { id: 'people', z: 1, intent: 'overlay', title: 'People' });

  const ops8 = [
    { op: 'place_box', id: 'tv', at: 'AA6.tl', span: { w: 18, h: 8 }, label: 'Television', corner: 'square', fill: '#333333' },
    { op: 'place_box', id: 'stand', at: 'Y14.tl', span: { w: 22, h: 4 }, label: '', corner: 'square', fill: '#8B4513' },
    { op: 'place_box', id: 'sofa', at: 'G16.tl', span: { w: 14, h: 6 }, label: 'Sofa', corner: 'rounded', fill: '#4682B4' },
    { op: 'pen', id: 'floor', role: 'artwork', color: '#CD853F', width: 5, program: 'pen at C22\nright line to AS22' },
    
    // Person 1
    { op: 'pen', id: 'p1_head', page: 'people', role: 'artwork', paint: 'cells', color: '#FFD700', program: 'pen at K10\ndisc 3' },
    { op: 'pen', id: 'p1_body', page: 'people', role: 'artwork', color: '#000000', width: 3, program: 'pen at K13\ndown 4 line' },
    { op: 'pen', id: 'p1_arms', page: 'people', role: 'artwork', color: '#000000', width: 3, program: 'pen at H14\nright line to N14' },
    
    // Person 2
    { op: 'pen', id: 'p2_head', page: 'people', role: 'artwork', paint: 'cells', color: '#FFD700', program: 'pen at S14\ndisc 2' },
    { op: 'pen', id: 'p2_body', page: 'people', role: 'artwork', color: '#000000', width: 2, program: 'pen at S16\ndown 3 line' },
    { op: 'pen', id: 'p2_arms', page: 'people', role: 'artwork', color: '#000000', width: 2, program: 'pen at Q17\nright line to U17' },
  ];

  await call('plan', { operations: ops8, commit: true });
  await call('render', { path: 'diagrams/gemini31-scene-living-room-family.svg', force: true });
  await call('save', { force: true });

  console.log('\nAll 8 diagrams built from scratch by Gemini 3.1 Pro (High)!');
}

run().catch((err) => {
  console.error('Error generating diagrams:', err);
  process.exit(1);
});
