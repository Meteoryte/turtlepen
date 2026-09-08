import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/core/geometry3d/index.js';

const build = commands => g.applyCommands(g.createScene({name:'test',units:'mm'}),commands);
const near = (a,b,e=1e-6) => assert.ok(Math.abs(a-b)<e,`${a} differs from ${b}`);

test('box is a closed outward solid with analytic bounds and volume',()=>{
 const s=build([{op:'box',id:'block',size:[10,20,30]}]);
 const r=g.inspectScene(s);assert.equal(r.manifold,true);near(r.volume,6000);
 assert.deepEqual(r.bounds,{min:[0,0,0],max:[10,20,30]});assert.equal(r.triangles,12);
});
test('curved primitives produce watertight meshes and converge to analytic volume',()=>{
 for(const command of [{op:'sphere',radius:10,segments:64},{op:'cylinder',radius:10,height:20,segments:64}]){
  const r=g.inspectScene(build([{...command,id:'curved'}]));assert.equal(r.manifold,true);
  const expected=command.op==='sphere'?4*Math.PI*1000/3:Math.PI*100*20;
  assert.ok(r.volume>expected*.98 && r.volume<=expected*1.000001);
 }
});
test('concave polygon extrusion preserves concavity and winding',()=>{
 const polygon=[[0,0],[8,0],[8,2],[2,2],[2,8],[0,8]];
 for(const points of [polygon,[...polygon].reverse()]){
  const r=g.inspectScene(build([{op:'extrude',id:'L',points,height:3}]));
  assert.equal(r.manifold,true);near(r.volume,84);
 }
 const r=g.inspectScene(build([{op:'extrude',id:'round',radius:4,height:10,segments:64}]));
 assert.equal(r.manifold,true);assert.ok(r.volume>Math.PI*160*.99);
});
test('scene transactions reject malformed profiles, unsupported inputs and excessive detail atomically',()=>{
 const s=build([{op:'box',id:'keep',size:[1,1,1]}]);const before=g.serializeTpf(s);
 for(const command of [
  {op:'box',id:'bad',size:[0,1,1]}, {op:'sphere',id:'bad',radius:2,segments:1000000},
  {op:'extrude',id:'bad',points:[[0,0],[2,2],[0,2],[2,0]],height:1},
  {op:'transform',id:'keep',scale:[0,1,1]}, {op:'wat',id:'bad'},
  {op:'box',id:'keep',size:[2,2,2]}, {op:'box',id:'bad',size:[1,1,1],surprise:true}
 ]){assert.throws(()=>g.applyCommands(s,[{op:'box',id:'temporary',size:[1,1,1]},command]));assert.equal(g.serializeTpf(s),before);}
});
test('flat groups transform members once and mirrored scaling retains outward orientation',()=>{
 const s=build([{op:'box',id:'a',size:[2,3,4]},{op:'box',id:'b',size:[1,1,1],position:[5,0,0]},
  {op:'group',id:'pair',members:['a','b']},{op:'transform',id:'pair',rotation:[0,0,90],position:[10,0,2]},
  {op:'transform',id:'a',scale:[-1,1,1]}]);
 const r=g.inspectScene(s);assert.equal(r.manifold,true);near(r.volume,25);
 assert.throws(()=>g.applyCommands(s,[{op:'group',id:'other',members:['a']}]));
});
test('orthogonal booleans produce one joined boundary and correct subtraction/intersection volume',()=>{
 for(const [operation,volume] of [['union',1500],['subtract',500],['intersect',500]]){
  const s=build([{op:'box',id:'a',size:[10,10,10]}, {op:'box',id:'b',size:[10,10,10],position:[5,0,0]},
   {op:'boolean',id:'result',operation,ids:['a','b']}]);
  const r=g.inspectScene(s);assert.equal(s.objects.length,1);assert.equal(r.manifold,true);near(r.volume,volume);
 }
 const joined=build([{op:'box',id:'a',size:[10,10,10]},{op:'box',id:'b',size:[5,5,5],position:[2,2,10]},
  {op:'boolean',id:'joined',operation:'union',ids:['a','b']}]);
 assert.equal(g.inspectScene(joined).manifold,true);near(g.inspectScene(joined).volume,1125);
 assert.throws(()=>build([{op:'sphere',id:'a',radius:5},{op:'box',id:'b',size:[1,1,1]},
  {op:'boolean',id:'bad',operation:'union',ids:['a','b']}]),/axis.aligned boxes/i);
});
test('overlapping assemblies cannot be mislabeled as printable STL',()=>{
 const s=build([{op:'box',id:'a',size:[10,10,10]},{op:'box',id:'b',size:[10,10,10],position:[5,0,0]}]);
 assert.equal(g.inspectScene(s).solidReady,false);assert.throws(()=>g.exportScene(s,'stl'),/overlap|solid/i);
 assert.ok(g.exportScene(s,'glb').bytes.length>0);
});
test('TPF round trips are deterministic, strict and do not accept nonfinite or unknown data',()=>{
 const s=build([{op:'cylinder',id:'part',radius:2,height:5,segments:12}]);
 assert.equal(g.serializeTpf(g.deserializeTpf(g.serializeTpf(s))),g.serializeTpf(s));
 assert.throws(()=>g.deserializeTpf('{"format":"turtlepen-geometry","version":900}'));
 assert.throws(()=>g.deserializeTpf({...s,extra:true}));
 for(const key of ['units','name']){const missing=structuredClone(s);delete missing[key];assert.throws(()=>g.deserializeTpf(missing));}
 const bad=structuredClone(s);bad.objects[0].matrix[0]=Infinity;assert.throws(()=>g.deserializeTpf(bad));
});
test('binary STL emits millimeters and deterministic outward triangle records',()=>{
 const s=g.applyCommands(g.createScene({units:'in'}),[{op:'box',id:'inch',size:[1,1,1]}]);
 const a=g.exportScene(s,'stl'),b=g.exportScene(s,'stl');assert.deepEqual(a.bytes,b.bytes);
 const bytes=Buffer.from(a.bytes);assert.equal(bytes.readUInt32LE(80),12);assert.equal(bytes.length,84+12*50);
 const coords=[];for(let i=0;i<12;i++)for(let j=0;j<9;j++)coords.push(bytes.readFloatLE(84+i*50+12+j*4));
 near(Math.max(...coords),25.4,1e-4);assert.equal(a.units,'mm');
});
test('GLB uses glTF 2.0 aligned chunks, meters and right-handed Y-up coordinates',()=>{
 const s=build([{op:'box',id:'box',size:[10,20,30],color:'#808080'}]);const bytes=Buffer.from(g.exportScene(s,'glb').bytes);
 assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
 const length=bytes.readUInt32LE(12);assert.equal(length%4,0);assert.equal(bytes.readUInt32LE(16),0x4e4f534a);
 const json=JSON.parse(bytes.subarray(20,20+length).toString());assert.equal(json.asset.version,'2.0');
 near(json.materials[0].pbrMetallicRoughness.baseColorFactor[0],.21586050011389926);
 json.accessors[0].min.forEach((n,i)=>near(n,[0,0,-.02][i]));json.accessors[0].max.forEach((n,i)=>near(n,[.01,.03,0][i]));
 assert.equal(bytes.readUInt32LE(24+length),0x004e4942);
});

test('named profiles, transforms and groups survive TPF and produce physical extrusions',()=>{
 const scene=build([{op:'circle',id:'ring',radius:3,position:[8,0,2]}, {op:'extrude',id:'cylinder',profile:'ring',height:5}]);
 const r=g.inspectScene(g.deserializeTpf(g.serializeTpf(scene)));assert.equal(r.profiles,1);assert.equal(r.manifold,true);
 assert.deepEqual(r.bounds,{min:[5,-3,2],max:[11,3,7]});
 assert.throws(()=>g.applyCommands(scene,[{op:'extrude',id:'ambiguous',profile:'ring',points:[[0,0],[1,0],[0,1]],height:1}]));
});
test('mesh defects and corner-only unions are reported and cannot escape through STL',()=>{
 const good=build([{op:'box',id:'box',size:[1,1,1]}]),mesh=g.compileScene(good);
 const raw=()=>({...g.createScene(),objects:[{id:'raw',kind:'mesh',matrix:good.objects[0].matrix,...structuredClone(mesh)}]});
 const open=raw();open.objects[0].faces.pop();assert.equal(g.inspectScene(open).manifold,false);assert.throws(()=>g.exportScene(open,'stl'));
 const flipped=raw();flipped.objects[0].faces[0].reverse();assert.ok(g.inspectScene(flipped).inconsistentEdges>0);assert.throws(()=>g.exportScene(flipped,'glb'));
 const touch=build([{op:'box',id:'a',size:[1,1,1]},{op:'box',id:'b',size:[1,1,1],position:[1,1,1]},{op:'boolean',id:'pinch',operation:'union',ids:['a','b']}]);
 assert.ok(g.inspectScene(touch).nonManifoldVertices>0);assert.throws(()=>g.exportScene(touch,'stl'));
});
test('exports reject float32 feature collapse and booleans reject unsupported rotation or empty results',()=>{
 const tiny=build([{op:'box',id:'tiny',size:[.000001,1,1],position:[999999,0,0]}]);
 assert.throws(()=>g.exportScene(tiny,'stl'),/precision|topology/);assert.throws(()=>g.exportScene(tiny,'glb'),/precision|topology/);
 for(const args of [{operation:'intersect',position:[5,0,0]}, {operation:'union',rotation:[0,0,45]}]){
  const {operation,...pose}=args;
  assert.throws(()=>build([{op:'box',id:'a',size:[1,1,1]},{op:'box',id:'b',size:[1,1,1],...pose},{op:'boolean',id:'bad',ids:['a','b'],operation}]),/empty|axis.aligned boxes/);
 }
});

test('orientation checks distinguish a reversed disconnected shell from a legitimate cavity',()=>{
 const scene=build([{op:'box',id:'a',size:[10,10,10]},{op:'box',id:'b',size:[1,1,1],position:[20,0,0]}]);
 const mesh=g.compileScene(scene);mesh.faces.slice(12).forEach(f=>f.reverse());
 const raw={...g.createScene(),objects:[{id:'mixed',kind:'mesh',matrix:scene.objects[0].matrix,...mesh}]};
 assert.equal(g.inspectScene(raw).outward,false);assert.throws(()=>g.exportScene(raw,'stl'));
 const cavity=build([{op:'box',id:'outside',size:[20,20,20]},{op:'box',id:'void',size:[2,2,2],position:[9,9,9]},{op:'boolean',id:'hollow',operation:'subtract',ids:['outside','void']}]);
 assert.equal(g.inspectScene(cavity).outward,true);near(g.inspectScene(cavity).volume,7992);assert.ok(g.exportScene(cavity,'stl').bytes.length);
});
