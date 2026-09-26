/**
 * Tokenizer for the fast engine's Python subset.
 *
 * Anything it does not handle exactly like CPython (tabs in indentation,
 * bytes, imaginary numbers, invalid escapes, ...) raises Unsupported so the
 * program runs on full Python instead — including every syntax error, so
 * kids always see CPython's own SyntaxError messages.
 */
import { Unsupported } from "./errors";

export type TokKind = "name" | "number" | "string" | "op" | "newline" | "indent" | "dedent" | "eof";

export interface StringPart {
  /** literal text, or an f-string replacement field */
  text?: string;
  expr?: { source: string; line: number; conversion: "r" | "s" | null; spec: StringPart[] | null };
}

export interface Token {
  kind: TokKind;
  value: string;
  line: number;
  /** for strings: decoded parts (a plain string is one literal part) */
  parts?: StringPart[];
  fstring?: boolean;
}

const OPERATORS = [
  "**=",
  "//=",
  "->",
  "...",
  "**",
  "//",
  "==",
  "!=",
  "<=",
  ">=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  ":=",
  "<<",
  ">>",
  "&=",
  "|=",
  "^=",
  "@=",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "=",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  ",",
  ":",
  ".",
  ";",
  "@",
  "&",
  "|",
  "^",
  "~",
];

const D = String.raw`\d(?:_?\d)*`;
const EXP = `[eE][+-]?${D}`;
const NUMBER_RE = new RegExp(
  [
    "0[xX](?:_?[0-9a-fA-F])+",
    "0[oO](?:_?[0-7])+",
    "0[bB](?:_?[01])+",
    String.raw`(?:${D})?\.${D}(?:${EXP})?`,
    String.raw`${D}\.(?:${EXP})?`,
    `${D}${EXP}`,
    D,
  ]
    .map((r) => `^(?:${r})`)
    .join("|"),
);

const SIMPLE_ESCAPES: Record<string, string> = {
  "\\": "\\",
  "'": "'",
  '"': '"',
  a: "\x07",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
  "\n": "",
};

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const indents = [0];
  let i = 0;
  let line = 1;
  let depth = 0; // bracket nesting: newlines inside brackets are ignored
  let atLineStart = true;
  const src = source.replace(/\r\n?/g, "\n");

  const push = (kind: TokKind, value: string, extra?: Partial<Token>) =>
    tokens.push({ kind, value, line, ...extra });

  while (i < src.length) {
    if (atLineStart && depth === 0) {
      // measure indentation
      let col = 0;
      let j = i;
      while (j < src.length && (src[j] === " " || src[j] === "\t" || src[j] === "\f")) {
        if (src[j] === "\t") throw new Unsupported("Tab 缩进");
        if (src[j] === " ") col++;
        j++;
      }
      // blank line or comment-only line: no INDENT/DEDENT
      if (j >= src.length || src[j] === "\n" || src[j] === "#") {
        while (j < src.length && src[j] !== "\n") j++;
        if (j < src.length) {
          j++;
          line++;
        }
        i = j;
        continue;
      }
      i = j;
      atLineStart = false;
      const top = indents[indents.length - 1] as number;
      if (col > top) {
        indents.push(col);
        push("indent", "");
      } else if (col < top) {
        while (col < (indents[indents.length - 1] as number)) {
          indents.pop();
          push("dedent", "");
        }
        if (col !== indents[indents.length - 1]) throw new Unsupported("缩进不一致");
      }
    }
    const ch = src[i] as string;
    if (ch === "\n") {
      if (depth === 0) {
        push("newline", "");
        atLineStart = true;
      }
      i++;
      line++;
      continue;
    }
    if (ch === " " || ch === "\f") {
      i++;
      continue;
    }
    if (ch === "\t") {
      i++;
      continue;
    }
    if (ch === "#") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "\\" && src[i + 1] === "\n") {
      i += 2;
      line++;
      continue;
    }
    // names and string prefixes
    if (/[A-Za-z_\u0080-\uffff]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_\u0080-\uffff]/.test(src[j] as string)) j++;
      const word = src.slice(i, j);
      if ((src[j] === "'" || src[j] === '"') && /^(r|u|f|fr|rf|b|br|rb)$/i.test(word)) {
        const lower = word.toLowerCase();
        if (lower.includes("b")) throw new Unsupported("bytes 字面量");
        const res = readString(src, j, line, lower.includes("r"), lower.includes("f"));
        push("string", src.slice(i, res.end), { parts: res.parts, fstring: lower.includes("f") });
        line = res.line;
        i = res.end;
        continue;
      }
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(word)) {
        // non-ASCII identifiers are legal Python but rare; keep CPython in charge
        throw new Unsupported("非 ASCII 标识符");
      }
      push("name", word);
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = src.slice(i).match(NUMBER_RE);
      if (!m) throw new Unsupported("数字写法");
      const text = m[0];
      const j = i + text.length;
      if (/[jJ]/.test(src[j] ?? "")) throw new Unsupported("复数");
      if (/[A-Za-z0-9_]/.test(src[j] ?? "")) throw new Unsupported("数字写法");
      // leading zeros in a non-zero decimal int are a SyntaxError in Python 3
      if (/^0[0-9_]*[1-9]/.test(text) && !/[.eE]/.test(text)) throw new Unsupported("数字写法");
      push("number", text);
      i = j;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const res = readString(src, i, line, false, false);
      push("string", src.slice(i, res.end), { parts: res.parts, fstring: false });
      line = res.line;
      i = res.end;
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (!op) throw new Unsupported(`字符 ${JSON.stringify(ch)}`);
    if ("([{".includes(op)) depth++;
    if (")]}".includes(op)) depth = Math.max(0, depth - 1);
    push("op", op);
    i += op.length;
  }
  if (!atLineStart) push("newline", "");
  while (indents.length > 1) {
    indents.pop();
    push("dedent", "");
  }
  push("eof", "");
  return tokens;
}

interface StringResult {
  parts: StringPart[];
  end: number;
  line: number;
}

function readString(src: string, start: number, line: number, raw: boolean, fstring: boolean): StringResult {
  const q = src[start] as string;
  const triple = src.startsWith(q.repeat(3), start);
  const delim = triple ? q.repeat(3) : q;
  let i = start + delim.length;
  let text = "";
  const parts: StringPart[] = [];
  const flush = () => {
    if (text) parts.push({ text });
    text = "";
  };
  for (;;) {
    if (i >= src.length) throw new Unsupported("字符串未结束");
    const ch = src[i] as string;
    if (src.startsWith(delim, i)) {
      i += delim.length;
      break;
    }
    if (ch === "\n") {
      if (!triple) throw new Unsupported("字符串未结束");
      line++;
      text += ch;
      i++;
      continue;
    }
    if (ch === "\\") {
      const next = src[i + 1] ?? "";
      if (raw) {
        text += ch + next;
        if (next === "\n") line++;
        i += 2;
        continue;
      }
      if (next in SIMPLE_ESCAPES) {
        if (next === "\n") line++;
        text += SIMPLE_ESCAPES[next];
        i += 2;
        continue;
      }
      if (next === "x" && /^[0-9a-fA-F]{2}$/.test(src.slice(i + 2, i + 4))) {
        text += String.fromCharCode(Number.parseInt(src.slice(i + 2, i + 4), 16));
        i += 4;
        continue;
      }
      if (next === "u" && /^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) {
        text += String.fromCharCode(Number.parseInt(src.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      if (next === "U" && /^[0-9a-fA-F]{8}$/.test(src.slice(i + 2, i + 10))) {
        text += String.fromCodePoint(Number.parseInt(src.slice(i + 2, i + 10), 16));
        i += 10;
        continue;
      }
      if (/[0-7]/.test(next)) {
        const m = src.slice(i + 1).match(/^[0-7]{1,3}/) as RegExpMatchArray;
        text += String.fromCharCode(Number.parseInt(m[0], 8));
        i += 1 + m[0].length;
        continue;
      }
      // invalid escapes make CPython print a SyntaxWarning
      throw new Unsupported("字符串转义");
    }
    if (fstring && (ch === "{" || ch === "}")) {
      if (src[i + 1] === ch) {
        text += ch;
        i += 2;
        continue;
      }
      if (ch === "}") throw new Unsupported("f-string 花括号");
      flush();
      const field = readField(src, i + 1, line, delim);
      parts.push({ expr: field.expr });
      i = field.end;
      line = field.line;
      continue;
    }
    text += ch;
    i++;
  }
  flush();
  if (parts.length === 0) parts.push({ text: "" });
  return { parts, end: i, line };
}

/** Parse `expr[!conv][:spec]}` starting after the `{`. */
function readField(
  src: string,
  start: number,
  line: number,
  delim: string,
): { expr: NonNullable<StringPart["expr"]>; end: number; line: number } {
  let i = start;
  let depth = 0;
  const exprStart = i;
  let exprEnd = -1;
  let conversion: "r" | "s" | null = null;
  for (;;) {
    if (i >= src.length || src.startsWith(delim, i)) throw new Unsupported("f-string");
    const ch = src[i] as string;
    if (ch === "'" || ch === '"') {
      // nested string inside the expression
      const q = ch;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") throw new Unsupported("f-string");
        if (src[i] === "\n") throw new Unsupported("f-string");
        i++;
      }
      i++;
      continue;
    }
    if (ch === "\n") line++;
    if ("([{".includes(ch)) depth++;
    else if (")]".includes(ch)) depth--;
    else if (ch === "}" && depth > 0) depth--;
    else if (depth === 0 && ch === "=" && src[i + 1] !== "=" && !"=!<>".includes(src[i - 1] ?? "")) {
      throw new Unsupported("f-string 的 = 调试写法");
    } else if (depth === 0 && ch === "!" && src[i + 1] !== "=") {
      exprEnd = i;
      const c = src[i + 1];
      if (c !== "r" && c !== "s") throw new Unsupported("f-string 转换");
      conversion = c;
      i += 2;
      if (src[i] !== ":" && src[i] !== "}") throw new Unsupported("f-string");
      continue;
    } else if (depth === 0 && (ch === ":" || ch === "}")) {
      if (exprEnd < 0) exprEnd = i;
      break;
    }
    i++;
  }
  const source = src.slice(exprStart, exprEnd);
  if (!source.trim()) throw new Unsupported("f-string 空表达式");
  let spec: StringPart[] | null = null;
  if (src[i] === ":") {
    i++;
    spec = [];
    let text = "";
    for (;;) {
      if (i >= src.length || src.startsWith(delim, i)) throw new Unsupported("f-string");
      const ch = src[i] as string;
      if (ch === "}") break;
      if (ch === "{") {
        if (text) spec.push({ text });
        text = "";
        const inner = readField(src, i + 1, line, delim);
        spec.push({ expr: inner.expr });
        i = inner.end;
        continue;
      }
      text += ch;
      i++;
    }
    if (text) spec.push({ text });
  }
  // src[i] === "}"
  return { expr: { source, line, conversion, spec }, end: i + 1, line };
}
