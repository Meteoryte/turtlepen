import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {connect} from './mcp-client.mjs';
import * as core from '../../src/core/index.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const attempt=process.argv[2];if(!/^attempt-0[23]$/.test(attempt))throw Error('Expected attempt-02 or attempt-03');
const folder=path.join(root,attempt);await fs.mkdir(folder,{recursive:true});
const ops=JSON.parse(await fs.readFile(path.join(root,'operations.json'),'utf8'));
const mcp=await connect(root);const receipts=[];
try {
  receipts.push({runtime:await mcp.call('runtime_info')});
  for(const asset of ops.assets){
    const operations=asset.operations.map(op=>op.op==='pen'?{...op,paint:'line'}:op);
    asset.operations=operations;
    await mcp.call('new_diagram',{name:asset.title,path:`${attempt}/${asset.id}.turtlepen.json`,cols:asset.cols,rows:asset.rows});
    const rehearsal=await mcp.call('plan',{operations,commit:false,format:'json'});
    const committed=await mcp.call('plan',{operations,commit:true,format:'json'});
    const validation=await mcp.call('validate',{format:'json'});
    await mcp.call('save');
    const render=await mcp.call('render',{path:`${attempt}/${asset.id}.svg`,bounds:'canvas',margin:0,showGrid:false,...(attempt==='attempt-03'?{transparent:true}:{})});
    const doc=await core.loadDocument(path.join(folder,`${asset.id}.turtlepen.json`));
    await fs.writeFile(path.join(folder,`${asset.id}.png`),core.renderPng(doc,{bounds:'canvas',margin:0,showGrid:false,transparent:attempt==='attempt-03'}));
    const svg=await fs.readFile(path.join(folder,`${asset.id}.svg`),'utf8');
    const counts={bytes:Buffer.byteLength(svg),lines:(svg.match(/<line /g)??[]).length,polylines:(svg.match(/<polyline /g)??[]).length,sha256:createHash('sha256').update(svg).digest('hex')};
    receipts.push({id:asset.id,rehearsal:rehearsal.validation?.summary,committed:committed.validation?.summary,validation,render,counts});
    console.log(asset.id,JSON.stringify(counts));
  }
  await fs.writeFile(path.join(folder,'operations.json'),JSON.stringify(ops,null,2));
  await fs.writeFile(path.join(folder,'receipts.json'),JSON.stringify(receipts,null,2));
}finally{mcp.close();}
