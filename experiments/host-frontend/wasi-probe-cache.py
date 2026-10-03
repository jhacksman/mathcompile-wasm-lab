#!/usr/bin/env python3
"""Record target-Python probe results for the WASI-hosted Nuitka frontend.

Runs the pending probe request with the same python.wasm and file system layout
under wasmtime and stores stdout/stderr/exit code in the cache JSON.
"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))

cache_host, runner = sys.argv[1], sys.argv[2:]
pending = cache_host + ".pending.json"
req = json.load(open(pending))
cache = json.load(open(cache_host)) if os.path.exists(cache_host) else {}
args = req["args"]
if args[0] == "<python>":
    cmd = runner + args[1:]
elif os.path.basename(args[0]) in ("clang", "wasm-ld"):
    cmd = ["node", os.path.join(HERE, "yclang.mjs"), os.path.basename(args[0])] + args[1:]
else:
    sys.exit("refusing to record unknown tool %r" % args[0])
p = subprocess.run(cmd, input=req["stdin"].encode(), capture_output=True, cwd=HERE)
cache[req["key"]] = {
    "args": req["args"], "stdin": req["stdin"],
    "stdout": p.stdout.decode(), "stderr": p.stderr.decode(), "exit_code": p.returncode,
}
json.dump(cache, open(cache_host, "w"), indent=1, sort_keys=True)
os.remove(pending)
print("recorded", req["key"], "exit", p.returncode, "stderr bytes", len(p.stderr))
