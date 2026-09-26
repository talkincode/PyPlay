import turtle
screen = turtle.Screen()
t = turtle.Turtle()
def up():
    t.setheading(90)
    t.forward(20)
    print("up", t.pos())
def right():
    t.setheading(0)
    t.forward(20)
    print("right", t.pos())
screen.onkey(up, "Up")
screen.onkeypress(right, "Right")
screen.listen()
turtle.done()
print("mainloop ended")
