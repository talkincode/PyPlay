import { describe, expect, it } from "vitest";
import { tkColorToCss } from "../../src/render/colors";
import { Scene, snapshot } from "../../src/render/scene";

describe("Scene", () => {
  it("applies create/coords/config/raise/delete in order", () => {
    const s = new Scene();
    s.applyAll([
      { op: "create", id: 1, kind: "line", coords: [0, 0, 10, 0], opts: { fill: "red", width: 2 } },
      {
        op: "create",
        id: 2,
        kind: "polygon",
        coords: [0, 0, 5, 5, 0, 5],
        opts: { fill: "blue", outline: "" },
      },
      { op: "raise", id: 1 },
      { op: "coords", id: 2, coords: [1, 1, 6, 6, 1, 6] },
      { op: "config", id: 1, opts: { width: 4 } },
    ]);
    expect(s.order).toEqual([2, 1]);
    expect(snapshot(s).items.map((i) => [i.kind, i.coords, i.width])).toEqual([
      ["polygon", [1, 1, 6, 6, 1, 6], 1],
      ["line", [0, 0, 10, 0], 4],
    ]);
    s.apply({ op: "delete", id: "all" });
    expect(snapshot(s).items).toEqual([]);
  });

  it("drops invisible items from snapshots and normalises -0", () => {
    const s = new Scene();
    s.apply({ op: "create", id: 1, kind: "line", coords: [-0, 0, 0, 0], opts: { fill: "" } });
    s.apply({ op: "create", id: 2, kind: "line", coords: [-0, 1e-12, 3, 4], opts: { fill: "black" } });
    expect(snapshot(s).items).toEqual([
      { kind: "line", coords: [0, 0, 3, 4], fill: "black", outline: "", width: 1 },
    ]);
  });

  it("fails loudly on unknown items", () => {
    expect(() => new Scene().apply({ op: "coords", id: 9, coords: [] })).toThrow(/unknown canvas item 9/);
  });
});

describe("Tk colors", () => {
  it("maps Tk names and hex forms to CSS", () => {
    expect(tkColorToCss("red")).toBe("rgb(255, 0, 0)");
    expect(tkColorToCss("Light Blue")).toBe("rgb(173, 216, 230)");
    expect(tkColorToCss("gray50")).toBe("rgb(127, 127, 127)");
    expect(tkColorToCss("#f80")).toBe("#f80");
    expect(tkColorToCss("#ffff88880000")).toBe("#ff8800");
    expect(tkColorToCss("burly wood")).toBeNull();
    expect(tkColorToCss("")).toBeNull();
  });
});
