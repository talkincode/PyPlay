import type { HostEvent, RunResult } from "../../protocol";
import { tkFontToCss } from "../../render/fonts";
import { type Engine, EngineFallback, type RunCallbacks, type RunOptions } from "../engine";
import { Unsupported } from "./errors";
import { FastProgram, type Step } from "./program";
import type { Resume } from "./values";

/** Longest a slice of Python may hold the main thread before yielding to the page. */
const SLICE_MS = 12;

interface Active {
  program: FastProgram;
  cb: RunCallbacks;
  resolve(r: RunResult): void;
  reject(e: unknown): void;
  events: HostEvent[];
  /** What the program is blocked on, if anything ("slice": yielded to the page). */
  waiting: "input" | "event" | "sleep" | "slice" | null;
  timer: ReturnType<typeof setTimeout> | undefined;
  stopRequests: number;
  stepDelayMs: number;
}

/**
 * The fast engine: PyPlay's own interpreter for a CPython-exact subset,
 * running on the main thread in time slices. Starts instantly, needs no
 * cross-origin isolation, and can step line by line.
 */
export class FastEngine implements Engine {
  readonly id = "fast" as const;
  private active: Active | null = null;
  private readonly channel = new MessageChannel();
  private measureCtx: CanvasRenderingContext2D | null = null;

  constructor() {
    this.channel.port1.onmessage = () => this.pump();
  }

  ready(): Promise<void> {
    return Promise.resolve();
  }

  run(source: string, cb: RunCallbacks, options: RunOptions = {}): Promise<RunResult> {
    if (this.active) return Promise.reject(new Error("FastEngine: a program is already running"));
    let program: FastProgram;
    try {
      program = new FastProgram(source, {
        stdout: (t) => cb.stdout(t),
        commands: (c) => cb.commands(c),
        measureText: (text, font) => this.measure(text, font),
        now: () => performance.now(),
      });
    } catch (e) {
      if (e instanceof Unsupported) return Promise.reject(new EngineFallback(e.feature));
      return Promise.reject(e);
    }
    const stepDelayMs = options.stepDelayMs ?? 0;
    program.stepping = stepDelayMs > 0;
    return new Promise<RunResult>((resolve, reject) => {
      this.active = {
        program,
        cb,
        resolve,
        reject,
        events: [],
        waiting: null,
        timer: undefined,
        stopRequests: 0,
        stepDelayMs,
      };
      this.advance(program.resume());
    });
  }

  provideInput(value: string | null): void {
    const a = this.active;
    if (a?.waiting !== "input") return;
    a.waiting = null;
    this.advance(a.program.resume(value));
  }

  sendEvent(ev: HostEvent): void {
    const a = this.active;
    if (!a) return;
    if (a.waiting === "event") {
      clearTimeout(a.timer);
      a.waiting = null;
      this.advance(a.program.resume(ev));
      return;
    }
    a.events.push(ev);
  }

  stop(): void {
    const a = this.active;
    if (!a) return;
    a.stopRequests++;
    if (a.stopRequests > 1) {
      // the program swallowed KeyboardInterrupt (bare except): abandon it
      this.finish({ status: "stopped" });
      return;
    }
    clearTimeout(a.timer);
    a.waiting = null;
    a.program.flushCommands();
    this.advance(a.program.interrupt());
  }

  /** End the current run immediately, without giving the program a KeyboardInterrupt. */
  abort(): void {
    if (this.active) this.finish({ status: "stopped" });
  }

  /** Resume after a zero-length pause (time slicing), via MessageChannel to avoid timer clamping. */
  private resumeSoon: Resume | undefined;
  private yieldToPage(a: Active, value: Resume): void {
    a.program.flushCommands();
    a.waiting = "slice";
    this.resumeSoon = value;
    this.channel.port2.postMessage(null);
  }
  private pump(): void {
    const a = this.active;
    // Stop (or anything else) may have taken over since the slice yielded.
    if (a?.waiting !== "slice") return;
    a.waiting = null;
    this.advance(a.program.resume(this.resumeSoon));
  }

  private advance(first: Step): void {
    const a = this.active;
    if (!a) return;
    const sliceStart = performance.now();
    let step = first;
    for (;;) {
      if (this.active !== a) return;
      if (step.kind === "done") {
        this.finish(step.result);
        return;
      }
      if (step.kind === "unsupported") {
        this.active = null;
        a.reject(new EngineFallback(step.feature));
        return;
      }
      const req = step.request;
      switch (req.kind) {
        case "tick":
          if (a.stepDelayMs > 0) {
            a.program.flushCommands();
            a.cb.line?.(a.program.currentLine);
            this.wait(a, "sleep", a.stepDelayMs, undefined);
            return;
          }
          if (performance.now() - sliceStart > SLICE_MS) {
            this.yieldToPage(a, undefined);
            return;
          }
          step = a.program.resume();
          continue;
        case "sleep":
          a.program.flushCommands();
          this.wait(a, "sleep", req.ms, undefined);
          return;
        case "input":
          a.program.flushCommands();
          a.waiting = "input";
          a.cb.requestInput({ kind: "stdin", prompt: req.prompt });
          return;
        case "dialog":
          a.program.flushCommands();
          a.waiting = "input";
          a.cb.requestInput({ kind: "dialog", prompt: req.prompt, title: req.title });
          return;
        case "event": {
          const ev = a.events.shift();
          if (ev) {
            step = a.program.resume(ev);
            continue;
          }
          if (req.timeoutMs === 0) {
            if (performance.now() - sliceStart > SLICE_MS) {
              this.yieldToPage(a, null);
              return;
            }
            step = a.program.resume(null);
            continue;
          }
          a.program.flushCommands();
          a.waiting = "event";
          if (req.timeoutMs !== null) {
            a.timer = setTimeout(() => {
              if (this.active !== a || a.waiting !== "event") return;
              a.waiting = null;
              this.advance(a.program.resume(null));
            }, req.timeoutMs);
          }
          return;
        }
      }
    }
  }

  private wait(a: Active, kind: "sleep", ms: number, value: Resume): void {
    a.waiting = kind;
    a.timer = setTimeout(
      () => {
        if (this.active !== a || a.waiting !== kind) return;
        a.waiting = null;
        this.advance(a.program.resume(value));
      },
      Math.max(0, ms),
    );
  }

  private finish(result: RunResult): void {
    const a = this.active;
    if (!a) return;
    clearTimeout(a.timer);
    this.active = null;
    a.program.flushCommands();
    a.resolve(result);
  }

  private measure(text: string, font: Array<string | number>): [number, number] {
    if (!this.measureCtx) this.measureCtx = document.createElement("canvas").getContext("2d");
    const ctx = this.measureCtx;
    if (!ctx) return [text.length * 8, 12];
    ctx.font = tkFontToCss(font);
    const m = ctx.measureText(text);
    return [m.width, m.fontBoundingBoxAscent + m.fontBoundingBoxDescent];
  }
}
