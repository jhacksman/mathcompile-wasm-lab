#!/bin/sh
# Milestone E, step 1: compile the Nuitka package itself with the WASI-hosted Nuitka frontend (python.wasm under
# wasmtime), then execute the resulting compiler plan with YoWASP clang/wasm-ld under Node.
# usage: build-selfc.sh NAME OUT.wasm   (work dir $HOME/work/fs/work/NAME)
set -e
NAME=$1; OUT=$2; HERE=$(cd "$(dirname "$0")" && pwd); HF=$HERE/../host-frontend
mkdir -p $HOME/work/fs/work/$NAME; cp $HERE/nuitka_launcher.py $HOME/work/fs/work/$NAME/main.py
rm -f $HOME/work/fs/work/$NAME/plan.jsonl
P=$HOME/work/toolchain/probe-cache.json.pending.json
while :; do
  PLAN=/work/$NAME/plan.jsonl $HF/wnuitka-gen.sh -m nuitka /work/$NAME/main.py --standalone --static-libpython=yes \
    --disable-ccache --lto=no --no-progressbar --jobs=1 --output-dir=/work/$NAME/out --include-package=nuitka \
    --nofollow-import-to=nuitka.build.inline_copy,nuitka.tools.testing,nuitka.tools.podman,nuitka.tools.watch,nuitka.tools.profiler,nuitka.tools.specialize,nuitka.tools.commercial \
    && break
  [ -f $P ] || exit 1
  python3 $HF/wasi-probe-cache.py $HOME/work/toolchain/probe-cache.json $HF/wpy-raw.sh
  rm -f $HOME/work/fs/work/$NAME/plan.jsonl
done
OBJ_CACHE=${OBJ_CACHE:-$HOME/work/objcache-$NAME} node --max-old-space-size=8192 $HF/run-plan-node.mjs $HOME/work/fs/work/$NAME/plan.jsonl $HOME/work/fs $HOME/work/nuitka-wasi "$OUT"
sha256sum "$OUT"
