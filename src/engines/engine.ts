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
}

/**
 * A Python engine. One program runs at a time; run() resolves when it ends
 * (normally, with an error, or because stop() was called).
 */
export interface Engine {
  readonly id: EngineId;
  /** Resolves when the engine can start a run (loads lazily on first call). */
  ready(): Promise<void>;
  run(source: string, cb: RunCallbacks): Promise<RunResult>;
  provideInput(value: string | null): void;
  sendEvent(ev: HostEvent): void;
  stop(): void;
}
