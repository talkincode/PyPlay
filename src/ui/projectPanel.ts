/**
 * "我的项目" dialog: the child's local projects (IndexedDB metadata, files in
 * OPFS) — open, create, import, rename, tag, duplicate, export, delete.
 */
import type { ProjectMeta, ProjectService } from "../storage";
import { download, h, relativeTime } from "./dom";

const NEW_PROJECT_CODE = '# 新项目\n\nprint("你好！")\n';

export interface ProjectPanelActions {
  currentId(): string | null;
  open(id: string): Promise<void>;
  create(name: string, code: string): Promise<void>;
  /** The current project changed (renamed, tagged) or disappeared. */
  changed(): Promise<void>;
  /** Make sure the editor's latest text is saved before exporting. */
  flush(): Promise<void>;
  toast(text: string): void;
}

export class ProjectPanel {
  private readonly dialog: HTMLDialogElement;
  private readonly grid: HTMLElement;
  private readonly tagsRow: HTMLElement;
  private readonly footer: HTMLElement;
  private readonly search: HTMLInputElement;
  private readonly fileInput: HTMLInputElement;
  private tagFilter: string | null = null;
  private urls: string[] = [];

  constructor(
    private readonly projects: ProjectService,
    private readonly actions: ProjectPanelActions,
  ) {
    this.search = h("input", {
      type: "search",
      class: "lib-search",
      placeholder: "搜索项目名或标签",
      "aria-label": "搜索项目",
    });
    this.search.addEventListener("input", () => void this.render());
    this.fileInput = h("input", { type: "file", accept: ".py,.txt,text/x-python,text/plain", hidden: true });
    this.fileInput.addEventListener("change", () => void this.importFile());
    this.grid = h("div", { class: "proj-grid" });
    this.tagsRow = h("div", { class: "lib-chips" });
    this.footer = h("footer", { class: "proj-footer" });
    this.dialog = h(
      "dialog",
      { class: "big-dialog projects", "aria-label": "我的项目" },
      h(
        "header",
        { class: "big-head" },
        h("h2", {}, "📁 我的项目"),
        this.search,
        h("button", { class: "btn run", onclick: () => void this.newProject() }, "＋ 新建"),
        h("button", { class: "btn ghost", onclick: () => this.fileInput.click() }, "📂 导入 .py"),
        h("button", { class: "btn ghost close", title: "关闭", onclick: () => this.dialog.close() }, "✕"),
        this.fileInput,
      ),
      h("div", { class: "proj-body" }, this.tagsRow, this.grid),
      this.footer,
    );
    document.body.append(this.dialog);
  }

  async open(): Promise<void> {
    await this.actions.flush();
    await this.render();
    this.dialog.showModal();
  }

  private async render(): Promise<void> {
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
    const all = await this.projects.list();
    const tags = await this.projects.allTags();
    if (this.tagFilter && !tags.includes(this.tagFilter)) this.tagFilter = null;
    const q = this.search.value.trim().toLowerCase();
    const list = all.filter(
      (p) =>
        (!this.tagFilter || p.tags.includes(this.tagFilter)) &&
        (!q || p.name.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q))),
    );
    const tagChip = (label: string, value: string | null) =>
      h(
        "button",
        {
          class: `chip${this.tagFilter === value ? " active" : ""}`,
          onclick: () => {
            this.tagFilter = value;
            void this.render();
          },
        },
        label,
      );
    this.tagsRow.replaceChildren(
      ...(tags.length ? [tagChip("全部", null), ...tags.map((t) => tagChip(`#${t}`, t))] : []),
    );
    const cards = await Promise.all(list.map((p) => this.card(p)));
    this.grid.replaceChildren(...(cards.length ? cards : [h("p", { class: "lib-empty" }, "没有找到项目。")]));
    await this.renderFooter(all.length);
  }

  private async card(p: ProjectMeta): Promise<HTMLElement> {
    const current = this.actions.currentId() === p.id;
    let thumb: HTMLElement = h("span", { class: "thumb placeholder" }, "🐢");
    if (p.hasThumbnail) {
      const blob = await this.projects.thumbnail(p.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        this.urls.push(url);
        thumb = h("img", { class: "thumb", src: url, alt: "" });
      }
    }
    const act = (label: string, title: string, fn: () => Promise<void>) =>
      h(
        "button",
        {
          class: "btn tiny ghost",
          title,
          onclick: (e: Event) => {
            e.stopPropagation();
            void fn().catch((err: unknown) => this.actions.toast(`操作失败：${String(err)}`));
          },
        },
        label,
      );
    return h(
      "article",
      { class: `proj-card${current ? " current" : ""}`, "data-project": p.name },
      h(
        "button",
        {
          class: "proj-open",
          title: "打开",
          onclick: async () => {
            this.dialog.close();
            await this.actions.open(p.id);
          },
        },
        thumb,
        h("span", { class: "title" }, p.name, current ? h("span", { class: "badge ran" }, "当前") : null),
        h(
          "span",
          { class: "summary" },
          `${relativeTime(p.updatedAt)}更新${p.screenshots ? ` · 📷 ${p.screenshots}` : ""}`,
        ),
        h("span", { class: "tags" }, ...p.tags.map((t) => h("span", { class: "chip static" }, `#${t}`))),
      ),
      h(
        "div",
        { class: "proj-actions" },
        act("✏️ 改名", "重命名", async () => {
          const name = prompt("新的项目名：", p.name);
          if (name === null || !name.trim()) return;
          await this.projects.rename(p.id, name);
          await this.refresh(p.id);
        }),
        act("🏷 标签", "设置标签", async () => {
          const text = prompt("标签（用空格或逗号分开）：", p.tags.join(" "));
          if (text === null) return;
          await this.projects.setTags(p.id, text.split(/[\s,，、]+/));
          await this.refresh(p.id);
        }),
        act("📑 复制", "复制一份", async () => {
          await this.projects.duplicate(p.id);
          await this.render();
        }),
        act("⬇ .py", "下载代码", async () => {
          if (current) await this.actions.flush();
          const code = await this.projects.readCode(p.id);
          download(`${p.name}.py`, new Blob([code], { type: "text/x-python" }));
        }),
        act("📦 .zip", "导出整个项目（代码 + 截图）", async () => {
          if (current) await this.actions.flush();
          const zip = await this.projects.exportZip(p.id);
          download(zip.name, new Blob([zip.data as BlobPart], { type: "application/zip" }));
        }),
        act("🗑 删除", "删除项目", async () => {
          if (!confirm(`确定删除项目“${p.name}”吗？删除后不能恢复。`)) return;
          await this.projects.remove(p.id);
          await this.refresh(p.id);
        }),
      ),
    );
  }

  private async refresh(id: string): Promise<void> {
    if (this.actions.currentId() === id) await this.actions.changed();
    await this.render();
  }

  private async newProject(): Promise<void> {
    const name = prompt("新项目的名字：", "我的新项目");
    if (name === null) return;
    this.dialog.close();
    await this.actions.create(name, NEW_PROJECT_CODE);
  }

  private async importFile(): Promise<void> {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = "";
    if (!file) return;
    if (file.size > 1_000_000) {
      this.actions.toast("文件太大了（最多 1 MB）");
      return;
    }
    const code = await file.text();
    this.dialog.close();
    await this.actions.create(file.name.replace(/\.(py|txt)$/i, ""), code);
    this.actions.toast(`已导入 ${file.name}`);
  }

  private async renderFooter(count: number): Promise<void> {
    const where = this.projects.files.kind === "opfs" ? "本机浏览器（OPFS）" : "本机浏览器（IndexedDB）";
    const est = await navigator.storage?.estimate?.().catch(() => undefined);
    const used = est?.usage !== undefined ? ` · 已用 ${(est.usage / 1024 / 1024).toFixed(1)} MB` : "";
    const persisted = (await navigator.storage?.persisted?.().catch(() => false)) ?? false;
    const persistBtn = persisted
      ? h("span", { class: "persist ok" }, "🔒 已防止浏览器自动清理")
      : h(
          "button",
          {
            class: "btn tiny ghost",
            title: "请求浏览器不要在空间紧张时自动清理 PyPlay 的数据",
            onclick: async () => {
              const ok = await navigator.storage?.persist?.().catch(() => false);
              this.actions.toast(ok ? "好的，浏览器会保留你的作品" : "浏览器没有同意，记得定期导出重要作品");
              await this.renderFooter(count);
            },
          },
          "🔒 防止浏览器清理",
        );
    this.footer.replaceChildren(h("span", {}, `${count} 个项目 · 保存在${where}${used}`), persistBtn);
  }
}
