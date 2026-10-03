#!/usr/bin/env python3
"""Summarize bench/run.sh output into raw CSV, JSON summary and break-even estimates."""
import csv, glob, json, os, statistics, sys

out = sys.argv[1] if len(sys.argv) > 1 else "results/bench"
rows = []

def add(trial, runtime, bench, metric, value, unit="ms"):
    rows.append({"trial": trial, "runtime": runtime, "bench": bench, "metric": metric, "value": value, "unit": unit})

def program_json(stdout):
    for line in reversed(stdout.strip().splitlines()):
        if line.startswith("{"):
            return json.loads(line)
    return None

meta = {}
for f in sorted(glob.glob(os.path.join(out, "lab-trial*.json"))):
    trial = int(f.split("trial")[-1].split(".")[0])
    d = json.load(open(f))
    meta["lab_user_agent"] = d["userAgent"]
    for i, p in enumerate(d["programs"]):
        b = p["file"].replace(".py", "").replace("bench_", "")
        ev = p["evidence"]
        if i == 0:
            add(trial, "lab", "*", "asset_fetch", ev["assetDownloadMs"])
            add(trial, "lab", "*", "compiler_worker_init", ev["compilerInitMs"])
            add(trial, "lab", "*", "asset_bytes", ev["assetBytes"], "bytes")
        st = {s["name"]: s["ms"] for s in ev["compile"]["stages"]}
        add(trial, "lab", b, "vfs_setup", st["vfs-setup"])
        add(trial, "lab", b, "python_to_c", st["python-to-c"])
        add(trial, "lab", b, "c_compile", st["c-compile"])
        add(trial, "lab", b, "link", st["link"])
        add(trial, "lab", b, "compile_total_wall", ev["compile"]["totalMs"])
        add(trial, "lab", b, "wasm_bytes", ev["compile"]["wasmBytes"], "bytes")
        run = ev["run"]
        add(trial, "lab", b, "wasm_compile", run["wasmCompileMs"])
        add(trial, "lab", b, "runtime_fs_setup", run["runtimeFsMs"])
        for k, r in enumerate(run["runs"]):
            tag = "first" if k == 0 else "repeat"
            add(trial, "lab", b, f"instantiate_{tag}", r["instantiateMs"])
            add(trial, "lab", b, f"process_run_{tag}", r["ms"])
            add(trial, "lab", b, f"linear_memory_{tag}", r["memoryBytes"], "bytes")
            pj = program_json(r["stdout"])
            if pj:
                add(trial, "lab", b, f"imports_{tag}", pj["import_ms"])
                add(trial, "lab", b, f"work_first_in_process_{tag}", pj["work_ms"][0])
                for w in pj["work_ms"][1:]:
                    add(trial, "lab", b, f"work_repeat_in_process_{tag}", w)
                add(trial, "lab", b, "result", 0, json.dumps(pj.get("result") or pj.get("result_sha")))

for f in sorted(glob.glob(os.path.join(out, "pyodide-trial*.json"))):
    trial = int(f.split("trial")[-1].split(".")[0])
    d = json.load(open(f))
    meta["pyodide_user_agent"] = d["userAgent"]
    for p in d["results"]:
        b = p["file"].replace(".py", "").replace("bench_", "")
        add(trial, "pyodide", b, "setup_core", p["setup"]["coreMs"])
        add(trial, "pyodide", b, "setup_packages", p["setup"]["packagesMs"])
        for k, r in enumerate(p["runs"]):
            tag = "first" if k == 0 else "repeat"
            add(trial, "pyodide", b, f"process_run_{tag}", r["ms"])
            pj = program_json(r["stdout"])
            if pj:
                add(trial, "pyodide", b, f"imports_{tag}", pj["import_ms"])
                add(trial, "pyodide", b, f"work_first_in_process_{tag}", pj["work_ms"][0])
                for w in pj["work_ms"][1:]:
                    add(trial, "pyodide", b, f"work_repeat_in_process_{tag}", w)
                add(trial, "pyodide", b, "result", 0, json.dumps(pj.get("result") or pj.get("result_sha")))

with open(os.path.join(out, "raw.csv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=["trial", "runtime", "bench", "metric", "value", "unit"])
    w.writeheader(); w.writerows(rows)

stats = {}
for r in rows:
    if r["metric"] == "result":
        continue
    stats.setdefault((r["runtime"], r["bench"], r["metric"]), []).append(r["value"])
summary = []
for (rt, b, m), v in sorted(stats.items()):
    summary.append({"runtime": rt, "bench": b, "metric": m, "n": len(v), "median": statistics.median(v),
                    "min": min(v), "max": max(v), "stdev": statistics.stdev(v) if len(v) > 1 else 0.0})
med = {(s["runtime"], s["bench"], s["metric"]): s["median"] for s in summary}
with open(os.path.join(out, "summary.csv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=["runtime", "bench", "metric", "n", "median", "min", "max", "stdev"])
    w.writeheader(); w.writerows(summary)

results_match = {}
for b in ("python", "sympy"):
    res = {rt: {r["unit"] for r in rows if r["runtime"] == rt and r["bench"] == b and r["metric"] == "result"} for rt in ("lab", "pyodide")}
    results_match[b] = {"lab": sorted(res["lab"]), "pyodide": sorted(res["pyodide"]), "identical": res["lab"] == res["pyodide"] and len(res["lab"]) == 1}

def breakeven(fixed_extra, per_run_lab, per_run_pyo):
    gain = per_run_pyo - per_run_lab
    return None if gain <= 0 else fixed_extra / gain

be = {}
setup_lab = med[("lab", "*", "asset_fetch")] + med[("lab", "*", "compiler_worker_init")]
for b in ("python", "sympy"):
    compile_ms = med[("lab", b, "compile_total_wall")]
    setup_pyo = med[("pyodide", b, "setup_core")] + med[("pyodide", b, "setup_packages")]
    compile_ms += med[("lab", b, "wasm_compile")] + med[("lab", b, "runtime_fs_setup")]
    lab_proc = med[("lab", b, "process_run_repeat")]
    pyo_proc = med[("pyodide", b, "process_run_repeat")]
    lab_work = med[("lab", b, "work_repeat_in_process_first")]
    pyo_work = med[("pyodide", b, "work_repeat_in_process_first")]
    be[b] = {
        "compile_ms": compile_ms,
        "scenario_whole_program_rerun": {
            "desc": "compile once, then rerun the whole program n times (lab: new Wasm instance per run incl. CPython init + imports; pyodide: same warm interpreter, sympy cache cleared)",
            "lab_fixed_ms": setup_lab + compile_ms, "pyodide_fixed_ms": setup_pyo,
            "lab_per_run_ms": lab_proc, "pyodide_per_run_ms": pyo_proc,
            "break_even_runs": breakeven(setup_lab + compile_ms - setup_pyo, lab_proc, pyo_proc)},
        "scenario_hot_loop": {
            "desc": "compile once, then call the workload n more times inside one process (excludes startup/imports on both sides)",
            "lab_per_call_ms": lab_work, "pyodide_per_call_ms": pyo_work,
            "speedup": pyo_work / lab_work if lab_work else None,
            "break_even_calls": breakeven(compile_ms, lab_work, pyo_work)},
    }

meta["host"] = {"cpu": next((l.split(":", 1)[1].strip() for l in open("/proc/cpuinfo") if l.startswith("model name")), None),
                "cpus": os.cpu_count(), "mem_kib": int(open("/proc/meminfo").readline().split()[1]), "kernel": os.uname().release}
meta["cache_policy"] = ("each trial: fresh headless Chrome profile (cold HTTP + Cache API), assets served from localhost; "
                        "within a trial the 2nd program reuses the prefetched toolchain (cached-toolchain compile of fresh source); "
                        "SymPy cache cleared before every measured workload call (sympy.core.cache.clear_cache)")
json.dump({"meta": meta, "summary": summary, "results_match": results_match, "break_even": be},
          open(os.path.join(out, "summary.json"), "w"), indent=1)
print(json.dumps({"results_match": results_match, "break_even": be}, indent=1))
