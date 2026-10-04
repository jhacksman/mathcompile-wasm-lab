// Node harness running exactly the browser library code (browser_wasi_shim + YoWASP) end to end.
// usage: node tests/node-e2e.mjs program.py [--interpreted-sympy]
import fs from 'node:fs';
import path from 'node:path';
import { untar } from '../web/lib/tar.mjs';
import { toShim } from '../web/lib/vfs.mjs';
import { Directory } from '../web/vendor/browser_wasi_shim/index.js';
import { pythonToC, cToWasm, INTERPRETED_PACKAGES } from '../web/lib/frontend.mjs';
import { runWasi } from '../web/lib/wasi-run.mjs';
import { prefetch } from '../web/lib/clang-bridge.mjs';

const A = process.env.LAB_ASSETS || path.join(path.dirname(new URL(import.meta.url).pathname), '../web/assets');
const src = fs.readFileSync(process.argv[2], 'utf8');
const t = {}; const mark = (k, t0) => (t[k] = Math.round(performance.now() - t0));
let t0 = performance.now();
const pythonModule = await WebAssembly.compile(fs.readFileSync(path.join(A, 'python.wasm')));
const root = new Directory(toShim(untar(fs.readFileSync(path.join(A, 'frontend.tar')))));
await prefetch();
mark('setup_ms', t0);
t0 = performance.now();
const extra = INTERPRETED_PACKAGES.map(p => `--nofollow-import-to=${p}`);
const fe = await pythonToC({ pythonModule, root, job: 'job1', source: src, extraArgs: extra, onLog: m => console.error(m) });
mark('python_to_c_ms', t0);
console.error('C files', Object.keys(fe.cSources).length, 'plan steps', fe.plan.length);
t0 = performance.now();
const { wasm, steps } = await cToWasm({ root, plan: fe.plan, onStep: s => console.error(s.kind, s.output, Math.round(s.ms) + 'ms') });
mark('c_to_wasm_ms', t0);
fs.writeFileSync('/tmp/node-e2e.wasm', wasm);
t0 = performance.now();
const mod = await WebAssembly.compile(wasm);
mark('wasm_compile_ms', t0);
const rt = new Directory(toShim(untar(fs.readFileSync(path.join(A, 'runtime.tar')))));
t0 = performance.now();
const r = await runWasi(mod, { args: ['main'], root: rt });
mark('run_ms', t0);
process.stdout.write(r.stdout); process.stderr.write(r.stderr);
console.error(JSON.stringify({ exit: r.code, wasm_bytes: wasm.length, ...t, compile_ms: steps.filter(s => s.kind === 'compile').reduce((a, s) => a + s.ms, 0) | 0, link_ms: steps.filter(s => s.kind === 'link').reduce((a, s) => a + s.ms, 0) | 0 }));
