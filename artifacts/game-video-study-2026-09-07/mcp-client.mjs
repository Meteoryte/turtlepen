import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
export async function connect(cwd) {
  const child=spawn(process.execPath,[fileURLToPath(new URL('../../src/mcp/server.js',import.meta.url))],{cwd,stdio:['pipe','pipe','pipe'],windowsHide:true});
  let id=0,stderr='';const pending=new Map();
  child.stderr.on('data',x=>stderr+=x);
  createInterface({input:child.stdout}).on('line',line=>{const r=JSON.parse(line);const p=pending.get(r.id);if(p){pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result);}});
  child.on('exit',code=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(`MCP exit ${code}: ${stderr}`));}});
  const rpc=(method,params)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error(`MCP timeout ${method}`));},120000);pending.set(n,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n');});
  await rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'local-game-art-study',version:'1'}});
  const call=async(name,args={})=>{const r=await rpc('tools/call',{name,arguments:args});const txt=r.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n');if(r.isError||/^error:/i.test(txt??''))throw Error(`${name}: ${txt}`);let result=r.structuredContent?.result??txt;try{if(typeof result==='string')result=JSON.parse(result);}catch{}if(result?.ok===false)throw Error(`${name}: ${JSON.stringify(result)}`);return result;};
  await call('turtlepen_help');
  return {call,close:()=>child.stdin.end()};
}
