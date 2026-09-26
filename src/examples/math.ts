import type { Example } from "./types";

export const MATH: Example[] = [
  {
    id: "times-table",
    title: "九九乘法表",
    emoji: "✖️",
    summary: "嵌套循环",
    categories: ["数学", "入门"],
    keywords: ["乘法", "嵌套循环", "end", "对齐"],
    difficulty: 2,
    learn: ["循环里套循环", '`print(..., end=" ")` 不换行', "f-string 对齐 `{x:<3}`"],
    explanation: [
      "外层 `i` 决定第几行，里层 `j` 从 1 走到 `i`，所以第 i 行有 i 个算式。",
      '`print` 默认在最后换行；`end=" "` 让它改成打印一个空格，这一行的算式就排在一起了。',
    ],
    code: `for i in range(1, 10):
    for j in range(1, i + 1):
        print(f"{j}×{i}={i * j:<3}", end=" ")
    print()
`,
  },
  {
    id: "primes",
    title: "找质数",
    emoji: "🔢",
    summary: "函数返回真假",
    categories: ["数学", "函数"],
    keywords: ["质数", "素数", "取余", "return", "列表"],
    difficulty: 2,
    learn: ["`%` 判断能否整除", "函数 `return True / False`", "把结果放进列表"],
    explanation: [
      "质数只能被 1 和它自己整除。`is_prime(n)` 从 2 试到 `n - 1`，只要有一个能整除，就不是质数。",
      "小优化：只需要试到 `n` 的平方根，所以条件写成 `d * d <= n`。",
    ],
    code: `def is_prime(n):
    if n < 2:
        return False
    d = 2
    while d * d <= n:
        if n % d == 0:
            return False
        d = d + 1
    return True

primes = []
for n in range(1, 60):
    if is_prime(n):
        primes.append(n)

print("60 以内的质数：", primes)
print("一共", len(primes), "个")
`,
  },
  {
    id: "fibonacci",
    title: "斐波那契兔子",
    emoji: "🐇",
    summary: "同时赋值",
    categories: ["数学"],
    keywords: ["数列", "a, b = b, a + b", "黄金比例"],
    difficulty: 2,
    learn: ["`a, b = b, a + b` 同时更新两个变量", "数列的规律", "相邻两项的比值"],
    explanation: [
      "每个数都是前两个数之和：1, 1, 2, 3, 5, 8……",
      "`a, b = b, a + b` 会先算出右边的两个值，再一起交给 a 和 b，所以不需要临时变量。后一项除以前一项会越来越接近黄金比例 1.618…",
    ],
    code: `a, b = 1, 1
for month in range(1, 16):
    print("第", month, "个月：", a, "对兔子")
    a, b = b, a + b

print("比值：", b / a)
`,
  },
  {
    id: "circle-area",
    title: "圆的面积",
    emoji: "⭕",
    summary: "math.pi",
    categories: ["数学"],
    keywords: ["math", "pi", "round", "f-string", "保留小数"],
    difficulty: 1,
    learn: ["`import math` 和 `math.pi`", "`r ** 2` 求平方", "`{x:.2f}` 保留两位小数"],
    explanation: ['面积 = π × r²。`math.pi` 是 3.14159…，`f"{area:.2f}"` 只显示两位小数。'],
    code: `import math

for r in [1, 2, 5, 10]:
    area = math.pi * r ** 2
    length = 2 * math.pi * r
    print(f"半径 {r}：面积 {area:.2f}，周长 {length:.2f}")
`,
  },
  {
    id: "gcd",
    title: "最大公约数",
    emoji: "🤝",
    summary: "辗转相除法",
    categories: ["数学", "函数"],
    keywords: ["while", "取余", "欧几里得", "约分"],
    difficulty: 3,
    learn: ["辗转相除法", "`while b != 0` 循环", "用最大公约数约分"],
    explanation: [
      "两千多年前欧几里得就发现：`a` 和 `b` 的最大公约数，等于 `b` 和 `a % b` 的最大公约数。一直换下去，直到余数为 0。",
      "有了最大公约数，就能把分数约到最简。",
    ],
    code: `def gcd(a, b):
    while b != 0:
        a, b = b, a % b
    return a

print(gcd(48, 36))
print(gcd(17, 5))

top, bottom = 24, 36
g = gcd(top, bottom)
print(f"{top}/{bottom} = {top // g}/{bottom // g}")
`,
  },
];
