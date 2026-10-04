// Execute a Nuitka WASI build plan (JSON lines recorded by the in-WASI frontend)
// with YoWASP clang/lld. Environment-neutral: works on a Tree in Node and browser.
import { runTool } from './clang-bridge.mjs';

function splitPath(p) { return p.split('/').filter(Boolean); }

export function treeGet(tree, path) {
  let node = tree;
  for (const part of splitPath(path)) { if (node == null || typeof node !== 'object' || node instanceof Uint8Array) return undefined; node = node[part]; }
  return node;
}

export function deletePath(tree, path) {
  const parts = splitPath(path);
  const parent = parts.length > 1 ? treeGet(tree, parts.slice(0, -1).join('/')) : tree;
  if (parent && typeof parent === 'object') delete parent[parts.at(-1)];
}

export function treeSet(tree, path, value) {
  const parts = splitPath(path); let node = tree;
  for (const part of parts.slice(0, -1)) node = (node[part] ??= {});
  node[parts.at(-1)] = value;
}

// YoWASP preopens only "/" with cwd "/". All plan entries share one cwd (the
// Nuitka build dir); its contents are overlaid at "/" next to the absolute mounts.
export function overlayCwd(root, cwd) {
  const dir = treeGet(root, cwd);
  for (const [name, v] of Object.entries(dir)) {
    if (name in root) throw new Error(`cwd overlay clash on /${name}`);
    root[name] = v;
  }
  return Object.keys(dir);
}

export async function executePlan(plan, root, { onStep = () => {}, signal } = {}) {
  const cwds = new Set(plan.map(e => e.cwd));
  if (cwds.size !== 1) throw new Error('plan uses several working directories: ' + [...cwds]);
  const cwd = plan[0].cwd;
  const overlaid = overlayCwd(root, cwd);
  const steps = [];
  // Objects produced by earlier compile steps are never inputs of later compile steps; keep them out of the
  // file tree handed to YoWASP (which copies the whole tree in and out per invocation) until the link step.
  const produced = new Map();
  for (const [i, entry] of plan.entries()) {
    if (signal?.aborted) throw new Error('cancelled');
    const [tool0, ...args] = entry.argv;
    const tool = tool0.split('/').at(-1);
    if (!['clang', 'wasm-ld', 'ar'].includes(tool)) throw new Error('unexpected tool in plan: ' + tool0);
    const isLink = !args.includes('-c');
    const output = args[args.indexOf('-o') + 1];
    // YoWASP's clang cannot replace an existing file (rename-over fails), and the
    // frontend left empty placeholders for Scons; remove them first.
    deletePath(root, output);
    for (const [p, data] of produced) {
      if (isLink) treeSet(root, p, data);
      else deletePath(root, p);
    }
    if (isLink) produced.clear();
    const t0 = performance.now();
    const r = await runTool(tool, args, root);
    const ms = performance.now() - t0;
    const step = { i, kind: isLink ? 'link' : 'compile', output, ms, code: r.code, stderr: r.stderr.slice(0, 20000) };
    steps.push(step); onStep(step);
    if (r.code !== 0) { const e = new Error(`${tool} failed (exit ${r.code}) for ${step.output}:\n${r.stderr}`); e.steps = steps; throw e; }
    // keep YoWASP's returned tree (it contains the new outputs); drop its resource dirs
    for (const k of Object.keys(root)) delete root[k];
    Object.assign(root, r.files);
    if (!isLink && output.endsWith('.o')) produced.set(output, treeGet(root, output));
  }
  for (const [p, data] of produced) treeSet(root, p, data);
  return steps;
}
