// Service worker: precaches the small app shell so pages/workers can be (re)created offline.
// Large assets are not cached here; the page keeps them in memory and hands them to workers.
const CACHE = 'lab-shell-v2';
const SHELL = [
  './', 'index.html', 'app.mjs', 'compiler-worker.mjs', 'run-worker.mjs', 'worker-net.mjs',
  'lib/tar.mjs', 'lib/vfs.mjs', 'lib/wasi-run.mjs', 'lib/frontend.mjs', 'lib/clang-bridge.mjs', 'lib/plan-exec.mjs',
  'vendor/yowasp-clang/bundle.js',
  'vendor/browser_wasi_shim/index.js', 'vendor/browser_wasi_shim/wasi.js', 'vendor/browser_wasi_shim/wasi_defs.js',
  'vendor/browser_wasi_shim/fd.js', 'vendor/browser_wasi_shim/fs_mem.js', 'vendor/browser_wasi_shim/fs_opfs.js',
  'vendor/browser_wasi_shim/strace.js', 'vendor/browser_wasi_shim/debug.js',
];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || url.pathname.includes('/assets/') || /\.(wasm|tar)$/.test(url.pathname)) return;
  // network first while online so edits show up, cache when offline
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
