# Milestone A: stock host py2wasm 2.6.3 (unpatched), output run in the browser WASI runtime

Commands (venv with `pip install py2wasm==2.6.3`, host CPython 3.11.15, py2wasm's bundled wasi-sdk 21 clang 17):

    py2wasm hello.py -o hello.wasm                                  # hello.build.log (64 s)
    CC=$VENV/lib/python3.11/site-packages/nuitka/wasi-sdk/21/sdk-Linux/bin/clang \
      python -m nuitka sympy_hello.py --standalone --static-libpython=yes --disable-ccache --lto=yes \
      --nofollow-import-to=sympy,mpmath --output-dir=sh_interp --output-filename=output.wasm   # sympy_hello_interp.build.log
    py2wasm sympy_hello.py            # full SymPy compile: link interrupted after 1723 s (sympy_hello.build.log)

(`py2wasm` itself accepts no extra Nuitka options, so the interpreted-SymPy variant runs the same Nuitka with the
same flags py2wasm passes, plus `--nofollow-import-to`.)

Runtime check: `node tests/run-wasm.mjs <wasm>` executes the module with `web/lib/wasi-run.mjs` +
`@bjorn3/browser_wasi_shim` 0.4.2 and the lab's `runtime.tar` (CPython 3.11 stdlib + SymPy 1.12/mpmath 1.3.0), i.e. the
same runtime code the browser run worker uses (`hello.run.log`, `sympy_hello_interp.run.log`).
Wasm binaries are not committed (25 MB each); hashes in SHA256SUMS.
