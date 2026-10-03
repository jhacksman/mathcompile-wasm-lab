// Static server for web/. Sends COOP/COEP (cross-origin isolation for precise timers and
// measureUserAgentSpecificMemory) and a CSP that only allows same-origin connections.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../web');
const port = +(process.env.PORT || 8642);
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.tar': 'application/x-tar', '.css': 'text/css' };
const logFile = process.env.REQUEST_LOG;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (logFile) fs.appendFileSync(logFile, JSON.stringify({ t: Date.now(), method: req.method, path: url.pathname }) + '\n');
  let p = path.join(root, decodeURIComponent(url.pathname));
  if (!p.startsWith(root)) { res.writeHead(403).end(); return; }
  if (p.endsWith('/')) p += 'index.html';
  fs.stat(p, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('not found'); return; }
    if (req.method === 'POST' || req.method === 'PUT') { res.writeHead(405).end(); return; }
    res.writeHead(200, {
      'content-type': types[path.extname(p)] || 'application/octet-stream',
      'content-length': st.size,
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
      // Pyodide's loader needs eval; the lab compiler/run workers do not get it
      'content-security-policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'" + (url.pathname.startsWith('/pyodide') ? " 'unsafe-eval'" : '') + "; connect-src 'self'; worker-src 'self' blob:; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'",
      'cache-control': url.pathname.startsWith('/assets/') || url.pathname.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-cache',
    });
    fs.createReadStream(p).pipe(res);
  });
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
