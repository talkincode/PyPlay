/**
 * One fast-engine run, independent of how it is driven.
 *
 * FastProgram turns source code into a resumable computation: resume()
 * advances until the program needs something from outside (a Suspend) or
 * ends. The browser engine drives it with real timers and UI; the
 * conformance suite drives it with virtual time.
 */
import type { CanvasCommand, PyError, RunResult } from "../../protocol";
import { installBuiltins } from "./builtins";
import { EXC, PyException, Unsupported } from "./errors";
import { Interpreter } from "./interpreter";
import { createMathModule } from "./modules/math";
import { createRandomModule } from "./modules/random";
import { createTimeModule } from "./modules/time";
import { createTurtleModule, type TurtleHost } from "./modules/turtle";
import { parse } from "./parser";
import type { Gen, PyModule, Resume, Suspend } from "./values";

export type Step =
  | { kind: "suspend"; request: Suspend }
  | { kind: "done"; result: RunResult }
  | { kind: "unsupported"; feature: string };

export interface ProgramIO {
  stdout(text: string): void;
  commands(cmds: CanvasCommand[]): void;
  measureText(text: string, font: Array<string | number>): [number, number];
  /** Monotonic clock in ms (the conformance suite uses virtual time). */
  now(): number;
}

export class FastProgram {
  readonly interp: Interpreter;
  private readonly gen: Gen<void>;
  private pending: CanvasCommand[] = [];
  private finished = false;

  constructor(
    source: string,
    private readonly io: ProgramIO,
  ) {
    const program = parse(source); // throws Unsupported for anything outside the subset
    const modules = new Map<string, PyModule>();
    const turtleHost: TurtleHost = {
      emit: (cmd) => this.pending.push(cmd),
      measureText: (text, font) => io.measureText(text, font),
      now: () => io.now(),
    };
    const factories: Record<string, () => PyModule> = {
      math: () => createMathModule(this.interp),
      random: () => createRandomModule(this.interp),
      time: () => createTimeModule(),
      turtle: () => createTurtleModule(this.interp, turtleHost),
    };
    this.interp = new Interpreter({
      write: (text) => {
        this.flushCommands();
        io.stdout(text);
      },
      importModule: (name) => {
        let mod = modules.get(name);
        if (!mod) {
          const make = factories[name];
          // One rule: any other module is full Python's business (it knows
          // exactly which modules exist and how import errors read).
          if (!make) throw new Unsupported(`import ${name}`);
          mod = make();
          modules.set(name, mod);
        }
        return mod;
      },
    });
    installBuiltins(this.interp);
    this.gen = this.interp.run(program);
  }

  /** Deliver queued drawing commands to the page. */
  flushCommands(): void {
    if (this.pending.length) {
      const cmds = this.pending;
      this.pending = [];
      this.io.commands(cmds);
    }
  }

  get currentLine(): number {
    return this.interp.currentLine;
  }

  set stepping(on: boolean) {
    this.interp.stepping = on;
  }

  resume(value?: Resume): Step {
    if (this.finished) throw new Error("FastProgram: resumed after it finished");
    try {
      const r = this.gen.next(value);
      if (!r.done) return { kind: "suspend", request: r.value };
      return this.end({ status: "ok" });
    } catch (e) {
      return this.fail(e);
    }
  }

  /** Raise KeyboardInterrupt at the current suspension point (Stop). */
  interrupt(): Step {
    try {
      const r = this.gen.throw(new PyException(EXC.KeyboardInterrupt, "", []));
      if (!r.done) return { kind: "suspend", request: r.value };
      return this.end({ status: "ok" });
    } catch (e) {
      return this.fail(e);
    }
  }

  private end(result: RunResult): Step {
    this.finished = true;
    this.flushCommands();
    return { kind: "done", result };
  }

  private fail(e: unknown): Step {
    this.finished = true;
    this.flushCommands();
    if (e instanceof Unsupported) return { kind: "unsupported", feature: e.feature };
    if (e instanceof PyException) {
      if (e.type === EXC.KeyboardInterrupt) return { kind: "done", result: { status: "stopped" } };
      if (e.type === EXC.SystemExit || e.type === EXC.Terminator)
        return { kind: "done", result: { status: "ok" } };
      return { kind: "done", result: { status: "error", error: toPyError(e) } };
    }
    if (e instanceof RangeError) {
      // The JS stack ran out before CPython's recursion limit would: only
      // CPython can say what this program really does.
      return { kind: "unsupported", feature: "递归层数太深" };
    }
    // A bug in the fast engine: never show it as the child's mistake.
    console.error("PyPlay fast engine internal error", e);
    return { kind: "unsupported", feature: `内部错误：${String(e)}` };
  }
}

/** Formats like _pyplay_run.py (_user_traceback on CPython). */
export function toPyError(e: PyException): PyError {
  const frames = e.frames.length ? e.frames : [{ name: "<module>", line: 0 }];
  const last = frames[frames.length - 1];
  const lines = ["Traceback (most recent call last):\n"];
  for (const f of frames) lines.push(`  File "<main>", line ${f.line}, in ${f.name}\n`);
  const qualified = e.type.module ? `${e.type.module}.${e.type.name}` : e.type.name;
  const hint = e.suggestion ? `. Did you mean: '${e.suggestion}'?` : "";
  lines.push(e.text === "" ? `${qualified}${hint}\n` : `${qualified}: ${e.text}${hint}\n`);
  return { type: e.type.name, message: e.text, line: last?.line ?? null, traceback: lines.join("") };
}
