# Architecture and ABIs

```
page (UI thread)            compiler worker                                     run worker
---------------------       -------------------------------------------------   ---------------------------
editor, controls,   ---->   python.wasm (CPython 3.11.8, wasm32-wasip1)          WebAssembly.compile(main.wasm)
prefetch of assets          + browser_wasi_shim in-memory FS (frontend.tar)      browser_wasi_shim FS (runtime.tar)
(Cache API / memory)        runs:  python -m nuitka --standalone main.py          main.wasm runs:
                              -> Nuitka 2.6.3 (py2wasm) optimisation + C codegen    Nuitka-compiled __main__ module
                              -> in-process SCons -> JSONL build plan               + Nuitka runtime (static_src)
                            YoWASP clang 21.1.4 (wasm) executes every plan step     + libpython3.11.a (CPython 3.11.8)
                              clang -c *.c -> *.o ; clang/wasm-ld -> main.wasm      interpreting sympy/mpmath .py
```

Nothing in this path runs natively or on a server; the harness proves it by killing the HTTP server and setting
the browser offline after prefetch (`tests/browser-e2e.mjs --offline`).

## What is compiled and what is interpreted (default "interpreted packages" mode)

| component | form inside main.wasm |
|---|---|
| user source (`__main__`) | Nuitka-generated C, compiled by browser clang, linked by browser wasm-ld |
| Nuitka runtime helpers (`static_src/*.c`, constants blob, `__helpers`) | compiled in-browser from the C shipped in frontend.tar |
| CPython 3.11.8 core + builtin modules | prebuilt static `libpython3.11.a` (host-built with WASI SDK 27 clang against the YoWASP sysroot), linked in-browser |
| Python stdlib modules imported at run time | `.py` + `.pyc` byte-compiled at asset-build time by the same python.wasm from runtime.tar, interpreted by the embedded CPython |
| SymPy 1.12 / mpmath 1.3.0 | unmodified upstream `.py` (+ `.pyc` byte-compiled from them at asset-build time) from runtime.tar, interpreted by the embedded CPython (`--nofollow-import-to=sympy,mpmath`) |

"Full compile" (unchecking the box) asks Nuitka to also compile SymPy/mpmath to C; see REPORT.md for its status.

## Frontend-host ABI (the Python that runs Nuitka)

- `python.wasm`: CPython 3.11.8, `--host=wasm32-unknown-wasi`, `wasm32-wasip1` (32-bit pointers), WASI preview1
  imports only (`wasi_snapshot_preview1.*`), no threads, no sockets, no processes, no dlopen.
- Runs under `browser_wasi_shim` 0.4.2 in a dedicated module worker; stdout/stderr captured.
- Process creation is impossible, so the patch (patches/nuitka-...patch) makes Nuitka:
  - answer "run the target python" probes from `locks/probe-cache.json` (recorded by `scripts/host/record-probe.py`,
    same python.wasm and file layout), and the `clang -dumpversion` probe from the same cache;
  - run DataComposer (constants blob) in-process;
  - run SCons in-process and, instead of spawning `clang`, append each action
    `{cwd, argv, outputs}` to a JSONL build plan (`NUITKA_WASI_BUILD_PLAN`);
  - avoid ctypes/resource/terminal-size/threads (tqdm monitor) and chmod in `shutil.copy`.
- The plan is executed by `web/lib/plan-exec.mjs`, which only accepts `clang`, `wasm-ld`, `ar` and maps the
  WASI paths into YoWASP's in-memory file tree.

## Output-target ABI (the generated program)

- Triple `wasm32-wasip1` (= Nuitka/py2wasm's `wasm32-wasi`), 32-bit pointers, little-endian, `-flto -O2`.
- libc/startup: wasi-libc, `crt1-command.o`, compiler-rt builtins, all from YoWASP clang 21.1.4-3's own
  `llvm-resources.tar` sysroot. libpython, zlib, expat and mpdecimal were compiled on the host against **that same
  sysroot** (`$W/sysroot-y21`), so all objects agree on libc headers, `struct` layouts and `wchar_t`/`time_t` sizes.
- Emulation libraries required by CPython: `-lwasi-emulated-mman -lwasi-emulated-getpid -lwasi-emulated-signal
  -lwasi-emulated-process-clocks`.
- Python headers/config: `/target/include/python3.11` (installed `pyconfig.h` of the same WASI build),
  `/target/lib/libpython3.11.a`; `NUITKA_WASI_PYTHON_PREFIX=/target`. The frontend Python and target libpython are
  the identical CPython build, so marshal format / serialized constants / `sys.hexversion` match by construction.
- Threading: none (single-threaded CPython build, `--jobs=1`).
- Linker additions made by the lab (`web/lib/frontend.mjs: linkLimitArgs`): `-Wl,-z,stack-size=8388608
  -Wl,--stack-first -Wl,--max-memory=<cap>`; the cap is the user-facing memory resource control.
- Imports of generated program: only `wasi_snapshot_preview1.*` (recorded per run in the evidence JSON).
- No Emscripten or WASIX artifacts are used anywhere (the Pyodide baseline is a separate page).

## Isolation of submitted programs

- The run worker gets only the generated module and an in-memory FS; it has no preopened host dirs, no sockets
  (WASI preview1 has none), and `worker-net.mjs` replaces `fetch` in both workers so any network access after
  asset installation is refused and logged. CSP `connect-src 'self'`, COOP `same-origin`, COEP `require-corp`.
- Timeouts terminate the worker (`Worker.terminate()`), output is capped (`maxOutput`), memory is capped via the
  linked `--max-memory`, and the compiler worker is recreated after cancel/timeout.
