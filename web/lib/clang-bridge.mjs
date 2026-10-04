// Shared bridge between Nuitka's recorded tool invocations and YoWASP clang/lld.
// Used unchanged by the Node test harness and the browser worker.
import { commands, runLLVM, Exit } from '../vendor/yowasp-clang/bundle.js';

const DRIVER_ONLY = ['-dumpversion', '-dumpfullversion', '-dumpmachine', '--version', '-print-target-triple'];

export async function prefetch(fetchProgress = () => {}) {
  await runLLVM(null, {}, { fetchProgress });
}

// runTool('clang' | 'wasm-ld' | 'ar', argv, files) -> {code, stdout, stderr, files}
export async function runTool(tool, args, files = {}, opts = {}) {
  const dec = new TextDecoder();
  let stdout = '', stderr = '', code = 0;
  const options = {
    stdout: b => { if (b) stdout += dec.decode(b, { stream: true }); },
    stderr: b => { if (b) stderr += dec.decode(b, { stream: true }); },
    fetchProgress: opts.fetchProgress || (() => {}),
    decodeASCII: false,
  };
  // YoWASP's clang wrapper runs "-###" first and reports driver-only queries on
  // stderr; real clang prints them on stdout, which Nuitka parses.
  const driverOnly = tool === 'clang' && args.some(a => DRIVER_ONLY.includes(a));
  let out;
  try {
    out = driverOnly ? await runLLVM(['clang', ...args], files, options)
                     : await commands[tool](args, files, options);
  } catch (e) {
    if (!(e instanceof Exit)) throw e;
    code = e.code; out = e.files;
  }
  return { code, stdout, stderr, files: out };
}
