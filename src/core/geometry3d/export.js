import {sub,cross,length,bounds,clean} from './math.js';
import {inspectMesh} from './mesh.js';
import {UNIT_METERS,serializeTpf,inspectScene,sceneParts} from './scene.js';

function converted(mesh,convert){
 const result={vertices:mesh.vertices.map(p=>convert(p).map(Math.fround)),faces:mesh.faces};
 const check=inspectMesh(result);if(!check.manifold||!check.outward)throw new Error('export would produce invalid topology at float32 precision; reduce coordinates or increase feature size');return result;
}
function normal(a,b,c){const v=cross(sub(b,a),sub(c,a)),n=length(v);return v.map(x=>x/n);}
function stl(parts,factor){
 const meshes=parts.map(p=>converted(p.mesh,v=>v.map(n=>n*factor)));
 const count=meshes.reduce((n,m)=>n+m.faces.length,0),bytes=Buffer.alloc(84+count*50);
 bytes.write('TurtlePen binary STL; units=millimeters; right-handed Z-up',0,'ascii');bytes.writeUInt32LE(count,80);let offset=84;
 for(const m of meshes)for(const face of m.faces){const points=face.map(i=>m.vertices[i]);for(const n of [...normal(...points),...points.flat()]){bytes.writeFloatLE(n,offset);offset+=4;}offset+=2;}
 return bytes;
}
function glb(parts,factor,scene){
 const json={asset:{version:'2.0',generator:'TurtlePen',extras:{sourceUnits:scene.units,sourceCoordinateSystem:scene.coordinateSystem}},scene:0,scenes:[{name:scene.name,nodes:[]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[{byteLength:0}]},chunks=[];let byteLength=0;
 const attribute=(values,minmax)=>{
  const buffer=Buffer.alloc(values.length*12);let cursor=0;for(const v of values)for(const n of v){buffer.writeFloatLE(n,cursor);cursor+=4;}
  const view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:buffer.length,target:34962});chunks.push(buffer);byteLength+=buffer.length;
  const index=json.accessors.length;json.accessors.push({bufferView:view,componentType:5126,count:values.length,type:'VEC3',...(minmax||{})});return index;
 };
 for(const part of parts){
  const mesh=converted(part.mesh,([x,y,z])=>[x*factor,z*factor,-y*factor]),positions=[],normals=[];
  let smooth;
  if(part.shading==='smooth') {
   smooth=mesh.vertices.map(()=>[0,0,0]);
   for(const f of mesh.faces){const [a,b,c]=f.map(i=>mesh.vertices[i]),n=cross(sub(b,a),sub(c,a));for(const i of f)for(let k=0;k<3;k++)smooth[i][k]+=n[k];}
   smooth=smooth.map(n=>{const size=length(n);if(size<1e-25)throw new Error('smooth shading has a cancelling vertex normal');return n.map(v=>v/size);});
  }
  for(const f of mesh.faces){const points=f.map(i=>mesh.vertices[i]),n=normal(...points);for(let i=0;i<3;i++){positions.push(points[i]);normals.push(smooth?smooth[f[i]]:n);}}
  const b=bounds(positions),position=attribute(positions,{min:b.min.map(clean),max:b.max.map(clean)}),norm=attribute(normals);
  const color=part.color||'#49aa78',rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  const material=json.materials.length;json.materials.push({name:part.id,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:0,roughnessFactor:.65}});
  const index=json.meshes.length;json.meshes.push({name:part.id,primitives:[{attributes:{POSITION:position,NORMAL:norm},material,mode:4}]});json.nodes.push({name:part.id,mesh:index});json.scenes[0].nodes.push(index);
 }
 json.buffers[0].byteLength=byteLength;
 const raw=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(raw.length/4)*4,0x20);raw.copy(padded);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+byteLength,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(byteLength,0);binHeader.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,padded,binHeader,...chunks]);
}
export function exportScene(scene,format='tpf'){
 if(!['tpf','stl','glb'].includes(format))throw new Error('format must be tpf, stl, or glb');
 const inspection=inspectScene(scene);
 if(format==='tpf')return {bytes:Buffer.from(serializeTpf(scene)),format,units:scene.units,mimeType:'application/json',inspection};
 if(!inspection.parts.length||inspection.parts.some(p=>!p.manifold||!p.outward))throw new Error('export requires closed outward solid geometry');
 if(format==='stl'&&!inspection.solidReady)throw new Error('STL requires closed outward solids with no unresolved part overlap or contact');
 const parts=sceneParts(scene),factor=UNIT_METERS[scene.units];
 return {bytes:format==='stl'?stl(parts,factor*1000):glb(parts,factor,scene),format,units:format==='stl'?'mm':'m',mimeType:format==='stl'?'model/stl':'model/gltf-binary',inspection};
}
