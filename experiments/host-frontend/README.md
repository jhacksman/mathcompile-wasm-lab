# Host stand-in for the compiler worker (debugging / Milestone E)

The browser compiler worker runs the patched Nuitka frontend in `python.wasm` and executes the recorded build plan
with `web/lib/plan-exec.mjs`. These scripts do the same on the host so long runs can be debugged without a browser:

- `wnuitka-gen.sh` runs the *same* `python.wasm` (CPython 3.11.8 / wasm32-wasip1) under wasmtime with the same mounts
  and `NUITKA_WASI_*` environment as the worker; Nuitka writes `plan.jsonl` instead of spawning compilers.
- `wasi-probe-cache.py` records a missing target-python / clang probe into `probe-cache.json` (the frontend exits
  asking for it; `pipeline.sh` loops until no probe is pending). `wpy-raw.sh` is the target-python runner it uses.
- `run-plan-node.mjs` executes the plan with YoWASP clang/lld via the unchanged `web/lib/clang-bridge.mjs` and
  `web/lib/plan-exec.mjs`.

    experiments/host-frontend/pipeline.sh NAME SRC.py [extra nuitka args]   # -> /tmp/NAME.wasm

Paths assume the host build layout of `scripts/host/build-all.sh` (`$HOME/work/...`).
