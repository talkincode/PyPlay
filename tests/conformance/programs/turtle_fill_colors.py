import turtle
screen = turtle.Screen()
screen.bgcolor("light blue")
t = turtle.Turtle()
t.speed(0)
colors = ["red", "#ff8800", (0.2, 0.8, 0.2), "DarkOliveGreen3", "gray50"]
for i, c in enumerate(colors):
    t.fillcolor(c)
    t.begin_fill()
    for _ in range(4):
        t.forward(40)
        t.left(90)
    t.end_fill()
    t.penup()
    t.forward(50)
    t.pendown()
screen.colormode(255)
t.pencolor(10, 200, 30)
t.forward(30)
print(t.pencolor(), t.fillcolor(), screen.bgcolor(), screen.colormode())
turtle.done()
