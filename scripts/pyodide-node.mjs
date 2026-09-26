/**
 * Boot Pyodide in Node with PyPlay's Python runtime installed and a silent
 * _pyplay_host stub. Shared by the generator scripts so they all see the
 * exact interpreter and runtime the browser runs.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
export const PYODIDE_DIR = dirname(require.resolve("pyodide/package.json"));
export const RUNTIME_DIR = "/home/pyodide/pyplay";

const RUNTIME_FILES = [
  "turtle.py",
  "_pyplay_run.py",
  "tkinter/__init__.py",
  "tkinter/simpledialog.py",
  "tkinter/tk_colors.json",
];

const HOST_STUB = `
import sys, types
h = types.ModuleType("_pyplay_host")
h.emit = lambda cmd: None
h.flush = lambda: None
h.sleep = lambda ms: None
def _wait(timeout):
    if timeout is None:
        raise KeyboardInterrupt  # waiting forever with nothing to do: behave like Stop
    return None
h.wait_event = _wait
h.measure_text = lambda text, font: (len(text) * 8, 12)
h.ask_string = lambda title, prompt: None
h.screen_size = lambda: (1280, 800)
sys.modules["_pyplay_host"] = h
sys.path.insert(0, "${RUNTIME_DIR}")
`;

export async function bootPyodideWithRuntime(options = {}) {
  const { loadPyodide } = await import("pyodide");
  const py = await loadPyodide({ indexURL: `${PYODIDE_DIR}/`, ...options });
  py.FS.mkdirTree(`${RUNTIME_DIR}/tkinter`);
  for (const f of RUNTIME_FILES)
    py.FS.writeFile(`${RUNTIME_DIR}/${f}`, readFileSync(join(ROOT, "python", f)));
  py.setStdout({ batched: () => {} });
  py.setStderr({ batched: () => {} });
  py.runPython(HOST_STUB);
  return py;
}
