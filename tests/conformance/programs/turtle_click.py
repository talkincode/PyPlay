import turtle
screen = turtle.Screen()
t = turtle.Turtle()
t.speed(0)
def go(x, y):
    t.goto(x, y)
    t.dot(10, "blue")
    print("click at", x, y)
screen.onclick(go)
turtle.done()
