import type { HostEvent } from "../protocol";

/**
 * One-way, blocking-capable message channel from the page to the Pyodide
 * worker, built on a SharedArrayBuffer.
 *
 * The worker runs Python synchronously and cannot receive postMessage while
 * Python is busy, so everything Python may need to *wait* for (input text,
 * UI events, Stop) travels here and the worker blocks with Atomics.wait.
 *
 * Layout: Int32 header [SEQ, LOCK, LEN, reserved] + UTF-8 payload of
 * newline-separated JSON messages.
 */
export type ToWorker = { k: "event"; e: HostEvent } | { k: "input"; v: string | null } | { k: "stop" };

const SEQ = 0;
const LOCK = 1;
const LEN = 2;
const HEADER_BYTES = 16;
export const CHANNEL_BYTES = HEADER_BYTES + 256 * 1024;

export function createChannelBuffer(): SharedArrayBuffer {
  return new SharedArrayBuffer(CHANNEL_BYTES);
}

function lock(i32: Int32Array): void {
  // Critical sections are a few memcpy-sized operations; spinning is fine.
  while (Atomics.compareExchange(i32, LOCK, 0, 1) !== 0) {
    /* spin */
  }
}

function unlock(i32: Int32Array): void {
  Atomics.store(i32, LOCK, 0);
}

export class ChannelWriter {
  private readonly i32: Int32Array;
  private readonly data: Uint8Array;
  private readonly encoder = new TextEncoder();

  constructor(sab: SharedArrayBuffer) {
    this.i32 = new Int32Array(sab, 0, 4);
    this.data = new Uint8Array(sab, HEADER_BYTES);
  }

  /** Returns false if the message was dropped because the buffer is full. */
  send(msg: ToWorker): boolean {
    const bytes = this.encoder.encode(`${JSON.stringify(msg)}\n`);
    lock(this.i32);
    const len = Atomics.load(this.i32, LEN);
    const fits = len + bytes.length <= this.data.length;
    if (fits) {
      this.data.set(bytes, len);
      Atomics.store(this.i32, LEN, len + bytes.length);
    }
    unlock(this.i32);
    if (fits) {
      Atomics.add(this.i32, SEQ, 1);
      Atomics.notify(this.i32, SEQ);
    }
    return fits;
  }
}

export class ChannelReader {
  private readonly i32: Int32Array;
  private readonly data: Uint8Array;
  private readonly decoder = new TextDecoder();

  constructor(sab: SharedArrayBuffer) {
    this.i32 = new Int32Array(sab, 0, 4);
    this.data = new Uint8Array(sab, HEADER_BYTES);
  }

  /** Everything queued right now (never blocks). */
  take(): ToWorker[] {
    lock(this.i32);
    const len = Atomics.load(this.i32, LEN);
    // slice() copies out of shared memory; TextDecoder rejects shared views
    const bytes = len > 0 ? this.data.slice(0, len) : null;
    Atomics.store(this.i32, LEN, 0);
    unlock(this.i32);
    if (!bytes) return [];
    return this.decoder
      .decode(bytes)
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as ToWorker);
  }

  /**
   * Block until at least one message arrives or `timeoutMs` passes
   * (null = forever). Only callable where Atomics.wait is allowed (workers).
   */
  wait(timeoutMs: number | null): ToWorker[] {
    const deadline = timeoutMs === null ? Number.POSITIVE_INFINITY : performance.now() + timeoutMs;
    for (;;) {
      const seq = Atomics.load(this.i32, SEQ);
      const msgs = this.take();
      if (msgs.length > 0) return msgs;
      const remaining = deadline - performance.now();
      if (remaining <= 0) return [];
      Atomics.wait(this.i32, SEQ, seq, Number.isFinite(remaining) ? remaining : undefined);
    }
  }
}
