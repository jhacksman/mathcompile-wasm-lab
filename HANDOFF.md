# MathCompile in-browser Python -> Wasm: handoff

**Primary goal met.** Python/SymPy typed into the page after it loads is compiled in the browser by the real
Nuitka 2.6.3 (py2wasm) frontend, which runs in CPython 3.11.8 built for WASI, inside a worker. The frontend
produces C; YoWASP clang/wasm-ld 21.1.4 in the same worker turns that into a new `main.wasm`; a second worker runs
it. This also works with the server killed and the browser offline (0 server requests, every worker asset served
from memory, source/C/Wasm hashes recorded). Tested in headless Chrome 137 on Linux x86-64.

**What is compiled.** The user's script and Nuitka's runtime helpers are compiled to Wasm. CPython is a prebuilt
static library that gets linked in. The stdlib, **SymPy 1.12 and mpmath 1.3.0 are interpreted** by that embedded
CPython (unmodified upstream code). Compiling SymPy itself is blocked: the frontend hits `RecursionError` on
`sympy/polys/polyquinticconst.py`, and natively a full-SymPy LTO link did not finish in 29 min.

**Correctness.** Six fresh programs (Python basics, algebra, calculus/solving, matrices/assumptions/domains,
errors), compiled offline. Their output is byte-identical to Pyodide 0.25.1 (same SymPy/mpmath) and to the trusted
values, 76/76 lines. One documented divergence: compiled code ignores `sys.getrecursionlimit()`, so runaway
recursion traps instead of raising `RecursionError`. Native Nuitka has the same behaviour (it segfaults).

**Speed.** The tool doesn't pay off for a calculator. Compiling a fresh script takes about 220-235 s in the
browser (Python->C ~155 s, clang ~25 s, link ~44 s) after a one-time ~289 MB asset download. Pyodide runs the same
script in well under a second. Break-even (compiled run vs Pyodide run, compile cost included) only comes after
hundreds to thousands of repetitions: ~244 whole-program reruns / ~1,224 hot-loop calls for plain Python, and
~742 / ~1,289 for SymPy. SymPy-heavy code gains little, since SymPy is still interpreted.

**Milestone E (Nuitka compiling itself).** Done, with caveats. Nuitka itself was compiled to a 70 MB Wasm program (390 of its modules as C, 70 min, done on the host with the same Wasm clang/lld). In Chrome, offline, that self-compiled Nuitka replaced the interpreted frontend on fresh source: a new random SymPy program and the Python basics test compiled, ran, and matched Pyodide exactly. It is not faster (68-81 s of Python->C vs 79-86 s interpreted, one run each) and adds a 70 MB download. LTO had to be off for the self-compile, and the self-compile build itself was not run inside a browser.

**Robustness.** Compilation and execution run in workers, with cancel, compile/run timeouts, a memory cap (a
`MemoryError` can be caught by the program), 64 KiB output caps, and worker restart after traps. Submitted programs
get no network access and no credentials.

Reproduce: see README.md / REPORT.md (`npm ci`, `npm run setup:*`, `npm run serve`, `npm run test:*`, `npm run bench`).
Raw data are in `results/`. Every failure hit along the way, with its fix, is in `docs/FAILURES.md`.
