import type { Example } from "./types";

export const GAMES: Example[] = [
  {
    id: "guess",
    title: "猜数字",
    emoji: "🎯",
    summary: "while 循环",
    categories: ["小游戏", "随机"],
    keywords: ["while", "break", "random.randint", "太大太小"],
    difficulty: 2,
    learn: ["`while True` 一直循环", "`break` 跳出循环", "`random.randint()` 随机整数", "计数器变量"],
    explanation: [
      "电脑先想好一个 1～100 的数。`while True` 会一直让你猜，猜对时用 `break` 结束循环。",
      "聪明的猜法：每次都猜剩下范围的中间数，最多 7 次一定能猜中！",
    ],
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
    input: ["50", "25", "75", "12", "37", "62", "88"],
  },
  {
    id: "keys",
    title: "方向键开海龟",
    emoji: "🎮",
    summary: "键盘事件",
    categories: ["小游戏", "Turtle", "函数"],
    keywords: ["onkey", "listen", "键盘", "setheading"],
    difficulty: 2,
    learn: ['`screen.onkey(函数, "Up")` 绑定按键', "`listen()` 开始监听", "`setheading()` 设置方向"],
    explanation: [
      "`onkey` 把一个按键和一个函数绑在一起：按下并松开方向键时，对应的函数就会被调用。",
      "运行后先点一下画布，再用方向键控制海龟。",
    ],
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
    interactive: "keyboard",
  },
  {
    id: "click",
    title: "点哪儿画哪儿",
    emoji: "🖱️",
    summary: "鼠标事件",
    categories: ["小游戏", "Turtle"],
    keywords: ["onclick", "鼠标", "坐标", "goto"],
    difficulty: 2,
    learn: ["`screen.onclick(函数)` 响应点击", "点击位置的坐标 `(x, y)`", "`goto()` 移动过去"],
    explanation: ["点击画布时，PyPlay 会把点击处的坐标 `x, y` 传给 `go` 函数。海龟走过去，再画一个蓝点。"],
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
    interactive: "mouse",
  },
  {
    id: "rps",
    title: "石头剪刀布",
    emoji: "✊",
    summary: "列表 + 判断",
    categories: ["小游戏", "随机", "列表"],
    keywords: ["random.choice", "while", "in", "规则"],
    difficulty: 2,
    learn: ["`random.choice()` 随机选一个", "用字典写规则：谁赢谁", "输入“退出”结束游戏"],
    explanation: [
      '字典 `wins` 记录“什么能赢什么”：`wins["石头"]` 是 `"剪刀"`，表示石头赢剪刀。',
      "比较时只要看 `wins[me] == pc` 就知道你赢了没有。",
    ],
    code: `import random

choices = ["石头", "剪刀", "布"]
wins = {"石头": "剪刀", "剪刀": "布", "布": "石头"}
score = 0

while True:
    me = input("出什么？（石头/剪刀/布，输入 退出 结束）")
    if me == "退出":
        break
    if me not in choices:
        print("要输入 石头、剪刀 或 布 哦")
        continue
    pc = random.choice(choices)
    print("电脑出了", pc)
    if me == pc:
        print("平局")
    elif wins[me] == pc:
        print("你赢了！")
        score = score + 1
    else:
        print("电脑赢了")

print("你一共赢了", score, "局")
`,
    input: ["石头", "布", "剪刀", "纸", "退出"],
  },
  {
    id: "dice",
    title: "掷骰子",
    emoji: "🎲",
    summary: "random",
    categories: ["小游戏", "随机"],
    keywords: ["random.randint", "列表", "统计"],
    difficulty: 1,
    learn: ["`random.randint(1, 6)`", "列表下标取骰子图案", "累加求总分"],
    explanation: [
      "`randint(1, 6)` 每次都可能得到 1～6 中的任意一个。骰子图案放在列表里，点数 n 对应下标 `n - 1`。",
    ],
    code: `import random

faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"]
total = 0

for i in range(5):
    n = random.randint(1, 6)
    total = total + n
    print("第", i + 1, "次：", faces[n - 1], n)

print("总点数：", total)
`,
  },
  {
    id: "quiz",
    title: "口算小测验",
    emoji: "➕",
    summary: "随机出题",
    categories: ["小游戏", "数学", "随机"],
    keywords: ["random", "input", "计分", "f-string"],
    difficulty: 2,
    learn: ["随机出加法题", "比较答案并计分", "f-string 拼出题目"],
    explanation: ['`f"{a} + {b} = "` 会把变量的值填进大括号里。答对就给 `score` 加 1，最后告诉你得了几分。'],
    code: `import random

score = 0
for i in range(5):
    a = random.randint(1, 20)
    b = random.randint(1, 20)
    answer = int(input(f"第 {i + 1} 题：{a} + {b} = "))
    if answer == a + b:
        print("✔ 正确")
        score = score + 1
    else:
        print("✘ 正确答案是", a + b)

print(f"你答对了 {score} / 5 题")
`,
    input: ["10", "20", "15", "8", "30"],
  },
  {
    id: "race",
    title: "海龟赛跑",
    emoji: "🏁",
    summary: "多只海龟",
    categories: ["小游戏", "Turtle", "随机"],
    keywords: ["多个对象", "random", "while", "xcor"],
    difficulty: 3,
    learn: ["同时控制多只海龟", "`xcor()` 读位置", "用 `while` 判断谁先到终点"],
    explanation: [
      "每一轮，三只海龟各向前随机走 1～10 步。谁的 `xcor()` 先超过终点线的位置，谁就赢。",
      "海龟都放在列表里，用 `for` 循环一起指挥它们。",
    ],
    code: `import random
import turtle

finish = 150
judge = turtle.Turtle()
judge.hideturtle()
judge.penup()
judge.goto(finish, -100)
judge.pendown()
judge.goto(finish, 100)

racers = []
colors = ["red", "blue", "green"]
for i in range(3):
    r = turtle.Turtle()
    r.shape("turtle")
    r.color(colors[i])
    r.penup()
    r.goto(-150, 60 - i * 60)
    racers.append(r)

winner = None
while winner is None:
    for r in racers:
        r.forward(random.randint(1, 10))
        if r.xcor() >= finish:
            winner = r
            break

print("冠军是", winner.pencolor(), "海龟！")
turtle.done()
`,
  },
];
