// Checks the offline unseen-source proof: lab run succeeded offline and its stdout equals Pyodide's.
import fs from 'node:fs';
const lab = JSON.parse(fs.readFileSync('results/offline-unseen-proof.json'));
const p = lab.programs[0];
const py = JSON.parse(fs.readFileSync('results/offline-unseen-pyodide.json')).results[0].runs[0];
const checks = {
  labExit0: p.exit === 0,
  stdoutIdenticalToPyodide: p.stdout === py.stdout,
  noServerRequestsAfterOffline: lab.serverRequestsAfterOffline.length === 0,
  sourceHash: p.sourceSha256,
  wasmHash: p.evidence.compile.wasmHash,
  stages: p.evidence.compile.stages.map(s => [s.name, Math.round(s.ms)]),
  workerRefusedFetches: p.evidence.compile.workerNet.filter(e => e.served === 'refused').length,
};
const ok = checks.workerRefusedFetches === 0 && checks.labExit0 && checks.stdoutIdenticalToPyodide && checks.noServerRequestsAfterOffline;
fs.writeFileSync('results/offline-unseen-check.json', JSON.stringify({ ok, ...checks }, null, 1));
console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(checks));
process.exit(ok ? 0 : 1);
