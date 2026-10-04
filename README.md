# mathcompile-wasm-lab

Research prototype for MathCompile: user-written Python/SymPy is compiled to WebAssembly **inside the browser**
(real Nuitka 2.6.3 / py2wasm frontend running in CPython-3.11.8-WASI -> generated C -> YoWASP clang/lld 21.1.4 ->
new `main.wasm`) and then executed in the browser. Isolated from MathCompile production.

- Results, numbers, what works and what does not: [REPORT.md](REPORT.md)
- Short summary for sharing: [HANDOFF.md](HANDOFF.md)
- ABI / architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); every failure and fix: [docs/FAILURES.md](docs/FAILURES.md);
  licenses: [docs/LICENSES.md](docs/LICENSES.md)

Quick start (Linux x86-64, Node 20+, Python 3, curl, a C toolchain; ~300 MB downloads):

    npm ci
    npm run setup:host && npm run setup:vendor && npm run setup:assets && npm run setup:pyodide
    npm run serve            # http://localhost:8643 (sends the required COOP/COEP headers)

Tests: `npm run lint`, `npm run test:node`, `npm run test:c`, `npm run test:browser`, `npm run test:pyodide`,
`npm run test:compare`, `npm run test:offline`, `npm run test:limits`, `npm run test:selfc` (Milestone E; needs
`experiments/selfcompile/build-selfc.sh` + `install-asset.sh` first), `npm run bench` (browser tests need
`CHROME=/path/to/chrome` or a Chrome with CDP on :29229).
