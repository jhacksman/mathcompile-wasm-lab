#!/bin/sh
# Offline unseen-source proof: generate a new random program, compile+run it in the lab with the server killed and
# the browser offline, then run the same file in Pyodide and require identical stdout.
set -e
cd "$(dirname "$0")/.."
python3 tests/gen-unseen.py results/offline-unseen-source.py
node tests/browser-e2e.mjs results/offline-unseen-source.py --offline --out results/offline-unseen-proof.json
node tests/pyodide-run.mjs results/offline-unseen-pyodide.json results/offline-unseen-source.py
node tests/offline-check.mjs
