def f(n):
    return 0 if n == 0 else 1 + f(n - 1)
try:
    f(100000)
except RecursionError as e:
    print("plain RecursionError", e)
try:
    (lambda q: q(q))(lambda q: q(q))
except RecursionError as e:
    print("selfapply RecursionError", e)
