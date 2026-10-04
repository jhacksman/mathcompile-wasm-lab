# Third-party components and licenses

| component | version | license | how obtained (hash in locks/) |
|---|---|---|---|
| Nuitka (py2wasm fork) | py2wasm 2.6.3 sdist (Nuitka 2.6.3) | Apache-2.0 | PyPI sdist `py2wasm-2.6.3.tar.gz`; lab patch in `patches/` (Apache-2.0) |
| CPython | 3.11.8 | PSF-2.0 | python.org `Python-3.11.8.tgz`; lab patch in `patches/` |
| SymPy | 1.12 | BSD-3-Clause | PyPI wheel, unmodified |
| mpmath | 1.3.0 | BSD-3-Clause | PyPI wheel, unmodified |
| zlib | 1.3.1 | zlib | zlib.net fossils |
| expat, libmpdec | bundled in CPython 3.11.8 | MIT, BSD-2-Clause | CPython source tree |
| SCons (inline copy in Nuitka) | 4.3.0 | MIT | inside the py2wasm sdist |
| YoWASP clang/lld (LLVM 21.1.4) | npm `@yowasp/clang` 21.1.4-3 | ISC (packaging) / Apache-2.0 WITH LLVM-exception (LLVM) | npm, `package-lock.json` |
| wasi-libc, compiler-rt (in YoWASP resources) | as shipped by @yowasp/clang 21.1.4-3 | Apache-2.0 WITH LLVM-exception / MIT / BSD | npm |
| browser_wasi_shim | 0.4.2 | MIT OR Apache-2.0 | npm, `package-lock.json` |
| WASI SDK (host only, builds libpython) | 27.0 | Apache-2.0 WITH LLVM-exception | GitHub release |
| wasmtime (host only, debugging) | 36.0.17 | Apache-2.0 WITH LLVM-exception | GitHub release |
| playwright-core (tests only) | 1.53.0 | Apache-2.0 | npm |
| Pyodide (baseline only) | 0.25.1 | MPL-2.0 | jsDelivr, `locks/pyodide.sha256` |

The generated `main.wasm` statically contains CPython (PSF-2.0), the Nuitka runtime (Apache-2.0), zlib, expat,
libmpdec and wasi-libc; anybody redistributing generated programs must carry those notices.
