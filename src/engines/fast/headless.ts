/**
 * Run a fast-engine program to completion with virtual time and scripted
 * input/events — the same contract as tools/reference_run.py on CPython.
 * Used by the conformance suite; never by the browser.
 */
import type { CanvasCommand, HostEvent, RunResult } from "../../protocol";
import { approximateTextSize } from "../textMetrics";
import { FastProgram } from "./program";

export interface HeadlessRun {
  stdout: string;
  result: RunResult | { status: "unsupported"; feature: string };
  commands: CanvasCommand[];
}

export function runHeadless(
  source: string,
  opts: { stdin?: string[]; events?: HostEvent[] } = {},
): HeadlessRun {
  const stdin = [...(opts.stdin ?? [])];
  const events = [...(opts.events ?? [])];
  let clock = 0;
  let stdout = "";
  const commands: CanvasCommand[] = [];
  let program: FastProgram;
  try {
    program = new FastProgram(source, {
      stdout: (t) => {
        stdout += t;
      },
      commands: (c) => commands.push(...c),
      measureText: approximateTextSize,
      now: () => clock,
    });
  } catch (e) {
    const feature =
      e instanceof Error && "feature" in e ? String((e as { feature: string }).feature) : String(e);
    return { stdout, result: { status: "unsupported", feature }, commands };
  }
  let step = program.resume();
  for (let guard = 0; guard < 50_000_000; guard++) {
    if (step.kind === "done") return { stdout, result: step.result, commands };
    if (step.kind === "unsupported")
      return { stdout, result: { status: "unsupported", feature: step.feature }, commands };
    const req = step.request;
    switch (req.kind) {
      case "tick":
        step = program.resume();
        break;
      case "sleep":
        clock += Math.max(0, req.ms);
        step = program.resume();
        break;
      case "input":
      case "dialog":
        step = program.resume(stdin.length ? stdin.shift() : null);
        break;
      case "event":
        if (events.length) step = program.resume(events.shift());
        else if (req.timeoutMs === null) {
          // like the reference runner: waiting forever with no events left ends the run
          program.flushCommands();
          return { stdout, result: { status: "ok" }, commands };
        } else {
          clock += req.timeoutMs;
          step = program.resume(null);
        }
        break;
    }
  }
  throw new Error("runHeadless: program did not finish");
}
