#!/bin/sh
# Milestone E, step 2: run the self-compiled Nuitka (a Wasm program, no python.wasm involved) on fresh source under
# wasmtime with the same environment as the interpreted frontend (experiments/host-frontend/wnuitka-gen.sh). The
# compiled modules locate their data files (static_src, inline_copy, ...) relative to "./nuitka/..." and the
# WASI cwd is "/", so the Nuitka package directory itself is mounted at /nuitka.
# The standalone binary ignores PYTHONPATH (sys.path = [its own dir]); nuitka/__main__.py honours the
# NUITKA_PYTHONPATH(_AST) re-execution variables, which give the target-Python import probes the real stdlib path.
# Its own "os"/"encodings" modules are compiled in, so NUITKA_WASI_TARGET_STDLIB names the target stdlib directory
# for standard-library detection and the early-import probe (patched StandardLibrary.py / ImportDetection.py).
# usage: run-selfc.sh SELFC.wasm NAME SRC.py   -> plan in $HOME/work/fs/work/NAME/plan.jsonl
set -e
WASM=$1; NAME=$2; SRC=$3
mkdir -p $HOME/work/fs/work/$NAME; cp "$SRC" $HOME/work/fs/work/$NAME/main.py
rm -f $HOME/work/fs/work/$NAME/plan.jsonl
exec wasmtime run -W max-wasm-stack=8388608 --dir $HOME/work/fs::/ --dir $HOME/work/nuitka-wasi/nuitka::/nuitka \
  --dir $HOME/work/toolchain::/toolchain --env NUITKA_WASI_TARGET_STDLIB=/usr/local/lib/python3.11 --env PYTHONPATH=/usr/local/lib/python3.11/site-packages \
  --env PYTHONHASHSEED=0 --env NUITKA_WASI_FRONTEND=1 --env CC=/toolchain/bin/clang --env PATH=/toolchain/bin \
  --env HOME=/tmp --env NUITKA_WASI_BUILD_PLAN=/work/$NAME/plan.jsonl --env NUITKA_WASI_PROBE_CACHE=/toolchain/probe-cache.json \
  --env NUITKA_WASI_PYTHON_PREFIX=/target --env NUITKA_PYTHONPATH_AST=/usr/local/lib/python3.11 \
  --env "NUITKA_PYTHONPATH=['/usr/local/lib/python3.11/site-packages', '/usr/local/lib/python3.11', '/usr/local/lib/python3.11/lib-dynload']" -- "$WASM" /work/$NAME/main.py --standalone --static-libpython=yes \
  --disable-ccache --lto=no --no-progressbar --jobs=1 --nofollow-import-to=sympy --nofollow-import-to=mpmath \
  --output-dir=/work/$NAME/out
