# SymPy workload: user code compiled, SymPy/mpmath interpreted by the embedded CPython in both runtimes.
import time, json
T0 = time.perf_counter()
import sympy
from sympy import symbols, factor, expand, simplify, solve, diff, integrate, Matrix, sin, cos, exp, Rational
from sympy.core.cache import clear_cache
t_import = (time.perf_counter() - T0) * 1000
x, y, z = symbols("x y z")
def work():
    out = []
    out.append(factor(expand((x + y + z) ** 6 - (x - y) ** 4)))
    out.append(simplify((sin(x) ** 4 - cos(x) ** 4) / (sin(x) ** 2 - cos(x) ** 2)))
    out.append(solve(x ** 4 - 10 * x ** 2 + 9, x))
    out.append(diff(exp(x * y) * sin(x ** 2), x, 3))
    out.append(integrate(x ** 3 * exp(-x) * cos(x), x))
    out.append(Matrix(4, 4, lambda i, j: Rational(1, i + j + 1)).inv()[0, 0])
    return [str(o) for o in out]
times, result = [], None
for i in range(5):
    clear_cache()
    t = time.perf_counter()
    result = work()
    times.append((time.perf_counter() - t) * 1000)
print(json.dumps({"bench": "sympy", "result_sha": __import__("hashlib").sha256("|".join(result).encode()).hexdigest(), "import_ms": t_import, "work_ms": times}))
