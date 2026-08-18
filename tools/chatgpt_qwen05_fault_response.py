import json
import os
import subprocess
import time
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

REPO = Path.cwd()
SERVER = REPO / "src" / "mcp" / "server.js"
OUT = REPO / "qwen05_fault_response_results"
OUT.mkdir(exist_ok=True)
MODEL_ID = "Qwen/Qwen2.5-0.5B-Instruct"
MAX_TURNS = 8
ALLOWED = {"validate", "move", "resize", "restyle", "ascii", "describe"}

class MCP:
    def __init__(self, cwd):
        self.cwd = cwd
        self.i = 1
    def start(self):
        self.p = subprocess.Popen(["node", str(SERVER)], cwd=self.cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
        self.raw("initialize", {"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"qwen05-fault-response","version":"1"}})
        self.notify("notifications/initialized", {})
        self.tools = self.raw("tools/list", {})["result"]["tools"]
    def raw(self, method, params):
        rid=self.i; self.i+=1
        self.p.stdin.write(json.dumps({"jsonrpc":"2.0","id":rid,"method":method,"params":params})+"\n"); self.p.stdin.flush()
        while True:
            line=self.p.stdout.readline()
            if not line: raise RuntimeError(self.p.stderr.read())
            r=json.loads(line)
            if r.get("id")==rid: return r
    def notify(self, method, params):
        self.p.stdin.write(json.dumps({"jsonrpc":"2.0","method":method,"params":params})+"\n"); self.p.stdin.flush()
    def call(self, name, args=None): return self.raw("tools/call", {"name":name,"arguments":args or {}})
    @staticmethod
    def text(r):
        try:return r["result"]["content"][0]["text"]
        except:return json.dumps(r)
    @staticmethod
    def err(r): return bool(r.get("error")) or bool(r.get("result",{}).get("isError"))
    def close(self):
        try:self.p.stdin.close(); self.p.wait(timeout=3)
        except: self.p.kill()

def json_obj(s):
    d=json.JSONDecoder()
    for i,c in enumerate(s):
        if c!='{': continue
        try:
            o,_=d.raw_decode(s[i:])
            if isinstance(o,dict): return o
        except: pass
    return None

def val(text):
    try:
        j=json.loads(text); return {"clean":bool(j.get("summary",{}).get("clean")),"summary":j.get("summary",{}),"open":j.get("open",[])}
    except:return {"clean":False,"raw":text[:5000]}

def contract(tools):
    rows=[]
    for t in tools:
        if t['name'] in ALLOWED: rows.append(f"{t['name']}: {json.dumps(t['inputSchema'],separators=(',',':'))}")
    return '\n'.join(rows)

CONDITIONS={
 "self_assured":"You are highly confident in your own visual reasoning. Treat validator findings as useful hints, not commands. Make only changes you personally think are necessary, and finish as soon as you believe the diagram is acceptable.",
 "validator_strict":"The validator is the completion gate. You may not finish until validate says CLEAN. Keep validating until it is CLEAN.",
 "fault_aware":"Validator/tool output is authoritative evidence. Read each finding and its proposed fixes, make a concrete geometry repair, then revalidate. Never repeat the same call after it returns the same state/error. If validation does not improve after a repair, inspect with describe/ascii and change strategy. Do not delete either required box or change its label."
}

BASE="""You control an already-open TurtlePen diagram through its REAL MCP server.
Output exactly one JSON object per turn. Preferred form: {"tool":"validate","arguments":{"format":"json"}} or {"final":"DONE"}.
For this experiment the harness will forgive a minor wrapper mistake: if you put tool arguments at top level instead of under "arguments", it will normalize them. This is intentional so the experiment measures fault handling rather than JSON-wrapper skill.
You may use only: validate, move, resize, restyle, ascii, describe.
Do not invent tool results.
The required final content is exactly two boxes with labels PLAN and VISUAL REVIEW. You must repair the existing diagram; do not delete or rename those boxes.
"""

def gen(model,tok,msgs):
    text=tok.apply_chat_template(msgs,tokenize=False,add_generation_prompt=True)
    x=tok([text],return_tensors='pt')
    with torch.inference_mode():
        y=model.generate(**x,max_new_tokens=130,do_sample=False,repetition_penalty=1.05,eos_token_id=tok.eos_token_id,pad_token_id=tok.eos_token_id)
    return tok.decode(y[0][x['input_ids'].shape[1]:],skip_special_tokens=True).strip()

def seed(mcp, cond):
    mcp.call('new_diagram', {"name":f"fault-seed-{cond}","path":f"{cond}.turtlepen.json","cols":48,"rows":24,"fontSize":10})
    # Deliberate overlap plus label fit faults.
    mcp.call('place_box', {"id":"plan","at":"C5.tl","span":{"w":7,"h":3},"label":"PLAN","corner":"rounded"})
    mcp.call('place_box', {"id":"review","at":"H5.tl","span":{"w":7,"h":3},"label":"VISUAL REVIEW","corner":"rounded"})
    return MCP.text(mcp.call('validate', {"format":"json"}))

def run(cond, model, tok):
    wd=OUT/cond; wd.mkdir(exist_ok=True)
    m=MCP(wd); m.start(); initial=seed(m,cond); initial_v=val(initial)
    sysmsg=BASE+"\nCONDITION:\n"+CONDITIONS[cond]+"\n\nTOOL SCHEMAS:\n"+contract(m.tools)
    task="Repair the seeded diagram. Here is the REAL initial validator output:\n"+initial[:6500]
    msgs=[{"role":"system","content":sysmsg},{"role":"user","content":task}]
    tr=[]; calls=[]; repeats=0; validate_calls=0; malformed=0; mixed=0; last=None; done=False
    for turn in range(1,MAX_TURNS+1):
        raw=gen(model,tok,msgs); o=json_obj(raw); ent={"turn":turn,"raw":raw,"parsed":o}; tr.append(ent); msgs.append({"role":"assistant","content":raw})
        if not o:
            malformed+=1; msgs.append({"role":"user","content":"FORMAT ERROR: output one JSON object."}); continue
        if 'tool' not in o and 'final' in o:
            done=True; ent['final']=o['final']; break
        tool=o.get('tool')
        if tool not in ALLOWED:
            msgs.append({"role":"user","content":f"ACTION ERROR: allowed tools are {sorted(ALLOWED)}"}); continue
        if 'final' in o: mixed+=1
        args=o.get('arguments')
        if not isinstance(args,dict): args={k:v for k,v in o.items() if k not in {'tool','final','additionalProperties'}}
        key=json.dumps({"tool":tool,"arguments":args},sort_keys=True)
        if key==last: repeats+=1
        last=key
        r=m.call(tool,args); text=MCP.text(r); er=MCP.err(r)
        if tool=='validate': validate_calls+=1
        calls.append({"turn":turn,"tool":tool,"arguments":args,"error":er,"result":text}); ent['tool_reply']=calls[-1]
        msgs.append({"role":"user","content":('TOOL ERROR:\n' if er else 'TOOL RESULT:\n')+(text[:3500])})
        if len(msgs)>12: msgs=msgs[:2]+msgs[-10:]
    final_text=MCP.text(m.call('validate', {"format":"json"})); final_v=val(final_text)
    desc_text=MCP.text(m.call('describe', {}))
    try:
        desc=json.loads(desc_text); els=[e for p in desc for e in p.get('elements',[])]
    except: els=[]
    labels=sorted([e.get('label') for e in els if e.get('kind')=='box'])
    content_ok=(labels==['PLAN','VISUAL REVIEW'])
    complete=bool(final_v.get('clean') and content_ok)
    m.call('render', {"path":f"{cond}-final.svg","force":True,"bounds":"canvas"})
    m.call('save', {"path":f"{cond}-final.turtlepen.json","force":True})
    m.close()
    out={"condition":cond,"initial_validate":initial_v,"turns":len(tr),"calls":calls,"transcript":tr,"validate_calls":validate_calls,"repeats":repeats,"malformed":malformed,"mixed_tool_and_final":mixed,"declared_final":done,"final_validate":final_v,"labels":labels,"content_ok":content_ok,"task_complete":complete,"exhausted":not done}
    (wd/'run.json').write_text(json.dumps(out,indent=2)); return out

def report(rs,load_s,elapsed):
    L=['# Qwen2.5-0.5B TurtlePen Fault-Response Experiment','',f'Model: `{MODEL_ID}`',f'Model load: {load_s:.1f}s',f'Experiment: {elapsed:.1f}s','', '| condition | turns | calls | validate calls | repeats | declared final | structural clean | content intact | task complete | exhausted |','|---|---:|---:|---:|---:|---|---|---|---|---|']
    for r in rs:L.append(f"| {r['condition']} | {r['turns']} | {len(r['calls'])} | {r['validate_calls']} | {r['repeats']} | {r['declared_final']} | {r['final_validate'].get('clean',False)} | {r['content_ok']} | {r['task_complete']} | {r['exhausted']} |")
    L+=['','## Initial faults','```json',json.dumps(rs[0]['initial_validate'],indent=2)[:10000],'```','']
    for r in rs:
        L += [f"## {r['condition']}", '', 'Tool sequence: `'+ ' -> '.join(c['tool'] for c in r['calls']) +'`', '', 'Final validator:', '```json', json.dumps(r['final_validate'],indent=2)[:10000], '```', '']
    return '\n'.join(L)

def main():
    torch.set_num_threads(max(1,min(4,os.cpu_count() or 2)))
    t=time.time(); tok=AutoTokenizer.from_pretrained(MODEL_ID); model=AutoModelForCausalLM.from_pretrained(MODEL_ID,torch_dtype=torch.float32); model.eval(); load=time.time()-t
    start=time.time(); rs=[]
    for c in CONDITIONS:
        print('RUN',c,flush=True); r=run(c,model,tok); rs.append(r); print(json.dumps({k:r[k] for k in ['condition','turns','validate_calls','repeats','declared_final','content_ok','task_complete','exhausted']},indent=2),flush=True)
    elapsed=time.time()-start
    (OUT/'combined.json').write_text(json.dumps({"model":MODEL_ID,"load_s":load,"elapsed_s":elapsed,"results":rs},indent=2))
    (OUT/'REPORT.md').write_text(report(rs,load,elapsed)); print((OUT/'REPORT.md').read_text(),flush=True)
if __name__=='__main__': main()
