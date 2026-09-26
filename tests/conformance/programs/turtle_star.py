import turtle
t = turtle.Turtle()
t.color("red", "yellow")
t.begin_fill()
for i in range(5):
    t.forward(100)
    t.right(144)
t.end_fill()
print(t.position(), t.heading(), t.xcor(), t.pencolor(), t.fillcolor())
turtle.done()
