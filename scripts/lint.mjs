// Lint: syntax-check every JS module/worker and Python script in the repo (no third-party linters needed).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const skip = new Set(['node_modules', 'vendor', 'pyodide', 'assets', 'results', '.git']);
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else files.push(p);
  }
})(root);
let bad = 0;
for (const f of files) {
  try {
    if (/\.(m?js)$/.test(f)) execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    else if (f.endsWith('.py')) execFileSync('python3', ['-m', 'py_compile', f], { stdio: 'pipe' });
    else if (f.endsWith('.sh')) execFileSync('bash', ['-n', f], { stdio: 'pipe' });
    else if (f.endsWith('.json')) JSON.parse(fs.readFileSync(f, 'utf8'));
    else continue;
  } catch (e) { bad++; console.error('FAIL', path.relative(root, f), String(e.stderr || e.message).slice(0, 400)); }
}
console.log(`${files.length} files scanned, ${bad} failures`);
process.exit(bad ? 1 : 0);
