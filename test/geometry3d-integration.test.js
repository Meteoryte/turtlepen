import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import * as core from '../src/core/index.js';
import {createSession,createTools} from '../src/mcp/tools.js';
const command={op:'geometry3d',action:'create',units:'mm',commands:[{op:'box',id:'block',size:[10,20,30]}]};
test('3D document data persists, old schemas migrate and failed batches leave both spaces untouched',()=>{
 const doc=core.createDocument();core.applyOperation(doc,command);
 assert.equal(core.SCHEMA_VERSION,5);assert.deepEqual(core.deserialize(core.serialize(doc)).geometry3d,doc.geometry3d);
 const before=core.serialize(doc);const result=core.commitOperations(doc,[{op:'geometry3d',action:'apply',commands:[{op:'transform',id:'block',position:[1,2,3]}]}, {op:'geometry3d',action:'apply',commands:[{op:'box',id:'bad',size:[0,1,1]}]}]);
 assert.equal(result.ok,false);assert.equal(core.serialize(doc),before);
 for(const schema of [1,2,3,4]){const old=JSON.parse(core.serialize(core.createDocument()));old.schema=schema;const migrated=core.deserialize(old);assert.equal(migrated.schema,5);assert.equal(migrated.geometry3d,undefined);}
 const corrupt=JSON.parse(before);corrupt.geometry3d.objects[0].matrix[0]=0;assert.throws(()=>core.deserialize(corrupt));
});
test('drawing extrusion snapshots exact cell artwork with explicit physical scale',()=>{
 const doc=core.createDocument();core.applyPen(doc,'base','pen C3.q1\nright 3 line\ndown 2 line',{id:'ink',role:'artwork'});
 core.applyOperation(doc,{op:'stroke_to_path',id:'ink',resultId:'cells'});core.applyOperation(doc,{op:'geometry3d',action:'create',units:'mm'});
 const count=core.elementClaimed(core.findElement(doc,'cells').element).size;
 core.applyOperation(doc,{op:'geometry3d',action:'extrude_drawing',id:'drawing',ids:['cells'],height:3,unitsPerQuadrant:2});
 const r=core.geometry3d.inspectScene(doc.geometry3d);assert.equal(r.manifold,true);assert.equal(r.volume,count*12);
 const before=core.geometry3d.serializeTpf(doc.geometry3d);core.applyOperation(doc,{op:'move',id:'cells',cellsX:1});assert.equal(core.geometry3d.serializeTpf(doc.geometry3d),before);
 assert.throws(()=>core.applyOperation(doc,{op:'geometry3d',action:'extrude_drawing',id:'bad',ids:['ink'],height:3,unitsPerQuadrant:2}),/cell|path|found/);
});
test('MCP geometry supports rehearsal, rollback, undo/redo, reopen and bounded export paths',async t=>{
 const cwd=await mkdtemp(resolve(tmpdir(),'turtlepen-3d-'));t.after(()=>rm(cwd,{recursive:true,force:true}));
 const session=createSession({cwd}),tools=new Map(createTools(session).map(t=>[t.name,t])),call=(name,args)=>tools.get(name).handler(args);
 await call('new_diagram',{name:'3D test',path:'model.turtlepen.json'});
 const rehearsal=JSON.parse(await call('plan',{operations:[command],commit:false,format:'json'}));assert.equal(rehearsal.ok,true);assert.equal(session.doc.geometry3d,undefined);
 assert.deepEqual(rehearsal.diff.geometry3d.objects.added,['block']);assert.ok(rehearsal.diff.changed>0);assert.equal(rehearsal.geometry3d.volume,6000);
 const {op,...args}=command;await call('geometry3d',args);assert.equal(JSON.parse(await call('inspect_geometry3d',{})).volume,6000);
 const before=core.serialize(session.doc);await assert.rejects(async()=>call('geometry3d',{action:'apply',commands:[{op:'transform',id:'block',position:[4,0,0]},{op:'box',id:'bad',size:[0,1,1]}]}));assert.equal(core.serialize(session.doc),before);
 await call('history',{action:'undo'});assert.equal(session.doc.geometry3d,undefined);await call('history',{action:'redo'});assert.equal(session.doc.geometry3d.objects.length,1);
 const inline=JSON.parse(await call('export_geometry3d',{format:'stl'}));assert.equal(Buffer.from(inline.base64,'base64').readUInt32LE(80),12);
 await call('export_geometry3d',{format:'glb',path:'block.glb'});assert.equal((await readFile(resolve(cwd,'block.glb'))).readUInt32LE(0),0x46546c67);
 await assert.rejects(async()=>call('export_geometry3d',{format:'stl',path:'../escape.stl'}));
 await assert.rejects(async()=>call('export_geometry3d',{format:'tpf',path:'model.turtlepen.json'}));
 assert.equal((await core.loadDocument(resolve(cwd,'model.turtlepen.json'))).geometry3d.objects.length,1);
});
test('CLI recipes and saved TPF use the same deterministic geometry pipeline',async t=>{
 const cwd=await mkdtemp(resolve(tmpdir(),'turtlepen-3d-cli-'));t.after(()=>rm(cwd,{recursive:true,force:true}));
 const cli=resolve('src/cli.js'),run=args=>JSON.parse(execFileSync(process.execPath,[cli,'geometry3d',...args],{cwd,encoding:'utf8',windowsHide:true}));
 await writeFile(resolve(cwd,'recipe.json'),JSON.stringify({name:'inch block',units:'in',commands:[{op:'box',id:'block',size:[1,1,1]}]}));
 const tpf=run(['--recipe','recipe.json','--format','tpf','--out','model.tpf']);assert.equal(tpf.format,'tpf');
 const stl=run(['model.tpf','--format','stl','--out','model.stl']);assert.equal(stl.units,'mm');assert.equal((await readFile(resolve(cwd,'model.stl'))).readUInt32LE(80),12);
 const inspection=run(['model.tpf','--inspect']);assert.equal(inspection.solidReady,true);assert.ok(Math.abs(inspection.volume-1)<1e-9);
 assert.throws(()=>run(['model.tpf','--format','stl','--out','model.tpf']),/overwrite|extension/);
});

test('curved authoring reaches MCP rehearsal, persistence, recovery and CLI recipes',async t=>{
 const cwd=await mkdtemp(resolve(tmpdir(),'turtlepen-curves-'));t.after(()=>rm(cwd,{recursive:true,force:true}));
 const commands=[{op:'sweep',id:'arm',points:[[0,0,0],[5,0,0],[8,0,4],[10,0,8]],radii:[2,2,1.5,1],shading:'smooth'},
  {op:'loft',id:'shell',sections:[[0,0,0,0,0],[0,0,2,4,3],[0,0,4,0,0]],position:[25,0,0],exponent:2.5,shading:'smooth'}];
 const session=createSession({cwd}),tools=new Map(createTools(session).map(t=>[t.name,t])),call=(name,args)=>tools.get(name).handler(args);
 await call('new_diagram',{name:'curves',path:'curves.turtlepen.json'});
 const operation={op:'geometry3d',action:'create',commands};
 const preview=JSON.parse(await call('plan',{operations:[operation],commit:false,format:'json'}));
 assert.equal(preview.ok,true);assert.equal(session.doc.geometry3d,undefined);
 const {op,...args}=operation;await call('geometry3d',args);
 assert.equal(JSON.parse(await call('inspect_geometry3d',{})).outward,true);
 await call('history',{action:'undo'});assert.equal(session.doc.geometry3d,undefined);
 await call('history',{action:'redo'});assert.equal(session.doc.geometry3d.objects[0].shading,'smooth');
 const reopened=await core.loadDocument(resolve(cwd,'curves.turtlepen.json'));
 assert.deepEqual(reopened.geometry3d,session.doc.geometry3d);
 const inline=JSON.parse(await call('export_geometry3d',{format:'glb'}));
 await writeFile(resolve(cwd,'recipe.json'),JSON.stringify({name:'curves',units:'mm',commands}));
 execFileSync(process.execPath,[resolve('src/cli.js'),'geometry3d','--recipe','recipe.json','--format','glb','--out','curves.glb'],{cwd,windowsHide:true});
 assert.deepEqual(await readFile(resolve(cwd,'curves.glb')),Buffer.from(inline.base64,'base64'));
});
