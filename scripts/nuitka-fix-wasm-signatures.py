# Make Nuitka's tp_getset / tp_methods callbacks match the C signatures CPython calls them with.
# On wasm32, call_indirect traps on any signature mismatch ("null function or function signature mismatch").
import re, glob
files = glob.glob('static_src/*.c')
src = {f: open(f).read() for f in files}
need = {}
for t in src.values():
    for tab in re.finditer(r'PyGetSetDef\s+\w+\[\]\s*=\s*\{(.*?)\n\};', t, re.S):
        for e in re.finditer(r'\{\s*\(char \*\)"[^"]+"\s*,\s*(?:\(getter\))?\s*(\w+)\s*,\s*(?:\(setter\))?\s*(\w+)', tab.group(1)):
            need[e.group(1)] = ('getter', 2)
            if e.group(2) != 'NULL':
                need[e.group(2)] = ('setter', 3)
    for tab in re.finditer(r'PyMethodDef\s+\w+\[\]\s*=\s*\{(.*?)\n\};', t, re.S):
        for e in re.finditer(r'\{\s*"[^"]+"\s*,\s*\(PyCFunction\)\s*(?:\(void \(\*\)\(void\)\))?\s*(\w+)\s*,\s*([\w| ]+)', tab.group(1)):
            fl = e.group(2)
            need[e.group(1)] = ('method', 3 if 'KEYWORDS' in fl else 2)
changed = []
for f, t in src.items():
    def fix(m):
        name, params = m.group(1), m.group(2)
        if name not in need:
            return m.group(0)
        kind, n = need[name]
        plist = [p for p in params.split(',') if p.strip() and p.strip() != 'void']
        if len(plist) >= n:
            return m.group(0)
        extra = {'getter': ['void *closure'], 'setter': ['void *closure'], 'method': ['PyObject *unused_arg', 'PyObject *unused_kw']}[kind]
        plist = plist + extra[: n - len(plist)]
        changed.append(name)
        return m.group(0).replace('(' + params + ')', '(' + ','.join(p if i == 0 else ' ' + p.strip() for i, p in enumerate(plist)) + ')', 1)
    nt = re.sub(r'^static\s+[\w\s\*]+?\b(Nuitka_\w+)\s*\(([^)]*)\)\s*\{', fix, t, flags=re.M)
    if nt != t:
        open(f, 'w').write(nt)
print(len(changed), 'signatures fixed')
