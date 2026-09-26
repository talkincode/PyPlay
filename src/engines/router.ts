import type { EngineId } from "../protocol";

export type EnginePreference = "auto" | EngineId;

export interface EngineChoice {
  engine: EngineId;
  /** Why this engine was chosen, shown to the user. */
  reason: string;
}

/**
 * Decide which engine runs a program.
 *
 * "auto" prefers the fast engine when the program stays inside its
 * supported subset (it starts instantly and supports stepping) and falls
 * back to full Python otherwise. An explicit preference is honoured, except
 * that the fast engine cannot run programs outside its subset.
 */
export function chooseEngine(
  pref: EnginePreference,
  subset: { supported: true } | { supported: false; feature: string },
): EngineChoice {
  if (pref === "python") return { engine: "python", reason: "已选择完整 Python" };
  if (subset.supported) return { engine: "fast", reason: pref === "fast" ? "已选择快速引擎" : "快速引擎" };
  return {
    engine: "python",
    reason: `用到了 ${subset.feature}，改用完整 Python 运行`,
  };
}
