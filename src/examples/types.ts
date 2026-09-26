/** One entry of the example library. Every example must run identically on CPython and the fast engine. */
export interface Example {
  id: string;
  title: string;
  emoji: string;
  /** Short line on the card, e.g. "for 循环" */
  summary: string;
  categories: Category[];
  /** Extra search words (concepts, functions) */
  keywords: string[];
  difficulty: 1 | 2 | 3;
  /** "你会学到" */
  learn: string[];
  /** "说明": paragraphs; `backticks` mark code */
  explanation: string[];
  code: string;
  /** Answers typed into input() during the preview (and the conformance test) */
  input?: string[];
  /** Needs the keyboard or mouse to do anything interesting */
  interactive?: "keyboard" | "mouse";
}

export const CATEGORIES = [
  "入门",
  "Turtle",
  "小游戏",
  "数学",
  "字符串",
  "列表",
  "随机",
  "函数",
  "挑战",
] as const;
export type Category = (typeof CATEGORIES)[number];
