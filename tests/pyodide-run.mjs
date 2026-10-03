// Runs Python files in the Pyodide 0.25.1 baseline (fresh interpreter per file) in headless Chrome.
// usage: CHROME=... node tests/pyodide-run.mjs out.json file.py... [--repeat N] [--no-clear-cache]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const out = args[0];
const repIdx = args.indexOf('--repeat');
const repeat = repIdx > 0 ? +args[repIdx + 1] : 1;
const files = args.slice(1).filter((a, i, all) => a.endsWith('.py'));
const port = process.env.PORT || '8644';
const server = spawn(process.execPath, [new URL('../scripts/serve.mjs', import.meta.url).pathname], { env: { ...process.env, PORT: port }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 500));
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
const ctx = await browser.newContext({ bypassCSP: true });
const page = await ctx.newPage();
await page.goto(`http://localhost:${port}/pyodide.html`);
const results = [];
for (const f of files) {
  const source = fs.readFileSync(f, 'utf8');
  const r = await page.evaluate(([s, o]) => window.runPyodide(s, o), [source, { repeat, fresh: true, clearCache: !args.includes('--no-clear-cache') }]);
  results.push({ file: path.basename(f), ...r });
  console.error(path.basename(f), 'exit', r.runs[0].code, 'setup', JSON.stringify(r.setup), 'runs', r.runs.map(x => x.ms.toFixed(0)).join(','));
}
const ua = await page.evaluate(() => navigator.userAgent);
fs.writeFileSync(out, JSON.stringify({ userAgent: ua, runtime: 'pyodide-0.25.1', results }, null, 1));
await browser.close();
server.kill();
