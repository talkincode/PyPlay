"""Run a PyPlay program on real CPython and print what happened as JSON.

This is the conformance oracle: the same python/ runtime the browser uses
(upstream turtle.py + PyPlay's tkinter stand-in), executed by CPython with a
recording host instead of a browser. Time is virtual so runs are fast and
deterministic.

Usage:
    python3 tools/reference_run.py PROGRAM.py [--stdin FILE] [--events FILE]

--events is a JSON list of host event dicts delivered, in order, whenever the
program waits for events (mainloop/update). When they run out, a waiting
mainloop ends the run.

Output: {"stdout": str, "result": <_pyplay_run result>, "commands": [...]}
"""

import argparse
import io
import json
import sys
import time
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))


class _EventsExhausted(Exception):
    pass


class RecordingHost:
    """Implements the _pyplay_host interface documented in python/tkinter."""

    SCREEN = (1280, 800)

    def __init__(self, events):
        self.commands = []
        self.events = list(events)
        self.clock = 0.0

    # virtual clock -------------------------------------------------------
    def monotonic(self):
        return self.clock

    def sleep(self, ms):
        self.clock += max(0.0, ms) / 1000.0

    # host interface --------------------------------------------------------
    def emit(self, cmd):
        self.commands.append(cmd)

    def flush(self):
        pass

    def wait_event(self, timeout_ms):
        if self.events:
            return self.events.pop(0)
        if timeout_ms is None:
            raise _EventsExhausted()
        self.sleep(timeout_ms)
        return None

    @staticmethod
    def measure_text(text, font):
        return measure_text(text, font)

    def ask_string(self, title, prompt):
        line = sys.stdin.readline()
        return None if line == "" else line.rstrip("\n")

    def screen_size(self):
        return self.SCREEN


def measure_text(text, font):
    """Deterministic text metrics shared with the TS reference measure
    (src/engines/textMetrics.ts). Real engines measure with the browser."""
    size = abs(int(font[1])) if len(font) > 1 else 8
    return (round(len(text) * size * 0.6), round(size * 1.25))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("program")
    ap.add_argument("--stdin")
    ap.add_argument("--events")
    args = ap.parse_args()

    events = json.loads(Path(args.events).read_text()) if args.events else []
    host = RecordingHost(events)
    module = types.ModuleType("_pyplay_host")
    for name in ("emit", "flush", "sleep", "wait_event", "measure_text", "ask_string", "screen_size"):
        setattr(module, name, getattr(host, name))
    sys.modules["_pyplay_host"] = module
    time.monotonic = host.monotonic
    time.sleep = lambda s: host.sleep(s * 1000.0)

    import _pyplay_run

    source = Path(args.program).read_text()
    sys.stdin = io.StringIO(Path(args.stdin).read_text() if args.stdin else "")
    real_stdout = sys.stdout
    captured = io.StringIO()
    sys.stdout = captured
    try:
        try:
            result = _pyplay_run.run(source)
        except _EventsExhausted:
            result = {"status": "ok"}
    finally:
        sys.stdout = real_stdout
    if result.get("status") == "error" and result["error"]["type"] == "_EventsExhausted":
        result = {"status": "ok"}
    json.dump({"stdout": captured.getvalue(), "result": result, "commands": host.commands}, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
