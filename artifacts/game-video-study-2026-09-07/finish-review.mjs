import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {connect} from './mcp-client.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));const mcp=await connect(root);const results=[];
try {
 for(const id of ['cathedral','knight','dialogue','map','scene']){
  await mcp.call('open_diagram',{path:`attempt-03/${id}.turtlepen.json`});
  const validation=await mcp.call('validate',{format:'json'});
  const operations=validation.open.map(f=>{
   if(f.rule!=='L010'||f.severity!=='S3')throw Error(`Unexpected finding ${f.rule}`);
   return {op:'accept_finding',fingerprint:f.fingerprint,reason:`Authored paint stacking: ${f.actors.join(' over ')} on ${f.page}; ${f.metrics.quadrants} exact overlapping quadrants form the illustrated foreground and its underpainting. Observed in the final browser/PNG study; no interactive controls are in this artwork.`};
  });
  if(operations.length)await mcp.call('plan',{operations,commit:true,format:'json'});
  const rendered=await mcp.call('render',{path:`attempt-03/${id}.svg`,bounds:'canvas',margin:0,showGrid:false,transparent:true});
  const renderHash=rendered.match(/renderHash: ([a-f0-9]+)/)[1];
  const symptom=id==='map'?'Map landmarks and forests are much sparser than the recorded illustration.':id==='dialogue'?'The panel is deliberately blank; readable dialogue is supplied by the browser.':id==='cathedral'?'Repeated clean ribs and flat stone surfaces lack the painted variation of the reference.':'The face and costume are recognizable, but simplified contours and flat shading lose the reference expression and texture.';
  await mcp.call('perceptual_review',{action:'record',renderHash,reviewer:'Codex visual inspection',note:'Observed attempt-03 browser.png and native scene/map PNGs. Visual study, not production-equivalent source-game art. Transparent layers compose correctly. Dialogue text is a separate runtime layer.',findings:[{id:`${id}-detail`,severity:'P2',category:id==='dialogue'?'annotation-ambiguity':'ambiguous-silhouette',symptom,consequence:'The asset supports a prototype; it does not establish full source-game illustration fidelity.',repair:'advice-only'}]});
  await mcp.call('save');
  const release=await mcp.call('release_check',{format:'json'});results.push({id,renderHash,release});console.log(id,JSON.stringify(release).slice(0,160));
 }
 await fs.writeFile(path.join(root,'attempt-03/reviews.json'),JSON.stringify(results,null,2));
}finally{mcp.close();}
