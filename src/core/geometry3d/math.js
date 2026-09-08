/** Row-major affine transforms; spatial floats never enter the 2D lattice. */
export const identity = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
export const sub = (a,b) => a.map((v,i)=>v-b[i]);
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const dot = (a,b) => a.reduce((n,v,i)=>n+v*b[i],0);
export const length = a => Math.hypot(...a);
export const clean = n => Math.abs(n)<1e-12 ? 0 : n;
export function number(n,label,{positive=false}={}) {
 if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1e6||(positive&&n<1e-6))throw new RangeError(`${label} must be finite, within +/-1000000${positive?', and at least 0.000001':''}`);
 return n;
}
export function vector(v,label,positive=false){
 if(!Array.isArray(v)||v.length!==3)throw new TypeError(`${label} must have three coordinates`);
 return v.map((n,i)=>number(n,`${label}[${i}]`,{positive}));
}
export function multiply(a,b){const out=Array(16).fill(0);for(let r=0;r<4;r++)for(let c=0;c<4;c++)for(let k=0;k<4;k++)out[r*4+c]+=a[r*4+k]*b[k*4+c];return out.map(clean);}
export const point = (m,p) => [0,1,2].map(r=>clean(m[r*4]*p[0]+m[r*4+1]*p[1]+m[r*4+2]*p[2]+m[r*4+3]));
export const determinant = m => dot(m.slice(0,3),cross(m.slice(4,7),m.slice(8,11)));
export function matrix(value){
 if(!Array.isArray(value)||value.length!==16)throw new TypeError('matrix must contain 16 numbers');
 value.forEach(n=>number(n,'matrix'));
 if(value[12]!==0||value[13]!==0||value[14]!==0||value[15]!==1||Math.abs(determinant(value))<1e-18)throw new RangeError('matrix must be invertible affine');
 return [...value];
}
export function transform({position=[0,0,0],rotation=[0,0,0],scale=[1,1,1]}={}){
 vector(position,'position');vector(rotation,'rotation');vector(scale,'scale');
 if(scale.some(n=>Math.abs(n)<1e-6))throw new RangeError('scale cannot collapse an axis');
 const [x,y,z]=rotation.map(n=>n*Math.PI/180),[cx,cy,cz]=[Math.cos(x),Math.cos(y),Math.cos(z)],[sx,sy,sz]=[Math.sin(x),Math.sin(y),Math.sin(z)];
 const rx=[1,0,0,0,0,cx,-sx,0,0,sx,cx,0,0,0,0,1],ry=[cy,0,sy,0,0,1,0,0,-sy,0,cy,0,0,0,0,1],rz=[cz,-sz,0,0,sz,cz,0,0,0,0,1,0,0,0,0,1];
 const s=identity();s[0]=scale[0];s[5]=scale[1];s[10]=scale[2];const t=identity();[t[3],t[7],t[11]]=position;
 return matrix(multiply(t,multiply(rz,multiply(ry,multiply(rx,s)))));
}
export function bounds(vertices){
 if(!vertices.length)return null;
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const p of vertices)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
 return {min,max};
}
