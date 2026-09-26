/**
 * The example library. Order here is the order of "全部".
 * tests/conformance/examples.test.ts runs every example on real CPython and
 * on the fast engine; add an example here and it is tested automatically.
 */
import { BASICS } from "./basics";
import { CHALLENGES } from "./challenges";
import { FUNCTIONS } from "./functions";
import { GAMES } from "./games";
import { LISTS } from "./lists";
import { MATH } from "./math";
import { RANDOM } from "./random";
import { STRINGS } from "./strings";
import { TURTLE } from "./turtle";
import type { Example } from "./types";

export const EXAMPLES: Example[] = [
  ...BASICS,
  ...TURTLE,
  ...GAMES,
  ...MATH,
  ...STRINGS,
  ...LISTS,
  ...RANDOM,
  ...FUNCTIONS,
  ...CHALLENGES,
];

export const EXAMPLE_BY_ID = new Map(EXAMPLES.map((e) => [e.id, e]));

/** Program a brand-new PyPlay user starts with. */
export const FIRST_EXAMPLE = EXAMPLE_BY_ID.get("star") as Example;

export { CATEGORIES, type Category, type Example } from "./types";

/** Case-insensitive search over title, summary, keywords, learn list and categories. */
export function searchExamples(query: string, list: Example[] = EXAMPLES): Example[] {
  const words = query
    .toLowerCase()
    .split(/[\s/,，、]+/)
    .filter(Boolean);
  if (!words.length) return list;
  return list.filter((e) => {
    const hay = [e.title, e.summary, ...e.keywords, ...e.learn, ...e.categories, e.code]
      .join(" ")
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
