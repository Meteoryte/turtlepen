import {sub,cross,dot,length,bounds,point,determinant,number} from './math.js';
export const MAX_VERTICES=200000,MAX_TRIANGLES=300000;
export function assertMesh(mesh){
 if(!mesh||!Array.isArray(mesh.vertices)||!Array.isArray(mesh.faces)||mesh.vertices.length>MAX_VERTICES||mesh.faces.length>MAX_TRIANGLES)throw new RangeError('mesh exceeds vertex/triangle budget or is malformed');
 for(const p of mesh.vertices){if(!Array.isArray(p)||p.length!==3)throw new TypeError('mesh vertex must have three coordinates');p.forEach(n=>number(n,'mesh vertex'));}
 for(const f of mesh.faces)if(!Array.isArray(f)||f.length!==3||f.some(n=>!Number.isInteger(n)||n<0||n>=mesh.vertices.length))throw new TypeError('mesh triangle has an invalid vertex index');
 return mesh;
}
export function weld(mesh){
 assertMesh(mesh);const vertices=[],lookup=new Map(),remap=[];
 for(const p of mesh.vertices){const key=p.map(n=>Object.is(n,-0)?0:n).join(',');if(!lookup.has(key)){lookup.set(key,vertices.length);vertices.push(p);}remap.push(lookup.get(key));}
 return {vertices,faces:mesh.faces.map(f=>f.map(i=>remap[i]))};
}
export function merge(meshes){
 const vertices=[],faces=[];for(const m of meshes){const offset=vertices.length;for(const p of m.vertices)vertices.push(p);for(const f of m.faces)faces.push(f.map(i=>i+offset));if(vertices.length>MAX_VERTICES||faces.length>MAX_TRIANGLES)throw new RangeError('combined mesh exceeds budget');}
 return weld({vertices,faces});
}
export function transformed(mesh,matrix){
 const flip=determinant(matrix)<0;
 return assertMesh({vertices:mesh.vertices.map(p=>point(matrix,p)),faces:mesh.faces.map(f=>flip?[f[0],f[2],f[1]]:[...f])});
}
/** Component orientation includes cavities: nesting alternates outward/inward shells. */
function shellOrientation(mesh){
 const parents=mesh.faces.map((_,i)=>i),owners=new Map();
 const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
 mesh.faces.forEach((face,i)=>{for(const v of face){if(owners.has(v))parents[root(i)]=root(owners.get(v));else owners.set(v,i);}});
 const shells=new Map();mesh.faces.forEach((face,i)=>{const key=root(i);if(!shells.has(key))shells.set(key,[]);shells.get(key).push(face);});
 // Bound the nesting work, including deliberately fragmented imported meshes.
 if(shells.size>128)return {shells:shells.size,orientationChecked:false,misorientedShells:null,oriented:false};
 const parts=[...shells.values()].map(faces=>{
  const origin=mesh.vertices[faces[0][0]],points=[],volume=faces.reduce((sum,face)=>{
   const [a,b,c]=face.map(i=>mesh.vertices[i]);points.push(a,b,c);return sum+dot(sub(a,origin),cross(sub(b,origin),sub(c,origin)))/6;
  },0);
  return {faces,origin,volume,bounds:bounds(points)};
 });
 const contains=(part,p)=>{
  if(p.some((n,i)=>n<part.bounds.min[i]||n>part.bounds.max[i]))return false;
  // An oblique ray avoids common grid diagonals; coincident triangle hits count once.
  const direction=[1,.3713906763541037,.529113398743],hits=[];
  for(const f of part.faces){
   const [a,b,c]=f.map(i=>mesh.vertices[i]),e1=sub(b,a),e2=sub(c,a),h=cross(direction,e2),det=dot(e1,h);
   if(Math.abs(det)<1e-20)continue;
   const s=sub(p,a),u=dot(s,h)/det;if(u<0||u>1)continue;
   const q=cross(s,e1),v=dot(direction,q)/det;if(v<0||u+v>1)continue;
   const t=dot(e2,q)/det;if(t>0)hits.push(t);
  }
  hits.sort((a,b)=>a-b);return hits.filter((t,i)=>i===0||Math.abs(t-hits[i-1])>1e-10*Math.max(1,Math.abs(t))).length%2===1;
 };
 let misorientedShells=0;
 for(const part of parts){const depth=parts.filter(other=>other!==part&&contains(other,part.origin)).length;if(part.volume===0||(part.volume>0)!==(depth%2===0))misorientedShells++;}
 return {shells:parts.length,orientationChecked:true,misorientedShells,oriented:parts.length>0&&!misorientedShells};
}
export function inspectMesh(input){
 const mesh=weld(input),edges=new Map(),fans=new Map();let degenerateFaces=0,volume=0;
 // Volume relative to a nearby reference avoids translation-induced cancellation.
 const origin=mesh.vertices[0]||[0,0,0];
 for(const f of mesh.faces){
  const [a,b,c]=f.map(i=>mesh.vertices[i]);const normal=cross(sub(b,a),sub(c,a));
  if(new Set(f).size!==3||length(normal)<1e-16)degenerateFaces++;
  volume+=dot(sub(a,origin),cross(sub(b,origin),sub(c,origin)))/6;
  for(let j=0;j<3;j++){
   const u=f[j],v=f[(j+1)%3],key=u<v?`${u},${v}`:`${v},${u}`;
   const edge=edges.get(key)||{count:0,balance:0};edge.count++;edge.balance+=u<v?1:-1;edges.set(key,edge);
   if(!fans.has(u))fans.set(u,new Map());const fan=fans.get(u),w=f[(j+2)%3];
   if(!fan.has(v))fan.set(v,new Set());if(!fan.has(w))fan.set(w,new Set());fan.get(v).add(w);fan.get(w).add(v);
  }
 }
 let openEdges=0,nonManifoldEdges=0,inconsistentEdges=0,nonManifoldVertices=0;
 for(const e of edges.values()){if(e.count===1)openEdges++;if(e.count>2)nonManifoldEdges++;if(e.count===2&&e.balance!==0)inconsistentEdges++;}
 for(const fan of fans.values()){
  const seen=new Set(),queue=[fan.keys().next().value];while(queue.length){const i=queue.pop();if(seen.has(i))continue;seen.add(i);for(const n of fan.get(i)||[])queue.push(n);}
  if(seen.size!==fan.size||[...fan.values()].some(n=>n.size!==2))nonManifoldVertices++;
 }
 const manifold=mesh.faces.length>0&&!openEdges&&!nonManifoldEdges&&!inconsistentEdges&&!nonManifoldVertices&&!degenerateFaces;
 const {oriented,...orientation}=shellOrientation(mesh);
 return {vertices:mesh.vertices.length,triangles:mesh.faces.length,bounds:bounds(mesh.vertices),volume,
  manifold,outward:manifold&&volume>0&&oriented,openEdges,nonManifoldEdges,inconsistentEdges,nonManifoldVertices,degenerateFaces,...orientation};
}
/** Boundary of occupied grid cells, with matching subdivisions on every adjacent face. */
export function cellMesh(xs,ys,zs,occupied){
 const vertices=[],faces=[],indices=new Map();
 const vertex=p=>{const key=p.join(',');if(!indices.has(key)){indices.set(key,vertices.length);vertices.push(p);}return indices.get(key);};
 const quad=ps=>{const [a,b,c,d]=ps.map(vertex);faces.push([a,b,c],[a,c,d]);};
 const has=(x,y,z)=>occupied.has(`${x},${y},${z}`);
 for(const key of occupied){
  const [x,y,z]=key.split(',').map(Number),a=xs[x],b=xs[x+1],c=ys[y],d=ys[y+1],e=zs[z],f=zs[z+1];
  if(!has(x-1,y,z))quad([[a,c,e],[a,c,f],[a,d,f],[a,d,e]]);
  if(!has(x+1,y,z))quad([[b,c,e],[b,d,e],[b,d,f],[b,c,f]]);
  if(!has(x,y-1,z))quad([[a,c,e],[b,c,e],[b,c,f],[a,c,f]]);
  if(!has(x,y+1,z))quad([[a,d,e],[a,d,f],[b,d,f],[b,d,e]]);
  if(!has(x,y,z-1))quad([[a,c,e],[a,d,e],[b,d,e],[b,c,e]]);
  if(!has(x,y,z+1))quad([[a,c,f],[b,c,f],[b,d,f],[a,d,f]]);
 }
 return assertMesh({vertices,faces});
}
