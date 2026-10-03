# unseen source generated after page load, nonce 328284166
from sympy import symbols, factor, solve, Matrix, integrate, diff, sin, Rational, simplify
x = symbols("x")
def seq(n):
    a, b = 3, 1
    for _ in range(n):
        a, b = b, a + b
    return a
try:
    {}["k328284166"]
except KeyError as e:
    print("caught", repr(e))
print("nonce", 328284166, "seq =", seq(102), "pow =", pow(3, 328284166, 1000000007))
print(factor(x**3 - (7 + -35)*x**2 + (7)*(-35)*x))
print(solve(x**2 + (-35)*x + 7, x))
M = Matrix([[5, -5, -3], [7, -6, -5], [5, -3, -4]])
print(M.det(), M.rank(), M.T * M == (M.T * M).T)
print(integrate(x**3 * Rational(2, 3), (x, 0, 7)))
print(simplify(diff(sin(x)**2 * x**3, x, 2)))
