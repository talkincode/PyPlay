import type { Example } from "./types";

export const TURTLE: Example[] = [
  {
    id: "stairs",
    title: "小楼梯",
    emoji: "🪜",
    summary: "走直线再转弯",
    categories: ["Turtle", "入门"],
    keywords: ["forward", "left", "right", "一步一步", "不用循环"],
    difficulty: 1,
    learn: ["`import turtle` 请出一只海龟", "`forward()` 往前走", "`right()` 和 `left()` 转弯"],
    explanation: [
      "海龟一开始朝右。每一句都马上做完，再做下一句：走 70，右转 90°，再走 40，再左转 90°。",
      "同样的台阶写了两遍，方便看清先后顺序。看完再打开“正方形”，那里把重复的四步收进了循环。",
    ],
    code: `import turtle

t = turtle.Turtle()
t.pensize(4)
t.color("green")

t.forward(70)
t.right(90)
t.forward(40)
t.left(90)

t.forward(70)
t.right(90)
t.forward(40)
t.left(90)

t.forward(70)
t.hideturtle()
turtle.done()
`,
  },
  {
    id: "triangle",
    title: "实心三角形",
    emoji: "🔺",
    summary: "三条边和填色",
    categories: ["Turtle", "入门"],
    keywords: ["begin_fill", "end_fill", "120", "三角形", "不用循环"],
    difficulty: 1,
    learn: [
      "把三条边一条一条写出来",
      "`left(120)` 转过正三角形的外角",
      "`begin_fill()` / `end_fill()` 填上颜色",
    ],
    explanation: [
      '`t.color("purple", "violet")` 里，前一个是线条颜色，后一个是填充颜色。',
      "正三角形转完一圈还是 360°，三条边各转 120°。填充从 `begin_fill()` 开始，到 `end_fill()` 结束。",
    ],
    code: `import turtle

t = turtle.Turtle()
t.pensize(3)
t.color("purple", "violet")

t.begin_fill()
t.forward(150)
t.left(120)
t.forward(150)
t.left(120)
t.forward(150)
t.left(120)
t.end_fill()

t.hideturtle()
turtle.done()
`,
  },
  {
    id: "arrow",
    title: "一支小箭",
    emoji: "🏹",
    summary: "前进再退回",
    categories: ["Turtle", "入门"],
    keywords: ["backward", "forward", "转弯", "箭头", "不用循环"],
    difficulty: 1,
    learn: ["`backward()` 沿原路退回", "退回之后朝向不变", "先画箭身，再画两边箭头"],
    explanation: [
      "画出一边箭头后，`backward()` 会退回箭头尖，面朝的方向还是刚才那个。再用 `left(150)` 转回朝右，接着画另一边。",
      "改 `forward(140)` 会加长箭身，改 `forward(45)` 会改变箭头大小。",
    ],
    code: `import turtle

t = turtle.Turtle()
t.pensize(5)
t.color("red")

t.forward(140)

t.right(150)
t.forward(45)
t.backward(45)
t.left(150)

t.left(150)
t.forward(45)
t.backward(45)

t.hideturtle()
turtle.done()
`,
  },
  {
    id: "traffic-light",
    title: "红绿灯",
    emoji: "🚦",
    summary: "抬笔换地方",
    categories: ["Turtle", "入门"],
    keywords: ["penup", "goto", "dot", "颜色", "不用循环"],
    difficulty: 1,
    learn: ["`penup()` 抬笔，移动时不画线", "`goto(x, y)` 跳到坐标", "`dot(大小, 颜色)` 画实心圆点"],
    explanation: [
      "先抬笔走到左上角，落笔画出黑框：走、右转，再走、再右转，一共四条边。",
      "圆点用 `goto` 放在框里面。三个灯各写一遍，颜色和高度都看得清清楚楚。",
    ],
    code: `import turtle

t = turtle.Turtle()

t.penup()
t.goto(-50, 115)
t.pendown()
t.pensize(10)
t.color("black")
t.forward(100)
t.right(90)
t.forward(230)
t.right(90)
t.forward(100)
t.right(90)
t.forward(230)
t.right(90)

t.penup()
t.goto(0, 70)
t.dot(55, "red")
t.goto(0, 0)
t.dot(55, "gold")
t.goto(0, -70)
t.dot(55, "green")

t.hideturtle()
turtle.done()
`,
  },
  {
    id: "smiley",
    title: "笑脸",
    emoji: "😊",
    summary: "圆和一段弧",
    categories: ["Turtle", "入门"],
    keywords: ["circle", "dot", "setheading", "笑脸", "不用循环"],
    difficulty: 1,
    learn: ["`circle(半径)` 画一整圆", "`dot()` 点两只眼睛", "`circle(半径, 角度)` 只画一段圆弧"],
    explanation: [
      "`circle(100)` 从海龟脚下开始画，圆心在它左边 100 的地方。海龟站在 `(0, -100)` 朝右，圆心就在画面正中。",
      "嘴巴不是整圆：先用 `setheading(-60)` 转个方向，再 `circle(55, 120)` 只画 120° 的弧。",
    ],
    code: `import turtle

t = turtle.Turtle()

t.penup()
t.goto(0, -100)
t.pendown()
t.color("black", "gold")
t.begin_fill()
t.circle(100)
t.end_fill()

t.penup()
t.goto(-35, 30)
t.dot(22, "black")
t.goto(35, 30)
t.dot(22, "black")

t.goto(-45, -15)
t.setheading(-60)
t.pendown()
t.pensize(6)
t.circle(55, 120)

t.hideturtle()
turtle.done()
`,
  },
  {
    id: "where-am-i",
    title: "我在哪里",
    emoji: "📍",
    summary: "坐标和朝向",
    categories: ["Turtle"],
    keywords: ["xcor", "ycor", "heading", "home", "position", "API"],
    difficulty: 1,
    learn: ["`xcor()` / `ycor()` 读出当前位置", "`heading()` 读出朝向", "`home()` 回到原点并朝右"],
    explanation: [
      "海龟从 `(0, 0)` 出发，朝右是 0°，左转角度变大。这些函数不画新东西，只是把现在的状态告诉你。",
      "`home()` 会一边画线一边回到原点，朝向重新变成 0。所以预览里第三条线是回家时画出来的。",
    ],
    code: `import turtle

t = turtle.Turtle()
t.color("dodger blue")
t.pensize(4)

t.forward(120)
print("朝向", round(t.heading()), "x", round(t.xcor()), "y", round(t.ycor()))

t.left(90)
t.forward(80)
print("朝向", round(t.heading()), "x", round(t.xcor()), "y", round(t.ycor()))

t.home()
print("回家后", round(t.xcor()), round(t.ycor()), "朝向", round(t.heading()))
t.hideturtle()
turtle.done()
`,
  },
  {
    id: "dashed-line",
    title: "画一条虚线",
    emoji: "➖",
    summary: "抬笔和落笔",
    categories: ["Turtle"],
    keywords: ["penup", "pendown", "isdown", "pu", "pd", "API"],
    difficulty: 1,
    learn: ["`pendown()` 落笔，移动会画线", "`penup()` 抬笔，移动不画线", "`isdown()` 问笔现在放着没有"],
    explanation: [
      "笔放下时 `forward` 留下痕迹，抬起来再走就空一段。一落一抬重复几次，就是虚线。",
      "`isdown()` 的结果是 `True` 或 `False`。画完虚线后笔是抬着的，所以第二次打印是 `False`。",
    ],
    code: `import turtle

t = turtle.Turtle()
t.color("purple")
t.pensize(4)

print("开始时笔放下了吗？", t.isdown())
for i in range(8):
    t.pendown()
    t.forward(22)
    t.penup()
    t.forward(14)

print("画完后笔放下了吗？", t.isdown())
t.hideturtle()
turtle.done()
`,
  },
  {
    id: "pen-style",
    title: "线宽和填色",
    emoji: "🖊️",
    summary: "pensize / color",
    categories: ["Turtle"],
    keywords: ["pensize", "pencolor", "fillcolor", "speed", "filling", "API"],
    difficulty: 1,
    learn: [
      "`pensize(宽度)` 改线的粗细，不写参数就读出当前线宽",
      "`pencolor()` 管线条，`fillcolor()` 管填充",
      "`speed(0)` 画得最快",
    ],
    explanation: [
      "同一个 `forward(160)`，换了线宽和颜色，三条线就不一样。函数名后面的括号里是参数：宽度、颜色。",
      "`filling()` 在 `begin_fill()` 和 `end_fill()` 之间是 `True`。长方形的边是海军蓝，里面是淡蓝，两件事分开设置。",
    ],
    code: `import turtle

t = turtle.Turtle()
t.speed(0)

t.pensize(2)
t.pencolor("red")
print("线宽", t.pensize())
t.forward(160)

t.penup()
t.goto(0, -36)
t.pendown()
t.pensize(8)
t.pencolor("orange")
t.forward(160)

t.penup()
t.goto(0, -80)
t.pendown()
t.pensize(16)
t.pencolor("green")
t.forward(160)

t.penup()
t.goto(20, -150)
t.setheading(0)
t.pendown()
t.pensize(3)
t.pencolor("navy")
t.fillcolor("light blue")
t.begin_fill()
print("正在填色吗？", t.filling())
t.forward(90)
t.left(90)
t.forward(50)
t.left(90)
t.forward(90)
t.left(90)
t.forward(50)
t.end_fill()
print("填完了吗？", t.filling())
t.hideturtle()
turtle.done()
`,
  },
  {
    id: "turtle-shapes",
    title: "海龟的外形",
    emoji: "🐢",
    summary: "shape / stamp",
    categories: ["Turtle"],
    keywords: ["shape", "shapesize", "getshapes", "stamp", "API"],
    difficulty: 1,
    learn: [
      "`screen.getshapes()` 列出全部外形",
      "`shape(名字)` 换成这种外形",
      "`shapesize(宽, 长)` 把外形放大",
    ],
    explanation: [
      "海龟不只长得像海龟。`classic`、`arrow`、`turtle`、`circle`、`square`、`triangle` 都可以换上。",
      "`stamp()` 把当前外形印在原地。这里先放大两倍，再每换一种外形盖一枚章。",
    ],
    code: `import turtle

screen = turtle.Screen()
print("可以用的外形：", screen.getshapes())

t = turtle.Turtle()
t.penup()
t.goto(-210, 0)
t.shapesize(2, 2)
t.color("teal")

for name in ["classic", "arrow", "turtle", "circle", "square", "triangle"]:
    t.shape(name)
    t.stamp()
    t.forward(80)

t.hideturtle()
turtle.done()
`,
  },
  {
    id: "point-at",
    title: "转向目标",
    emoji: "🎯",
    summary: "towards / distance",
    categories: ["Turtle"],
    keywords: ["towards", "distance", "setheading", "API"],
    difficulty: 2,
    learn: [
      "`towards(x, y)` 算出朝那个点要转多少度",
      "`distance(x, y)` 算出还要走多远",
      "把算出来的数交给 `setheading` 和 `forward`",
    ],
    explanation: [
      "这两个函数只负责计算，自己不移动海龟。朝向用角度表示，距离用步数表示。",
      "先问方向，再问距离，海龟就能正好走到目标点。终点的橙色圆点是到达之后画的。",
    ],
    code: `import turtle

t = turtle.Turtle()
t.shape("turtle")
t.color("sea green")
t.pensize(3)

target_x = 150
target_y = 80
print("目标方向", round(t.towards(target_x, target_y)))
print("距离", round(t.distance(target_x, target_y)))

t.setheading(t.towards(target_x, target_y))
t.forward(t.distance(target_x, target_y))
t.dot(18, "orange")
print("到达", round(t.xcor()), round(t.ycor()))
turtle.done()
`,
  },
  {
    id: "two-turtles",
    title: "两只海龟",
    emoji: "🐢",
    summary: "两份 Turtle()",
    categories: ["Turtle"],
    keywords: ["Turtle", "对象", "circle", "同一套方法", "API"],
    difficulty: 1,
    learn: [
      "`turtle.Turtle()` 每调用一次得到一只新海龟",
      "每只海龟各自记住颜色、位置和画笔",
      "方法写在海龟名字后面：`a.circle(50)`",
    ],
    explanation: [
      "红海龟和蓝海龟是两个变量。给 `a` 设的颜色不会跑到 `b` 身上。",
      "圆是从海龟脚下、沿逆时针画的。先 `goto` 到不同起点，两只圆就并排出现。",
    ],
    code: `import turtle

a = turtle.Turtle()
b = turtle.Turtle()
a.speed(0)
b.speed(0)
a.pensize(4)
b.pensize(4)
a.color("crimson")
b.color("royal blue")

a.penup()
a.goto(-150, -40)
a.pendown()
a.circle(50)

b.penup()
b.goto(30, -70)
b.pendown()
b.circle(80)

a.hideturtle()
b.hideturtle()
turtle.done()
`,
  },
  {
    id: "screen-setup",
    title: "设置屏幕",
    emoji: "🖼️",
    summary: "Screen 的方法",
    categories: ["Turtle"],
    keywords: ["Screen", "bgcolor", "title", "colormode", "API"],
    difficulty: 2,
    learn: [
      "`turtle.Screen()` 拿到屏幕，背景和标题写在屏幕上",
      "`colormode(255)` 之后颜色可以用 0～255 的三个数",
      "`color(线条颜色, 填充颜色)` 一次设置两种颜色",
    ],
    explanation: [
      "海龟管自己的笔，屏幕管整张画布。`bgcolor` 和 `title` 都是屏幕的方法，所以写 `screen.bgcolor(...)`。",
      "默认颜色模式是 1。改成 255 以后，`(220, 50, 90)` 这种三个数才表示一种颜色：红、绿、蓝各有多浓。",
    ],
    code: `import turtle

screen = turtle.Screen()
print("颜色模式", screen.colormode())
screen.colormode(255)
print("改成", screen.colormode())
screen.bgcolor("ivory")
screen.title("海龟的屏幕")

t = turtle.Turtle()
t.speed(0)
t.pensize(4)
t.color((220, 50, 90), (255, 190, 70))
t.begin_fill()
t.circle(70)
t.end_fill()
t.hideturtle()
turtle.done()
`,
  },
  {
    id: "short-names",
    title: "短名字和瞬移",
    emoji: "⚡",
    summary: "fd / teleport",
    categories: ["Turtle"],
    keywords: ["fd", "bk", "lt", "rt", "teleport", "goto", "API"],
    difficulty: 1,
    learn: [
      "`fd`、`bk`、`lt`、`rt` 是前进、后退、左转、右转的短名字",
      "`teleport(x, y)` 跳过去，不画线",
      "短名字和长名字是同一个函数",
    ],
    explanation: [
      "`t.fd(80)` 和 `t.forward(80)` 完全一样，只是少写几个字母。查文档时两头都能查到。",
      "`goto` 在笔放下时会把走过的路画出来。`teleport` 直接出现在新坐标，中间不留线，朝向也不变。",
    ],
    code: `import turtle

t = turtle.Turtle()
t.color("chocolate")
t.pensize(4)

t.fd(110)
t.lt(90)
t.fd(70)
t.rt(90)
t.bk(40)

t.teleport(-90, -60)
t.fd(90)
t.lt(90)
t.fd(50)

t.ht()
turtle.done()
`,
  },
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
