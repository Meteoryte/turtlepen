import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const recording=path.resolve(root,'../../../../SORT/Recording 2026-09-07 023412.mp4');
const types={'.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.md':'text/plain; charset=utf-8','.mp4':'video/mp4'};
const server=http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 let url;try{url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
 const file=url==='/source-video.mp4'?recording:path.resolve(root,`.${url==='/'?'/index.html':url}`);
 if(file!==recording&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 let stat;try{stat=fs.statSync(file);if(!stat.isFile())throw Error();}catch{res.writeHead(404).end();return;}
 let start=0,end=stat.size-1,status=200;const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
 if(req.headers.range&&!range){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}).end();return;}
 if(range){start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),end):end;if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}).end();return;}status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${stat.size}`);}
 res.writeHead(status,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 if(req.method==='HEAD'){res.end();return;}fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
});server.listen(Number(process.env.TURTLEPEN_STUDY_PORT??4318),'127.0.0.1',()=>console.log('TurtlePen study: http://127.0.0.1:4318'));
