#!/bin/sh
exec wasmtime run --dir $HOME/work/fs::/ --dir $HOME/work/nuitka-wasi::/nuitka --env PYTHONPATH=/nuitka:/usr/local/lib/python3.11/site-packages --env PYTHONHASHSEED=0 --env PYTHONIOENCODING=utf-8 -- $HOME/work/cpython-3.11.8/builddir/wasi/python.wasm "$@"
