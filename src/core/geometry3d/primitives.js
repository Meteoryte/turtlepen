import {number,vector,bounds} from './math.js';
import {cellMesh,transformed,assertMesh} from './mesh.js';
import {sweep,loft} from './curves.js';
export function segments(n=32){if(!Number.isInteger(n)||n<8||n>128)throw new RangeError('segments must be an integer from 8 to 128');return n;}
export function box(size){vector(size,'size',true);return cellMesh([0,size[0]],[0,size[1]],[0,size[2]],new Set(['0,0,0']));}
const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const on=(a,b,p)=>Math.abs(orient(a,b,p))<1e-12&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);
function crosses(a,b,c,d){const x=orient(a,b,c),y=orient(a,b,d),u=orient(c,d,a),v=orient(c,d,b);return (x*y<0&&u*v<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
export function profile(input){
 if(!Array.isArray(input)||input.length<3||input.length>512)throw new RangeError('polygon needs 3-512 points');
 const points=input.map(p=>{if(!Array.isArray(p)||p.length!==2)throw new TypeError('polygon point must be [x,y]');return p.map(n=>number(n,'polygon coordinate'));});
 if(points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1])points.pop();
 if(points.length<3||new Set(points.map(p=>p.join(','))).size!==points.length)throw new Error('polygon has duplicate or insufficient points');
 for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
  if(j===i+1||(i===0&&j===points.length-1))continue;
  if(crosses(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length]))throw new Error('polygon self-intersects');
 }
 // Collinear vertices are redundant; removing them avoids zero-area ears.
 let changed=true;while(changed&&points.length>3){changed=false;for(let i=0;i<points.length;i++)if(Math.abs(orient(points[(i+points.length-1)%points.length],points[i],points[(i+1)%points.length]))<1e-12){points.splice(i,1);changed=true;break;}}
 const area=points.reduce((s,p,i)=>s+p[0]*points[(i+1)%points.length][1]-p[1]*points[(i+1)%points.length][0],0)/2;
 if(Math.abs(area)<1e-12)throw new Error('polygon has zero area');if(area<0)points.reverse();return points;
}
export function circle(radius,n=32){number(radius,'radius',{positive:true});segments(n);return Array.from({length:n},(_,i)=>[radius*Math.cos(2*Math.PI*i/n),radius*Math.sin(2*Math.PI*i/n)]);}
function triangulate(points){
 const pending=points.map((_,i)=>i),faces=[];
 while(pending.length>3){let found=false;
  for(let i=0;i<pending.length;i++){
   const a=pending[(i+pending.length-1)%pending.length],b=pending[i],c=pending[(i+1)%pending.length];
   if(orient(points[a],points[b],points[c])<=1e-12)continue;
   if(pending.some(v=>v!==a&&v!==b&&v!==c&&orient(points[a],points[b],points[v])>=-1e-12&&orient(points[b],points[c],points[v])>=-1e-12&&orient(points[c],points[a],points[v])>=-1e-12))continue;
   faces.push([a,b,c]);pending.splice(i,1);found=true;break;
  }
  if(!found)throw new Error('polygon cannot be triangulated without degeneracy');
 }
 faces.push([...pending]);return faces;
}
export function extrude(input,height){
 number(height,'height',{positive:true});const points=profile(input),n=points.length;
 const vertices=[...points.map(([x,y])=>[x,y,0]),...points.map(([x,y])=>[x,y,height])],faces=[];
 for(const [a,b,c] of triangulate(points)){faces.push([c,b,a],[a+n,b+n,c+n]);}
 for(let i=0;i<n;i++){const j=(i+1)%n;faces.push([i,j,j+n],[i,j+n,i+n]);}
 return {vertices,faces};
}
export function sphere(radius,n=32){
 number(radius,'radius',{positive:true});segments(n);const rings=Math.floor(n/2),vertices=[[0,0,radius]],faces=[];
 for(let j=1;j<rings;j++){const phi=Math.PI*j/rings;for(let i=0;i<n;i++){const theta=2*Math.PI*i/n;vertices.push([radius*Math.sin(phi)*Math.cos(theta),radius*Math.sin(phi)*Math.sin(theta),radius*Math.cos(phi)]);}}
 const south=vertices.length;vertices.push([0,0,-radius]);
 for(let i=0;i<n;i++){const j=(i+1)%n;faces.push([0,1+i,1+j]);for(let k=0;k<rings-2;k++){const a=1+k*n+i,b=1+k*n+j,c=a+n,d=b+n;faces.push([a,c,b],[b,c,d]);}const a=1+(rings-2)*n+i,b=1+(rings-2)*n+j;faces.push([a,south,b]);}
 return {vertices,faces};
}
export function primitive(object){
 switch(object.kind){
  case 'box':return box(object.size);
  case 'sphere':return sphere(object.radius,object.segments);
  case 'cylinder':return extrude(circle(object.radius,object.segments),object.height);
  case 'extrusion':return extrude(object.points,object.height);
  case 'sweep':return sweep(object);
  case 'loft':return loft(object);
  case 'mesh':return assertMesh({vertices:object.vertices,faces:object.faces});
  default:throw new Error(`unsupported solid kind ${object.kind}`);
 }
}
export function orthogonalBoolean(objects,operation){
 if(!['union','subtract','intersect'].includes(operation))throw new Error('boolean operation must be union, subtract, or intersect');
 if(objects.length<2||objects.length>32)throw new RangeError('boolean needs 2-32 axis-aligned boxes');
 const boxes=objects.map(o=>{
  if(o.kind!=='box')throw new Error('boolean currently supports axis-aligned boxes only');
  const m=transformed(box(o.size),o.matrix),b=bounds(m.vertices);
  if(m.vertices.some(p=>p.some((v,i)=>Math.min(Math.abs(v-b.min[i]),Math.abs(v-b.max[i]))>1e-9)))throw new Error('boolean currently supports axis-aligned boxes only');
  return b;
 });
 const axes=[0,1,2].map(i=>[...new Set(boxes.flatMap(b=>[b.min[i],b.max[i]]))].sort((a,b)=>a-b));
 if(axes.reduce((n,a)=>n*(a.length-1),1)>32768)throw new RangeError('boolean exceeds 32768 partition-cell budget');
 const [xs,ys,zs]=axes,occupied=new Set();
 for(let x=0;x<xs.length-1;x++)for(let y=0;y<ys.length-1;y++)for(let z=0;z<zs.length-1;z++){
  const p=[(xs[x]+xs[x+1])/2,(ys[y]+ys[y+1])/2,(zs[z]+zs[z+1])/2],inside=boxes.map(b=>p.every((n,i)=>n>b.min[i]&&n<b.max[i]));
  if(operation==='union'?inside.some(Boolean):operation==='intersect'?inside.every(Boolean):inside[0]&&!inside.slice(1).some(Boolean))occupied.add(`${x},${y},${z}`);
 }
 if(!occupied.size)throw new Error('boolean result is empty');return cellMesh(xs,ys,zs,occupied);
}
