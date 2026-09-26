import turtle
screen = turtle.Screen()
t = turtle.Turtle()
t.speed(0)
steps = 0
def tick():
    global steps
    t.forward(10)
    t.left(30)
    steps += 1
    if steps < 12:
        screen.ontimer(tick, 50)
    else:
        print("done ticking")
screen.ontimer(tick, 100)
turtle.done()
print("after mainloop", steps)
