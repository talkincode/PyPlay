export type SubsetVerdict = { supported: true } | { supported: false; feature: string };

// Placeholder until the fast engine lands: everything runs on full Python.
export function analyzeSubset(_source: string): SubsetVerdict {
  return { supported: false, feature: "快速引擎尚未启用" };
}
