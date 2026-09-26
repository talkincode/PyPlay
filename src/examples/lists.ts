import type { Example } from "./types";

export const LISTS: Example[] = [
  {
    id: "shopping",
    title: "购物清单",
    emoji: "🛒",
    summary: "列表增删",
    categories: ["列表", "入门"],
    keywords: ["append", "remove", "insert", "enumerate", "in"],
    difficulty: 1,
    learn: ["`append()` 添加、`remove()` 删除", "`in` 检查在不在", "`enumerate()` 带编号地遍历"],
    explanation: [
      "列表是一串按顺序排好的东西。`enumerate(items, start=1)` 同时给出编号和内容，打印清单很方便。",
    ],
    code: `items = ["苹果", "牛奶"]
items.append("面包")
items.insert(0, "鸡蛋")
items.remove("牛奶")

if "面包" in items:
    print("别忘了买面包！")

for i, item in enumerate(items, start=1):
    print(i, item)
print("一共", len(items), "样")
`,
  },
  {
    id: "scores",
    title: "成绩统计",
    emoji: "📊",
    summary: "max / min / sum",
    categories: ["列表", "数学"],
    keywords: ["max", "min", "sum", "sorted", "平均分"],
    difficulty: 1,
    learn: ["`max()` `min()` `sum()` `len()`", "`sorted()` 排序", "平均分 = 总分 ÷ 人数"],
    explanation: [
      "Python 的内置函数能直接处理整个列表。`sorted(scores, reverse=True)` 从高到低排序，原列表不变。",
    ],
    code: `scores = [88, 95, 72, 60, 100, 83]

print("最高分：", max(scores))
print("最低分：", min(scores))
print("平均分：", round(sum(scores) / len(scores), 1))
print("从高到低：", sorted(scores, reverse=True))

passed = [s for s in scores if s >= 80]
print("80 分以上：", passed)
`,
  },
  {
    id: "bar-chart",
    title: "柱状图",
    emoji: "📈",
    summary: "列表画成图",
    categories: ["列表", "Turtle"],
    keywords: ["数据可视化", "write", "zip", "矩形"],
    difficulty: 2,
    learn: ["`zip()` 把两个列表配对", "用数据决定柱子高度", "`write()` 标数字"],
    explanation: ["每个数据画一根柱子：柱子高度 = 数值 × 2。`zip(days, steps)` 让“日子”和“数值”一一对应。"],
    code: `import turtle

days = ["一", "二", "三", "四", "五"]
steps = [60, 95, 40, 120, 80]
colors = ["tomato", "orange", "gold", "yellow green", "sky blue"]

t = turtle.Turtle()
t.speed(0)
t.hideturtle()
x = -150

for day, n, c in zip(days, steps, colors):
    t.penup()
    t.goto(x, -100)
    t.pendown()
    t.color("black", c)
    t.begin_fill()
    t.left(90)
    t.forward(n * 2)
    t.right(90)
    t.forward(40)
    t.right(90)
    t.forward(n * 2)
    t.left(90)
    t.end_fill()
    t.penup()
    t.goto(x + 20, -100 + n * 2 + 5)
    t.write(str(n), align="center")
    t.goto(x + 20, -125)
    t.write("周" + day, align="center")
    x = x + 60

turtle.done()
`,
  },
];
