import { describe, expect, it } from "vitest";
import { runHeadless } from "../../src/engines/fast/headless";
import { FastProgram } from "../../src/engines/fast/program";
import { EXAMPLE_BY_ID } from "../../src/examples";
import { LESSONS, nextLesson, taskMiss, taskPassed } from "../../src/learn/lessons";
import { Scene } from "../../src/render/scene";

const solved: Record<string, { code: string; stdin?: string[] }> = {
  "animal-hello": { code: codeOf("animal-hello").replace("小猫说：喵～", "小鸭说：嘎！") },
  pencils: { code: codeOf("pencils").replace("pencils = 4", "pencils = 6") },
  umbrella: {
    code: codeOf("umbrella").replace('print("带上雨伞再出门")', 'print("带上雨伞，雨天也出去玩")'),
    stdin: ["雨"],
  },
  "count-sheep": { code: codeOf("count-sheep").replace("n <= 5", "n <= 3") },
  stairs: { code: codeOf("stairs").replace('t.color("green")', 't.color("red")') },
  triangle: { code: codeOf("triangle").replace('"violet"', '"gold"') },
  "print-triangle": { code: codeOf("print-triangle").replace("rows = 5", "rows = 3") },
  star: { code: codeOf("star").replace('"yellow"', '"gold"') },
  countdown: { code: codeOf("countdown").replace("range(5, 0, -1)", "range(3, 0, -1)") },
  "star-function": { code: codeOf("star-function").replace('"gold"', '"pink"') },
  shopping: {
    code: codeOf("shopping").replace(
      'items.remove("牛奶")\n',
      'items.remove("牛奶")\nitems.append("饼干")\n',
    ),
  },
  grade: { code: codeOf("grade").replace('print("A，太棒了！")', 'print("A，超级！")'), stdin: ["95"] },
};

function codeOf(id: string): string {
  const example = EXAMPLE_BY_ID.get(id);
  if (!example) throw new Error(id);
  return example.code;
}

function outcome(code: string, stdin?: string[]) {
  const run = runHeadless(code, { stdin });
  const scene = new Scene();
  scene.applyAll(run.commands);
  return { run, scene };
}

describe("lesson tasks", () => {
  it("names twelve lessons that exist in the library", () => {
    expect(LESSONS).toHaveLength(12);
    for (const lesson of LESSONS) expect(EXAMPLE_BY_ID.has(lesson.id), lesson.id).toBe(true);
  });

  it("says which printed line is still the original", () => {
    const lesson = LESSONS[0];
    if (!lesson) throw new Error("lesson 1");
    const { run, scene } = outcome(codeOf("animal-hello"));
    expect(taskMiss(lesson.task, run.stdout, scene)).toBe(
      "还没对上。第 1 行现在是「小猫说：喵～」，要改成「小鸭说：嘎！」。",
    );
  });

  it("marks spaces so a shorter star row is visible", () => {
    const lesson = LESSONS.find((item) => item.id === "print-triangle");
    if (!lesson) throw new Error("print-triangle");
    const { run, scene } = outcome(codeOf("print-triangle"));
    expect(taskMiss(lesson.task, run.stdout, scene)).toBe(
      "还没对上。第 1 行现在是「····*」，要改成「··*」。",
    );
  });

  it("points a new learner at the first lesson that is not done", () => {
    expect(nextLesson(new Set())?.id).toBe("animal-hello");
    expect(nextLesson(new Set(["animal-hello", "pencils"]))?.id).toBe("umbrella");
    expect(nextLesson(new Set(LESSONS.map((lesson) => lesson.id)))).toBeUndefined();
  });

  for (const lesson of LESSONS) {
    it(`${lesson.id}: the original program is not finished`, () => {
      const example = EXAMPLE_BY_ID.get(lesson.id);
      if (!example) throw new Error(lesson.id);
      const { run, scene } = outcome(example.code, example.input);
      expect(run.result.status, run.stdout).not.toBe("unsupported");
      expect(taskPassed(lesson.task, run.stdout, scene)).toBe(false);
      expect(taskMiss(lesson.task, run.stdout, scene)).not.toBe("还没对上，再改改");
    });

    it(`${lesson.id}: the one change finishes the lesson`, () => {
      const answer = solved[lesson.id];
      if (!answer) throw new Error(`missing solution ${lesson.id}`);
      const { run, scene } = outcome(answer.code, answer.stdin);
      expect(run.result, run.stdout).toEqual({ status: "ok" });
      expect(taskPassed(lesson.task, run.stdout, scene), JSON.stringify(run.stdout)).toBe(true);
    });
  }
});

describe("step bindings", () => {
  it("shows a variable after the line that assigns it", () => {
    const program = new FastProgram("n = 1\nprint(n)\n", {
      stdout: () => {},
      commands: () => {},
      measureText: () => [0, 0],
      now: () => 0,
    });
    program.stepping = true;
    expect(program.resume()).toMatchObject({ kind: "suspend", request: { kind: "tick" } });
    expect(program.bindings()).toEqual([]);
    expect(program.resume()).toMatchObject({ kind: "suspend", request: { kind: "tick" } });
    expect(program.bindings()).toEqual([{ name: "n", value: "1" }]);
  });
});
