// Host harness: execute a recorded build plan with YoWASP clang/lld (same code as the browser worker)
import fs from 'node:fs';
import path from 'node:path';
import { prefetch } from '../../web/lib/clang-bridge.mjs';
import { executePlan, treeGet, treeSet } from '../../web/lib/plan-exec.mjs';
import { linkLimitArgs } from '../../web/lib/frontend.mjs';

function loadTree(dir, filter = () => true) {
  const t = {};
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (!filter(p)) continue;
    if (e.isDirectory()) t[e.name] = loadTree(p, filter);
    else if (e.isFile()) t[e.name] = new Uint8Array(fs.readFileSync(p));
  }
  return t;
}

const [planFile, fsRoot, nuitkaRoot, outFile] = process.argv.slice(2);
let plan = fs.readFileSync(planFile, 'utf8').trim().split('\n').map(JSON.parse);
// Optional object cache for long plans: OBJ_CACHE=dir keeps every .o; REBUILD=regex selects compile steps to redo.
const objCache = process.env.OBJ_CACHE;
const rebuild = process.env.REBUILD ? new RegExp(process.env.REBUILD) : null;
const outOf = e => e.argv[e.argv.indexOf('-o') + 1];
const cached = new Map();
if (objCache && rebuild) {
  plan = plan.filter(e => {
    const o = outOf(e), f = path.join(objCache, o);
    if (!e.argv.includes('-c') || rebuild.test(o) || !fs.existsSync(f)) return true;
    cached.set(o, new Uint8Array(fs.readFileSync(f)));
    return false;
  });
  console.error('reusing', cached.size, 'cached objects; executing', plan.length, 'steps');
}
const build = path.join(nuitkaRoot, 'nuitka/build');
const keep = p => !p.startsWith(path.join(build, 'inline_copy')) || ['zlib', 'libbacktrace'].some(d => p === path.join(build, 'inline_copy') || p.startsWith(path.join(build, 'inline_copy', d)));
const root = {};
// The interpreted frontend sees the checkout at /nuitka; the self-compiled one (Milestone E) the package itself.
const buildMount = plan[0].argv.includes('-I/nuitka/build/include') ? '/nuitka/build' : '/nuitka/nuitka/build';
treeSet(root, buildMount, loadTree(build, p => keep(p) && !p.includes('__pycache__')));
treeSet(root, '/target', loadTree(path.join(fsRoot, 'target')));
// Same output-target link limits as the browser (cToWasm): 8 MiB stack first, capped linear memory.
if (!plan.at(-1).argv.some(a => a.includes('stack-size'))) plan.at(-1).argv.push(...linkLimitArgs());
const cwd = plan[0].cwd;
treeSet(root, cwd, loadTree(path.join(fsRoot, cwd)));
for (const [o, data] of cached) treeSet(root, path.join(cwd, o), data);
const linkOut = plan.at(-1).argv[plan.at(-1).argv.indexOf('-o') + 1];
treeSet(root, path.dirname(linkOut), {});
let t = performance.now();
await prefetch();
console.error('prefetch ms', (performance.now() - t).toFixed(0));
t = performance.now();
const steps = await executePlan(plan, root, { onStep: s => console.error(s.kind, s.output, s.ms.toFixed(0) + 'ms', 'exit', s.code, s.stderr ? s.stderr.slice(0, 2000) : '') });
console.error('plan ms', (performance.now() - t).toFixed(0));
if (objCache) {
  for (const e of plan) {
    const o = outOf(e); if (!e.argv.includes('-c')) continue;
    const data = treeGet(root, o.startsWith('/') ? o : path.join('/', o));
    if (data) { fs.mkdirSync(path.dirname(path.join(objCache, o)), { recursive: true }); fs.writeFileSync(path.join(objCache, o), data); }
  }
}
const wasm = treeGet(root, linkOut);
fs.writeFileSync(outFile, wasm);
console.log(JSON.stringify({ out: outFile, bytes: wasm.length, steps: steps.map(s => ({ kind: s.kind, output: s.output, ms: Math.round(s.ms) })) }));
