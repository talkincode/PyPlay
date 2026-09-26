import type { Example } from "./types";

export const CHALLENGES: Example[] = [
  {
    id: "koch",
    title: "科赫雪花",
    emoji: "❄️",
    summary: "分形递归",
    categories: ["挑战", "Turtle", "函数"],
    keywords: ["递归", "分形", "雪花", "tracer"],
    difficulty: 3,
    learn: ["把一条线变成 4 段更短的线", "递归深度决定细节", "`tracer(0)` 加速"],
    explanation: [
      "科赫曲线的规则：把线段三等分，中间那段换成一个尖角。每一小段再按同样的规则继续分。",
      "三条科赫曲线围成一圈，就是一片雪花。把 `depth` 从 3 改成 1、2、4，看看有什么不同。",
    ],
    code: `import turtle

def koch(length, depth):
    if depth == 0:
        t.forward(length)
        return
    koch(length / 3, depth - 1)
    t.left(60)
    koch(length / 3, depth - 1)
    t.right(120)
    koch(length / 3, depth - 1)
    t.left(60)
    koch(length / 3, depth - 1)

screen = turtle.Screen()
screen.tracer(0)
t = turtle.Turtle()
t.hideturtle()
t.color("steel blue", "alice blue")
t.penup()
t.goto(-150, 90)
t.pendown()
t.begin_fill()
for i in range(3):
    koch(300, 3)
    t.right(120)
t.end_fill()
screen.update()
turtle.done()
`,
  },
  {
    id: "hanoi",
    title: "汉诺塔",
    emoji: "🗼",
    summary: "经典递归",
    categories: ["挑战", "函数"],
    keywords: ["递归", "移动步骤", "2 的 n 次方"],
    difficulty: 3,
    learn: ["把大问题拆成小问题", "递归函数的参数怎么变", "n 个盘子要 2ⁿ - 1 步"],
    explanation: [
      "要把 n 个盘子从 A 移到 C：先把上面 n - 1 个移到 B，再把最大的移到 C，最后把 n - 1 个从 B 移到 C。",
      "“把 n - 1 个盘子移过去”又是同一个问题，所以直接调用自己。",
    ],
    code: `count = 0

def hanoi(n, src, via, dst):
    global count
    if n == 0:
        return
    hanoi(n - 1, src, dst, via)
    count = count + 1
    print(f"第 {count} 步：把 {n} 号盘从 {src} 移到 {dst}")
    hanoi(n - 1, via, src, dst)

hanoi(3, "A", "B", "C")
print("一共", count, "步，正好是", 2 ** 3 - 1)
`,
  },
];
