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
  {
    id: "coin-toss",
    title: "猜硬币",
    emoji: "🪙",
    summary: "random.choice",
    categories: ["小游戏", "随机"],
    keywords: ["random.choice", "random.seed", "计分"],
    difficulty: 1,
    learn: ["`random.choice()` 从列表里挑一个", "`random.seed()` 固定每次的随机结果", "猜中就给分数加 1"],
    explanation: [
      "硬币只有两个面，放在列表里。`random.choice(sides)` 每次挑其中一个。",
      "`random.seed(2)` 让这次的四个结果固定下来，所以预览里每次都一样。把这一行删掉，硬币就会重新乱翻。",
    ],
    code: `import random

random.seed(2)
sides = ["正面", "反面"]
score = 0

for i in range(4):
    coin = random.choice(sides)
    guess = input("硬币是正面还是反面？")
    print("落下的是", coin)
    if guess == coin:
        print("猜中啦")
        score = score + 1
    else:
        print("没猜中")

print("4 次里猜中", score, "次")
`,
    input: ["正面", "反面", "正面", "反面"],
  },
  {
    id: "which-bigger",
    title: "哪个更大",
    emoji: "🐘",
    summary: "比大小计分",
    categories: ["小游戏", "数学", "随机"],
    keywords: ["max", "random.randint", "while", "计分"],
    difficulty: 1,
    learn: ["`random.randint()` 抽两个数", "`max()` 找出更大的", "两个数一样时再抽一次"],
    explanation: [
      "每题抽两个 1～30 的数。`max(a, b)` 直接告诉程序哪一个更大，再和你的回答比较。",
      "`while a == b` 是为了避免两个数一样、没有“更大”的那个。`random.seed(7)` 把题目固定住。",
    ],
    code: `import random

random.seed(7)
score = 0

for i in range(4):
    a = random.randint(1, 30)
    b = random.randint(1, 30)
    while a == b:
        b = random.randint(1, 30)
    bigger = max(a, b)
    answer = int(input(f"{a} 和 {b}，更大的是？"))
    if answer == bigger:
        print("答对了")
        score = score + 1
    else:
        print("更大的是", bigger)

print("一共答对", score, "题")
`,
    input: ["11", "13", "3", "27"],
  },
  {
    id: "password-door",
    title: "密码门",
    emoji: "🚪",
    summary: "有限次尝试",
    categories: ["小游戏"],
    keywords: ["while", "break", "计数", "密码"],
    difficulty: 2,
    learn: ["用剩下的次数控制循环", "`break` 提前开门", "`while` 的 `else`：次数用完才执行"],
    explanation: [
      "循环条件是 `tries > 0`。答对就 `break`，门开了；答错就把次数减 1。",
      "`while` 后面可以跟 `else`。只有次数用完、循环正常结束时才走进 `else`。中途 `break` 则不会走进去。",
    ],
    code: `password = "小海龟"
tries = 3

while tries > 0:
    word = input("门上的锁说：密码是？")
    if word == password:
        print("门开了，宝箱里有 3 颗星星")
        break
    tries = tries - 1
    print("不对，还剩", tries, "次")
else:
    print("锁住了，下次再来")
`,
    input: ["香蕉", "小海龟"],
  },
  {
    id: "treasure-walk",
    title: "走出地图找宝",
    emoji: "🗺️",
    summary: "坐标和字典",
    categories: ["小游戏"],
    keywords: ["字典", "坐标", "while", "continue"],
    difficulty: 2,
    learn: ["用 x、y 记住自己在哪", "字典把“上”变成 `(0, -1)`", "走出边界时 `continue`，人不移动"],
    explanation: [
      '地图是 3×3。人从左上角出发，宝箱在右下角。方向写在字典里：`moves["右"]` 是 `(1, 0)`，表示 x 加 1。',
      "新坐标如果小于 0 或大于 2，就打印“不能走出地图”，然后 `continue`，这一步不算。",
    ],
    code: `x, y = 0, 0
goal_x, goal_y = 2, 2
moves = {"上": (0, -1), "下": (0, 1), "左": (-1, 0), "右": (1, 0)}
steps = 0

def show():
    for row in range(3):
        line = ""
        for col in range(3):
            if row == y and col == x:
                line = line + "龟"
            elif row == goal_y and col == goal_x:
                line = line + "宝"
            else:
                line = line + "·"
        print(line)

print("用 上 下 左 右 走到宝箱")
while not (x == goal_x and y == goal_y):
    show()
    way = input("往哪走？")
    if way not in moves:
        print("请输入 上、下、左 或 右")
        continue
    dx, dy = moves[way]
    nx = x + dx
    ny = y + dy
    if nx < 0 or nx > 2 or ny < 0 or ny > 2:
        print("不能走出地图")
        continue
    x, y = nx, ny
    steps = steps + 1

show()
print("找到宝箱了！走了", steps, "步")
`,
    input: ["上", "右", "右", "下", "下"],
  },
  {
    id: "tic-tac-toe",
    title: "井字棋",
    emoji: "⭕",
    summary: "棋盘和赢家",
    categories: ["小游戏", "列表", "函数"],
    keywords: ["列表", "函数", "while", "三连"],
    difficulty: 3,
    learn: ["用长度 9 的列表当棋盘", "函数 `wins()` 检查三连", "格子被占了就不能再放"],
    explanation: [
      "格子一开始写着 1～9。放下棋子时，把那个数字换成 `X` 或 `O`。输入的字如果不在棋盘上，说明那一格已经没了，这一步要重来。",
      "横着 3 条、竖着 3 条、斜着 2 条，只要有一条全是同一个记号，`wins()` 就返回真，这一方赢了。",
    ],
    code: `board = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
marks = ["X", "O"]
turn = 0

def show():
    print(board[0], board[1], board[2])
    print(board[3], board[4], board[5])
    print(board[6], board[7], board[8])

def wins(mark):
    lines = [
        (0, 1, 2),
        (3, 4, 5),
        (6, 7, 8),
        (0, 3, 6),
        (1, 4, 7),
        (2, 5, 8),
        (0, 4, 8),
        (2, 4, 6),
    ]
    for a, b, c in lines:
        if board[a] == mark and board[b] == mark and board[c] == mark:
            return True
    return False

while True:
    show()
    raw = input(f"{marks[turn]} 放在哪一格（1-9）？")
    if raw not in board:
        print("这一格不能放")
        continue
    board[int(raw) - 1] = marks[turn]
    if wins(marks[turn]):
        show()
        print(marks[turn], "赢了！")
        break
    turn = 1 - turn
`,
    input: ["1", "2", "5", "5", "3", "9"],
  },
];
