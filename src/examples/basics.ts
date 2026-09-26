import type { Example } from "./types";

export const BASICS: Example[] = [
  {
    id: "animal-hello",
    title: "动物打招呼",
    emoji: "🐱",
    summary: "第一句 print",
    categories: ["入门"],
    keywords: ["print", "字符串", "输出", "引号"],
    difficulty: 1,
    learn: ["`print()` 把文字显示出来", "引号里面是一段字符串", "一行 `print` 就换一行"],
    explanation: [
      "程序从上往下走，每遇到一句 `print`，就把引号里的话显示在输出区。",
      "改成你喜欢的动物和叫声，再多加一行 `print` 试试。",
    ],
    code: `print("小猫说：喵～")
print("小狗说：汪！")
print("小鸡说：叽叽叽！")
print("你好呀！")
`,
  },
  {
    id: "pencils",
    title: "文具加一加",
    emoji: "✏️",
    summary: "变量里存数字",
    categories: ["入门", "数学"],
    keywords: ["变量", "赋值", "加法", "print"],
    difficulty: 1,
    learn: ["用 `名字 = 数字` 记住一个数", "`print` 可以同时输出文字和数字", "变量可以直接参加加法"],
    explanation: [
      "`pencils = 4` 是在告诉电脑：看到 `pencils`，就代表 4。改右边的数字，下面三行会一起变。",
      "`print` 用逗号隔开好几样东西时，中间会自动空一格。",
    ],
    code: `pencils = 4
erasers = 2

print("铅笔有", pencils, "支")
print("橡皮有", erasers, "块")
print("加在一起是", pencils + erasers)
`,
  },
  {
    id: "silly-story",
    title: "离谱小故事",
    emoji: "📖",
    summary: "f-string 填空",
    categories: ["入门", "字符串"],
    keywords: ["f-string", "input", "花括号", "故事"],
    difficulty: 1,
    learn: ['`f"……{名字}……"` 把变量嵌进句子', "`input()` 问一个问题并记下回答"],
    explanation: [
      "在引号前写一个 `f`，句子里的 `{pet}` 就会换成变量里的内容。这比用加号一段段拼更清楚。",
      "每次运行都会再问一遍，所以每次故事都可以不一样。",
    ],
    code: `name = input("你叫什么名字？")
pet = input("你最喜欢的动物？")
food = input("一种好吃的：")

print(f"{name} 今天捡到一只{pet}。")
print(f"它开口就说：我想吃{food}！")
`,
    input: ["小月", "企鹅", "冰淇淋"],
  },
  {
    id: "race-who",
    title: "龟兔谁更快",
    emoji: "🐰",
    summary: "比一比大小",
    categories: ["入门"],
    keywords: ["比较", ">", "<", "==", "True", "False"],
    difficulty: 1,
    learn: ["`>`、`<`、`==` 比较两个数", "比较的结果是 `True` 或 `False`", "用 `if` 说出谁赢了"],
    explanation: [
      "`rabbit > tortoise` 会算出一个是或否：更大就是 `True`，否则是 `False`。`print` 可以直接把它打出来。",
      "`==` 是“相等吗”，两个等号连在一起。一个等号 `=` 是把数字存进变量。",
    ],
    code: `rabbit = int(input("小兔跑了多少米？"))
tortoise = int(input("小龟跑了多少米？"))

print("小兔更快吗？", rabbit > tortoise)
print("一样快吗？", rabbit == tortoise)

if rabbit > tortoise:
    print("小兔赢了！")
elif rabbit == tortoise:
    print("平局，下次再比！")
else:
    print("小龟赢了，稳稳当当！")
`,
    input: ["12", "20"],
  },
  {
    id: "umbrella",
    title: "出门带伞吗",
    emoji: "☔",
    summary: "if 和 else",
    categories: ["入门"],
    keywords: ["if", "else", "==", "等于", "天气"],
    difficulty: 1,
    learn: ["`==` 判断两段文字是否一样", "`if` / `else` 二选一", "缩进的代码属于上面的判断"],
    explanation: [
      "条件成立就走 `if` 下面缩进的那一行，不成立就走 `else`。这里没有第三种情况。",
      "文字要写成一模一样才算相等。输入“雨”会带伞；输入“晴”或其他话都会走 `else`。",
    ],
    code: `weather = input("今天是晴还是雨？")

if weather == "雨":
    print("带上雨伞再出门")
else:
    print("不用带伞，出去玩吧")
`,
    input: ["雨"],
  },
  {
    id: "odd-even",
    title: "奇数还是偶数",
    emoji: "🎲",
    summary: "看余数",
    categories: ["入门", "数学"],
    keywords: ["%", "余数", "偶数", "奇数", "if"],
    difficulty: 1,
    learn: ["`%` 算出除法的余数", "余数是 0 就是偶数", "`if` / `else` 分别给出回答"],
    explanation: [
      "`n % 2` 是 n 除以 2 剩下来的数：偶数正好分完，余数是 0；奇数会剩下 1。",
      "试试 8 和 7，看看余数和最后一句话怎么变。",
    ],
    code: `n = int(input("想一个整数："))

print(n, "除以 2 的余数是", n % 2)
if n % 2 == 0:
    print("余数是 0，这是偶数")
else:
    print("余数是 1，这是奇数")
`,
    input: ["7"],
  },
  {
    id: "can-go-out",
    title: "今天能出门吗",
    emoji: "🛝",
    summary: "and 和 or",
    categories: ["入门"],
    keywords: ["and", "or", "并且", "或者", "条件"],
    difficulty: 1,
    learn: ["`and`：两边都要成立", "`or`：有一边成立就行", "把两个回答组合起来判断"],
    explanation: [
      '`homework == "是" and weekend == "是"` 只有两个回答都是“是”才成立。',
      "`or` 宽松一些：作业写完了，或者正好是周末，有一个就算。",
    ],
    code: `homework = input("作业写完了吗？（是/否）")
weekend = input("今天是周末吗？（是/否）")

if homework == "是" and weekend == "是":
    print("作业写完了，又是周末，出门玩吧！")
elif homework == "是" or weekend == "是":
    print("只满足一半，再想想看")
else:
    print("先把作业写完吧")
`,
    input: ["是", "否"],
  },
  {
    id: "count-sheep",
    title: "数绵羊",
    emoji: "🐑",
    summary: "while 循环",
    categories: ["入门"],
    keywords: ["while", "计数", "n = n + 1", "条件"],
    difficulty: 1,
    learn: ["`while` 在条件成立时反复做", "自己把计数 `n` 加 1", "条件变成假时循环停下"],
    explanation: [
      "一开始 `n` 是 1。只要 `n <= 5`，就把这句话再打印一次，然后让 `n` 变成 `n + 1`。",
      "到第 6 只时条件不再成立，程序就跳到循环下面，打印 `zzzz`。把 5 改成 8，会多睡几只羊。",
    ],
    code: `n = 1
while n <= 5:
    print("第", n, "只绵羊，睡着了")
    n = n + 1

print("zzzz")
`,
  },
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
