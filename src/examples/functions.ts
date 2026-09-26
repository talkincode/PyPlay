import type { Example } from "./types";

export const FUNCTIONS: Example[] = [
  {
    id: "star-function",
    title: "很多星星",
    emoji: "🌟",
    summary: "带参数的函数",
    categories: ["函数", "Turtle"],
    keywords: ["def", "参数", "goto", "复用"],
    difficulty: 2,
    learn: ["定义 `star(x, y, size, color)`", "调用同一个函数画不同的星星", "列表里放元组"],
    explanation: ["把“画一颗星”写成函数以后，只要换参数，就能在不同位置画不同大小、颜色的星星。"],
    code: `import turtle

t = turtle.Turtle()
t.speed(0)
t.hideturtle()

def star(x, y, size, color):
    t.penup()
    t.goto(x, y)
    t.pendown()
    t.color(color)
    t.begin_fill()
    for i in range(5):
        t.forward(size)
        t.right(144)
    t.end_fill()

stars = [(-200, 100, 60, "gold"), (-50, 150, 40, "orange"), (100, 80, 80, "red"),
         (-150, -100, 50, "purple"), (60, -120, 70, "deep sky blue")]
for x, y, size, color in stars:
    star(x, y, size, color)

turtle.done()
`,
  },
  {
    id: "tree",
    title: "递归画树",
    emoji: "🌳",
    summary: "函数调用自己",
    categories: ["函数", "Turtle", "挑战"],
    keywords: ["递归", "分形", "树枝"],
    difficulty: 3,
    learn: ["递归：函数调用自己", "停止条件 `if level == 0: return`", "画完树枝退回原处"],
    explanation: [
      "一棵树 = 一根树干 + 两棵更小的树。`tree` 画完树干后，向左、向右各调用一次自己，画更短的树枝。",
      "每调用一层 `level` 减 1，到 0 时停止——没有停止条件，函数就会无穷无尽地调用下去。",
    ],
    code: `import turtle

def tree(length, level):
    if level == 0:
        return
    t.forward(length)
    t.left(30)
    tree(length * 0.7, level - 1)
    t.right(60)
    tree(length * 0.7, level - 1)
    t.left(30)
    t.backward(length)

t = turtle.Turtle()
t.speed(0)
t.left(90)
t.penup()
t.goto(0, -200)
t.pendown()
t.color("sienna")
tree(100, 7)
turtle.done()
`,
  },
];
