/**
 * Stage the Pyodide runtime into public/pyodide/<version>/ so Vite serves it
 * in dev and copies it into dist/ for deployment (same origin — required by
 * cross-origin isolation, and avoids CDNs that are unreliable in China).
 *
 * Ships only what PyPlay loads: the interpreter, its JS glue, the package
 * lock file, and the trimmed stdlib built from python/stdlib-manifest.json.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTrimmedZip, MANIFEST_PATH, PYODIDE_DIR } from "./python-stdlib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const installed = JSON.parse(readFileSync(join(PYODIDE_DIR, "package.json"), "utf8")).version;
if (installed !== manifest.pyodide) {
  throw new Error(
    `pyodide ${installed} is installed but the stdlib manifest was built for ${manifest.pyodide}. ` +
      "Run: node scripts/python-stdlib.mjs --write",
  );
}

const engineSource = readFileSync(join(ROOT, "src/engines/pyodide/engine.ts"), "utf8");
const pinned = engineSource.match(/PYODIDE_VERSION = "([^"]+)"/)?.[1];
if (pinned !== installed) {
  throw new Error(`src/engines/pyodide/engine.ts pins Pyodide ${pinned}, but ${installed} is installed`);
}

const out = join(ROOT, "public/pyodide", installed);
mkdirSync(out, { recursive: true });
const stampDir = join(ROOT, "node_modules/.cache/pyplay");
mkdirSync(stampDir, { recursive: true });
const stamp = join(stampDir, `pyodide-${installed}.manifest`);
const manifestText = readFileSync(MANIFEST_PATH, "utf8");
if (existsSync(stamp) && readFileSync(stamp, "utf8") === manifestText) {
  console.log(`pyodide runtime up to date in public/pyodide/${installed}`);
  process.exit(0);
}

for (const f of ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "pyodide-lock.json"]) {
  copyFileSync(join(PYODIDE_DIR, f), join(out, f));
}
const { zip } = buildTrimmedZip(manifest.files);
writeFileSync(join(out, "python_stdlib.zip"), zip);
writeFileSync(stamp, manifestText);
console.log(
  `staged pyodide ${installed} (trimmed stdlib: ${manifest.files.length} files, ${zip.length} bytes)`,
);
