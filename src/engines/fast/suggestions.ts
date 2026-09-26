/**
 * CPython's "Did you mean" for AttributeError, ported from
 * Lib/traceback.py (_compute_suggestion_error, _levenshtein_distance) with
 * CPython's own dir() lists (cpython-attributes.json), so the fast engine
 * prints the same hint as the real traceback.
 */
import data from "./cpython-attributes.json";

const MAX_CANDIDATE_ITEMS = 750;
const MAX_STRING_SIZE = 40;
const MOVE_COST = 2;
const CASE_COST = 1;

const DIRS = new Map<string, readonly string[]>(
  Object.entries((data as { types: Record<string, string[]> }).types),
);

/** Every attribute name any fast-engine object has on CPython. */
export const CPYTHON_ATTRIBUTES: ReadonlySet<string> = new Set([...DIRS.values()].flat());

export function cpythonDir(kind: string): readonly string[] | undefined {
  return DIRS.get(kind);
}

function substitutionCost(a: string, b: string): number {
  if (a === b) return 0;
  if (a.toLowerCase() === b.toLowerCase()) return CASE_COST;
  return MOVE_COST;
}

export function levenshtein(aIn: string, bIn: string, maxCost: number): number {
  if (aIn === bIn) return 0;
  let a = [...aIn];
  let b = [...bIn];
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  a = a.slice(pre);
  b = b.slice(pre);
  let post = 0;
  while (post < a.length && post < b.length && a[a.length - 1 - post] === b[b.length - 1 - post]) post++;
  a = a.slice(0, a.length - post);
  b = b.slice(0, b.length - post);
  if (!a.length || !b.length) return MOVE_COST * (a.length + b.length);
  if (a.length > MAX_STRING_SIZE || b.length > MAX_STRING_SIZE) return maxCost + 1;
  if (b.length < a.length) [a, b] = [b, a];
  if ((b.length - a.length) * MOVE_COST > maxCost) return maxCost + 1;
  const row: number[] = [];
  for (let i = 1; i <= a.length; i++) row.push(i * MOVE_COST);
  let result = 0;
  for (let bi = 0; bi < b.length; bi++) {
    const bchar = b[bi] as string;
    let distance = bi * MOVE_COST;
    result = distance;
    let minimum = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < a.length; i++) {
      const substitute = distance + substitutionCost(bchar, a[i] as string);
      distance = row[i] as number;
      const insertDelete = Math.min(result, distance) + MOVE_COST;
      result = Math.min(insertDelete, substitute);
      row[i] = result;
      if (result < minimum) minimum = result;
    }
    if (minimum > maxCost) return maxCost + 1;
  }
  return result;
}

/** Suggestion for `obj.wrongName` given CPython's dir(obj), or null. */
export function suggestAttribute(dirList: readonly string[], wrongName: string): string | null {
  let d = [...dirList];
  if (!wrongName.startsWith("_")) d = d.filter((x) => !x.startsWith("_"));
  if (d.length > MAX_CANDIDATE_ITEMS) return null;
  const wrongLen = [...wrongName].length;
  if (wrongLen > MAX_STRING_SIZE) return null;
  let bestDistance = wrongLen;
  let suggestion: string | null = null;
  for (const possible of d) {
    if (possible === wrongName) continue;
    let maxDistance = Math.floor((([...possible].length + wrongLen + 3) * MOVE_COST) / 6);
    maxDistance = Math.min(maxDistance, bestDistance - 1);
    const current = levenshtein(wrongName, possible, maxDistance);
    if (current > maxDistance) continue;
    if (!suggestion || current < bestDistance) {
      suggestion = possible;
      bestDistance = current;
    }
  }
  return suggestion;
}
