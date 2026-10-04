// Milestone B: hand-written C, edited after page load, compiled by YoWASP clang and linked by wasm-ld inside the
// compiler worker, then executed in the run worker -- offline after prefetch.
// usage: CHROME=... node tests/browser-c.mjs [--out results/milestoneB.json]
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const port = process.env.PORT || '8644';
const url = `http://localhost:${port}/`;
const reqLog = `/tmp/lab-requests-${port}.jsonl`;
fs.rmSync(reqLog, { force: true });
const server = spawn(process.execPath, [new URL('../scripts/serve.mjs', import.meta.url).pathname], { env: { ...process.env, PORT: port, REQUEST_LOG: reqLog }, stdio: 'inherit' });
await new Promise(r => setTimeout(r, 500));
const browser = process.env.CHROME
  ? await chromium.launch({ executablePath: process.env.CHROME, headless: true })
  : await chromium.connectOverCDP(process.env.CDP || 'http://localhost:29229');
const ctx = process.env.CHROME ? await browser.newContext({ bypassCSP: true }) : (browser.contexts()[0] || await browser.newContext());
const page = await ctx.newPage();
await page.goto(url + '?t=' + Date.now());
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.click('#prefetch');
await page.waitForFunction(() => /ready in|failed/.test(document.getElementById('assetStatus').textContent), null, { timeout: 600000 });
server.kill('SIGKILL');
await new Promise(r => server.once('exit', r));
await ctx.setOffline(true);
const offlineAt = Date.now();
const sha = t => crypto.createHash('sha256').update(t).digest('hex');

// the second program is the first one edited (different constant, extra function), with a per-run nonce
const nonce = crypto.randomInt(1, 1 << 30);
const programs = [
  { name: 'c-v1', source: `#include <stdio.h>
#include <stdint.h>
static uint64_t powmod(uint64_t b, uint64_t e, uint64_t m) { uint64_t r = 1; b %= m; while (e) { if (e & 1) r = r * b % m; b = b * b % m; e >>= 1; } return r; }
int main(void) { printf("v1 powmod(3,%d,1000003)=%llu\\n", ${nonce}, (unsigned long long)powmod(3, ${nonce}, 1000003)); return 0; }
`, expect: n => `v1 powmod(3,${n},1000003)=${modpow(3n, BigInt(n), 1000003n)}\n` },
  { name: 'c-v2-edited', source: `#include <stdio.h>
#include <stdint.h>
static uint64_t powmod(uint64_t b, uint64_t e, uint64_t m) { uint64_t r = 1; b %= m; while (e) { if (e & 1) r = r * b % m; b = b * b % m; e >>= 1; } return r; }
static unsigned collatz(uint64_t n) { unsigned s = 0; while (n != 1) { n = n & 1 ? 3 * n + 1 : n / 2; s++; } return s; }
int main(void) { printf("v2 powmod(7,%d,998244353)=%llu collatz=%u\\n", ${nonce}, (unsigned long long)powmod(7, ${nonce}, 998244353), collatz(${nonce})); return 3; }
`, expect: n => `v2 powmod(7,${n},998244353)=${modpow(7n, BigInt(n), 998244353n)} collatz=${collatz(n)}\n`, exit: 3 },
];
function modpow(b, e, m) { let r = 1n; b %= m; while (e) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; }
function collatz(n) { let s = 0; n = BigInt(n); while (n !== 1n) { n = n & 1n ? 3n * n + 1n : n / 2n; s++; } return s; }

const results = [];
let ok = true;
for (const p of programs) {
  const r = await page.evaluate(async ({ source, name }) => {
    const st = window.labState;
    const t0 = performance.now();
    const c = await new Promise((resolve, reject) => {
      const h = ({ data }) => {
        if (data.type === 'c-compiled') { st.compiler.removeEventListener('message', h); resolve(data); }
        else if (data.type === 'error') { st.compiler.removeEventListener('message', h); reject(new Error(data.message + '\n' + (data.log || ''))); }
      };
      st.compiler.addEventListener('message', h);
      st.compiler.postMessage({ type: 'compile-c', source, job: name });
    });
    const compileMs = performance.now() - t0;
    const w = new Worker('run-worker.mjs', { type: 'module', name: 'runner-c' });
    const run = await new Promise((resolve, reject) => {
      w.onmessage = ({ data }) => { if (data.type === 'done') resolve(data); else if (data.type === 'error') reject(new Error(data.message)); };
      w.postMessage({ wasm: c.wasm, runtimeTar: st.assets['assets/runtime.tar'], maxOutput: 65536, repeat: 1 });
    });
    w.terminate();
    return { compileMs, sourceHash: c.sourceHash, objectHash: c.objectHash, wasmHash: c.wasmHash, wasmBytes: c.wasm.byteLength,
             steps: c.steps, workerNet: c.netLog.filter(e => e.served === 'refused'), imports: run.imports, run: run.runs[0] };
  }, { source: p.source, name: p.name });
  const want = p.expect(nonce);
  const pass = r.run.stdout === want && r.run.code === (p.exit ?? 0) && sha(p.source) === r.sourceHash;
  ok &&= pass;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${p.name}: exit ${r.run.code} stdout ${JSON.stringify(r.run.stdout)} (${(r.compileMs / 1000).toFixed(2)} s compile+link, ${r.wasmBytes} B wasm)`);
  results.push({ name: p.name, source: p.source, expected: want, pass, ...r });
}
const serverRequests = fs.existsSync(reqLog) ? fs.readFileSync(reqLog, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const result = { userAgent: await page.evaluate(() => navigator.userAgent), nonce, offline: true, offlineAt,
  serverRequestsAfterOffline: serverRequests.filter(r => r.t >= offlineAt), programs: results };
console.log('server requests after offline:', result.serverRequestsAfterOffline.length);
if (outIdx >= 0) fs.writeFileSync(args[outIdx + 1], JSON.stringify(result, null, 1));
await browser.close();
process.exit(ok ? 0 : 1);
