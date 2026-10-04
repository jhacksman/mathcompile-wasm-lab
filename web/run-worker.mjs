// Run worker: executes a generated WASI program with browser_wasi_shim; the page kills it on timeout/cancel.
import './worker-net.mjs';
import { untar } from './lib/tar.mjs';
import { toShim } from './lib/vfs.mjs';
import { runWasi } from './lib/wasi-run.mjs';
import { Directory } from './vendor/browser_wasi_shim/index.js';

const post = (type, data = {}) => self.postMessage({ type, ...data });
const dec = new TextDecoder();
const STACK_HINT = ' (native stack exhausted: Nuitka-compiled Python calls are not bounded by sys.getrecursionlimit(); native Nuitka 2.6.3 segfaults on the same program, see results/native-nuitka-recursion)';
const explain = trap => trap && /Maximum call stack|call stack exhausted/.test(trap) ? trap + STACK_HINT : trap;

self.onmessage = async ({ data }) => {
  try {
    let t0 = performance.now();
    const mod = await WebAssembly.compile(data.wasm);
    const tCompile = performance.now() - t0;
    t0 = performance.now();
    const root = new Directory(toShim(untar(data.runtimeTar)));
    const tFs = performance.now() - t0;
    const imports = WebAssembly.Module.imports(mod).map(i => `${i.module}.${i.name}`);
    const runs = [];
    for (let i = 0; i < (data.repeat || 1); i++) {
      t0 = performance.now();
      const r = await runWasi(mod, {
        args: ['main'], env: { PYTHONHASHSEED: '0' }, root, maxOutput: data.maxOutput || (1 << 20),
        onStdout: i === 0 ? b => post('stdout', { text: dec.decode(b) }) : undefined,
        onStderr: i === 0 ? b => post('stderr', { text: dec.decode(b) }) : undefined,
      });
      runs.push({ ms: performance.now() - t0, instantiateMs: r.instantiateMs, memoryBytes: r.memoryBytes, code: r.code, trap: explain(r.trap), truncated: r.truncated, stdout: dec.decode(r.stdout), stderr: dec.decode(r.stderr) });
    }
    post('done', { wasmCompileMs: tCompile, runtimeFsMs: tFs, imports, runs });
  } catch (e) {
    post('error', { message: String(e?.message || e), stack: e?.stack });
  }
};
