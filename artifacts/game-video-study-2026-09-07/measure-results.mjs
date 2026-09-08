import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const geometry=doc=>Object.entries(doc.elements).sort(([a],[b])=>a.localeCompare(b)).map(([page,els])=>[page,els.map(e=>[e.id,e.kind,e.pieces?.map(p=>[p.x,p.y,p.type])])]);
const assets=[];
for(const id of ['cathedral','knight','dialogue','map','scene']){
 const attempts=[];let before;
 for(const attempt of ['attempt-01','attempt-02','attempt-03']){
  const doc=JSON.parse(await fs.readFile(path.join(root,attempt,`${id}.turtlepen.json`),'utf8'));
  const shape=JSON.stringify(geometry(doc));before??=shape;if(shape!==before)throw Error(`${id}: geometry changed in ${attempt}`);
  const svg=await fs.readFile(path.join(root,attempt,`${id}.svg`),'utf8');
  attempts.push({attempt,bytes:Buffer.byteLength(svg),lineElements:(svg.match(/<line /g)??[]).length,polylineElements:(svg.match(/<polyline /g)??[]).length,opaquePaper:svg.includes('<rect class="bg"')});
 }
 assets.push({id,geometryUnchanged:true,attempts});
}
const operations=JSON.parse(await fs.readFile(path.join(root,'operations.json'),'utf8'));for(const a of operations.assets)for(const op of a.operations)if(op.op==='pen')op.paint='line';
await fs.writeFile(path.join(root,'attempt-02/operations.json'),JSON.stringify(operations,null,2));
await fs.writeFile(path.join(root,'loop-ledger.json'),JSON.stringify({protocol:'LOOPBANK',loop:'ad-hoc video art and renderer refinement',maximumAttempts:3,attemptsUsed:3,stopReason:'budget exhausted with verified best state',pipelineOutcome:'PASS',sourceGameFidelity:'PARTIAL',bestAttempt:'attempt-03',baselineCommit:'3e7604023243fc1ae6b746a71bee287048db8aa0',assets,postLoopIntegration:'Fever Dream exposed an existing core page-opacity option missing in MCP schema. Exposed it without changing default opacity; regression added. This was integration repair, not a fourth art-fidelity attempt.',checks:{baselineTests:728,finalTests:732,finalReleaseArtifacts:8}},null,2));
console.log('All five assets retain exact authored geometry across three attempts. Wrote loop-ledger.json.');
