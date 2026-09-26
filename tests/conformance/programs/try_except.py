def safe_div(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return "inf"
    finally:
        print("checked", a, b)

print(safe_div(1, 2), safe_div(1, 0))
try:
    int("x")
except (TypeError, ValueError) as e:
    print(type(e), e)
try:
    [][0]
except LookupError as e:
    print("lookup:", e)
try:
    print("ok")
except Exception:
    print("no")
else:
    print("else runs")
for i in range(3):
    try:
        if i == 1:
            continue
        print("body", i)
    finally:
        print("finally", i)
