s = "Hello, World"
print(s.upper(), s.lower(), s.title(), s.swapcase(), len(s))
print(s[0], s[-1], s[0:5], s[7:], s[:5], s[::2], s[::-1], s[-5:-1], s[100:])
print(s.split(", "), "a b  c".split(), "a,b,,c".split(","), "x".split("x"), "  pad  ".strip(), "xxhixx".strip("x"))
print("-".join(["a", "b", "c"]), s.replace("l", "L"), s.replace("l", "L", 1), s.find("o"), s.rfind("o"), s.find("z"))
print(s.count("l"), s.startswith("He"), s.endswith("ld"), "123".isdigit(), "abc".isalpha(), " ".isspace())
print("abc".center(9, "*"), "abc".ljust(6, "."), "abc".rjust(6), "42".zfill(5), "-42".zfill(5))
print("中文" + "字符", len("中文"), "中" in "中文", "ab" * 3, 3 * "c")
print(repr("it's"), repr('say "hi"'), repr("both ' \""), repr("tab\there\nnewline"), repr("\\"))
print("a" < "b", "apple" < "apricot", "Z" < "a", "abc" == "abc")
for ch in "hey":
    print(ch, end="-")
print()
print("multi", "args", sep="|", end="!\n")
print("line1\nline2")
t = """triple
quoted"""
print(t)
print(str(12) + "3", int("12") + 3, str(1.50), str([1, "a"]))
