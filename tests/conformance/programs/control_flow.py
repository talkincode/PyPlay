for i in range(5):
    if i == 1:
        continue
    if i == 4:
        break
    print("i =", i)
else:
    print("never")
for i in range(2):
    pass
else:
    print("for-else runs")
n = 0
while n < 3:
    n += 1
else:
    print("while-else", n)
x = 7
if x > 10:
    print("big")
elif x > 5:
    print("medium")
else:
    print("small")
print("yes" if x % 2 else "no")
print(1 and 2, 0 and 2, 1 or 2, 0 or "", None or "default", not 0)
count = 0
for a in range(3):
    for b in range(3):
        if a == b:
            continue
        count += 1
print(count)
total = 0
i = 10
while True:
    i -= 3
    if i < 0:
        break
    total += i
print(total)
