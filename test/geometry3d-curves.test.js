import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/core/geometry3d/index.js';

const build = (...commands) => g.applyCommands(g.createScene(), commands);
const straight = {op:'sweep', id:'tube', points:[[0,0,0],[0,0,10],[0,0,20],[0,0,30]], radii:[2,2,2,2], segments:64, steps:24};
const loft = {op:'loft', id:'body', sections:[[0,0,0,2,3],[0,0,10,2,3]], segments:64};

test('Bezier sweep makes a capped outward tube and converges to analytic cylinder volume', () => {
  const scene=build(straight), r=g.inspectScene(scene);
  assert.equal(r.outward,true); assert.equal(r.shells,1);
  assert.ok(Math.abs(r.volume-Math.PI*4*30)/(Math.PI*4*30)<.002);
  assert.equal(r.bounds.min[2],0); assert.equal(r.bounds.max[2],30);
});

test('tapered curved sweep preserves source, transforms, stable frames, and export precision', () => {
  for(const points of [ [[0,0,0],[10,0,0],[15,12,0],[20,12,8]], [[0,0,0],[0,0,8],[0,0,16],[.001,0,24]] ]) {
    const scene=build({...straight,points,radii:[3,4,2,1],shading:'smooth',rotation:[12,35,60],scale:[-1,1,1]});
    assert.equal(g.inspectScene(scene).outward,true);
    assert.deepEqual(g.deserializeTpf(g.serializeTpf(scene)),scene);
    assert.deepEqual(g.exportScene(scene,'glb').bytes,g.exportScene(scene,'glb').bytes);
    assert.ok(g.exportScene(scene,'stl').bytes.length>84);
  }
});

test('elliptical loft has analytic volume, supports poles and rounded-square cross-sections', () => {
  const r=g.inspectScene(build(loft)); assert.equal(r.outward,true);
  assert.ok(Math.abs(r.volume-Math.PI*2*3*10)/(Math.PI*2*3*10)<.002);
  const sections=[[0,0,-1,0,0],[0,0,0,2,3],[1,0,4,3,4],[1,0,6,0,0]];
  for(const exponent of [2,4]) {
    const scene=build({...loft,sections,exponent,shading:'smooth'});
    assert.equal(g.inspectScene(scene).outward,true); assert.ok(g.exportScene(scene,'glb').bytes.length);
    assert.deepEqual(g.deserializeTpf(g.serializeTpf(scene)),scene);
  }
});

test('joined Bezier spans make one shell with no interior caps and bounded tessellation',()=>{
 const points=[[0,0,0],[0,0,5],[0,0,10],[0,0,15],[0,0,20],[0,0,25],[0,0,30]];
 const scene=build({...straight,points,radii:points.map(()=>2)}),r=g.inspectScene(scene);
 assert.equal(r.outward,true);assert.equal(r.shells,1);
 assert.ok(Math.abs(r.volume-Math.PI*4*30)/(Math.PI*4*30)<.002);
 assert.throws(()=>build({...straight,points:Array.from({length:49},(_,i)=>[0,0,i]),radii:Array(49).fill(1),steps:128,segments:128}),/budget/);
});

test('malformed curves and over-budget tessellation fail atomically, including imported sources', () => {
  const source=build({op:'box',id:'keep',size:[1,1,1]}), before=g.serializeTpf(source);
  for(const command of [
    {...straight,steps:1000000}, {...straight,segments:1000000}, {...straight,radii:[2,-1,2,2]},
    {...straight,points:Array(4).fill([0,0,0])}, {...straight,points:[[0,0,0],[0,0,1],[0,0,-1],[0,0,0]]},
    {...loft,sections:[[0,0,1,2,2],[0,0,0,2,2]]}, {...loft,sections:Array(130).fill([0,0,1,2,2])},
    {...loft,sections:[[0,0,0,2,0],[0,0,1,2,2]]}, {...loft,exponent:20}, {...loft,shading:'magic'},
  ]) {
    assert.throws(()=>g.applyCommands(source,[{op:'box',id:'temporary',size:[1,1,1]},command]));
    assert.equal(g.serializeTpf(source),before);
  }
  const imported=build(straight); imported.objects[0].steps=1000000;
  assert.throws(()=>g.deserializeTpf(imported));
});

function readGlb(bytes) {
  const b=Buffer.from(bytes), size=b.readUInt32LE(12), json=JSON.parse(b.subarray(20,20+size));
  const attr=name=>{const a=json.accessors[json.meshes[0].primitives[0].attributes[name]],v=json.bufferViews[a.bufferView];
    return Array.from({length:a.count},(_,i)=>Array.from({length:3},(_,j)=>b.readFloatLE(28+size+v.byteOffset+i*12+j*4)));};
  return {positions:attr('POSITION'),normals:attr('NORMAL')};
}

test('explicit smooth GLB shading shares unit normals across triangle corners without changing geometry', () => {
  const c={op:'sphere',id:'s',radius:5,segments:24};
  const flat=readGlb(g.exportScene(build(c),'glb').bytes), smooth=readGlb(g.exportScene(build({...c,shading:'smooth'}),'glb').bytes);
  assert.deepEqual(smooth.positions,flat.positions); assert.notDeepEqual(smooth.normals,flat.normals);
  const seen=new Map();
  smooth.positions.forEach((p,i)=>{const key=p.join(','),n=smooth.normals[i];
    assert.ok(Math.abs(Math.hypot(...n)-1)<1e-6);
    assert.ok(p.reduce((s,v,k)=>s+v*n[k],0)>0);
    if(seen.has(key))assert.deepEqual(n,seen.get(key)); else seen.set(key,n);
  });
});
