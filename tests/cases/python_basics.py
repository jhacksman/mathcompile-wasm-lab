import math, itertools, collections, json, fractions, functools

def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

def primes(limit):
    sieve = bytearray([1]) * (limit + 1)
    sieve[0:2] = b"\0\0"
    for i in range(2, int(limit ** 0.5) + 1):
        if sieve[i]:
            sieve[i * i::i] = bytes(len(range(i * i, limit + 1, i)))
    return [i for i, v in enumerate(sieve) if v]

def make_counter():
    n = 0
    def inc(step=1):
        nonlocal n
        n += step
        return n
    return inc

class Vec:
    __slots__ = ("x", "y")
    def __init__(self, x, y):
        self.x, self.y = x, y
    def __add__(self, o):
        return Vec(self.x + o.x, self.y + o.y)
    def __repr__(self):
        return f"Vec({self.x}, {self.y})"

class AppError(Exception):
    pass

def risky(v):
    if v < 0:
        raise AppError(f"negative: {v}")
    return math.isqrt(v)

@functools.lru_cache(maxsize=None)
def partitions(n, k=None):
    if k is None:
        k = n
    if n == 0:
        return 1
    return sum(partitions(n - i, i) for i in range(1, min(n, k) + 1))

print("fib100:", fib(100))
print("primes<50:", primes(50))
print("prime_count_1e5:", len(primes(100000)))
c = make_counter(); c(); c(5)
print("counter:", c(10))
print("vec:", Vec(1, 2) + Vec(3, 4))
print("gen:", sum(x * x for x in range(1000) if x % 3 == 0))
print("comb:", list(itertools.combinations("abcd", 2))[:3])
print("counter_mc:", collections.Counter("mississippi").most_common(2))
print("json:", json.dumps({"b": [1, 2.5, None], "a": True}, sort_keys=True))
print("fraction:", fractions.Fraction(1, 3) + fractions.Fraction(1, 6))
print("partitions100:", partitions(100))
print("factorial50:", math.factorial(50))
print("bigpow:", 2 ** 521 - 1)
print("bigdivmod:", divmod(10 ** 40 + 7, 12345678901234567))
print("modpow:", pow(7, 10 ** 18, 10 ** 9 + 7))
print("negfloor:", -7 // 2, -7 % 2, round(2.5), round(3.5))
for v in (16, -3):
    try:
        print("risky:", risky(v))
    except AppError as e:
        print("caught:", type(e).__name__, e)
    finally:
        print("finally:", v)
try:
    try:
        1 / 0
    except ZeroDivisionError as e:
        raise ValueError("wrapped") from e
except ValueError as e:
    print("chained:", repr(e), type(e.__cause__).__name__)
try:
    int("12x")
except ValueError as e:
    print("int_error:", e)
