# fresh source for the self-compiled Nuitka (Milestone E)
def tri(n):
    return sum(k * k for k in range(n))
try:
    1 // 0
except ZeroDivisionError as e:
    print("caught", e)
print("tri(3141) =", tri(3141), "2**200 % 99991 =", 2**200 % 99991)
