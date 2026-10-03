import sys
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
print("hello from py2wasm", sys.version.split()[0], sys.platform)
print("fib(200) =", fib(200))
