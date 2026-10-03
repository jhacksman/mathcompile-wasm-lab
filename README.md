# mathcompile-wasm-lab

Research lab for MathCompile, kept separate from MathCompile production. Nothing here is deployed.

The goal is to compile user-written Python/SymPy scripts to WebAssembly entirely inside the browser, and then run
the resulting Wasm in the browser too. The pipeline is the real Nuitka/py2wasm frontend running in browser-hosted
CPython (WASI), which generates C, then browser-hosted Clang/lld, which produces a new Wasm module. SymPy and mpmath
are the real, unmodified upstream packages.

Setup, test and benchmark commands, the report and the raw results come with the prototype branch.
