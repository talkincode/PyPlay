/**
 * File storage for project files, screenshots and exports.
 *
 * Paths are "/"-separated and relative to PyPlay's root, e.g.
 * "projects/<id>/main.py". Two implementations share one interface:
 *   - OpfsFileStore: the Origin Private File System (the normal case);
 *   - IdbFileStore: blobs in IndexedDB, only when the browser has no OPFS.
 */
import type { PyPlayDB } from "./db";

export interface FileStore {
  readonly kind: "opfs" | "indexeddb";
  read(path: string): Promise<Blob | null>;
  write(path: string, data: Blob | string): Promise<void>;
  /** Names of files directly inside `dir`. */
  list(dir: string): Promise<string[]>;
  /** Delete a file or a whole directory tree; missing paths are fine. */
  remove(path: string): Promise<void>;
}

export async function readText(files: FileStore, path: string): Promise<string | null> {
  const blob = await files.read(path);
  return blob ? blob.text() : null;
}

function split(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  if (parts.some((p) => p === "." || p === "..")) throw new Error(`files: invalid path ${path}`);
  return parts;
}

// ------------------------------------------------------------------ OPFS

export class OpfsFileStore implements FileStore {
  readonly kind = "opfs" as const;
  private worker: Worker | null = null;
  private nextRequest = 1;
  private readonly pending = new Map<number, { resolve(): void; reject(e: Error): void }>();
  /** Writes to one path are serialised so autosaves never interleave. */
  private readonly queues = new Map<string, Promise<void>>();

  private constructor(private readonly root: FileSystemDirectoryHandle) {}

  static async open(): Promise<OpfsFileStore | null> {
    if (!navigator.storage?.getDirectory) return null;
    try {
      return new OpfsFileStore(await navigator.storage.getDirectory());
    } catch {
      return null; // e.g. some private-browsing modes
    }
  }

  private async dir(parts: string[], create: boolean): Promise<FileSystemDirectoryHandle | null> {
    let d = this.root;
    for (const p of parts) {
      try {
        d = await d.getDirectoryHandle(p, { create });
      } catch (e) {
        if (!create && (e as DOMException).name === "NotFoundError") return null;
        throw e;
      }
    }
    return d;
  }

  async read(path: string): Promise<Blob | null> {
    const parts = split(path);
    const dir = await this.dir(parts.slice(0, -1), false);
    if (!dir) return null;
    try {
      const handle = await dir.getFileHandle(parts[parts.length - 1] as string);
      return await handle.getFile();
    } catch (e) {
      if ((e as DOMException).name === "NotFoundError") return null;
      throw e;
    }
  }

  write(path: string, data: Blob | string): Promise<void> {
    const previous = this.queues.get(path) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.writeNow(path, data));
    this.queues.set(path, next);
    return next;
  }

  private async writeNow(path: string, data: Blob | string): Promise<void> {
    const parts = split(path);
    const dir = (await this.dir(parts.slice(0, -1), true)) as FileSystemDirectoryHandle;
    const handle = await dir.getFileHandle(parts[parts.length - 1] as string, { create: true });
    if ("createWritable" in handle) {
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      return;
    }
    // Safari: no createWritable on the main thread; write from a worker
    // with a synchronous access handle instead.
    const bytes = await new Blob([data]).arrayBuffer();
    await this.workerWrite(parts, bytes);
  }

  private workerWrite(parts: string[], bytes: ArrayBuffer): Promise<void> {
    if (!this.worker) {
      this.worker = new Worker(new URL("./opfsWorker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<{ id: number; error?: string }>) => {
        const p = this.pending.get(e.data.id);
        this.pending.delete(e.data.id);
        if (!p) return;
        if (e.data.error) p.reject(new Error(e.data.error));
        else p.resolve();
      };
    }
    const id = this.nextRequest++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker?.postMessage({ id, parts, bytes }, [bytes]);
    });
  }

  async list(dirPath: string): Promise<string[]> {
    const dir = await this.dir(split(dirPath), false);
    if (!dir) return [];
    const names: string[] = [];
    for await (const [name, handle] of dir.entries()) if (handle.kind === "file") names.push(name);
    return names.sort();
  }

  async remove(path: string): Promise<void> {
    const parts = split(path);
    const parent = await this.dir(parts.slice(0, -1), false);
    if (!parent) return;
    try {
      await parent.removeEntry(parts[parts.length - 1] as string, { recursive: true });
    } catch (e) {
      if ((e as DOMException).name !== "NotFoundError") throw e;
    }
  }
}

// ------------------------------------------------------------------ IndexedDB fallback

export class IdbFileStore implements FileStore {
  readonly kind = "indexeddb" as const;
  constructor(private readonly db: PyPlayDB) {}

  async read(path: string): Promise<Blob | null> {
    return (await this.db.get("files", split(path).join("/")))?.data ?? null;
  }

  async write(path: string, data: Blob | string): Promise<void> {
    await this.db.put("files", { path: split(path).join("/"), data: new Blob([data]) });
  }

  async list(dirPath: string): Promise<string[]> {
    const prefix = `${split(dirPath).join("/")}/`;
    const keys = (await this.db.keys("files")) as string[];
    return keys
      .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
      .map((k) => k.slice(prefix.length))
      .sort();
  }

  async remove(path: string): Promise<void> {
    const p = split(path).join("/");
    const keys = (await this.db.keys("files")) as string[];
    for (const k of keys) if (k === p || k.startsWith(`${p}/`)) await this.db.delete("files", k);
  }
}

// ------------------------------------------------------------------ memory (tests)

export class MemoryFileStore implements FileStore {
  readonly kind = "indexeddb" as const;
  readonly data = new Map<string, Blob>();
  async read(path: string): Promise<Blob | null> {
    return this.data.get(split(path).join("/")) ?? null;
  }
  async write(path: string, data: Blob | string): Promise<void> {
    this.data.set(split(path).join("/"), new Blob([data]));
  }
  async list(dirPath: string): Promise<string[]> {
    const prefix = `${split(dirPath).join("/")}/`;
    return [...this.data.keys()]
      .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
      .map((k) => k.slice(prefix.length))
      .sort();
  }
  async remove(path: string): Promise<void> {
    const p = split(path).join("/");
    for (const k of [...this.data.keys()]) if (k === p || k.startsWith(`${p}/`)) this.data.delete(k);
  }
}
