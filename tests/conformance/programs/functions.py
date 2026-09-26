def greet(name, greeting="Hello"):
    return greeting + ", " + name + "!"

print(greet("Ann"), greet("Bob", "Hi"), greet(greeting="Yo", name="Cy"))

def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)

print(fact(10), fact(30))

def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

print([fib(i) for i in range(12)])
counter = 0
def bump():
    global counter
    counter += 1
bump(); bump()
print(counter)

def outer():
    x = 5
    def inner():
        return x * 2
    return inner()

print(outer())
square = lambda v: v * v
print(square(7), list(map(square, [1, 2, 3])), list(filter(lambda v: v > 1, [0, 1, 2, 3])))
def nothing():
    pass
print(nothing())
def multi():
    return 1, "two"
print(multi())
r, s = multi()
print(r, s)
print(sum(x * x for x in range(5)), any(v > 2 for v in [1, 2, 3]), all([]), any([]))
for i, ch in enumerate("abc", start=1):
    print(i, ch)
for p, q in zip([1, 2, 3], "xy"):
    print(p, q)
print(list(reversed([1, 2, 3])), list(zip()), list(enumerate(["a"])))
