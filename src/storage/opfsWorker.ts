/// <reference lib="webworker" />
/**
 * Writes files into OPFS with a synchronous access handle, for browsers
 * (Safari) whose main thread lacks FileSystemFileHandle.createWritable().
 */
declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (e: MessageEvent<{ id: number; parts: string[]; bytes: ArrayBuffer }>) => {
  const { id, parts, bytes } = e.data;
  try {
    let dir = await navigator.storage.getDirectory();
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
    const file = await dir.getFileHandle(parts[parts.length - 1] as string, { create: true });
    const access = await file.createSyncAccessHandle();
    try {
      access.truncate(0);
      access.write(new Uint8Array(bytes), { at: 0 });
      access.flush();
    } finally {
      access.close();
    }
    self.postMessage({ id });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};

export {};
