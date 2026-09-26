import type { Example } from "./types";

export const RANDOM: Example[] = [
  {
    id: "random-walk",
    title: "随机漫步",
    emoji: "🐾",
    summary: "随机方向",
    categories: ["随机", "Turtle"],
    keywords: ["random.choice", "方向", "setheading", "颜色"],
    difficulty: 2,
    learn: ["`random.choice([0, 90, 180, 270])` 随机选方向", "每次运行结果都不一样"],
    explanation: ["海龟每一步随机选一个方向走一小段。因为是随机的，你每次运行都会看到不同的路线。"],
    code: `import random
import turtle

t = turtle.Turtle()
t.speed(0)
t.pensize(3)
colors = ["red", "orange", "gold", "green", "blue", "purple"]

for i in range(200):
    t.color(random.choice(colors))
    t.setheading(random.choice([0, 90, 180, 270]))
    t.forward(15)

turtle.done()
`,
  },
  {
    id: "lucky-draw",
    title: "抽签",
    emoji: "🎁",
    summary: "shuffle / sample",
    categories: ["随机", "列表"],
    keywords: ["random.shuffle", "random.sample", "random.choice", "分组"],
    difficulty: 1,
    learn: ["`random.choice()` 抽一个", "`random.sample()` 抽几个不重复的", "`random.shuffle()` 打乱顺序"],
    explanation: [
      "`sample(names, 3)` 一次抽 3 个而且不会重复；`shuffle` 直接把列表本身打乱，可以用来随机排座位。",
    ],
    code: `import random

names = ["小明", "小红", "小刚", "小丽", "小华", "小强"]

print("今天的值日生：", random.choice(names))
print("三位幸运儿：", random.sample(names, 3))

random.shuffle(names)
print("随机座位表：", names)
`,
  },
  {
    id: "starry-sky",
    title: "满天星",
    emoji: "✨",
    summary: "随机坐标",
    categories: ["随机", "Turtle"],
    keywords: ["random.randint", "dot", "tracer", "夜空"],
    difficulty: 1,
    learn: ["随机生成坐标 `(x, y)`", "`dot()` 画星星", "`tracer(0)` 一次性画完"],
    explanation: [
      "每颗星星的位置、大小都是随机的。`screen.tracer(0)` 先把动画关掉，画完后 `update()` 一次性显示，速度快很多。",
    ],
    code: `import random
import turtle

screen = turtle.Screen()
screen.bgcolor("midnight blue")
screen.tracer(0)
t = turtle.Turtle()
t.hideturtle()
t.penup()

for i in range(150):
    t.goto(random.randint(-300, 300), random.randint(-280, 280))
    t.dot(random.randint(2, 7), random.choice(["white", "light yellow", "light blue"]))

t.goto(180, 170)
t.dot(80, "light yellow")
screen.update()
turtle.done()
`,
  },
];
