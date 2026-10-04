# MathCompile Wasm lab: Python/SymPy -> Nuitka -> C -> clang/lld -> Wasm, all inside the browser

Research prototype, separate from MathCompile production (nothing there was changed or deployed). Everything below
was measured on the machine described in "Environment"; every number comes from a file in `results/`.

## Verdict

| milestone | status | evidence |
|---|---|---|
| A. host py2wasm hello + SymPy, run in the browser WASI runtime | **done** (SymPy interpreted; full-SymPy host compile did not finish in 1723 s) | `results/milestoneA/` |
| B. YoWASP clang/lld in a browser worker compiles + links fresh C, result runs | **done**: hand-written C, then an edited version (per-run nonce), compiled+linked in the compiler worker offline in 0.2-0.5 s and run in the run worker with exact expected output and exit code (`npm run test:c`); every C/D compile also runs clang -c and wasm-ld there | `results/milestoneB.json`, stage logs in `results/lab-correctness.json` |
| C. real Nuitka 2.6.3 (py2wasm) frontend in browser-hosted CPython -> C -> browser clang/lld -> new Wasm -> runs | **done**, for source typed after page load, offline | `results/offline-unseen-proof.json`, `results/lab-correctness.json` |
| D. orchestration (SCons, probes, VFS, package data, linking), SymPy/mpmath bundled | **done** with SymPy/mpmath **interpreted** by the embedded CPython; **full compile of SymPy blocked** | `patches/`, `docs/ARCHITECTURE.md`, below |
| E. Nuitka compiled to Wasm, then used in the browser | **done, with caveats**: Nuitka 2.6.3 compiled to a 70 MB Wasm program (390 Nuitka modules compiled); in Chrome, offline, that program replaced `python.wasm -m nuitka` as the frontend for fresh source, and the resulting Wasm matched Pyodide. The self-compile build itself ran on the host with the same Wasm tools (70 min), not in a browser | `results/milestoneE/`, `results/selfc-browser-proof.json`, `results/selfc-comparison.json` (`npm run test:selfc`) |

Primary success criterion met: source entered after page load -> the actual (patched) Nuitka/py2wasm frontend
running in CPython-3.11.8-WASI in a worker -> generated C -> YoWASP clang 21.1.4 / wasm-ld in the same worker ->
newly linked `main.wasm` -> executed in a second worker. No server, native tool, remote compiler or cached answer is
involved; the offline proof kills the HTTP server and puts the browser offline before the source is typed.

## What is compiled and what is interpreted

In the delivered (default) mode:

- **compiled to Wasm in the browser**: the user's script (`__main__`, Nuitka-generated C), Nuitka's runtime helpers
  and constants blob.
- **prebuilt, linked in the browser**: CPython 3.11.8 core (`libpython3.11.a`, wasm32-wasip1), zlib, wasi-libc.
- **interpreted by that embedded CPython at run time**: Python stdlib modules imported by the script, SymPy 1.12 and
  mpmath 1.3.0 (unmodified upstream `.py` files from `runtime.tar`).

So mathematical behaviour is real SymPy/mpmath; the speed of SymPy-heavy scripts is therefore CPython-interpreter
speed, not compiled speed (see benchmarks). "Full compile" (also compiling SymPy/mpmath) is blocked, see below.

## How to reproduce

    npm ci
    npm run setup:host       # scripts/host/build-all.sh: fetch+verify pinned sources (locks/host-sources.sha256),
                             # build zlib + CPython 3.11.8 for WASI against the YoWASP sysroot, install SymPy/mpmath,
                             # apply patches/*.patch to py2wasm 2.6.3 (Nuitka)
    npm run setup:vendor     # copy pinned npm browser packages to web/vendor
    npm run setup:assets     # build web/assets/{python.wasm,frontend.tar,runtime.tar,...} + SHA256 manifest
    npm run setup:pyodide    # Pyodide 0.25.1 baseline, verified against locks/pyodide.sha256
    npm run serve            # http://localhost:8643  (COOP same-origin, COEP require-corp, strict CSP)

Open the page, press "prefetch", type Python, "compile", "run". Tests (Chrome via CDP on :29229, or
`CHROME=/path/to/chrome` for a private headless instance):

    npm run lint
    npm run test:node        # same frontend + plan executor under Node (no browser)
    npm run test:c           # Milestone B: edited hand-written C -> browser clang/wasm-ld -> run, offline
    npm run test:browser     # 6 fresh programs, compiled+run in Chrome, offline after prefetch
    npm run test:pyodide && npm run test:compare
    npm run test:offline     # unseen-source proof
    npm run test:limits      # cancel / memory cap / output cap / timeout / recovery
    npm run test:selfc       # Milestone E: self-compiled Nuitka as the browser frontend (needs web/assets/nuitka-selfc.wasm:
                             # experiments/selfcompile/build-selfc.sh NAME OUT.wasm && experiments/selfcompile/install-asset.sh OUT.wasm)
    CHROME=... TRIALS=3 npm run bench

Clean-rebuild check: `LAB_WORK=~/work-clean JOBS=6 scripts/host/build-all.sh` followed by
`LAB_WORK=~/work-clean LAB_ASSETS_OUT=~/work-clean/assets python3 scripts/build-assets.py` ran from an empty
directory on this VM (all 8 source hashes OK, host build 1 min 43 s wall, excluding `npm ci`). The output is **not
byte-identical** to the committed-manifest assets: `python.wasm` embeds the build directory path (197 occurrences;
`work-clean` is 6 bytes longer, so the file is 1,180 bytes larger), and the original tree was populated incrementally,
so a few unused stdlib files differ (`msilib`, `__phello__/ham`, `venv/scripts/nt`, `LICENSE.txt`). The clean assets
were checked functionally: `LAB_ASSETS=~/work-clean/assets node tests/node-e2e.mjs tests/cases/sympy_algebra.py`
compiled and ran with exit 0 and all 11 trusted lines. All browser tests and benchmarks used the original assets.

Pinned versions, hashes and licenses: `locks/`, `package-lock.json`, `docs/LICENSES.md`. ABI details:
`docs/ARCHITECTURE.md`. Every failure hit along the way, with the exact error and fix: `docs/FAILURES.md`.

## Browser requirements

Tested only in Chrome 137 (headless, Linux x86-64). Needs module workers and WebAssembly (no threads and no
SharedArrayBuffer are used). The server must send COOP `same-origin` + COEP `require-corp` (`scripts/serve.mjs`; a
static host needs the same two headers) and the CSP in `serve.mjs`. ~289 MB of assets (8 files) are prefetched once
(HTTP cache via `fetch(..., {cache: 'force-cache'})`, then held in page memory and structured-cloned into workers);
the service worker caches only the small app shell so workers can be recreated offline. The compiler worker needs
several GB of memory; low-memory/mobile devices are out of scope. Firefox/Safari were not tested.

## Correctness (vs Pyodide 0.25.1: CPython 3.11.3, SymPy 1.12, mpmath 1.3.0)

`results/correctness-comparison.json`: 6 fresh programs, compiled in Chrome while offline, stdout/exit/last error
line compared byte-for-byte with Pyodide plus `tests/trusted.json` expected lines (hand-verified values):

| program | covers | result |
|---|---|---|
| python_basics.py | functions, closures, classes, generators, decorators, loops, imports, exceptions (incl. chained), big ints, floor/mod | 15/15 identical |
| sympy_algebra.py | expand, factor, simplify, trigsimp, cancel/apart/together, radsimp, nsimplify, Poly, 50-digit pi | 14/14 identical |
| sympy_calculus.py | diff, integrate, limit, series, solve, systems, solveset, linsolve, roots, dsolve, summation | 20/20 identical |
| sympy_matrix_assume.py | det, inv, eigenvals, charpoly, rref, nullspace, powers, assumptions, domains, GF(p), mpmath quad/zeta | 17/17 identical |
| errors.py | SymPy/ZeroDivision/NonInvertible/ShapeError/SympifyError/Index/Type/Attribute errors, uncaught ValueError exit 1 | 10/10 identical |
| recursion_limit.py | unbounded recursion | **known divergence** (3/3 documented-behaviour checks) |

Divergence: Nuitka-compiled functions do not enforce `sys.getrecursionlimit()`. Pyodide raises `RecursionError`;
the lab Wasm exhausts V8's native stack and the run worker reports a trap with an explanation. This is upstream
Nuitka behaviour, not a Wasm-port bug: native Nuitka 2.6.3 segfaults (exit 139) on the same program
(`results/native-nuitka-recursion/`). Bounded recursion (depth 900) is fine. Version note: Pyodide ships CPython
3.11.3 vs the lab's 3.11.8; no output differed because of it.

## Offline unseen-source proof

`npm run test:offline` (`tests/offline-proof.sh`): `tests/gen-unseen.py` writes a new program with random constants
and a randomly chosen recurrence (`results/offline-unseen-source.py`, nonce 328284166, sha256 `e950f16e...`). The
harness prefetches the assets, kills the HTTP server, sets the browser context offline, then types that source into
the editor. The browser compiled it (`python-to-c` 125.2 s, `c-compile` 29.9 s, `link` 37.8 s), produced
`main.wasm` `cc8c43d5...` (24,963,222 bytes), and ran it with exit 0. The same file was then run in Pyodide, and the
stdout was **byte-identical** (`results/offline-unseen-check.json`: PASS). Evidence in
`results/offline-unseen-proof.json`: `serverRequestsAfterOffline: []`, 0 refused worker fetches, every worker asset
`served: memory`, and the hashes of the source, every generated C file and the Wasm. The 6 correctness programs in
`results/lab-correctness.json` were also compiled offline.

## Resource controls (`results/limits.json`, all pass)

Cancel during compile -> worker terminated and recreated, next compile succeeds; `--max-memory` cap of 256 MiB ->
`MemoryError` caught inside the program at 224 MiB and the program continues; stdout capped at 64 KiB; infinite
loop killed by the 30 s timeout; repeated run of the same Wasm behaves identically; UI stays responsive.

## Benchmarks

Raw data: `results/bench/raw.csv` (393 rows), `summary.csv` / `summary.json` (median, min, max, stdev, n),
per-trial JSON + logs. Command: `CHROME=... TRIALS=3 sh bench/run.sh`. 3 trials; each trial = fresh headless Chrome
137 profile (cold HTTP cache + Cache API), fresh source variant (random nonce, so nothing can be reused), then the
same two programs in fresh Pyodide 0.25.1 workers. Within a trial the second program (`bench_sympy`) is compiled with
the toolchain already prefetched (the "cached-toolchain compile of fresh source" case). Every program executes 3
times (new Wasm instance each time) and each run times its workload 5 times in-process; `sympy.core.cache.clear_cache()`
is called before every measured SymPy call, on both sides. Results were byte-identical between lab and Pyodide in
every trial (`results_match` in summary.json).

Host: Intel Xeon Platinum 8559C, 8 vCPUs, 31 GiB RAM, Linux 6.8 (AWS VM); HeadlessChrome 137.0.7118.2. Assets were
served from localhost, so download time is not representative of a real network. **Caveat:** the Milestone E
self-compilation job (one core) ran concurrently on the same VM (load average 2-4 on 8 cores, `results/bench/load.log`);
the compile stages are single-threaded, so this mostly adds noise, but earlier unloaded single compiles were somewhat
faster (python-to-C 84-133 s in `results/lab-correctness.json`).

Medians over 3 trials (min-max):

| stage | bench_python | bench_sympy |
|---|---|---|
| asset download, 289.2 MB in 8 files (localhost, cold cache) | 517 ms (508-552), once per page | (shared) |
| compiler worker init (instantiate python.wasm, unpack frontend.tar) | 698 ms (695-840), once per page | (shared) |
| Python -> C (Nuitka in CPython-WASI) | 152.5 s (137.2-180.8) | 162.3 s (133.0-175.7) |
| C compile (browser clang, 7 TUs) | 26.0 s (25.2-26.3) | 23.3 s (22.9-27.5) |
| link (browser wasm-ld, LTO) | 43.0 s (41.7-48.1) | 44.6 s (38.0-47.1) |
| **total compile, wall** | **220.8 s (206.5-254.2)** | **232.9 s (198.7-243.4)** |
| generated main.wasm | 26.4 MB | 26.4 MB |
| WebAssembly.compile | 15.6 ms | 15.4 ms |
| runtime FS setup (runtime.tar) | 80 ms | 80 ms |
| instantiate | 4.9 ms | 4.9 ms |
| imports inside program (`import sympy`) | 0.03 ms | 290 ms (first run), 248 ms (repeat) |
| first process run (incl. CPython init, imports, 5 workload calls) | 995 ms | 6.09 s |
| repeated process run | 823 ms | 5.91 s |
| workload call, first in process | 252 ms | 1406 ms |
| workload call, steady state | 158 ms | 1066 ms |
| linear memory after run | 21.1 MB | 55.6 MB |

Pyodide 0.25.1, same programs (no compile step):

| stage | bench_python | bench_sympy |
|---|---|---|
| core setup (loadPyodide in a fresh worker; bench_python runs first with a cold HTTP cache, bench_sympy second with a warm one) | 1.68 s | 1.00 s |
| loadPackage sympy+mpmath | 0.37 s | 0.32 s |
| `import sympy` first / repeat | - | 1673 ms / 0.02 ms (module cached in the warm interpreter) |
| first program run | 1.74 s | 8.48 s |
| repeated program run (same interpreter, SymPy cache cleared) | 1.73 s | 6.23 s |
| workload call, steady state | 339 ms | 1246 ms |

Speed of the compiled result: ordinary Python user code is **2.1x faster** than Pyodide per call (158 vs 339 ms).
SymPy-heavy code is only **1.17x faster** (1066 vs 1246 ms) because SymPy itself is interpreted in both; that small
difference comes from the two CPython builds (3.11.8 wasm32-wasip1 under browser_wasi_shim vs Pyodide's 3.11.3
Emscripten build), not from Nuitka. That the lab imports SymPy faster (290 vs 1673 ms) is likewise a property of
the bundled bytecode/filesystem, not of compilation (hypothesis; not isolated further).

Break-even (`summary.json: break_even`), \(n = (C_{lab} - S_{pyodide}) / (t_{pyodide} - t_{lab})\):

| scenario | bench_python | bench_sympy |
|---|---|---|
| rerun the whole program n times (lab: new instance + CPython init per run; Pyodide: warm interpreter) | **244 runs** | **742 runs** |
| call the workload n times inside one process | **1,224 calls** | **1,289 calls** |

Conclusion: with a ~3.5-4 min in-browser compile, compilation pays off only after hundreds of whole-program reruns
or >1,200 hot calls of these workloads; for a calculator where each script runs once or a few times, **startup is
much worse than Pyodide** (≈220 s vs ≈2 s before the first result) and compilation never pays off. It would only pay
off for long-running pure-Python numeric loops, and only if the Python->C stage (two thirds of the time) became much
faster. Hypotheses for that, not demonstrated: cache the Nuitka frontend's module-optimisation results for the
stdlib between compiles; skip LTO; keep a warm frontend interpreter across compiles (currently each compile restarts
python.wasm and retries probe/caching passes, see `frontendRuns` in the evidence JSON).

## Full compile of SymPy/mpmath (blocked)

- Host, stock py2wasm: `py2wasm sympy_hello.py` generated C for ~1,400 SymPy modules; the LTO link was still running
  after 1723 s and was interrupted (`results/milestoneA/sympy_hello.build.log`).
- Browser frontend ("SymPy/mpmath interpreted" checkbox unchecked): `RecursionError: maximum recursion depth exceeded while calling a
  Python object` while Nuitka optimises `sympy/polys/polyquinticconst.py` (huge literal expression trees) inside
  CPython-WASI.
- Next experiments: (1) raise the frontend's recursion limit together with the wasm stack of `python.wasm`
  (`-z stack-size`) and exclude `polyquinticconst`/`benchmarks`/`tests` subpackages; (2) drop `-flto` for library
  modules (link time was dominated by LTO); (3) precompile SymPy once into a static library (allowed as a prebuilt
  dependency) so only user code is compiled per request. Even if it worked, a cold browser compile of all of SymPy
  would take far longer than the ~3.5-4 min user-code compile, so it only makes sense as a prebuilt artifact.

## Milestone E: Nuitka self-compilation

Goal: compile the Nuitka package itself into a Wasm program, then use that program as the compiler in the browser.

**Build (host, Wasm tools only)**: `experiments/selfcompile/build-selfc.sh` runs the patched frontend (`python.wasm` under
wasmtime) on `nuitka_launcher.py` (`from nuitka.__main__ import main`) with `--standalone --include-package=nuitka
--lto=no`, excluding `nuitka.build.inline_copy` and the test/podman/watch/profiler/specialize/commercial tools. The
401-step plan (394 compiled modules, 390 of them Nuitka's) then goes through YoWASP clang/wasm-ld under Node, using
the plan executor the browser uses. This took 70 min 9 s and produced `nuitka-selfc.wasm`, 70,426,743 bytes, sha256
`7dbc19d5...`. Log: `results/milestoneE/build-selfc4.log`. The build ran on the host, not in a browser tab. In
principle a browser could run it, since it is the same plan executor, but that was not tried.

**What is compiled in it**: Nuitka's own modules are compiled C. SCons (inline copy) and the stdlib are Python
source/bytecode, interpreted by the CPython linked into the binary. The binary's target-Python probes (stdlib layout,
early imports) are answered by `python.wasm` running in the same worker: `python.wasm` is the *target* runtime being
described. It does not run Nuitka in this mode.

**Use in the browser** (`?selfc=1`, `npm run test:selfc`): the compiler worker instantiates `nuitka-selfc.wasm` instead
of `python.wasm -m nuitka`, with the Nuitka package directory mounted at `/nuitka` (`selfcRoot`, `SELFC_ENV` in
`web/lib/frontend.mjs`). Its C goes through the same YoWASP clang/wasm-ld, and the new Wasm runs in the run worker.
Headless Chrome 137, after prefetch, with the server killed and the context offline: a new random program (nonce in
`results/selfc-unseen-source.py`) and `tests/cases/python_basics.py` were both compiled and run, exit 0, with 0
server requests after going offline and 0 refused worker fetches:

| program | python-to-c (self-compiled Nuitka) | c-compile | link | Wasm | vs Pyodide + trusted |
|---|---|---|---|---|---|
| unseen (SymPy, interpreted) | 70.0 s | 18.0 s | 26.0 s | 23,980,845 B | 3/3 checks, stdout byte-identical |
| python_basics.py | 82.8 s | 18.0 s | 27.3 s | 24,697,895 B | 15/15 checks |

The two short frontend runs at the start of each python-to-c stage (about 1 s each) stop to ask for target probes
that are missing from the probe cache in `frontend.tar`. Those were answered in-browser.

**Speed**: one run per program, so this is indicative only. The self-compiled frontend took 68-81 s of Nuitka time.
The interpreted frontend on the same page and the same kind of programs takes 79-86 s, and 124 s when it is the first
compile on a page (`results/lab-correctness.json`). That is no meaningful speed-up: most of the frontend work is
still Python-level (interpreted stdlib/SCons, CPython object operations), and the binary is 70 MB more to download.

**Caveats**: the self-compile uses `--lto=no`. The LTO link of 400 bitcode modules aborts in the 32-bit wasm-ld
(FAILURES #25). The self-compiled frontend was only exercised on these programs (plus a host run on
`results/milestoneE/fresh.py`, stdout identical to CPython). The full 6-program suite and the benchmarks use the
interpreted frontend. Getting here took fixes for `ctypes` hard-import aborts, data-file paths, `sys.path` and
compiled-`encodings` detection, and a missing 8 MiB stack (FAILURES #28-#34). Summary: `results/milestoneE/summary.json`.

## Unsupported / not demonstrated

- Threads, subprocesses, sockets, `ctypes`, C extension modules other than the builtins linked into libpython.
- `RecursionError` semantics in compiled code (see divergence).
- Browsers other than Chromium 137; low-memory devices.
- Python versions other than 3.11 (py2wasm 2.6.3 targets 3.11).
