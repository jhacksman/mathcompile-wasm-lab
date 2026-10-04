#!/bin/bash
# Rebuild every prebuilt asset used by the lab from pinned sources (host side, Linux x86_64).
#   LAB_WORK=~/work scripts/host/build-all.sh      (default LAB_WORK=$HOME/work)
# Produces: $W/cpython-3.11.8/builddir/wasi/python.wasm, $W/fs (WASI root: stdlib + sympy/mpmath + /target),
#           $W/nuitka-wasi (patched py2wasm-2.6.3 Nuitka), $W/sysroot-y21, $W/toolchain/probe-cache.json.
# Then: python3 scripts/build-assets.py  -> web/assets/{python.wasm,frontend.tar,runtime.tar,manifest.json}
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../.." && pwd)
W=${LAB_WORK:-$HOME/work}
J=${JOBS:-$(nproc)}
mkdir -p "$W/dl" && cd "$W/dl"

fetch() { [ -f "$2" ] || curl -sfL -o "$2" "$1"; }
fetch https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-27/wasi-sdk-27.0-x86_64-linux.tar.gz wasi-sdk-27.0-x86_64-linux.tar.gz
fetch https://github.com/bytecodealliance/wasmtime/releases/download/v36.0.17/wasmtime-v36.0.17-x86_64-linux.tar.xz wasmtime.tar.xz
fetch https://registry.npmjs.org/@yowasp/clang/-/clang-21.1.4-3.tgz yowasp-clang-21.1.4-3.tgz
fetch https://files.pythonhosted.org/packages/source/p/py2wasm/py2wasm-2.6.3.tar.gz py2wasm-2.6.3.tar.gz
fetch https://zlib.net/fossils/zlib-1.3.1.tar.gz zlib-1.3.1.tar.gz
fetch https://www.python.org/ftp/python/3.11.8/Python-3.11.8.tgz Python-3.11.8.tgz
mkdir -p wheels
fetch https://files.pythonhosted.org/packages/py3/s/sympy/sympy-1.12-py3-none-any.whl wheels/sympy-1.12-py3-none-any.whl
fetch https://files.pythonhosted.org/packages/py3/m/mpmath/mpmath-1.3.0-py3-none-any.whl wheels/mpmath-1.3.0-py3-none-any.whl
sha256sum -c "$REPO/locks/host-sources.sha256"

SDK=$W/dl/wasi-sdk-27.0-x86_64-linux
[ -d "$SDK" ] || tar -xzf wasi-sdk-27.0-x86_64-linux.tar.gz
[ -d wasmtime-v36.0.17-x86_64-linux ] || tar -xJf wasmtime.tar.xz
export PATH=$W/dl/wasmtime-v36.0.17-x86_64-linux:$PATH
mkdir -p y21 && tar -xzf yowasp-clang-21.1.4-3.tgz -C y21

# 1. Sysroot = YoWASP's own resource tree (wasi-libc, crt1.o, compiler-rt, clang headers), so that the
#    libpython linked in the browser is built against exactly the libc the browser clang links with.
rm -rf "$W/sysroot-y21" && mkdir -p "$W/sysroot-y21" && tar -xf y21/package/gen/llvm-resources.tar -C "$W/sysroot-y21"
cat > "$W/wasi-cc.sh" <<CC
#!/bin/sh
exec $SDK/bin/clang --target=wasm32-wasip1 --sysroot=$W/sysroot-y21 "\$@"
CC
chmod +x "$W/wasi-cc.sh"

# 2. zlib 1.3.1 (static, WASI)
rm -rf zlib-1.3.1 && tar -xzf zlib-1.3.1.tar.gz && cd zlib-1.3.1
CC=$W/wasi-cc.sh AR=$SDK/bin/llvm-ar RANLIB=$SDK/bin/llvm-ranlib ./configure --static --prefix="$W/wasi-deps"
make -j"$J" libz.a && make install
cd "$W"

# 3. CPython 3.11.8 for wasm32-wasi (+ native build python), with patches/cpython-3.11.8-wasi.patch
if [ ! -d cpython-3.11.8 ]; then tar -xzf dl/Python-3.11.8.tgz && mv Python-3.11.8 cpython-3.11.8; fi
cd cpython-3.11.8
patch -p1 -N < "$REPO/patches/cpython-3.11.8-wasi.patch" || true
mkdir -p builddir/build builddir/wasi
(cd builddir/build && ../../configure -C --prefix="$W/build-python" && make -j"$J")
(cd builddir/wasi && CONFIG_SITE=../../Tools/wasm/config.site-wasm32-wasi ../../configure -C \
   --host=wasm32-unknown-wasi --build=x86_64-pc-linux-gnu \
   --with-build-python="$W/cpython-3.11.8/builddir/build/python" --prefix=/usr/local --disable-test-modules \
   PKG_CONFIG_LIBDIR=/nonexistent CC="$W/wasi-cc.sh" CPP="$W/wasi-cc.sh -E" \
   AR=$SDK/bin/llvm-ar RANLIB=$SDK/bin/llvm-ranlib \
   ZLIB_CFLAGS="-I$W/wasi-deps/include" ZLIB_LIBS="-L$W/wasi-deps/lib -lz" \
 && make -j"$J" python.wasm libpython3.11.a \
 && make DESTDIR="$W/fs" libinstall inclinstall)
cd "$W"

# 4. Target prefix seen by the Nuitka frontend (/target): headers + static libs for the generated program.
mkdir -p fs/target/lib fs/target/include
cp -a fs/usr/local/include/python3.11 fs/target/include/
cp cpython-3.11.8/builddir/wasi/libpython3.11.a cpython-3.11.8/builddir/wasi/Modules/expat/libexpat.a \
   cpython-3.11.8/builddir/wasi/Modules/_decimal/libmpdec/libmpdec.a wasi-deps/lib/libz.a fs/target/lib/

# 5. Real SymPy 1.12 / mpmath 1.3.0, unpacked unchanged into site-packages.
SP=fs/usr/local/lib/python3.11/site-packages
python3 -m zipfile -e dl/wheels/sympy-1.12-py3-none-any.whl "$SP"
python3 -m zipfile -e dl/wheels/mpmath-1.3.0-py3-none-any.whl "$SP"
rm -rf "$SP"/*.dist-info "$SP"/*.data "$SP"/isympy.py

# 6. Nuitka from the py2wasm 2.6.3 sdist + patches/nuitka-2.6.3-py2wasm-wasi-frontend.patch
if [ ! -d nuitka-wasi ]; then
  tar -xzf dl/py2wasm-2.6.3.tar.gz -C dl
  mkdir nuitka-wasi && cp -a dl/py2wasm-2.6.3/nuitka nuitka-wasi/
  # py2wasm ships its own prebuilt WASI libpython; the lab links the one built above instead
  rm -rf nuitka-wasi/nuitka/wasi-python
  (cd nuitka-wasi && git init -q && git add -A && git -c user.name=lab -c user.email=lab@localhost commit -qm "pristine py2wasm 2.6.3 nuitka" \
     && git apply "$REPO/patches/nuitka-2.6.3-py2wasm-wasi-frontend.patch")
fi

# 7. Recorded target-Python probes (WASI cannot spawn the target interpreter). The committed cache is
#    reproducible with scripts/host/record-probe.py; copy it into place.
mkdir -p toolchain/bin
printf '#!/bin/sh\n# placeholder: executed by the browser host (YoWASP clang), never by WASI\nexit 1\n' > toolchain/bin/clang
chmod +x toolchain/bin/clang
cp "$REPO/locks/probe-cache.json" toolchain/probe-cache.json
echo "host build complete in $W"
