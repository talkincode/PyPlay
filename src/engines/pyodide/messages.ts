import type { CanvasCommand, RunResult } from "../../protocol";

/** postMessage traffic between PyodideEngine (page) and the worker. */
export type PageToWorker =
  | { type: "init"; channel: SharedArrayBuffer; interrupt: SharedArrayBuffer; pyodideUrl: string }
  | { type: "run"; source: string };

export type WorkerToPage =
  | { type: "ready" }
  | { type: "fatal"; message: string }
  | { type: "stdout"; text: string }
  | { type: "commands"; cmds: CanvasCommand[] }
  | { type: "input"; kind: "stdin" | "dialog"; prompt: string; title?: string }
  | { type: "done"; result: RunResult };
