import type { CanvasCommand, EngineId, HostEvent, RunResult } from "../protocol";

/** What a running program asks of the page. */
export interface RunCallbacks {
  /** Text the program printed (not necessarily ending in a newline). */
  stdout(text: string): void;
  /** Drawing commands, in order. */
  commands(cmds: CanvasCommand[]): void;
  /**
   * The program is blocked waiting for text: `input()` ("stdin") or
   * turtle.textinput()/numinput() ("dialog"). Answer with provideInput().
   */
  requestInput(req: { kind: "stdin" | "dialog"; prompt: string; title?: string }): void;
  /** Line about to execute (only engines that support stepping call this). */
  line?(line: number): void;
  /** Names visible at that line, while stepping. */
  bindings?(vars: { name: string; value: string }[]): void;
}

export interface RunOptions {
  /** Pause this long before every statement and report its line (fast engine only). */
  stepDelayMs?: number;
}

/**
 * Thrown (as a rejected run) when the fast engine meets something outside
 * its subset; the caller re-runs the program on full Python.
 */
export class EngineFallback extends Error {
  constructor(readonly feature: string) {
    super(`fast engine cannot run this program: ${feature}`);
  }
}

/**
 * A Python engine. One program runs at a time; run() resolves when it ends
 * (normally, with an error, or because stop() was called).
 */
export interface Engine {
  readonly id: EngineId;
  /** Resolves when the engine can start a run (loads lazily on first call). */
  ready(): Promise<void>;
  run(source: string, cb: RunCallbacks, options?: RunOptions): Promise<RunResult>;
  provideInput(value: string | null): void;
  sendEvent(ev: HostEvent): void;
  stop(): void;
}
