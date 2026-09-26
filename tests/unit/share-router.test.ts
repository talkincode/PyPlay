import { describe, expect, it } from "vitest";
import { analyzeSubset } from "../../src/engines/fast/subset";
import { chooseEngine } from "../../src/engines/router";
import { decodeShare, encodeShare } from "../../src/share";

describe("share links", () => {
  it("round-trips programs through the URL fragment", async () => {
    const code = 'import turtle\nprint("你好 🐢")\n';
    const hash = await encodeShare(code);
    expect(hash).toMatch(/^#code=[A-Za-z0-9_-]+$/);
    expect(await decodeShare(hash)).toBe(code);
    expect(await decodeShare("#other")).toBeNull();
  });
});

describe("engine choice", () => {
  it("prefers the fast engine for subset programs", () => {
    expect(chooseEngine("auto", analyzeSubset("print(1)")).engine).toBe("fast");
  });

  it("falls back to full Python outside the subset, even when fast is requested", () => {
    const verdict = analyzeSubset("import json\nprint(json.dumps([1]))");
    expect(verdict).toEqual({ supported: false, feature: "import json" });
    expect(chooseEngine("fast", verdict).engine).toBe("python");
  });

  it("honours an explicit full-Python choice", () => {
    expect(chooseEngine("python", analyzeSubset("print(1)")).engine).toBe("python");
  });

  it("treats CPython-only builtins and methods as outside the subset", () => {
    expect(analyzeSubset("print(set())")).toEqual({ supported: false, feature: "内置函数 set" });
    expect(analyzeSubset("print('a'.casefold())")).toEqual({ supported: false, feature: ".casefold" });
    // a name CPython does not have either is a genuine AttributeError: fast engine is fine
    expect(analyzeSubset("'a'.push(1)")).toEqual({ supported: true });
  });
});
