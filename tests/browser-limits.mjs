// Resource-control checks in Chrome: cancel during compile + compiler-worker restart, Wasm memory cap
// (MemoryError recovery), bounded output, run timeout kill, and re-running after the kill.
// usage: CHROME=... node tests/browser-limits.mjs [--out results/limits.json]
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const port = process.env.PORT || '8644';
const server = spawn(process.execPath, [new URL('../scripts/serve.mjs', import.meta.url).pathname], { env: { ...process.env, PORT: port }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 500));
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
const ctx = await browser.newContext({ bypassCSP: true });
const page = await ctx.newPage();
await page.goto(`http://localhost:${port}/?t=${Date.now()}`);
await page.click('#prefetch');
await page.waitForFunction(() => /ready in|failed/.test(document.getElementById('assetStatus').textContent), null, { timeout: 600000 });
const text = id => page.textContent('#' + id);
const waitStatus = (re, timeout = 3600000) => page.waitForFunction(r => new RegExp(r).test(document.getElementById('status').textContent), re.source, { timeout, polling: 250 });
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, '|', String(detail).slice(0, 200)); };

// 1. cancel while the Nuitka frontend is running, then compile again on the restarted compiler worker
await page.fill('#src', 'print("never finishes")\n');
await page.click('#compile');
await page.waitForTimeout(15000);
await page.click('#cancel');
await waitStatus(/compile failed/, 60000);
check('cancel during compile', /cancelled by user/.test(await text('status')), await text('status'));

const source = fs.readFileSync(new URL('./cases/limits.py', import.meta.url), 'utf8');
await page.fill('#src', source);
await page.fill('#maxmem', '256');
await page.fill('#maxout', '64');
await page.fill('#timeout', '30');
await page.waitForFunction(() => !document.getElementById('compile').disabled, null, { timeout: 120000 });
await page.click('#compile');
await waitStatus(/compiled in|failed/);
check('compile after cancel (restarted compiler worker)', /compiled in/.test(await text('status')), await text('status'));
const linkArgv = await page.evaluate(() => window.labState.evidence.compile?.linkArgv || []);
check('link argv carries memory cap', linkArgv.includes(`-Wl,--max-memory=${256 << 20}`), linkArgv.slice(-3).join(' '));

// 2. run: MemoryError at the 256 MiB cap is caught, output is truncated at 64 KiB, endless loop is killed at 30 s
for (const attempt of [1, 2]) {
  const t0 = Date.now();
  await page.click('#run');
  await waitStatus(/^(exit|trap|runtime error|killed|worker crashed|run cancelled)/, 120000);
  const status = await text('status'), stdout = await text('stdout');
  check(`run ${attempt}: MemoryError caught under cap`, /memory: MemoryError caught after \d+ MiB; recovered: 499999500000/.test(stdout), stdout.split('\n')[0]);
  check(`run ${attempt}: stdout bounded to 64 KiB`, Buffer.byteLength(stdout) <= 64 * 1024 && !/flood done/.test(stdout), Buffer.byteLength(stdout) + ' bytes');
  check(`run ${attempt}: endless loop killed by timeout`, /killed after 30 s timeout/.test(status), `${status} after ${Date.now() - t0} ms`);
}
check('UI responsive after kill', await page.evaluate(() => !document.getElementById('run').disabled), 'run button enabled');
const failures = checks.filter(c => !c.ok).length;
if (out) fs.writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), browser: browser.version(), failures, checks }, null, 1));
await browser.close(); server.kill();
process.exit(failures ? 1 : 0);
