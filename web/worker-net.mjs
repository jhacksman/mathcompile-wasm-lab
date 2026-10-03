// Network policy for workers: every fetch is answered from an in-memory asset map handed over by
// the page; anything else is refused and recorded. Must be imported before any asset consumer.
const assets = new Map();
export const netLog = [];
const realFetch = globalThis.fetch;

export function installAssets(map) {
  for (const [url, buf] of Object.entries(map)) assets.set(new URL(url, self.location.href).href, buf);
}

globalThis.fetch = async function (input, init) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, self.location.href).href;
  const buf = assets.get(url);
  if (buf) {
    netLog.push({ url, served: 'memory', bytes: buf.byteLength });
    const type = url.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';
    return new Response(buf.slice(0), { headers: { 'content-type': type, 'content-length': String(buf.byteLength) } });
  }
  netLog.push({ url, served: 'refused' });
  throw new TypeError('network disabled in worker: ' + url);
};
globalThis.XMLHttpRequest = undefined;
globalThis.WebSocket = undefined;
globalThis.EventSource = undefined;
void realFetch;
