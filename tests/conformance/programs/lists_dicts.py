nums = [5, 3, 8, 1]
nums.append(7); nums.insert(0, 9); nums.extend([2, 2])
print(nums, len(nums), nums.count(2), nums.index(8))
print(nums.pop(), nums.pop(0), nums)
nums.remove(2); nums.sort(); print(nums)
nums.sort(reverse=True); print(nums)
nums.reverse(); print(nums, sorted(nums, reverse=True), sorted(["b", "A", "c"]))
print(sorted(["apple", "kiwi", "banana"], key=len), max(["aa", "b"], key=len), min(3, 1, 2))
print(nums[1:3], nums[::-1], nums[-2:], sum(nums), sum([0.5, 0.25]), sum([[1], [2]], []))
matrix = [[1, 2], [3, 4]]
matrix[1][0] = 30
print(matrix, [row[1] for row in matrix], [x * x for x in range(6) if x % 2 == 0])
print([(i, j) for i in range(3) for j in range(i)], list(range(10, 0, -3)), list(range(0)))
d = {"a": 1, "b": 2}
d["c"] = 3; d["a"] = 10
print(d, len(d), d["b"], d.get("z"), d.get("z", 0), "a" in d, 3 in d)
print(list(d.keys()), list(d.values()), list(d.items()), d.keys(), d.values(), d.items())
for k, v in d.items():
    print(k, v)
print(d.pop("b"), d, d.setdefault("x", 5), d)
del d["x"]
print(d, dict([("p", 1)]), dict(q=2), {1: "one", 1.0: "float-one", True: "true"})
t = (1, 2, 3)
a, b, c = t
print(a + b + c, t[1:], t + (4,), t * 2, (1,), (), len(t), t.index(2), t.count(1))
x, y = 1, 2
x, y = y, x
print(x, y, [1, 2] == [1, 2], (1, 2) < (1, 3), [1, [2, 3]] == [1, [2, 3]])
e = []
print(bool(e), bool([0]), bool({}), bool(""), bool(0.0), bool(None), not [])
nested = {"list": [1, 2, {"k": (3, 4)}]}
print(nested, str(nested))
