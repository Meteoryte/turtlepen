import {findElement,elementClaimed,microMasksOf} from './document.js';
import {createScene,deserializeTpf,applyCommands,inspectScene,strict} from './geometry3d/scene.js';
import {identity,number} from './geometry3d/math.js';
import {cellMesh,transformed} from './geometry3d/mesh.js';

function drawingMesh(doc,{ids,height,unitsPerQuadrant}){
 number(height,'height',{positive:true});number(unitsPerQuadrant,'unitsPerQuadrant',{positive:true});
 if(!Array.isArray(ids)||!ids.length||ids.length>128||new Set(ids).size!==ids.length)throw new Error('extrude_drawing needs 1-128 distinct path ids');
 const ink=new Set();
 for(const id of ids){
  const el=findElement(doc,id)?.element;
  if(!el||el.kind!=='path'||el.stroke?.paint!=='cells')throw new Error(`drawing source ${id} must be a cell-painted path; convert line artwork with stroke_to_path first`);
  if(microMasksOf(doc).some(m=>m.target===id))throw new Error('pixel-masked artwork cannot be extruded as whole quadrants');
  if(el.pieces.length>32768)throw new Error('drawing extrusion exceeds 32768 quadrant budget');
  for(const key of elementClaimed(el)){ink.add(key);if(ink.size>32768)throw new Error('drawing extrusion exceeds 32768 quadrant budget');}
 }
 if(!ink.size)throw new Error('drawing has no ink');
 const points=[...ink].map(k=>k.split(',').map(Number));let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const [x,y] of points){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
 if(maxX-minX+maxY-minY>65536)throw new Error('drawing exceeds 65536 quadrant span budget');
 const xs=Array.from({length:maxX-minX+2},(_,i)=>(i+minX)*unitsPerQuadrant),ys=Array.from({length:maxY-minY+2},(_,i)=>(i+minY)*unitsPerQuadrant);
 const occupied=new Set(points.map(([x,y])=>`${x-minX},${y-minY},0`));
 const flip=identity();flip[5]=-1;
 return transformed(cellMesh(xs,ys,[0,height],occupied),flip);
}
/** Independent spatial state; a failed operation never changes either document space. */
export function editGeometry3d(doc,args){
 const {op:_op,action='apply',...a}=args;
 const fields={create:['name','units','commands','replace'],apply:['commands'],import:['source','replace'],extrude_drawing:['id','ids','height','unitsPerQuadrant']};
 if(!Object.hasOwn(fields,action))throw new Error('geometry3d action must be create, apply, import, or extrude_drawing');
 strict(a,fields[action],'geometry3d arguments');let scene;
 if(action==='create'||action==='import'){
  if(a.replace!==undefined&&typeof a.replace!=='boolean')throw new Error('replace must be boolean');
  if(doc.geometry3d&&!a.replace)throw new Error('3D scene already exists; use apply or explicitly replace:true');
  scene=action==='import'?deserializeTpf(a.source):applyCommands(createScene({name:a.name??doc.name,units:a.units??'mm'}),a.commands??[]);
 }else{
  if(!doc.geometry3d)throw new Error('create or import a 3D scene first');
  if(action==='apply')scene=applyCommands(doc.geometry3d,a.commands);
  else{
   scene=deserializeTpf(doc.geometry3d);
   scene.objects.push({id:a.id,kind:'mesh',matrix:identity(),...drawingMesh(doc,a)});
   scene=deserializeTpf(scene);
  }
 }
 const inspection=inspectScene(scene);doc.geometry3d=scene;return {action,inspection,...(action==='extrude_drawing'?{source:{ids:a.ids,unitsPerQuadrant:a.unitsPerQuadrant,snapshot:true}}:{})};
}
