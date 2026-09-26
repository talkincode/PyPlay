/// <reference lib="webworker" />
/**
 * Pyodide worker: owns one CPython interpreter and runs programs on it.
 *
 * Python runs synchronously here. Anything it waits for (input text, UI
 * events, sleep, Stop) arrives through the SharedArrayBuffer channel so the
 * worker can block with Atomics.wait; output goes back with postMessage.
 */
import browserHostPy from "../../../python/_pyplay_browser_host.py?raw";
import pyRun from "../../../python/_pyplay_run.py?raw";
import tkInit from "../../../python/tkinter/__init__.py?raw";
import tkDialog from "../../../python/tkinter/simpledialog.py?raw";
import tkColors from "../../../python/tkinter/tk_colors.json?raw";
import turtlePy from "../../../python/turtle.py?raw";
import type { HostEvent, RunResult } from "../../protocol";
import { tkFontToCss } from "../../render/fonts";
import { ChannelReader } from "../channel";
import { approximateTextSize } from "../textMetrics";
import type { PageToWorker, WorkerToPage } from "./messages";

declare const self: DedicatedWorkerGlobalScope;

const RUNTIME_DIR = "/home/pyodide/pyplay";
const STOP = "__PYPLAY_STOP__";
const STDOUT_FLUSH_BYTES = 8192;

interface PyodideLike {
  FS: { mkdirTree(path: string): void; writeFile(path: string, data: string): void };
  globals: { set(name: string, value: unknown): void; get(name: string): unknown };
  runPython(code: string): unknown;
  registerJsModule(name: string, module: object): void;
  setInterruptBuffer(buf: Uint8Array): void;
  setStdout(opts: { write: (buf: Uint8Array) => number }): void;
  setStderr(opts: { write: (buf: Uint8Array) => number }): void;
}

let pyodide: PyodideLike | null = null;
let channel: ChannelReader | null = null;
let interrupt: Uint8Array | null = null;
let stopRequested = false;
const pendingEvents: HostEvent[] = [];
const pendingInput: Array<string | null> = [];
let stdoutBuffer = "";
const decoder = new TextDecoder();

function post(msg: WorkerToPage): void {
  self.postMessage(msg);
}

function flushStdout(): void {
  if (stdoutBuffer) {
    post({ type: "stdout", text: stdoutBuffer });
    stdoutBuffer = "";
  }
}

/**
 * Move channel messages into the local queues; returns true on Stop.
 *
 * When Stop is seen here, the Python side raises KeyboardInterrupt itself
 * (it receives STOP), so the interrupt buffer is cleared — otherwise Python
 * would raise a second KeyboardInterrupt at its next check.
 */
function absorb(timeoutMs: number | null): boolean {
  if (!channel) throw new Error("worker: channel not initialised");
  const msgs = timeoutMs === 0 ? channel.take() : channel.wait(timeoutMs);
  for (const m of msgs) {
    if (m.k === "stop") stopRequested = true;
    else if (m.k === "event") pendingEvents.push(m.e);
    else pendingInput.push(m.v);
  }
  if (stopRequested && interrupt) interrupt[0] = 0;
  return stopRequested;
}

let measureCtx: OffscreenCanvasRenderingContext2D | null | undefined;

const jsHost = {
  commands(json: string): void {
    post({ type: "commands", cmds: JSON.parse(json) });
  },
  flushStdout,
  sleep(ms: number): string | undefined {
    const deadline = performance.now() + ms;
    for (;;) {
      const remaining = deadline - performance.now();
      if (absorb(Math.max(0, remaining))) return STOP;
      if (remaining <= 0) return undefined;
    }
  },
  waitEvent(timeoutMs: number): string | undefined {
    const deadline = timeoutMs < 0 ? Number.POSITIVE_INFINITY : performance.now() + timeoutMs;
    for (;;) {
      if (stopRequested) return STOP;
      const ev = pendingEvents.shift();
      if (ev) return JSON.stringify(ev);
      const remaining = deadline - performance.now();
      if (remaining <= 0 && timeoutMs >= 0) {
        if (absorb(0)) return STOP;
        const late = pendingEvents.shift();
        return late ? JSON.stringify(late) : undefined;
      }
      if (absorb(Number.isFinite(remaining) ? Math.max(0, remaining) : null)) return STOP;
    }
  },
  readLine(prompt: string): string | undefined {
    return awaitInput({ type: "input", kind: "stdin", prompt });
  },
  askString(title: string, prompt: string): string | undefined {
    return awaitInput({ type: "input", kind: "dialog", prompt, title });
  },
  measureText(text: string, fontJson: string): string {
    if (measureCtx === undefined) {
      measureCtx = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1).getContext("2d") : null;
    }
    const font = JSON.parse(fontJson) as Array<string | number>;
    if (!measureCtx) {
      const [w, h] = approximateTextSize(text, font);
      return `${w},${h}`;
    }
    measureCtx.font = tkFontToCss(font);
    const m = measureCtx.measureText(text);
    return `${m.width},${m.fontBoundingBoxAscent + m.fontBoundingBoxDescent}`;
  },
};

/**
 * Ask the page for a line of text and block until it arrives.
 * Returns STOP on Stop, undefined for "cancelled" (null from the page).
 */
function awaitInput(msg: WorkerToPage): string | undefined {
  flushStdout();
  post(msg);
  for (;;) {
    if (pendingInput.length > 0) {
      const v = pendingInput.shift();
      return v === null || v === undefined ? undefined : v;
    }
    if (absorb(null)) return STOP;
  }
}

async function init(msg: Extract<PageToWorker, { type: "init" }>): Promise<void> {
  channel = new ChannelReader(msg.channel);
  interrupt = new Uint8Array(msg.interrupt);
  const mod = (await import(/* @vite-ignore */ `${msg.pyodideUrl}pyodide.mjs`)) as {
    loadPyodide(opts: { indexURL: string }): Promise<PyodideLike>;
  };
  const py = await mod.loadPyodide({ indexURL: msg.pyodideUrl });
  py.setInterruptBuffer(interrupt);
  const write = (buf: Uint8Array) => {
    stdoutBuffer += decoder.decode(buf, { stream: true });
    if (stdoutBuffer.length >= STDOUT_FLUSH_BYTES) flushStdout();
    return buf.length;
  };
  py.setStdout({ write });
  py.setStderr({ write });
  py.FS.mkdirTree(`${RUNTIME_DIR}/tkinter`);
  py.FS.writeFile(`${RUNTIME_DIR}/turtle.py`, turtlePy);
  py.FS.writeFile(`${RUNTIME_DIR}/_pyplay_run.py`, pyRun);
  py.FS.writeFile(`${RUNTIME_DIR}/_pyplay_browser_host.py`, browserHostPy);
  py.FS.writeFile(`${RUNTIME_DIR}/tkinter/__init__.py`, tkInit);
  py.FS.writeFile(`${RUNTIME_DIR}/tkinter/simpledialog.py`, tkDialog);
  py.FS.writeFile(`${RUNTIME_DIR}/tkinter/tk_colors.json`, tkColors);
  py.registerJsModule("_pyplay_js", jsHost);
  py.runPython(`import sys\nsys.path.insert(0, "${RUNTIME_DIR}")\nimport _pyplay_browser_host, _pyplay_run`);
  pyodide = py;
  post({ type: "ready" });
}

function run(source: string): void {
  const py = pyodide;
  if (!py || !interrupt) throw new Error("worker: run before init");
  // leftovers from a previous run (a late Stop, stray events) must not leak
  channel?.take();
  pendingEvents.length = 0;
  pendingInput.length = 0;
  stopRequested = false;
  interrupt[0] = 0;
  py.globals.set("_pyplay_source", source);
  const json = py.runPython(
    "import json as _j, _pyplay_run as _r\n_j.dumps(_r.run(_pyplay_source))",
  ) as string;
  flushStdout();
  post({ type: "done", result: JSON.parse(json) as RunResult });
}

self.onmessage = (e: MessageEvent<PageToWorker>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      init(msg).catch((err: unknown) => post({ type: "fatal", message: String(err) }));
    } else if (msg.type === "run") {
      run(msg.source);
    }
  } catch (err) {
    post({ type: "fatal", message: String(err) });
  }
};
