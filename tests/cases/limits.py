# Resource-limit probe: memory cap -> MemoryError recovery, output flood -> truncation, endless loop -> timeout kill.
chunks = []
try:
    while True:
        chunks.append(bytearray(16 << 20))
except MemoryError:
    n = len(chunks)
    chunks.clear()
    print("memory: MemoryError caught after", n * 16, "MiB; recovered:", sum(range(10**6)))
for i in range(200000):
    print("flood line", i, "x" * 40)
print("flood done")
while True:
    pass
