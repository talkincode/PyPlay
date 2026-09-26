import random
random.seed(1)
secret = random.randint(1, 20)
tries = 0
while True:
    guess = int(input("Guess: "))
    tries += 1
    if guess < secret:
        print("too small")
    elif guess > secret:
        print("too big")
    else:
        print("got it in", tries)
        break
