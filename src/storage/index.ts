import { PyPlayDB } from "./db";
import { type FileStore, IdbFileStore, OpfsFileStore } from "./files";
import { ProjectService } from "./projects";

export interface Storage {
  projects: ProjectService;
  files: FileStore;
}

/** Open PyPlay's local storage: IndexedDB for metadata, OPFS for files (IndexedDB if OPFS is missing). */
export async function openStorage(): Promise<Storage> {
  const db = await PyPlayDB.open();
  const files: FileStore = (await OpfsFileStore.open()) ?? new IdbFileStore(db);
  return { projects: new ProjectService(db, files), files };
}

export type { ProgressEntry, ProgressStatus, ProjectMeta } from "./db";
export type { ProjectService } from "./projects";
