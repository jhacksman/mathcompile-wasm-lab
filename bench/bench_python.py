# Pure-Python workload: user code is what Nuitka compiles to C.
import time, json
T0 = time.perf_counter()
def collatz_total(limit):
    total = 0
    for n in range(1, limit):
        steps = 0
        while n != 1:
            n = (3 * n + 1) if n & 1 else n >> 1
            steps += 1
        total += steps
    return total
def nested(n):
    acc = 0
    for i in range(n):
        for j in range(i % 97):
            acc = (acc + i * j) % 1000003
    return acc
def bigint(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a % (10 ** 9 + 7)
def work():
    return collatz_total(30000), nested(20000), bigint(20000)
t_import = (time.perf_counter() - T0) * 1000
times, result = [], None
for i in range(5):
    t = time.perf_counter()
    result = work()
    times.append((time.perf_counter() - t) * 1000)
print(json.dumps({"bench": "python", "result": result, "import_ms": t_import, "work_ms": times}))
