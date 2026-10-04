# Known divergence (see tests/trusted.json _known_divergences): unbounded recursion.
def depth(n):
    return 0 if n == 0 else 1 + depth(n - 1)
print("bounded depth 900:", depth(900))
try:
    (lambda f: f(f))(lambda f: f(f))
except RecursionError as e:
    print("recursion: error: RecursionError", e)
print("after recursion")
