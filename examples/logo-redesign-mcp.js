#!/usr/bin/env node
/**
 * TurtlePen MCP logo redesign — illustrator workflow, not primitive demo.
 *
 * The canonical source mark is used only as a temporary place_reference underlay.
 * Every shipped mark is rebuilt as native TurtlePen artwork. The reference page
 * is removed before validation/render so the final SVG/JSON contain no raster.
 */
import { createMcpClient } from './mcp-client.js';

const OUT_JSON = 'brand/logo-redesign.turtlepen.json';
const OUT_SVG = 'brand/logo-redesign.svg';
const CREATED_AT = '2026-08-29T20:23:00.000Z';

function colName(n) {
  let s = '';
  while (n > 0) { n -= 1; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}
const q = (x, y, pin = 'c') => `${colName(Math.max(1, Math.ceil(x / 2)))}${Math.max(1, Math.ceil(y / 2))}.${pin}`;
const cell = (x, y, pin = 'c') => `${colName(x)}${y}.${pin}`;

async function call(mcp, name, args = {}, { print = false } = {}) {
  const r = await mcp.call(name, args);
  const body = r.error ?? r.text;
  if (print) console.log(`\n[${name}]\n${body}`);
  if (r.isError || r.error) throw new Error(`${name}: ${body}`);
  return body;
}
async function planCommit(mcp, operations, label) {
  const rehearsal = await call(mcp, 'plan', { operations }, { print: true });
  if (/FAILED/.test(rehearsal)) throw new Error(`${label}: ${rehearsal}`);
  return call(mcp, 'plan', { operations, commit: true });
}

const C = Object.freeze({
  navy: '#0B2438',
  navySoft: '#405A6F',
  green: '#9FD85A',
  greenLight: '#C8EB84',
  greenDark: '#2E6F52',
  cream: '#FFF4CE',
  white: '#FFFEF8',
  coral: '#FF6B5F',
  orange: '#FFAA45',
  violet: '#7B61FF',
  cyan: '#3CC8F2',
  blue: '#4D8DFF',
  pink: '#F46BB3',
  shadow: '#C9D2D8',
});

const mcp = createMcpClient({ createdAt: CREATED_AT });
await mcp.init();

try {
  // Help-first authoring. The separate explorer searches the whole help surface;
  // these calls keep the build itself anchored to the relevant contracts.
  await call(mcp, 'turtlepen_help', { section: 'orientation' }, { print: true });
  for (const query of ['reference trace artwork', 'layers overlay', 'circle disc arc', 'text measure', 'render look perceptual_review']) {
    await call(mcp, 'search_help', { query }, { print: true });
  }

  await call(mcp, 'new_diagram', {
    name: 'TurtlePen MCP — Artist Turtle Capability Splash',
    path: OUT_JSON,
    cols: 150,
    rows: 125,
  }, { print: true });

  // The supplied brand source is scaffolding only. TurtlePen itself flags the
  // document until this page is removed, which prevents the raster from shipping.
  await call(mcp, 'measure_image', {
    source: 'brand/logo-v2-source-mark.png', maxWidthCells: 78, maxHeightCells: 86,
  }, { print: true });
  await call(mcp, 'place_reference', {
    id: 'trace-source', source: 'brand/logo-v2-source-mark.png',
    at: 'D12.tl', span: '78x86', opacity: 0.16, mode: 'simplify', fit: 'contain', detail: 'high', supersample: 4,
  }, { print: true });

  const pages = [
    ['splash-back', 1], ['easel', 2], ['shell', 3], ['body', 4], ['head', 5],
    ['arm', 6], ['outlines', 7], ['features', 8], ['bubbles', 9], ['bubble-detail', 10],
    ['ink', 11], ['type', 12],
  ];
  for (const [id, z] of pages) await call(mcp, 'add_page', { id, z, intent: 'overlay', title: id });

  const ops = [];
  const solid = (id, program, color, page) => ops.push({ op:'pen', id, page, role:'artwork', color, paint:'cells', program });
  const line = (id, program, color = C.navy, width = 5, page = 'outlines') => ops.push({ op:'pen', id, page, role:'artwork', color, width, cap:'round', program });

  // --- expressive paint burst behind the mascot ---------------------------
  line('burst-coral', polyline([[118,52],[137,35],[151,27],[161,12]]), C.coral, 5, 'splash-back');
  line('burst-violet', polyline([[133,65],[158,58],[176,44],[194,43]]), C.violet, 5, 'splash-back');
  line('burst-cyan', polyline([[126,78],[151,85],[169,103],[183,119]]), C.cyan, 5, 'splash-back');
  line('burst-orange', polyline([[105,48],[112,27],[109,15]]), C.orange, 5, 'splash-back');
  for (const [id,x,y,r,color] of [
    ['drop-coral-a',160,12,4,C.coral],['drop-coral-b',168,19,2,C.coral],
    ['drop-violet-a',195,43,4,C.violet],['drop-violet-b',184,34,2,C.violet],
    ['drop-cyan-a',184,120,4,C.cyan],['drop-cyan-b',174,112,2,C.cyan],
    ['drop-orange-a',109,14,3,C.orange],['drop-orange-b',118,21,2,C.orange],
  ]) solid(id, `disc ${r} at ${q(x,y)}`, color, 'splash-back');

  // --- easel and canvas ----------------------------------------------------
  const board = [[145,45],[205,43],[198,127],[132,127]];
  solid('board-fill', polygonFill(board), C.white, 'easel');
  solid('tray-fill', polygonFill([[127,126],[202,126],[202,133],[127,133]]), C.navySoft, 'easel');
  solid('leg-left-fill', polygonFill([[139,132],[148,132],[139,170],[131,170]]), C.navySoft, 'easel');
  solid('leg-right-fill', polygonFill([[184,132],[193,132],[201,170],[193,170]]), C.navySoft, 'easel');
  solid('brace-fill', polygonFill([[142,154],[190,154],[190,159],[141,159]]), C.navySoft, 'easel');
  solid('clip-fill', polygonFill([[166,41],[187,41],[185,51],[165,51]]), C.navySoft, 'easel');
  solid('clip-tab-fill', polygonFill([[173,33],[182,33],[181,42],[172,42]]), C.navySoft, 'easel');
  line('board-outline', polygonOutline(board));
  line('tray-outline', polygonOutline([[127,126],[202,126],[202,133],[127,133]]));
  line('leg-left-outline', polygonOutline([[139,132],[148,132],[139,170],[131,170]]));
  line('leg-right-outline', polygonOutline([[184,132],[193,132],[201,170],[193,170]]));
  line('brace-outline', polygonOutline([[142,154],[190,154],[190,159],[141,159]]));
  line('clip-outline', polygonOutline([[166,41],[187,41],[185,51],[165,51]]));
  line('clip-tab-outline', polygonOutline([[173,33],[182,33],[181,42],[172,42]]));

  // --- turtle: traced/reconstructed as layered native lattice artwork ------
  solid('shell-fill', ellipseFill(62,108,39,43), C.greenDark, 'shell');
  solid('left-foot-fill', ellipseFill(70,157,14,15), C.green, 'body');
  solid('right-foot-fill', polygonFill([[91,146],[106,145],[112,169],[89,169]]), C.green, 'body');
  solid('plastron-fill', ellipseFill(91,111,22,43), C.cream, 'body');
  solid('neck-fill', polygonFill([[75,72],[101,72],[98,91],[78,91]]), C.green, 'head');
  solid('head-fill', ellipseFill(91,51,27,27), C.greenLight, 'head');
  solid('snout-fill', ellipseFill(104,59,17,14), C.greenLight, 'head');
  solid('arm-fill', polygonFill([[91,92],[102,94],[113,99],[126,96],[136,87],[145,82],[154,85],[151,96],[137,105],[119,112],[103,110],[94,104]]), C.green, 'arm');
  solid('hand-fill', ellipseFill(145,89,12,10), C.green, 'arm');

  line('shell-outline', ellipseOutline(62,108,39,43));
  line('left-foot-outline', ellipseOutline(70,157,14,15));
  line('right-foot-outline', polygonOutline([[91,146],[106,145],[112,169],[89,169]]));
  line('plastron-outline', ellipseOutline(91,111,22,43));
  line('neck-outline', polygonOutline([[75,72],[101,72],[98,91],[78,91]]));
  line('head-outline', ellipseOutline(91,51,27,27));
  line('snout-outline', ellipseOutline(104,59,17,14));
  line('arm-outline', polygonOutline([[91,92],[102,94],[113,99],[126,96],[136,87],[145,82],[154,85],[151,96],[137,105],[119,112],[103,110],[94,104]]));
  line('hand-outline', ellipseOutline(145,89,12,10));

  line('shell-rim', ellipseOutline(62,108,32,36), C.greenLight, 4, 'features');
  line('shell-band', polyline([[27,108],[94,108]]), C.navy, 4, 'features');
  line('shell-left-plates', polyline([[61,72],[48,84],[45,102],[61,108],[46,122],[50,139],[61,146]]), C.navy, 4, 'features');
  line('shell-right-plates', polyline([[61,72],[75,84],[79,102],[61,108],[77,122],[73,139],[61,146]]), C.navy, 4, 'features');
  line('chest-seams-a', polyline([[73,100],[94,100]]), C.navy, 3, 'features');
  line('chest-seams-b', polyline([[70,119],[99,119]]), C.navy, 3, 'features');
  line('chest-seams-c', polyline([[73,138],[101,138]]), C.navy, 3, 'features');

  solid('eye-left-white', `disc 9 at ${q(86,49)}`, C.white, 'features');
  solid('eye-right-white', `disc 8 at ${q(113,48)}`, C.white, 'features');
  line('eye-left-outline', `circle 9 at ${q(86,49)}`, C.navy, 5, 'features');
  line('eye-right-outline', `circle 8 at ${q(113,48)}`, C.navy, 5, 'features');
  solid('pupil-left', `disc 4 at ${q(87,49)}`, C.navy, 'features');
  solid('pupil-right', `disc 3 at ${q(111,49)}`, C.navy, 'features');
  solid('eye-glint-left', `disc 1 at ${q(88,47)}`, C.white, 'features');
  solid('eye-glint-right', `disc 1 at ${q(112,47)}`, C.white, 'features');
  line('brow', polyline([[78,39],[84,36],[91,36]]), C.navy, 5, 'features');
  solid('nostril', `disc 1 at ${q(112,61)}`, C.navy, 'features');
  line('smile', polyline([[93,65],[97,69],[103,71],[110,69]]), C.navy, 4, 'features');

  // pen in hand + a lively native drawing gesture on the canvas
  line('pen-outer', polyline([[143,82],[169,97]]), C.navy, 6, 'features');
  line('pen-inner', polyline([[145,82],[168,95]]), C.orange, 3, 'features');
  solid('pen-nib-fill', polygonFill([[168,93],[176,101],[166,98]]), C.navy, 'features');
  line('canvas-gesture-a', polyline([[171,101],[179,99],[187,94],[193,86],[197,76]]), C.greenDark, 5, 'ink');
  line('canvas-gesture-b', `arc 7 190 350 at ${q(196,72)}`, C.greenDark, 5, 'ink');
  line('canvas-vector-a', polyline([[160,70],[169,62],[180,66],[188,58]]), C.violet, 4, 'ink');
  line('canvas-vector-b', polyline([[159,112],[171,106],[184,110],[192,104]]), C.cyan, 4, 'ink');
  for (const [id,x,y,color] of [['handle-a',160,70,C.violet],['handle-b',169,62,C.violet],['handle-c',180,66,C.violet],['handle-d',188,58,C.violet],['handle-e',159,112,C.cyan],['handle-f',171,106,C.cyan],['handle-g',184,110,C.cyan],['handle-h',192,104,C.cyan]]) {
    solid(id, `disc 2 at ${q(x,y)}`, color, 'bubble-detail');
  }

  // --- capability bubbles: art objects, not UI chips ----------------------
  const bubbles = [
    ['bubble-measure', 39, 24, 25, 15, C.orange, 'MEASURE FIRST'],
    ['bubble-trace', 112, 21, 27, 15, C.cyan, 'TRACE + SIMPLIFY'],
    ['bubble-edit', 219, 24, 24, 15, C.violet, 'SVG EDITING'],
    ['bubble-commands', 256, 71, 29, 16, C.blue, 'TURTLE COMMANDS'],
    ['bubble-tools', 256, 128, 25, 15, C.pink, '73 MCP TOOLS'],
    ['bubble-layout', 216, 168, 28, 16, C.greenDark, 'LAYOUT + ROUTING'],
    ['bubble-validate', 126, 184, 29, 16, C.coral, 'RENDER + VALIDATE'],
    ['bubble-collision', 35, 178, 29, 16, C.green, 'COLLISION REVIEW'],
  ];
  for (const [id,cx,cy,rx,ry,color,label] of bubbles) {
    solid(`${id}-fill`, ellipseFill(cx,cy,rx,ry), color, 'bubbles');
    line(`${id}-outline`, ellipseOutline(cx,cy,rx,ry), C.navy, 4, 'bubble-detail');
    // two little splash satellites make each capability feel like paint leaving the canvas
    solid(`${id}-dot-a`, `disc 3 at ${q(cx+rx+5,cy-ry+3)}`, color, 'bubbles');
    solid(`${id}-dot-b`, `disc 2 at ${q(cx+rx+11,cy-ry-2)}`, color, 'bubbles');
    ops.push({ op:'pen', page:'type', program:`text "${label}" at ${q(cx-rx+5,cy-4,'tl')} span ${Math.max(12,Math.floor(rx-4))}x5 id ${id}-text font 18 fill ${C.white} weight 800 align center` });
  }

  // curved/angled splash trails visually connect the capability cloud to canvas
  line('trail-measure', polyline([[146,57],[119,44],[79,31],[65,28]]), C.orange, 3, 'splash-back');
  line('trail-trace', polyline([[164,48],[146,36],[128,28]]), C.cyan, 3, 'splash-back');
  line('trail-edit', polyline([[190,51],[207,39],[219,33]]), C.violet, 3, 'splash-back');
  line('trail-commands', polyline([[202,73],[224,70],[236,71]]), C.blue, 3, 'splash-back');
  line('trail-tools', polyline([[199,104],[221,115],[236,124]]), C.pink, 3, 'splash-back');
  line('trail-layout', polyline([[190,124],[205,145],[214,155]]), C.greenDark, 3, 'splash-back');
  line('trail-validate', polyline([[158,128],[150,151],[139,168]]), C.coral, 3, 'splash-back');
  line('trail-collision', polyline([[132,119],[101,144],[69,166]]), C.green, 3, 'splash-back');

  // grounding and wordmark
  line('turtle-shadow', polyline([[49,173],[108,173]]), C.shadow, 5, 'splash-back');
  line('easel-shadow', polyline([[127,173],[204,173]]), C.shadow, 5, 'splash-back');

  await planCommit(mcp, ops, 'full illustrated composition');

  // Measurement-first typography for the primary lockup.
  await call(mcp, 'measure', { text:'TurtlePen', fontSize:58, maxWidthCells:78 }, { print:true });
  await call(mcp, 'measure', { text:'MCP', fontSize:28, maxWidthCells:24 }, { print:true });
  await planCommit(mcp, [
    { op:'pen', page:'type', program:`text "TurtlePen" at ${cell(38,105,'tl')} span 78x10 id brand-wordmark font 58 fill ${C.navy} weight 900 align center` },
    { op:'pen', page:'type', program:`text "M C P" at ${cell(65,116,'tl')} span 24x6 id brand-mcp font 28 fill ${C.greenDark} weight 800 align center` },
    { op:'pen', id:'brand-rule-left', page:'ink', role:'artwork', color:C.greenDark, width:4, cap:'round', program:`pen ${cell(49,119)}\nright 13 line` },
    { op:'pen', id:'brand-rule-right', page:'ink', role:'artwork', color:C.greenDark, width:4, cap:'round', program:`pen ${cell(90,119)}\nright 13 line` },
  ], 'measured wordmark');

  await call(mcp, 'annotate', {
    id:'board-fill', description:'Central canvas from which TurtlePen capability splashes emerge',
    technology:'TurtlePen lattice artwork', tags:['brand','canvas','capability-source'],
    properties:{ referenceUsedOnlyForAuthoring:true, shippedRaster:false },
  });
  await call(mcp, 'annotate', {
    id:'shell-fill', description:'Friendly turtle artist mascot reconstructed as native exact lattice artwork',
    technology:'TurtlePen pen grammar', tags:['brand','turtle','mascot','native-artwork'],
  });

  // Remove the temporary tracing source BEFORE any final verdict or render.
  await call(mcp, 'remove_page', { id:'trace-source' }, { print:true });

  console.log('\n[ascii]\n' + await call(mcp, 'ascii', { maxCells: 110, withFindings: true }));
  const validation = await call(mcp, 'validate', { format:'json' }, { print:true });
  const parsed = JSON.parse(validation);
  const blockers = parsed.open.filter((f) => f.severity !== 'S3');
  if (blockers.length) throw new Error(`Final structural validation has ${blockers.length} non-INFO finding(s).`);

  const rendered = await call(mcp, 'render', { path:OUT_SVG, showGrid:false, bounds:'canvas', margin:0 }, { print:true });
  const match = /renderHash: ([0-9a-f]{16})/.exec(rendered);
  if (!match) throw new Error('render did not return a renderHash');

  await call(mcp, 'save', { path:OUT_JSON, force:true }, { print:true });
  console.log(`\nTurtlePen MCP illustrated logo built. renderHash=${match[1]}\n${OUT_JSON}\n${OUT_SVG}`);
  console.log('Perceptual review intentionally occurs after an external LOOK at this render; do not mark it reviewed blindly in this build.');
} finally {
  await mcp.close();
}

function ellipseFill(cx, cy, rx, ry) {
  const rows = [];
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    const ratio = 1 - ((y-cy)*(y-cy))/(ry*ry);
    if (ratio < 0) continue;
    const half = Math.floor(rx * Math.sqrt(ratio));
    rows.push(`pen ${q(cx-half,y)}\ndash ${half*2+1} e`);
  }
  return rows.join('\n');
}
function ellipseOutline(cx, cy, rx, ry, steps = 72) {
  const points = [];
  for (let i=0;i<steps;i+=1) {
    const angle = Math.PI*2*i/steps;
    const p = [Math.round(cx+Math.cos(angle)*rx), Math.round(cy+Math.sin(angle)*ry)];
    if (!points.length || p[0]!==points.at(-1)[0] || p[1]!==points.at(-1)[1]) points.push(p);
  }
  return polygonOutline(points);
}
function polygonFill(points) {
  const minX = Math.floor(Math.min(...points.map(p=>p[0])));
  const maxX = Math.ceil(Math.max(...points.map(p=>p[0])));
  const minY = Math.floor(Math.min(...points.map(p=>p[1])));
  const maxY = Math.ceil(Math.max(...points.map(p=>p[1])));
  const lines = [];
  for (let y=minY;y<=maxY;y+=1) {
    let start = null;
    for (let x=minX;x<=maxX+1;x+=1) {
      const inside = x<=maxX && pointInPolygon(x+0.25,y+0.25,points);
      if (inside && start===null) start=x;
      if ((!inside || x===maxX+1) && start!==null) {
        const end=x-1;
        lines.push(`pen ${q(start,y)}\ndash ${end-start+1} e`);
        start=null;
      }
    }
  }
  return lines.join('\n');
}
function polygonOutline(points) {
  return polyline([...points, points[0]]);
}
function polyline(points) {
  const [first,...rest] = points;
  return [`pen ${q(first[0],first[1])}`,...rest.map(p=>`ray to ${q(p[0],p[1])}`)].join('\n');
}
function pointInPolygon(x,y,points) {
  let inside=false;
  for (let i=0,j=points.length-1;i<points.length;j=i++) {
    const [xi,yi]=points[i]; const [xj,yj]=points[j];
    const hit=((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi);
    if (hit) inside=!inside;
  }
  return inside;
}
