import type { Example } from "./types";

export const TURTLE: Example[] = [
  {
    id: "star",
    title: "五角星",
    emoji: "⭐",
    summary: "for 循环",
    categories: ["Turtle", "入门"],
    keywords: ["星星", "填色", "forward", "right", "144"],
    difficulty: 1,
    learn: ["`for` 循环", "`range()`", "`turtle.forward()`", "`turtle.right()`", "`begin_fill()` 填色"],
    explanation: [
      "为什么转 144°？海龟画完五角星一共转了两整圈（720°），平均到 5 个角，每次转 720 ÷ 5 = 144°。",
      '`t.color("red", "yellow")` 第一个是线的颜色，第二个是填充颜色。`begin_fill()` 和 `end_fill()` 之间画出的形状会被填满。',
    ],
    code: `import turtle

t = turtle.Turtle()
t.color("red", "yellow")

t.begin_fill()
for i in range(5):
    t.forward(150)
    t.right(144)
t.end_fill()

turtle.done()
`,
  },
  {
    id: "square",
    title: "正方形",
    emoji: "🟦",
    summary: "第一次画图",
    categories: ["Turtle", "入门"],
    keywords: ["forward", "left", "90", "四边形"],
    difficulty: 1,
    learn: ["`import turtle`", "`forward()` 前进", "`left(90)` 左转"],
    explanation: [
      "正方形有 4 条一样长的边、4 个直角，所以重复 4 次：前进 100，左转 90°。把 4 和 90 换成 3 和 120，会画出什么？",
    ],
    code: `import turtle

t = turtle.Turtle()
t.pensize(3)
t.color("blue")

for i in range(4):
    t.forward(100)
    t.left(90)

turtle.done()
`,
  },
  {
    id: "polygons",
    title: "多边形家族",
    emoji: "🔷",
    summary: "函数 + 参数",
    categories: ["Turtle", "函数"],
    keywords: ["def", "参数", "360", "外角"],
    difficulty: 2,
    learn: ["用 `def` 定义函数", "函数参数", "外角和是 360°"],
    explanation: [
      "任何正多边形转完一圈都是 360°，所以每个角要转 `360 / sides` 度。",
      "把画法写成函数 `polygon(sides, length)` 后，画三角形到八边形只需要换个参数。",
    ],
    code: `import turtle

def polygon(sides, length):
    for i in range(sides):
        t.forward(length)
        t.left(360 / sides)

t = turtle.Turtle()
t.speed(0)
colors = ["red", "orange", "gold", "green", "blue", "purple"]

for sides in range(3, 9):
    t.color(colors[sides - 3])
    polygon(sides, 60)

turtle.done()
`,
  },
  {
    id: "spiral",
    title: "彩色螺旋",
    emoji: "🌀",
    summary: "循环 + 角度",
    categories: ["Turtle"],
    keywords: ["螺旋", "颜色列表", "取余", "bgcolor"],
    difficulty: 2,
    learn: ["颜色列表和 `colors[i % 6]`", "边越画越长", "`bgcolor()` 背景色"],
    explanation: [
      "每一步都比上一步长一点（`i * 2`），再转 59°，线就一圈圈地向外绕。",
      "`i % 6` 是 i 除以 6 的余数，总在 0～5 之间，正好轮流取 6 种颜色。试试把 59 改成 90 或 121。",
    ],
    code: `import turtle

t = turtle.Turtle()
t.speed(0)
turtle.bgcolor("black")
colors = ["red", "orange", "yellow", "green", "cyan", "purple"]

for i in range(120):
    t.pencolor(colors[i % 6])
    t.width(i // 40 + 1)
    t.forward(i * 2)
    t.left(59)

turtle.done()
`,
  },
  {
    id: "flower",
    title: "花朵",
    emoji: "🌸",
    summary: "圆弧组成花瓣",
    categories: ["Turtle"],
    keywords: ["circle", "圆弧", "填色", "dot"],
    difficulty: 2,
    learn: ["`circle(r, 60)` 画圆弧", "两段圆弧拼成花瓣", "`dot()` 画圆点"],
    explanation: [
      "`circle(60, 60)` 画半径 60、角度 60° 的一段圆弧。画一段、转 120°、再画一段，就拼成一片花瓣。",
      "12 片花瓣每片之间转 150°，加上花瓣自身转过的角度，正好绕中心一圈。",
    ],
    code: `import turtle

t = turtle.Turtle()
t.speed(0)
t.color("deep pink", "pink")

for i in range(12):
    t.begin_fill()
    t.circle(60, 60)
    t.left(120)
    t.circle(60, 60)
    t.end_fill()
    t.left(150)

t.penup()
t.goto(0, -15)
t.dot(40, "gold")
turtle.done()
`,
  },
  {
    id: "rainbow",
    title: "彩虹圆环",
    emoji: "🌈",
    summary: "同心圆",
    categories: ["Turtle"],
    keywords: ["circle", "goto", "penup", "颜色"],
    difficulty: 2,
    learn: ["`penup()` / `pendown()` 抬笔落笔", "`goto()` 移动到坐标", "从大到小画同心圆"],
    explanation: [
      "`circle(r)` 从海龟当前位置开始画，圆心在海龟左边 r 远的地方。所以每个圆都从 `(0, -r)` 出发，圆心就都在 `(0, 0)`。",
      "先画大圆、再画小圆，小圆的填色盖在大圆上，就成了一圈圈彩虹。",
    ],
    code: `import turtle

t = turtle.Turtle()
t.speed(0)
t.hideturtle()
colors = ["red", "orange", "yellow", "green", "blue", "indigo", "violet"]

radius = 140
for c in colors:
    t.penup()
    t.goto(0, -radius)
    t.pendown()
    t.color(c)
    t.begin_fill()
    t.circle(radius)
    t.end_fill()
    radius = radius - 20

turtle.done()
`,
  },
  {
    id: "sun",
    title: "太阳",
    emoji: "☀️",
    summary: "圆点和光芒",
    categories: ["Turtle"],
    keywords: ["dot", "home", "back", "30"],
    difficulty: 1,
    learn: ["`dot(size, color)` 画实心圆", "`back()` 后退", "12 × 30° = 360°"],
    explanation: ["先在中间画一个大圆点，再从中心向 12 个方向画光芒：前进、后退回到中心、转 30°。"],
    code: `import turtle

t = turtle.Turtle()
t.speed(0)
turtle.bgcolor("light sky blue")
t.dot(120, "orange")
t.pensize(6)
t.color("gold")

for i in range(12):
    t.penup()
    t.forward(75)
    t.pendown()
    t.forward(40)
    t.penup()
    t.back(115)
    t.left(30)

t.hideturtle()
turtle.done()
`,
  },
  {
    id: "house",
    title: "小房子",
    emoji: "🏠",
    summary: "用函数拼图形",
    categories: ["Turtle", "函数"],
    keywords: ["矩形", "三角形", "填色", "goto"],
    difficulty: 2,
    learn: ["把重复的画法写成函数", "带默认值的参数", "按坐标拼出图画"],
    explanation: [
      "房子由三块组成：墙（正方形）、屋顶（三角形）、门（长方形）。写一个 `rect(x, y, w, h, color)` 函数，墙和门都能用它画。",
      "海龟默认朝右，`left(90)` 让它往上走。",
    ],
    code: `import turtle

t = turtle.Turtle()
t.speed(0)

def rect(x, y, w, h, color):
    t.penup()
    t.goto(x, y)
    t.pendown()
    t.color("black", color)
    t.begin_fill()
    for i in range(2):
        t.forward(w)
        t.left(90)
        t.forward(h)
        t.left(90)
    t.end_fill()

rect(-100, -100, 200, 150, "light yellow")
rect(-25, -100, 50, 80, "sienna")

t.penup()
t.goto(-120, 50)
t.pendown()
t.color("black", "firebrick")
t.begin_fill()
t.goto(0, 150)
t.goto(120, 50)
t.goto(-120, 50)
t.end_fill()
t.hideturtle()
turtle.done()
`,
  },
  {
    id: "write-text",
    title: "海龟写字",
    emoji: "✍️",
    summary: "write 和字体",
    categories: ["Turtle", "字符串"],
    keywords: ["write", "font", "align", "文字"],
    difficulty: 1,
    learn: ["`write()` 在画布上写字", '`font=("Arial", 24, "bold")` 字体', "`align` 对齐方式"],
    explanation: [
      '`write` 写在海龟所在的位置。`align="center"` 让文字以海龟为中心；字体是一个三元组：字体名、大小、样式。',
    ],
    code: `import turtle

t = turtle.Turtle()
t.hideturtle()
t.penup()

t.goto(0, 60)
t.color("purple")
t.write("你好，海龟！", align="center", font=("Arial", 28, "bold"))

t.goto(0, 0)
t.color("teal")
t.write("I love Python", align="center", font=("Arial", 20, "italic"))

t.goto(-150, -60)
t.color("black")
t.write("左对齐", align="left", font=("Arial", 14, "normal"))
turtle.done()
`,
  },
  {
    id: "stamps",
    title: "海龟印章",
    emoji: "🐢",
    summary: "stamp 盖章",
    categories: ["Turtle"],
    keywords: ["stamp", "shape", "turtle 形状", "圆圈"],
    difficulty: 1,
    learn: ['`shape("turtle")` 换成海龟形状', "`stamp()` 留下印章", "边走边转绕一圈"],
    explanation: [
      "`stamp()` 会在当前位置留下一个海龟形状的印子。每走一步盖一个章，再转 30°，12 次后正好围成一圈。",
    ],
    code: `import turtle

t = turtle.Turtle()
t.shape("turtle")
t.color("green")
t.penup()
t.speed(6)

for i in range(12):
    t.forward(80)
    t.stamp()
    t.back(80)
    t.right(30)

turtle.done()
`,
  },
  {
    id: "clock",
    title: "定时器动画",
    emoji: "⏰",
    summary: "ontimer",
    categories: ["Turtle", "函数"],
    keywords: ["ontimer", "global", "动画", "事件"],
    difficulty: 2,
    learn: ["`screen.ontimer(函数, 毫秒)` 定时调用", "`global` 修改全局变量", "函数调用自己的下一次"],
    explanation: [
      "`ontimer(tick, 50)` 表示 50 毫秒后调用 `tick`。在 `tick` 里再安排下一次，就形成了动画。",
      "`steps` 定义在函数外面，函数里要修改它必须先写 `global steps`。",
    ],
    code: `import turtle

screen = turtle.Screen()
t = turtle.Turtle()
t.shape("turtle")
t.penup()
steps = 0

def tick():
    global steps
    t.forward(5)
    t.left(6)
    steps = steps + 1
    if steps < 120:
        screen.ontimer(tick, 50)

tick()
turtle.done()
`,
  },
  {
    id: "square-art",
    title: "旋转方块",
    emoji: "🎨",
    summary: "嵌套循环",
    categories: ["Turtle"],
    keywords: ["嵌套循环", "旋转", "图案", "speed"],
    difficulty: 2,
    learn: ["循环里面套循环", "每次旋转一点点", "`speed(0)` 最快速度"],
    explanation: [
      "里层循环画一个正方形，外层循环每画完一个就右转 10°。36 个正方形 × 10° = 360°，组成一朵“花”。",
    ],
    code: `import turtle

t = turtle.Turtle()
t.speed(0)
colors = ["red", "orange", "gold", "green", "blue", "purple"]

for i in range(36):
    t.color(colors[i % 6])
    for side in range(4):
        t.forward(100)
        t.left(90)
    t.right(10)

t.hideturtle()
turtle.done()
`,
  },
];
