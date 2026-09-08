import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/core/index.js';
import {createSession,createTools} from '../src/mcp/tools.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const profile = {bounds:'canvas', margin:0, showGrid:false};
test('MCP exposes core page opacity directly and in plans for solid layered artwork',async(t)=>{
 const cwd=await mkdtemp(join(tmpdir(),'turtlepen-game-asset-test-'));t.after(()=>rm(cwd,{recursive:true,force:true}));
 const session=createSession({cwd});const tools=new Map(createTools(session).map(t=>[t.name,t]));
 await tools.get('new_diagram').handler({name:'opacity'});
 await tools.get('add_page').handler({id:'paint',intent:'overlay',opacity:1});
 assert.equal(session.doc.pages.find(p=>p.id==='paint').opacity,1);
 const result=JSON.parse(await tools.get('plan').handler({operations:[{op:'update_page',id:'paint',opacity:0.5}],commit:true,format:'json'}));
 assert.equal(result.ok,true);assert.equal(session.doc.pages.find(p=>p.id==='paint').opacity,.5);
 assert.equal(tools.get('add_page').inputSchema.properties.opacity.maximum,1);
 assert.equal(tools.get('update_page').inputSchema.properties.opacity.minimum,0);
});
const pixel = (r,x,y) => [...r.pixels.slice((y*r.width+x)*4,(y*r.width+x)*4+4)];
function fixture() {
  const doc=core.createDocument({name:'mixed game art',canvas:{cols:24,rows:18}});
  core.applyPen(doc,'base','polygon C3.q1 K3.q1 K11.q1 C11.q1 fill\npen O3.q1\nray to O11.q1',{id:'art',role:'artwork',color:'#336699',width:1});
  return doc;
}
test('filled geometry stays solid with thin ink, while an adjacent open stroke stays thin',()=>{
  const doc=fixture();
  const image=core.rasterizeDocument(doc,profile);
  for(let y=35;y<95;y++) assert.deepEqual(pixel(image,55,y),[51,102,153,255],`fill row ${y}`);
  assert.deepEqual(pixel(image,140,55),[244,243,239,255],'open stroke does not become a solid 5px column');
  assert.match(core.renderSvg(doc,profile),/data-fill="solid"/);
});
test('uniform baked colors use compact vector ink without changing claimed geometry',()=>{
  const doc=core.createDocument({name:'flat ink',canvas:{cols:100,rows:100}});
  core.applyPen(doc,'base','pen C3.q1\nray to CR90.q1',{id:'flat',role:'artwork',color:'#112233',fillColor:'#112233',width:2});
  const before=JSON.stringify(core.findElement(doc,'flat').element.pieces);
  const svg=core.renderSvg(doc,profile);
  assert.ok((svg.match(/<line /g)??[]).length<5,'flat-color stroke must not emit one line per quadrant');
  assert.match(svg,/<polyline[^>]+stroke="#112233"/);
  assert.equal(JSON.stringify(core.findElement(doc,'flat').element.pieces),before);
});
test('transparent game assets preserve empty alpha and opaque ink, with review-bound output',()=>{
  const doc=fixture();
  const options={...profile,transparent:true};
  const raster=core.png.decode(core.renderPng(doc,options));
  assert.equal(pixel(raster,0,0)[3],0);
  assert.deepEqual(pixel(raster,55,55),[51,102,153,255]);
  const svg=core.renderSvg(doc,options);
  assert.doesNotMatch(svg,/<rect class="bg"/);
  assert.match(core.renderSvg(doc,profile),/<rect class="bg"/);
  assert.equal(core.renderSvg(doc,{...profile,transparent:false}),core.renderSvg(doc,profile));
  assert.equal(core.renderSvgForReview(doc,options),svg);
  assert.notEqual(core.renderHash(svg),core.renderHash(core.renderSvgForReview(doc,profile)));
  assert.throws(()=>core.renderSvgForReview(doc,{transparent:'yes'}),/boolean/);
  assert.throws(()=>core.renderPng(doc,{transparent:'yes'}),/boolean/);
  assert.throws(()=>core.renderPdf(doc,options),/SVG and PNG/);
});
