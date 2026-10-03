"""Write a never-before-seen program (random constants + random logic choice) for the offline proof.
usage: python3 tests/gen-unseen.py OUT.py   (prints the nonce; the answer is not computed here)"""
import secrets, sys

nonce = secrets.randbelow(10**9)
r = secrets.SystemRandom()
a, b, c = r.randint(2, 40), r.randint(-40, -2), r.randint(3, 9)
m = [[r.randint(-9, 9) for _ in range(3)] for _ in range(3)]
op = r.choice(["a + b", "(a * b - 1) % 1000003", "(a ^ b) + 3"])
src = f'''# unseen source generated after page load, nonce {nonce}
from sympy import symbols, factor, solve, Matrix, integrate, diff, sin, Rational, simplify
x = symbols("x")
def seq(n):
    a, b = {c}, 1
    for _ in range(n):
        a, b = b, {op}
    return a
try:
    {{}}["k{nonce}"]
except KeyError as e:
    print("caught", repr(e))
print("nonce", {nonce}, "seq =", seq({nonce % 97 + 20}), "pow =", pow({c}, {nonce}, 1000000007))
print(factor(x**3 - ({a} + {b})*x**2 + ({a})*({b})*x))
print(solve(x**2 + ({b})*x + {a}, x))
M = Matrix({m})
print(M.det(), M.rank(), M.T * M == (M.T * M).T)
print(integrate(x**{c} * Rational({nonce % 11 + 1}, {c}), (x, 0, {a})))
print(simplify(diff(sin(x)**2 * x**{c}, x, 2)))
'''
open(sys.argv[1], "w").write(src)
print(nonce)
