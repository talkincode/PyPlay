/**
 * Local projects: metadata in IndexedDB, files in the FileStore (OPFS).
 *
 *   projects/<id>/main.py            the code
 *   projects/<id>/thumbnail.png      last drawing (shown in the project list)
 *   projects/<id>/screenshots/*.png  pictures the child saved
 *
 * Also owns example favorites and learning progress, which are small
 * records keyed by example id.
 */
import type { FavoriteEntry, ProgressEntry, ProgressStatus, ProjectMeta, PyPlayDB } from "./db";
import { type FileStore, readText } from "./files";
import { buildZip } from "./zip";

const LAST_PROJECT = "lastProjectId";
const PROGRESS_RANK: Record<ProgressStatus, number> = { viewed: 1, loaded: 2, ran: 3, done: 4 };

export interface CreateOptions {
  tags?: string[];
  fromExample?: string | null;
}

function dir(id: string): string {
  return `projects/${id}`;
}

function normaliseTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(0, 12);
}

export class ProjectService {
  constructor(
    readonly db: PyPlayDB,
    readonly files: FileStore,
    private readonly clock: () => number = Date.now,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  // ---------------------------------------------------------------- projects

  /** All projects, most recently opened first. */
  async list(): Promise<ProjectMeta[]> {
    const all = await this.db.getAll("projects");
    return all.sort((a, b) => b.openedAt - a.openedAt || b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<ProjectMeta | undefined> {
    return this.db.get("projects", id);
  }

  async create(name: string, code: string, opts: CreateOptions = {}): Promise<ProjectMeta> {
    const now = this.clock();
    const meta: ProjectMeta = {
      id: this.newId(),
      name: (name.trim() || "未命名项目").slice(0, 60),
      entry: "main.py",
      tags: normaliseTags(opts.tags ?? []),
      createdAt: now,
      updatedAt: now,
      openedAt: now,
      fromExample: opts.fromExample ?? null,
      hasThumbnail: false,
      screenshots: 0,
    };
    // file first: a project record must never point at missing code
    await this.files.write(`${dir(meta.id)}/${meta.entry}`, code);
    await this.db.put("projects", meta);
    return meta;
  }

  /** Mark as opened and return its code. */
  async open(id: string): Promise<{ meta: ProjectMeta; code: string }> {
    const meta = await this.require(id);
    const code = (await readText(this.files, `${dir(id)}/${meta.entry}`)) ?? "";
    meta.openedAt = this.clock();
    await this.db.put("projects", meta);
    await this.db.setSetting(LAST_PROJECT, id);
    return { meta, code };
  }

  /** The project's code, without marking it as opened. */
  async readCode(id: string): Promise<string> {
    const meta = await this.require(id);
    return (await readText(this.files, `${dir(id)}/${meta.entry}`)) ?? "";
  }

  async lastOpenedId(): Promise<string | undefined> {
    const id = await this.db.getSetting<string>(LAST_PROJECT);
    if (id && (await this.get(id))) return id;
    return (await this.list())[0]?.id;
  }

  async saveCode(id: string, code: string): Promise<ProjectMeta> {
    const meta = await this.require(id);
    await this.files.write(`${dir(id)}/${meta.entry}`, code);
    meta.updatedAt = this.clock();
    await this.db.put("projects", meta);
    return meta;
  }

  async rename(id: string, name: string): Promise<ProjectMeta> {
    const meta = await this.require(id);
    const clean = name.trim().slice(0, 60);
    if (!clean) throw new Error("项目名不能为空");
    meta.name = clean;
    meta.updatedAt = this.clock();
    await this.db.put("projects", meta);
    return meta;
  }

  async setTags(id: string, tags: string[]): Promise<ProjectMeta> {
    const meta = await this.require(id);
    meta.tags = normaliseTags(tags);
    meta.updatedAt = this.clock();
    await this.db.put("projects", meta);
    return meta;
  }

  async duplicate(id: string): Promise<ProjectMeta> {
    const meta = await this.require(id);
    const code = await this.readCode(id);
    return this.create(`${meta.name} 副本`, code, { tags: meta.tags, fromExample: meta.fromExample });
  }

  async remove(id: string): Promise<void> {
    await this.db.delete("projects", id);
    await this.files.remove(dir(id));
    if ((await this.db.getSetting<string>(LAST_PROJECT)) === id) await this.db.setSetting(LAST_PROJECT, null);
  }

  /** Every tag used by any project, most used first. */
  async allTags(): Promise<string[]> {
    const counts = new Map<string, number>();
    for (const p of await this.db.getAll("projects"))
      for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"))
      .map(([t]) => t);
  }

  // ---------------------------------------------------------------- images & export

  async saveThumbnail(id: string, png: Blob): Promise<void> {
    const meta = await this.require(id);
    await this.files.write(`${dir(id)}/thumbnail.png`, png);
    if (!meta.hasThumbnail) {
      meta.hasThumbnail = true;
      await this.db.put("projects", meta);
    }
  }

  thumbnail(id: string): Promise<Blob | null> {
    return this.files.read(`${dir(id)}/thumbnail.png`);
  }

  /** Store a screenshot in the project; returns its file name. */
  async saveScreenshot(id: string, png: Blob): Promise<string> {
    const meta = await this.require(id);
    const d = new Date(this.clock());
    const pad = (n: number) => String(n).padStart(2, "0");
    const name = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
    await this.files.write(`${dir(id)}/screenshots/${name}`, png);
    meta.screenshots = (await this.files.list(`${dir(id)}/screenshots`)).length;
    await this.db.put("projects", meta);
    return name;
  }

  /** ZIP of the project directory: the code plus saved screenshots. */
  async exportZip(id: string): Promise<{ name: string; data: Uint8Array }> {
    const meta = await this.require(id);
    const code = (await readText(this.files, `${dir(id)}/${meta.entry}`)) ?? "";
    const entries = [{ name: `${meta.name}/${meta.entry}`, data: new TextEncoder().encode(code) }];
    for (const shot of await this.files.list(`${dir(id)}/screenshots`)) {
      const blob = await this.files.read(`${dir(id)}/screenshots/${shot}`);
      if (blob)
        entries.push({
          name: `${meta.name}/screenshots/${shot}`,
          data: new Uint8Array(await blob.arrayBuffer()),
        });
    }
    return { name: `${meta.name}.zip`, data: buildZip(entries, new Date(this.clock())) };
  }

  // ---------------------------------------------------------------- examples

  async favorites(): Promise<FavoriteEntry[]> {
    return (await this.db.getAll("favorites")).sort((a, b) => b.addedAt - a.addedAt);
  }

  /** Toggle a favorite; returns the new state. */
  async toggleFavorite(exampleId: string): Promise<boolean> {
    if (await this.db.get("favorites", exampleId)) {
      await this.db.delete("favorites", exampleId);
      return false;
    }
    await this.db.put("favorites", { exampleId, addedAt: this.clock() });
    return true;
  }

  async progress(): Promise<ProgressEntry[]> {
    return this.db.getAll("progress");
  }

  /** Record progress; a status never goes backwards (ran > loaded > viewed). */
  async markProgress(exampleId: string, status: ProgressStatus): Promise<ProgressEntry> {
    const now = this.clock();
    const prev = await this.db.get("progress", exampleId);
    const entry: ProgressEntry = {
      exampleId,
      status: prev && PROGRESS_RANK[prev.status] >= PROGRESS_RANK[status] ? prev.status : status,
      viewedAt: status === "viewed" ? now : (prev?.viewedAt ?? now),
      updatedAt: now,
    };
    await this.db.put("progress", entry);
    return entry;
  }

  private async require(id: string): Promise<ProjectMeta> {
    const meta = await this.get(id);
    if (!meta) throw new Error(`项目不存在：${id}`);
    return meta;
  }
}
