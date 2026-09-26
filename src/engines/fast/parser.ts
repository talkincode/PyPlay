/**
 * Recursive-descent parser for the fast engine's Python subset.
 *
 * It accepts only valid Python. Anything outside the subset — or any syntax
 * error — throws Unsupported, and the program runs on full Python, which
 * reports syntax errors with CPython's exact messages.
 */
import type { BinOpName, CmpOp, Comprehension, Expr, FPart, Param, Stmt } from "./ast";
import { Unsupported } from "./errors";
import { type StringPart, type Token, tokenize } from "./lexer";
import { parseIntLiteral } from "./numbers";

const KEYWORDS = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

const UNSUPPORTED_KEYWORDS: Record<string, string> = {
  class: "class 类定义",
  with: "with 语句",
  yield: "yield 生成器",
  async: "async",
  await: "await",
  nonlocal: "nonlocal",
};

export function parse(source: string): Stmt[] {
  return new Parser(tokenize(source)).module();
}

class Parser {
  private pos = 0;
  constructor(private readonly toks: Token[]) {}

  private get tok(): Token {
    return this.toks[this.pos] as Token;
  }
  /** Current token kind (a method, so TypeScript does not narrow it across pos++). */
  private kind(): Token["kind"] {
    return (this.toks[this.pos] as Token).kind;
  }
  private peek(n = 1): Token {
    return this.toks[Math.min(this.pos + n, this.toks.length - 1)] as Token;
  }
  private next(): Token {
    return this.toks[this.pos++] as Token;
  }
  private isOp(v: string): boolean {
    return this.kind() === "op" && this.tok.value === v;
  }
  private isKw(v: string): boolean {
    return this.kind() === "name" && this.tok.value === v;
  }
  private eatOp(v: string): boolean {
    if (this.isOp(v)) {
      this.pos++;
      return true;
    }
    return false;
  }
  private eatKw(v: string): boolean {
    if (this.isKw(v)) {
      this.pos++;
      return true;
    }
    return false;
  }
  private expectOp(v: string): void {
    if (!this.eatOp(v)) this.fail(`expected '${v}'`);
  }
  private expectKw(v: string): void {
    if (!this.eatKw(v)) this.fail(`expected '${v}'`);
  }
  private fail(what: string): never {
    throw new Unsupported(`语法（第 ${this.tok.line} 行：${what}）`);
  }
  private name(): string {
    const t = this.tok;
    if (t.kind !== "name" || KEYWORDS.has(t.value)) this.fail("expected a name");
    this.pos++;
    return t.value;
  }

  module(): Stmt[] {
    const body: Stmt[] = [];
    while (this.kind() !== "eof") {
      if (this.kind() === "newline") {
        this.pos++;
        continue;
      }
      body.push(...this.statement());
    }
    return body;
  }

  private block(): Stmt[] {
    this.expectOp(":");
    if (this.kind() !== "newline") {
      // one-line body: `if x: y`
      return this.simpleStatements();
    }
    this.pos++;
    if (this.kind() !== "indent") this.fail("expected an indented block");
    this.pos++;
    const body: Stmt[] = [];
    while (this.kind() !== "dedent" && this.kind() !== "eof") {
      if (this.kind() === "newline") {
        this.pos++;
        continue;
      }
      body.push(...this.statement());
    }
    if (this.kind() === "dedent") this.pos++;
    return body;
  }

  private statement(): Stmt[] {
    const t = this.tok;
    if (t.kind === "indent") this.fail("unexpected indent");
    if (t.kind === "name") {
      const unsupported = UNSUPPORTED_KEYWORDS[t.value];
      if (unsupported) throw new Unsupported(unsupported);
      switch (t.value) {
        case "if":
          return [this.ifStmt()];
        case "while":
          return [this.whileStmt()];
        case "for":
          return [this.forStmt()];
        case "def":
          return [this.defStmt()];
        case "try":
          return [this.tryStmt()];
      }
    }
    if (t.kind === "op" && t.value === "@") throw new Unsupported("装饰器");
    return this.simpleStatements();
  }

  private simpleStatements(): Stmt[] {
    const out = [this.smallStatement()];
    while (this.eatOp(";")) {
      if (this.kind() === "newline") break;
      out.push(this.smallStatement());
    }
    if (this.kind() !== "newline" && this.kind() !== "eof") this.fail("expected end of line");
    if (this.kind() === "newline") this.pos++;
    return out;
  }

  private ifStmt(): Stmt {
    const line = this.tok.line;
    this.pos++; // if / elif
    const test = this.namedExpr();
    const body = this.block();
    let orelse: Stmt[] = [];
    if (this.isKw("elif")) orelse = [this.ifStmt()];
    else if (this.eatKw("else")) orelse = this.block();
    return { t: "If", line, test, body, orelse };
  }

  private whileStmt(): Stmt {
    const line = this.next().line;
    const test = this.namedExpr();
    const body = this.block();
    const orelse = this.eatKw("else") ? this.block() : [];
    return { t: "While", line, test, body, orelse };
  }

  private forStmt(): Stmt {
    const line = this.next().line;
    const target = this.targetList();
    this.expectKw("in");
    const iter = this.exprList();
    const body = this.block();
    const orelse = this.eatKw("else") ? this.block() : [];
    return { t: "For", line, target, iter, body, orelse };
  }

  private defStmt(): Stmt {
    const line = this.next().line;
    const name = this.name();
    this.expectOp("(");
    const params = this.params(")");
    this.expectOp(")");
    if (this.isOp("->")) throw new Unsupported("类型注解");
    const body = this.block();
    return { t: "FunctionDef", line, name, params, body };
  }

  private params(close: string): Param[] {
    const params: Param[] = [];
    let sawDefault = false;
    while (!this.isOp(close)) {
      if (this.isOp("*") || this.isOp("**") || this.isOp("/")) throw new Unsupported("*args / **kwargs 参数");
      const name = this.name();
      if (this.isOp(":") && close === ")") throw new Unsupported("类型注解");
      let def: Expr | null = null;
      if (this.eatOp("=")) {
        def = this.expr();
        sawDefault = true;
      } else if (sawDefault) this.fail("non-default argument follows default argument");
      if (params.some((p) => p.name === name)) this.fail("duplicate argument");
      params.push({ name, default: def });
      if (!this.eatOp(",")) break;
    }
    return params;
  }

  private tryStmt(): Stmt {
    const line = this.next().line;
    const body = this.block();
    const handlers: Array<{ line: number; type: Expr | null; name: string | null; body: Stmt[] }> = [];
    while (this.isKw("except")) {
      const hline = this.next().line;
      if (this.isOp("*")) throw new Unsupported("except*");
      let type: Expr | null = null;
      let name: string | null = null;
      if (!this.isOp(":")) {
        type = this.expr();
        if (this.eatKw("as")) name = this.name();
      }
      handlers.push({ line: hline, type, name, body: this.block() });
    }
    const orelse = handlers.length && this.eatKw("else") ? this.block() : [];
    const finalbody = this.eatKw("finally") ? this.block() : [];
    if (!handlers.length && !finalbody.length) this.fail("expected 'except' or 'finally' block");
    return { t: "Try", line, body, handlers, orelse, finalbody };
  }

  private smallStatement(): Stmt {
    const t = this.tok;
    const line = t.line;
    if (t.kind === "name") {
      const unsupported = UNSUPPORTED_KEYWORDS[t.value];
      if (unsupported) throw new Unsupported(unsupported);
      switch (t.value) {
        case "pass":
          this.pos++;
          return { t: "Pass", line };
        case "break":
          this.pos++;
          return { t: "Break", line };
        case "continue":
          this.pos++;
          return { t: "Continue", line };
        case "return": {
          this.pos++;
          const value = this.atStatementEnd() ? null : this.exprList();
          return { t: "Return", line, value };
        }
        case "global": {
          this.pos++;
          const names = [this.name()];
          while (this.eatOp(",")) names.push(this.name());
          return { t: "Global", line, names };
        }
        case "import":
          return this.importStmt();
        case "from":
          return this.fromStmt();
        case "del": {
          this.pos++;
          const targets = [this.primary()];
          while (this.eatOp(",")) targets.push(this.primary());
          return { t: "Delete", line, targets };
        }
        case "raise": {
          this.pos++;
          const exc = this.atStatementEnd() ? null : this.expr();
          if (this.isKw("from")) throw new Unsupported("raise ... from");
          return { t: "Raise", line, exc };
        }
        case "assert": {
          this.pos++;
          const test = this.expr();
          const msg = this.eatOp(",") ? this.expr() : null;
          return { t: "Assert", line, test, msg };
        }
      }
    }
    const first = this.exprListOrStar();
    const augOps: Record<string, BinOpName> = {
      "+=": "+",
      "-=": "-",
      "*=": "*",
      "/=": "/",
      "//=": "//",
      "%=": "%",
      "**=": "**",
    };
    if (this.kind() === "op" && this.tok.value in augOps) {
      const op = augOps[this.next().value] as BinOpName;
      this.checkTarget(first, false);
      const value = this.exprList();
      return { t: "AugAssign", line, target: first, op, value };
    }
    if (this.isOp(":")) throw new Unsupported("变量类型注解");
    if (this.kind() === "op" && ["&=", "|=", "^=", "<<=", ">>=", "@="].includes(this.tok.value))
      throw new Unsupported("位运算赋值");
    if (this.isOp("=")) {
      const targets = [first];
      let value = first;
      while (this.eatOp("=")) {
        value = this.exprListOrStar();
        targets.push(value);
      }
      targets.pop();
      for (const tg of targets) this.checkTarget(tg, true);
      return { t: "Assign", line, targets, value };
    }
    return { t: "Expr", line, value: first };
  }

  private atStatementEnd(): boolean {
    return this.kind() === "newline" || this.kind() === "eof" || this.isOp(";");
  }

  private checkTarget(e: Expr, allowTuple: boolean): void {
    if (e.t === "Name") {
      if (e.id === "__debug__") this.fail("cannot assign");
      return;
    }
    if (e.t === "Subscript") return;
    if (e.t === "Attribute") throw new Unsupported("给属性赋值");
    if (allowTuple && (e.t === "Tuple" || e.t === "List")) {
      for (const x of e.elts) this.checkTarget(x, true);
      return;
    }
    this.fail("cannot assign to expression");
  }

  private importStmt(): Stmt {
    const line = this.next().line;
    const names: Array<{ name: string; asname: string | null }> = [];
    do {
      const name = this.dottedName();
      const asname = this.eatKw("as") ? this.name() : null;
      names.push({ name, asname });
    } while (this.eatOp(","));
    return { t: "Import", line, names };
  }

  private fromStmt(): Stmt {
    const line = this.next().line;
    if (this.isOp(".")) throw new Unsupported("相对导入");
    const module = this.dottedName();
    this.expectKw("import");
    if (this.eatOp("*")) return { t: "ImportFrom", line, module, names: "*" };
    const paren = this.eatOp("(");
    const names: Array<{ name: string; asname: string | null }> = [];
    do {
      if (paren && this.isOp(")")) break;
      const name = this.name();
      const asname = this.eatKw("as") ? this.name() : null;
      names.push({ name, asname });
    } while (this.eatOp(","));
    if (paren) this.expectOp(")");
    return { t: "ImportFrom", line, module, names };
  }

  private dottedName(): string {
    let n = this.name();
    while (this.eatOp(".")) n += `.${this.name()}`;
    return n;
  }

  // ------------------------------------------------------------ expressions

  private targetList(): Expr {
    const line = this.tok.line;
    const first = this.primaryTarget();
    if (!this.isOp(",")) return first;
    const elts = [first];
    while (this.eatOp(",")) {
      if (this.isKw("in") || this.isOp("=")) break;
      elts.push(this.primaryTarget());
    }
    return { t: "Tuple", line, elts };
  }

  private primaryTarget(): Expr {
    if (this.isOp("(") || this.isOp("[")) {
      const e = this.atom();
      this.checkTarget(e, true);
      return e;
    }
    const e = this.primary();
    this.checkTarget(e, false);
    return e;
  }

  private exprListOrStar(): Expr {
    if (this.isOp("*")) throw new Unsupported("* 解包");
    return this.exprList();
  }

  private exprList(): Expr {
    const line = this.tok.line;
    const first = this.expr();
    if (!this.isOp(",")) return first;
    const elts = [first];
    while (this.eatOp(",")) {
      if (this.atExprListEnd()) break;
      if (this.isOp("*")) throw new Unsupported("* 解包");
      elts.push(this.expr());
    }
    return { t: "Tuple", line, elts };
  }

  private atExprListEnd(): boolean {
    const t = this.tok;
    return (
      t.kind === "newline" ||
      t.kind === "eof" ||
      (t.kind === "op" && ["=", ")", "]", "}", ":", ";"].includes(t.value)) ||
      (t.kind === "op" &&
        t.value.endsWith("=") &&
        t.value.length > 1 &&
        !["==", "!=", "<=", ">="].includes(t.value))
    );
  }

  private namedExpr(): Expr {
    const e = this.expr();
    if (this.isOp(":=")) throw new Unsupported("海象运算符 :=");
    return e;
  }

  expr(): Expr {
    if (this.isKw("lambda")) return this.lambda();
    const line = this.tok.line;
    const body = this.orTest();
    if (this.eatKw("if")) {
      const test = this.orTest();
      this.expectKw("else");
      const orelse = this.expr();
      return { t: "IfExp", line, test, body, orelse };
    }
    return body;
  }

  private lambda(): Expr {
    const line = this.next().line;
    const params = this.params(":");
    this.expectOp(":");
    const body = this.expr();
    return { t: "Lambda", line, params, body };
  }

  private orTest(): Expr {
    const line = this.tok.line;
    const first = this.andTest();
    if (!this.isKw("or")) return first;
    const values = [first];
    while (this.eatKw("or")) values.push(this.andTest());
    return { t: "BoolOp", line, op: "or", values };
  }

  private andTest(): Expr {
    const line = this.tok.line;
    const first = this.notTest();
    if (!this.isKw("and")) return first;
    const values = [first];
    while (this.eatKw("and")) values.push(this.notTest());
    return { t: "BoolOp", line, op: "and", values };
  }

  private notTest(): Expr {
    if (this.isKw("not")) {
      const line = this.next().line;
      return { t: "UnaryOp", line, op: "not", operand: this.notTest() };
    }
    return this.comparison();
  }

  private comparison(): Expr {
    const line = this.tok.line;
    const left = this.arith();
    const ops: CmpOp[] = [];
    const comparators: Expr[] = [];
    for (;;) {
      let op: CmpOp | null = null;
      const t = this.tok;
      if (t.kind === "op" && ["<", ">", "<=", ">=", "==", "!="].includes(t.value)) {
        op = t.value as CmpOp;
        this.pos++;
      } else if (this.isKw("in")) {
        op = "in";
        this.pos++;
      } else if (this.isKw("not") && this.peek().kind === "name" && this.peek().value === "in") {
        op = "not in";
        this.pos += 2;
      } else if (this.isKw("is")) {
        this.pos++;
        op = this.eatKw("not") ? "is not" : "is";
      }
      if (!op) break;
      ops.push(op);
      comparators.push(this.arith());
    }
    if (this.kind() === "op" && ["|", "&", "^", "<<", ">>", "~", "@"].includes(this.tok.value))
      throw new Unsupported("位运算");
    return ops.length ? { t: "Compare", line, left, ops, comparators } : left;
  }

  private arith(): Expr {
    let left = this.term();
    while (this.isOp("+") || this.isOp("-")) {
      const line = this.tok.line;
      const op = this.next().value as BinOpName;
      left = { t: "BinOp", line, op, left, right: this.term() };
    }
    return left;
  }

  private term(): Expr {
    let left = this.factor();
    while (this.isOp("*") || this.isOp("/") || this.isOp("//") || this.isOp("%")) {
      const line = this.tok.line;
      const op = this.next().value as BinOpName;
      left = { t: "BinOp", line, op, left, right: this.factor() };
    }
    if (this.isOp("@")) throw new Unsupported("@ 运算符");
    return left;
  }

  private factor(): Expr {
    if (this.isOp("-") || this.isOp("+")) {
      const line = this.tok.line;
      const op = this.next().value as "-" | "+";
      return { t: "UnaryOp", line, op, operand: this.factor() };
    }
    if (this.isOp("~")) throw new Unsupported("位运算 ~");
    return this.power();
  }

  private power(): Expr {
    const base = this.primary();
    if (this.isOp("**")) {
      const line = this.next().line;
      return { t: "BinOp", line, op: "**", left: base, right: this.factor() };
    }
    return base;
  }

  private primary(): Expr {
    let e = this.atom();
    for (;;) {
      const line = this.tok.line;
      if (this.eatOp("(")) {
        e = this.call(e, line);
      } else if (this.eatOp("[")) {
        const index = this.subscript();
        this.expectOp("]");
        e = { t: "Subscript", line, value: e, index };
      } else if (this.isOp(".")) {
        this.pos++;
        const attr = this.name();
        e = { t: "Attribute", line, value: e, attr };
      } else break;
    }
    return e;
  }

  private call(func: Expr, line: number): Expr {
    const args: Expr[] = [];
    const keywords: Array<{ name: string; value: Expr }> = [];
    while (!this.isOp(")")) {
      if (this.isOp("*") || this.isOp("**")) throw new Unsupported("*args / **kwargs 调用");
      if (this.kind() === "name" && this.peek().kind === "op" && this.peek().value === "=") {
        const name = this.name();
        this.pos++;
        if (keywords.some((k) => k.name === name)) this.fail("keyword argument repeated");
        keywords.push({ name, value: this.expr() });
      } else {
        if (keywords.length) this.fail("positional argument follows keyword argument");
        const argLine = this.tok.line;
        const value = this.namedExpr();
        if (this.isKw("for")) {
          // f(x for x in y)
          const generators = this.comprehensions();
          args.push({ t: "GenExp", line: argLine, elt: value, generators });
          if (!this.isOp(")") || args.length > 1) this.fail("generator expression must be parenthesized");
          break;
        }
        args.push(value);
      }
      if (!this.eatOp(",")) break;
    }
    this.expectOp(")");
    return { t: "Call", line, func, args, keywords };
  }

  private subscript(): Expr {
    const line = this.tok.line;
    const item = this.sliceItem();
    if (!this.isOp(",")) return item;
    const elts = [item];
    while (this.eatOp(",")) {
      if (this.isOp("]")) break;
      elts.push(this.sliceItem());
    }
    return { t: "Tuple", line, elts };
  }

  private sliceItem(): Expr {
    const line = this.tok.line;
    let lower: Expr | null = null;
    if (!this.isOp(":")) {
      lower = this.expr();
      if (!this.isOp(":")) return lower;
    }
    this.expectOp(":");
    const upper = this.isOp(":") || this.isOp("]") || this.isOp(",") ? null : this.expr();
    let step: Expr | null = null;
    if (this.eatOp(":")) step = this.isOp("]") || this.isOp(",") ? null : this.expr();
    return { t: "Slice", line, lower, upper, step };
  }

  private comprehensions(): Comprehension[] {
    const gens: Comprehension[] = [];
    while (this.isKw("for")) {
      this.pos++;
      const target = this.targetList();
      this.expectKw("in");
      const iter = this.orTest();
      const ifs: Expr[] = [];
      while (this.isKw("if")) {
        this.pos++;
        ifs.push(this.orTestNoCond());
      }
      gens.push({ target, iter, ifs });
    }
    if (this.isKw("async")) throw new Unsupported("async");
    return gens;
  }

  private orTestNoCond(): Expr {
    return this.orTest();
  }

  private atom(): Expr {
    const t = this.tok;
    const line = t.line;
    switch (t.kind) {
      case "number": {
        this.pos++;
        const text = t.value;
        if (/^0[xob]/i.test(text) || !/[.eE]/.test(text))
          return { t: "Const", line, value: parseIntLiteral(text) };
        return { t: "Const", line, value: Number(text.replace(/_/g, "")) };
      }
      case "string":
        return this.strings();
      case "name": {
        if (t.value === "True" || t.value === "False") {
          this.pos++;
          return { t: "Const", line, value: t.value === "True" };
        }
        if (t.value === "None") {
          this.pos++;
          return { t: "Const", line, value: null };
        }
        if (t.value === "lambda") return this.lambda();
        const unsupported = UNSUPPORTED_KEYWORDS[t.value];
        if (unsupported) throw new Unsupported(unsupported);
        return { t: "Name", line, id: this.name() };
      }
      case "op":
        break;
      default:
        this.fail("unexpected token");
    }
    if (this.eatOp("(")) {
      if (this.eatOp(")")) return { t: "Tuple", line, elts: [] };
      const first = this.namedExpr();
      if (this.isKw("for")) {
        const generators = this.comprehensions();
        this.expectOp(")");
        return { t: "GenExp", line, elt: first, generators };
      }
      if (this.eatOp(")")) return first;
      const elts = [first];
      while (this.eatOp(",")) {
        if (this.isOp(")")) break;
        elts.push(this.expr());
      }
      this.expectOp(")");
      return { t: "Tuple", line, elts };
    }
    if (this.eatOp("[")) {
      if (this.eatOp("]")) return { t: "List", line, elts: [] };
      const first = this.namedExpr();
      if (this.isKw("for")) {
        const generators = this.comprehensions();
        this.expectOp("]");
        return { t: "ListComp", line, elt: first, generators };
      }
      const elts = [first];
      while (this.eatOp(",")) {
        if (this.isOp("]")) break;
        elts.push(this.expr());
      }
      this.expectOp("]");
      return { t: "List", line, elts };
    }
    if (this.eatOp("{")) {
      if (this.eatOp("}")) return { t: "Dict", line, keys: [], values: [] };
      if (this.isOp("**")) throw new Unsupported("字典 ** 解包");
      const k = this.expr();
      if (!this.isOp(":")) throw new Unsupported("集合 set");
      this.pos++;
      const v = this.expr();
      if (this.isKw("for")) throw new Unsupported("字典推导式");
      const keys = [k];
      const values = [v];
      while (this.eatOp(",")) {
        if (this.isOp("}")) break;
        keys.push(this.expr());
        this.expectOp(":");
        values.push(this.expr());
      }
      this.expectOp("}");
      return { t: "Dict", line, keys, values };
    }
    if (this.isOp("...")) throw new Unsupported("Ellipsis ...");
    this.fail(`unexpected '${t.value}'`);
  }

  private strings(): Expr {
    const line = this.tok.line;
    const parts: FPart[] = [];
    let anyF = false;
    while (this.kind() === "string") {
      const t = this.next();
      if (t.fstring) anyF = true;
      for (const p of t.parts as StringPart[]) parts.push(this.convertPart(p));
    }
    if (!anyF) return { t: "Const", line, value: parts.map((p) => p.text ?? "").join("") };
    return { t: "FString", line, parts };
  }

  private convertPart(p: StringPart): FPart {
    if (p.text !== undefined) return { text: p.text };
    const f = p.expr as NonNullable<StringPart["expr"]>;
    const sub = new Parser(
      tokenize(`(${f.source.trim()})`).map((tk) => ({ ...tk, line: tk.line + f.line - 1 })),
    );
    const expr = sub.expr();
    if (sub.tok.kind !== "newline" && sub.tok.kind !== "eof") sub.fail("f-string expression");
    return {
      expr,
      conversion: f.conversion,
      spec: f.spec ? f.spec.map((s) => this.convertPart(s)) : null,
    };
  }
}
