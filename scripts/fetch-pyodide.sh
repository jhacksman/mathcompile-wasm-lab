#!/bin/sh
# Pyodide 0.25.1 (CPython 3.11.3, SymPy 1.12, mpmath 1.3.0) baseline, served same-origin from web/pyodide.
set -e
cd "$(dirname "$0")/../web"
mkdir -p pyodide && cd pyodide
BASE=https://cdn.jsdelivr.net/pyodide/v0.25.1/full
for f in pyodide.mjs pyodide.asm.js pyodide.asm.wasm python_stdlib.zip pyodide-lock.json \
         sympy-1.12-py3-none-any.whl mpmath-1.3.0-py3-none-any.whl; do
  [ -f "$f" ] || curl -sfLO "$BASE/$f"
done
sha256sum -c ../../locks/pyodide.sha256
