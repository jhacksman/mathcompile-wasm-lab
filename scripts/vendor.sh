#!/bin/sh
# Copy pinned npm packages (see package-lock.json) into web/vendor for same-origin serving.
set -e
cd "$(dirname "$0")/.."
rm -rf web/vendor && mkdir -p web/vendor
cp -r node_modules/@yowasp/clang/gen web/vendor/yowasp-clang
cp node_modules/@yowasp/clang/LICENSE* web/vendor/yowasp-clang/ 2>/dev/null || true
cp -r node_modules/@bjorn3/browser_wasi_shim/dist web/vendor/browser_wasi_shim
cp node_modules/@bjorn3/browser_wasi_shim/LICENSE-* web/vendor/browser_wasi_shim/
