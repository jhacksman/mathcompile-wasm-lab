#!/bin/sh
# Benchmark: lab (compile in browser, run compiled Wasm) vs Pyodide 0.25.1 (interpret), same workloads.
# Each trial launches a fresh headless Chrome profile (cold HTTP cache) and compiles a fresh source variant.
set -e
cd "$(dirname "$0")/.."
: "${CHROME:?set CHROME=/path/to/chrome}"
TRIALS=${TRIALS:-3}
OUT=${OUT:-results/bench}
mkdir -p "$OUT" /tmp/lab-bench
for t in $(seq 1 "$TRIALS"); do
  echo "trial $t start $(date -u +%FT%TZ) loadavg $(cut -d" " -f1-3 /proc/loadavg)" >> "$OUT/load.log"
  for b in bench_python bench_sympy; do
    # fresh, previously unseen source per trial (changes source hash, forces a full recompile)
    { cat bench/$b.py; echo "# trial $t nonce $(od -An -N8 -tx8 /dev/urandom | tr -d ' ')"; } > /tmp/lab-bench/$b.py
  done
  PORT=8645 node tests/browser-e2e.mjs /tmp/lab-bench/bench_python.py /tmp/lab-bench/bench_sympy.py \
    --repeat 3 --out "$OUT/lab-trial$t.json" > "$OUT/lab-trial$t.log" 2>&1
  PORT=8646 node tests/pyodide-run.mjs "$OUT/pyodide-trial$t.json" bench/bench_python.py bench/bench_sympy.py \
    --repeat 3 > "$OUT/pyodide-trial$t.log" 2>&1
done
python3 bench/summarize.py "$OUT"
