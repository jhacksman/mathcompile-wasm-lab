// Drive the real Nuitka frontend (running in CPython/WASI) and execute its recorded build plan with YoWASP clang/lld.
import { Directory } from '../vendor/browser_wasi_shim/index.js';
import { runWasi } from './wasi-run.mjs';
import { fromShim, shimGet, shimPut, shimRemove } from './vfs.mjs';
import { runTool } from './clang-bridge.mjs';
import { executePlan, treeGet, treeSet } from './plan-exec.mjs';

const dec = new TextDecoder();
const PROBE_CACHE = '/toolchain/probe-cache.json';

export const FRONTEND_ENV = {
  PYTHONPATH: '/nuitka:/usr/local/lib/python3.11/site-packages',
  PYTHONHASHSEED: '0',
  PYTHONIOENCODING: 'utf-8',
  NUITKA_WASI_FRONTEND: '1',
  CC: '/toolchain/bin/clang',
  PATH: '/toolchain/bin',
  HOME: '/tmp',
  NUITKA_WASI_PROBE_CACHE: PROBE_CACHE,
  NUITKA_WASI_PYTHON_PREFIX: '/target',
};

// Milestone E: the self-compiled Nuitka (nuitka-selfc.wasm, a Nuitka standalone binary, no python.wasm) has its own
// modules compiled in. It finds its data files relative to ./nuitka (cwd "/"), so it sees the Nuitka package directory
// at /nuitka; NUITKA_PYTHONPATH(_AST) give its target-Python probes the stdlib path and NUITKA_WASI_TARGET_STDLIB
// names the target stdlib for standard-library detection (same environment as experiments/selfcompile/run-selfc.sh).
const TARGET_STDLIB = '/usr/local/lib/python3.11';
export const SELFC_ENV = {
  ...FRONTEND_ENV,
  PYTHONPATH: TARGET_STDLIB + '/site-packages',
  NUITKA_WASI_TARGET_STDLIB: TARGET_STDLIB,
  NUITKA_PYTHONPATH_AST: TARGET_STDLIB,
  NUITKA_PYTHONPATH: `['${TARGET_STDLIB}/site-packages', '${TARGET_STDLIB}', '${TARGET_STDLIB}/lib-dynload']`,
};
export function selfcRoot(root) {
  const contents = new Map(root.contents);
  contents.set('nuitka', root.contents.get('nuitka').contents.get('nuitka'));
  return new Directory(contents);
}

export const NUITKA_FLAGS = ['--standalone', '--static-libpython=yes', '--disable-ccache', '--lto=yes', '--no-progressbar', '--jobs=1'];

// libraries that are interpreted (from runtime.tar) by the CPython linked into the generated program
export const INTERPRETED_PACKAGES = ['sympy', 'mpmath'];

async function answerProbe(pythonModule, root, req, log, pythonPath) {
  let r;
  if (req.args[0] === '<python>') {
    r = await runWasi(pythonModule, {
      args: ['python', ...req.args.slice(1)],
      env: { PYTHONPATH: pythonPath, PYTHONHASHSEED: '0', PYTHONIOENCODING: 'utf-8' },
      root, stdin: new TextEncoder().encode(req.stdin), maxOutput: 64 << 20,
    });
    r = { stdout: dec.decode(r.stdout), stderr: dec.decode(r.stderr), code: r.code };
  } else if (['clang', 'wasm-ld'].includes(req.args[0].split('/').at(-1))) {
    r = await runTool(req.args[0].split('/').at(-1), req.args.slice(1), {});
  } else {
    throw new Error('refusing unknown probe tool ' + req.args[0]);
  }
  const cache = JSON.parse(dec.decode(shimGet(root, PROBE_CACHE).data));
  cache[req.key] = { args: req.args, stdin: req.stdin, stdout: r.stdout, stderr: r.stderr, exit_code: r.code };
  shimPut(root, PROBE_CACHE, JSON.stringify(cache));
  log(`probe ${req.key.slice(0, 12)} ${req.args.slice(0, 3).join(' ')} -> exit ${r.code}`);
}

// root: browser_wasi_shim Directory holding frontend.tar (selfcRoot(...) with selfModule); mutated (sources, build dir, plan).
// selfModule: run the self-compiled Nuitka instead of `python.wasm -m nuitka` (python.wasm then only answers target probes).
export async function pythonToC({ pythonModule, selfModule, root, job, source, extraArgs = [], onLog = () => {}, onOutput = () => {} }) {
  const dir = `/work/${job}`;
  const planPath = `${dir}/plan.jsonl`;
  shimPut(root, `${dir}/main.py`, source);
  const pending = PROBE_CACHE + '.pending.json';
  const runs = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    shimRemove(root, planPath);
    shimRemove(root, pending);
    const t0 = performance.now();
    const nuitkaArgs = [`${dir}/main.py`, ...NUITKA_FLAGS, `--output-dir=${dir}/out`, ...extraArgs];
    const r = await runWasi(selfModule || pythonModule, {
      args: selfModule ? ['nuitka', ...nuitkaArgs] : ['python', '-S', '-X', 'frozen_modules=off', '-m', 'nuitka', ...nuitkaArgs],
      env: { ...(selfModule ? SELFC_ENV : FRONTEND_ENV), NUITKA_WASI_BUILD_PLAN: planPath },
      root, maxOutput: 4 << 20, onStdout: onOutput, onStderr: onOutput,
    });
    const ms = performance.now() - t0;
    const text = dec.decode(r.stdout) + dec.decode(r.stderr);
    runs.push({ attempt, ms, code: r.code });
    const req = shimGet(root, pending);
    if (req) {
      onLog(`frontend run ${attempt} needs target probe (${ms.toFixed(0)} ms)`);
      await answerProbe(pythonModule, root, JSON.parse(dec.decode(req.data)), onLog, (selfModule ? SELFC_ENV : FRONTEND_ENV).PYTHONPATH);
      continue;
    }
    if (r.code !== 0) {
      const e = new Error(`Nuitka frontend failed (exit ${r.code})`);
      e.log = text; e.runs = runs;
      throw e;
    }
    const plan = dec.decode(shimGet(root, planPath).data).trim().split('\n').map(l => JSON.parse(l));
    return { plan, runs, log: text, cSources: listCSources(root, plan[0].cwd) };
  }
  throw new Error('too many probe round trips');
}

function listCSources(root, cwd) {
  const out = {};
  const walk = (d, prefix) => {
    for (const [n, ino] of d.contents) {
      if (ino instanceof Directory) walk(ino, prefix + n + '/');
      else if (/\.(c|h|const)$/.test(n)) out[prefix + n] = ino.data.length;
    }
  };
  walk(shimGet(root, cwd), '');
  return out;
}

function subtree(root, path, filter = () => true) {
  const conv = (d, p) => {
    const t = {};
    for (const [n, ino] of d.contents) {
      const q = p + '/' + n;
      if (!filter(q)) continue;
      if (ino instanceof Directory) t[n] = conv(ino, q);
      else t[n] = ino.data;
    }
    return t;
  };
  return conv(shimGet(root, path), path);
}

// Execute the recorded compiler/linker actions with YoWASP clang/lld; returns the linked Wasm bytes.
// Output-target link limits: an 8 MiB shadow stack placed first (overflow traps instead of corrupting
// data/function tables) and a hard cap on linear memory growth (malloc fails -> Python MemoryError).
export const LINK_LIMITS = { stackBytes: 8 << 20, maxMemoryMiB: 2048 };
export function linkLimitArgs({ stackBytes = LINK_LIMITS.stackBytes, maxMemoryMiB = LINK_LIMITS.maxMemoryMiB } = {}) {
  return [`-Wl,-z,stack-size=${stackBytes}`, '-Wl,--stack-first', `-Wl,--max-memory=${maxMemoryMiB * 1024 * 1024}`];
}

export async function cToWasm({ root, plan, onStep, signal, limits, build = '/nuitka/nuitka/build' }) {
  plan = [...plan.slice(0, -1), { ...plan.at(-1), argv: [...plan.at(-1).argv, ...linkLimitArgs(limits)] }];
  const keepInline = ['zlib', 'libbacktrace'];
  const tree = {};
  treeSet(tree, build, subtree(root, build, p =>
    !p.includes('__pycache__') && !p.endsWith('.py') && !p.endsWith('.pyc') &&
    (!p.startsWith(build + '/inline_copy/') || keepInline.some(k => p.startsWith(`${build}/inline_copy/${k}`)))));
  treeSet(tree, '/target', subtree(root, '/target'));
  const cwd = plan[0].cwd;
  treeSet(tree, cwd, subtree(root, cwd));
  const link = plan.at(-1).argv;
  const linkOut = link[link.indexOf('-o') + 1];
  treeSet(tree, linkOut.split('/').slice(0, -1).join('/'), {});
  const steps = await executePlan(plan, tree, { onStep, signal });
  const wasm = treeGet(tree, linkOut);
  if (!(wasm instanceof Uint8Array) || !wasm.length) throw new Error('linker produced no output at ' + linkOut);
  return { wasm, steps, linkArgv: plan.at(-1).argv };
}
