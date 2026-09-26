import { describe, expect, it } from "vitest";
import { explain, suggestName } from "../../src/errors/friendly";
import type { PyError } from "../../src/protocol";

const err = (type: string, message: string, traceback = "", line: number | null = 3): PyError => ({
  type,
  message,
  line,
  traceback: traceback || `${type}: ${message}`,
});

describe("friendly errors", () => {
  it("suggests a close builtin for NameError", () => {
    expect(suggestName("prnt", "")).toBe("print");
    expect(explain(err("NameError", "name 'prnt' is not defined"), "prnt('x')").hint).toContain("print");
  });

  it("uses CPython's Did-you-mean for AttributeError", () => {
    const e = err(
      "AttributeError",
      "'Turtle' object has no attribute 'foward'",
      "Traceback...\nAttributeError: 'Turtle' object has no attribute 'foward'. Did you mean: 'forward'?",
    );
    const f = explain(e, "");
    expect(f.title).toBe("第 3 行：Turtle 没有 “foward” 这个功能");
    expect(f.hint).toBe("是不是想写 “forward”？");
  });

  it("explains str + int", () => {
    const f = explain(err("TypeError", 'can only concatenate str (not "int") to str'), "");
    expect(f.title).toContain("文字和数字");
  });

  it("explains bad turtle colors", () => {
    expect(explain(err("TurtleGraphicsError", "bad color string: blu"), "").title).toContain("颜色");
  });

  it("falls back to a generic message without losing the type", () => {
    expect(explain(err("SomethingNewError", "x", "", null), "").title).toBe(
      "程序里：程序出错了（SomethingNewError）",
    );
  });
});
