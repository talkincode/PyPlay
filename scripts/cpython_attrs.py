"""Collect dir() of every kind of object a fast-engine program can hold.

Executed inside Pyodide by scripts/gen-cpython-attrs.mjs — the CPython the
full-Python engine really runs — so the table does not depend on the
developer's platform (e.g. math has __file__ on macOS but not on Linux).
Requires PyPlay's runtime (turtle.py + tkinter stand-in) on sys.path and a
_pyplay_host module; the Node script provides both.
"""
import math
import random
import sys
import time

import turtle


def _dir_of(obj):
    if isinstance(obj, type):
        return sorted(dir(obj))
    return sorted(x for x in obj.__dir__() if isinstance(x, str))


def collect():
    # keyed by the fast engine's typeName (modules "module:NAME", classes "class:NAME")
    samples = {
        "int": 0, "float": 0.0, "bool": True, "str": "", "list": [], "tuple": (), "dict": {}, "NoneType": None,
        "range": range(1), "function": (lambda: 0), "builtin_function_or_method": len,
        "list_iterator": iter([]), "tuple_iterator": iter(()), "str_ascii_iterator": iter(""),
        "dict_keyiterator": iter({}), "range_iterator": iter(range(1)), "list_reverseiterator": reversed([]),
        "enumerate": enumerate([]), "zip": zip(), "map": map(len, []), "filter": filter(None, []),
        "generator": (x for x in []), "dict_keys": {}.keys(), "dict_values": {}.values(),
        "dict_items": {}.items(), "exception": ValueError(),
        "module:math": math, "module:random": random, "module:time": time, "module:turtle": turtle,
        "Vec2D": turtle.Vec2D(0, 0), "Turtle": turtle.Turtle(), "_Screen": turtle.Screen(),
        "class:int": int, "class:float": float, "class:str": str, "class:bool": bool, "class:list": list,
        "class:tuple": tuple, "class:dict": dict, "class:range": range, "class:type": type,
    }
    return {"python": sys.version.split()[0], "types": {k: _dir_of(v) for k, v in samples.items()}}
