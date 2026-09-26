import type { HostEvent, RunResult } from "../../protocol";
import type { Engine, RunCallbacks } from "../engine";

export class FastEngine implements Engine {
  readonly id = "fast" as const;
  ready(): Promise<void> {
    return Promise.resolve();
  }
  run(_source: string, _cb: RunCallbacks): Promise<RunResult> {
    return Promise.reject(new Error("fast engine not implemented"));
  }
  provideInput(_value: string | null): void {}
  sendEvent(_ev: HostEvent): void {}
  stop(): void {}
}
