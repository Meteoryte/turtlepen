/** Approved-image sculpture recipe. Every visible model part is a native TurtlePen command. */
import {mkdir, writeFile, readFile, copyFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createHash} from 'node:crypto';
import * as g from '../src/core/geometry3d/index.js';

const out = resolve(process.argv[2] || 'artifacts/turtlepen-mascot-v3');
const reference = process.argv[3];
await mkdir(out, {recursive: true});
const C = {skin:'#abd357', head:'#b7da66', shell:'#316850', seam:'#173c35', rim:'#9fbd58', cream:'#ffe9ac', bellyLine:'#baa16c', ink:'#092d49', white:'#fffdf4', slate:'#475d7c', steel:'#d5e2e6', gold:'#c9a45e', green:'#2f7553'};
const commands=[];
const sphere=(id,position,scale,color,rotation=[0,0,0],segments=40)=>commands.push({op:'sphere',id,radius:1,position,scale,color,rotation,segments,shading:'smooth'});
const loft=(id,sections,color,options={})=>commands.push({op:'loft',id,sections,segments:48,color,shading:'smooth',...options});
const sweep=(id,points,radii,color,options={})=>commands.push({op:'sweep',id,points,radii,segments:16,steps:20,color,shading:'smooth',...options});
function egg(id,position,size,color,{pear=0,lean=0,rotation=[0,0,0],exponent=2}={}) {
  const sections=Array.from({length:33},(_,i)=>{
    const a=-Math.PI/2+i*Math.PI/32,t=Math.sin(a),r=i===0||i===32?0:Math.cos(a)*(1-pear*t);
    return [lean*t,0,size[2]*t,size[0]*r,size[1]*r];
  });
  loft(id,sections,color,{position,rotation,exponent});
}
function pose(a,b) {
  const d=b.map((v,i)=>v-a[i]),length=Math.hypot(...d);
  return {position:a,rotation:[0,Math.acos(d[2]/length)*180/Math.PI,Math.atan2(d[1],d[0])*180/Math.PI],length};
}
function block(id,size,position,color,bevel=.8,rotation=[0,0,0]) {
  const [x,y,z]=size,sections=[];
  for(let i=0;i<=4;i++){const a=i*Math.PI/8;sections.push([0,0,bevel*(1-Math.cos(a)),x/2-bevel+bevel*Math.sin(a),y/2-bevel+bevel*Math.sin(a)]);}
  for(let i=0;i<=4;i++){const a=i*Math.PI/8;sections.push([0,0,z-bevel+bevel*Math.sin(a),x/2-bevel+bevel*Math.cos(a),y/2-bevel+bevel*Math.cos(a)]);}
  loft(id,sections,color,{position,rotation,exponent:7});
}
function beam(id,a,b,width,depth,color) {
  const p=pose(a,b);
  block(id,[width,depth,p.length],p.position,color,.65,p.rotation);
}
// Cubic spans fitted to a surface curve keep raised seams attached to the actual form.
function curve(id,at,radius,color,spans=4) {
  const d=t=>{const a=Math.max(0,t-.0001),b=Math.min(1,t+.0001),p=at(a),q=at(b);return q.map((v,i)=>(v-p[i])/(b-a));};
  const points=[];
  for(let i=0;i<spans;i++){
    const a=i/spans,b=(i+1)/spans,p=at(a),q=at(b),u=d(a),v=d(b),h=(b-a)/3;
    if(i===0)points.push(p);
    points.push(p.map((n,k)=>n+u[k]*h),q.map((n,k)=>n-v[k]*h),q);
  }
  sweep(id,points,points.map(()=>radius),color,{steps:10,segments:12});
}

// A closed convex outer carapace wraps behind the torso. Its hidden interior is
// intentionally solid; a body-side edge curve does not fill the side with a flat plate.
const shellOrigin=[-55,16,63], shellAngle=35*Math.PI/180;
const cs=Math.cos(shellAngle),ss=Math.sin(shellAngle);
const shellPoint=(u,v,front=false,inset=.12)=>{
  const depth=(front?-1:1)*(22*Math.sqrt(Math.max(0,1-(u/30)**2-(v/42)**2))-inset);
  return [shellOrigin[0]+cs*u-ss*depth,shellOrigin[1]+ss*u+cs*depth,shellOrigin[2]+v];
};
egg('shell-convex-carapace',shellOrigin,[30,22,42],C.shell,{rotation:[0,0,35]});
curve('shell-body-side-rim',t=>{
  const a=-1.3+2.6*t;
  return shellPoint(19*Math.cos(a),40*Math.sin(a),true,-.1);
},1.0,C.rim,6);
// Scutes follow both exposed sides of the actual convex surface.
const nodes=[[-10,-22],[10,-22],[15,0],[9,23],[-9,23],[-15,0]];
for(const front of [false,true]) {
for(let i=0;i<nodes.length;i++) {
  const a=nodes[i],b=nodes[(i+1)%nodes.length];
  curve('shell-'+front+'-central-seam-'+i,t=>shellPoint(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,front),.47,C.seam,3);
}
for(const [i,end] of [[0,[-19,-29]],[1,[19,-29]],[2,[26,0]],[3,[17,32]],[4,[-17,32]],[5,[-26,0]]]) {
  const a=nodes[i];
  curve('shell-'+front+'-radial-seam-'+i,t=>shellPoint(a[0]+(end[0]-a[0])*t,a[1]+(end[1]-a[1])*t,front),.43,C.seam,3);
}
}

egg('body',[-43,-2,58],[19,14.5,31],C.skin,{pear:.07,lean:1.5,rotation:[0,0,18]});
const bellyCenter=[-39,-14.3,57],bx=16,by=5.6,bz=27;
egg('plastron',bellyCenter,[bx,by,bz],C.cream,{pear:.06,lean:1,exponent:2.2});
for(const z of [42,57,72]) {
  const t=(z-bellyCenter[2])/bz,r=Math.sqrt(1-t*t)*(1-.06*t),cx=bellyCenter[0]+t;
  curve('belly-plate-seam-'+z,s=>{
    const x=cx+(s-.5)*26*r;
    const y=bellyCenter[1]-by*r*Math.max(0,1-Math.abs((x-cx)/(bx*r))**2.2)**(1/2.2)+.12;
    return [x,y,z-.7*Math.sin(Math.PI*s)];
  },.3,C.bellyLine,4);
}

// Both feet have exactly three named toe volumes, embedded in a continuous instep.
for(const [side,x,y,angle] of [['near',-56,-5,-7],['far',-27,-3,8]]) {
  egg(side+'-leg',[x+1,y+2,24],[8.8,9.3,18],C.skin,{lean:1,rotation:[0,0,angle]});
  egg(side+'-foot-instep',[x,y-1,6.4],[10.2,10.8,6.4],C.skin,{exponent:2.5,rotation:[0,0,angle]});
  for(let i=0;i<3;i++) {
    const u=(i-1)*6.3,v=-11.8,theta=angle*Math.PI/180;
    const p=[x+Math.cos(theta)*u-Math.sin(theta)*v,y+Math.sin(theta)*u+Math.cos(theta)*v,4.6];
    egg(side+'-toe-'+(i+1),p,[3.9,7.5,4.6],C.skin,{exponent:2.15,rotation:[0,0,angle]});
  }
}
sweep('neck',[[-43,-2,80],[-43,-1,88],[-37,-2,93],[-36,-2,99]],[10,10,9.2,10],C.skin,{segments:24,steps:32});
const head=[];
for(let i=0;i<=48;i++) {
  const a=-Math.PI/2+i*Math.PI/48,t=Math.sin(a),r=i===0||i===48?0:Math.cos(a)*(1-.055*t);
  head.push([-37-2*t,-2-2*Math.max(0,-t),115+28*t,26*r,20*r]);
}
loft('head',head,C.head,{segments:64,exponent:2.15});
function faceY(x,z) {
  let k=head.findIndex(s=>s[2]>=z)-1;k=Math.max(0,Math.min(head.length-2,k));
  const a=head[k],b=head[k+1],t=(z-a[2])/(b[2]-a[2]),s=a.map((v,i)=>v+(b[i]-v)*t);
  return s[1]-s[4]*Math.max(0,1-Math.abs((x-s[0])/s[3])**2.15)**(1/2.15);
}
const face=(x,z,inset=.08)=>[x,faceY(x,z)+inset,z];
for(const [side,x,z,rx,rz,theta] of [['near',-47,124,7.4,9.2,-18],['far',-25.5,124.8,6.5,8.2,22]]) {
  const base=[x,faceY(x,z)+.65,z],a=theta*Math.PI/180,n=[Math.sin(a),-Math.cos(a),0];
  const point=(distance,dx=0,dz=0)=>base.map((v,i)=>v+n[i]*distance+(i===0?dx:i===2?dz:0));
  sphere(side+'-eye-outline',point(0),[rx+.55,2.1,rz+.55],C.ink,[0,0,theta]);
  sphere(side+'-eye-white',point(.8),[rx,2.1,rz],C.white,[0,0,theta]);
  sphere(side+'-pupil',point(2.55,.45,-.15),[3.55,.8,4.85],C.ink,[0,0,theta]);
  sphere(side+'-eye-highlight',point(3.27,1.25,2.1),[1.0,.3,1.4],C.white,[0,0,theta],24);
}
curve('eyebrow',t=>face(-52+12*t,135+1.4*Math.sin(Math.PI*t)),.68,C.ink,3);
curve('smile',t=>face(-47+29*t,110-1.0*t-6.2*Math.sin(Math.PI*t)),.59,C.ink,6);
curve('smile-corner',t=>face(-48.2+2.3*t,109.1+1.15*Math.sin(Math.PI*t)),.59,C.ink,2);
for(const [id,x,z] of [['near',-21,113],['far',-15.3,113.2]]) sphere(id+'-nostril',face(x,z,-.05),[.9,.55,1.3],C.ink,[0,0,20],24);

// Swept continuous limbs and compact three-digit hands.
sweep('resting-arm',[[-54,-6,76],[-66,-12,67],[-67,-16,48],[-61,-17,41]],[6.2,6.5,5,4.5],C.skin,{segments:24,steps:40});
egg('resting-palm',[-60.5,-17.2,40.5],[5.8,4.8,7],C.skin,{rotation:[0,-16,0]});
for(let i=0;i<3;i++) egg('resting-finger-'+(i+1),[-64+i*3.1,-19,36.5+(i===2?1.6:0)],[2.2,3.7,4],C.skin);
sweep('drawing-arm',[[-35,-2,77],[-4,-16,53],[8,-22,67],[26,-12,84]],[6.5,6.0,4.9,4.6],C.skin,{segments:32,steps:48});
egg('drawing-palm',[28,-10,86],[6,4.5,6.6],C.skin,{rotation:[0,25,15]});
sweep('gripping-fingers',[[29,-14,88],[36,-14,88],[35,-6,82],[29,-6,83]],[2.5,2.6,2.3,2.2],C.skin,{segments:20});
egg('gripping-thumb',[26,-14,90],[3.8,3,4.4],C.head,{rotation:[0,-30,0]});

const penStart=[12,-21,96],penEnd=[51,10.25,77],p=pose(penStart,penEnd),tipLength=9;
loft('pen-barrel',[[0,0,0,1.5,1.5],[0,0,1.4,2.1,2.1],[0,0,p.length-tipLength-2,2.1,2.1],[0,0,p.length-tipLength,1.55,1.55]],C.ink,{position:p.position,rotation:p.rotation,segments:32});
const along=d=>penStart.map((v,i)=>v+(penEnd[i]-v)*d/p.length);
loft('pen-gold-band',[[0,0,0,2.18,2.18],[0,0,1.5,2.18,2.18]],C.gold,{position:along(p.length-tipLength-4),rotation:p.rotation,segments:32});
loft('fountain-nib',[[0,0,0,1.7,.72],[0,0,2.7,3.2,.72],[0,0,5.9,1.6,.6],[0,0,tipLength,0,0]],C.steel,{position:along(p.length-tipLength),rotation:p.rotation,segments:24,exponent:5});

// Slate-blue easel and a genuinely extruded green drawing on the paper.
beam('easel-left-leg',[32,15,.7],[48,19,75],7,6,C.slate);
beam('easel-right-leg',[104,15,.7],[86,19,75],7,6,C.slate);
beam('easel-back-leg',[72,46,.7],[69,18,126],6,5,C.slate);
block('easel-cross-brace',[56,5,5],[68,15,17],C.slate,.7);
block('board',[68,4.5,83],[69,14,45],C.ink,.9);
block('paper',[63.5,1.1,77.5],[69,11.05,48],C.white,.3);
block('easel-tray',[76,10,5],[69,10,43],C.slate,.8);
block('clip-stem',[9,4,11],[69,13,126],C.slate,.65);
block('clip-back',[22,4,9],[69,9.3,122],C.ink,.7);
block('clip-face',[19.5,1,6.5],[69,6.85,123],C.slate,.25);
sweep('drawn-curve',[[51,10.31,77],[72,10.31,74],[89,10.31,89],[94,10.31,107]],[.66,.66,.66,.66],C.green,{segments:16,steps:48});
sweep('drawn-arrow',[[89.7,10.31,103.5],[92,10.31,109],[94,10.31,110],[98,10.31,106.5]],[.7,.7,.7,.7],C.green,{segments:16,steps:24});

const recipe={name:'TurtlePen approved artist mascot — three-toe revision',units:'mm',commands};
const scene=g.applyCommands(g.createScene({name:recipe.name,units:recipe.units}),commands);
const inspection=g.inspectScene(scene);
if(inspection.parts.some(p=>!p.manifold || !p.outward || p.degenerateFaces)) throw new Error('Invalid native part topology');
const toes=scene.objects.filter(o=>/^(near|far)-toe-[123]$/.test(o.id)).map(o=>o.id);
if(toes.length!==6)throw new Error('Exactly six toe volumes are required');
await writeFile(join(out,'recipe.json'),JSON.stringify(recipe)+'\n');
await writeFile(join(out,'preflight-inspection.json'),JSON.stringify(inspection,null,2)+'\n');
const design={reference:'approved-reference.png',nativeAuthoring:'TurtlePen geometry3d commands; no downstream sculpting',toeCount:{near:3,far:3},toeObjects:toes,shell:{center:shellOrigin,backwardDirection:[-ss,cs,0],outerRadiiMm:[30,22,42],interior:'Solid outer-carapace approximation, overlapping the body; no hollow wall claim'},sourceInterpretation:'Editable sculpted interpretation of the user-approved 2D image; hidden surfaces authored explicitly',fabrication:'overlapping colored assembly, not a fused print-ready solid'};
if(reference){await copyFile(reference,join(out,'approved-reference.png'));design.referenceSha256=createHash('sha256').update(await readFile(reference)).digest('hex');}
await writeFile(join(out,'design-receipt.json'),JSON.stringify(design,null,2)+'\n');
console.log(JSON.stringify({out,commands:commands.length,objects:scene.objects.length,triangles:inspection.triangles,bounds:inspection.bounds,toes}));
