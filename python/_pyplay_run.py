"""Run one PyPlay program and describe how it ended.

Shared by the browser (Pyodide worker) and the CPython reference runner, so
both report errors in exactly the same shape:

    {"status": "ok"}
    {"status": "stopped"}                       # user pressed Stop
    {"status": "error", "error": {
        "type": "NameError", "message": "name 'x' is not defined",
        "line": 3, "traceback": "Traceback (most recent call last): ..."}}
"""

import sys
import traceback

FILENAME = "<main>"

# Modules that belong to one run and must not leak into the next.
_RUN_SCOPED_MODULES = ("turtle", "tkinter", "tkinter.simpledialog")


def reset_run_state():
    for name in _RUN_SCOPED_MODULES:
        sys.modules.pop(name, None)


def _user_line(tb):
    line = None
    for frame in traceback.extract_tb(tb):
        if frame.filename == FILENAME:
            line = frame.lineno
    return line


def _user_traceback(exc):
    """Traceback text limited to frames from the user's program."""
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == FILENAME]
    lines = ["Traceback (most recent call last):\n"]
    lines += traceback.format_list(frames)
    lines += traceback.format_exception_only(type(exc), exc)
    return "".join(lines)


def run(source):
    result = _execute(source)
    # Deliver whatever the program queued last. A Stop that lands exactly
    # here still counts as "stopped", never as an error.
    host = sys.modules.get("_pyplay_host")
    if host is not None:
        try:
            host.flush()
        except KeyboardInterrupt:
            result = {"status": "stopped"}
    return result


def _execute(source):
    reset_run_state()
    globals_ = {"__name__": "__main__", "__builtins__": __builtins__}
    try:
        code = compile(source, FILENAME, "exec")
    except SyntaxError as exc:
        return {
            "status": "error",
            "error": {
                "type": type(exc).__name__,
                "message": exc.msg,
                "line": exc.lineno,
                "traceback": "".join(traceback.format_exception_only(type(exc), exc)),
            },
        }
    try:
        exec(code, globals_)
    except KeyboardInterrupt:
        return {"status": "stopped"}
    except SystemExit:
        return {"status": "ok"}
    except BaseException as exc:
        turtle = sys.modules.get("turtle")
        if turtle is not None and isinstance(exc, turtle.Terminator):
            # the turtle window was closed (bye/exitonclick): a normal end
            return {"status": "ok"}
        return {
            "status": "error",
            "error": {
                "type": type(exc).__name__,
                "message": str(exc),
                "line": _user_line(exc.__traceback__),
                "traceback": _user_traceback(exc),
            },
        }
    return {"status": "ok"}
