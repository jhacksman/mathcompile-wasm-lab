#!/bin/sh
# Milestone E proof: the self-compiled Nuitka (web/assets/nuitka-selfc.wasm, see experiments/selfcompile/) is the
# frontend in the browser (?selfc=1). A new random program plus python_basics.py are compiled and run offline, then
# compared with Pyodide (stdout, exit codes, trusted values).
set -e
cd "$(dirname "$0")/.."
python3 tests/gen-unseen.py results/selfc-unseen-source.py
node tests/browser-e2e.mjs results/selfc-unseen-source.py tests/cases/python_basics.py --selfc --offline --out results/selfc-browser-proof.json
node tests/pyodide-run.mjs results/selfc-pyodide.json results/selfc-unseen-source.py tests/cases/python_basics.py
node tests/compare.mjs results/selfc-browser-proof.json results/selfc-pyodide.json results/selfc-comparison.json
