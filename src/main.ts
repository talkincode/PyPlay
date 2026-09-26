import "./styles.css";
import { ProjectSession } from "./app/session";
import { type Engine, EngineFallback, type RunCallbacks } from "./engines/engine";
import { FastEngine } from "./engines/fast/engine";
import { analyzeSubset } from "./engines/fast/subset";
import { PyodideEngine } from "./engines/pyodide/engine";
import { chooseEngine, type EnginePreference } from "./engines/router";
import { EXAMPLE_BY_ID, type Example } from "./examples";
import { LESSONS, lessonById, lessonIndex, nextLesson, taskPassed } from "./learn/lessons";
import type { EngineId, RunResult } from "./protocol";
import { keyEvent, Renderer } from "./render/renderer";
import { Scene, snapshot } from "./render/scene";
import { decodeShare, encodeShare } from "./share";
import { openStorage, type ProjectService } from "./storage";
import { ConsoleView } from "./ui/console";
import { download } from "./ui/dom";
import { createEditor } from "./ui/editor";
import { ExampleLibrary } from "./ui/exampleLibrary";
import { ProjectPanel } from "./ui/projectPanel";
import { currentTheme, installTheme, onTheme, toggleTheme } from "./ui/theme";

/** UI preferences stay in localStorage; the child's work lives in IndexedDB + OPFS. */
const STORAGE_ENGINE = "pyplay.engine";

installTheme();

function paintThemeButton(): void {
  const btn = $<HTMLButtonElement>("theme");
  const dark = currentTheme() === "dark";
  btn.title = dark ? "切换到浅色" : "切换到深色";
  btn.setAttribute("aria-label", btn.title);
  btn.setAttribute("aria-pressed", dark ? "true" : "false");
}

paintThemeButton();
onTheme(paintThemeButton);
$<HTMLButtonElement>("theme").addEventListener("click", () => {
  toggleTheme();
});

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

const runBtn = $<HTMLButtonElement>("run");
const stopBtn = $<HTMLButtonElement>("stop");
const projectBtn = $<HTMLButtonElement>("project");
const saveStateEl = $("save-state");
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

// ---------------------------------------------------------------- editor + project
let session: ProjectSession;
const editor = createEditor($("editor"), "", {
  onChange: (code) => session.edited(code),
  onRun: () => void run(),
});

const SAVE_LABEL = {
  saved: "✓ 已保存",
  saving: "保存中…",
  unsaved: "● 未保存",
  error: "⚠️ 保存失败",
  memory: "⚠️ 不会保存",
} as const;

function renderProject(): void {
  const name = session.current?.name ?? "未保存的程序";
  projectBtn.textContent = `📁 ${name}`;
  projectBtn.title = session.projects
    ? "我的项目（点击切换、新建、导出）"
    : "浏览器不允许本地存储，作品不会被保存";
  saveStateEl.textContent = SAVE_LABEL[session.state];
  saveStateEl.dataset.state = session.state;
  document.title = `${name} · PyPlay`;
  void paintLesson();
}

async function loadExample(example: Example): Promise<void> {
  await stopIfRunning();
  await session.createAndOpen(example.title, example.code, {
    fromExample: example.id,
    tags: [example.categories[0] ?? "示例"],
  });
  await session.projects?.markProgress(example.id, "loaded");
  resetOutput();
  toast(`已加载“${example.title}”到新项目，点 ▶ 运行试试`);
}

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

let runStdout = "";
/** Lessons passed in this tab when the browser will not store progress. */
const rememberedDone = new Set<string>();
/** The open lesson was run and did not match its task. */
let lessonMissed = false;

const callbacks: RunCallbacks = {
  stdout: (text) => {
    runStdout += text;
    output.write(text);
  },
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
  bindings: (rows) => showBindings(rows),
};

function resetOutput(): void {
  output.clear();
  scene.reset();
  canvasTitle.textContent = "";
  editor.markLines(null, null);
  runStdout = "";
  $("vars").hidden = true;
}

function showBindings(rows: { name: string; value: string }[]): void {
  const el = $("vars");
  el.hidden = false;
  el.replaceChildren(
    ...(rows.length
      ? rows.map((row) => {
          const chip = document.createElement("span");
          chip.className = "var";
          const name = document.createElement("b");
          name.textContent = row.name;
          chip.append(name, ` = ${row.value}`);
          return chip;
        })
      : [document.createTextNode("这一步还没有变量")]),
  );
}

async function runOn(engine: Engine, source: string, stepDelayMs: number): Promise<RunResult> {
  active = engine;
  setStatus(`${ENGINE_LABEL[engine.id]} · 准备中…`);
  await engine.ready();
  setStatus(`${ENGINE_LABEL[engine.id]} · 运行中`);
  return engine.run(source, callbacks, { stepDelayMs });
}

let currentRun: Promise<void> = Promise.resolve();

/** Stop the running program (if any) and wait until it has ended. */
async function stopIfRunning(): Promise<void> {
  if (!active) return;
  stop();
  await currentRun;
}

function run(): Promise<void> {
  if (active) return currentRun;
  currentRun = runProgram();
  return currentRun;
}

async function runProgram(): Promise<void> {
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
  void keepThumbnail(result);
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

async function keepThumbnail(result: RunResult): Promise<void> {
  const drew = snapshot(scene).items.length > 0;
  const thumb = drew ? await renderer.toThumbnail(320, 240) : null;
  await session
    .afterRun(result.status === "ok", thumb)
    .catch((e: unknown) => console.error("PyPlay: thumbnail", e));
  const id = session.current?.fromExample ?? null;
  const lesson = id ? lessonById(id) : undefined;
  lessonMissed = false;
  if (result.status === "ok" && lesson && id) {
    if (taskPassed(lesson.task, runStdout, scene)) {
      rememberedDone.add(id);
      await session.projects
        ?.markProgress(id, "done")
        .catch((e: unknown) => console.error("PyPlay: lesson", e));
      toast("这课做到了");
    } else {
      lessonMissed = true;
    }
  }
  await paintLesson();
}

let shownLessonId: string | null | undefined;

async function paintLesson(): Promise<void> {
  const bar = $("lesson");
  const id = session?.current?.fromExample ?? null;
  if (id !== shownLessonId) {
    shownLessonId = id;
    lessonMissed = false;
  }
  const stored = session?.projects ? await session.projects.progress() : [];
  const done = new Set<string>([
    ...rememberedDone,
    ...stored.filter((p) => p.status === "done").map((p) => p.exampleId),
  ]);
  const current = id ? lessonById(id) : undefined;
  const upcoming = nextLesson(done);
  const label = $("lesson-label");
  const task = $("lesson-task");
  const state = $("lesson-state");
  const next = $<HTMLButtonElement>("lesson-next");
  bar.hidden = false;
  if (current && id) {
    const n = lessonIndex(id) + 1;
    const title = EXAMPLE_BY_ID.get(id)?.title ?? "";
    label.textContent = `第 ${n} 课 · ${title}`;
    task.textContent = current.task.prompt;
    const passed = done.has(id);
    state.textContent = passed ? "做到了" : lessonMissed ? "还没对上，再改改" : "改好再运行";
    state.classList.toggle("done", passed);
    const following = LESSONS[n];
    next.hidden = !(passed && following);
    next.textContent = "下一课";
    next.onclick = () => {
      const example = following ? EXAMPLE_BY_ID.get(following.id) : undefined;
      if (example) void loadExample(example);
    };
    return;
  }
  state.classList.remove("done");
  next.hidden = !upcoming;
  next.textContent = "继续上课";
  if (upcoming) {
    const example = EXAMPLE_BY_ID.get(upcoming.id);
    label.textContent = `第 ${lessonIndex(upcoming.id) + 1} 课`;
    task.textContent = example ? `${example.emoji} ${example.title}` : upcoming.id;
    state.textContent = `${done.size} / ${LESSONS.length} 课做到了`;
    next.onclick = () => {
      if (example) void loadExample(example);
    };
    return;
  }
  label.textContent = "学习路径";
  task.textContent = `${LESSONS.length} 课都做到了`;
  state.textContent = "";
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
  // an open modal dialog sits in the top layer; show the toast inside it
  (document.querySelector("dialog[open]") ?? document.body).append(t);
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
  const name = await session.saveScreenshot(blob).catch(() => null);
  download(name ?? "pyplay.png", blob);
  if (name) toast("图片已下载，也保存到了项目里 📷");
});

// ---------------------------------------------------------------- dialogs
let library: ExampleLibrary | null = null;
$("library").addEventListener("click", () => {
  library ??= new ExampleLibrary(session.projects, loadExample);
  void library.open();
});

let panel: ProjectPanel | null = null;
projectBtn.addEventListener("click", () => {
  const projects = session.projects;
  if (!projects) {
    toast("这个浏览器不允许本地存储（可能是隐私模式），作品不会被保存");
    return;
  }
  panel ??= new ProjectPanel(projects, {
    currentId: () => session.current?.id ?? null,
    open: async (id) => {
      await stopIfRunning();
      await session.open(id);
      resetOutput();
    },
    create: async (name, code) => {
      await stopIfRunning();
      await session.createAndOpen(name, code);
      resetOutput();
    },
    changed: async () => {
      await stopIfRunning();
      await session.refresh();
    },
    flush: () => session.flush(),
    toast,
  });
  void panel.open();
});

// a share link pasted into an already open PyPlay tab only changes the hash
window.addEventListener("hashchange", async () => {
  const code = await decodeShare(location.hash).catch(() => null);
  if (code === null) return;
  history.replaceState(null, "", location.pathname);
  await stopIfRunning();
  await session.openShared(code);
  resetOutput();
  toast("已把分享的程序存为新项目");
});

// save before the tab goes away (localStorage already holds a copy)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") void session.flush();
});

// ---------------------------------------------------------------- start
let projects: ProjectService | null = null;
try {
  projects = (await openStorage()).projects;
} catch (e) {
  console.error("PyPlay: local storage unavailable", e);
}
session = new ProjectSession(projects, editor);
session.onChange = renderProject;
const { shared } = await session.start(location.hash);
if (shared) {
  history.replaceState(null, "", location.pathname);
  toast("已把分享的程序存为新项目");
}
renderProject();
if (!projects) output.info("⚠️ 这个浏览器不允许本地存储（可能是隐私模式），作品不会被保存。");

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
