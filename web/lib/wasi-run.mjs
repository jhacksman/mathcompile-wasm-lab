// Run a WASI preview1 command module with browser_wasi_shim on an in-memory root directory.
import { WASI, WASIProcExit, OpenFile, File, ConsoleStdout, PreopenDirectory } from '../vendor/browser_wasi_shim/index.js';

export async function runWasi(module, { args, env = {}, root, stdin = new Uint8Array(0), maxOutput = 1 << 20, onStdout, onStderr }) {
  const out = { stdout: [], stderr: [], stdoutBytes: 0, stderrBytes: 0, truncated: false };
  const sink = (kind, cb) => new ConsoleStdout(buf => {
    const key = kind + 'Bytes';
    if (out[key] + buf.length > maxOutput) { out.truncated = true; buf = buf.subarray(0, Math.max(0, maxOutput - out[key])); }
    out[key] += buf.length;
    if (buf.length) { out[kind].push(buf.slice()); cb?.(buf); }
  });
  const fds = [
    new OpenFile(new File(stdin)),
    sink('stdout', onStdout),
    sink('stderr', onStderr),
    new PreopenDirectory('/', root.contents),
  ];
  const wasi = new WASI(args, Object.entries(env).map(([k, v]) => `${k}=${v}`), fds, { debug: false });
  const t0 = performance.now();
  const inst = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport });
  const instantiateMs = performance.now() - t0;
  let code, trap = null;
  try {
    code = wasi.start(inst);
  } catch (e) {
    if (e instanceof WASIProcExit) code = e.code;
    else { code = null; trap = `${e?.name || 'Error'}: ${e?.message || e}`; }
  }
  const join = parts => { const b = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { b.set(p, o); o += p.length; } return b; };
  const memoryBytes = inst.exports.memory?.buffer.byteLength ?? null;
  return { code, trap, stdout: join(out.stdout), stderr: join(out.stderr), truncated: out.truncated, instantiateMs, memoryBytes };
}
