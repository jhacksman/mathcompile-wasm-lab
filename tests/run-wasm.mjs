// Run an already generated main.wasm under Node with the browser runtime FS (debug helper).
// usage: node [--stack-size=N] tests/run-wasm.mjs main.wasm
import fs from 'node:fs';
import path from 'node:path';
import { untar } from '../web/lib/tar.mjs';
import { toShim } from '../web/lib/vfs.mjs';
import { Directory } from '../web/vendor/browser_wasi_shim/index.js';
import { runWasi } from '../web/lib/wasi-run.mjs';

const A = path.join(path.dirname(new URL(import.meta.url).pathname), '../web/assets');
const mod = await WebAssembly.compile(fs.readFileSync(process.argv[2]));
const root = new Directory(toShim(untar(fs.readFileSync(path.join(A, 'runtime.tar')))));
const r = await runWasi(mod, { args: ['main'], env: { PYTHONHASHSEED: '0' }, root });
process.stdout.write(r.stdout); process.stderr.write(r.stderr);
console.error(JSON.stringify({ exit: r.code, memoryBytes: r.memoryBytes }));
