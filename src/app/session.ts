/**
 * The project currently open in the editor, and keeping it saved.
 *
 * Edits are written to OPFS (through ProjectService) after a short pause.
 * Because a tab can close before that pause ends, every edit is also copied
 * synchronously to localStorage; on the next start an unsaved copy newer
 * than the file is restored. So nothing a child typed is lost.
 */
import { EXAMPLE_BY_ID, FIRST_EXAMPLE } from "../examples";
import { decodeShare } from "../share";
import type { ProjectMeta, ProjectService } from "../storage";
import type { CodeEditor } from "../ui/editor";

const SAVE_DELAY_MS = 600;
const UNSAVED_KEY = "pyplay.unsaved";
/** Autosave slot of PyPlay before projects existed; migrated once. */
const LEGACY_CODE_KEY = "pyplay.code";

export type SaveState = "saved" | "saving" | "unsaved" | "error" | "memory";

export class ProjectSession {
  current: ProjectMeta | null = null;
  state: SaveState = "saved";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<void> = Promise.resolve();
  /** Called whenever the current project or its save state changes. */
  onChange: () => void = () => {};

  constructor(
    /** null when the browser refuses local storage: nothing is persisted */
    readonly projects: ProjectService | null,
    private readonly editor: CodeEditor,
  ) {
    if (!projects) this.state = "memory";
  }

  /** Decide what to show first: a shared program, the last project, or a starter. */
  async start(hash: string): Promise<{ shared: boolean }> {
    const shared = await decodeShare(hash).catch(() => null);
    if (!this.projects) {
      this.editor.load(shared ?? FIRST_EXAMPLE.code);
      this.onChange();
      return { shared: shared !== null };
    }
    await this.recoverUnsaved();
    if (shared !== null) {
      await this.openShared(shared);
      return { shared: true };
    }
    const last = await this.projects.lastOpenedId();
    if (last) {
      await this.open(last);
      return { shared: false };
    }
    const legacy = localStorage.getItem(LEGACY_CODE_KEY);
    if (legacy !== null) {
      await this.createAndOpen("我的第一个项目", legacy);
      localStorage.removeItem(LEGACY_CODE_KEY);
    } else {
      await this.createAndOpen(FIRST_EXAMPLE.title, FIRST_EXAMPLE.code, { fromExample: FIRST_EXAMPLE.id });
    }
    return { shared: false };
  }

  /** A shared program always becomes a new project, never overwriting one. */
  async openShared(code: string): Promise<void> {
    await this.createAndOpen("分享的程序", code, { tags: ["分享"] });
  }

  async open(id: string): Promise<void> {
    if (!this.projects) return;
    await this.flush();
    const { meta, code } = await this.projects.open(id);
    this.current = meta;
    this.editor.load(code);
    this.setState("saved");
  }

  async createAndOpen(
    name: string,
    code: string,
    opts: { tags?: string[]; fromExample?: string | null } = {},
  ): Promise<ProjectMeta | null> {
    if (!this.projects) {
      this.editor.load(code);
      return null;
    }
    await this.flush();
    const meta = await this.projects.create(name, code, opts);
    await this.open(meta.id);
    return meta;
  }

  /** The editor changed: remember it now, save it soon. */
  edited(code: string): void {
    if (!this.projects || !this.current) return;
    localStorage.setItem(UNSAVED_KEY, JSON.stringify({ id: this.current.id, code, at: Date.now() }));
    this.setState("unsaved");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  /** Write any pending edit now. */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const projects = this.projects;
    const meta = this.current;
    if (!projects || !meta || this.state !== "unsaved") return this.saving;
    const code = this.editor.getCode();
    this.setState("saving");
    this.saving = this.saving
      .then(() => projects.saveCode(meta.id, code))
      .then((updated) => {
        if (this.current?.id === updated.id) this.current = updated;
        const pending = localStorage.getItem(UNSAVED_KEY);
        if (pending && JSON.parse(pending).code === code) localStorage.removeItem(UNSAVED_KEY);
        if (this.state === "saving") this.setState("saved");
      })
      .catch((e: unknown) => {
        console.error("PyPlay: saving failed", e);
        this.setState("error");
      });
    return this.saving;
  }

  async rename(name: string): Promise<void> {
    if (!this.projects || !this.current) return;
    this.current = await this.projects.rename(this.current.id, name);
    this.onChange();
  }

  /** After a finished run: keep a thumbnail and record example progress. */
  async afterRun(ok: boolean, thumbnail: Blob | null): Promise<void> {
    if (!this.projects || !this.current) return;
    const meta = this.current;
    if (thumbnail) await this.projects.saveThumbnail(meta.id, thumbnail);
    if (ok && meta.fromExample && EXAMPLE_BY_ID.has(meta.fromExample)) {
      await this.projects.markProgress(meta.fromExample, "ran");
    }
    this.current = (await this.projects.get(meta.id)) ?? meta;
  }

  async saveScreenshot(png: Blob): Promise<string | null> {
    if (!this.projects || !this.current) return null;
    const name = await this.projects.saveScreenshot(this.current.id, png);
    this.current = (await this.projects.get(this.current.id)) ?? this.current;
    this.onChange();
    return name;
  }

  /** Called when the current project was deleted or changed elsewhere (project panel). */
  async refresh(): Promise<void> {
    if (!this.projects) return;
    const id = this.current?.id;
    const still = id ? await this.projects.get(id) : undefined;
    if (still) {
      this.current = still;
      this.onChange();
      return;
    }
    this.current = null;
    this.state = "saved";
    const next = await this.projects.lastOpenedId();
    if (next) await this.open(next);
    else await this.createAndOpen(FIRST_EXAMPLE.title, FIRST_EXAMPLE.code, { fromExample: FIRST_EXAMPLE.id });
  }

  private async recoverUnsaved(): Promise<void> {
    const raw = localStorage.getItem(UNSAVED_KEY);
    if (!raw || !this.projects) return;
    try {
      const { id, code } = JSON.parse(raw) as { id: string; code: string };
      if (await this.projects.get(id)) await this.projects.saveCode(id, code);
    } catch (e) {
      console.error("PyPlay: could not restore unsaved edit", e);
    }
    localStorage.removeItem(UNSAVED_KEY);
  }

  private setState(s: SaveState): void {
    this.state = s;
    this.onChange();
  }
}
