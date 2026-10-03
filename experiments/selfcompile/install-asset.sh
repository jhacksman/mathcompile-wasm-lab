#!/bin/sh
# Milestone E, step 3: make a self-compiled Nuitka available to the browser demo (page URL ?selfc=1).
# usage: install-asset.sh SELFC.wasm
set -e
cd "$(dirname "$0")/../.."
cp "$1" web/assets/nuitka-selfc.wasm
sha256sum web/assets/nuitka-selfc.wasm
