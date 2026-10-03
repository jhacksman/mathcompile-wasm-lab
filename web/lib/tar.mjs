// Minimal ustar/pax reader producing a YoWASP-style tree: {name: Uint8Array | {...}}
const dec = new TextDecoder();

function str(buf, off, len) {
  let end = off;
  while (end < off + len && buf[end] !== 0) end++;
  return dec.decode(buf.subarray(off, end));
}

function parsePax(data) {
  const out = {};
  let i = 0;
  while (i < data.length) {
    let sp = i;
    while (data[sp] !== 0x20) sp++;
    const len = parseInt(dec.decode(data.subarray(i, sp)), 10);
    const rec = dec.decode(data.subarray(sp + 1, i + len - 1));
    const eq = rec.indexOf('=');
    out[rec.slice(0, eq)] = rec.slice(eq + 1);
    i += len;
  }
  return out;
}

export function untar(buffer, root = {}) {
  const buf = new Uint8Array(buffer);
  let off = 0;
  let pax = null;
  while (off + 512 <= buf.length) {
    if (buf[off] === 0) break;
    let name = str(buf, off, 100);
    const size = parseInt(str(buf, off + 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(buf[off + 156] || 48);
    const prefix = str(buf, off + 345, 155);
    if (prefix) name = prefix + '/' + name;
    const data = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') { pax = parsePax(data); continue; }
    if (type === 'g') continue;
    if (pax?.path) name = pax.path;
    pax = null;
    const parts = name.split('/').filter(p => p && p !== '.');
    if (!parts.length) continue;
    let node = root;
    for (const p of parts.slice(0, -1)) node = (node[p] ??= {});
    if (type === '5') node[parts.at(-1)] ??= {};
    else if (type === '0' || type === '\0') node[parts.at(-1)] = data.slice();
  }
  return root;
}
