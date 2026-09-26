import type { Example } from "./types";

export const MATH: Example[] = [
  {
    id: "math-tools",
    title: "math 里的函数",
    emoji: "📐",
    summary: "import math",
    categories: ["数学", "入门"],
    keywords: ["math.sqrt", "floor", "ceil", "fabs", "gcd", "degrees", "API"],
    difficulty: 1,
    learn: [
      "`import math` 之后用 `math.函数名(...)` 调用",
      "`sqrt` 开平方，`floor` / `ceil` 取整",
      "`fabs` 取绝对值，`gcd` 求最大公约数",
    ],
    explanation: [
      "库函数不在每个程序里自动出现。先 `import math`，再在名字前面加上 `math.`，括号里放这个函数要的数。",
      "`floor` 往小的整数靠，`ceil` 往大的整数靠。`degrees` 把弧度换成角度：半圈 π 弧度是 180 度。",
    ],
    code: `import math

print("圆周率", round(math.pi, 5))
print("平方根", math.sqrt(9), round(math.sqrt(2), 4))
print("3.2 向下取整", math.floor(3.2), "向上取整", math.ceil(3.2))
print("绝对值", math.fabs(-8))
print("最大公约数", math.gcd(18, 12))
print("半圈是", round(math.degrees(math.pi)), "度")
`,
  },
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
  {
    id: "make-change",
    title: "买东西找零",
    emoji: "💴",
    summary: "整除和余数",
    categories: ["数学"],
    keywords: ["//", "%", "整除", "找零"],
    difficulty: 1,
    learn: ["`//` 得到能找几张纸币", "`%` 得到找完剩下的钱", "先找大面额，再找小面额"],
    explanation: [
      "找回 63 元。`63 // 10` 是 6，表示能找 6 张 10 元；`63 % 10` 是 3，这 3 元一张 5 元也找不了，就变成 3 枚 1 元。",
    ],
    code: `price = 37
paid = 100
change = paid - price
print("价格", price, "元，付了", paid, "元，找回", change, "元")

tens = change // 10
left = change % 10
fives = left // 5
ones = left % 5
print(tens, "张 10 元")
print(fives, "张 5 元")
print(ones, "枚 1 元")
`,
  },
  {
    id: "gauss-sum",
    title: "高斯求和",
    emoji: "🧮",
    summary: "求和公式",
    categories: ["数学"],
    keywords: ["range", "累加", "公式", "//"],
    difficulty: 1,
    learn: ["用循环把 1 加到 100", "`n * (n + 1) // 2` 是同一个答案", "`//` 整除，结果还是整数"],
    explanation: [
      "高斯小时候发现：1 加到 100，可以配成 50 对，每一对都是 101。所以不用一位一位加，直接用公式。",
      "程序里两种算法都算一遍。两个答案一样，公式就写对了。",
    ],
    code: `n = 100
total = 0
for i in range(1, n + 1):
    total = total + i

print("从 1 加到", n, "：", total)
print("公式 n×(n+1)÷2 =", n * (n + 1) // 2)
`,
  },
  {
    id: "factorial-pick",
    title: "阶乘和选人",
    emoji: "🎫",
    summary: "math.factorial",
    categories: ["数学"],
    keywords: ["math.factorial", "math.comb", "阶乘", "组合"],
    difficulty: 2,
    learn: [
      "`math.factorial(n)` 是 1×2×…×n",
      "`math.comb(n, k)` 是从 n 个里选 k 个的种数",
      "5 个人两两握手是 C(5, 2)",
    ],
    explanation: [
      "`4!` 就是 1×2×3×4 = 24。人数一多，自己乘很容易漏，交给 `math.factorial`。",
      "`math.comb(5, 2)` 问的是：5 个人里挑 2 个出来握手，一共几种挑法。顺序无所谓，所以是 10，不是 20。",
    ],
    code: `import math

print("1 到 6 的阶乘：")
for n in range(1, 7):
    print(n, "!", "=", math.factorial(n))

print("5 个人两两握手，次数是", math.comb(5, 2))
`,
  },
  {
    id: "sine-cosine",
    title: "正弦和余弦",
    emoji: "🌊",
    summary: "sin 和 cos",
    categories: ["数学"],
    keywords: ["math.sin", "math.cos", "math.radians", "角度", "API"],
    difficulty: 2,
    learn: [
      "`math.radians()` 把角度换成弧度",
      "`math.sin()` 和 `math.cos()`",
      "`round(..., 4)` 只看四位小数",
    ],
    explanation: [
      "`sin` 和 `cos` 吃的是弧度，不是我们平时说的“度”。90 度要先用 `math.radians(90)` 换过去。",
      "算出来的小数很长。`round(x, 4)` 四舍五入到四位，打印出来就好比较：sin(90°) 是 1，cos(90°) 是 0。",
    ],
    code: `import math

print("角度  正弦  余弦")
for deg in [0, 30, 45, 60, 90]:
    rad = math.radians(deg)
    print(f"{deg:>3}°  {round(math.sin(rad), 4):<8} {round(math.cos(rad), 4)}")
`,
  },
  {
    id: "right-triangle",
    title: "勾股定理",
    emoji: "📐",
    summary: "math.hypot",
    categories: ["数学", "Turtle"],
    keywords: ["math.hypot", "平方", "直角三角形", "sqrt"],
    difficulty: 2,
    learn: ["直角边的平方和等于斜边的平方", "`math.hypot(a, b)` 算斜边", "3、4、5 是一组直角三角形"],
    explanation: [
      "两条直角边是 3 和 4 的时候，斜边是 5：3²+4² = 9+16 = 25 = 5²。",
      "`math.hypot(3, 4)` 就是在算这条斜边。画布上的边按同样的比例放大了，方便看。",
    ],
    code: `import math
import turtle

t = turtle.Turtle()
t.color("chocolate")
t.pensize(4)
t.forward(160)
t.left(90)
t.forward(120)
t.goto(0, 0)

print("直角边 3 和 4")
print("斜边", math.hypot(3, 4))
print("平方和", 3 ** 2 + 4 ** 2)
`,
  },
];
