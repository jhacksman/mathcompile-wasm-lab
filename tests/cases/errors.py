from sympy import symbols, Matrix, sympify, solve, oo, zoo, S, Rational, sqrt
from sympy.core.sympify import SympifyError
x = symbols("x")
def report(label, fn):
    try:
        print(label, "ok:", fn())
    except Exception as e:
        print(label, "error:", type(e).__name__, str(e).splitlines()[0] if str(e) else "")
report("div_zero_sympy:", lambda: S(1) / 0)
report("div_zero_int:", lambda: 1 // 0)
report("oo_minus_oo:", lambda: oo - oo)
report("singular_inv:", lambda: Matrix([[1, 2], [2, 4]]).inv())
report("shape_mismatch:", lambda: Matrix([[1, 2]]) * Matrix([[1, 2]]))
report("sympify_bad:", lambda: sympify("x +* 2"))
report("rational_zero_den:", lambda: Rational(1, 0))
report("index_error:", lambda: [1, 2, 3][10])
report("type_error:", lambda: Matrix([1]) + "a")
report("attr_error:", lambda: x.not_an_attribute)
print("after_errors:", sqrt(8))
raise ValueError("uncaught at end: " + str(solve(x**2 - 4, x)))
