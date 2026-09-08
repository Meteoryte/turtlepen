import {identity,matrix,transform,multiply,number,vector} from './math.js';
import {primitive,profile,circle,segments,orthogonalBoolean} from './primitives.js';
import {transformed,merge,inspectMesh} from './mesh.js';

export const UNIT_METERS=Object.freeze({mm:.001,cm:.01,m:1,in:.0254});
const common=['id','kind','matrix','color','shading'];
const fields={box:['size'],sphere:['radius','segments'],cylinder:['radius','height','segments'],extrusion:['points','height'],profile:['points'],mesh:['vertices','faces'],sweep:['points','radii','segments','steps'],loft:['sections','segments','exponent']};
export function strict(value,keys,label){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`${label} must be an object`);
 for(const key of Object.keys(value))if(!keys.includes(key))throw new Error(`unknown ${label} property: ${key}`);
}
function id(value){if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(value))throw new Error('id must be 1-80 letters, digits, dots, underscores or hyphens');return value;}
function name(value){if(typeof value!=='string'||value.length>200)throw new Error('name must be a string of at most 200 characters');return value;}
export function createScene({name:label='Untitled geometry',units='mm'}={}){
 if(!Object.hasOwn(UNIT_METERS,units))throw new Error('units must be mm, cm, m, or in');
 return {format:'turtlepen-geometry',version:1,name:name(label),units,coordinateSystem:'right-handed-z-up',objects:[],groups:[]};
}
export function validateScene(value){
 strict(value,['format','version','name','units','coordinateSystem','objects','groups'],'TPF');
 for(const key of ['format','version','name','units','coordinateSystem','objects','groups'])if(!Object.hasOwn(value,key)||value[key]===undefined)throw new Error(`TPF requires ${key}`);
 if(value.format!=='turtlepen-geometry'||value.version!==1||value.coordinateSystem!=='right-handed-z-up')throw new Error('unsupported TPF format, version or coordinate system');
 createScene(value);
 if(!Array.isArray(value.objects)||value.objects.length>128||!Array.isArray(value.groups)||value.groups.length>128)throw new Error('scene supports at most 128 objects and groups');
 const identifiers=new Set();let vertices=0,triangles=0;
 for(const object of value.objects){
  if(!object||!Object.hasOwn(fields,object.kind))throw new Error('unsupported geometry kind');
  strict(object,[...common,...fields[object.kind]],'geometry');id(object.id);
  if(identifiers.has(object.id))throw new Error(`duplicate id: ${object.id}`);identifiers.add(object.id);matrix(object.matrix);
  if(object.color!==undefined&&(typeof object.color!=='string'||!/^#[0-9a-f]{6}$/i.test(object.color)))throw new Error('color must be #RRGGBB');
  if(object.shading!==undefined&&!['flat','smooth'].includes(object.shading))throw new Error('shading must be flat or smooth');
  if(object.kind==='profile'){profile(object.points);continue;}
  if(object.kind==='box')vector(object.size,'size',true);
  if(['sphere','cylinder'].includes(object.kind)){number(object.radius,'radius',{positive:true});segments(object.segments);}
  if(['extrusion','cylinder'].includes(object.kind))number(object.height,'height',{positive:true});
  const mesh=transformed(primitive(object),object.matrix);vertices+=mesh.vertices.length;triangles+=mesh.faces.length;
  if(vertices>200000||triangles>300000)throw new Error('scene exceeds 200000 vertices or 300000 triangles');
 }
 const grouped=new Set();
 for(const group of value.groups){
  strict(group,['id','members'],'group');id(group.id);
  if(identifiers.has(group.id))throw new Error(`duplicate id: ${group.id}`);identifiers.add(group.id);
  if(!Array.isArray(group.members)||!group.members.length||group.members.length>128)throw new Error('group needs 1-128 object members');
  for(const member of group.members){if(!value.objects.some(o=>o.id===member)||grouped.has(member))throw new Error('groups must be flat, with each object in at most one group');grouped.add(member);}
 }
 return value;
}
export function deserializeTpf(input){
 if(typeof input==='string'&&input.length>16*1024*1024)throw new Error('TPF exceeds 16 MiB text budget');
 const value=typeof input==='string'?JSON.parse(input):structuredClone(input);return validateScene(value);
}
export function serializeTpf(scene){return JSON.stringify(validateScene(scene),null,2)+'\n';}
const pose=['position','rotation','scale'];
const commandFields={box:['size'],sphere:['radius','segments'],cylinder:['radius','height','segments'],circle:['radius','segments'],polygon:['points'],extrude:['points','radius','segments','profile','height'],sweep:['points','radii','segments','steps'],loft:['sections','segments','exponent'],transform:[],group:['members'],ungroup:[],remove:[],boolean:['operation','ids']};
function removeObjects(scene,ids){scene.objects=scene.objects.filter(o=>!ids.includes(o.id));scene.groups=scene.groups.map(g=>({...g,members:g.members.filter(x=>!ids.includes(x))})).filter(g=>g.members.length);}
/** All commands commit together. The input scene is never mutated. Transforms are world-space. */
export function applyCommands(input,commands){
 const scene=deserializeTpf(input);
 if(!Array.isArray(commands)||commands.length>256)throw new Error('commands must be an array of at most 256 commands');
 for(const c of commands){
  if(!c||!Object.hasOwn(commandFields,c.op))throw new Error(`unknown geometry operation: ${c?.op}`);
  const creates=['box','sphere','cylinder','circle','polygon','extrude','sweep','loft'].includes(c.op);
  strict(c,['op','id',...commandFields[c.op],...(creates||c.op==='transform'?pose:[]),...(creates||c.op==='boolean'?['color','shading']:[])],'command');id(c.id);
  const object=scene.objects.find(o=>o.id===c.id),group=scene.groups.find(g=>g.id===c.id);
  if(creates||c.op==='group'||c.op==='boolean'){
   if(object||group)throw new Error(`duplicate id: ${c.id}`);
  }
  if(creates){
   const o={id:c.id,kind:c.op,matrix:transform(c)};if(c.color!==undefined)o.color=c.color;
   if(c.shading!==undefined)o.shading=c.shading;
   if(c.op==='sweep'||c.op==='loft')for(const key of commandFields[c.op])if(c[key]!==undefined)o[key]=structuredClone(c[key]);
   if(c.op==='box')o.size=vector(c.size,'size',true);
   if(['sphere','cylinder'].includes(c.op)){o.radius=number(c.radius,'radius',{positive:true});o.segments=segments(c.segments);if(c.op==='cylinder')o.height=c.height;}
   if(c.op==='circle'||c.op==='polygon'){o.kind='profile';o.points=c.op==='circle'?circle(c.radius,c.segments):profile(c.points);}
   if(c.op==='extrude'){
    if([c.points!==undefined,c.radius!==undefined,c.profile!==undefined].filter(Boolean).length!==1)throw new Error('extrude needs exactly one of points, radius, or profile');
    if(c.segments!==undefined&&c.radius===undefined)throw new Error('segments only applies to a circular extrusion');
    o.kind='extrusion';o.height=number(c.height,'height',{positive:true});
    if(c.profile!==undefined){const p=scene.objects.find(o=>o.id===c.profile&&o.kind==='profile');if(!p)throw new Error('profile not found');o.points=structuredClone(p.points);o.matrix=matrix(multiply(o.matrix,p.matrix));}
    else o.points=c.points!==undefined?profile(c.points):circle(c.radius,c.segments);
   }
   scene.objects.push(o);
  }else if(c.op==='transform'){
   if(!object&&!group)throw new Error(`object or group not found: ${c.id}`);
   const t=transform(c);for(const o of object?[object]:scene.objects.filter(o=>group.members.includes(o.id)))o.matrix=matrix(multiply(t,o.matrix));
  }else if(c.op==='group')scene.groups.push({id:c.id,members:structuredClone(c.members)});
  else if(c.op==='ungroup'){if(!group)throw new Error('group not found');scene.groups=scene.groups.filter(g=>g.id!==c.id);}
  else if(c.op==='remove'){if(!object)throw new Error('object not found');removeObjects(scene,[c.id]);}
  else if(c.op==='boolean'){
   if(!Array.isArray(c.ids)||new Set(c.ids).size!==c.ids.length)throw new Error('boolean ids must be distinct');
   const operands=c.ids.map(key=>{const o=scene.objects.find(o=>o.id===key);if(!o)throw new Error(`boolean operand not found: ${key}`);return o;});
   const mesh=orthogonalBoolean(operands,c.operation);removeObjects(scene,c.ids);
   scene.objects.push({id:c.id,kind:'mesh',matrix:identity(),...mesh,...(c.color!==undefined?{color:c.color}:{}),...(c.shading!==undefined?{shading:c.shading}:{})});
  }
  validateScene(scene);
 }
 return scene;
}
export function compileScene(scene){validateScene(scene);return merge(scene.objects.filter(o=>o.kind!=='profile').map(o=>transformed(primitive(o),o.matrix)));}
export function sceneParts(scene){validateScene(scene);return scene.objects.filter(o=>o.kind!=='profile').map(o=>({id:o.id,color:o.color,shading:o.shading,mesh:transformed(primitive(o),o.matrix)}));}
export function inspectScene(scene){
 const parts=sceneParts(scene).map(p=>({id:p.id,...inspectMesh(p.mesh)}));
 const combined=inspectMesh(compileScene(scene)),possibleOverlaps=[];
 for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++){
  const a=parts[i].bounds,b=parts[j].bounds;
  if(a&&b&&a.min.every((n,k)=>n<=b.max[k]&&a.max[k]>=b.min[k]))possibleOverlaps.push([parts[i].id,parts[j].id]);
 }
 const warnings=[];
 if(possibleOverlaps.length)warnings.push('Part bounds overlap or touch; STL requires separated parts or an explicit supported boolean. This conservative check can include separated curved surfaces.');
 if(!combined.manifold||parts.some(p=>!p.outward))warnings.push('Mesh is empty, open, degenerate, inconsistently oriented, or non-manifold.');
 warnings.push('Topology checks do not establish manufacturability; self-intersection, wall thickness, supports and printer settings require a slicer review.');
 return {...combined,units:scene.units,parts,profiles:scene.objects.filter(o=>o.kind==='profile').length,possibleOverlaps,
  solidReady:combined.outward&&parts.every(p=>p.outward)&&possibleOverlaps.length===0,warnings,
  checks:{selfIntersections:'not_evaluated',wallThickness:'not_evaluated',printerCompatibility:'not_evaluated'}};
}
