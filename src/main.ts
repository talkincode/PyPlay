import "./styles.css";
import { type Engine, EngineFallback, type RunCallbacks } from "./engines/engine";
import { FastEngine } from "./engines/fast/engine";
import { analyzeSubset } from "./engines/fast/subset";
import { PyodideEngine } from "./engines/pyodide/engine";
import { chooseEngine, type EnginePreference } from "./engines/router";
import { EXAMPLES } from "./examples";
import type { EngineId, RunResult } from "./protocol";
import { keyEvent, Renderer } from "./render/renderer";
import { Scene } from "./render/scene";
import { decodeShare, encodeShare } from "./share";
import { ConsoleView } from "./ui/console";
import { createEditor } from "./ui/editor";

const STORAGE_CODE = "pyplay.code";
const STORAGE_ENGINE = "pyplay.engine";

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

const runBtn = $<HTMLButtonElement>("run");
const stopBtn = $<HTMLButtonElement>("stop");
const examplesSel = $<HTMLSelectElement>("examples");
const engineSel = $<HTMLSelectElement>("engine");
const paceSel = $<HTMLSelectElement>("pace");
const statusEl = $("status");
const inputRow = $<HTMLFormElement>("input-row");
const inputField = $<HTMLInputElement>("input-field");
const dialog = $<HTMLDialogElement>("dialog");
const canvasEl = $<HTMLCanvasElement>("canvas");
const canvasTitle = $("canvas-title");

const scene = new Scene();
const renderer = new Renderer(canvasEl, scene);
const output = new ConsoleView($("console"));

const engines: Record<EngineId, Engine> = {
  fast: new FastEngine(),
  python: new PyodideEngine(),
};
const ENGINE_LABEL: Record<EngineId, string> = { fast: "⚡ 快速引擎", python: "🐍 完整 Python" };

let active: Engine | null = null;
let pendingInput: "stdin" | "dialog" | null = null;

// ---------------------------------------------------------------- editor
const editor = createEditor($("editor"), EXAMPLES[0]?.code ?? "", {
  onChange: (code) => localStorage.setItem(STORAGE_CODE, code),
  onRun: () => void run(),
});

async function loadInitialCode(): Promise<void> {
  const shared = await decodeShare(location.hash).catch(() => null);
  if (shared !== null) {
    editor.setCode(shared);
    history.replaceState(null, "", location.pathname);
    return;
  }
  const saved = localStorage.getItem(STORAGE_CODE);
  if (saved) editor.setCode(saved);
}

for (const ex of EXAMPLES) {
  const opt = document.createElement("option");
  opt.value = ex.id;
  opt.textContent = ex.title;
  examplesSel.append(opt);
}
examplesSel.addEventListener("change", () => {
  const ex = EXAMPLES.find((e) => e.id === examplesSel.value);
  examplesSel.value = "";
  if (ex) editor.setCode(ex.code);
});

engineSel.value = localStorage.getItem(STORAGE_ENGINE) ?? "auto";
engineSel.addEventListener("change", () => localStorage.setItem(STORAGE_ENGINE, engineSel.value));

// ---------------------------------------------------------------- running
function setRunning(running: boolean): void {
  runBtn.disabled = running;
  stopBtn.disabled = !running;
  document.body.classList.toggle("running", running);
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function hideInput(): void {
  pendingInput = null;
  inputRow.hidden = true;
  if (dialog.open) dialog.close();
}

const callbacks: RunCallbacks = {
  stdout: (text) => output.write(text),
  commands: (cmds) => {
    scene.applyAll(cmds);
    canvasTitle.textContent = scene.title;
  },
  requestInput: (req) => {
    pendingInput = req.kind;
    if (req.kind === "stdin") {
      inputRow.hidden = false;
      inputField.value = "";
      inputField.focus();
    } else {
      $("dialog-title").textContent = req.title ?? "";
      $("dialog-prompt").textContent = req.prompt;
      ($("dialog-input") as HTMLInputElement).value = "";
      dialog.showModal();
    }
  },
  line: (line) => editor.markLines(line, null),
};

function resetOutput(): void {
  output.clear();
  scene.reset();
  canvasTitle.textContent = "";
  editor.markLines(null, null);
}

async function runOn(engine: Engine, source: string, stepDelayMs: number): Promise<RunResult> {
  active = engine;
  setStatus(`${ENGINE_LABEL[engine.id]} · 准备中…`);
  await engine.ready();
  setStatus(`${ENGINE_LABEL[engine.id]} · 运行中`);
  return engine.run(source, callbacks, { stepDelayMs });
}

async function run(): Promise<void> {
  if (active) return;
  const source = editor.getCode();
  const pref = engineSel.value as EnginePreference;
  const choice = chooseEngine(pref, analyzeSubset(source));
  let engine = engines[choice.engine];
  const stepDelayMs = Number(paceSel.value);
  resetOutput();
  setRunning(true);
  if (choice.engine === "python" && pref !== "python") output.info(`ℹ️ ${choice.reason}`);
  if (stepDelayMs > 0 && engine.id === "python") output.info("ℹ️ 逐行演示只支持快速引擎，这次按正常速度运行");
  let result: RunResult;
  const started = performance.now();
  try {
    try {
      result = await runOn(engine, source, stepDelayMs);
    } catch (err) {
      if (!(err instanceof EngineFallback)) throw err;
      // the fast engine met something outside its subset mid-run: start over on full Python
      hideInput();
      resetOutput();
      output.info(`ℹ️ 用到了 ${err.feature}，改用完整 Python 重新运行`);
      engine = engines.python;
      result = await runOn(engine, source, 0);
    }
  } catch (err) {
    result = {
      status: "error",
      error: { type: "PyPlayError", message: String(err), line: null, traceback: String(err) },
    };
  }
  hideInput();
  active = null;
  setRunning(false);
  const secs = ((performance.now() - started) / 1000).toFixed(1);
  if (result.status === "ok") {
    editor.markLines(null, null);
    setStatus(`${ENGINE_LABEL[engine.id]} · 运行完成（${secs} 秒）`);
  } else if (result.status === "stopped") {
    editor.markLines(null, null);
    output.info("⏹ 程序已停止");
    setStatus(`${ENGINE_LABEL[engine.id]} · 已停止`);
  } else {
    output.error(result.error, source);
    editor.markLines(null, result.error.line);
    setStatus(`${ENGINE_LABEL[engine.id]} · 出错了`);
  }
}

function stop(): void {
  if (!active) return;
  setStatus("正在停止…");
  if (pendingInput) active.provideInput(null);
  active.stop();
}

runBtn.addEventListener("click", () => void run());
stopBtn.addEventListener("click", stop);
$("clear-console").addEventListener("click", () => output.clear());

inputRow.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!active || pendingInput !== "stdin") return;
  const value = inputField.value;
  output.echo(value);
  hideInput();
  active.provideInput(value);
});

dialog.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!active || pendingInput !== "dialog") return;
  const value = ($("dialog-input") as HTMLInputElement).value;
  hideInput();
  active.provideInput(value);
});
$("dialog-cancel").addEventListener("click", () => {
  if (!active || pendingInput !== "dialog") return;
  hideInput();
  active.provideInput(null);
});

// ---------------------------------------------------------------- events
renderer.onEvent = (ev) => active?.sendEvent(ev);

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest(".cm-editor, input, textarea, select, dialog") !== null;
}

for (const type of ["keydown", "keyup"] as const) {
  document.addEventListener(type, (e) => {
    if (!active || isTyping(e.target)) return;
    const ev = keyEvent(e, type === "keydown");
    if (!ev) return;
    active.sendEvent(ev);
    if (["Up", "Down", "Left", "Right", "space"].includes(ev.type === "key" ? ev.keysym : ""))
      e.preventDefault();
  });
}

// ---------------------------------------------------------------- share / image
function toast(text: string): void {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

$("share").addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}${await encodeShare(editor.getCode())}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("分享链接已复制 📋");
  } catch {
    prompt("复制下面的分享链接：", url);
  }
});

$("save-image").addEventListener("click", async () => {
  const blob = await renderer.toPngBlob();
  if (!blob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pyplay.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------------------------------------------------------------- start
await loadInitialCode();
if (PyodideEngine.supported()) {
  // warm up full Python in the background so fallbacks start fast
  const warm = () =>
    void engines.python.ready().catch((e: unknown) => output.info(`⚠️ 完整 Python 加载失败：${e}`));
  if ("requestIdleCallback" in window) requestIdleCallback(warm, { timeout: 3000 });
  else setTimeout(warm, 1500);
} else {
  output.info(
    "⚠️ 当前页面没有跨源隔离，完整 Python 引擎不可用（input、键盘事件需要它）。请直接打开 PyPlay 网址，不要嵌入在其他网页里。",
  );
}
