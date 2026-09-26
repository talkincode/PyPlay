from turtle import *
speed(0)
pensize(3)
pencolor("blue")
for i in range(36):
    forward(10 + i * 3)
    left(91)
penup()
goto(-100, 50)
pendown()
circle(40)
home()
print(pos(), xcor(), heading(), pensize(), speed(), isdown(), isvisible())
done()
