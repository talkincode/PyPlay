import turtle
screen = turtle.Screen()
screen.tracer(0)
t = turtle.Turtle()
t.hideturtle()
for i in range(200):
    t.forward(i * 2)
    t.left(59)
screen.update()
screen.tracer(4, 5)
for i in range(20):
    t.forward(10)
    t.right(18)
print(screen.tracer(), screen.delay())
turtle.done()
