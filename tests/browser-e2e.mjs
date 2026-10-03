// Drives web/ in Chrome (CDP) : prefetch -> optional offline -> compile fresh source -> run.
// usage: CHROME=... node tests/browser-e2e.mjs a.py [b.py ...] [--offline] [--full-compile] [--selfc] [--out result.json] [--repeat N]
// All files are compiled one after another in the same page (cached toolchain, fresh source each time).
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const srcFiles = args.filter((a, i) => a.endsWith('.py') && !['--out', '--repeat'].includes(args[i - 1]));
const offline = args.includes('--offline');
const full = args.includes('--full-compile');
const selfc = args.includes('--selfc');
const outIdx = args.indexOf('--out');
const repIdx = args.indexOf('--repeat');
// The harness owns the HTTP server so --offline can kill it: after that no server exists that could compile.
const port = process.env.PORT || '8643';
const url = `http://localhost:${port}/`;
const reqLog = `/tmp/lab-requests-${port}.jsonl`;
fs.rmSync(reqLog, { force: true });
const server = spawn(process.execPath, [new URL('../scripts/serve.mjs', import.meta.url).pathname], { env: { ...process.env, PORT: port, REQUEST_LOG: reqLog }, stdio: 'inherit' });
await new Promise(r => setTimeout(r, 500));
const cdp = process.env.CDP || 'http://localhost:29229';

// CHROME=/path/to/chrome launches a private headless instance; otherwise attach to a running Chrome over CDP
const browser = process.env.CHROME
  ? await chromium.launch({ executablePath: process.env.CHROME, headless: true, args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] })
  : await chromium.connectOverCDP(cdp);
// bypassCSP only lets the harness's own waitForFunction polling run; workers keep the page CSP semantics otherwise
const ctx = process.env.CHROME ? await browser.newContext({ bypassCSP: true }) : (browser.contexts()[0] || await browser.newContext());
const page = await ctx.newPage();
const client = await ctx.newCDPSession(page);
await client.send('Network.enable');
const net = [];
client.on('Network.requestWillBeSent', e => net.push({ t: Date.now(), phase: e.__phase || 'page', url: e.request.url, type: e.type }));
page.on('console', m => console.error('[console]', m.text().slice(0, 300)));
page.on('worker', w => console.error('[worker]', w.url()));
await page.goto(url + '?t=' + Date.now() + (selfc ? '&selfc=1' : ''));
// first visit installs the service worker; reload so it controls the page and its workers
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
const t0 = Date.now();
await page.click('#prefetch');
await page.waitForFunction(() => /ready in/.test(document.getElementById('assetStatus').textContent) || /failed/.test(document.getElementById('assetStatus').textContent), null, { timeout: 600000 });
const assetStatus = await page.textContent('#assetStatus');
console.error('assets:', assetStatus, (Date.now() - t0) + 'ms');
const netBeforeOffline = net.length;
let offlineAt = null;
if (offline) {
  server.kill('SIGKILL');
  await new Promise(r => server.once('exit', r));
  await ctx.setOffline(true);
  await client.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  offlineAt = Date.now();
  console.error('network: OFFLINE (server process killed, context offline)');
}
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
if (full) await page.uncheck('#interp');
if (repIdx > 0) await page.fill('#repeat', args[repIdx + 1]);
await page.fill('#ctimeout', '7200');
const programs = [];
for (const srcFile of srcFiles) {
  const source = fs.readFileSync(srcFile, 'utf8');
  await page.fill('#src', source);
  const tc = Date.now();
  await page.click('#compile');
  await page.waitForFunction(() => /compiled in|failed/.test(document.getElementById('status').textContent), null, { timeout: 7200000, polling: 1000 });
  let status = await page.textContent('#status');
  console.error(path.basename(srcFile), 'compile status:', status, (Date.now() - tc) + 'ms');
  if (/compiled in/.test(status)) {
    await page.click('#run');
    await page.waitForFunction(() => /^(exit|trap|runtime error|killed|worker crashed|run cancelled)/.test(document.getElementById('status').textContent), null, { timeout: 3600000, polling: 500 });
    status = await page.textContent('#status');
  }
  const evidence = await page.evaluate(() => JSON.parse(JSON.stringify(window.labState.evidence)));
  const runs = evidence.run?.runs || [];
  const r0 = runs[0] || { stdout: await page.textContent('#stdout'), stderr: await page.textContent('#stderr'), code: null };
  console.error(path.basename(srcFile), 'status:', status);
  programs.push({
    file: path.basename(srcFile), sourceSha256: sha(source), status, exit: r0.code, trap: r0.trap || null, stdout: r0.stdout, stdoutSha256: sha(r0.stdout),
    stderr: r0.stderr.slice(-20000), evidence,
  });
  await page.evaluate(() => { delete window.labState.evidence.compile; delete window.labState.evidence.run; });
}
const ua = await page.evaluate(() => navigator.userAgent);
const serverRequests = fs.readFileSync(reqLog, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const result = {
  url, offline, offlineAt, fullCompile: full, selfc, userAgent: ua, assetStatus,
  serverRequests, serverRequestsAfterOffline: offlineAt ? serverRequests.filter(r => r.t >= offlineAt) : null,
  cdpRequests: net, cdpRequestsAfterOffline: net.slice(netBeforeOffline), programs,
};
for (const p of programs) console.log(`== ${p.file} exit ${p.exit}\n${p.stdout}`);
console.error('server requests after offline:', JSON.stringify(result.serverRequestsAfterOffline));
if (outIdx > 0) fs.writeFileSync(args[outIdx + 1], JSON.stringify(result, null, 1));
await page.close();
await browser.close();
server.kill();
