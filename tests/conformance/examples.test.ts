/**
 * Every starter program in the examples menu runs on real CPython and on the
 * fast engine with identical results (the menu promises kids real Python).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runHeadless } from "../../src/engines/fast/headless";
import { analyzeSubset } from "../../src/engines/fast/subset";
import { EXAMPLES } from "../../src/examples";
import type { CanvasCommand } from "../../src/protocol";
import { Scene, snapshot } from "../../src/render/scene";

const ROOT = join(__dirname, "../..");
const PYTHON = process.env.PYTHON ?? "python3";
/** Scripted answers for examples that call input(). */
const STDIN: Record<string, string[]> = { hello: ["小明", "9"] };
/** Unseeded randomness: only check that the fast engine runs it. */
const NONDETERMINISTIC = new Set(["guess"]);

function scene(commands: CanvasCommand[]) {
  const s = new Scene();
  s.applyAll(commands);
  return snapshot(s);
}

describe("examples menu", () => {
  const dir = mkdtempSync(join(tmpdir(), "pyplay-examples-"));
  for (const ex of EXAMPLES) {
    it(ex.id, () => {
      expect(analyzeSubset(ex.code)).toEqual({ supported: true });
      const stdin = STDIN[ex.id] ?? [];
      if (NONDETERMINISTIC.has(ex.id)) {
        const r = runHeadless(ex.code, { stdin: ["50", "25", "75"] });
        expect(r.result.status).not.toBe("unsupported");
        return;
      }
      const program = join(dir, `${ex.id}.py`);
      const stdinFile = join(dir, `${ex.id}.stdin`);
      writeFileSync(program, ex.code);
      writeFileSync(stdinFile, stdin.map((l) => `${l}\n`).join(""));
      const ref = JSON.parse(
        execFileSync(PYTHON, [join(ROOT, "tools/reference_run.py"), program, "--stdin", stdinFile], {
          encoding: "utf8",
          maxBuffer: 256 * 1024 * 1024,
        }),
      );
      const fast = runHeadless(ex.code, { stdin });
      expect(ref.result).toEqual({ status: "ok" });
      expect(fast.result).toEqual({ status: "ok" });
      expect(fast.stdout).toBe(ref.stdout);
      expect(scene(fast.commands)).toEqual(scene(ref.commands));
    });
  }
});
