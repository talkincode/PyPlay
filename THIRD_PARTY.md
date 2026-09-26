# Third-party code in PyPlay

| Component | Where | License |
| --- | --- | --- |
| CPython `Lib/turtle.py` (3.14.5), unmodified | `python/turtle.py` | Python Software Foundation License v2 — https://docs.python.org/3/license.html |
| Tcl/Tk `xlib/xcolors.c` (color table source) | `data/tk/xcolors.c`, generated `python/tkinter/tk_colors.json` | Tcl/Tk license (BSD-style) — https://www.tcl.tk/software/tcltk/license.html |
| Pyodide 314.0.7 (shipped from `node_modules` at build time) | `public/pyodide/` (not committed) | Mozilla Public License 2.0 — https://github.com/pyodide/pyodide |
| CPython standard library (subset, inside Pyodide's `python_stdlib.zip`) | `public/pyodide/` (not committed) | Python Software Foundation License v2 |
| CodeMirror 6 | npm dependency | MIT |

PyPlay's `src/engines/fast/modules/turtle.ts` and `src/engines/fast/suggestions.ts` are
TypeScript ports of logic from CPython's `turtle.py` and `traceback.py` (PSF License v2).
