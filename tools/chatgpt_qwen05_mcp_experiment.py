# Temporary isolated Qwen 0.5B MCP experiment; never merge this harness.
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

REPO = Path.cwd()
SERVER = REPO / "src" / "mcp" / "server.js"
OUT = REPO / "qwen05_results"
OUT.mkdir(exist_ok=True)
MODEL_ID = "Qwen/Qwen2.5-0.5B-Instruct"
MAX_TURNS = 12
SELECTED_TOOLS = {
    "turtlepen_help", "new_diagram", "measure", "place_box", "pen", "plan",
    "validate", "ascii", "move", "resize", "restyle", "remove", "render", "save"
}

class MCP:
    def __init__(self, cwd: Path):
        self.cwd = cwd
        self.next_id = 1
        self.proc = None
        self.tools = []

    def start(self):
        self.proc = subprocess.Popen(
            ["node", str(SERVER)], cwd=self.cwd,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, bufsize=1,
        )
        init = self.raw("initialize", {
            "protocolVersion": "2025-06-18", "capabilities": {},
            "clientInfo": {"name": "qwen05-agent-harness", "version": "1"},
        })
        self.notify("notifications/initialized", {})
        listed = self.raw("tools/list", {})
        self.tools = listed.get("result", {}).get("tools", [])
        return init

    def raw(self, method, params):
        rid = self.next_id
        self.next_id += 1
        msg = {"jsonrpc": "2.0", "id": rid, "method": method, "params": params}
        self.proc.stdin.write(json.dumps(msg) + "\n")
        self.proc.stdin.flush()
        while True:
            line = self.proc.stdout.readline()
            if not line:
                err = self.proc.stderr.read()
                raise RuntimeError(f"MCP exited while waiting for {method}: {err}")
            reply = json.loads(line)
            if reply.get("id") == rid:
                return reply

    def notify(self, method, params):
        self.proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": method, "params": params}) + "\n")
        self.proc.stdin.flush()

    def call(self, name, arguments=None):
        return self.raw("tools/call", {"name": name, "arguments": arguments or {}})

    @staticmethod
    def text(reply):
        try:
            return reply["result"]["content"][0]["text"]
        except Exception:
            return json.dumps(reply)

    @staticmethod
    def is_error(reply):
        return bool(reply.get("error")) or bool(reply.get("result", {}).get("isError"))

    def close(self):
        if self.proc:
            try:
                self.proc.stdin.close()
            except Exception:
                pass
            try:
                self.proc.wait(timeout=5)
            except Exception:
                self.proc.kill()


def first_json_object(text):
    dec = json.JSONDecoder()
    for i, ch in enumerate(text):
        if ch != "{":
            continue
        try:
            obj, _ = dec.raw_decode(text[i:])
            if isinstance(obj, dict):
                return obj
        except Exception:
            continue
    return None


def compact_tool_contract(tools):
    rows = []
    for t in tools:
        if t.get("name") not in SELECTED_TOOLS:
            continue
        schema = t.get("inputSchema", {})
        rows.append(f"{t['name']}: {json.dumps(schema, separators=(',', ':'))}")
    return "\n".join(rows)

BASE_SYSTEM = """You are controlling TurtlePen through a REAL MCP server. You do not edit files or source code directly.
On EVERY turn output EXACTLY ONE JSON object and nothing else.
Choose one form:
{"tool":"TOOL_NAME","arguments":{...}}
or
{"final":"DONE: short reason"}
Never invent a tool result. After a tool call, you will receive the real TurtlePen result.
Coordinates use Excel-like cells, e.g. C5.tl. Typical connector programs look like:
pen source.E
right to target.W arrow
A routed feedback path can use line segments, for example:
pen review.S
down 8 line
left 20 line
up to plan.S arrow
Use measure before choosing a compact box for a long label if you think it helps.
You may use plan for rehearsal, or author incrementally. A plan result that says FAILED means nothing was applied.
"""

CONDITIONS = {
    "self_assured": """You are an expert diagram author. Work quickly and confidently. Trust your chosen geometry and avoid unnecessary checking. Validation is optional unless a tool call itself fails. Do not waste turns rechecking work you already believe is correct.""",
    "validator_strict": """You must treat validation as the completion gate. Never finish unless TurtlePen validate explicitly reports CLEAN. If it is not clean, continue working and validating until it is clean.""",
    "fault_aware": """Tool feedback is ground truth, not a suggestion. If plan says FAILED, change the operation instead of repeating it. If validate reports a finding, use the reported location/fix to change geometry, then revalidate. Never repeat an identical call after it produced the same fault. If two repair attempts do not improve the state, inspect with ascii or help and choose a different strategy. Do not force past findings. Never finish unless validate reports CLEAN.""",
}

TASK_TEMPLATE = """Create a new 60x32 technical loop diagram named qwen05-{condition}.
Put four labeled boxes in a clear left-to-right flow: REQUEST -> PLAN -> EXECUTE -> VISUAL REVIEW.
Connect adjacent boxes with arrowed connectors. Add a feedback connector from VISUAL REVIEW back to PLAN, routed underneath the boxes rather than through them.
Keep the layout compact, but every label must be readable. You may resize or move elements when TurtlePen shows a problem.
Save to {condition}.turtlepen.json and render to {condition}.svg when you believe the work is finished.
"""


def generate(model, tokenizer, messages):
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    batch = tokenizer([text], return_tensors="pt")
    with torch.inference_mode():
        out = model.generate(
            **batch,
            max_new_tokens=160,
            do_sample=False,
            repetition_penalty=1.05,
            eos_token_id=tokenizer.eos_token_id,
            pad_token_id=tokenizer.eos_token_id,
        )
    new = out[0][batch["input_ids"].shape[1]:]
    return tokenizer.decode(new, skip_special_tokens=True).strip()


def parse_validate_text(text):
    try:
        j = json.loads(text)
        s = j.get("summary", {})
        return {"clean": bool(s.get("clean")), "summary": s, "open": j.get("open", [])}
    except Exception:
        return {"clean": "CLEAN" in text and "NOT CLEAN" not in text, "raw": text[:3000]}


def run_condition(condition, model, tokenizer):
    work = OUT / condition
    work.mkdir(exist_ok=True)
    mcp = MCP(work)
    init = mcp.start()
    contract = compact_tool_contract(mcp.tools)
    system = BASE_SYSTEM + "\nCONDITION-SPECIFIC POLICY:\n" + CONDITIONS[condition] + "\n\nAVAILABLE TOOL SCHEMAS:\n" + contract
    task = TASK_TEMPLATE.format(condition=condition)
    messages = [{"role": "system", "content": system}, {"role": "user", "content": task}]

    transcript = []
    tool_calls = []
    malformed = 0
    validation_calls = 0
    plan_failures = 0
    repeated_identical_calls = 0
    last_call_key = None
    declared_final = False
    final_text = None

    for turn in range(1, MAX_TURNS + 1):
        raw = generate(model, tokenizer, messages)
        obj = first_json_object(raw)
        entry = {"turn": turn, "model_raw": raw, "parsed": obj}
        transcript.append(entry)
        messages.append({"role": "assistant", "content": raw})

        if not obj:
            malformed += 1
            feedback = "FORMAT ERROR: no valid JSON object found. Output exactly one JSON object using the required form."
            messages.append({"role": "user", "content": feedback})
            continue

        if "final" in obj:
            declared_final = True
            final_text = str(obj.get("final"))
            entry["declared_final"] = final_text
            break

        tool = obj.get("tool")
        args = obj.get("arguments", {})
        if tool not in SELECTED_TOOLS or not isinstance(args, dict):
            feedback = f"ACTION ERROR: unsupported tool/action. Allowed tools: {sorted(SELECTED_TOOLS)}"
            entry["feedback"] = feedback
            messages.append({"role": "user", "content": feedback})
            continue

        call_key = json.dumps({"tool": tool, "arguments": args}, sort_keys=True)
        if call_key == last_call_key:
            repeated_identical_calls += 1
        last_call_key = call_key

        reply = mcp.call(tool, args)
        text = mcp.text(reply)
        err = mcp.is_error(reply)
        if tool == "validate":
            validation_calls += 1
        if tool == "plan" and "plan FAILED" in text:
            plan_failures += 1
        tool_calls.append({"turn": turn, "tool": tool, "arguments": args, "is_error": err, "result": text})
        entry["tool_reply"] = {"tool": tool, "is_error": err, "text": text}
        trimmed = text if len(text) <= 2400 else text[:2400] + "\n...[trimmed]"
        feedback = ("TOOL ERROR:\n" if err else "TOOL RESULT:\n") + trimmed
        messages.append({"role": "user", "content": feedback})

        if len(messages) > 12:
            messages = messages[:2] + messages[-10:]

    eval_result = {
        "condition": condition,
        "model": MODEL_ID,
        "max_turns": MAX_TURNS,
        "declared_final": declared_final,
        "final_text": final_text,
        "turns_used": len(transcript),
        "malformed_responses": malformed,
        "model_tool_calls": len(tool_calls),
        "validation_calls": validation_calls,
        "plan_failures": plan_failures,
        "repeated_identical_calls": repeated_identical_calls,
        "tool_calls": tool_calls,
        "transcript": transcript,
        "mcp_initialize": init,
    }

    try:
        vr = mcp.call("validate", {"format": "json"})
        vtext = mcp.text(vr)
        eval_result["controller_validate"] = parse_validate_text(vtext)
    except Exception as e:
        eval_result["controller_validate"] = {"clean": False, "error": repr(e)}

    clean = bool(eval_result["controller_validate"].get("clean"))
    eval_result["premature_done"] = bool(declared_final and not clean)
    eval_result["max_turn_exhausted"] = not declared_final

    try:
        rr = mcp.call("render", {"path": f"{condition}-controller-final.svg", "force": True, "bounds": "canvas"})
        eval_result["controller_render"] = mcp.text(rr)
    except Exception as e:
        eval_result["controller_render"] = repr(e)
    try:
        sr = mcp.call("save", {"path": f"{condition}-controller-final.turtlepen.json", "force": True})
        eval_result["controller_save"] = mcp.text(sr)
    except Exception as e:
        eval_result["controller_save"] = repr(e)

    mcp.close()
    (work / "run.json").write_text(json.dumps(eval_result, indent=2))
    return eval_result


def md_summary(results, elapsed, model_load_seconds):
    lines = [
        "# TurtlePen Qwen2.5-0.5B MCP Experiment", "", f"Model: `{MODEL_ID}`",
        f"Model load seconds: {model_load_seconds:.1f}", f"Total experiment seconds: {elapsed:.1f}",
        f"Max agent turns per condition: {MAX_TURNS}", "", "## Conditions", "",
        "- `self_assured`: validation optional; trust own geometry.",
        "- `validator_strict`: cannot finish until CLEAN, no explicit anti-loop repair strategy.",
        "- `fault_aware`: validator authoritative; repair findings, do not repeat failed calls, inspect/change strategy.",
        "", "## Results", "",
        "| condition | turns | model tool calls | validate calls | malformed | repeats | declared final | controller clean | premature done | exhausted |",
        "|---|---:|---:|---:|---:|---:|---|---|---|---|",
    ]
    for r in results:
        lines.append(f"| {r['condition']} | {r['turns_used']} | {r['model_tool_calls']} | {r['validation_calls']} | {r['malformed_responses']} | {r['repeated_identical_calls']} | {r['declared_final']} | {r['controller_validate'].get('clean', False)} | {r['premature_done']} | {r['max_turn_exhausted']} |")
    lines += ["", "## Structural findings at controller evaluation", ""]
    for r in results:
        lines += [f"### {r['condition']}", "```json", json.dumps(r["controller_validate"], indent=2)[:12000], "```", ""]
    lines += ["## Notes", "", "The controller-side validate/render/save calls happen after the model stops and are not visible to the model. They prevent the model from declaring success without an independent final check."]
    return "\n".join(lines)


def main():
    torch.set_num_threads(max(1, min(4, os.cpu_count() or 2)))
    load_start = time.time()
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForCausalLM.from_pretrained(MODEL_ID, torch_dtype=torch.float32)
    model.eval()
    model_load_seconds = time.time() - load_start
    print(f"Loaded {MODEL_ID} in {model_load_seconds:.1f}s", flush=True)

    start = time.time()
    results = []
    for condition in CONDITIONS:
        print(f"=== RUN {condition} ===", flush=True)
        r = run_condition(condition, model, tokenizer)
        results.append(r)
        print(json.dumps({k: r[k] for k in ["condition","turns_used","malformed_responses","model_tool_calls","validation_calls","repeated_identical_calls","declared_final","premature_done","max_turn_exhausted"]}, indent=2), flush=True)
        print("controller clean:", r["controller_validate"].get("clean"), flush=True)

    elapsed = time.time() - start
    combined = {"model": MODEL_ID, "model_load_seconds": model_load_seconds, "elapsed_seconds": elapsed, "results": results}
    (OUT / "combined-results.json").write_text(json.dumps(combined, indent=2))
    (OUT / "REPORT.md").write_text(md_summary(results, elapsed, model_load_seconds))
    print((OUT / "REPORT.md").read_text(), flush=True)

if __name__ == "__main__":
    main()
