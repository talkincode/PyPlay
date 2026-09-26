/**
 * The example library dialog: browse by category, search, favorites and
 * progress; a detail page with a live preview (the fast engine really runs
 * the example) before anything touches the editor.
 */
import { FastEngine } from "../engines/fast/engine";
import {
  CATEGORIES,
  type Category,
  EXAMPLE_BY_ID,
  EXAMPLES,
  type Example,
  searchExamples,
} from "../examples";
import { LESSONS, lessonById, lessonIndex } from "../learn/lessons";
import { keyEvent, Renderer } from "../render/renderer";
import { Scene } from "../render/scene";
import type { ProgressEntry, ProjectService } from "../storage";
import { h, richText, stars } from "./dom";
import { createCodeView } from "./editor";

type Filter =
  | { kind: "path" }
  | { kind: "all" }
  | { kind: "category"; category: Category }
  | { kind: "favorites" }
  | { kind: "recent" };

const QUICK_SEARCHES = ["循环", "星星", "随机", "列表", "函数", "递归"];
const PROGRESS_LABEL = {
  viewed: "👀 看过",
  loaded: "📥 已加载",
  ran: "✅ 运行过",
  done: "🌟 做到了",
} as const;

export class ExampleLibrary {
  private readonly dialog: HTMLDialogElement;
  private readonly sidebar: HTMLElement;
  private readonly main: HTMLElement;
  private readonly search: HTMLInputElement;
  private filter: Filter = { kind: "path" };
  private favorites = new Set<string>();
  private progress = new Map<string, ProgressEntry>();
  private detailId: string | null = null;
  // live preview
  private readonly preview = new FastEngine();
  private readonly previewScene = new Scene();
  private previewRenderer: Renderer | null = null;
  private previewRun = 0;
  private codeView: ReturnType<typeof createCodeView> | null = null;

  constructor(
    private readonly projects: ProjectService | null,
    private readonly onLoad: (example: Example) => Promise<void>,
  ) {
    this.search = h("input", {
      type: "search",
      class: "lib-search",
      placeholder: "搜索：循环 / 星星 / 随机 / 列表",
      "aria-label": "搜索示例",
    });
    this.search.addEventListener("input", () => {
      this.detailId = null;
      this.render();
    });
    this.sidebar = h("nav", { class: "lib-sidebar", "aria-label": "示例分类" });
    this.main = h("section", { class: "lib-main" });
    this.dialog = h(
      "dialog",
      { class: "big-dialog library", "aria-label": "示例库" },
      h(
        "header",
        { class: "big-head" },
        h("h2", {}, "📚 示例库"),
        this.search,
        h("button", { class: "btn ghost close", title: "关闭", onclick: () => this.close() }, "✕"),
      ),
      h("div", { class: "lib-body" }, this.sidebar, this.main),
    );
    this.dialog.addEventListener("close", () => this.stopPreview());
    document.body.append(this.dialog);
  }

  async open(): Promise<void> {
    await this.reloadState();
    this.detailId = null;
    this.render();
    this.dialog.showModal();
    this.search.focus();
  }

  close(): void {
    this.dialog.close();
  }

  private async reloadState(): Promise<void> {
    if (!this.projects) return;
    this.favorites = new Set((await this.projects.favorites()).map((f) => f.exampleId));
    this.progress = new Map((await this.projects.progress()).map((p) => [p.exampleId, p]));
  }

  // ---------------------------------------------------------------- list

  private visible(): Example[] {
    let list = EXAMPLES;
    const f = this.filter;
    if (f.kind === "path")
      list = LESSONS.map((lesson) => EXAMPLE_BY_ID.get(lesson.id)).filter((e) => e !== undefined);
    if (f.kind === "category") list = list.filter((e) => e.categories.includes(f.category));
    if (f.kind === "favorites") list = list.filter((e) => this.favorites.has(e.id));
    if (f.kind === "recent")
      list = [...this.progress.values()]
        .sort((a, b) => b.viewedAt - a.viewedAt)
        .map((p) => EXAMPLE_BY_ID.get(p.exampleId))
        .filter((e): e is Example => e !== undefined);
    return searchExamples(this.search.value, list);
  }

  private render(): void {
    this.renderSidebar();
    if (this.detailId) this.renderDetail(EXAMPLE_BY_ID.get(this.detailId) as Example);
    else this.renderList();
  }

  private renderSidebar(): void {
    const item = (label: string, filter: Filter, count: string) => {
      const active = JSON.stringify(filter) === JSON.stringify(this.filter);
      return h(
        "button",
        {
          class: `lib-cat${active ? " active" : ""}`,
          "aria-pressed": active ? "true" : "false",
          onclick: () => {
            this.filter = filter;
            this.detailId = null;
            this.render();
          },
        },
        h("span", {}, label),
        h("span", { class: "count" }, count),
      );
    };
    const studied = (list: Example[]) =>
      list.filter((e) => {
        const status = this.progress.get(e.id)?.status;
        return status === "ran" || status === "done";
      }).length;
    const passed = LESSONS.filter((lesson) => this.progress.get(lesson.id)?.status === "done").length;
    this.sidebar.replaceChildren(
      item("上课", { kind: "path" }, `${passed}/${LESSONS.length}`),
      item("全部", { kind: "all" }, `${studied(EXAMPLES)}/${EXAMPLES.length}`),
      item("★ 收藏", { kind: "favorites" }, String(this.favorites.size)),
      item("🕘 最近看过", { kind: "recent" }, String(this.progress.size)),
      h("hr"),
      ...CATEGORIES.map((c) => {
        const list = EXAMPLES.filter((e) => e.categories.includes(c));
        return item(c, { kind: "category", category: c }, `${studied(list)}/${list.length}`);
      }),
      h("p", { class: "lib-hint" }, "上课：做到了。其他：运行过 / 总数"),
    );
  }

  private renderList(): void {
    const list = this.visible();
    const chips = h(
      "div",
      { class: "lib-chips" },
      ...QUICK_SEARCHES.map((q) =>
        h(
          "button",
          {
            class: "chip",
            onclick: () => {
              this.search.value = q;
              this.render();
            },
          },
          q,
        ),
      ),
    );
    const grid = h("div", { class: "lib-grid" }, ...list.map((e) => this.card(e)));
    const empty =
      list.length === 0
        ? h(
            "p",
            { class: "lib-empty" },
            this.filter.kind === "favorites"
              ? "还没有收藏。打开一个示例，点 ☆ 收藏它。"
              : "没有找到匹配的示例，换个词试试。",
          )
        : null;
    this.main.replaceChildren(chips, grid, empty ?? "");
  }

  private summary(e: Example): string {
    const index = lessonIndex(e.id);
    if (this.filter.kind === "path" && index >= 0) return `第 ${index + 1} 课 · ${e.summary}`;
    return e.summary;
  }

  private card(e: Example): HTMLElement {
    const p = this.progress.get(e.id);
    return h(
      "button",
      { class: "lib-card", "data-example": e.id, onclick: () => void this.showDetail(e.id) },
      h("span", { class: "emoji" }, e.emoji),
      h("span", { class: "title" }, e.title),
      h("span", { class: "summary" }, this.summary(e)),
      h(
        "span",
        { class: "meta" },
        h("span", { class: "stars", title: `难度 ${e.difficulty}` }, stars(e.difficulty)),
        this.favorites.has(e.id) ? h("span", { class: "fav", title: "已收藏" }, "★") : null,
        p ? h("span", { class: `badge ${p.status}` }, PROGRESS_LABEL[p.status]) : null,
      ),
    );
  }

  // ---------------------------------------------------------------- detail

  private async showDetail(id: string): Promise<void> {
    this.detailId = id;
    if (this.projects) this.progress.set(id, await this.projects.markProgress(id, "viewed"));
    this.render();
  }

  private renderDetail(e: Example): void {
    const favBtn = h(
      "button",
      { class: "btn ghost fav-toggle", "aria-pressed": this.favorites.has(e.id) ? "true" : "false" },
      this.favorites.has(e.id) ? "★ 已收藏" : "☆ 收藏",
    );
    favBtn.addEventListener("click", async () => {
      if (!this.projects) return;
      const on = await this.projects.toggleFavorite(e.id);
      if (on) this.favorites.add(e.id);
      else this.favorites.delete(e.id);
      favBtn.textContent = on ? "★ 已收藏" : "☆ 收藏";
      favBtn.setAttribute("aria-pressed", on ? "true" : "false");
      this.renderSidebar();
    });
    const canvas = h("canvas", { class: "preview-canvas", "aria-label": "效果预览" });
    const output = h("pre", { class: "preview-output", "aria-label": "预览输出" });
    const codeBox = h("div", { class: "preview-code" });
    const replay = h(
      "button",
      { class: "btn tiny", onclick: () => this.startPreview(e, output) },
      "↻ 重新播放",
    );
    const load = h(
      "button",
      {
        class: "btn run load-example",
        onclick: async () => {
          this.close();
          await this.onLoad(e);
        },
      },
      "加载到编辑器",
    );
    const note =
      e.interactive === "keyboard"
        ? "这个例子要用键盘：点一下预览画布，再按方向键。"
        : e.interactive === "mouse"
          ? "这个例子要用鼠标：在预览画布上点一点。"
          : e.input?.length
            ? `预览会自动输入：${e.input.join("、")}`
            : null;
    this.main.replaceChildren(
      h(
        "div",
        { class: "detail" },
        h(
          "div",
          { class: "detail-head" },
          h("button", { class: "btn ghost", onclick: () => this.back() }, "← 返回"),
          h("h3", {}, `${e.emoji} ${e.title}`),
          favBtn,
        ),
        h(
          "div",
          { class: "detail-cols" },
          h(
            "div",
            { class: "detail-text" },
            h("h4", {}, "你会学到"),
            h("ul", { class: "learn" }, ...e.learn.map((l) => h("li", {}, richText(l)))),
            h("h4", {}, "难度"),
            h("p", { class: "stars big" }, stars(e.difficulty)),
            h("h4", {}, "说明"),
            ...e.explanation.map((p) => h("p", {}, richText(p))),
            lessonById(e.id)
              ? h(
                  "div",
                  { class: "lesson-note" },
                  h("h4", {}, "这一课要做"),
                  h("p", {}, lessonById(e.id)?.task.prompt ?? ""),
                )
              : null,
            h(
              "div",
              { class: "detail-tags" },
              ...e.categories.map((c) => h("span", { class: "chip static" }, c)),
            ),
          ),
          h(
            "div",
            { class: "detail-media" },
            h("div", { class: "media-head" }, h("h4", {}, "效果"), replay),
            h("div", { class: "preview-stage" }, canvas),
            output,
            note ? h("p", { class: "preview-note" }, note) : null,
            h("h4", {}, "代码"),
            codeBox,
          ),
        ),
        h("div", { class: "detail-actions" }, load),
      ),
    );
    this.codeView?.dispose();
    this.codeView = createCodeView(codeBox);
    this.codeView.show(e.code);
    this.attachPreview(canvas);
    this.startPreview(e, output);
  }

  private back(): void {
    this.codeView?.dispose();
    this.codeView = null;
    this.stopPreview();
    this.detailId = null;
    this.render();
  }

  private attachPreview(canvas: HTMLCanvasElement): void {
    this.previewRenderer?.dispose();
    this.previewRenderer = new Renderer(canvas, this.previewScene);
    this.previewRenderer.onEvent = (ev) => this.preview.sendEvent(ev);
    canvas.addEventListener("keydown", (e) => {
      const ev = keyEvent(e, true);
      if (ev) {
        this.preview.sendEvent(ev);
        e.preventDefault();
      }
    });
    canvas.addEventListener("keyup", (e) => {
      const ev = keyEvent(e, false);
      if (ev) this.preview.sendEvent(ev);
    });
  }

  private startPreview(e: Example, output: HTMLElement): void {
    this.preview.abort();
    const run = ++this.previewRun;
    const answers = [...(e.input ?? [])];
    this.previewScene.reset();
    output.textContent = "";
    const write = (t: string) => {
      if (run !== this.previewRun) return;
      output.textContent += t;
      output.scrollTop = output.scrollHeight;
    };
    this.preview
      .run(e.code, {
        stdout: write,
        commands: (cmds) => {
          if (run === this.previewRun) this.previewScene.applyAll(cmds);
        },
        requestInput: () => {
          const next = answers.shift();
          if (next === undefined) {
            write("\n（预览到这里为止，加载到编辑器自己试试！）\n");
            this.preview.abort();
            return;
          }
          write(`${next}\n`);
          this.preview.provideInput(next);
        },
      })
      .then((r) => {
        if (run === this.previewRun && r.status === "error") write(`\n${r.error.traceback}`);
      })
      .catch((err: unknown) => write(`\n预览失败：${String(err)}`));
  }

  private stopPreview(): void {
    this.previewRun++;
    this.preview.abort();
    this.previewRenderer?.dispose();
    this.previewRenderer = null;
  }
}
