/**
 * The fast engine must behave exactly like CPython.
 *
 * Every program in tests/conformance/programs runs twice:
 *   1. on real CPython via tools/reference_run.py (upstream turtle.py on
 *      PyPlay's tkinter stand-in) — the oracle;
 *   2. on the fast engine via runHeadless().
 * Both use virtual time and the same scripted stdin (NAME.stdin, one line per
 * input) and UI events (NAME.events.json). Output, how the run ended, and the
 * final canvas must be identical.
 *
 * A program whose first line is `# expect: full-python` must be rejected by
 * the fast engine (it proves the fallback boundary instead).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runHeadless } from "../../src/engines/fast/headless";
import { analyzeSubset } from "../../src/engines/fast/subset";
import type { CanvasCommand, HostEvent, RunResult } from "../../src/protocol";
import { Scene, snapshot } from "../../src/render/scene";

const ROOT = join(__dirname, "../..");
const DIR = join(__dirname, "programs");
const PYTHON = process.env.PYTHON ?? "python3";

interface Reference {
  stdout: string;
  result: RunResult;
  commands: CanvasCommand[];
}

function reference(program: string, stdinFile: string | null, eventsFile: string | null): Reference {
  const args = [join(ROOT, "tools/reference_run.py"), program];
  if (stdinFile) args.push("--stdin", stdinFile);
  if (eventsFile) args.push("--events", eventsFile);
  return JSON.parse(execFileSync(PYTHON, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));
}

function scene(commands: CanvasCommand[]) {
  const s = new Scene();
  s.applyAll(commands);
  return { ...snapshot(s), window: s.window, title: s.title };
}

function comparableResult(r: RunResult) {
  if (r.status !== "error") return r;
  const e = r.error;
  // RecursionError tracebacks depend on stack depth details; compare the rest
  return e.type === "RecursionError"
    ? { status: r.status, type: e.type, message: e.message }
    : { status: r.status, type: e.type, message: e.message, line: e.line, traceback: e.traceback };
}

const programs = readdirSync(DIR)
  .filter((f) => f.endsWith(".py"))
  .sort();

describe("fast engine matches CPython", () => {
  for (const file of programs) {
    it(file, () => {
      const path = join(DIR, file);
      const source = readFileSync(path, "utf8");
      const base = path.slice(0, -3);
      const stdinFile = existsSync(`${base}.stdin`) ? `${base}.stdin` : null;
      const eventsFile = existsSync(`${base}.events.json`) ? `${base}.events.json` : null;
      const stdin = stdinFile ? readFileSync(stdinFile, "utf8").split("\n") : [];
      if (stdin[stdin.length - 1] === "") stdin.pop();
      const events: HostEvent[] = eventsFile ? JSON.parse(readFileSync(eventsFile, "utf8")) : [];

      if (source.startsWith("# expect: full-python")) {
        const verdict = analyzeSubset(source);
        const ran = verdict.supported ? runHeadless(source, { stdin, events }) : null;
        expect(verdict.supported === false || ran?.result.status === "unsupported").toBe(true);
        return;
      }

      const ref = reference(path, stdinFile, eventsFile);
      expect(analyzeSubset(source), "static subset check").toEqual({ supported: true });
      const fast = runHeadless(source, { stdin, events });
      expect(fast.result.status, `fast engine: ${JSON.stringify(fast.result)}`).not.toBe("unsupported");
      expect(fast.stdout).toBe(ref.stdout);
      expect(comparableResult(fast.result as RunResult)).toEqual(comparableResult(ref.result));
      expect(scene(fast.commands)).toEqual(scene(ref.commands));
    });
  }
});
