#!/usr/bin/env node
/** TurtlePen MCP logo redesign — reference-guided native illustration. */
import { createMcpClient } from './mcp-client.js';

const OUT_JSON = 'brand/logo-redesign.turtlepen.json';
const OUT_SVG = 'brand/logo-redesign.svg';
const REF = 'logo-redesign-target.jpg';
const CREATED_AT = '2026-08-29T20:23:00.000Z';

function colName(n) { let s=''; while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);} return s; }
const q=(x,y,pin=null)=>{ const c=Math.floor(x/2),r=Math.floor(y/2); if(pin)return `${colName(c+1)}${r+1}.${pin}`; const qx=x-c*2,qy=y-r*2; return `${colName(c+1)}${r+1}.${qy===0?(qx===0?'q1':'q2'):(qx===0?'q3':'q4')}`; };

async function call(mcp,name,args={},print=false){ const r=await mcp.call(name,args); const body=r.error??r.text; if(print)console.log(`\n[${name}]\n${body}`); if(r.isError||r.error)throw new Error(`${name}: ${body}`); return body; }
async function planCommit(mcp,operations,label){
  const rehearsal=await call(mcp,'plan',{operations},false);
  const first=rehearsal.split('\n').slice(0,4).join(' | ');
  console.log(`[plan:${label}] ${first}`);
  if(/FAILED|BLOCKING ERRORS/.test(rehearsal))throw new Error(`${label}: ${rehearsal}`);
  return call(mcp,'plan',{operations,commit:true},false);
}

const C={ navy:'#071B3A', navy2:'#16335B', green:'#9EDB38', green2:'#65B932', green3:'#2F8429', lime:'#C9F45C', skin:'#A8E948', cream:'#FFF4D6', paper:'#FFF9F0', wood:'#9B571E', wood2:'#D8892A', teal:'#08B9B1', cyan:'#20B9F2', blue:'#2878EF', violet:'#6D43D7', pink:'#F43F83', coral:'#FF5F55', orange:'#FF9F0A', yellow:'#FFC11A', white:'#FFFFFF', ink:'#101722', tan:'#F5D7A4' };

const mcp=createMcpClient({createdAt:CREATED_AT});
await mcp.init();
try {
  await call(mcp,'turtlepen_help',{section:'orientation'},true);
  for(const term of ['place_reference','artwork','overlay','stroke_text','render','perceptual_review']) await call(mcp,'search_help',{query:term},true);

  await call(mcp,'new_diagram',{name:'TurtlePen MCP — Creative Studio Mark',path:OUT_JSON,cols:150,rows:128},true);
  await call(mcp,'set_background',{color:C.paper});
  await call(mcp,'measure_image',{source:REF,maxWidthCells:125},true);
  await call(mcp,'place_reference',{id:'trace-source',source:REF,at:'A1.tl',span:'125x125',opacity:0.14,mode:'simplify',fit:'contain',detail:'high',supersample:4},true);

  const pageNames=[
    'paint-back','paint-drops','easel-board','easel-board-outline','easel-wood-back','easel-wood-front','easel-clip-top','easel-wood-outline',
    'shell','feet','apron','head','snout','beret','arm','hand','shell-outline','feet-outline','apron-outline','head-outline','snout-outline','beret-outline','arm-outline','hand-outline',
    'eye-white','glass-left-page','glass-right-page','pupils','glints','face','shell-lines','shell-paint','beret-paint','apron-pocket','apron-pocket-outline','apron-brush','apron-splat',
    'canvas-cyan','canvas-pink','canvas-orange','canvas-vector','canvas-nodes','canvas-shapes','bubble-fill','bubble-outline','bubble-icon','bubble-icon-nodes','bubble-highlight','labels',
    'wordmark-back','wordmark-swash','word-turtle-page','word-pen-page','word-m-page','word-c-page','word-p-page','pen-body-page','pen-core-page','pen-nib-page','finish'
  ];
  let z=1; for(const id of pageNames) await call(mcp,'add_page',{id,z:z++,intent:'overlay',title:id});

  const ops=[];
  const solid=(id,program,color,page)=>ops.push({op:'pen',id,page,role:'artwork',color,paint:'cells',program});
  const line=(id,program,color=C.navy,width=5,page='finish')=>ops.push({op:'pen',id,page,role:'artwork',color,width,cap:'round',program});
  const text=(id,label,x,y,span,font,color=C.white,weight=800,align='center',page='labels')=>ops.push({op:'pen',page,program:`text "${label}" at ${q(x,y,'tl')} span ${span} id ${id} font ${font} fill ${color} weight ${weight} align ${align}`});

  // Paint energy radiating from the canvas — compositional glue, not decoration chips.
  line('swoosh-teal',polyline([[134,64],[118,42],[106,24]]),C.teal,5,'paint-back');
  line('swoosh-violet',polyline([[154,67],[162,42],[168,25]]),C.violet,5,'paint-back');
  line('swoosh-pink',polyline([[178,76],[204,50],[220,34]]),C.pink,5,'paint-back');
  line('swoosh-orange',polyline([[185,94],[222,83],[245,72]]),C.orange,5,'paint-back');
  line('swoosh-green',polyline([[178,122],[213,132],[240,135]]),C.green2,5,'paint-back');
  line('swoosh-cyan',polyline([[145,127],[113,143],[91,154]]),C.cyan,5,'paint-back');
  for(const [id,x,y,r,c] of [
    ['drop-a',112,29,3,C.teal],['drop-b',126,39,2,C.cyan],['drop-c',173,30,3,C.violet],['drop-d',209,44,3,C.coral],
    ['drop-e',236,82,3,C.orange],['drop-f',224,126,3,C.green],['drop-g',104,147,3,C.cyan],['drop-h',88,139,2,C.pink],
    ['drop-i',195,57,2,C.pink],['drop-j',159,48,2,C.violet],['drop-k',125,71,2,C.yellow],['drop-l',198,106,2,C.coral]
  ]) solid(id,`disc ${r} at ${q(x,y)}`,c,'paint-drops');

  // Easel behind the artist.
  const board=[[124,64],[192,61],[186,146],[116,143]];
  solid('board-fill',polygonFill(board),C.paper,'easel-board');
  line('board-outline',polygonOutline(board),C.navy,5,'easel-board-outline');
  solid('leg-left',polygonFill([[129,142],[138,143],[128,183],[119,183]]),C.wood,'easel-wood-back');
  solid('leg-right',polygonFill([[174,143],[182,143],[192,183],[183,183]]),C.wood,'easel-wood-back');
  solid('rear-leg',polygonFill([[180,70],[186,71],[205,182],[196,182]]),C.wood2,'easel-wood-back');
  solid('tray',polygonFill([[111,141],[190,145],[188,151],[110,147]]),C.wood2,'easel-wood-front');
  solid('clip',polygonFill([[149,54],[173,54],[172,64],[149,65]]),C.wood2,'easel-wood-front');
  solid('clip-top',polygonFill([[157,47],[168,47],[167,55],[156,55]]),C.wood,'easel-clip-top');
  line('wood-outline-a',polygonOutline([[129,142],[138,143],[128,183],[119,183]]),C.navy,4,'easel-wood-outline');
  line('wood-outline-b',polygonOutline([[174,143],[182,143],[192,183],[183,183]]),C.navy,4,'easel-wood-outline');
  line('wood-outline-c',polygonOutline([[180,70],[186,71],[205,182],[196,182]]),C.navy,4,'easel-wood-outline');
  line('tray-outline',polygonOutline([[111,141],[190,145],[188,151],[110,147]]),C.navy,4,'easel-wood-outline');
  line('clip-outline',polygonOutline([[149,54],[173,54],[172,64],[149,65]]),C.navy,4,'easel-wood-outline');

  // Turtle silhouette — lower, friendlier, and closer to the actual reference proportions.
  solid('shell-fill',ellipseFill(59,118,31,38),C.green3,'shell');
  solid('foot-left',ellipseFill(52,158,11,13),C.green2,'feet');
  solid('foot-right',ellipseFill(78,160,11,13),C.green2,'feet');
  solid('apron-fill',polygonFill([[75,103],[99,105],[104,166],[71,167],[67,123]]),C.cream,'apron');
  solid('head-fill',ellipseFill(92,78,22,20),C.skin,'head');
  solid('snout-fill',ellipseFill(107,82,13,10),C.skin,'snout');
  solid('arm-fill',polygonFill([[88,102],[99,102],[108,108],[118,108],[128,103],[137,101],[143,108],[138,119],[127,124],[116,124],[104,120],[95,114]]),C.green2,'arm');
  solid('hand-fill',ellipseFill(142,108,8,8),C.skin,'hand');

  line('shell-outline',ellipseOutline(59,118,31,38),C.navy,5,'shell-outline');
  line('foot-left-outline',ellipseOutline(52,158,11,13),C.navy,5,'feet-outline');
  line('foot-right-outline',ellipseOutline(78,160,11,13),C.navy,5,'feet-outline');
  line('apron-outline',polygonOutline([[75,103],[99,105],[104,166],[71,167],[67,123]]),C.navy,5,'apron-outline');
  line('head-outline',ellipseOutline(92,78,22,20),C.navy,5,'head-outline');
  line('snout-outline',ellipseOutline(107,82,13,10),C.navy,5,'snout-outline');
  line('arm-outline',polygonOutline([[88,102],[99,102],[108,108],[118,108],[128,103],[137,101],[143,108],[138,119],[127,124],[116,124],[104,120],[95,114]]),C.navy,5,'arm-outline');
  line('hand-outline',ellipseOutline(142,108,8,8),C.navy,5,'hand-outline');

  // Beret and painter identity.
  solid('beret-fill',polygonFill([[67,61],[76,53],[92,49],[108,51],[117,57],[111,64],[96,66],[80,67],[70,65]]),C.navy2,'beret');
  solid('beret-stem',polygonFill([[73,54],[69,48],[72,46],[77,52]]),C.navy,'beret');
  line('beret-outline',polygonOutline([[67,61],[76,53],[92,49],[108,51],[117,57],[111,64],[96,66],[80,67],[70,65]]),C.navy,5,'beret-outline');
  for(const [id,x,y,c] of [['beret-p1',82,55,C.pink],['beret-p2',91,53,C.yellow],['beret-p3',101,56,C.coral],['beret-p4',74,59,C.blue]]) solid(id,`disc 2 at ${q(x,y)}`,c,'beret-paint');

  // Shell segmentation + paint smears make the shell read like an artist's palette.
  line('shell-rim',ellipseOutline(59,118,26,33),C.lime,4,'shell-lines');
  line('shell-s1',polyline([[59,85],[48,99],[47,115],[59,122],[47,137],[52,149]]),C.navy,3,'shell-lines');
  line('shell-s2',polyline([[59,85],[71,98],[74,114],[59,122],[72,137],[67,150]]),C.navy,3,'shell-lines');
  line('shell-s3',polyline([[32,121],[86,121]]),C.navy,3,'shell-lines');
  for(const [id,x,y,r,c] of [['paint-shell-a',47,101,4,C.orange],['paint-shell-b',69,110,4,C.pink],['paint-shell-c',50,132,4,C.teal],['paint-shell-d',71,139,4,C.blue],['paint-shell-e',61,95,3,C.yellow]]) solid(id,`disc ${r} at ${q(x,y)}`,c,'shell-paint');

  // Apron pocket + brush cluster.
  solid('pocket',polygonFill([[79,139],[97,140],[98,158],[80,157]]),C.tan,'apron-pocket');
  line('pocket-outline',polygonOutline([[79,139],[97,140],[98,158],[80,157]]),C.navy,3,'apron-pocket-outline');
  for(const [id,x1,y1,x2,y2,c] of [['brush-a',83,145,84,134,C.blue],['brush-b',88,145,90,132,C.violet],['brush-c',93,145,96,134,C.pink]]) line(id,polyline([[x1,y1],[x2,y2]]),c,3,'apron-brush');
  solid('apron-splat',`disc 3 at ${q(88,151)}`,C.blue,'apron-splat');
  line('apron-tie',polyline([[69,136],[60,145],[52,147]]),C.tan,4,'apron-brush');

  // Glasses and face — the key personality read.
  solid('eye-left-white',`disc 7 at ${q(86,76)}`,C.white,'eye-white');
  solid('eye-right-white',`disc 6 at ${q(104,75)}`,C.white,'eye-white');
  line('glass-left',`circle 10 at ${q(86,76)}`,C.navy,5,'glass-left-page');
  line('glass-right',`circle 9 at ${q(105,75)}`,C.navy,5,'glass-right-page');
  line('glass-bridge',polyline([[96,75],[98,74]]),C.navy,5,'face');
  line('glass-arm',polyline([[114,73],[119,69]]),C.navy,4,'face');
  solid('pupil-left',`disc 3 at ${q(87,76)}`,C.ink,'pupils');
  solid('pupil-right',`disc 3 at ${q(104,75)}`,C.ink,'pupils');
  solid('glint-left',`disc 1 at ${q(88,74)}`,C.white,'glints');
  solid('glint-right',`disc 1 at ${q(105,73)}`,C.white,'glints');
  solid('nostril',`disc 1 at ${q(113,83)}`,C.ink,'face');
  line('smile',polyline([[101,87],[105,90],[111,90],[115,87]]),C.navy,3,'face');
  line('cheek',polyline([[97,88],[99,89]]),C.green3,2,'face');

  // Stylus/pen in hand.
  line('pen-body',polyline([[140,106],[160,117]]),C.navy,5,'pen-body-page');
  line('pen-core',polyline([[141,105],[159,115]]),C.blue,3,'pen-core-page');
  solid('pen-nib',polygonFill([[159,114],[168,120],[160,119]]),C.navy,'pen-nib-page');

  // Canvas drawing: one native stroke is explicitly converted to an editable lattice path.
  line('hero-stroke',polyline([[128,124],[141,116],[151,106],[160,97],[171,92],[181,82]]),C.cyan,5,'canvas-cyan');
  line('hero-stroke-pink',polyline([[131,127],[146,124],[158,115],[170,110],[183,100]]),C.pink,5,'canvas-pink');
  line('hero-stroke-orange',polyline([[135,119],[143,104],[150,92],[158,79]]),C.orange,5,'canvas-orange');
  line('vector-curve',polyline([[151,82],[161,74],[174,77],[180,88],[179,103],[170,116]]),C.navy,3,'canvas-vector');
  for(const [id,x,y,c] of [['node-a',151,82,C.navy],['node-b',161,74,C.navy],['node-c',174,77,C.navy],['node-d',180,88,C.navy],['node-e',179,103,C.navy],['node-f',170,116,C.navy]]) solid(id,`disc 2 at ${q(x,y)}`,c,'canvas-nodes');
  solid('shape-square',polygonFill([[133,78],[141,78],[141,86],[133,86]]),C.violet,'canvas-shapes');
  solid('shape-tri',polygonFill([[157,89],[170,91],[166,80]]),C.violet,'canvas-shapes');
  solid('shape-circle',`disc 7 at ${q(145,106)}`,C.teal,'canvas-shapes');

  // Teardrop capability cloud from the actual reference, smaller and less dominant.
  const bubbles=[
    ['canvas',30,72,18,12,C.blue,'Canvas','Control',150,88],
    ['coding',52,43,19,13,C.orange,'Creative','Coding',129,82],
    ['svg',105,25,21,15,C.teal,'SVG','Editing',141,75],
    ['vector',159,25,20,15,C.violet,'Vector','Art',158,73],
    ['gen',211,43,20,15,C.pink,'Generative','Design',179,78],
    ['draw',239,83,19,14,C.orange,'Drawing','Tools',181,103],
    ['path',232,132,20,15,C.green2,'Path','Operations',179,119],
    ['export',31,117,17,12,C.violet,'Export','',113,128]
  ];
  for(const [id,cx,cy,rx,ry,color,l1,l2,tx,ty] of bubbles){
    const pts=teardrop(cx,cy,rx,ry,tx,ty);
    solid(`${id}-bubble`,polygonFill(pts),color,'bubble-fill');
    line(`${id}-bubble-outline`,polygonOutline(pts),C.white,2,'bubble-outline');
    solid(`${id}-hi`,`disc 2 at ${q(cx-rx/3,cy-ry/2)}`,C.white,'bubble-highlight');
    text(`${id}-l1`,l1,cx-rx+5,cy-5,`${Math.max(10,Math.floor(rx-5))}x3`,15,C.white,900);
    if(l2) text(`${id}-l2`,l2,cx-rx+5,cy+2,`${Math.max(10,Math.floor(rx-5))}x3`,15,C.white,900);
  }
  // Bubble icons, kept simple enough to remain legible at logo scale.
  line('icon-canvas',polyline([[23,77],[35,77],[35,87],[23,87],[23,77],[29,77],[29,87]]),C.white,3,'bubble-icon');
  line('icon-code',polyline([[46,48],[42,52],[46,56],[58,44],[62,48],[58,52]]),C.white,3,'bubble-icon');
  line('icon-svg',polyline([[97,31],[105,36],[113,31],[105,39],[105,47]]),C.white,3,'bubble-icon');
  solid('icon-vector-nib',polygonFill([[156,34],[162,43],[156,48],[150,43]]),C.white,'bubble-icon');
  line('icon-gen',polyline([[207,51],[207,58],[203,54],[211,54],[207,51],[214,59],[218,55]]),C.white,3,'bubble-icon');
  line('icon-draw',polyline([[232,91],[245,80]]),C.white,4,'bubble-icon');
  line('icon-path',polyline([[222,138],[229,134],[237,136],[243,132]]),C.white,3,'bubble-icon');
  for(const [id,x,y] of [['pnode1',222,138],['pnode2',229,134],['pnode3',237,136],['pnode4',243,132]]) solid(id,`disc 1 at ${q(x,y)}`,C.white,'bubble-icon-nodes');
  line('icon-export',polyline([[31,119],[31,127],[26,123],[31,127],[36,123],[24,131],[38,131]]),C.white,3,'bubble-icon');

  // Wordmark silhouette and expressive baseline swash.
  solid('wordmark-blob',polygonFill([[18,185],[48,181],[87,184],[113,179],[143,184],[170,181],[202,185],[223,194],[218,219],[189,226],[147,224],[111,228],[75,224],[40,227],[19,217]]),C.navy,'wordmark-back');
  line('wordmark-swash-cyan',polyline([[45,222],[76,218],[106,220],[129,216]]),C.cyan,5,'wordmark-swash');
  line('wordmark-swash-pink',polyline([[169,219],[196,216],[220,207]]),C.pink,5,'wordmark-swash');
  line('wordmark-swash-orange',polyline([[189,222],[216,217],[235,208]]),C.orange,5,'wordmark-swash');

  await planCommit(mcp,ops,'reference-guided studio composition');

  // Convert one central drawing stroke into exact editable native path artwork.
  await call(mcp,'stroke_to_path',{id:'hero-stroke',resultId:'hero-stroke-editable',removeSource:true},true);

  await call(mcp,'measure',{text:'Turtle',fontSize:92,maxWidthCells:72},true);
  await call(mcp,'measure',{text:'Pen',fontSize:92,maxWidthCells:50},true);
  await call(mcp,'measure',{text:'M',fontSize:54,maxWidthCells:18},true);
  await planCommit(mcp,[
    {op:'pen',page:'word-turtle-page',program:`text "Turtle" at ${q(25,188,'tl')} span 67x14 id word-turtle font 92 fill ${C.lime} weight 900 align center`},
    {op:'pen',page:'word-pen-page',program:`text "Pen" at ${q(128,188,'tl')} span 53x14 id word-pen font 92 fill ${C.white} weight 900 align center`},
    {op:'pen',page:'word-m-page',program:`text "M" at ${q(92,216,'tl')} span 18x8 id word-m font 54 fill ${C.orange} weight 900 align center`},
    {op:'pen',page:'word-c-page',program:`text "C" at ${q(117,216,'tl')} span 18x8 id word-c font 54 fill ${C.cyan} weight 900 align center`},
    {op:'pen',page:'word-p-page',program:`text "P" at ${q(142,216,'tl')} span 18x8 id word-p font 54 fill ${C.violet} weight 900 align center`},
  ],'measured multicolor wordmark');

  await call(mcp,'annotate',{id:'shell-fill',description:'Painter turtle mascot shell, native TurtlePen lattice fill',technology:'TurtlePen native lattice artwork',tags:['brand','turtle','artist','native'],properties:{referenceScaffold:'removed-before-render'}});
  await call(mcp,'annotate',{id:'hero-stroke-editable',description:'Central canvas gesture authored as a TurtlePen stroke then converted to editable exact lattice artwork',technology:'stroke_to_path',tags:['brand','drawing','editable-path']});
  await call(mcp,'group',{action:'create',id:'mascot',members:['shell-fill','apron-fill','head-fill','snout-fill','arm-fill','hand-fill','beret-fill']});
  await call(mcp,'inspect',{ids:['shell-fill','head-fill','apron-fill','board-fill','hero-stroke-editable']},true);

  // The reference is authoring-only. It must be gone before validation/render/save.
  await call(mcp,'remove_page',{id:'trace-source'},true);

  console.log('\n[ascii]\n'+await call(mcp,'ascii',{maxCells:120,withFindings:true}));
  let parsed=JSON.parse(await call(mcp,'validate',{format:'json'},false));
  const hard=parsed.open.filter(f=>['S0','S1'].includes(f.severity));
  if(hard.length) throw new Error(`Structural validation has ${hard.length} S0/S1 finding(s).`);
  const s2=parsed.open.filter(f=>f.severity==='S2');
  const unexpected=s2.filter(f=>f.rule!=='L006' || !['easel-wood-outline','face','shell-lines','bubble-icon','wordmark-swash'].includes(f.page));
  if(unexpected.length) throw new Error(`Unexpected S2 findings: ${JSON.stringify(unexpected.slice(0,8),null,2)}`);
  for(const f of s2) await call(mcp,'accept_finding',{fingerprint:f.fingerprint,reason:`Intentional native illustration join on ${f.page}: ${(f.actors??[]).join(' + ')}. Visual correctness is adjudicated separately by render LOOK + perceptual_review.`});
  parsed=JSON.parse(await call(mcp,'validate',{format:'json'},false));
  const blockers=parsed.open.filter(f=>f.severity!=='S3');
  if(blockers.length) throw new Error(`Post-decision validation still has ${blockers.length} non-INFO finding(s).`);

  const rendered=await call(mcp,'render',{path:OUT_SVG,showGrid:false,bounds:'canvas',margin:0},true);
  const match=/renderHash: ([0-9a-f]{16})/.exec(rendered); if(!match)throw new Error('renderHash missing');
  await call(mcp,'save',{path:OUT_JSON,force:true},true);
  console.log(`\nBUILT renderHash=${match[1]}\n${OUT_SVG}\n${OUT_JSON}`);
  console.log('NOT perceptually approved until the rendered artifact is actually looked at.');
} finally { await mcp.close(); }

function ellipseFill(cx,cy,rx,ry){ const rows=[]; for(let y=cy-ry;y<=cy+ry;y++){ const ratio=1-((y-cy)*(y-cy))/(ry*ry); if(ratio<0)continue; const half=Math.floor(rx*Math.sqrt(ratio)); rows.push(`pen ${q(cx-half,y)}\ndash ${half*2+1} e`);} return rows.join('\n'); }
function ellipseOutline(cx,cy,rx,ry,steps=64){ const pts=[]; for(let i=0;i<steps;i++){ const a=Math.PI*2*i/steps,p=[Math.round(cx+Math.cos(a)*rx),Math.round(cy+Math.sin(a)*ry)]; if(!pts.length||p[0]!==pts.at(-1)[0]||p[1]!==pts.at(-1)[1])pts.push(p);} return polygonOutline(pts); }
function polygonFill(points){ const minX=Math.floor(Math.min(...points.map(p=>p[0]))),maxX=Math.ceil(Math.max(...points.map(p=>p[0]))),minY=Math.floor(Math.min(...points.map(p=>p[1]))),maxY=Math.ceil(Math.max(...points.map(p=>p[1]))); const lines=[]; for(let y=minY;y<=maxY;y++){ let start=null; for(let x=minX;x<=maxX+1;x++){ const inside=x<=maxX&&pointInPolygon(x+.25,y+.25,points); if(inside&&start===null)start=x; if((!inside||x===maxX+1)&&start!==null){ const end=x-1; lines.push(`pen ${q(start,y)}\ndash ${end-start+1} e`); start=null; } } } return lines.join('\n'); }
function polygonOutline(points){ return polyline([...points,points[0]]); }
function polyline(points){ const [first,...rest]=points; return [`pen ${q(first[0],first[1])}`,...rest.map(p=>`ray to ${q(p[0],p[1])}`)].join('\n'); }
function pointInPolygon(x,y,points){ let inside=false; for(let i=0,j=points.length-1;i<points.length;j=i++){ const [xi,yi]=points[i],[xj,yj]=points[j]; const hit=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi); if(hit)inside=!inside;} return inside; }
function teardrop(cx,cy,rx,ry,tx,ty){
  const pts=[]; const dx=tx-cx,dy=ty-cy,angle=Math.atan2(dy,dx); const gap=.52;
  for(let i=0;i<=22;i++){ const a=angle+gap+(Math.PI*2-gap*2)*i/22; pts.push([Math.round(cx+Math.cos(a)*rx),Math.round(cy+Math.sin(a)*ry)]); }
  pts.push([Math.round(cx+dx*.36),Math.round(cy+dy*.36)]); return pts;
}
