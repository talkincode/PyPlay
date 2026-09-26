/**
 * Decide, before running, whether a program stays inside the fast engine's
 * subset. The rule: run on the fast engine only when it will behave exactly
 * like CPython; otherwise full Python runs it. So this rejects:
 *   - anything the parser rejects (unsupported syntax, every syntax error);
 *   - imports other than math, random, time, turtle;
 *   - Python builtins the fast engine lacks (set, open, id, ...);
 *   - attribute names no fast-engine type or module provides
 *     (a CPython-only method would otherwise become a false AttributeError).
 * Runtime Unsupported signals remain as a backstop.
 */
import type { Expr, Stmt } from "./ast";
import { installBuiltins } from "./builtins";
import { Unsupported } from "./errors";
import { Interpreter } from "./interpreter";
import { createMathModule } from "./modules/math";
import { createRandomModule } from "./modules/random";
import { createTimeModule } from "./modules/time";
import { createTurtleModule, UNSUPPORTED_FUNCTIONS } from "./modules/turtle";
import { parse } from "./parser";
import { CPYTHON_ATTRIBUTES } from "./suggestions";

export type SubsetVerdict = { supported: true } | { supported: false; feature: string };

const FAST_MODULES = new Set(["math", "random", "time", "turtle"]);

const PYTHON_BUILTINS =
  `ArithmeticError AssertionError AttributeError BaseException BaseExceptionGroup BlockingIOError
BrokenPipeError BufferError BytesWarning ChildProcessError ConnectionAbortedError ConnectionError
ConnectionRefusedError ConnectionResetError DeprecationWarning EOFError Ellipsis EncodingWarning EnvironmentError
Exception ExceptionGroup FileExistsError FileNotFoundError FloatingPointError FutureWarning GeneratorExit IOError
ImportError ImportWarning IndentationError IndexError InterruptedError IsADirectoryError KeyError KeyboardInterrupt
LookupError MemoryError ModuleNotFoundError NameError NotADirectoryError NotImplemented NotImplementedError OSError
OverflowError PendingDeprecationWarning PermissionError ProcessLookupError PythonFinalizationError RecursionError
ReferenceError ResourceWarning RuntimeError RuntimeWarning StopAsyncIteration StopIteration SyntaxError
SyntaxWarning SystemError SystemExit TabError TimeoutError TypeError UnboundLocalError UnicodeDecodeError
UnicodeEncodeError UnicodeError UnicodeTranslateError UnicodeWarning UserWarning ValueError Warning
ZeroDivisionError abs aiter all anext any ascii bin bool breakpoint bytearray bytes callable chr classmethod
compile complex copyright credits delattr dict dir divmod enumerate eval exec exit filter float format frozenset
getattr globals hasattr hash help hex id input int isinstance issubclass iter len license list locals map max
memoryview min next object oct open ord pow print property quit range repr reversed round set setattr slice
sorted staticmethod str sum super tuple type vars zip __import__ __build_class__ __debug__ __name__ __doc__`.split(
    /\s+/,
  );

interface Capabilities {
  builtins: Set<string>;
  attributes: Set<string>;
}

let capabilities: Capabilities | null = null;

/** What the fast engine implements, read from the real tables (no copy to drift). */
function getCapabilities(): Capabilities {
  if (capabilities) return capabilities;
  const interp = new Interpreter({ write: () => {}, importModule: () => null });
  installBuiltins(interp);
  const attributes = new Set<string>(["args"]);
  for (const table of interp.methods.values()) for (const name of table.keys()) attributes.add(name);
  const host = { emit: () => {}, measureText: (): [number, number] => [0, 0], now: () => 0 };
  const unsupported = new Set(UNSUPPORTED_FUNCTIONS);
  for (const mod of [
    createMathModule(interp),
    createRandomModule(interp),
    createTimeModule(),
    createTurtleModule(interp, host),
  ]) {
    for (const name of mod.attrs.keys()) if (!unsupported.has(name)) attributes.add(name);
  }
  // Screen-only method names (module-level turtle.clear etc. are the turtle's)
  for (const name of ["clear", "reset", "onclick", "clearscreen", "resetscreen"]) attributes.add(name);
  capabilities = { builtins: new Set(interp.builtins.keys()), attributes };
  return capabilities;
}

export function analyzeSubset(source: string): SubsetVerdict {
  let program: Stmt[];
  try {
    program = parse(source);
  } catch (e) {
    if (e instanceof Unsupported) return { supported: false, feature: e.feature };
    throw e;
  }
  const caps = getCapabilities();
  const defined = new Set<string>();
  const loaded: string[] = [];
  const attributes: string[] = [];
  let problem: string | null = null;

  const target = (e: Expr) => {
    if (e.t === "Name") defined.add(e.id);
    else if (e.t === "Tuple" || e.t === "List") e.elts.forEach(target);
    else expr(e);
  };
  const expr = (e: Expr | null): void => {
    if (!e || problem) return;
    switch (e.t) {
      case "Name":
        loaded.push(e.id);
        return;
      case "Const":
        return;
      case "FString":
        for (const p of e.parts) {
          if (p.expr) expr(p.expr);
          for (const s of p.spec ?? []) if (s.expr) expr(s.expr);
        }
        return;
      case "List":
      case "Tuple":
        e.elts.forEach(expr);
        return;
      case "Dict":
        e.keys.forEach(expr);
        e.values.forEach(expr);
        return;
      case "BinOp":
        expr(e.left);
        expr(e.right);
        return;
      case "UnaryOp":
        expr(e.operand);
        return;
      case "BoolOp":
        e.values.forEach(expr);
        return;
      case "Compare":
        expr(e.left);
        e.comparators.forEach(expr);
        return;
      case "IfExp":
        expr(e.test);
        expr(e.body);
        expr(e.orelse);
        return;
      case "Call":
        expr(e.func);
        e.args.forEach(expr);
        for (const k of e.keywords) expr(k.value);
        return;
      case "Attribute":
        attributes.push(e.attr);
        expr(e.value);
        return;
      case "Subscript":
        expr(e.value);
        expr(e.index);
        return;
      case "Slice":
        expr(e.lower);
        expr(e.upper);
        expr(e.step);
        return;
      case "ListComp":
      case "GenExp":
        for (const g of e.generators) {
          target(g.target);
          expr(g.iter);
          g.ifs.forEach(expr);
        }
        expr(e.elt);
        return;
      case "Lambda":
        for (const p of e.params) {
          defined.add(p.name);
          expr(p.default);
        }
        expr(e.body);
        return;
    }
  };
  const stmts = (body: Stmt[]): void => {
    for (const s of body) {
      if (problem) return;
      switch (s.t) {
        case "Expr":
          expr(s.value);
          break;
        case "Assign":
          expr(s.value);
          s.targets.forEach(target);
          break;
        case "AugAssign":
          expr(s.value);
          target(s.target);
          break;
        case "If":
        case "While":
          expr(s.test);
          stmts(s.body);
          stmts(s.orelse);
          break;
        case "For":
          expr(s.iter);
          target(s.target);
          stmts(s.body);
          stmts(s.orelse);
          break;
        case "Return":
          expr(s.value);
          break;
        case "FunctionDef":
          defined.add(s.name);
          for (const p of s.params) {
            defined.add(p.name);
            expr(p.default);
          }
          stmts(s.body);
          break;
        case "Import":
          for (const n of s.names) {
            if (!FAST_MODULES.has(n.name)) problem = `import ${n.name}`;
            defined.add(n.asname ?? n.name);
          }
          break;
        case "ImportFrom":
          if (!FAST_MODULES.has(s.module)) problem = `from ${s.module} import ...`;
          else if (s.names !== "*")
            for (const n of s.names) {
              if (!caps.attributes.has(n.name)) problem = `from ${s.module} import ${n.name}`;
              defined.add(n.asname ?? n.name);
            }
          else if (
            s.module === "turtle" ||
            s.module === "math" ||
            s.module === "random" ||
            s.module === "time"
          ) {
            // names come from the module; they are all known attributes
            for (const a of caps.attributes) defined.add(a);
          }
          break;
        case "Delete":
          s.targets.forEach(expr);
          break;
        case "Raise":
          expr(s.exc);
          break;
        case "Assert":
          expr(s.test);
          expr(s.msg);
          break;
        case "Try":
          stmts(s.body);
          for (const h of s.handlers) {
            expr(h.type);
            if (h.name) defined.add(h.name);
            stmts(h.body);
          }
          stmts(s.orelse);
          stmts(s.finalbody);
          break;
        case "Global":
        case "Break":
        case "Continue":
        case "Pass":
          break;
      }
    }
  };
  stmts(program);
  if (problem) return { supported: false, feature: problem };
  const pythonBuiltins = new Set(PYTHON_BUILTINS);
  for (const name of loaded) {
    if (!defined.has(name) && !caps.builtins.has(name) && pythonBuiltins.has(name))
      return { supported: false, feature: `内置函数 ${name}` };
  }
  for (const attr of attributes) {
    // unknown to CPython too → a genuine AttributeError the fast engine reports identically
    if (!caps.attributes.has(attr) && CPYTHON_ATTRIBUTES.has(attr))
      return { supported: false, feature: `.${attr}` };
  }
  return { supported: true };
}
