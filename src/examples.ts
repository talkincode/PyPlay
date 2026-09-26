/** Starter programs shown in the examples menu. Each must run on CPython. */
export interface Example {
  id: string;
  title: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    id: "star",
    title: "⭐ 五角星",
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
    id: "spiral",
    title: "🌀 彩色螺旋",
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
    title: "🌸 花朵",
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
    id: "tree",
    title: "🌳 递归画树",
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
  {
    id: "hello",
    title: "👋 你好，input()",
    code: `name = input("你叫什么名字？")
age = int(input("你几岁了？"))

print("你好，" + name + "！")
print("再过 10 年你就", age + 10, "岁啦")
`,
  },
  {
    id: "guess",
    title: "🎲 猜数字",
    code: `import random

secret = random.randint(1, 100)
tries = 0

while True:
    guess = int(input("猜一个 1 到 100 的数字："))
    tries = tries + 1
    if guess < secret:
        print("太小了！")
    elif guess > secret:
        print("太大了！")
    else:
        print("猜对了！你用了", tries, "次")
        break
`,
  },
  {
    id: "keys",
    title: "🎮 方向键开海龟",
    code: `import turtle

screen = turtle.Screen()
t = turtle.Turtle()
t.shape("turtle")
t.color("green")

def up():
    t.setheading(90)
    t.forward(20)

def down():
    t.setheading(270)
    t.forward(20)

def left():
    t.setheading(180)
    t.forward(20)

def right():
    t.setheading(0)
    t.forward(20)

screen.onkey(up, "Up")
screen.onkey(down, "Down")
screen.onkey(left, "Left")
screen.onkey(right, "Right")
screen.listen()
print("点一下画布，然后用方向键控制海龟")
turtle.done()
`,
  },
  {
    id: "click",
    title: "🖱️ 点哪儿画哪儿",
    code: `import turtle

screen = turtle.Screen()
t = turtle.Turtle()
t.speed(0)
t.shape("circle")

def go(x, y):
    t.goto(x, y)
    t.dot(15, "blue")

screen.onclick(go)
print("在画布上点一点")
turtle.done()
`,
  },
  {
    id: "clock",
    title: "⏰ 定时器动画",
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
];
