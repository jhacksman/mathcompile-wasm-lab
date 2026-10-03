// Compiler worker: Nuitka frontend in CPython/WASI (browser_wasi_shim) -> C -> YoWASP clang/lld -> Wasm.
import { installAssets, netLog } from './worker-net.mjs';

let lib, pythonModule, frontendTar, selfModule, selfHash;

async function sha256(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const post = (type, data = {}, transfer = []) => self.postMessage({ type, ...data }, transfer);

async function init({ assets }) {
  const t0 = performance.now();
  installAssets(assets);
  // imported only now so YoWASP captures the in-memory fetch
  const [tar, vfs, fe, bridge, shim] = await Promise.all([
    import('./lib/tar.mjs'), import('./lib/vfs.mjs'), import('./lib/frontend.mjs'),
    import('./lib/clang-bridge.mjs'), import('./vendor/browser_wasi_shim/index.js'),
  ]);
  lib = { ...tar, ...vfs, ...fe, ...bridge, Directory: shim.Directory };
  pythonModule = await WebAssembly.compile(assets['assets/python.wasm']);
  frontendTar = assets['assets/frontend.tar'];
  const selfc = assets['assets/nuitka-selfc.wasm'];
  if (selfc) { selfHash = await sha256(selfc); selfModule = await WebAssembly.compile(selfc); }
  await lib.prefetch();
  post('ready', { ms: performance.now() - t0 });
}

async function compile({ source, job, interpretPackages, maxMemoryMiB, frontend = 'interpreted' }) {
  if (frontend === 'selfc' && !selfModule) throw new Error('self-compiled Nuitka (assets/nuitka-selfc.wasm) not loaded');
  const self = frontend === 'selfc';
  const stages = [];
  const stage = (name, ms, extra = {}) => { const s = { name, ms, ...extra }; stages.push(s); post('stage', s); };
  let t0 = performance.now();
  let root = new lib.Directory(lib.toShim(lib.untar(frontendTar)));
  if (self) root = lib.selfcRoot(root);
  stage('vfs-setup', performance.now() - t0);
  const enc = new TextEncoder();
  const sourceHash = await sha256(enc.encode(source));
  const extra = interpretPackages ? lib.INTERPRETED_PACKAGES.map(p => `--nofollow-import-to=${p}`) : [];
  t0 = performance.now();
  const fe = await lib.pythonToC({
    pythonModule, selfModule: self ? selfModule : undefined, root, job, source, extraArgs: extra,
    onLog: m => post('log', { text: m + '\n' }),
    onOutput: b => post('log', { text: new TextDecoder().decode(b) }),
  });
  const cHashes = {};
  const cwd = fe.plan[0].cwd;
  for (const f of Object.keys(fe.cSources)) cHashes[f] = await sha256(lib.shimGet(root, cwd + '/' + f).data);
  const mainC = lib.shimGet(root, cwd + '/module.__main__.c');
  stage('python-to-c', performance.now() - t0, { frontend, frontendRuns: fe.runs, cFiles: Object.keys(fe.cSources).length, planSteps: fe.plan.length });
  post('csource', { name: 'module.__main__.c', text: new TextDecoder().decode(mainC.data).slice(0, 200000) });
  t0 = performance.now();
  const { wasm, steps, linkArgv } = await lib.cToWasm({ root, plan: fe.plan, onStep: s => post('step', s), limits: maxMemoryMiB ? { maxMemoryMiB } : undefined, ...(self ? { build: '/nuitka/build' } : {}) });
  const compileMs = steps.filter(s => s.kind === 'compile').reduce((a, s) => a + s.ms, 0);
  const linkMs = steps.filter(s => s.kind === 'link').reduce((a, s) => a + s.ms, 0);
  stage('c-compile', compileMs, { objects: steps.length - 1 });
  stage('link', linkMs);
  const wasmHash = await sha256(wasm);
  post('compiled', {
    wasm, sourceHash, wasmHash, cHashes, frontend: self ? { mode: 'selfc', wasmSha256: selfHash } : { mode: 'interpreted' }, plan: fe.plan, linkArgv, stages, netLog: [...netLog],
    frontendLog: fe.log.slice(-20000),
  }, [wasm.buffer]);
}

// Milestone B path: hand-written C -> browser clang -c -> clang/wasm-ld link -> Wasm (no Python involved).
async function compileC({ source, job, maxMemoryMiB }) {
  const enc = new TextEncoder();
  const tree = { work: { c: { 'main.c': enc.encode(source) } } };
  const target = ['--target=wasm32-wasip1'];
  const steps = [];
  const run = async (kind, args) => {
    const t0 = performance.now();
    const r = await lib.runTool('clang', args, tree);
    const step = { kind, argv: ['clang', ...args], ms: performance.now() - t0, code: r.code, stderr: r.stderr.slice(0, 20000) };
    steps.push(step); post('step', { kind, output: args[args.indexOf('-o') + 1], ms: step.ms, code: r.code, stderr: step.stderr });
    if (r.code !== 0) throw Object.assign(new Error(`clang ${kind} failed (exit ${r.code})`), { log: r.stderr });
    for (const k of Object.keys(tree)) delete tree[k];
    Object.assign(tree, r.files);
  };
  await run('compile', [...target, '-O2', '-Wall', '-c', '/work/c/main.c', '-o', '/work/c/main.o']);
  await run('link', [...target, '/work/c/main.o', '-o', '/work/c/main.wasm', ...lib.linkLimitArgs(maxMemoryMiB ? { maxMemoryMiB } : {})]);
  const wasm = tree.work.c['main.wasm'];
  post('c-compiled', { job, wasm, sourceHash: await sha256(enc.encode(source)), objectHash: await sha256(tree.work.c['main.o']), wasmHash: await sha256(wasm), steps, netLog: [...netLog] }, [wasm.buffer]);
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') await init(data);
    else if (data.type === 'compile') await compile(data);
    else if (data.type === 'compile-c') await compileC(data);
  } catch (e) {
    post('error', { message: String(e?.message || e), log: e?.log?.slice(-20000), stack: e?.stack });
  }
};
