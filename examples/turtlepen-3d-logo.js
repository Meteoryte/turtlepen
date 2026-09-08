/** Two original TurtlePen-native 3D logo studies. Never replaces the canonical brand files. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import * as core from '../src/core/index.js';
import {cellMesh,transformed} from '../src/core/geometry3d/mesh.js';
import {identity} from '../src/core/geometry3d/math.js';
import {addPath} from '../src/core/document.js';

const out=resolve(process.argv[2]||'artifacts/turtlepen-3d-logo');
await mkdir(out,{recursive:true});
const C={navy:'#001b35',slate:'#40516b',green:'#a8c95f',light:'#c7dc82',dark:'#255943',cream:'#fff0bd',paper:'#fffdf5'};
const g=core.geometry3d,receipts=[];
const source='brand/logo.turtlepen.json',sourceHash=createHash('sha256').update(await readFile(source)).digest('hex');
async function save(name,scene,formats){
 for(const format of formats){const {bytes:exported,...metadata}=g.exportScene(scene,format);const bytes=format==='tpf'?Buffer.from(JSON.stringify(scene)+'\n'):exported;if(format==='tpf')g.deserializeTpf(bytes.toString());await writeFile(join(out,name+'.'+format),bytes);receipts.push({file:name+'.'+format,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...metadata});}
}

/** Join diagonal pixel contacts explicitly before extruding native font/brand artwork. */
function bridgeCorners(input){
 const set=new Set(input);let changes=0,changed=true;
 while(changed){changed=false;for(const key of [...set]){
  const [x,y]=key.split(',').map(Number);
  for(const dy of [-1,1])if(set.has(`${x+1},${y+dy}`)&&!set.has(`${x+1},${y}`)&&!set.has(`${x},${y+dy}`)){
   set.add(`${x+1},${y}`);changes++;changed=true;
  }
 }}
 return {set,changes};
}
function textInk(text){
 const drawn=core.turtlefont.renderStrokeText(text,{scale:1,weight:2,tracking:2});
 const minX=Math.min(...drawn.pieces.map(p=>p.x)),minY=Math.min(...drawn.pieces.map(p=>p.y));
 const ink=bridgeCorners(new Set(drawn.pieces.map(p=>`${p.x-minX},${p.y-minY}`)));
 const points=[...ink.set].map(k=>k.split(',').map(Number));
 return {...ink,width:Math.max(...points.map(p=>p[0]))+1,height:Math.max(...points.map(p=>p[1]))+1};
}
function textSolid(text,width,height,depth,position){
 const ink=textInk(text),xs=Array.from({length:ink.width+1},(_,i)=>i*width/ink.width),ys=Array.from({length:ink.height+1},(_,i)=>i*height/ink.height);
 const mesh=cellMesh(xs,ys,[0,depth],new Set([...ink.set].map(k=>k+',0'))),m=identity();m[5]=-1;[m[3],m[7],m[11]]=position;
 return transformed(mesh,m);
}

// Full character: dimensional interpretation of the canonical turtle-at-easel.
const commands=[];
function ball(id,position,scale,color,segments=40){commands.push({op:'sphere',id,radius:1,scale,position,color,segments});}
function box(id,size,position,color){commands.push({op:'box',id,size,position,color});}
function rod(id,a,b,radius,color){
 const d=b.map((n,i)=>n-a[i]),height=Math.hypot(...d);
 commands.push({op:'cylinder',id,radius,height,position:a,rotation:[0,Math.acos(d[2]/height)*180/Math.PI,Math.atan2(d[1],d[0])*180/Math.PI],segments:24,color});
}
function line(id,points,radius,color){for(let i=1;i<points.length;i++)rod(`${id}-${i}`,points[i-1],points[i],radius,color);}
commands.push({op:'cylinder',id:'display-base',radius:1,height:5,scale:[67,37,1],position:[4,2,0],segments:96,color:C.navy});
ball('shell-rim',[-28,4,35],[19,11.5,24],C.green);
ball('shell',[-28,5,35],[17.5,12,22.5],C.dark,64);
ball('left-foot',[-29,-5,9],[10,13,6],C.green);
ball('right-foot',[-10,-7,9],[9,13,6],C.green);
ball('belly',[-20,-6,34],[12,6,21],C.cream,48);
ball('neck',[-18,-1,57],[7,7,10],C.green);
ball('head',[-15,-1,73],[14,11,14],C.light,64);
ball('snout',[-5,-6,68],[11,8.5,7],C.light,48);
ball('left-eye-white',[-21,-10,78],[4.5,2.8,5],C.paper);
ball('right-eye-white',[-8,-11,78],[4,2.7,4.6],C.paper);
ball('left-pupil',[-19.8,-12.4,78.5],[2.2,.9,3],C.navy);
ball('right-pupil',[-6.8,-13.4,78.5],[2,.9,2.7],C.navy);
ball('left-eye-glint',[-20.4,-13.2,79.8],[.8,.4,.8],C.paper,24);
ball('right-eye-glint',[-7.4,-14.2,79.8],[.7,.4,.7],C.paper,24);
const facePoint=(x,z,cx,cy,cz,rx,ry,rz)=>[x,cy-ry*Math.sqrt(Math.max(0,1-((x-cx)/rx)**2-((z-cz)/rz)**2))-.2,z];
line('brow',[[-25,82],[-22,83],[-18,83]].map(([x,z])=>facePoint(x,z,-15,-1,73,14,11,14)),.65,C.navy);
ball('nostril',[2,-10,72],[.75,.55,.7],C.navy,24);
line('smile',[[-8,67],[-5,65],[-1,65],[2,67]].map(([x,z])=>facePoint(x,z,-5,-6,68,11,8.5,7)),.55,C.navy);
rod('upper-drawing-arm',[-13,-7,49],[0,-11,43],4.5,C.green);
ball('drawing-elbow',[0,-11,43],[4.7,4.7,4.7],C.green);
rod('drawing-forearm',[0,-11,43],[13,-10,51],4.2,C.green);
ball('drawing-hand',[15,-10,52],[5,4,5.5],C.green);
rod('resting-arm',[-33,-5,48],[-36,-7,29],3.7,C.green);
ball('resting-hand',[-36,-7,27],[4.5,4.5,5],C.green);
rod('pen-barrel',[13,-12,56],[33,-3.8,48.5],1.3,C.navy);
rod('pen-grip',[18,-9.9,54.1],[25,-7,51.5],1.43,C.slate);
commands.push({op:'extrude',id:'pen-nib',points:[[0,-1.25],[0,1.25],[5,0]],height:1.4,position:[32,-4.2,47.4],rotation:[90,0,12],color:C.cream});
rod('easel-left-leg',[16,1,5],[26,2,43],2.6,C.slate);
rod('easel-right-leg',[58,1,5],[50,2,43],2.6,C.slate);
rod('easel-rear-leg',[43,23,5],[40,4,72],2.3,C.slate);
rod('easel-cross-brace',[21,1,18],[54,1,18],1.7,C.slate);
box('board-frame',[40,3,52],[17,-1,31],C.navy);
box('drawing-paper',[35.6,1,47.6],[19.2,-2.05,33.2],C.paper);
box('easel-tray',[46,8,4],[14,-4,30],C.slate);
box('board-clip',[10,4,6],[32,-3,79],C.slate);
rod('clip-hinge',[32,-1,84],[42,-1,84],1.8,C.slate);
line('board-flourish',[[37,-2.7,47],[44,-2.7,50],[49,-2.7,56],[51,-2.7,64],[49,-2.7,67],[47,-2.7,65]],.8,C.dark);
const shellPoint=([x,z])=>[x,5+12*Math.sqrt(Math.max(0,1-((x+28)/17.5)**2-((z-35)/22.5)**2)),z];
const panel=[[-34,28],[-35,42],[-27,51],[-19,43],[-18,29],[-27,20]];
line('shell-central-plate',[...panel,panel[0]].map(shellPoint),.7,C.navy);
const rim=[[-43,21],[-43,47],[-27,57],[-13,47],[-12,21],[-27,13]];
for(let i=0;i<panel.length;i++)rod(`shell-panel-seam-${i}`,shellPoint(panel[i]),shellPoint(rim[i]),.65,C.navy);
for(const z of [22,33,44]){
 const points=[-27,-21,-15].map(x=>[x,-6-6*Math.sqrt(Math.max(0,1-((x+20)/12)**2-((z-34)/21)**2)),z]);
 line(`belly-seam-${z}`,points,.5,C.slate);
}
let figure=g.applyCommands(g.createScene({name:'TurtlePen full turtle and easel',units:'mm'}),commands);
figure.objects.push({id:'turtlepen-wordmark',kind:'mesh',matrix:identity(),color:C.cream,...textSolid('TURTLEPEN',78,8,1.2,[-37,-19,5])});
figure=g.deserializeTpf(figure);
await writeFile(join(out,'full-logo-construction.json'),JSON.stringify({name:figure.name,units:'mm',commands,wordmark:{text:'TURTLEPEN',source:'native TurtleFont',width:78,height:8,depth:1.2,position:[-37,-19,5]}},null,2)+'\n');
await save('full-logo',figure,['tpf','glb']);
process.stdout.write('Full turtle-and-easel scene exported.\n');

// Redesigned mark: compact turtle silhouette, nib in the shell, independent wordmark.
const pitch=.5,N=168,zs=[0,3,4.2,5,5.6];
const ellipse=(x,y,cx,cy,rx,ry)=>((x-cx)/rx)**2+((y-cy)/ry)**2<=1;
function polygon(x,y,ps){let inside=false;for(let i=0,j=ps.length-1;i<ps.length;j=i++)if((ps[i][1]>y)!==(ps[j][1]>y)&&x<(ps[j][0]-ps[i][0])*(y-ps[i][1])/(ps[j][1]-ps[i][1])+ps[i][0])inside=!inside;return inside;}
function roundedPlate(x,y){const dx=Math.max(Math.abs(x-42)-35,0),dy=Math.max(Math.abs(y-42)-35,0);return dx*dx+dy*dy<=49;}
const word=textInk('TURTLEPEN');
const masks=[new Set(),new Set(),new Set(),new Set()];
for(let i=0;i<N;i++)for(let j=0;j<N;j++){
 const x=(i+.5)*pitch,y=(j+.5)*pitch,key=`${i},${j}`;
 if(roundedPlate(x,y))masks[0].add(key);
 const body=ellipse(x,y,40,54,23,18)||ellipse(x,y,65,56,8,6)
  ||ellipse(x,y,26,39,6,4)||ellipse(x,y,26,69,6,4)||ellipse(x,y,54,39,6,4)||ellipse(x,y,54,69,6,4)
  ||polygon(x,y,[[18,51],[10,53],[18,59]]);
 const tx=Math.floor((x-7)/70*word.width),ty=Math.floor((22-y)/9*word.height);
 if(body||word.set.has(`${tx},${ty}`))masks[1].add(key);
 const slit=(Math.abs(x-40)<.7&&y>=42&&y<=56),hole=ellipse(x,y,40,56,2,2),cut=slit||hole;
 const nib=polygon(x,y,[[33,65],[47,65],[50,57],[40,42],[30,57]])&&!cut;
 const eye=ellipse(x,y,68.5,57.2,1.25,1.25);
 if((ellipse(x,y,40,54,20,15)&&!cut)||nib||eye)masks[2].add(key);
 if(nib||eye)masks[3].add(key);
}
const bridgeCounts=[];
for(let k=0;k<4;k++){const b=bridgeCorners(masks[k]);masks[k]=b.set;bridgeCounts.push(b.changes);}
// Every raised detail is physically supported by all lower layers.
for(let k=3;k>0;k--)for(const key of masks[k])masks[k-1].add(key);
const axes=Array.from({length:N+1},(_,i)=>i*pitch),occupied=new Set();
for(let k=0;k<4;k++)for(const key of masks[k])occupied.add(key+','+k);
const reliefMesh=cellMesh(axes,axes,zs,occupied);
const relief={...g.createScene({name:'TurtlePen raised turtle-nib brand badge',units:'mm'}),objects:[{id:'raised-brand-badge',kind:'mesh',matrix:identity(),color:C.green,...reliefMesh}]};
await save('raised-brand-badge',relief,['tpf','stl']);
const colored={...g.createScene({name:'TurtlePen brand badge color assembly',units:'mm'}),objects:masks.map((mask,k)=>({id:['backing','turtle-and-wordmark','shell','pen-nib'][k],kind:'mesh',matrix:identity(),color:[C.paper,C.navy,C.green,C.paper][k],...cellMesh(axes,axes,[zs[k],zs[k+1]],new Set([...mask].map(key=>key+',0')))}))};
await save('raised-brand-badge-color',colored,['tpf','glb']);

// Author editable flat artwork with the exact same final masks; no embedded raster.
const flat=core.createDocument({name:'TurtlePen turtle-nib brand concept',cols:84,rows:84});flat.createdAt='2026-09-08T00:00:00.000Z';
for(let k=1;k<4;k++){
 const page=core.addPage(flat,{id:'brand-'+k,z:k,intent:'overlay'});
 addPath(flat,page.id,{id:['','turtle-and-wordmark','shell','pen-nib'][k],role:'artwork',stroke:{color:[C.paper,C.navy,C.green,C.paper][k],paint:'cells',width:5},pieces:[...masks[k]].map(key=>{const [x,y]=key.split(',').map(Number);return {x,y:N-1-y,type:'line',dir:'right'};})});
}
await writeFile(join(out,'brand-mark.turtlepen.json'),core.serialize(flat));
await writeFile(join(out,'brand-mark.svg'),core.renderSvg(flat,{showGrid:false,bounds:'content',margin:28}));
await writeFile(join(out,'brand-mark.png'),core.renderPng(flat,{showGrid:false,bounds:'content',margin:28}));
const icon=core.deserialize(core.serialize(flat));icon.name='TurtlePen turtle-nib icon';
for(const page of icon.pages)icon.elements[page.id]=icon.elements[page.id].map(el=>({...el,pieces:el.pieces.filter(p=>p.y<110)})).filter(el=>el.pieces.length);
await writeFile(join(out,'brand-icon.svg'),core.renderSvg(icon,{showGrid:false,bounds:'content',margin:20,transparent:true}));
await writeFile(join(out,'brand-icon.turtlepen.json'),core.serialize(icon));
const monochrome=core.createDocument({name:'TurtlePen single-color brand mark',cols:84,rows:84});monochrome.createdAt=flat.createdAt;
addPath(monochrome,'base',{id:'turtle-nib-knockout',role:'artwork',stroke:{color:C.navy,paint:'cells',width:5},pieces:[...masks[1]].filter(key=>!masks[3].has(key)).map(key=>{const [x,y]=key.split(',').map(Number);return {x,y:N-1-y,type:'line',dir:'right'};})});
await writeFile(join(out,'brand-mark-single-color.svg'),core.renderSvg(monochrome,{showGrid:false,bounds:'content',margin:28,transparent:true}));
await writeFile(join(out,'brand-mark-single-color.turtlepen.json'),core.serialize(monochrome));
const design={source,sourceHash,canonicalLogoReplaced:false,fullScene:{objects:figure.objects.length,wordmark:'native TurtleFont',style:'fully dimensional turtle at easel; lime/navy/cream palette'},brandRedesign:{concept:'Turtle silhouette with a fountain-pen nib in the shell',pitchMillimeters:pitch,baseThicknessMillimeters:3,totalHeightMillimeters:5.6,bridgeCounts,wordmark:'native TurtleFont',sizeMillimeters:[84,84],approval:'new concept requested by user; canonical brand not replaced'}};
await writeFile(join(out,'design-receipt.json'),JSON.stringify(design,null,2)+'\n');
await writeFile(join(out,'receipts.json'),JSON.stringify({schema:1,artifacts:receipts},null,2)+'\n');
process.stdout.write(JSON.stringify({out,fullObjects:figure.objects.length,raisedBadgeTriangles:g.inspectScene(relief).triangles,exports:receipts.length,bridgeCounts},null,2)+'\n');
