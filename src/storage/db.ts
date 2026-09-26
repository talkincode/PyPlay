/**
 * PyPlay's IndexedDB: small, structured data about the child's work.
 *
 *   projects   project metadata (name, tags, timestamps, origin example)
 *   favorites  example ids the child starred
 *   progress   per-example learning progress (viewed / loaded / ran / done)
 *   kv         small settings, e.g. the last opened project
 *   files      file contents — used only when the browser has no OPFS
 *
 * Code, screenshots and exports live in OPFS (see files.ts), not here.
 */

export interface ProjectMeta {
  id: string;
  name: string;
  /** main file inside the project directory */
  entry: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  openedAt: number;
  /** example the project was created from, if any */
  fromExample: string | null;
  hasThumbnail: boolean;
  screenshots: number;
}

export type ProgressStatus = "viewed" | "loaded" | "ran" | "done";

export interface ProgressEntry {
  exampleId: string;
  status: ProgressStatus;
  viewedAt: number;
  updatedAt: number;
}

export interface FavoriteEntry {
  exampleId: string;
  addedAt: number;
}

interface StoreTypes {
  projects: ProjectMeta;
  favorites: FavoriteEntry;
  progress: ProgressEntry;
  kv: { key: string; value: unknown };
  files: { path: string; data: Blob };
}

export type StoreName = keyof StoreTypes;

const DB_NAME = "pyplay";
const DB_VERSION = 1;

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export class PyPlayDB {
  private constructor(private readonly db: IDBDatabase) {}

  static open(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<PyPlayDB> {
    return new Promise((resolve, reject) => {
      const req = factory.open(name, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // version 1 schema; later versions add migrations here
        const projects = db.createObjectStore("projects", { keyPath: "id" });
        projects.createIndex("openedAt", "openedAt");
        projects.createIndex("updatedAt", "updatedAt");
        projects.createIndex("tags", "tags", { multiEntry: true });
        db.createObjectStore("favorites", { keyPath: "exampleId" });
        db.createObjectStore("progress", { keyPath: "exampleId" }).createIndex("viewedAt", "viewedAt");
        db.createObjectStore("kv", { keyPath: "key" });
        db.createObjectStore("files", { keyPath: "path" });
      };
      req.onsuccess = () => resolve(new PyPlayDB(req.result));
      req.onerror = () => reject(req.error ?? new Error("cannot open IndexedDB"));
      req.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another PyPlay tab"));
    });
  }

  get<S extends StoreName>(store: S, key: IDBValidKey): Promise<StoreTypes[S] | undefined> {
    return promisify(this.db.transaction(store).objectStore(store).get(key));
  }

  getAll<S extends StoreName>(store: S): Promise<StoreTypes[S][]> {
    return promisify(this.db.transaction(store).objectStore(store).getAll());
  }

  async put<S extends StoreName>(store: S, value: StoreTypes[S]): Promise<void> {
    await promisify(this.db.transaction(store, "readwrite").objectStore(store).put(value));
  }

  async delete<S extends StoreName>(store: S, key: IDBValidKey): Promise<void> {
    await promisify(this.db.transaction(store, "readwrite").objectStore(store).delete(key));
  }

  /** Keys of a store (used by the IndexedDB file fallback to list directories). */
  keys(store: StoreName): Promise<IDBValidKey[]> {
    return promisify(this.db.transaction(store).objectStore(store).getAllKeys());
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    return (await this.get("kv", key))?.value as T | undefined;
  }

  setSetting(key: string, value: unknown): Promise<void> {
    return this.put("kv", { key, value });
  }

  close(): void {
    this.db.close();
  }
}
