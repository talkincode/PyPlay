/**
 * Every program in the example library runs on real CPython and on the fast
 * engine with identical results (the library promises kids real Python).
 * Answers for input() come from each example's `input` list.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runHeadless } from "../../src/engines/fast/headless";
import { analyzeSubset } from "../../src/engines/fast/subset";
import { CATEGORIES, EXAMPLES } from "../../src/examples";
import type { CanvasCommand } from "../../src/protocol";
import { Scene, snapshot } from "../../src/render/scene";

const ROOT = join(__dirname, "../..");
const PYTHON = process.env.PYTHON ?? "python3";

function scene(commands: CanvasCommand[]) {
  const s = new Scene();
  s.applyAll(commands);
  return snapshot(s);
}

/** Unseeded randomness: outputs differ run to run, so only check it runs. */
const isRandomised = (code: string) => /\bimport random\b/.test(code) && !/random\.seed\(/.test(code);

describe("example library catalogue", () => {
  it("has unique ids and complete entries", () => {
    const ids = EXAMPLES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of EXAMPLES) {
      expect(e.categories.length, e.id).toBeGreaterThan(0);
      for (const c of e.categories) expect(CATEGORIES, e.id).toContain(c);
      expect(e.learn.length, e.id).toBeGreaterThan(0);
      expect(e.explanation.length, e.id).toBeGreaterThan(0);
      expect(e.code.endsWith("\n"), e.id).toBe(true);
    }
  });

  it("covers every category", () => {
    for (const c of CATEGORIES)
      expect(
        EXAMPLES.some((e) => e.categories.includes(c)),
        c,
      ).toBe(true);
  });
});

describe("examples run like CPython", () => {
  const dir = mkdtempSync(join(tmpdir(), "pyplay-examples-"));
  for (const ex of EXAMPLES) {
    it(ex.id, () => {
      expect(analyzeSubset(ex.code), "runs on the fast engine").toEqual({ supported: true });
      const stdin = ex.input ?? [];
      const fast = runHeadless(ex.code, { stdin });
      if (isRandomised(ex.code)) {
        expect(fast.result.status).not.toBe("unsupported");
        // scripted answers may run out before a random game ends
        if (fast.result.status === "error") expect(fast.result.error.type).toBe("EOFError");
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
      expect(ref.result).toEqual({ status: "ok" });
      expect(fast.result).toEqual({ status: "ok" });
      expect(fast.stdout).toBe(ref.stdout);
      expect(scene(fast.commands)).toEqual(scene(ref.commands));
    });
  }
});
