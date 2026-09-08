/** Bounded parametric solids. All coordinates stay in the physical 3D space. */
import {number,vector,cross,dot,length} from './math.js';

function count(value,fallback,min,max,label) {
  const n=value===undefined?fallback:value;
  if(!Number.isInteger(n)||n<min||n>max)throw new RangeError(`${label} must be an integer from ${min} to ${max}`);
  return n;
}
const unit=v=>{const n=length(v);if(n<1e-10)throw new Error('sweep has a stationary or reversing tangent');return v.map(x=>x/n);};
const bezier=(a,t)=>a[0]*(1-t)**3+3*a[1]*t*(1-t)**2+3*a[2]*t*t*(1-t)+a[3]*t**3;

/** Connect CCW rings, optionally with a single vertex at either end. */
function skin(rings) {
  const vertices=[],faces=[],indices=rings.map(r=>r.map(p=>{vertices.push(p);return vertices.length-1;}));
  for(let j=1;j<indices.length;j++) {
    const a=indices[j-1],b=indices[j],n=Math.max(a.length,b.length);
    for(let i=0;i<n;i++) {
      const k=(i+1)%n;
      if(a.length===1)faces.push([a[0],b[k],b[i]]);
      else if(b.length===1)faces.push([a[i],a[k],b[0]]);
      else faces.push([a[i],a[k],b[k]],[a[i],b[k],b[i]]);
    }
  }
  for(const [ring,end] of [[indices[0],false],[indices.at(-1),true]]) {
    if(ring.length===1)continue;
    const center=[0,1,2].map(k=>ring.reduce((s,i)=>s+vertices[i][k],0)/ring.length),c=vertices.length;
    vertices.push(center);
    for(let i=0;i<ring.length;i++){const next=ring[(i+1)%ring.length];faces.push(end?[c,ring[i],next]:[c,next,ring[i]]);}
  }
  return {vertices,faces};
}

/** Circular tube along joined cubic Beziers, with positive radius controls. Flat closed caps. */
export function sweep({points,radii,segments,steps}) {
  const n=count(segments,32,8,128,'segments'),m=count(steps,32,4,128,'steps');
  if(!Array.isArray(points)||points.length<4||points.length>49||(points.length-1)%3!==0)throw new Error('sweep needs 4+3k XYZ Bezier control points, at most 49');
  const spans=(points.length-1)/3;
  if((m*spans+1)*n>32768)throw new RangeError('sweep exceeds 32768 ring-vertex tessellation budget');
  const p=points.map(v=>vector(v,'sweep point'));
  if(!Array.isArray(radii)||radii.length!==points.length)throw new Error('sweep needs one positive radius control per point');
  radii.forEach(r=>number(r,'sweep radius',{positive:true}));
  const rings=[];let previous,frame;
  for(let j=0;j<=m*spans;j++) {
    const span=Math.min(spans-1,Math.floor(j/m)),t=(j-span*m)/m,cp=p.slice(span*3,span*3+4);
    const center=[0,1,2].map(k=>bezier(cp.map(v=>v[k]),t)),radius=bezier(radii.slice(span*3,span*3+4),t);
    const tangent=unit([0,1,2].map(k=>3*(1-t)**2*(cp[1][k]-cp[0][k])+6*(1-t)*t*(cp[2][k]-cp[1][k])+3*t*t*(cp[3][k]-cp[2][k])));
    if(!previous) {
      const axis=[0,0,0];axis[tangent.map(Math.abs).indexOf(Math.min(...tangent.map(Math.abs)))]=1;
      frame=unit(cross(tangent,axis));
    } else {
      const cosine=dot(previous,tangent),v=cross(previous,tangent);
      if(cosine<-.95)throw new Error('sweep has a stationary or reversing tangent; split the curve');
      // Parallel transport by the shortest rotation, without a world-axis seam.
      const vx=cross(v,frame),vvx=cross(v,vx);
      frame=unit(frame.map((x,k)=>x+vx[k]+vvx[k]/(1+cosine)));
    }
    const second=unit(cross(tangent,frame));
    rings.push(Array.from({length:n},(_,i)=>{
      const angle=2*Math.PI*i/n;
      return center.map((x,k)=>x+radius*(Math.cos(angle)*frame[k]+Math.sin(angle)*second[k]));
    }));
    previous=tangent;
  }
  return skin(rings);
}

/** Elliptical/superelliptical rings [centerX,centerY,z,radiusX,radiusY]. No hidden interpolation. */
export function loft({sections,segments,exponent=2}) {
  const n=count(segments,48,8,128,'segments');
  number(exponent,'exponent');if(exponent<2||exponent>8)throw new RangeError('loft exponent must be from 2 to 8');
  if(!Array.isArray(sections)||sections.length<2||sections.length>129)throw new Error('loft needs 2-129 sections');
  let previous=-Infinity;
  const rings=sections.map((s,j)=>{
    if(!Array.isArray(s)||s.length!==5)throw new Error('loft section must be [x,y,z,radiusX,radiusY]');
    s.forEach(x=>number(x,'loft section'));const [x,y,z,rx,ry]=s;
    if(z<=previous)throw new Error('loft section Z values must increase strictly');previous=z;
    if(rx===0&&ry===0&&(j===0||j===sections.length-1))return [[x,y,z]];
    number(rx,'loft radiusX',{positive:true});number(ry,'loft radiusY',{positive:true});
    const power=a=>Math.abs(a)<1e-14?0:Math.sign(a)*Math.abs(a)**(2/exponent);
    return Array.from({length:n},(_,i)=>{const a=2*Math.PI*i/n;return [x+rx*power(Math.cos(a)),y+ry*power(Math.sin(a)),z];});
  });
  if(rings.every(r=>r.length===1))throw new Error('loft needs at least one nonzero section');
  return skin(rings);
}
