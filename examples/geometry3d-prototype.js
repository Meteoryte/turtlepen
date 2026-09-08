/** Rebuild the recovered proposal's first-prototype acceptance artifacts. */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import * as core from '../src/core/index.js';
const out=resolve(process.argv[2]||'artifacts/geometry3d-prototype');await mkdir(out,{recursive:true});
const g=core.geometry3d,receipts=[];
async function example(name,commands,{stl=true}={}){
 const recipe={name,units:'mm',commands};await writeFile(join(out,name+'.recipe.json'),JSON.stringify(recipe,null,2)+'\n');
 const scene=g.applyCommands(g.createScene(recipe),commands);await save(name,scene,stl);return scene;
}
async function save(name,scene,stl){
 for(const format of stl?['tpf','stl','glb']:['tpf','glb']){
  const result=g.exportScene(scene,format),file=name+'.'+format;await writeFile(join(out,file),result.bytes);
  receipts.push({file,format,bytes:result.bytes.length,sha256:createHash('sha256').update(result.bytes).digest('hex'),units:result.units,inspection:result.inspection});
 }
}
await example('stacked-cubes',[
 {op:'box',id:'base',size:[20,20,10]},{op:'box',id:'top',size:[10,10,10],position:[5,5,10]},
 {op:'boolean',id:'stack',operation:'union',ids:['base','top'],color:'#4178c0'},
]);
await example('curved-robot',[
 {op:'cylinder',id:'body',radius:10,height:23,position:[0,0,14],segments:48,color:'#43a87e'},
 {op:'sphere',id:'head',radius:12,position:[0,0,45],segments:48,color:'#59bd93'},
 {op:'sphere',id:'left-eye',radius:2,position:[-4,-10,48],color:'#263748'},
 {op:'sphere',id:'right-eye',radius:2,position:[4,-10,48],color:'#263748'},
 {op:'cylinder',id:'left-leg',radius:4,height:17,position:[-6,0,0],color:'#345c85'},
 {op:'cylinder',id:'right-leg',radius:4,height:17,position:[6,0,0],color:'#345c85'},
 {op:'cylinder',id:'left-arm',radius:3,height:20,rotation:[0,-40,0],position:[-10,0,33],color:'#43a87e'},
 {op:'cylinder',id:'right-arm',radius:3,height:20,rotation:[0,40,0],position:[10,0,33],color:'#43a87e'},
 {op:'group',id:'robot',members:['body','head','left-eye','right-eye','left-leg','right-leg','left-arm','right-arm']},
],{stl:false});
const doc=core.createDocument({name:'Extruded TurtlePen T',cols:20,rows:20});doc.createdAt='2026-09-08T00:00:00.000Z';
core.applyPen(doc,'base','pen B2.q1\nright 10 line',{id:'top',role:'artwork'});
core.applyPen(doc,'base','pen G2.q1\ndown 10 line',{id:'stem',role:'artwork'});
for(const id of ['top','stem'])core.applyOperation(doc,{op:'stroke_to_path',id});
core.applyOperation(doc,{op:'geometry3d',action:'create',units:'mm'});
core.applyOperation(doc,{op:'geometry3d',action:'extrude_drawing',id:'letter-t',ids:['top','stem'],unitsPerQuadrant:2,height:4});
await save('extruded-drawing',doc.geometry3d,true);await writeFile(join(out,'extruded-drawing.turtlepen.json'),core.serialize(doc));
await writeFile(join(out,'extruded-drawing.svg'),core.renderSvg(doc,{showGrid:false}));
const castle=[{op:'box',id:'foundation',size:[70,55,4],position:[0,0,0]}];
for(const [id,size,position] of [
 ['back',[50,4,18],[10,51,4]],['west',[4,35,18],[0,10,4]],['east',[4,35,18],[66,10,4]],
 ['gate-left',[18,4,18],[10,0,4]],['gate-right',[18,4,18],[42,0,4]],['lintel',[14,4,7],[28,0,15]],
])castle.push({op:'box',id,size,position});
for(const x of [0,60])for(const y of [0,45]){
 const id=`tower-${x}-${y}`;castle.push({op:'box',id,size:[10,10,28],position:[x,y,4]});
 for(const [i,dx,dy] of [[0,0,0],[1,6,0],[2,0,6],[3,6,6]])castle.push({op:'box',id:`${id}-merlon-${i}`,size:[4,4,4],position:[x+dx,y+dy,32]});
}
castle.push({op:'boolean',id:'castle',operation:'union',ids:castle.map(c=>c.id),color:'#527fbb'});
await example('castle',castle);
await writeFile(join(out,'receipts.json'),JSON.stringify({schema:1,scope:'local first-prototype exports; no physical print or hosted deployment',artifacts:receipts},null,2)+'\n');
process.stdout.write(JSON.stringify({out,files:receipts.length,models:[...new Set(receipts.map(r=>r.file.replace(/\.[^.]+$/,'')))]},null,2)+'\n');
