"""Generate src/engines/fast/cpython-attributes.json.

Every attribute name that any object a fast-engine program can hold has on
real CPython: builtin types, the modules the fast engine supports, turtle's
Turtle/_Screen/Vec2D, exceptions, iterators and views. The fast engine uses
it to decide what a missing attribute means:

  * name in this set but not implemented by the fast engine -> the program
    runs on full Python (the attribute might exist there);
  * name not in this set -> CPython itself raises AttributeError, so the fast
    engine may raise it too.

Run with the CPython version PyPlay targets:  python3 scripts/gen-cpython-attrs.py
"""
import json
import math
import random
import sys
import time
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))

# turtle needs PyPlay's tkinter stand-in, which needs a host module
host = types.ModuleType("_pyplay_host")
host.emit = lambda cmd: None
host.flush = lambda: None
host.sleep = lambda ms: None
host.wait_event = lambda t: None
host.measure_text = lambda text, font: (0, 0)
host.ask_string = lambda title, prompt: None
host.screen_size = lambda: (1280, 800)
sys.modules["_pyplay_host"] = host
import turtle  # noqa: E402

def dir_of(obj):
    return sorted(x for x in obj.__dir__() if isinstance(x, str)) if not isinstance(obj, type) else sorted(dir(obj))

# key → object, keyed by the fast engine's typeName (modules as "module:NAME",
# classes as "class:NAME")
samples = {
    "int": 0, "float": 0.0, "bool": True, "str": "", "list": [], "tuple": (), "dict": {}, "NoneType": None,
    "range": range(1), "function": (lambda: 0), "builtin_function_or_method": len,
    "list_iterator": iter([]), "tuple_iterator": iter(()), "str_ascii_iterator": iter(""),
    "dict_keyiterator": iter({}), "range_iterator": iter(range(1)), "list_reverseiterator": reversed([]),
    "enumerate": enumerate([]), "zip": zip(), "map": map(len, []), "filter": filter(None, []),
    "generator": (x for x in []), "dict_keys": {}.keys(), "dict_values": {}.values(), "dict_items": {}.items(),
    "exception": ValueError(),
    "module:math": math, "module:random": random, "module:time": time, "module:turtle": turtle,
    "Vec2D": turtle.Vec2D(0, 0), "Turtle": turtle.Turtle(), "_Screen": turtle.Screen(),
    "class:int": int, "class:float": float, "class:str": str, "class:bool": bool, "class:list": list,
    "class:tuple": tuple, "class:dict": dict, "class:range": range, "class:type": type,
}
types_ = {k: dir_of(v) for k, v in samples.items()}
out = ROOT / "src/engines/fast/cpython-attributes.json"
out.write_text(json.dumps({"python": sys.version.split()[0], "types": types_}, separators=(",", ":")) + "\n")
total = len(set().union(*types_.values()))
print(f"wrote dir() of {len(types_)} object kinds, {total} distinct names ({sys.version.split()[0]}) to {out.relative_to(ROOT)}")
