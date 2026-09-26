# Imported once inside the Pyodide worker (src/engines/pyodide/worker.ts)
# after the PyPlay runtime files are written to the runtime directory, which
# the worker has already put on sys.path. Installs the _pyplay_host module (see
# python/tkinter/__init__.py for the interface) on top of the JavaScript
# functions registered as the `_pyplay_js` module, and routes input() and
# time.sleep() through it so Stop can interrupt them.
import builtins
import json
import sys
import time
import types

import _pyplay_js as _js

_STOP = "__PYPLAY_STOP__"
_pending = []
_last_flush = [0.0]
_FRAME_S = 1 / 60


def _check(value):
    if value == _STOP:
        raise KeyboardInterrupt
    return value


def emit(cmd):
    _pending.append(cmd)
    if len(_pending) >= 5000:
        flush()


def flush():
    sys.stdout.flush()
    sys.stderr.flush()
    if _pending:
        _js.commands(json.dumps(_pending, separators=(",", ":")))
        _pending.clear()
    _js.flushStdout()
    _last_flush[0] = time.monotonic()


def _flush_if_frame_due():
    # turtle calls update() after every tiny step; the screen only needs a
    # frame every ~16 ms, so batch in between.
    if time.monotonic() - _last_flush[0] >= _FRAME_S:
        flush()


def sleep(ms):
    flush()
    _check(_js.sleep(float(ms)))


def wait_event(timeout_ms):
    if timeout_ms == 0:
        _flush_if_frame_due()
    else:
        flush()
    raw = _check(_js.waitEvent(-1.0 if timeout_ms is None else float(timeout_ms)))
    return None if raw is None else json.loads(raw)


def measure_text(text, font):
    w, h = (float(v) for v in _js.measureText(str(text), json.dumps(list(font))).split(","))
    return (w, h)


def ask_string(title, prompt):
    flush()
    return _check(_js.askString(str(title), str(prompt)))


def screen_size():
    return (1280, 800)


host = types.ModuleType("_pyplay_host")
for _name in ("emit", "flush", "sleep", "wait_event", "measure_text", "ask_string", "screen_size"):
    setattr(host, _name, globals()[_name])
sys.modules["_pyplay_host"] = host


def _input(prompt=""):
    prompt = str(prompt)
    if prompt:
        sys.stdout.write(prompt)
    flush()
    line = _check(_js.readLine(prompt))
    if line is None:
        raise EOFError("EOF when reading a line")
    return line


builtins.input = _input
time.sleep = lambda seconds: sleep(float(seconds) * 1000.0)

