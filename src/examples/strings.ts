import type { Example } from "./types";

export const STRINGS: Example[] = [
  {
    id: "palindrome",
    title: "回文检查",
    emoji: "🔁",
    summary: "字符串切片",
    categories: ["字符串"],
    keywords: ["切片", "[::-1]", "反转", "lower"],
    difficulty: 1,
    learn: ["`s[::-1]` 把字符串倒过来", "`lower()` 变成小写", "`==` 比较字符串"],
    explanation: [
      "回文就是正着读、倒着读都一样的词，比如“上海自来水来自海上”。`[::-1]` 表示每次往回走一步，也就是反转。",
    ],
    code: `words = ["level", "Python", "上海自来水来自海上", "Racecar", "海龟"]

for w in words:
    if w.lower() == w.lower()[::-1]:
        print(w, "是回文 ✔")
    else:
        print(w, "不是回文")
`,
  },
  {
    id: "letter-count",
    title: "数一数字母",
    emoji: "🔤",
    summary: "字典计数",
    categories: ["字符串", "列表"],
    keywords: ["字典", "dict", "get", "sorted", "isalpha"],
    difficulty: 2,
    learn: ["用字典计数 `counts.get(ch, 0) + 1`", "`isalpha()` 只数字母", "`sorted(..., key=...)` 排序"],
    explanation: [
      "字典把“字母”对应到“出现次数”。`counts.get(ch, 0)` 在字母第一次出现时返回 0。",
      "`sorted(counts.items(), key=lambda kv: kv[1], reverse=True)` 按次数从多到少排列。",
    ],
    code: `text = "Hello Python, hello turtle!"
counts = {}

for ch in text.lower():
    if ch.isalpha():
        counts[ch] = counts.get(ch, 0) + 1

for letter, n in sorted(counts.items(), key=lambda kv: kv[1], reverse=True):
    print(letter, "*" * n, n)
`,
  },
  {
    id: "caesar",
    title: "凯撒密码",
    emoji: "🔐",
    summary: "ord 和 chr",
    categories: ["字符串", "挑战", "函数"],
    keywords: ["加密", "解密", "ord", "chr", "取余"],
    difficulty: 3,
    learn: ["`ord()` 字母变数字，`chr()` 数字变字母", "`% 26` 让字母绕回开头", "加密和解密是反方向"],
    explanation: [
      "凯撒密码把每个字母往后移几位：a→d，b→e……到了 z 再绕回 a，所以要用 `% 26`。",
      "解密就是往回移，也就是 `shift` 取负数。",
    ],
    code: `def caesar(text, shift):
    result = ""
    for ch in text:
        if "a" <= ch <= "z":
            result = result + chr((ord(ch) - ord("a") + shift) % 26 + ord("a"))
        else:
            result = result + ch
    return result

secret = caesar("hello turtle", 3)
print("加密：", secret)
print("解密：", caesar(secret, -3))
`,
  },
  {
    id: "string-magic",
    title: "字符串魔法",
    emoji: "🪄",
    summary: "常用方法",
    categories: ["字符串", "入门"],
    keywords: ["upper", "replace", "split", "join", "len"],
    difficulty: 1,
    learn: ["`upper()` `lower()` `title()`", "`replace()` 替换", "`split()` 拆开、`join()` 合起来"],
    explanation: ["字符串自带很多“魔法方法”，用点号调用。它们都会返回一个**新**字符串，原来的不变。"],
    code: `s = "i like python and turtle"

print(s.upper())
print(s.title())
print(s.replace("python", "Python 🐍"))
print(len(s), "个字符")

words = s.split()
print(words)
print("-".join(words))
print(" ".join(reversed(words)))
`,
  },
];
