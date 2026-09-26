/**
 * Generate src/engines/fast/cpython-attributes.json: CPython's dir() of every
 * kind of object a fast-engine program can hold, collected inside Pyodide.
 *
 * The fast engine uses it to decide what a missing attribute means:
 *   - in the table but not implemented by the fast engine → run on full Python
 *   - not in the table → CPython raises AttributeError too, so the fast engine
 *     may raise it (with the same "Did you mean" hint, see suggestions.ts).
 *
 * Run: node scripts/gen-cpython-attrs.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bootPyodideWithRuntime } from "./pyodide-node.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/engines/fast/cpython-attributes.json");

const py = await bootPyodideWithRuntime();
py.FS.writeFile(
  "/home/pyodide/pyplay/cpython_attrs.py",
  readFileSync(join(ROOT, "scripts/cpython_attrs.py")),
);
const json = py.runPython(
  "import json, cpython_attrs\njson.dumps(cpython_attrs.collect(), separators=(',', ':'))",
);
writeFileSync(OUT, `${json}\n`);
const data = JSON.parse(json);
const names = new Set(Object.values(data.types).flat());
console.log(
  `wrote dir() of ${Object.keys(data.types).length} object kinds, ${names.size} names (Pyodide CPython ${data.python})`,
);
