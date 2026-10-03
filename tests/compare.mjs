// Compares lab (compiled) results with Pyodide 0.25.1 and hand-checked expected lines.
// usage: node tests/compare.mjs lab.json pyodide.json [out.json]   (exit 1 on any mismatch)
import fs from 'node:fs';

const [labFile, pyFile, outFile] = process.argv.slice(2);
const lab = JSON.parse(fs.readFileSync(labFile, 'utf8'));
const pyo = JSON.parse(fs.readFileSync(pyFile, 'utf8'));
const trusted = JSON.parse(fs.readFileSync(new URL('./trusted.json', import.meta.url), 'utf8'));
const lastLine = s => s.trim().split('\n').filter(Boolean).pop() || '';
const report = [];
let failures = 0;
for (const p of lab.programs) {
  const q = pyo.results.find(r => r.file === p.file)?.runs[0];
  const checks = [];
  const check = (name, ok, detail) => { checks.push({ name, ok, ...(ok ? {} : { detail }) }); if (!ok) failures++; };
  check('pyodide-present', !!q, 'no pyodide result');
  const known = trusted._known_divergences?.[p.file];
  if (known && q) {
    // Documented divergence: verify both sides behave exactly as documented instead of comparing them.
    check('known divergence: pyodide', q.stdout.includes(known.pyodide_expect), 'pyodide did not show ' + known.pyodide_expect);
    check('known divergence: lab trap', (p.trap || '').includes(known.lab_expect_trap), 'lab trap: ' + p.trap);
    report.push({ file: p.file, knownDivergence: known.reason, sourceSha256: p.sourceSha256, stdoutSha256: p.stdoutSha256, trap: p.trap, wasmSha256: p.evidence?.compile?.wasmHash, checks });
    console.log(`${p.file}: KNOWN DIVERGENCE, ${checks.filter(c => c.ok).length}/${checks.length} documented-behaviour checks passed`);
    for (const c of checks.filter(c => !c.ok)) console.log('  FAIL', c.name, c.detail);
    continue;
  }
  if (q) {
    check('stdout == pyodide', p.stdout === q.stdout, diff(p.stdout, q.stdout));
    check('exit == pyodide', p.exit === q.code, `${p.exit} vs ${q.code}`);
    if (q.code !== 0) check('last stderr line == pyodide', lastLine(p.stderr) === lastLine(q.stderr), `${lastLine(p.stderr)} | ${lastLine(q.stderr)}`);
  }
  const lines = new Set(p.stdout.split('\n'));
  for (const t of trusted[p.file] || []) check(`trusted: ${t.slice(0, 60)}`, lines.has(t), 'line missing');
  if (p.file === 'errors.py') check('trusted uncaught exception', lastLine(p.stderr) === trusted._errors_expected_last_stderr_line, lastLine(p.stderr));
  report.push({ file: p.file, sourceSha256: p.sourceSha256, stdoutSha256: p.stdoutSha256, wasmSha256: p.evidence?.compile?.wasmHash, checks });
  console.log(`${p.file}: ${checks.filter(c => c.ok).length}/${checks.length} checks passed`);
  for (const c of checks.filter(c => !c.ok)) console.log('  FAIL', c.name, c.detail);
}
function diff(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return `line ${i + 1}: lab=${JSON.stringify(x[i])} pyodide=${JSON.stringify(y[i])}`;
  return '';
}
if (outFile) fs.writeFileSync(outFile, JSON.stringify({ failures, report }, null, 1));
process.exit(failures ? 1 : 0);
