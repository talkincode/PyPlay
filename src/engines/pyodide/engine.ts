import type { HostEvent, RunResult } from "../../protocol";
import { ChannelWriter, createChannelBuffer } from "../channel";
import type { Engine, RunCallbacks } from "../engine";
import type { PageToWorker, WorkerToPage } from "./messages";

/** Where prepare-runtime.mjs puts the (trimmed) Pyodide distribution. */
export const PYODIDE_VERSION = "314.0.7";
export const PYODIDE_URL = `/pyodide/${PYODIDE_VERSION}/`;

/** How long Stop waits for Python to honour KeyboardInterrupt before the
 * worker is killed and a fresh one is started. */
const HARD_STOP_MS = 2000;

interface ActiveRun {
  cb: RunCallbacks;
  resolve(result: RunResult): void;
}

/**
 * The "full Python" engine: real CPython (Pyodide) in a Web Worker.
 * Requires cross-origin isolation (SharedArrayBuffer).
 */
export class PyodideEngine implements Engine {
  readonly id = "python" as const;
  private worker: Worker | null = null;
  private writer: ChannelWriter | null = null;
  private interrupt: Uint8Array | null = null;
  private readyPromise: Promise<void> | null = null;
  private active: ActiveRun | null = null;
  private hardStopTimer: ReturnType<typeof setTimeout> | undefined;

  static supported(): boolean {
    return typeof SharedArrayBuffer !== "undefined" && globalThis.crossOriginIsolated === true;
  }

  ready(): Promise<void> {
    if (!this.readyPromise) this.readyPromise = this.start();
    return this.readyPromise;
  }

  private start(): Promise<void> {
    if (!PyodideEngine.supported()) {
      return Promise.reject(
        new Error("完整 Python 需要跨源隔离 (crossOriginIsolated)；请在新窗口中直接打开 PyPlay。"),
      );
    }
    const channel = createChannelBuffer();
    const interrupt = new SharedArrayBuffer(1);
    this.writer = new ChannelWriter(channel);
    this.interrupt = new Uint8Array(interrupt);
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker = worker;
    return new Promise<void>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerToPage>) => {
        const msg = e.data;
        if (msg.type === "ready") resolve();
        else if (msg.type === "fatal" && !this.active) reject(new Error(msg.message));
        else this.handle(msg);
      };
      worker.onerror = (e) => reject(new Error(e.message || "Pyodide worker failed to start"));
      const init: PageToWorker = {
        type: "init",
        channel,
        interrupt,
        pyodideUrl: new URL(PYODIDE_URL, location.href).href,
      };
      worker.postMessage(init);
    });
  }

  private handle(msg: WorkerToPage): void {
    const run = this.active;
    if (!run) return;
    switch (msg.type) {
      case "stdout":
        run.cb.stdout(msg.text);
        return;
      case "commands":
        run.cb.commands(msg.cmds);
        return;
      case "input":
        run.cb.requestInput(msg.title === undefined ? { kind: msg.kind, prompt: msg.prompt } : msg);
        return;
      case "done":
        this.finish(msg.result);
        return;
      case "fatal":
        this.finish({
          status: "error",
          error: { type: "PyPlayError", message: msg.message, line: null, traceback: msg.message },
        });
        return;
      case "ready":
        return;
    }
  }

  private finish(result: RunResult): void {
    clearTimeout(this.hardStopTimer);
    const run = this.active;
    this.active = null;
    run?.resolve(result);
  }

  async run(source: string, cb: RunCallbacks): Promise<RunResult> {
    await this.ready();
    if (this.active) throw new Error("PyodideEngine: a program is already running");
    return new Promise<RunResult>((resolve) => {
      this.active = { cb, resolve };
      this.worker?.postMessage({ type: "run", source } satisfies PageToWorker);
    });
  }

  provideInput(value: string | null): void {
    this.writer?.send({ k: "input", v: value });
  }

  sendEvent(ev: HostEvent): void {
    this.writer?.send({ k: "event", e: ev });
  }

  stop(): void {
    if (!this.active) return;
    if (this.interrupt) this.interrupt[0] = 2; // SIGINT → KeyboardInterrupt
    this.writer?.send({ k: "stop" });
    clearTimeout(this.hardStopTimer);
    this.hardStopTimer = setTimeout(() => this.killAndRestart(), HARD_STOP_MS);
  }

  /** Python ignored Stop (e.g. stuck in C code): replace the worker. */
  private killAndRestart(): void {
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    this.finish({ status: "stopped" });
    void this.ready().catch(() => undefined);
  }
}
