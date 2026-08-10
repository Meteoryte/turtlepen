import { createSession, createTools } from './src/mcp/tools.js';

async function run() {
  const session = createSession({ cwd: process.cwd() });
  const tools = createTools(session);
  const toolMap = new Map(tools.map((t) => [t.name, t.handler]));

  async function call(name, args) {
    const handler = toolMap.get(name);
    if (!handler) throw new Error(`Unknown tool: ${name}`);
    const res = await handler(args);
    return res;
  }

  console.log('=== TurtlePen Diagram Generator ===\n');

  // ---------------------------------------------------------------------------
  // Diagram 1: Server Structures
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 1: High-Availability Microservices Architecture...');
  await call('new_diagram', {
    name: 'Server Structures - HA Microservices',
    path: 'diagrams/server-structure-ha-microservices.turtlepen.json',
    cols: 160,
    rows: 100,
  });

  const nodes1 = [
    { id: 'client', label: 'Web & Mobile Clients', at: 'C4.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'edge', label: 'Cloudflare Edge WAF', at: 'W4.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'gateway', label: 'API Gateway / Ingress', at: 'W14.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'auth', label: 'OAuth2 Auth Service', at: 'AQ14.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'order_svc', label: 'Order Management Svc', at: 'C24.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'pay_svc', label: 'Payment Processing Svc', at: 'W24.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'user_svc', label: 'User Profile Service', at: 'AQ24.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'redis', label: 'Redis Cache Cluster', at: 'C34.tl', w: 18, h: 4, corner: 'indented' },
    { id: 'pg_primary', label: 'Postgres DB Cluster', at: 'W34.tl', w: 18, h: 4, corner: 'indented' },
    { id: 'kafka', label: 'Kafka Event Bus', at: 'AQ34.tl', w: 18, h: 4, corner: 'chamfered' },
  ];

  for (const n of nodes1) {
    const m = JSON.parse(await call('measure', { text: n.label, maxWidthCells: n.w }));
    console.log(`  Measure ${n.id}: ${m.lines} line(s) -> needs ${m.cellsTall} cells tall`);
  }

  const ops1 = nodes1.map((n) => ({
    op: 'place_box',
    id: n.id,
    at: n.at,
    span: { w: n.w, h: n.h },
    label: n.label,
    corner: n.corner,
  }));

  // Connectors for Diagram 1
  ops1.push(
    { op: 'pen', id: 'c1', program: 'pen from client.E\nright line to edge.W arrow' },
    { op: 'pen', id: 'c2', program: 'pen from edge.S\ndown align right line to gateway.N arrow' },
    { op: 'pen', id: 'c3', program: 'pen from gateway.E\nright line to auth.W arrow' },
    {
      op: 'pen',
      id: 'c4',
      program: `
        pen from gateway.W
        left line to M16
        left corner align right top
        down line to order_svc.N arrow
      `,
    },
    { op: 'pen', id: 'c5', program: 'pen from gateway.S\ndown align right line to pay_svc.N arrow' },
    { op: 'pen', id: 'c6', program: 'pen from auth.S\ndown align right line to user_svc.N arrow' },
    { op: 'pen', id: 'c7', program: 'pen from order_svc.S\ndown align right line to redis.N arrow' },
    { op: 'pen', id: 'c8', program: 'pen from pay_svc.S\ndown align right line to pg_primary.N arrow' },
    { op: 'pen', id: 'c9', program: 'pen from user_svc.S\ndown align right line to kafka.N arrow' }
  );

  const planRes1 = await call('plan', { operations: ops1, commit: true });
  console.log('Plan commit 1:', planRes1.split('\n')[0]);
  const val1 = await call('validate', {});
  console.log('Validation 1:\n', val1);
  await call('render', { path: 'diagrams/server-structure-ha-microservices.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // Diagram 2: Teaching & Education
  // ---------------------------------------------------------------------------
  console.log('\nBuilding Diagram 2: Adaptive Mastery Learning & Assessment Cycle...');
  await call('new_diagram', {
    name: 'Teaching and Education - Mastery Learning',
    path: 'diagrams/teaching-mastery-learning-cycle.turtlepen.json',
    cols: 160,
    rows: 100,
  });

  const nodes2 = [
    { id: 'concept', label: 'Interactive Core Lecture', at: 'C4.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'practice', label: 'Guided Hands-on Lab', at: 'W4.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'auto_test', label: 'Automated Code Checks', at: 'W14.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'remedial', label: 'Targeted Hints & Review', at: 'C14.tl', w: 18, h: 4, corner: 'chamfered' },
    { id: 'peer_rev', label: 'Peer Review & Feedback', at: 'W24.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'capstone', label: 'Mastery Submission', at: 'W34.tl', w: 18, h: 4, corner: 'indented' },
  ];

  const ops2 = nodes2.map((n) => ({
    op: 'place_box',
    id: n.id,
    at: n.at,
    span: { w: n.w, h: n.h },
    label: n.label,
    corner: n.corner,
  }));

  ops2.push(
    { op: 'pen', id: 'c1', program: 'pen from concept.E\nright line to practice.W arrow' },
    { op: 'pen', id: 'c2', program: 'pen from practice.S\ndown align right line to auto_test.N arrow' },
    { op: 'pen', id: 'c3', program: 'pen from auto_test.W\nleft line to remedial.E arrow' },
    { op: 'pen', id: 'c4', program: 'pen from remedial.N\nup align right line to concept.S arrow' },
    { op: 'pen', id: 'c5', program: 'pen from auto_test.S\ndown align right line to peer_rev.N arrow' },
    { op: 'pen', id: 'c6', program: 'pen from peer_rev.S\ndown align right line to capstone.N arrow' }
  );

  const planRes2 = await call('plan', { operations: ops2, commit: true });
  console.log('Plan commit 2:', planRes2.split('\n')[0]);
  const val2 = await call('validate', {});
  console.log('Validation 2:\n', val2);
  await call('render', { path: 'diagrams/teaching-mastery-learning-cycle.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // Diagram 3: Technical Analysis
  // ---------------------------------------------------------------------------
  console.log('\nBuilding Diagram 3: Quantitative Signal Generation Engine...');
  await call('new_diagram', {
    name: 'Technical Analysis - Quant Engine',
    path: 'diagrams/technical-analysis-quant-engine.turtlepen.json',
    cols: 160,
    rows: 100,
  });

  const nodes3 = [
    { id: 'feed', label: 'Realtime Tick Stream', at: 'C4.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'indicators', label: 'MACD / RSI Calc Engine', at: 'W4.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'strategy', label: 'Strategy Signal Rules', at: 'W14.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'risk', label: 'Position & Risk Filter', at: 'W24.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'rejection', label: 'Risk Violation Log', at: 'C24.tl', w: 18, h: 4, corner: 'indented' },
    { id: 'executor', label: 'Order Router Gateway', at: 'W34.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'exchange', label: 'Broker API Exchange', at: 'AQ34.tl', w: 18, h: 4, corner: 'chamfered' },
  ];

  const ops3 = nodes3.map((n) => ({
    op: 'place_box',
    id: n.id,
    at: n.at,
    span: { w: n.w, h: n.h },
    label: n.label,
    corner: n.corner,
  }));

  ops3.push(
    { op: 'pen', id: 'c1', program: 'pen from feed.E\nright line to indicators.W arrow' },
    { op: 'pen', id: 'c2', program: 'pen from indicators.S\ndown align right line to strategy.N arrow' },
    { op: 'pen', id: 'c3', program: 'pen from strategy.S\ndown align right line to risk.N arrow' },
    { op: 'pen', id: 'c4', program: 'pen from risk.W\nleft line to rejection.E arrow' },
    { op: 'pen', id: 'c5', program: 'pen from risk.S\ndown align right line to executor.N arrow' },
    { op: 'pen', id: 'c6', program: 'pen from executor.E\nright line to exchange.W arrow' }
  );

  const planRes3 = await call('plan', { operations: ops3, commit: true });
  console.log('Plan commit 3:', planRes3.split('\n')[0]);
  const val3 = await call('validate', {});
  console.log('Validation 3:\n', val3);
  await call('render', { path: 'diagrams/technical-analysis-quant-engine.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // Diagram 4: Workflow
  // ---------------------------------------------------------------------------
  console.log('\nBuilding Diagram 4: Automated CI/CD Deployment Pipeline...');
  await call('new_diagram', {
    name: 'Workflow - Automated CI/CD Pipeline',
    path: 'diagrams/workflow-cicd-deployment-pipeline.turtlepen.json',
    cols: 160,
    rows: 100,
  });

  const nodes4 = [
    { id: 'commit', label: 'Developer Git Push', at: 'C4.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'ci_build', label: 'CI Build & Unit Tests', at: 'W4.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'scan', label: 'Container Vulnerability Scan', at: 'AQ4.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'staging', label: 'Deploy Staging Cluster', at: 'AQ14.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'e2e_tests', label: 'Automated Integration Tests', at: 'W14.tl', w: 18, h: 4, corner: 'rounded' },
    { id: 'approval', label: 'Release Gate Approval', at: 'C14.tl', w: 18, h: 4, corner: 'chamfered' },
    { id: 'prod', label: 'Production Blue/Green', at: 'C24.tl', w: 18, h: 4, corner: 'indented' },
  ];

  const ops4 = nodes4.map((n) => ({
    op: 'place_box',
    id: n.id,
    at: n.at,
    span: { w: n.w, h: n.h },
    label: n.label,
    corner: n.corner,
  }));

  ops4.push(
    { op: 'pen', id: 'c1', program: 'pen from commit.E\nright line to ci_build.W arrow' },
    { op: 'pen', id: 'c2', program: 'pen from ci_build.E\nright line to scan.W arrow' },
    { op: 'pen', id: 'c3', program: 'pen from scan.S\ndown align right line to staging.N arrow' },
    { op: 'pen', id: 'c4', program: 'pen from staging.W\nleft line to e2e_tests.E arrow' },
    { op: 'pen', id: 'c5', program: 'pen from e2e_tests.W\nleft line to approval.E arrow' },
    { op: 'pen', id: 'c6', program: 'pen from approval.S\ndown align right line to prod.N arrow' }
  );

  const planRes4 = await call('plan', { operations: ops4, commit: true });
  console.log('Plan commit 4:', planRes4.split('\n')[0]);
  const val4 = await call('validate', {});
  console.log('Validation 4:\n', val4);
  await call('render', { path: 'diagrams/workflow-cicd-deployment-pipeline.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // Diagram 5: Scene - Apple
  // ---------------------------------------------------------------------------
  console.log('\nBuilding Diagram 5: Scene - Apple Illustration...');
  await call('new_diagram', {
    name: 'Scene - Apple',
    path: 'diagrams/scene-apple.turtlepen.json',
    cols: 80,
    rows: 60,
  });

  const ops5 = [
    { op: 'place_box', id: 'label_apple', at: 'F18.tl', span: { w: 16, h: 4 }, label: 'Crisp Red Apple', corner: 'rounded' },
    // Left lobe of apple
    { op: 'pen', id: 'apple_left', role: 'artwork', paint: 'cells', color: '#E63946', program: 'pen at J10\ndisc 6' },
    // Right lobe of apple
    { op: 'pen', id: 'apple_right', role: 'artwork', paint: 'cells', color: '#E63946', program: 'pen at M10\ndisc 6' },
    // Bottom fill
    { op: 'pen', id: 'apple_bottom', role: 'artwork', paint: 'cells', color: '#D90429', program: 'pen at K12\ndisc 5' },
    // Stem
    { op: 'pen', id: 'apple_stem', role: 'artwork', color: '#6B705C', width: 3, program: 'pen at K6\ndown 3 line' },
    // Leaf
    { op: 'pen', id: 'apple_leaf', role: 'artwork', paint: 'cells', color: '#2A9D8F', program: 'pen at L5\ndisc 3' },
  ];

  await call('plan', { operations: ops5, commit: true });
  const val5 = await call('validate', {});
  console.log('Validation 5:\n', val5);
  await call('render', { path: 'diagrams/scene-apple.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // Diagram 6: Scene - Tree
  // ---------------------------------------------------------------------------
  console.log('\nBuilding Diagram 6: Scene - Tree Illustration...');
  await call('new_diagram', {
    name: 'Scene - Tree',
    path: 'diagrams/scene-tree.turtlepen.json',
    cols: 100,
    rows: 80,
  });

  await call('add_page', { id: 'apples', z: 1, intent: 'overlay', title: 'Apples Overlay' });

  const ops6 = [
    // Tree Trunk
    { op: 'place_box', id: 'trunk', at: 'J20.tl', span: { w: 6, h: 12 }, label: '', fill: '#7F5539', corner: 'square' },
    // Canopy Discs
    { op: 'pen', id: 'canopy_center', role: 'artwork', paint: 'cells', color: '#386641', program: 'pen at L12\ndisc 8' },
    { op: 'pen', id: 'canopy_left', role: 'artwork', paint: 'cells', color: '#2A9D8F', program: 'pen at H12\ndisc 6' },
    { op: 'pen', id: 'canopy_right', role: 'artwork', paint: 'cells', color: '#386641', program: 'pen at P12\ndisc 6' },
    { op: 'pen', id: 'canopy_top', role: 'artwork', paint: 'cells', color: '#6A994E', program: 'pen at L8\ndisc 6' },
    // Apples on tree (on overlay page)
    { op: 'pen', id: 'tree_apple1', page: 'apples', role: 'artwork', paint: 'cells', color: '#E63946', program: 'pen at I10\ndisc 2' },
    { op: 'pen', id: 'tree_apple2', page: 'apples', role: 'artwork', paint: 'cells', color: '#E63946', program: 'pen at O10\ndisc 2' },
    { op: 'pen', id: 'tree_apple3', page: 'apples', role: 'artwork', paint: 'cells', color: '#E63946', program: 'pen at L7\ndisc 2' },
    // Grass ground
    { op: 'pen', id: 'grass', role: 'artwork', color: '#52B788', width: 4, program: 'pen at B32\nright line to X32' },
    { op: 'place_box', id: 'label_tree', at: 'G34.tl', span: { w: 16, h: 4 }, label: 'Lush Apple Tree', corner: 'rounded' },
  ];

  await call('plan', { operations: ops6, commit: true });
  const val6 = await call('validate', {});
  console.log('Validation 6:\n', val6);
  await call('render', { path: 'diagrams/scene-tree.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // Diagram 7: Scene - Fence
  // ---------------------------------------------------------------------------
  console.log('\nBuilding Diagram 7: Scene - Wooden Picket Fence...');
  await call('new_diagram', {
    name: 'Scene - Picket Fence',
    path: 'diagrams/scene-fence.turtlepen.json',
    cols: 120,
    rows: 60,
  });

  await call('add_page', { id: 'rails', z: 1, intent: 'overlay', title: 'Fence Rails Overlay' });

  const pickets = [
    { id: 'p1', at: 'D6.tl' },
    { id: 'p2', at: 'J6.tl' },
    { id: 'p3', at: 'P6.tl' },
    { id: 'p4', at: 'V6.tl' },
    { id: 'p5', at: 'AB6.tl' },
    { id: 'p6', at: 'AH6.tl' },
    { id: 'p7', at: 'AN6.tl' },
  ];

  const ops7 = pickets.map((p) => ({
    op: 'place_box',
    id: p.id,
    at: p.at,
    span: { w: 4, h: 14 },
    label: '',
    corner: 'chamfered',
    fill: '#DDB892',
  }));

  // Horizontal support rails on overlay page
  ops7.push(
    { op: 'pen', id: 'rail_top', page: 'rails', role: 'artwork', color: '#B08968', width: 4, program: 'pen at B9\nright line to AR9' },
    { op: 'pen', id: 'rail_bottom', page: 'rails', role: 'artwork', color: '#B08968', width: 4, program: 'pen at B15\nright line to AR15' },
    { op: 'pen', id: 'fence_grass', page: 'rails', role: 'artwork', color: '#52B788', width: 3, program: 'pen at B20\nright line to AR20' },
    { op: 'place_box', id: 'label_fence', at: 'N22.tl', span: { w: 18, h: 4 }, label: 'Wooden Picket Fence', corner: 'rounded' }
  );

  await call('plan', { operations: ops7, commit: true });
  const val7 = await call('validate', {});
  console.log('Validation 7:\n', val7);
  await call('render', { path: 'diagrams/scene-fence.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // Diagram 8: Scene - Living Room Stick Figure Family
  // ---------------------------------------------------------------------------
  console.log('\nBuilding Diagram 8: Scene - Living Room Stick Figure Family...');
  await call('new_diagram', {
    name: 'Scene - Living Room Family',
    path: 'diagrams/scene-living-room-family.turtlepen.json',
    cols: 160,
    rows: 100,
  });

  await call('add_page', { id: 'furniture', z: 1, intent: 'overlay', title: 'Furniture Overlay' });
  await call('add_page', { id: 'family', z: 2, intent: 'overlay', title: 'Family Figures Overlay' });

  const ops8 = [
    // Header Label & Rug on base page
    { op: 'place_box', id: 'header', at: 'K4.tl', span: { w: 28, h: 4 }, label: 'Cozy Living Room & Family', corner: 'rounded' },
    { op: 'place_box', id: 'rug', at: 'G22.tl', span: { w: 26, h: 6 }, label: 'Area Rug', corner: 'indented', fill: '#F4A261' },

    // Furniture on furniture overlay page
    { op: 'place_box', id: 'couch', page: 'furniture', at: 'I16.tl', span: { w: 22, h: 6 }, label: 'Family Sofa', corner: 'rounded', fill: '#457B9D' },
    { op: 'place_box', id: 'tv_unit', page: 'furniture', at: 'AO14.tl', span: { w: 14, h: 8 }, label: 'OLED TV Screen', corner: 'square', fill: '#1D3557' },
    { op: 'place_box', id: 'table', page: 'furniture', at: 'M23.tl', span: { w: 12, h: 3 }, label: 'Coffee Table', corner: 'chamfered', fill: '#E9C46A' },
    { op: 'place_box', id: 'lamp', page: 'furniture', at: 'D14.tl', span: { w: 4, h: 10 }, label: 'Lamp', corner: 'rounded', fill: '#2A9D8F' },

    // Dad Stick Figure (on family overlay)
    { op: 'pen', id: 'dad_head', page: 'family', role: 'artwork', paint: 'cells', color: '#E63946', program: 'pen at J11\ndisc 3' },
    { op: 'pen', id: 'dad_body', page: 'family', role: 'artwork', color: '#1D3557', width: 3, program: 'pen at J13\ndown 3 line' },
    { op: 'pen', id: 'dad_arms', page: 'family', role: 'artwork', color: '#1D3557', width: 2, program: 'pen at H14\nright line to L14' },

    // Mom Stick Figure (on family overlay)
    { op: 'pen', id: 'mom_head', page: 'family', role: 'artwork', paint: 'cells', color: '#E63946', program: 'pen at P11\ndisc 3' },
    { op: 'pen', id: 'mom_body', page: 'family', role: 'artwork', color: '#1D3557', width: 3, program: 'pen at P13\ndown 3 line' },
    { op: 'pen', id: 'mom_arms', page: 'family', role: 'artwork', color: '#1D3557', width: 2, program: 'pen at N14\nright line to R14' },

    // Child Stick Figure (on family overlay)
    { op: 'pen', id: 'child_head', page: 'family', role: 'artwork', paint: 'cells', color: '#E63946', program: 'pen at U12\ndisc 2' },
    { op: 'pen', id: 'child_body', page: 'family', role: 'artwork', color: '#1D3557', width: 2, program: 'pen at U14\ndown 2 line' },
    { op: 'pen', id: 'child_arms', page: 'family', role: 'artwork', color: '#1D3557', width: 2, program: 'pen at T14\nright line to V14' },

    // Pet Dog (next to sofa, outside couch bounds)
    { op: 'pen', id: 'dog_head', page: 'family', role: 'artwork', paint: 'cells', color: '#7F5539', program: 'pen at AH23\ndisc 2' },
    { op: 'pen', id: 'dog_body', page: 'family', role: 'artwork', paint: 'cells', color: '#7F5539', program: 'pen at AF24\ndisc 3' },
  ];

  await call('plan', { operations: ops8, commit: true });
  const val8 = await call('validate', {});
  console.log('Validation 8:\n', val8);
  await call('render', { path: 'diagrams/scene-living-room-family.svg', force: true });
  await call('save', { force: true });

  console.log('\nAll 4 diagrams generated and validated successfully!');
}

run().catch((err) => {
  console.error('Error generating diagrams:', err);
  process.exit(1);
});
