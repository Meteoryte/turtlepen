/** Second sculpture study. Native, editable forms; the accepted flat brand is reused unchanged. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import * as g from '../src/core/geometry3d/index.js';
import {transform,multiply} from '../src/core/geometry3d/math.js';

const out=resolve(process.argv[2]||'artifacts/turtlepen-mascot-v2');
await mkdir(out,{recursive:true});
const C={ink:'#142f35',slate:'#536673',skin:'#93be54',light:'#a7cf66',shell:'#32684c',seam:'#244b39',rim:'#87aa53',cream:'#f4dfaa',paper:'#fffaf0',gold:'#bd9759',wood:'#b38b61'};
const commands=[];
function ellipsoid(id,position,scale,color,rotation=[0,0,0],segments=48){commands.push({op:'sphere',id,radius:1,position,scale,color,rotation,segments,shading:'smooth'});}
function loft(id,sections,color,options={}){commands.push({op:'loft',id,sections,segments:64,color,shading:'smooth',...options});}
function sweep(id,points,radii,color,options={}){commands.push({op:'sweep',id,points,radii,color,segments:24,steps:32,shading:'smooth',...options});}
function between(a,b){const d=b.map((v,i)=>v-a[i]),length=Math.hypot(...d);return {position:a,rotation:[0,Math.acos(d[2]/length)*180/Math.PI,Math.atan2(d[1],d[0])*180/Math.PI],length};}
function taper(id,a,b,radii,color){const p=between(a,b);loft(id,[[0,0,0,...radii[0]],[0,0,p.length,...radii[1]]],color,{position:p.position,rotation:p.rotation,exponent:5});}
function block(id,size,position,color,bevel=.5,rotation=[0,0,0],exponent=6){
  const [x,y,z]=size,sections=[];
  for(let i=0;i<=5;i++){const a=i/5*Math.PI/2;sections.push([0,0,bevel*(1-Math.cos(a)),x/2-bevel+bevel*Math.sin(a),y/2-bevel+bevel*Math.sin(a)]);}
  for(let i=0;i<=5;i++){const a=i/5*Math.PI/2;sections.push([0,0,z-bevel+bevel*Math.sin(a),x/2-bevel+bevel*Math.cos(a),y/2-bevel+bevel*Math.cos(a)]);}
  loft(id,sections,color,{position,rotation,exponent,segments:64});
}
// Sample a authored pear/egg silhouette into explicit loft sections; no mesh-only sculpt hidden downstream.
function egg(id,center,size,color,{lean=0,pear=0,exponent=2,rotation=[0,0,0]}={}){
  const sections=[];
  for(let i=0;i<=40;i++){
    const a=-Math.PI/2+i/40*Math.PI,t=Math.sin(a),r=i===0||i===40?0:Math.cos(a)*(1-pear*t);
    sections.push([lean*t,0,size[2]*t,size[0]*r,size[1]*r]);
  }
  loft(id,sections,color,{position:center,rotation,exponent});
}

// A low, rounded presentation plinth, without the previous oversized pixel lettering.
block('plinth', [128,70,5], [1,0,0],C.ink,1.5,[0,0,0],3.4);
block('plinth-inlay', [124,66,.9], [1,0,4.4],C.rim,.25,[0,0,0],3.4);
block('plinth-top', [122.4,64.4,.9], [1,0,5.1],C.ink,.25,[0,0,0],3.4);

// The offset broad shell is visible in the front silhouette, as it is in the 2D original.
egg('shell-rim',[-35,0,35],[22,12.5,26],C.rim,{rotation:[0,-8,0]});
egg('shell-dome',[-35,0,35],[21.4,13.7,25.2],C.shell,{rotation:[0,-8,0]});
egg('body',[-23,-7,33],[15.5,11,24],C.skin,{pear:.1,lean:-1.5,exponent:2.2});
egg('belly',[-20,-15.3,33],[11.6,4.8,19.5],C.cream,{pear:.08,lean:1,exponent:2.2});
egg('left-foot',[-34,-10,10],[10,12.5,5.3],C.skin,{exponent:2.4,rotation:[0,0,-12]});
egg('right-foot',[-13,-11,10],[9,13,5.3],C.skin,{exponent:2.4,rotation:[0,0,8]});
sweep('neck',[[-23,-6,46],[-24,-5,52],[-19,-6,55],[-17,-6,60]],[8,8,7,8],C.skin);

// One continuous head volume, wider at the cheeks and leaning toward the drawing.
const headSections=[];
for(let i=0;i<=48;i++){
  const a=-Math.PI/2+i/48*Math.PI,t=Math.sin(a),r=i===0||i===48?0:Math.cos(a)*(1-.14*t);
  headSections.push([-17+2*t, -7, 68+15*t, 16*r, 12*r]);
}
loft('head',headSections,C.light,{segments:80,exponent:2.2});
function faceY(x,z){
  const k=Math.max(0,Math.min(headSections.length-2,headSections.findIndex(s=>s[2]>=z)-1));
  const a=headSections[k],b=headSections[k+1],t=(z-a[2])/(b[2]-a[2]);
  const s=a.map((v,i)=>v+(b[i]-v)*t);
  return s[1]-s[4]*Math.max(0,1-Math.abs((x-s[0])/s[3])**2.2)**(1/2.2);
}
const face=(x,z,inset=0)=>[x,faceY(x,z)+inset,z];
// Fit short cubic spans to a curve ON the head, instead of putting its control points on the head.
// A Bezier control point generally is not on the evaluated curve.
function surfaceStroke(id,path,radius,color,spans=5,surface=face){
  const at=t=>{const p=path(t);return surface(p[0],p[1],.06);};
  const derivative=t=>{const lo=Math.max(0,t-.0001),hi=Math.min(1,t+.0001),a=at(lo),b=at(hi);return b.map((v,i)=>(v-a[i])/(hi-lo));};
  const points=[];
  for(let i=0;i<spans;i++){
    const a=i/spans,b=(i+1)/spans,p=at(a),q=at(b),d=derivative(a),e=derivative(b),h=(b-a)/3;
    if(i===0)points.push(p);
    points.push(p.map((v,k)=>v+d[k]*h),q.map((v,k)=>v-e[k]*h),q);
  }
  sweep(id,points,points.map(()=>radius),color,{steps:12,segments:16});
}
for(const [side,x,z,rx,rz] of [['near',-23.3,73.8,4.65,5.5],['far',-10.3,74,4.05,4.9]]){
  const y=faceY(x,z)+.9;
  ellipsoid(`${side}-eye-rim`,[x,y+.45,z],[rx+.25,1.7,rz+.25],C.skin);
  ellipsoid(`${side}-eye`,[x,y-.15,z],[rx,1.8,rz],C.paper);
  ellipsoid(`${side}-iris`,[x+1.4,y-1.7,z-1],[2.5,.65,3.1],C.shell);
  ellipsoid(`${side}-pupil`,[x+1.65,y-2.15,z-.95],[1.7,.45,2.4],C.ink);
  ellipsoid(`${side}-glint`,[x+1.2,y-2.52,z],[.58,.2,.65],C.paper,[0,0,0],24);
  surfaceStroke(`${side}-brow`,t=>[x-rx*.62+rx*1.42*t,78.4+.7*Math.sin(Math.PI*t)],.32,C.shell,3);
}
// Thin embedded expression curves replace the old segmented black rods.
surfaceStroke('smile',t=>[-23+18.1*t,64+1.0*t-3*Math.sin(Math.PI*t)],.38,C.ink,6);
ellipsoid('smile-dimple',face(-4.9,65,.1),[.7,.45,.7],C.ink,[0,0,0],24);
ellipsoid('nostril',face(-3.5,69,.12),[.55,.45,.4],C.shell,[0,0,0],24);

// One curved, tapering arm with a wrist and thumb. Shoulder cap stays inside the body.
sweep('drawing-arm',[[-16,-13,46],[-5,-19,35],[2,-21,38],[12,-18,48]],[5.6,5.1,3.5,3.6],C.skin,{steps:48,segments:32});
egg('drawing-hand',[13,-17.6,48.8],[4.2,3.5,4.6],C.light,{rotation:[0,30,8]});
egg('gripping-thumb',[14.3,-20,50],[2.5,2.2,2.7],C.light,{rotation:[0,-30,0]});
sweep('resting-arm',[[-35,-9,44],[-43,-13,42],[-42,-17,31],[-37,-17,28]],[4.4,4.2,3.6,3.4],C.skin,{steps:40});
egg('resting-hand',[-36.5,-17,27.7],[4,3.4,4.5],C.light,{rotation:[0,-20,0]});

// A short substantial drawing tool intersects the hand and ends on the paper.
const penStart=[9,-21,55.5],penEnd=[30,-3.1,46.2],penPose=between(penStart,penEnd);
loft('pen',[[0,0,0,1.2,1.2],[0,0,1,1.6,1.6],[0,0,penPose.length-5,1.6,1.6],[0,0,penPose.length-4.5,1.2,1.2],[0,0,penPose.length-.4,.32,.32]],C.ink,{position:penPose.position,rotation:penPose.rotation,segments:32});
const along=t=>penStart.map((v,i)=>v+(penEnd[i]-v)*t);
taper('pen-ferrule',along(.66),along(.80),[[1.7,1.7],[1.7,1.7]],C.gold);
taper('pen-tip',along(.82),penEnd,[[1.2,1.2],[.14,.14]],C.cream);

// A real trestle with softly rounded rectangular timber and a slim slate board.
taper('easel-left-leg',[16,0,5.6],[25,4,49],[[2.5,2],[1.9,1.8]],C.wood);
taper('easel-right-leg',[57,0,5.6],[49,4,49],[[2.5,2],[1.9,1.8]],C.wood);
taper('easel-back-leg',[43,24,5.6],[37,5,71],[[2.2,1.8],[1.8,1.8]],C.wood);
block('easel-brace',[33,3.5,3],[36,1,17],C.wood,.65);
block('board',[45,3.6,52],[37,0,28],C.slate,.8);
block('paper',[41,1,47.5],[37,-2.1,30.3],C.paper,.22);
block('tray',[49,8,3],[37,-1.6,27],C.wood,.7);
block('clip',[9,4.5,5.2],[37,-1.4,77.2],C.ink,.7);
ellipsoid('clip-rivet',[37,-3.8,79.5],[.85,.25,.85],C.gold,[0,0,0],24);

// Shell pattern curves are embedded in the dome and sampled densely enough to follow its surface.
function shellPoint(x,z,front=false,inset=.18){
  // Rotate the ellipsoidal coordinates around Y, matching the native shell pose.
  const angle=-8*Math.PI/180,xx=x,zz=z,y=(front?-1:1)*(13.7*Math.sqrt(Math.max(0,1-(xx/21.4)**2-(zz/25.2)**2))-inset);
  return [-35+Math.cos(angle)*xx+Math.sin(angle)*zz,y,35-Math.sin(angle)*xx+Math.cos(angle)*zz];
}
const panel=[[-8,-10],[-10,7],[0,16],[10,8],[9,-10],[0,-17]];
function shellLine(id,a,b,front=false){
  const at=t=>shellPoint(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,front);
  const derivative=t=>{const lo=Math.max(0,t-.0001),hi=Math.min(1,t+.0001),p=at(lo),q=at(hi);return q.map((v,k)=>(v-p[k])/(hi-lo));};
  const points=[];
  for(let j=0;j<2;j++){
    const t=j/2,p=at(t),q=at(t+.5),d=derivative(t),e=derivative(t+.5);
    if(j===0)points.push(p);points.push(p.map((v,k)=>v+d[k]/6),q.map((v,k)=>v-e[k]/6),q);
  }
  sweep(id,points,points.map(()=>.3),C.seam,{steps:16,segments:16});
}
for(const front of [false,true]){
  for(let i=0;i<6;i++)shellLine(`shell-${front}-seam-${i}`,panel[i],panel[(i+1)%6],front);
  for(const [i,end] of [[0,[-15,-12]],[1,[-16,10]],[2,[0,21]],[3,[16,10]],[4,[15,-12]],[5,[0,-21]]])shellLine(`shell-${front}-radial-${i}`,panel[i],end,front);
}
// Subtle plastron plate seams, warm instead of black.
for(const z of [23,33,43]){
  const t=(z-33)/19.5,r=Math.sqrt(1-t*t)*(1-.08*t),cx=-20+t;
  const surface=(x,z,inset)=>[x,-15.3-4.8*r*Math.max(0,1-Math.abs((x-cx)/(11.6*r))**2.2)**(1/2.2)+inset,z];
  surfaceStroke(`belly-seam-${z}`,s=>[cx+(s-.5)*17*r,z],.23,'#c8b581',3,surface);
}

let scene=g.applyCommands(g.createScene({name:'TurtlePen artist mascot revision 2',units:'mm'}),commands);
// Reuse the exact accepted mark geometry on the drawing board. No badge/brand file is rewritten.
const approvedPath='artifacts/turtlepen-3d-logo/raised-brand-badge-color.tpf';
const approved=g.deserializeTpf(await readFile(approvedPath,'utf8'));
const markPose=transform({position:[17.6,-2.78,31.2],rotation:[90,0,0],scale:[.46,.46,.18]});
for(const object of approved.objects.filter(o=>o.id!=='backing')){
  scene.objects.push({...object,id:'drawing-'+object.id,matrix:multiply(markPose,object.matrix)});
}
scene=g.deserializeTpf(scene);
const receipts=[];
for(const format of ['tpf','glb']){
  const {bytes:raw,...meta}=g.exportScene(scene,format),bytes=format==='tpf'?Buffer.from(JSON.stringify(scene)+'\n'):raw;
  if(format==='tpf')g.deserializeTpf(bytes.toString());
  const file='mascot.'+format;await writeFile(join(out,file),bytes);
  receipts.push({file,...meta,byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(join(out,'construction.json'),JSON.stringify({name:scene.name,units:'mm',commands,acceptedMark:{file:approvedPath,sha256:createHash('sha256').update(await readFile(approvedPath)).digest('hex'),matrix:markPose}},null,2)+'\n');
await writeFile(join(out,'receipts.json'),JSON.stringify({artifacts:receipts},null,2)+'\n');
console.log(JSON.stringify({out,objects:scene.objects.length,triangles:receipts[0].inspection.triangles,exports:receipts.map(r=>r.file)},null,2));
