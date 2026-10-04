#!/bin/bash
# usage: pipeline.sh NAME SRC.py [nuitka args...]  -> /tmp/NAME.wasm  (frontend in WASI CPython, C via YoWASP)
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
NAME=$1; SRC=$2; shift 2
mkdir -p $HOME/work/fs/work/$NAME; cp $SRC $HOME/work/fs/work/$NAME/main.py
P=$HOME/work/toolchain/probe-cache.json.pending.json
export PLAN=/work/$NAME/plan.jsonl
cd $HOME/work/fs
for i in 1 2 3 4 5 6; do
  rm -f $HOME/work/fs$PLAN $P
  s=$(date +%s.%N)
  timeout 7200 "$HERE"/wnuitka-gen.sh -m nuitka /work/$NAME/main.py --standalone --static-libpython=yes --disable-ccache --lto=yes --no-progressbar --jobs=1 --output-dir=/work/$NAME/out "$@" </dev/null > /tmp/$NAME.fe.log 2>&1 || true
  echo "frontend_s=$(echo "$(date +%s.%N) - $s" | bc)" | tee -a /tmp/$NAME.fe.log
  if [ -f $P ]; then python3 "$HERE"/wasi-probe-cache.py $HOME/work/toolchain/probe-cache.json "$HERE"/wpy-raw.sh; rm -f $P; else break; fi
done
tail -3 /tmp/$NAME.fe.log
cd "$HERE" && node --max-old-space-size=8192 run-plan-node.mjs $HOME/work/fs$PLAN $HOME/work/fs $HOME/work/nuitka-wasi /tmp/$NAME.wasm 2>/tmp/$NAME.plan.log | tail -1 | cut -c1-300
