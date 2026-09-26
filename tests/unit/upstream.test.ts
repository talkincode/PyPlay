import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const ROOT = join(__dirname, "../..");

it("python/turtle.py is the unmodified upstream CPython file", () => {
  const meta = JSON.parse(readFileSync(join(ROOT, "python/turtle.upstream.json"), "utf8"));
  const sha = createHash("sha256")
    .update(readFileSync(join(ROOT, "python/turtle.py")))
    .digest("hex");
  expect(sha).toBe(meta.sha256);
});
