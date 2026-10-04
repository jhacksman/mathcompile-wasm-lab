// Pyodide 0.25.1 baseline (CPython 3.11.3/Emscripten, SymPy 1.12, mpmath 1.3.0): interprets the same source.
import { loadPyodide } from './pyodide/pyodide.mjs';

let py, setup;
const dec = new TextDecoder();

async function init() {
  const t0 = performance.now();
  let out = '', err = '';
  py = await loadPyodide({ indexURL: new URL('./pyodide/', self.location.href).href, stdout: s => { out += s + '\n'; }, stderr: s => { err += s + '\n'; } });
  const tCore = performance.now() - t0;
  const t1 = performance.now();
  await py.loadPackage(['mpmath', 'sympy'], { messageCallback: () => {} });
  setup = { coreMs: tCore, packagesMs: performance.now() - t1, version: py.version };
  return () => { const r = { out, err }; out = ''; err = ''; return r; };
}

let drain;
self.onmessage = async ({ data }) => {
  try {
    if (!py) drain = await init();
    drain();
    const runs = [];
    for (let i = 0; i < (data.repeat || 1); i++) {
      if (i > 0 && data.clearCache) py.runPython('import sympy.core.cache as _c; _c.clear_cache()');
      const t0 = performance.now();
      let code = 0, tb = '';
      try {
        await py.runPythonAsync(data.source, { globals: py.toPy({ __name__: '__main__' }), filename: 'main.py' });
      } catch (e) {
        code = 1; tb = String(e.message || e);
      }
      // flush Python's buffered stdout
      py.runPython('import sys; sys.stdout.flush(); sys.stderr.flush()');
      const { out, err } = drain();
      runs.push({ ms: performance.now() - t0, code, stdout: out, stderr: err + tb });
    }
    self.postMessage({ type: 'done', setup, runs });
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e?.message || e), stack: e?.stack });
  }
};
void dec;
