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

  console.log('=== TurtlePen Diagram Generator (Gemini 3.1 Pro - Dense & Intricate) ===\n');

  // ---------------------------------------------------------------------------
  // 1. Server Structures (Intricate Datacenter)
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 1: Intricate Datacenter...');
  await call('new_diagram', { name: 'Datacenter', path: 'diagrams/gemini31-server-structure.turtlepen.json', cols: 140, rows: 90 });
  await call('add_page', { id: 'cabling', z: 1, intent: 'overlay', title: 'Cabling' });
  await call('add_page', { id: 'lights', z: 2, intent: 'overlay', title: 'Blinking Lights' });

  const ops1 = [
    { op: 'place_box', id: 'lbl', at: 'E4.tl', span: { w: 30, h: 4 }, label: 'Global Datacenter Topology', corner: 'chamfered' },
  ];

  // Draw 3 detailed server racks
  for (let i = 0; i < 3; i++) {
    let col = ['B', 'P', 'AD'][i]; // Base columns
    let atStr = `${col}15.tl`;
    ops1.push({ op: 'place_box', id: `rack${i}`, at: atStr, span: { w: 10, h: 40 }, label: `Rack 0${i+1}`, corner: 'square', fill: '#2B2D42' });
    
    // Draw 8 server blades inside each rack using manual artwork lines
    for (let j = 0; j < 8; j++) {
      let r = 20 + (j * 4);
      ops1.push({ op: 'pen', id: `blade_${i}_${j}`, role: 'artwork', color: '#8D99AE', width: 2, program: `pen at ${col}${r}\nright 9 align top line` });
      
      // Add blinking lights on overlay
      let lightColor = (i + j) % 3 === 0 ? '#EF233C' : '#80ED99';
      ops1.push({ op: 'pen', id: `light_${i}_${j}_a`, page: 'lights', role: 'artwork', paint: 'cells', color: lightColor, program: `pen at ${col}${r}.q2\ndot` });
      ops1.push({ op: 'pen', id: `light_${i}_${j}_b`, page: 'lights', role: 'artwork', paint: 'cells', color: '#00B4D8', program: `pen at ${col}${r}.q4\ndot` });
    }
  }

  // Draw detailed Database Cylinders (using arcs)
  const dbs = ['AN', 'BD'];
  for (let i = 0; i < 2; i++) {
    let base = dbs[i];
    ops1.push({ op: 'pen', id: `db_top_${i}`, role: 'artwork', paint: 'cells', color: '#023E8A', program: `pen at ${base}20\narc 15 180 360` });
    ops1.push({ op: 'pen', id: `db_body_${i}`, role: 'artwork', paint: 'cells', color: '#0077B6', program: `pen at ${base}21\nright 15 align top line\ndown 18 align left line\nleft 15 align top line\nup 18 align left line` });
    ops1.push({ op: 'pen', id: `db_base_${i}`, role: 'artwork', paint: 'cells', color: '#03045E', program: `pen at ${base}39\narc 15 0 180` });
    ops1.push({ op: 'place_box', id: `db_lbl_${i}`, at: `${base}45.tl`, span: { w: 12, h: 4 }, label: `DB Cluster ${i}`, corner: 'rounded' });
  }

  // Intricate cabling network on overlay
  ops1.push({ op: 'pen', id: 'cable1', page: 'cabling', role: 'artwork', color: '#FCA311', width: 2, program: `pen at D56\nright 45 align bottom line\nup 10 align right line\nright 15 align bottom line\nup 5 align right line` });
  ops1.push({ op: 'pen', id: 'cable2', page: 'cabling', role: 'artwork', color: '#E63946', width: 2, program: `pen at R56\nright 40 align bottom line\nup 8 align right line\nright 20 align bottom line\nup 3 align right line` });

  await call('plan', { operations: ops1, commit: true });
  await call('render', { path: 'diagrams/gemini31-server-structure.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // 2. Teaching & Education (Brain & Neural Pathways)
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 2: Brain & Neural Learning Process...');
  await call('new_diagram', { name: 'Neural Learning', path: 'diagrams/gemini31-teaching-loop.turtlepen.json', cols: 140, rows: 100 });
  
  const ops2 = [
    { op: 'place_box', id: 'lbl2', at: 'N4.tl', span: { w: 25, h: 4 }, label: 'Cognitive Learning Patterns', corner: 'indented' },
  ];

  // Draw an intricate brain using overlapping circles and arcs
  const brainLobes = [
    { at: 'AB30', r: 15, c: '#FFB5A7' },
    { at: 'AI25', r: 18, c: '#FEC5BB' },
    { at: 'AT30', r: 16, c: '#FCD5CE' },
    { at: 'AC45', r: 14, c: '#F8EDEB' },
    { at: 'AM45', r: 17, c: '#F9E2AE' },
    { at: 'AI55', r: 12, c: '#E8E8E4' }
  ];
  for (let i = 0; i < brainLobes.length; i++) {
    ops2.push({ op: 'pen', id: `lobe_${i}`, role: 'artwork', paint: 'cells', color: brainLobes[i].c, program: `pen at ${brainLobes[i].at}\ncircle ${brainLobes[i].r}\ndisc ${brainLobes[i].r - 1}` });
  }

  // Draw neural synapses connecting them
  const synapses = [
    { from: 'AB30', to: 'AI25' },
    { from: 'AI25', to: 'AT30' },
    { from: 'AT30', to: 'AM45' },
    { from: 'AM45', to: 'AI55' },
    { from: 'AI55', to: 'AC45' },
    { from: 'AC45', to: 'AB30' },
  ];
  for (let i = 0; i < synapses.length; i++) {
    ops2.push({ op: 'pen', id: `synapse_${i}`, role: 'artwork', color: '#D8E2DC', width: 3, program: `pen at ${synapses[i].from}\nray to ${synapses[i].to}.q2` });
    ops2.push({ op: 'pen', id: `pulse_${i}`, role: 'artwork', paint: 'cells', color: '#FFE5D9', program: `pen at ${synapses[i].to}\ndisc 3` });
  }

  // Draw knowledge inputs
  ops2.push({ op: 'place_box', id: 'input_read', at: 'E25.tl', span: { w: 12, h: 4 }, label: 'Reading', corner: 'rounded' });
  ops2.push({ op: 'place_box', id: 'input_prac', at: 'E45.tl', span: { w: 12, h: 4 }, label: 'Practice', corner: 'rounded' });
  ops2.push({ op: 'pen', id: 'read_flow', role: 'artwork', color: '#9D8189', width: 2, program: 'pen from input_read.E\nright 4 align top line\ndown 2 align left line\nright line to AB30.q1 arrow' });
  ops2.push({ op: 'pen', id: 'prac_flow', role: 'artwork', color: '#9D8189', width: 2, program: 'pen from input_prac.E\nright line to AC45.q1 arrow' });

  await call('plan', { operations: ops2, commit: true });
  await call('render', { path: 'diagrams/gemini31-teaching-loop.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // 3. Technical Analysis (Dense Candlestick Chart)
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 3: Candlestick Chart...');
  await call('new_diagram', { name: 'Candlestick Chart', path: 'diagrams/gemini31-technical-analysis.turtlepen.json', cols: 150, rows: 100 });
  await call('add_page', { id: 'moving_avg', z: 1, intent: 'overlay', title: 'Moving Average Line' });

  const ops3 = [
    { op: 'place_box', id: 'lbl3', at: 'C2.tl', span: { w: 25, h: 4 }, label: 'BTC/USD 1H Chart', corner: 'square' },
    // Chart borders
    { op: 'pen', id: 'chart_border', role: 'artwork', color: '#333333', width: 2, program: 'pen at D10\nright 130 align top line\ndown 60 align left line\nleft 130 align bottom line\nup 60 align right line' },
  ];

  // Generate 25 candlesticks manually
  let trend = 60;
  let maPath = 'pen at F60\n';
  for (let i = 0; i < 25; i++) {
    let col = String.fromCharCode(69 + (i * 5) % 26); // E, J, O, T... simplified column logic for demo
    if (i * 5 >= 26) {
      let pref = String.fromCharCode(64 + Math.floor((i * 5) / 26));
      col = pref + String.fromCharCode(65 + ((i * 5) % 26));
    } else {
      col = String.fromCharCode(69 + (i * 5));
    }

    let isGreen = Math.random() > 0.4;
    let bodyH = Math.floor(Math.random() * 8) + 2;
    let wickTop = Math.floor(Math.random() * 5) + 1;
    let wickBot = Math.floor(Math.random() * 5) + 1;
    
    if (isGreen) trend -= Math.floor(Math.random() * 5);
    else trend += Math.floor(Math.random() * 5);
    
    let color = isGreen ? '#00FF00' : '#FF0000';
    
    // Wick
    ops3.push({ op: 'pen', id: `wick_${i}`, role: 'artwork', color: '#666666', width: 2, program: `pen at ${col}${trend - wickTop}\ndown ${bodyH + wickTop + wickBot} line` });
    // Body
    ops3.push({ op: 'place_box', id: `body_${i}`, at: `${col}${trend}.tl`, span: { w: 2, h: bodyH }, label: '', corner: 'square', fill: color });
    
    // Volume bar
    let volH = Math.floor(Math.random() * 10) + 2;
    ops3.push({ op: 'place_box', id: `vol_${i}`, at: `${col}${70 - volH}.tl`, span: { w: 2, h: volH }, label: '', corner: 'square', fill: isGreen ? '#005500' : '#550000' });

    maPath += `ray to ${col}${trend + 2}.q2\n`;
  }
  
  ops3.push({ op: 'pen', id: 'ma_line', page: 'moving_avg', role: 'artwork', color: '#E0A96D', width: 3, program: maPath });

  await call('plan', { operations: ops3, commit: true });
  await call('render', { path: 'diagrams/gemini31-technical-analysis.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // 4. Workflow (Mechanical Gears Pipeline)
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 4: Mechanical CI/CD Gears...');
  await call('new_diagram', { name: 'Gears Workflow', path: 'diagrams/gemini31-workflow.turtlepen.json', cols: 160, rows: 90 });
  await call('add_page', { id: 'belts', z: 1, intent: 'overlay', title: 'Conveyor Belts' });

  const ops4 = [
    { op: 'place_box', id: 'lbl4', at: 'J4.tl', span: { w: 30, h: 4 }, label: 'Mechanical CI/CD Pipeline', corner: 'chamfered' },
  ];

  const gears = [
    { at: 'P25', r: 12, color: '#457B9D', lbl: 'Code', l_at: 'M35.tl' },
    { at: 'AL25', r: 14, color: '#E63946', lbl: 'Build', l_at: 'AI37.tl' },
    { at: 'BK25', r: 10, color: '#2A9D8F', lbl: 'Deploy', l_at: 'BH33.tl' }
  ];

  for (let i = 0; i < gears.length; i++) {
    let g = gears[i];
    // Main gear body
    ops4.push({ op: 'pen', id: `gear_${i}`, role: 'artwork', paint: 'cells', color: g.color, program: `pen at ${g.at}\ndisc ${g.r}\ncircle ${g.r + 2}` });
    // Hub
    ops4.push({ op: 'pen', id: `hub_${i}`, role: 'artwork', paint: 'cells', color: '#1D3557', program: `pen at ${g.at}\ndisc 3` });
    // Teeth (rays extending out)
    for (let angle = 0; angle < 360; angle += 45) {
       // Since exact trigonometric rays aren't natively supported by angle, we draw specific 8-way directional rays
       let dirs = ['up', 'ne', 'right', 'se', 'down', 'sw', 'left', 'nw'];
       dirs.forEach((dir, idx) => {
         ops4.push({ op: 'pen', id: `tooth_${i}_${idx}`, role: 'artwork', color: '#A8DADC', width: 4, program: `pen at ${g.at}\n${dir} ${Math.floor(g.r/2) + 2} line` });
       });
    }
    ops4.push({ op: 'place_box', id: `g_lbl_${i}`, at: g.l_at, span: { w: 10, h: 4 }, label: g.lbl, corner: 'rounded' });
  }

  // Conveyor belt connecting them
  ops4.push({ op: 'pen', id: 'belt_top', page: 'belts', role: 'artwork', color: '#333333', width: 3, program: `pen at P12\nright 60 align bottom line` });
  ops4.push({ op: 'pen', id: 'belt_bot', page: 'belts', role: 'artwork', color: '#333333', width: 3, program: `pen at P38\nright 60 align top line` });

  await call('plan', { operations: ops4, commit: true });
  await call('render', { path: 'diagrams/gemini31-workflow.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // 5. Scene - Apple (Highly detailed)
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 5: Detailed Apple...');
  await call('new_diagram', { name: 'Detailed Apple', path: 'diagrams/gemini31-scene-apple.turtlepen.json', cols: 100, rows: 80 });

  const ops5 = [
    { op: 'place_box', id: 'lbl5', at: 'J4.tl', span: { w: 20, h: 4 }, label: 'Intricate Apple Art', corner: 'rounded' },
    // Shadow
    { op: 'pen', id: 'shadow', role: 'artwork', paint: 'cells', color: '#E5E5E5', program: 'pen at W55\ndisc 18' },
    // Base apple structure (overlapping discs for shape)
    { op: 'pen', id: 'apple_b1', role: 'artwork', paint: 'cells', color: '#D90429', program: 'pen at U35\ndisc 20' },
    { op: 'pen', id: 'apple_b2', role: 'artwork', paint: 'cells', color: '#D90429', program: 'pen at AC35\ndisc 20' },
    { op: 'pen', id: 'apple_b3', role: 'artwork', paint: 'cells', color: '#EF233C', program: 'pen at X40\ndisc 18' },
    // Bite mark (masking with background-like color)
    { op: 'pen', id: 'apple_bite', role: 'artwork', paint: 'cells', color: '#FFFFFF', program: 'pen at AJ30\ndisc 12' },
    { op: 'pen', id: 'apple_bite2', role: 'artwork', paint: 'cells', color: '#FFFFFF', program: 'pen at AL38\ndisc 10' },
    // Stem
    { op: 'pen', id: 'stem', role: 'artwork', color: '#5C4033', width: 5, program: 'pen at Y20\nup 2 align left line\nright corner align top right\nright 4 align top line\nup corner align left top\nup 4 line' },
    // Detailed Leaf
    { op: 'pen', id: 'leaf_a', role: 'artwork', paint: 'cells', color: '#2A9D8F', program: 'pen at AC15\ncircle 8' },
    { op: 'pen', id: 'leaf_b', role: 'artwork', paint: 'cells', color: '#2E8B57', program: 'pen at AD16\ndisc 6' },
    // Glossy Highlight
    { op: 'pen', id: 'highlight', role: 'artwork', color: '#FFFFFF', width: 3, program: 'pen at R28\ndown 5 line\nleft 1 line' },
  ];

  await call('plan', { operations: ops5, commit: true });
  await call('render', { path: 'diagrams/gemini31-scene-apple.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // 6. Scene - Tree (Fractal-like branching)
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 6: Fractal Tree...');
  await call('new_diagram', { name: 'Fractal Tree', path: 'diagrams/gemini31-scene-tree.turtlepen.json', cols: 120, rows: 100 });
  await call('add_page', { id: 'leaves2', z: 1, intent: 'overlay', title: 'Dense Leaves' });

  const ops6 = [
    { op: 'place_box', id: 'lbl6', at: 'J4.tl', span: { w: 20, h: 4 }, label: 'Deep Branching Tree', corner: 'rounded' },
    // Roots
    { op: 'pen', id: 'root1', role: 'artwork', color: '#6F4E37', width: 4, program: 'pen at W80\nsw 10 line' },
    { op: 'pen', id: 'root2', role: 'artwork', color: '#6F4E37', width: 4, program: 'pen at Y80\nse 12 line' },
    { op: 'pen', id: 'root3', role: 'artwork', color: '#6F4E37', width: 5, program: 'pen at X80\ndown 8 line' },
    // Trunk
    { op: 'pen', id: 'trunk', role: 'artwork', color: '#8B5A2B', width: 5, program: 'pen at X80\nup 25 line' },
    // Primary branches
    { op: 'pen', id: 'b1', role: 'artwork', color: '#8B5A2B', width: 4, program: 'pen at X55\nnw 15 line' },
    { op: 'pen', id: 'b2', role: 'artwork', color: '#8B5A2B', width: 4, program: 'pen at X55\nne 18 line' },
    { op: 'pen', id: 'b3', role: 'artwork', color: '#8B5A2B', width: 4, program: 'pen at X60\nleft 10 line' },
    // Secondary branches
    { op: 'pen', id: 'b1_1', role: 'artwork', color: '#A0522D', width: 3, program: 'pen at O40\nup 10 line' },
    { op: 'pen', id: 'b1_2', role: 'artwork', color: '#A0522D', width: 3, program: 'pen at O40\nleft 8 line' },
    { op: 'pen', id: 'b2_1', role: 'artwork', color: '#A0522D', width: 3, program: 'pen at AL37\nne 10 line' },
    { op: 'pen', id: 'b2_2', role: 'artwork', color: '#A0522D', width: 3, program: 'pen at AL37\nnw 8 line' },
  ];

  // Leaves (Dense scattering of overlapping discs)
  const leafCenters = ['O40', 'L30', 'O30', 'R30', 'G40', 'AL37', 'AV27', 'AD29', 'AI25', 'X45', 'U35', 'AA35'];
  leafCenters.forEach((c, idx) => {
    ops6.push({ op: 'pen', id: `l_${idx}_a`, page: 'leaves2', role: 'artwork', paint: 'cells', color: '#228B22', program: `pen at ${c}\ndisc 8` });
    ops6.push({ op: 'pen', id: `l_${idx}_b`, page: 'leaves2', role: 'artwork', paint: 'cells', color: '#32CD32', program: `pen at ${c}.q4\ndisc 6` });
    ops6.push({ op: 'pen', id: `l_${idx}_c`, page: 'leaves2', role: 'artwork', paint: 'cells', color: '#006400', program: `pen at ${c}.tl\ncircle 5` });
  });

  await call('plan', { operations: ops6, commit: true });
  await call('render', { path: 'diagrams/gemini31-scene-tree.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // 7. Scene - Fence (Detailed wood grain and vines)
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 7: Detailed Fence...');
  await call('new_diagram', { name: 'Detailed Fence', path: 'diagrams/gemini31-scene-fence.turtlepen.json', cols: 140, rows: 70 });
  await call('add_page', { id: 'vines', z: 1, intent: 'overlay', title: 'Growing Vines' });

  const ops7 = [
    { op: 'place_box', id: 'lbl7', at: 'F4.tl', span: { w: 25, h: 4 }, label: 'Weathered Picket Fence', corner: 'chamfered' },
  ];

  // Draw 8 pickets manually (no simple place_box) to include wood grain lines and peaked triangles
  for (let i = 0; i < 8; i++) {
    let col = String.fromCharCode(67 + i * 5); // C, H, M, R, W...
    
    // Main body of picket
    ops7.push({ op: 'place_box', id: `picket_${i}`, at: `${col}15.tl`, span: { w: 4, h: 40 }, label: '', corner: 'square', fill: '#DDB892' });
    
    // Triangle peak for picket
    ops7.push({ op: 'pen', id: `peak_${i}`, role: 'artwork', paint: 'cells', color: '#DDB892', program: `pen at ${col}15\nup 5 align right line\nright corner align top right\nright 2 align top line\ndown corner align right bottom\ndown 5 align left line` }); // Simplified peak using lines

    // Wood grain lines
    ops7.push({ op: 'pen', id: `grain1_${i}`, role: 'artwork', color: '#B08968', width: 1, program: `pen at ${col}20\ndown 10 line` });
    ops7.push({ op: 'pen', id: `grain2_${i}`, role: 'artwork', color: '#B08968', width: 1, program: `pen at ${String.fromCharCode(col.charCodeAt(0)+2)}35\ndown 15 line` });
  }

  // Crossbars
  ops7.push({ op: 'place_box', id: `bar1`, at: `A25.tl`, span: { w: 50, h: 3 }, label: '', corner: 'square', fill: '#9C6644' });
  ops7.push({ op: 'place_box', id: `bar2`, at: `A45.tl`, span: { w: 50, h: 3 }, label: '', corner: 'square', fill: '#9C6644' });

  // Nails
  for (let i = 0; i < 8; i++) {
    let col = String.fromCharCode(67 + i * 5 + 1); // center of picket
    ops7.push({ op: 'pen', id: `nail1_${i}`, role: 'artwork', paint: 'cells', color: '#4A4E69', program: `pen at ${col}26\ndot` });
    ops7.push({ op: 'pen', id: `nail2_${i}`, role: 'artwork', paint: 'cells', color: '#4A4E69', program: `pen at ${col}46\ndot` });
  }

  // Vines growing over fence
  ops7.push({ op: 'pen', id: `vine_main`, page: 'vines', role: 'artwork', color: '#52B788', width: 3, program: `pen at B55\nne 15 line\nright 10 line\nse 8 line\nright 5 line\nne 20 line` });
  // Leaves on vine
  ['G40', 'M35', 'R37', 'X40', 'AD25', 'AH20'].forEach((c, idx) => {
    ops7.push({ op: 'pen', id: `vine_leaf_${idx}`, page: 'vines', role: 'artwork', paint: 'cells', color: '#2D6A4F', program: `pen at ${c}\ndisc 2` });
  });

  await call('plan', { operations: ops7, commit: true });
  await call('render', { path: 'diagrams/gemini31-scene-fence.svg', force: true });
  await call('save', { force: true });

  // ---------------------------------------------------------------------------
  // 8. Scene - Living Room Family (Articulated and Dense)
  // ---------------------------------------------------------------------------
  console.log('Building Diagram 8: Dense Living Room Scene...');
  await call('new_diagram', { name: 'Living Room Family', path: 'diagrams/gemini31-scene-living-room-family.turtlepen.json', cols: 160, rows: 110 });
  await call('add_page', { id: 'foreground', z: 1, intent: 'overlay', title: 'Foreground' });

  const ops8 = [
    { op: 'place_box', id: 'lbl8', at: 'J4.tl', span: { w: 30, h: 4 }, label: 'Highly Detailed Living Room', corner: 'indented' },
    
    // Window with panes
    { op: 'place_box', id: 'win_frame', at: 'B15.tl', span: { w: 20, h: 25 }, label: '', corner: 'square', fill: '#8ECAE6' },
    { op: 'pen', id: 'win_mullion1', role: 'artwork', color: '#FFFFFF', width: 4, program: 'pen at L15\ndown 25 line' },
    { op: 'pen', id: 'win_mullion2', role: 'artwork', color: '#FFFFFF', width: 4, program: 'pen at B27\nright 20 line' },
    // Curtains
    { op: 'place_box', id: 'curtain_l', at: 'B15.tl', span: { w: 4, h: 25 }, label: '', corner: 'square', fill: '#E63946' },
    { op: 'place_box', id: 'curtain_r', at: 'R15.tl', span: { w: 4, h: 25 }, label: '', corner: 'square', fill: '#E63946' },
    
    // Large intricate rug (stripes)
    { op: 'place_box', id: 'rug_base', at: 'G60.tl', span: { w: 50, h: 10 }, label: '', corner: 'square', fill: '#F4A261' },
    { op: 'pen', id: 'rug_stripe1', role: 'artwork', color: '#E76F51', width: 3, program: 'pen at J60\ndown 10 line' },
    { op: 'pen', id: 'rug_stripe2', role: 'artwork', color: '#E76F51', width: 3, program: 'pen at O60\ndown 10 line' },
    { op: 'pen', id: 'rug_stripe3', role: 'artwork', color: '#E76F51', width: 3, program: 'pen at T60\ndown 10 line' },
    { op: 'pen', id: 'rug_stripe4', role: 'artwork', color: '#E76F51', width: 3, program: 'pen at Y60\ndown 10 line' },

    // Intricate Sofa (composed of 4 overlapping shapes)
    { op: 'place_box', id: 'sofa_back', at: 'Y40.tl', span: { w: 25, h: 10 }, label: '', corner: 'rounded', fill: '#2A9D8F' },
    { op: 'place_box', id: 'sofa_seat', at: 'W45.tl', span: { w: 29, h: 8 }, label: '', corner: 'rounded', fill: '#264653' },
    { op: 'place_box', id: 'sofa_arm_l', at: 'W42.tl', span: { w: 4, h: 11 }, label: '', corner: 'rounded', fill: '#1D3557' },
    { op: 'place_box', id: 'sofa_arm_r', at: 'AW42.tl', span: { w: 4, h: 11 }, label: '', corner: 'rounded', fill: '#1D3557' },

    // Standing Lamp
    { op: 'pen', id: 'lamp_base', role: 'artwork', color: '#333333', width: 4, program: 'pen at T35\ndown 25 line' },
    { op: 'pen', id: 'lamp_shade', role: 'artwork', paint: 'cells', color: '#FFB703', program: 'pen at T33\narc 4 0 180' },

    // People (Articulated on foreground)
    // Person 1 (Sitting on sofa)
    { op: 'pen', id: 'p1_head', page: 'foreground', role: 'artwork', paint: 'cells', color: '#FDB833', program: 'pen at AB35\ndisc 3' },
    { op: 'pen', id: 'p1_body', page: 'foreground', role: 'artwork', color: '#000000', width: 3, program: 'pen at AB38\ndown 6 line' },
    { op: 'pen', id: 'p1_legs', page: 'foreground', role: 'artwork', color: '#000000', width: 3, program: 'pen at AB44\nright 4 line\ndown 5 line' }, // sitting posture
    { op: 'pen', id: 'p1_arm', page: 'foreground', role: 'artwork', color: '#000000', width: 3, program: 'pen at AB40\nright 3 line\nup 3 line' }, // waving
    
    // Person 2 (Standing next to sofa)
    { op: 'pen', id: 'p2_head', page: 'foreground', role: 'artwork', paint: 'cells', color: '#FDB833', program: 'pen at AS30\ndisc 3' },
    { op: 'pen', id: 'p2_body', page: 'foreground', role: 'artwork', color: '#000000', width: 3, program: 'pen at AS33\ndown 10 line' },
    { op: 'pen', id: 'p2_legL', page: 'foreground', role: 'artwork', color: '#000000', width: 3, program: 'pen at AS43\nsw 6 line\ndown 3 line' },
    { op: 'pen', id: 'p2_legR', page: 'foreground', role: 'artwork', color: '#000000', width: 3, program: 'pen at AS43\nse 6 line\ndown 3 line' },
    { op: 'pen', id: 'p2_arms', page: 'foreground', role: 'artwork', color: '#000000', width: 3, program: 'pen at AP36\nright 6 line' }, // arms crossed
    
    // Dog (Curled on rug)
    { op: 'pen', id: 'dog_body', page: 'foreground', role: 'artwork', paint: 'cells', color: '#7F5539', program: 'pen at AD62\ndisc 4' },
    { op: 'pen', id: 'dog_head', page: 'foreground', role: 'artwork', paint: 'cells', color: '#9C6644', program: 'pen at AC60\ndisc 3' },
    { op: 'pen', id: 'dog_tail', page: 'foreground', role: 'artwork', color: '#7F5539', width: 2, program: 'pen at AH63\nne 3 line\nup 2 line' },
  ];

  await call('plan', { operations: ops8, commit: true });
  await call('render', { path: 'diagrams/gemini31-scene-living-room-family.svg', force: true });
  await call('save', { force: true });

  console.log('\nAll 8 highly detailed diagrams built from scratch by Gemini 3.1 Pro (High)!');
}

run().catch((err) => {
  console.error('Error generating diagrams:', err);
  process.exit(1);
});
