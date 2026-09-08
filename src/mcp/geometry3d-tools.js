import {extname} from 'node:path';
import {atomicWriteFile,hashBytes} from '../io.js';
export function geometry3dTools({core,session,need,applyAndPersist,json,resolveInside}){
 const string={type:'string'},number={type:'number'},vector={type:'array',items:number,minItems:3,maxItems:3},ids={type:'array',items:string,minItems:1,maxItems:128,uniqueItems:true};
 const commands={type:'array',maxItems:256,items:{type:'object',properties:{
  op:{type:'string',enum:['box','sphere','cylinder','circle','polygon','extrude','sweep','loft','transform','group','ungroup','remove','boolean']},id:string,
  size:vector,position:vector,rotation:vector,scale:vector,color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},radius:number,height:number,
  segments:{type:'integer',minimum:8,maximum:128},points:{type:'array',minItems:3,maxItems:512,items:{type:'array',items:number,minItems:2,maxItems:3}},profile:string,
  radii:{type:'array',items:number,minItems:4,maxItems:49},steps:{type:'integer',minimum:4,maximum:128},
  sections:{type:'array',minItems:2,maxItems:129,items:{type:'array',items:number,minItems:5,maxItems:5}},exponent:{type:'number',minimum:2,maximum:8},shading:{type:'string',enum:['flat','smooth']},
  members:ids,ids,operation:{type:'string',enum:['union','subtract','intersect']},
 },required:['op','id'],additionalProperties:false}};
 const scene=()=>{const doc=need(session);if(!doc.geometry3d)throw new Error('create or import a 3D scene first');return doc.geometry3d;};
 return [
  {name:'geometry3d',description:'Create and edit true XYZ geometry in explicit mm/cm/m/in units, independent of 2D page Z-order. Atomic commands support primitives, profile extrusion, sweep (4+3k XYZ cubic Bezier points, max 49, and matching positive radii), loft (increasing Z sections [x,y,z,radiusX,radiusY]), explicit flat/smooth GLB shading, world-space degree transforms, flat groups and axis-aligned box booleans. Extrude cell-painted drawing paths at an explicit physical scale. Source survives save/reopen and undo; import takes TPF JSON text.',
   inputSchema:{type:'object',properties:{action:{type:'string',enum:['create','apply','import','extrude_drawing']},name:string,units:{type:'string',enum:['mm','cm','m','in']},commands,source:string,replace:{type:'boolean'},id:string,ids,height:number,unitsPerQuadrant:number},additionalProperties:false},
   handler:async args=>json(await applyAndPersist(session,'geometry3d',args))},
  {name:'inspect_geometry3d',description:'Inspect spatial geometry bounds, units, volume, manifold edges/vertices, winding, degeneracy and conservative part-bound overlaps. Reports unchecked manufacturing concerns explicitly; this is mesh topology evidence, not proof of a physical print.',
   inputSchema:{type:'object',properties:{},additionalProperties:false},handler:()=>json(core.geometry3d.inspectScene(scene()))},
  {name:'export_geometry3d',description:'Export deterministic TPF source, binary STL in millimeters/Z-up, or GLB in meters/Y-up. Returns actual base64 bytes by default (4 MiB binary limit to fit hosted structured/text responses). Optional path writes atomically inside allowed roots and must match format extension. STL refuses unresolved overlapping/touching parts and invalid topology; GLB permits assemblies with overlap warnings.',
   inputSchema:{type:'object',properties:{format:{type:'string',enum:['tpf','stl','glb']},path:string},required:['format'],additionalProperties:false},
   handler:async args=>{
    const result=core.geometry3d.exportScene(scene(),args.format),{bytes,...metadata}=result;
    const receipt={...metadata,byteLength:bytes.length,sha256:hashBytes(bytes)};
    if(args.path){if(extname(args.path).toLowerCase()!=='.'+args.format)throw new Error('export path extension must match format; cannot overwrite a TurtlePen document');const path=await resolveInside(session,session.cwd,args.path);await atomicWriteFile(path,bytes,{backup:true});return json({...receipt,path});}
    if(bytes.length>4*1024*1024)throw new Error('inline export exceeds 4 MiB; reduce geometry detail or use a local export path');
    return json({...receipt,base64:Buffer.from(bytes).toString('base64')});
   }},
 ];
}
