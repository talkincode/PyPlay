"""PyPlay's stand-in for tkinter.

Pyodide has no Tcl/Tk. CPython's turtle.py only needs a small slice of
tkinter: one Canvas plus the Tk/Frame/Scrollbar scaffolding around it. This
module implements exactly that slice and turns every canvas mutation into a
drawing command (see docs/protocol.md) that the browser renders.

It never draws anything itself. All I/O goes through the ``_pyplay_host``
module, which the environment must provide before this package is imported:

* in the browser, the Pyodide worker installs a host backed by JavaScript;
* in tests, tools/reference_run.py installs a recording host on CPython.

Host interface (all functions are synchronous):
    emit(cmd: dict) -> None          queue one drawing command
    flush() -> None                  deliver queued commands to the renderer
    sleep(ms: float) -> None         block; may raise KeyboardInterrupt
    wait_event(timeout_ms) -> dict | None
                                     block until a UI event or timeout
                                     (None = wait forever); may raise
                                     KeyboardInterrupt
    measure_text(text, font) -> (width, height)
    ask_string(title, prompt) -> str | None
    screen_size() -> (width, height)

Anything turtle.py might call that PyPlay does not support raises TclError
with a message naming the missing feature, never a silent no-op.
"""

import heapq
import json
import time
from pathlib import Path

import _pyplay_host as _host

TkVersion = 8.6
TclVersion = 8.6

# Constants referenced by turtle.py
SUNKEN = "sunken"
ROUND = "round"
HORIZONTAL = "horizontal"
VERTICAL = "vertical"
BOTH = "both"
YES = True
NO = False


class TclError(Exception):
    pass


_COLORS = json.loads((Path(__file__).parent / "tk_colors.json").read_text())


def _parse_color(spec):
    """Return (r, g, b) in 0..65535 like Tk's winfo_rgb, or raise TclError."""
    if not isinstance(spec, str) or not spec:
        raise TclError(f'unknown color name "{spec}"')
    if spec[0] == "#":
        digits = spec[1:]
        try:
            value = int(digits, 16)
        except ValueError:
            raise TclError(f'invalid color name "{spec}"') from None
        n = len(digits)
        if n == 3:
            return tuple(((value >> s) & 0xF) * 0x1111 for s in (8, 4, 0))
        if n == 6:
            return tuple(((value >> s) & 0xFF) * 0x101 for s in (16, 8, 0))
        if n == 9:
            return tuple((((value >> s) & 0xFFF) << 4) | (((value >> s) & 0xFFF) >> 8) for s in (24, 12, 0))
        if n == 12:
            return tuple((value >> s) & 0xFFFF for s in (32, 16, 0))
        raise TclError(f'invalid color name "{spec}"')
    rgb = _COLORS.get(spec.lower())
    if rgb is None:
        raise TclError(f'unknown color name "{spec}"')
    return tuple(c * 0x101 for c in rgb)


# ---------------------------------------------------------------------------
# Event loop: key/mouse bindings, timers, mainloop.
# ---------------------------------------------------------------------------


class Event:
    """The subset of a Tk event object that turtle.py reads."""

    def __init__(self, x=0, y=0, char="", keysym="", num=0):
        self.x = x
        self.y = y
        self.char = char
        self.keysym = keysym
        self.num = num


class _Loop:
    """Owns every binding and timer. There is exactly one per run."""

    def __init__(self):
        self.timers = []  # heap of (due_monotonic_s, seq, fn)
        self.timer_seq = 0
        self.canvas = None
        self.destroyed = False

    def add_timer(self, ms, fn):
        self.timer_seq += 1
        heapq.heappush(self.timers, (time.monotonic() + ms / 1000.0, self.timer_seq, fn))
        return f"after#{self.timer_seq}"

    def cancel_timer(self, ident):
        seq = int(str(ident).split("#")[-1])
        self.timers = [t for t in self.timers if t[1] != seq]
        heapq.heapify(self.timers)

    def has_work(self):
        if self.destroyed:
            return False
        if self.timers:
            return True
        cv = self.canvas
        return cv is not None and (bool(cv._bindings) or any(cv._tag_bindings.values()))

    def run_due_timers(self):
        now = time.monotonic()
        while self.timers and self.timers[0][0] <= now and not self.destroyed:
            _, _, fn = heapq.heappop(self.timers)
            fn()

    def dispatch(self, ev):
        if self.canvas is not None and not self.destroyed:
            self.canvas._dispatch(ev)

    def pump(self):
        """Handle everything already pending without blocking (Tk update())."""
        _host.flush()
        while True:
            ev = _host.wait_event(0)
            if ev is None:
                break
            self.dispatch(ev)
        self.run_due_timers()

    def mainloop(self):
        _host.flush()
        while self.has_work():
            self.run_due_timers()
            if not self.has_work():
                break
            timeout = None
            if self.timers:
                timeout = max(0.0, (self.timers[0][0] - time.monotonic()) * 1000.0)
            _host.flush()
            ev = _host.wait_event(timeout)
            if ev is not None:
                self.dispatch(ev)
        _host.flush()


_loop = _Loop()


def mainloop(n=0):
    _loop.mainloop()


# ---------------------------------------------------------------------------
# Widgets
# ---------------------------------------------------------------------------


class Misc:
    """Behaviour shared by every fake widget."""

    def __init__(self, master=None, **kw):
        self.master = master
        self._options = dict(kw)

    # geometry managers and layout: the browser owns layout, so these only
    # record state
    def pack(self, *a, **kw):
        pass

    def grid(self, *a, **kw):
        pass

    def grid_forget(self):
        pass

    def rowconfigure(self, *a, **kw):
        pass

    def columnconfigure(self, *a, **kw):
        pass

    def focus_force(self):
        pass

    def focus_set(self):
        pass

    def winfo_toplevel(self):
        w = self
        while w.master is not None:
            w = w.master
        return w

    def winfo_rgb(self, color):
        return _parse_color(color)

    def winfo_screenwidth(self):
        return _host.screen_size()[0]

    def winfo_screenheight(self):
        return _host.screen_size()[1]

    # The browser sizes everything to the toplevel window, like a packed
    # Tk frame that fills its root; before geometry() is set Tk reports 1.
    def winfo_width(self):
        return int(self.winfo_toplevel()._options.get("_geometry_width", 1))

    def winfo_height(self):
        return int(self.winfo_toplevel()._options.get("_geometry_height", 1))

    def config(self, cnf=None, **kw):
        if cnf:
            kw.update(cnf)
        self._options.update(kw)

    configure = config

    def cget(self, key):
        return self._options.get(key, "")

    def __getitem__(self, key):
        return self.cget(key)

    def __setitem__(self, key, value):
        self.config(**{key: value})

    def bind(self, sequence=None, func=None, add=None):
        pass

    def unbind(self, sequence, funcid=None):
        pass

    def after(self, ms, func=None, *args):
        if func is None:
            _host.flush()
            _host.sleep(ms)
            return None
        return _loop.add_timer(ms, (lambda: func(*args)) if args else func)

    def after_idle(self, func, *args):
        return self.after(0, func, *args)

    def after_cancel(self, ident):
        _loop.cancel_timer(ident)

    def update(self):
        _loop.pump()

    def update_idletasks(self):
        _host.flush()

    def call(self, *args):
        # turtle.py uses this only for macOS window stacking; nothing to do.
        return ""

    def destroy(self):
        pass


class _TkApp:
    """Stands in for the Tcl interpreter object at ``widget.tk``."""

    def mainloop(self, n=0):
        _loop.mainloop()


class Tk(Misc):
    def __init__(self, *a, **kw):
        super().__init__(None)
        self.tk = _TkApp()
        self._protocols = {}
        _loop.destroyed = False

    def title(self, string=None):
        if string is not None:
            _host.emit({"op": "title", "text": str(string)})

    wm_title = title

    def geometry(self, spec=None):
        if spec is None:
            return ""
        size = spec.split("+")[0].split("-")[0]
        w, h = (int(float(v)) for v in size.split("x"))
        self._options["_geometry_width"], self._options["_geometry_height"] = w, h
        _host.emit({"op": "window", "width": w, "height": h})
        return ""

    wm_geometry = geometry

    def protocol(self, name=None, func=None):
        self._protocols[name] = func

    wm_protocol = protocol

    def destroy(self):
        _loop.destroyed = True
        _loop.timers.clear()
        _host.flush()

    def mainloop(self, n=0):
        _loop.mainloop()


class Frame(Misc):
    def __init__(self, master=None, cnf=None, **kw):
        super().__init__(master, **kw)
        self.tk = getattr(master, "tk", _TkApp())


class Scrollbar(Misc):
    def set(self, *args):
        pass


class PhotoImage:
    """Only blank images are supported (turtle uses one for 'blank' shapes
    and the empty background picture). Loading files is not supported."""

    def __init__(self, name=None, cnf=None, master=None, width=0, height=0, file=None, data=None, **kw):
        if file is not None or data is not None:
            raise TclError("PyPlay 暂不支持加载图片文件 (image files are not supported)")
        self.width_, self.height_ = width, height

    def blank(self):
        pass

    def width(self):
        return self.width_

    def height(self):
        return self.height_


_MISSING = object()


def _flatten_coords(args):
    out = []
    for a in args:
        if isinstance(a, (list, tuple)):
            out.extend(_flatten_coords(a))
        else:
            out.append(float(a))
    return out


def _clean_opts(kw):
    opts = {}
    for k, v in kw.items():
        if k == "font":
            v = list(v) if isinstance(v, (list, tuple)) else [str(v)]
        elif k == "image":
            v = "" if v is None or isinstance(v, PhotoImage) else str(v)
        opts[k] = v
    return opts


class Canvas(Misc):
    """A retained-mode canvas mirror.

    Items live here (so turtle.py can read coords back, and clicks can be
    hit-tested) and every change is also emitted as a drawing command.
    """

    def __init__(self, master=None, cnf=None, **kw):
        super().__init__(master, **kw)
        self.tk = getattr(master, "tk", _TkApp())
        self._items = {}  # id -> {"kind", "coords", "opts"}
        self._order = []  # z-order, bottom first
        self._next_id = 1
        self._bindings = {}  # sequence -> func
        self._tag_bindings = {}  # item id -> {sequence: func}
        _loop.canvas = self
        if "bg" in kw:
            _host.emit({"op": "bg", "color": kw["bg"]})

    # -- configuration ----------------------------------------------------
    def config(self, cnf=None, **kw):
        if cnf:
            kw.update(cnf)
        if kw.get("bg"):
            _parse_color(kw["bg"])
            _host.emit({"op": "bg", "color": kw["bg"]})
        if "scrollregion" in kw:
            _host.emit({"op": "scrollregion", "region": [float(v) for v in kw["scrollregion"]]})
        self._options.update({k: v for k, v in kw.items() if v is not None})

    configure = config

    # -- scrolling: the browser always centres the scroll region ----------
    def xview(self, *a):
        return (0.0, 1.0)

    def yview(self, *a):
        return (0.0, 1.0)

    def xview_moveto(self, fraction):
        pass

    def yview_moveto(self, fraction):
        pass

    def canvasx(self, screenx, gridspacing=None):
        return float(screenx)

    def canvasy(self, screeny, gridspacing=None):
        return float(screeny)

    # -- items ------------------------------------------------------------
    def _create(self, kind, args, kw):
        item = self._next_id
        self._next_id += 1
        coords = _flatten_coords(args)
        opts = _clean_opts(kw)
        self._items[item] = {"kind": kind, "coords": coords, "opts": opts}
        self._order.append(item)
        # emit copies: the mirror's own dicts/lists keep changing afterwards
        _host.emit({"op": "create", "id": item, "kind": kind, "coords": list(coords), "opts": dict(opts)})
        return item

    def create_line(self, *args, **kw):
        return self._create("line", args, kw)

    def create_polygon(self, *args, **kw):
        return self._create("polygon", args, kw)

    def create_text(self, *args, **kw):
        return self._create("text", args, kw)

    def create_image(self, *args, **kw):
        return self._create("image", args, kw)

    def _get(self, item):
        if item not in self._items:
            raise TclError(f'invalid canvas item "{item}"')
        return self._items[item]

    def coords(self, item, *args):
        it = self._get(item)
        if not args:
            return list(it["coords"])
        coords = _flatten_coords(args)
        if coords != it["coords"]:
            it["coords"] = coords
            _host.emit({"op": "coords", "id": item, "coords": list(coords)})
        return None

    def itemconfigure(self, item, cnf=None, **kw):
        if cnf:
            kw.update(cnf)
        it = self._get(item)
        # turtle.py re-applies the same options on every animation frame;
        # only real changes become commands.
        changed = {k: v for k, v in _clean_opts(kw).items() if it["opts"].get(k, _MISSING) != v}
        if changed:
            it["opts"].update(changed)
            _host.emit({"op": "config", "id": item, "opts": dict(changed)})

    itemconfig = itemconfigure

    def itemcget(self, item, option):
        return self._get(item)["opts"].get(option, "")

    def type(self, item):
        return self._get(item)["kind"]

    def find_all(self):
        return tuple(self._order)

    def tag_raise(self, item, above=None):
        self._get(item)
        if self._order[-1] == item:
            return
        self._order.remove(item)
        self._order.append(item)
        _host.emit({"op": "raise", "id": item})

    def tag_lower(self, item, below=None):
        self._get(item)
        self._order.remove(item)
        self._order.insert(0, item)
        _host.emit({"op": "lower", "id": item})

    def delete(self, *items):
        for item in items:
            if item == "all":
                self._items.clear()
                self._order.clear()
                self._tag_bindings.clear()
                _host.emit({"op": "delete", "id": "all"})
            elif item in self._items:
                del self._items[item]
                self._order.remove(item)
                self._tag_bindings.pop(item, None)
                _host.emit({"op": "delete", "id": item})

    def bbox(self, *items):
        xs, ys = [], []
        for item in items:
            it = self._get(item)
            if it["kind"] == "text":
                x0, y0, x1, y1 = self._text_bbox(it)
                xs += [x0, x1]
                ys += [y0, y1]
            else:
                c = it["coords"]
                xs += c[0::2]
                ys += c[1::2]
        if not xs:
            return None
        return (int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys)))

    def _text_bbox(self, it):
        x, y = it["coords"][0], it["coords"][1]
        font = it["opts"].get("font", ["Arial", 8, "normal"])
        w, h = _host.measure_text(str(it["opts"].get("text", "")), list(font))
        anchor = it["opts"].get("anchor", "center")
        x0 = {"sw": x, "nw": x, "w": x, "se": x - w, "ne": x - w, "e": x - w}.get(anchor, x - w / 2)
        y0 = {"sw": y - h, "s": y - h, "se": y - h, "nw": y, "n": y, "ne": y}.get(anchor, y - h / 2)
        return (x0, y0, x0 + w, y0 + h)

    def postscript(self, **kw):
        raise TclError("PyPlay 不支持 getcanvas().postscript()，请使用页面上的“保存图片”按钮")

    def reset(self, canvwidth=None, canvheight=None, bg=None):
        if bg:
            self.config(bg=bg)

    # -- events -----------------------------------------------------------
    def bind(self, sequence=None, func=None, add=None):
        if func is None:
            self._bindings.pop(sequence, None)
        else:
            self._bindings[sequence] = func

    def unbind(self, sequence, funcid=None):
        self._bindings.pop(sequence, None)

    def tag_bind(self, item, sequence=None, func=None, add=None):
        if func is None:
            self._tag_bindings.get(item, {}).pop(sequence, None)
        else:
            self._tag_bindings.setdefault(item, {})[sequence] = func

    def tag_unbind(self, item, sequence, funcid=None):
        self._tag_bindings.get(item, {}).pop(sequence, None)

    def _hit(self, x, y):
        """Topmost item under (x, y) that has tag bindings."""
        for item in reversed(self._order):
            if item not in self._tag_bindings:
                continue
            it = self._items[item]
            if it["kind"] == "polygon" and _point_in_polygon(x, y, it["coords"]):
                return item
        return None

    def _dispatch(self, ev):
        """Translate a host event dict into Tk binding sequences and call them.

        Event dicts (produced by the renderer):
          {"type": "key", "press": bool, "keysym": str, "char": str}
          {"type": "button", "press": bool, "num": int, "x": float, "y": float}
          {"type": "motion", "num": int, "x": float, "y": float}
        """
        kind = ev.get("type")
        if kind == "key":
            e = Event(char=ev.get("char", ""), keysym=ev.get("keysym", ""))
            if ev.get("press", True):
                seqs = [f"<KeyPress-{e.keysym}>", "<KeyPress>"]
            else:
                seqs = [f"<KeyRelease-{e.keysym}>"]
            for seq in seqs:
                fn = self._bindings.get(seq)
                if fn is not None:
                    fn(e)
                    break
            return
        if kind in ("button", "motion"):
            num = int(ev.get("num", 1))
            e = Event(x=float(ev.get("x", 0)), y=float(ev.get("y", 0)), num=num)
            if kind == "motion":
                seq = f"<Button{num}-Motion>"
            elif ev.get("press", True):
                seq = f"<Button-{num}>"
            else:
                seq = f"<Button{num}-ButtonRelease>"
            item = self._hit(e.x, e.y)
            if item is not None:
                fn = self._tag_bindings[item].get(seq)
                if fn is not None:
                    fn(e)
            fn = self._bindings.get(seq)
            if fn is not None:
                fn(e)
            return
        raise TclError(f"unknown event type {kind!r}")


def _point_in_polygon(x, y, coords):
    pts = list(zip(coords[0::2], coords[1::2]))
    inside = False
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xi = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xi:
                inside = not inside
    return inside
