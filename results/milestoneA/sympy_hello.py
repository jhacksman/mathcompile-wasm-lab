from sympy import symbols, expand, factor, diff, sin, solve, Rational
x, y = symbols("x y")
print(expand((x + y) ** 3))
print(factor(x**3 - y**3))
print(diff(sin(x) * x**2, x))
print(solve(x**2 - 2, x))
print(Rational(1, 3) + Rational(1, 6))
