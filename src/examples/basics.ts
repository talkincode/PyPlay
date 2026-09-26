import type { Example } from "./types";

export const BASICS: Example[] = [
  {
    id: "hello",
    title: "你好，input()",
    emoji: "👋",
    summary: "input 和 print",
    categories: ["入门", "字符串"],
    keywords: ["输入", "输出", "变量", "int"],
    difficulty: 1,
    learn: ["`input()` 读入文字", "`int()` 把文字变成数字", "`print()` 输出多个值"],
    explanation: [
      "`input()` 会等你在输出区下方输入，然后把你输入的内容当作**文字**交给程序。",
      "年龄要参与计算，所以用 `int()` 把文字变成整数。试试输入一个不是数字的年龄，看看会发生什么。",
    ],
    code: `name = input("你叫什么名字？")
age = int(input("你几岁了？"))

print("你好，" + name + "！")
print("再过 10 年你就", age + 10, "岁啦")
`,
    input: ["小明", "9"],
  },
  {
    id: "print-triangle",
    title: "用 print 画三角形",
    emoji: "🔺",
    summary: "字符串乘法",
    categories: ["入门", "字符串"],
    keywords: ["for 循环", "range", "星号", "图案"],
    difficulty: 1,
    learn: ["`for` 循环和 `range()`", '字符串乘法 `"*" * 3`', "用空格对齐"],
    explanation: [
      '`"*" * 5` 会得到 `*****`：字符串乘以整数，就是把它重复几遍。',
      "第 `i` 行先打印 `rows - i` 个空格，再打印 `2 * i - 1` 个星号，就排成了一个三角形。改改 `rows` 试试。",
    ],
    code: `rows = 5

for i in range(1, rows + 1):
    print(" " * (rows - i) + "*" * (2 * i - 1))
`,
  },
  {
    id: "age-2030",
    title: "年龄计算器",
    emoji: "🎂",
    summary: "变量和减法",
    categories: ["入门", "数学"],
    keywords: ["input", "int", "变量", "计算"],
    difficulty: 1,
    learn: ["用变量保存数据", "`int(input(...))` 读入数字", "减法计算"],
    explanation: ["出生年份和目标年份相减，就是那一年的年龄。把 `target` 改成你想知道的任何一年。"],
    code: `year = int(input("你是哪一年出生的？"))
target = 2030

age = target - year
print("到", target, "年，你就", age, "岁了！")
`,
    input: ["2016"],
  },
  {
    id: "grade",
    title: "成绩等级",
    emoji: "📝",
    summary: "if / elif / else",
    categories: ["入门"],
    keywords: ["条件", "判断", "比较"],
    difficulty: 1,
    learn: ["`if` / `elif` / `else` 条件判断", "比较运算 `>=`", "冒号和缩进"],
    explanation: [
      "程序从上往下检查条件，遇到第一个成立的就执行它下面缩进的代码，后面的都跳过。",
      "所以 `elif score >= 80` 不需要再写 `score < 90`：能走到这里，说明分数一定小于 90。",
    ],
    code: `score = int(input("考了多少分？"))

if score >= 90:
    print("A，太棒了！")
elif score >= 80:
    print("B，很不错！")
elif score >= 60:
    print("C，及格啦")
else:
    print("再加油！")
`,
    input: ["87"],
  },
  {
    id: "countdown",
    title: "火箭倒计时",
    emoji: "🚀",
    summary: "倒着数的 range",
    categories: ["入门"],
    keywords: ["time.sleep", "range", "倒数", "for 循环"],
    difficulty: 1,
    learn: ["`range(5, 0, -1)` 倒着数", "`import time` 和 `time.sleep()` 暂停"],
    explanation: [
      "`range(5, 0, -1)` 从 5 开始，每次减 1，到 0 之前停下，所以得到 5、4、3、2、1。",
      "`time.sleep(0.5)` 让程序停半秒，倒计时才有节奏。",
    ],
    code: `import time

for i in range(5, 0, -1):
    print(i)
    time.sleep(0.5)

print("发射！🚀")
`,
  },
  {
    id: "calculator",
    title: "两数计算器",
    emoji: "🧮",
    summary: "四则运算",
    categories: ["入门", "数学"],
    keywords: ["加减乘除", "float", "round", "整除", "余数"],
    difficulty: 1,
    learn: ["`+ - * /` 四则运算", "`//` 整除和 `%` 余数", "`round()` 保留小数"],
    explanation: [
      "`/` 的结果总是小数（比如 `4 / 2` 是 `2.0`）；`//` 只要整数部分；`%` 求余数。",
      "`round(x, 2)` 把结果保留两位小数。",
    ],
    code: `a = int(input("第一个数："))
b = int(input("第二个数："))

print(a, "+", b, "=", a + b)
print(a, "-", b, "=", a - b)
print(a, "×", b, "=", a * b)
print(a, "÷", b, "=", round(a / b, 2))
print(a, "整除", b, "=", a // b, "余", a % b)
`,
    input: ["17", "5"],
  },
];
