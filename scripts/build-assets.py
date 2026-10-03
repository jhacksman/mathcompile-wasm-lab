#!/usr/bin/env python3
"""Stage the prebuilt browser assets (frontend VFS, runtime VFS, python.wasm) into web/assets.

Inputs come from scripts/build-*.sh (see docs/REPRODUCE.md). Nothing in these
assets depends on the user program: they are the toolchain, CPython and the
SymPy/mpmath sources.
"""
import hashlib, json, os, shutil, subprocess, sys, tarfile

HOME = os.path.expanduser("~")
WORK = os.environ.get("LAB_WORK", os.path.join(HOME, "work"))
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get("LAB_ASSETS_OUT", os.path.join(REPO, "web", "assets"))
STAGE = os.path.join(WORK, "stage")

PYTHON_WASM = os.path.join(WORK, "cpython-3.11.8/builddir/wasi/python.wasm")
STDLIB = os.path.join(WORK, "fs/usr/local/lib/python3.11")
NUITKA = os.path.join(WORK, "nuitka-wasi/nuitka")
TARGET = os.path.join(WORK, "fs/target")
PROBES = os.path.join(WORK, "toolchain/probe-cache.json")

STDLIB_SKIP = {"test", "idlelib", "tkinter", "turtledemo", "ensurepip", "lib2to3", "__pycache__"}


def skip(path):
    parts = path.split(os.sep)
    if "__pycache__" in parts:
        return True
    # sympy's own test-suite is not importable library functionality
    if "tests" in parts and ("sympy" in parts or "mpmath" in parts):
        return True
    if "inline_copy" in parts and any(p in ("scons-2.3.2", "scons-4.3.0", "yaml_27", "jinja2_35", "yaml_35") for p in parts):
        return True
    return False


def copytree(src, dst, top_skip=()):
    for root, dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        if rel == "." :
            dirs[:] = [d for d in dirs if d not in top_skip]
        dirs[:] = [d for d in dirs if not skip(os.path.join(root, d))]
        os.makedirs(os.path.join(dst, rel), exist_ok=True)
        for f in files:
            if f.endswith((".pyc", ".pyo")):
                continue
            shutil.copyfile(os.path.join(root, f), os.path.join(dst, rel, f))


def compile_pyc(tree_root, inner_dirs, mount="/"):
    """Byte-compile with the target python.wasm itself (correct magic) as unchecked-hash pycs,
    because the in-memory browser filesystem has no meaningful mtimes."""
    args = ["wasmtime", "run", "-W", "max-wasm-stack=8388608", "--dir", tree_root + "::" + mount, PYTHON_WASM, "-B",
            "-S", "-X", "frozen_modules=off", "-m", "compileall", "-q",
            "--invalidation-mode", "unchecked-hash"] + inner_dirs
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)


def pack(src, tar_path):
    with tarfile.open(tar_path, "w", format=tarfile.PAX_FORMAT) as tf:
        for root, dirs, files in os.walk(src):
            dirs.sort(); files.sort()
            for f in files:
                full = os.path.join(root, f)
                arc = os.path.relpath(full, src)
                ti = tf.gettarinfo(full, arc)
                ti.uid = ti.gid = 0; ti.uname = ti.gname = ""; ti.mtime = 0
                with open(full, "rb") as fh:
                    tf.addfile(ti, fh)


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def main():
    shutil.rmtree(STAGE, ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    fe = os.path.join(STAGE, "frontend")
    copytree(STDLIB, os.path.join(fe, "usr/local/lib/python3.11"), STDLIB_SKIP)
    copytree(NUITKA, os.path.join(fe, "nuitka/nuitka"))
    copytree(TARGET, os.path.join(fe, "target"))
    os.makedirs(os.path.join(fe, "toolchain/bin"))
    with open(os.path.join(fe, "toolchain/bin/clang"), "w") as f:
        f.write("#!/bin/sh\n# placeholder: compiler actions are executed by the browser host (YoWASP clang)\nexit 1\n")
    shutil.copyfile(PROBES, os.path.join(fe, "toolchain/probe-cache.json"))
    for d in ("tmp", "work"):
        os.makedirs(os.path.join(fe, d))
    # only the frontend's own code is byte-compiled; sympy/mpmath are just source input to Nuitka
    compile_pyc(fe, ["/usr/local/lib/python3.11", "/nuitka/nuitka"])
    # remove pycs for site-packages again: the frontend reads them only as Python source
    for root, dirs, files in os.walk(os.path.join(fe, "usr/local/lib/python3.11/site-packages")):
        if "__pycache__" in dirs:
            shutil.rmtree(os.path.join(root, "__pycache__")); dirs.remove("__pycache__")

    rt = os.path.join(STAGE, "runtime")
    copytree(STDLIB, rt, STDLIB_SKIP | {"site-packages"})
    for pkg in ("sympy", "mpmath"):
        copytree(os.path.join(STDLIB, "site-packages", pkg), os.path.join(rt, pkg))
    compile_pyc(rt, ["/usr/local/lib/python3.11"], mount="/usr/local/lib/python3.11")

    pack(fe, os.path.join(OUT, "frontend.tar"))
    pack(rt, os.path.join(OUT, "runtime.tar"))
    shutil.copyfile(PYTHON_WASM, os.path.join(OUT, "python.wasm"))

    manifest = {}
    for name in ("python.wasm", "frontend.tar", "runtime.tar"):
        p = os.path.join(OUT, name)
        manifest[name] = {"bytes": os.path.getsize(p), "sha256": sha256(p)}
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
