import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { PyPlayDB } from "../../src/storage/db";
import { MemoryFileStore, readText } from "../../src/storage/files";
import { ProjectService } from "../../src/storage/projects";

let now = 1_000;
let ids = 0;
let files: MemoryFileStore;
let svc: ProjectService;

beforeEach(async () => {
  now = 1_000;
  ids = 0;
  files = new MemoryFileStore();
  const db = await PyPlayDB.open(new IDBFactory());
  svc = new ProjectService(
    db,
    files,
    () => now,
    () => `p${++ids}`,
  );
});

describe("projects", () => {
  it("stores code in the file store and metadata in IndexedDB", async () => {
    const p = await svc.create("  五角星  ", "print(1)\n", {
      tags: ["turtle", " turtle ", ""],
      fromExample: "star",
    });
    expect(p).toMatchObject({
      id: "p1",
      name: "五角星",
      tags: ["turtle"],
      fromExample: "star",
      entry: "main.py",
    });
    expect(await readText(files, "projects/p1/main.py")).toBe("print(1)\n");
    now = 2_000;
    await svc.saveCode("p1", "print(2)\n");
    const opened = await svc.open("p1");
    expect(opened.code).toBe("print(2)\n");
    expect(opened.meta).toMatchObject({ updatedAt: 2_000, openedAt: 2_000 });
  });

  it("lists by most recently opened and remembers the last project", async () => {
    await svc.create("A", "a");
    now = 2_000;
    await svc.create("B", "b");
    now = 3_000;
    await svc.open("p1");
    expect((await svc.list()).map((p) => p.name)).toEqual(["A", "B"]);
    expect(await svc.lastOpenedId()).toBe("p1");
  });

  it("renames, tags, duplicates and deletes (including files)", async () => {
    await svc.create("A", "code");
    await svc.rename("p1", "我的画");
    await svc.setTags("p1", ["作业", "turtle"]);
    await svc.saveScreenshot("p1", new Blob(["png"]));
    const copy = await svc.duplicate("p1");
    expect(copy).toMatchObject({ name: "我的画 副本", tags: ["作业", "turtle"] });
    // equal counts: order follows Chinese collation, so compare as a set
    expect(new Set(await svc.allTags())).toEqual(new Set(["turtle", "作业"]));
    await svc.remove("p1");
    expect(await svc.get("p1")).toBeUndefined();
    expect([...files.data.keys()].some((k) => k.startsWith("projects/p1/"))).toBe(false);
    expect(await svc.lastOpenedId()).toBe("p2");
    await expect(svc.rename("p2", "   ")).rejects.toThrow("项目名不能为空");
  });

  it("exports a valid zip with the code and screenshots", async () => {
    await svc.create("花朵", "import turtle\n");
    await svc.saveScreenshot("p1", new Blob([new Uint8Array([137, 80, 78, 71])]));
    const zip = await svc.exportZip("p1");
    expect(zip.name).toBe("花朵.zip");
    const path = join(mkdtempSync(join(tmpdir(), "pyplay-zip-")), "p.zip");
    writeFileSync(path, zip.data);
    const listing = execFileSync(process.env.PYTHON ?? "python3", [
      "-c",
      "import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print('\\n'.join(z.namelist())); print(z.read(z.namelist()[0]).decode())",
      path,
    ]).toString();
    expect(listing).toContain("花朵/main.py");
    expect(listing).toMatch(/花朵\/screenshots\/\d{8}-\d{6}\.png/);
    expect(listing).toContain("import turtle");
  });
});

describe("example favorites and progress", () => {
  it("toggles favorites", async () => {
    expect(await svc.toggleFavorite("star")).toBe(true);
    expect((await svc.favorites()).map((f) => f.exampleId)).toEqual(["star"]);
    expect(await svc.toggleFavorite("star")).toBe(false);
    expect(await svc.favorites()).toEqual([]);
  });

  it("never moves progress backwards but keeps the last viewed time", async () => {
    await svc.markProgress("star", "ran");
    now = 5_000;
    const e = await svc.markProgress("star", "viewed");
    expect(e).toMatchObject({ status: "ran", viewedAt: 5_000 });
    expect(await svc.markProgress("tree", "loaded")).toMatchObject({ status: "loaded" });
    expect(await svc.markProgress("tree", "done")).toMatchObject({ status: "done" });
    expect(await svc.markProgress("tree", "ran")).toMatchObject({ status: "done" });
  });
});
