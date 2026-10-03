// Conversion between plain trees ({name: Uint8Array|string|{...}}) and browser_wasi_shim inodes.
import { File, Directory } from '../vendor/browser_wasi_shim/index.js';

const enc = new TextEncoder();

export function toShim(tree) {
  const m = new Map();
  for (const [name, v] of Object.entries(tree)) {
    if (v instanceof Uint8Array) m.set(name, new File(v));
    else if (typeof v === 'string') m.set(name, new File(enc.encode(v)));
    else m.set(name, new Directory(toShim(v)));
  }
  return m;
}

export function fromShim(dir) {
  const t = {};
  for (const [name, ino] of dir.contents) {
    if (ino instanceof Directory) t[name] = fromShim(ino);
    else if (ino instanceof File) t[name] = ino.data;
  }
  return t;
}

export function shimGet(dir, path) {
  let node = dir;
  for (const p of path.split('/').filter(Boolean)) {
    if (!(node instanceof Directory)) return undefined;
    node = node.contents.get(p);
  }
  return node;
}

export function shimPut(dir, path, data) {
  const parts = path.split('/').filter(Boolean);
  let node = dir;
  for (const p of parts.slice(0, -1)) {
    let next = node.contents.get(p);
    if (!next) { next = new Directory(new Map()); node.contents.set(p, next); }
    node = next;
  }
  node.contents.set(parts.at(-1), new File(typeof data === 'string' ? enc.encode(data) : data));
}

export function shimRemove(dir, path) {
  const parts = path.split('/').filter(Boolean);
  const parent = shimGet(dir, parts.slice(0, -1).join('/'));
  parent?.contents.delete(parts.at(-1));
}

// deep copy of the directory structure; file data buffers are shared until replaced
export function cloneShim(dir) {
  const m = new Map();
  for (const [name, ino] of dir.contents) {
    m.set(name, ino instanceof Directory ? cloneShim(ino) : new File(ino.data));
  }
  return new Directory(m);
}
