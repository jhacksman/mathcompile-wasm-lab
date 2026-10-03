const $ = id => document.getElementById(id);
const ASSETS = [
  'assets/python.wasm', 'assets/frontend.tar', 'assets/runtime.tar',
  'vendor/yowasp-clang/llvm.core.wasm', 'vendor/yowasp-clang/llvm.core2.wasm',
  'vendor/yowasp-clang/llvm.core3.wasm', 'vendor/yowasp-clang/llvm.core4.wasm',
  'vendor/yowasp-clang/llvm-resources.tar',
];
// ?selfc=1: Milestone E, the Nuitka frontend is the self-compiled nuitka-selfc.wasm instead of python.wasm -m nuitka
const SELFC = new URLSearchParams(location.search).has('selfc');
if (SELFC) ASSETS.push('assets/nuitka-selfc.wasm');
const DEFAULT_SRC = `import sympy
from sympy import symbols, factor, expand, diff, solve, Matrix, sin, Rational

x, y = symbols("x y")

def collatz(n):
    steps = 0
    while n != 1:
        n = 3 * n + 1 if n % 2 else n // 2
        steps += 1
    return steps

print("collatz(27) =", collatz(27), "2**127-1 =", 2**127 - 1)
print(factor(x**4 - y**4))
print(expand((x + 2*y)**3))
print(diff(sin(x) * x**3, x))
print(solve(x**2 - 3*x + 2, x))
print(Matrix([[1, 2], [3, 4]]).inv())
print(Rational(1, 3) + Rational(1, 7), sympy.__version__)
`;

const state = { assets: null, compiler: null, wasm: null, evidence: {}, timer: null, runner: null };
window.labState = state;

function log(text) { const el = $('log'); el.textContent += text; if (el.textContent.length > 200000) el.textContent = el.textContent.slice(-150000); }
function setStatus(t, cls = '') { $('status').textContent = t; $('status').className = cls; }
function stageItem(text) { const li = document.createElement('li'); li.textContent = text; $('stages').appendChild(li); return li; }
function busy(b) { $('compile').disabled = b || !state.assets; $('run').disabled = b || !state.wasm; $('cancel').disabled = !b; }

async function prefetch() {
  $('prefetch').disabled = true;
  const t0 = performance.now();
  const assets = {};
  let total = 0;
  await Promise.all(ASSETS.map(async u => {
    const r = await fetch(u, { cache: 'force-cache' });
    if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`);
    assets[u] = await r.arrayBuffer();
    total += assets[u].byteLength;
    $('assetStatus').textContent = `${Object.keys(assets).length}/${ASSETS.length} files, ${(total / 1e6).toFixed(1)} MB`;
  }));
  state.assets = assets;
  if (navigator.serviceWorker) await navigator.serviceWorker.ready;
  state.evidence.assetDownloadMs = performance.now() - t0;
  state.evidence.assetBytes = total;
  await startCompiler();
  $('assetStatus').textContent += ` — ready in ${((performance.now() - t0) / 1000).toFixed(1)} s`;
  busy(false);
}

function startCompiler() {
  if (state.compiler) state.compiler.terminate();
  const t0 = performance.now();
  const w = new Worker('compiler-worker.mjs', { type: 'module', name: 'compiler' });
  state.compiler = w;
  return new Promise((resolve, reject) => {
    w.onmessage = ({ data }) => {
      if (data.type === 'ready') { state.evidence.compilerInitMs = performance.now() - t0; w.onmessage = onCompilerMessage; resolve(); }
      else if (data.type === 'error') reject(new Error(data.message));
    };
    w.onerror = e => reject(e.error || new Error(e.message));
    // structured clone copies the buffers, so the page keeps its own copy for worker restarts
    w.postMessage({ type: 'init', assets: Object.fromEntries(ASSETS.filter(u => !u.endsWith('runtime.tar')).map(u => [u, state.assets[u]])) });
  });
}

let pending = null;
function onCompilerMessage({ data }) {
  if (data.type === 'log') log(data.text);
  else if (data.type === 'stage') stageItem(`${data.name}${data.frontend === 'selfc' ? ' (self-compiled Nuitka)' : ''}: ${(data.ms / 1000).toFixed(2)} s` + (data.cFiles ? ` (${data.cFiles} C files, ${data.planSteps} compiler actions)` : ''));
  else if (data.type === 'step') log(`[${data.kind}] ${data.output} ${(data.ms / 1000).toFixed(2)} s exit ${data.code}\n${data.stderr || ''}`);
  else if (data.type === 'csource') $('csrc').textContent = data.text;
  else if (data.type === 'compiled') pending?.resolve(data);
  else if (data.type === 'error') pending?.reject(Object.assign(new Error(data.message), { log: data.log }));
}

async function compile() {
  busy(true);
  $('stages').textContent = ''; $('stdout').textContent = ''; $('stderr').textContent = ''; $('log').textContent = '';
  $('download').hidden = true; state.wasm = null;
  const source = $('src').value;
  setStatus('compiling…');
  const t0 = performance.now();
  const timeoutS = +$('ctimeout').value;
  try {
    const result = await new Promise((resolve, reject) => {
      pending = { resolve, reject };
      state.timer = setTimeout(() => reject(new Error(`compile timeout after ${timeoutS} s`)), timeoutS * 1000);
      state.compiler.postMessage({ type: 'compile', source, job: 'job' + Date.now(), interpretPackages: $('interp').checked, maxMemoryMiB: +$('maxmem').value, frontend: SELFC ? 'selfc' : 'interpreted' });
    });
    clearTimeout(state.timer);
    state.wasm = result.wasm;
    state.evidence.compile = {
      frontend: result.frontend, sourceHash: result.sourceHash, wasmHash: result.wasmHash, wasmBytes: result.wasm.byteLength,
      cHashes: result.cHashes, plan: result.plan, linkArgv: result.linkArgv, stages: result.stages, workerNet: result.netLog,
      totalMs: performance.now() - t0, interpretedPackages: $('interp').checked ? ['sympy', 'mpmath'] : [],
    };
    $('evidence').textContent = JSON.stringify(state.evidence, null, 1);
    const url = URL.createObjectURL(new Blob([result.wasm], { type: 'application/wasm' }));
    $('download').href = url; $('download').hidden = false;
    setStatus(`compiled in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${(result.wasm.byteLength / 1e6).toFixed(1)} MB Wasm`, 'ok');
  } catch (e) {
    clearTimeout(state.timer);
    $('stderr').textContent = e.message + '\n' + (e.log || '');
    setStatus('compile failed: ' + e.message, 'err');
    if (/timeout|cancel/.test(e.message)) await startCompiler();
  } finally {
    pending = null;
    busy(false);
  }
}

function run() {
  busy(true);
  $('stdout').textContent = ''; $('stderr').textContent = '';
  setStatus('running…');
  const t0 = performance.now();
  const w = new Worker('run-worker.mjs', { type: 'module', name: 'runner' });
  state.runner = w;
  const timeoutS = +$('timeout').value;
  const finish = (msg, cls) => { clearTimeout(state.timer); w.terminate(); state.runner = null; setStatus(msg, cls); busy(false); };
  state.timer = setTimeout(() => finish(`killed after ${timeoutS} s timeout`, 'err'), timeoutS * 1000);
  w.onmessage = ({ data }) => {
    if (data.type === 'stdout') $('stdout').textContent += data.text;
    else if (data.type === 'stderr') $('stderr').textContent += data.text;
    else if (data.type === 'done') {
      state.evidence.run = { ...data, totalMs: performance.now() - t0, runs: data.runs.map(r => ({ ...r, stdoutHash: null })) };
      $('evidence').textContent = JSON.stringify(state.evidence, null, 1);
      const r0 = data.runs[0];
      if (r0.trap) { $('stderr').textContent += '\n' + r0.trap; return finish('trap: ' + r0.trap, 'err'); }
      finish(`exit ${r0.code}; first run ${(r0.ms / 1000).toFixed(2)} s` + (data.runs.length > 1 ? `; repeats ${data.runs.slice(1).map(r => (r.ms / 1000).toFixed(2)).join(', ')} s` : '') + (r0.truncated ? ' (output truncated)' : ''), r0.code === 0 ? 'ok' : 'err');
    } else if (data.type === 'error') { $('stderr').textContent += '\n' + data.message; finish('runtime error: ' + data.message, 'err'); }
  };
  w.onerror = e => finish('worker crashed: ' + (e.message || 'unknown (possibly out of memory)'), 'err');
  w.postMessage({ wasm: state.wasm, runtimeTar: state.assets['assets/runtime.tar'], maxOutput: +$('maxout').value * 1024, repeat: +$('repeat').value });
}

async function cancel() {
  if (state.runner) { clearTimeout(state.timer); state.runner.terminate(); state.runner = null; setStatus('run cancelled', 'err'); busy(false); return; }
  if (pending) { clearTimeout(state.timer); pending.reject(new Error('cancelled by user')); }
}

$('src').value = DEFAULT_SRC;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(e => console.warn('service worker', e));
$('prefetch').onclick = () => prefetch().catch(e => { $('assetStatus').textContent = 'failed: ' + e.message; $('prefetch').disabled = false; });
$('compile').onclick = compile;
$('run').onclick = run;
$('cancel').onclick = cancel;
