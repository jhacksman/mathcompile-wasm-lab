# unseen source generated after page load, nonce 261412584
from sympy import symbols, factor, solve, Matrix, integrate, diff, sin, Rational, simplify
x = symbols("x")
def seq(n):
    a, b = 9, 1
    for _ in range(n):
        a, b = b, (a ^ b) + 3
    return a
try:
    {}["k261412584"]
except KeyError as e:
    print("caught", repr(e))
print("nonce", 261412584, "seq =", seq(29), "pow =", pow(9, 261412584, 1000000007))
print(factor(x**3 - (7 + -26)*x**2 + (7)*(-26)*x))
print(solve(x**2 + (-26)*x + 7, x))
M = Matrix([[8, 0, -7], [7, 0, 0], [6, 0, 6]])
print(M.det(), M.rank(), M.T * M == (M.T * M).T)
print(integrate(x**9 * Rational(5, 9), (x, 0, 7)))
print(simplify(diff(sin(x)**2 * x**9, x, 2)))
