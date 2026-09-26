/**
 * The fast engine's evaluator.
 *
 * Every evaluation function is a generator: `yield` hands a Suspend request
 * (input, sleep, wait for events, time-slice tick) to the engine driver,
 * which resumes it later. That lets a program pause anywhere on the main
 * thread without a worker or SharedArrayBuffer.
 *
 * Control flow inside blocks uses completion codes (not exceptions) so loops
 * stay cheap; Python exceptions are JS exceptions (PyException).
 */
import type { Comprehension, Expr, Param, Stmt } from "./ast";
import { EXC, PyException, type PyExcType, pyErr, type TraceFrame, Unsupported } from "./errors";
import { formatValue } from "./format";
import { binaryOp, compareOp, unaryMinus, unaryPlus } from "./ops";
import { CPYTHON_ATTRIBUTES, cpythonDir, suggestAttribute } from "./suggestions";
import {
  type CallArgs,
  DONE,
  type Gen,
  isInt,
  PyBoundMethod,
  PyBuiltin,
  PyDict,
  PyDictView,
  PyExcClass,
  PyExceptionValue,
  PyIterator,
  PyList,
  PyModule,
  PyNative,
  PyObject,
  PyRange,
  PyTuple,
  PyTypeObject,
  type PyValue,
  repr,
  type Suspend,
  str,
  toBig,
  truthy,
  typeName,
} from "./values";

const NORMAL = 0;
const BREAK = 1;
const CONTINUE = 2;
const RETURN = 3;
type Completion = typeof NORMAL | typeof BREAK | typeof CONTINUE | typeof RETURN;

export const RECURSION_LIMIT = 1000;
/** Statements between cooperative time-slice checks. */
const TICK_EVERY = 2000;

/** A variable scope. Module scope has `locals === null` and uses globals. */
export class Scope {
  readonly vars = new Map<string, PyValue>();
  constructor(
    /** names local to this function (null: module scope) */
    readonly locals: Set<string> | null,
    readonly globalNames: Set<string>,
    readonly parent: Scope | null,
    readonly globals: Map<string, PyValue>,
  ) {}
}

export class PyFunction extends PyObject {
  readonly typeName = "function";
  constructor(
    readonly name: string,
    readonly params: Param[],
    readonly defaults: PyValue[],
    readonly body: Stmt[] | Expr,
    readonly closure: Scope,
    readonly localNames: Set<string>,
    readonly globalNames: Set<string>,
  ) {
    super();
  }
}

interface Frame {
  name: string;
  line: number;
}

/** Lazily evaluated generator expression. */
class GenState {
  constructor(public gen: Generator<Suspend | Produced, void, unknown>) {}
}
class Produced {
  constructor(readonly value: PyValue) {}
}

export interface InterpreterHost {
  write(text: string): void;
  /** Resolve `import name` (null → ModuleNotFoundError). */
  importModule(name: string): PyModule | null;
}

export class Interpreter {
  readonly globals = new Map<string, PyValue>();
  readonly builtins = new Map<string, PyValue>();
  readonly frames: Frame[] = [{ name: "<module>", line: 0 }];
  private ops = 0;
  /** When set, yield before every statement (stepping / line highlight). */
  stepping = false;
  /** Latest line reported to the host. */
  currentLine = 0;
  /** Scope of the statement about to run, so stepping can show its variables. */
  private stepScope: Scope | null = null;
  /** str/list/dict/... methods, installed by builtins.ts */
  methods = new Map<string, Map<string, (self: PyValue, call: CallArgs) => PyValue | Gen<PyValue>>>();

  constructor(readonly host: InterpreterHost) {
    this.globals.set("__name__", "__main__");
  }

  // ---------------------------------------------------------------- program

  *run(program: Stmt[]): Gen<void> {
    const scope = new Scope(null, new Set(), null, this.globals);
    try {
      yield* this.execBlock(program, scope);
    } catch (e) {
      throw this.withTrace(e);
    }
  }

  /** Attach a traceback snapshot to a Python exception the first time it passes through a frame. */
  private withTrace(e: unknown): unknown {
    if (e instanceof PyException && e.frames.length === 0) {
      e.frames = this.frames.map((f): TraceFrame => ({ name: f.name, line: f.line }));
    }
    // A JS stack overflow (RangeError) is left alone: FastProgram turns it
    // into "run on full Python", because CPython may well succeed at that depth.
    return e;
  }

  private setLine(line: number): void {
    (this.frames[this.frames.length - 1] as Frame).line = line;
  }

  // ---------------------------------------------------------------- statements

  *execBlock(body: Stmt[], scope: Scope): Gen<Completion> {
    for (const s of body) {
      const c = yield* this.execStmt(s, scope);
      if (c !== NORMAL) return c;
    }
    return NORMAL;
  }

  private returnValue: PyValue = null;

  *execStmt(s: Stmt, scope: Scope): Gen<Completion> {
    this.stepScope = scope;
    this.setLine(s.line);
    this.currentLine = s.line;
    if (this.stepping) yield { kind: "tick" };
    else if (++this.ops >= TICK_EVERY) {
      this.ops = 0;
      yield { kind: "tick" };
    }
    switch (s.t) {
      case "Expr":
        yield* this.eval(s.value, scope);
        return NORMAL;
      case "Assign": {
        const value = yield* this.eval(s.value, scope);
        for (const target of s.targets) yield* this.assign(target, value, scope);
        return NORMAL;
      }
      case "AugAssign": {
        const t = s.target;
        if (t.t === "Name") {
          const cur = this.lookup(t.id, scope, t.line);
          const rhs = yield* this.eval(s.value, scope);
          this.setLine(s.line);
          this.store(t.id, this.augmented(s.op, cur, rhs), scope);
        } else if (t.t === "Subscript") {
          const obj = yield* this.eval(t.value, scope);
          const idx = yield* this.eval(t.index, scope);
          const cur = this.getItem(obj, idx);
          const rhs = yield* this.eval(s.value, scope);
          this.setLine(s.line);
          this.setItem(obj, idx, this.augmented(s.op, cur, rhs));
        } else throw new Unsupported("增强赋值目标");
        return NORMAL;
      }
      case "If":
        if (truthy(yield* this.eval(s.test, scope))) return yield* this.execBlock(s.body, scope);
        return yield* this.execBlock(s.orelse, scope);
      case "While": {
        while (truthy(yield* this.eval(s.test, scope))) {
          const c = yield* this.execBlock(s.body, scope);
          if (c === BREAK) return NORMAL;
          if (c === RETURN) return c;
          this.setLine(s.line);
        }
        return yield* this.execBlock(s.orelse, scope);
      }
      case "For": {
        const iterable = yield* this.eval(s.iter, scope);
        const next = this.iterator(iterable);
        for (;;) {
          this.setLine(s.line);
          const item = yield* this.advance(next);
          if (item === DONE) break;
          yield* this.assign(s.target, item, scope);
          const c = yield* this.execBlock(s.body, scope);
          if (c === BREAK) return NORMAL;
          if (c === RETURN) return c;
        }
        return yield* this.execBlock(s.orelse, scope);
      }
      case "Break":
        return BREAK;
      case "Continue":
        return CONTINUE;
      case "Pass":
      case "Global":
        return NORMAL;
      case "Return":
        this.returnValue = s.value ? yield* this.eval(s.value, scope) : null;
        return RETURN;
      case "FunctionDef": {
        const defaults: PyValue[] = [];
        for (const p of s.params) if (p.default) defaults.push(yield* this.eval(p.default, scope));
        const { locals, globals } = analyzeFunction(s.params, s.body);
        this.store(s.name, new PyFunction(s.name, s.params, defaults, s.body, scope, locals, globals), scope);
        return NORMAL;
      }
      case "Import":
        for (const { name, asname } of s.names) {
          if (name.includes(".")) throw new Unsupported(`import ${name}`);
          this.store(asname ?? name, this.importModule(name), scope);
        }
        return NORMAL;
      case "ImportFrom": {
        const mod = this.importModule(s.module);
        if (s.names === "*") {
          for (const [k, v] of mod.attrs) if (!k.startsWith("_")) this.store(k, v, scope);
        } else {
          for (const { name, asname } of s.names) {
            const v = mod.attrs.get(name);
            if (v === undefined)
              throw pyErr(EXC.ImportError, `cannot import name '${name}' from '${s.module}'`);
            this.store(asname ?? name, v, scope);
          }
        }
        return NORMAL;
      }
      case "Delete":
        for (const t of s.targets) yield* this.deleteTarget(t, scope);
        return NORMAL;
      case "Raise": {
        if (!s.exc) throw new Unsupported("单独的 raise");
        const v = yield* this.eval(s.exc, scope);
        this.setLine(s.line);
        if (v instanceof PyExcClass) throw new PyException(v.exc, "");
        if (v instanceof PyExceptionValue) throw v.exc;
        throw pyErr(EXC.TypeError, "exceptions must derive from BaseException");
      }
      case "Assert": {
        if (!truthy(yield* this.eval(s.test, scope))) {
          const msg = s.msg ? yield* this.eval(s.msg, scope) : null;
          this.setLine(s.line);
          throw msg === null
            ? new PyException(EXC.AssertionError, "")
            : new PyException(EXC.AssertionError, str(msg), [msg]);
        }
        return NORMAL;
      }
      case "Try":
        return yield* this.execTry(s, scope);
    }
  }

  private *execTry(s: Extract<Stmt, { t: "Try" }>, scope: Scope): Gen<Completion> {
    let completion: Completion = NORMAL;
    try {
      let raised: PyException | null = null;
      try {
        completion = yield* this.execBlock(s.body, scope);
      } catch (e) {
        const err = this.withTrace(e);
        if (!(err instanceof PyException)) throw err;
        raised = err;
      }
      if (raised) {
        let handled = false;
        for (const h of s.handlers) {
          if (h.type && !(yield* this.matches(raised, h.type, scope))) continue;
          handled = true;
          if (h.name) this.store(h.name, new PyExceptionValue(raised), scope);
          completion = yield* this.execBlock(h.body, scope);
          break;
        }
        if (!handled) throw raised;
      } else if (completion === NORMAL) {
        completion = yield* this.execBlock(s.orelse, scope);
      }
    } finally {
      if (s.finalbody.length) {
        const c = yield* this.execBlock(s.finalbody, scope);
        if (c !== NORMAL) completion = c;
      }
    }
    return completion;
  }

  private *matches(err: PyException, typeExpr: Expr, scope: Scope): Gen<boolean> {
    const t = yield* this.eval(typeExpr, scope);
    const classes = t instanceof PyTuple ? t.items : [t];
    for (const c of classes) {
      if (!(c instanceof PyExcClass))
        throw pyErr(EXC.TypeError, "catching classes that do not inherit from BaseException is not allowed");
      if (err.type.isSubclassOf(c.exc)) return true;
    }
    return false;
  }

  private augmented(op: Extract<Stmt, { t: "AugAssign" }>["op"], cur: PyValue, rhs: PyValue): PyValue {
    if (op === "+" && cur instanceof PyList) {
      // list += iterable extends in place
      if (rhs instanceof PyList || rhs instanceof PyTuple) {
        cur.items.push(...rhs.items);
        return cur;
      }
      throw new Unsupported("list += 非列表");
    }
    return binaryOp(op, cur, rhs);
  }

  private importModule(name: string): PyModule {
    const mod = this.host.importModule(name);
    if (!mod) throw pyErr(EXC.ModuleNotFoundError, `No module named '${name}'`);
    return mod;
  }

  /** Simple names a child can read at the current step. Modules and turtles are left out. */
  bindings(): { name: string; value: string }[] {
    const scope = this.stepScope;
    if (!scope) return [];
    const entries = scope.locals ? [...scope.vars] : [...scope.globals];
    const out: { name: string; value: string }[] = [];
    for (const [name, value] of entries) {
      if (name.startsWith("_") || !this.shownValue(value)) continue;
      let text = repr(value);
      if (text.length > 28) text = `${text.slice(0, 27)}…`;
      out.push({ name, value: text });
      if (out.length === 6) break;
    }
    return out;
  }

  private shownValue(v: PyValue): boolean {
    if (
      v === null ||
      typeof v === "string" ||
      typeof v === "boolean" ||
      typeof v === "number" ||
      typeof v === "bigint"
    )
      return true;
    if (v instanceof PyList || v instanceof PyTuple)
      return v.items.length <= 8 && v.items.every((item) => this.shownValue(item));
    return false;
  }

  // ---------------------------------------------------------------- names

  lookup(name: string, scope: Scope, line: number): PyValue {
    this.setLine(line);
    if (scope.locals?.has(name)) {
      const v = scope.vars.get(name);
      if (v === undefined)
        throw pyErr(
          EXC.UnboundLocalError,
          `cannot access local variable '${name}' where it is not associated with a value`,
        );
      return v;
    }
    if (!scope.globalNames.has(name)) {
      for (let s = scope.parent; s?.locals; s = s.parent) {
        if (s.locals.has(name)) {
          const v = s.vars.get(name);
          if (v === undefined)
            throw pyErr(
              EXC.NameError,
              `cannot access free variable '${name}' where it is not associated with a value in enclosing scope`,
            );
          return v;
        }
      }
    }
    const g = scope.globals.get(name);
    if (g !== undefined) return g;
    const b = this.builtins.get(name);
    if (b !== undefined) return b;
    throw pyErr(EXC.NameError, `name '${name}' is not defined`);
  }

  store(name: string, value: PyValue, scope: Scope): void {
    if (scope.locals && !scope.globalNames.has(name)) scope.vars.set(name, value);
    else scope.globals.set(name, value);
  }

  private *assign(target: Expr, value: PyValue, scope: Scope): Gen<void> {
    switch (target.t) {
      case "Name":
        this.store(target.id, value, scope);
        return;
      case "Subscript": {
        const obj = yield* this.eval(target.value, scope);
        const idx = yield* this.eval(target.index, scope);
        this.setItem(obj, idx, value);
        return;
      }
      case "Tuple":
      case "List": {
        const items = yield* this.collect(value);
        const n = target.elts.length;
        if (items.length > n)
          throw pyErr(EXC.ValueError, `too many values to unpack (expected ${n}, got ${items.length})`);
        if (items.length < n)
          throw pyErr(EXC.ValueError, `not enough values to unpack (expected ${n}, got ${items.length})`);
        for (let i = 0; i < n; i++) yield* this.assign(target.elts[i] as Expr, items[i] as PyValue, scope);
        return;
      }
      default:
        throw new Unsupported("赋值目标");
    }
  }

  private *deleteTarget(t: Expr, scope: Scope): Gen<void> {
    if (t.t === "Name") {
      this.lookup(t.id, scope, t.line);
      if (scope.locals && !scope.globalNames.has(t.id)) scope.vars.delete(t.id);
      else scope.globals.delete(t.id);
      return;
    }
    if (t.t === "Subscript") {
      const obj = yield* this.eval(t.value, scope);
      const idx = yield* this.eval(t.index, scope);
      this.setLine(t.line);
      if (obj instanceof PyList) {
        if (idx instanceof PyObject && idx.typeName === "slice") throw new Unsupported("del 切片");
        const i = this.index(idx, obj.items.length, "list");
        obj.items.splice(i, 1);
        return;
      }
      if (obj instanceof PyDict) {
        if (!obj.delete(idx)) throw new PyException(EXC.KeyError, repr(idx), [idx]);
        return;
      }
      throw pyErr(EXC.TypeError, `'${typeName(obj)}' object doesn't support item deletion`);
    }
    throw new Unsupported("del 目标");
  }

  // ---------------------------------------------------------------- expressions

  *eval(e: Expr, scope: Scope): Gen<PyValue> {
    switch (e.t) {
      case "Const":
        return e.value;
      case "Name":
        return this.lookup(e.id, scope, e.line);
      case "FString":
        return yield* this.fstring(e.parts, scope);
      case "List": {
        const items: PyValue[] = [];
        for (const x of e.elts) items.push(yield* this.eval(x, scope));
        return new PyList(items);
      }
      case "Tuple": {
        const items: PyValue[] = [];
        for (const x of e.elts) items.push(yield* this.eval(x, scope));
        return new PyTuple(items);
      }
      case "Dict": {
        const d = new PyDict();
        for (let i = 0; i < e.keys.length; i++) {
          const k = yield* this.eval(e.keys[i] as Expr, scope);
          const v = yield* this.eval(e.values[i] as Expr, scope);
          this.setLine(e.line);
          d.set(k, v);
        }
        return d;
      }
      case "BinOp": {
        const a = yield* this.eval(e.left, scope);
        const b = yield* this.eval(e.right, scope);
        this.setLine(e.line);
        return binaryOp(e.op, a, b);
      }
      case "UnaryOp": {
        const v = yield* this.eval(e.operand, scope);
        this.setLine(e.line);
        if (e.op === "not") return !truthy(v);
        return e.op === "-" ? unaryMinus(v) : unaryPlus(v);
      }
      case "BoolOp": {
        let v: PyValue = null;
        for (const x of e.values) {
          v = yield* this.eval(x, scope);
          if (e.op === "and" ? !truthy(v) : truthy(v)) return v;
        }
        return v;
      }
      case "Compare": {
        let left = yield* this.eval(e.left, scope);
        for (let i = 0; i < e.ops.length; i++) {
          const right = yield* this.eval(e.comparators[i] as Expr, scope);
          this.setLine(e.line);
          if (!compareOp(e.ops[i] as Parameters<typeof compareOp>[0], left, right)) return false;
          left = right;
        }
        return true;
      }
      case "IfExp":
        return truthy(yield* this.eval(e.test, scope))
          ? yield* this.eval(e.body, scope)
          : yield* this.eval(e.orelse, scope);
      case "Call": {
        const fn = yield* this.eval(e.func, scope);
        const args: PyValue[] = [];
        for (const a of e.args) args.push(yield* this.eval(a, scope));
        const kwargs = new Map<string, PyValue>();
        for (const k of e.keywords) kwargs.set(k.name, yield* this.eval(k.value, scope));
        this.setLine(e.line);
        return yield* this.call(fn, { args, kwargs });
      }
      case "Attribute": {
        const obj = yield* this.eval(e.value, scope);
        this.setLine(e.line);
        return this.getAttr(obj, e.attr);
      }
      case "Subscript": {
        const obj = yield* this.eval(e.value, scope);
        const idx = yield* this.eval(e.index, scope);
        this.setLine(e.line);
        return this.getItem(obj, idx);
      }
      case "Slice": {
        const lower = e.lower ? yield* this.eval(e.lower, scope) : null;
        const upper = e.upper ? yield* this.eval(e.upper, scope) : null;
        const step = e.step ? yield* this.eval(e.step, scope) : null;
        return new PySlice(lower, upper, step);
      }
      case "ListComp": {
        const out: PyValue[] = [];
        const inner = new Scope(comprehensionLocals(e.generators), new Set(), scope, scope.globals);
        yield* this.comprehension(e.generators, 0, inner, scope, function* (this: Interpreter) {
          out.push(yield* this.eval(e.elt, inner));
        });
        return new PyList(out);
      }
      case "GenExp": {
        // Python evaluates the first iterable (and iter() of it) eagerly
        const g0 = e.generators[0] as Comprehension;
        const first = this.iterator(yield* this.eval(g0.iter, scope));
        return this.genexp(e, first, scope);
      }
      case "Lambda": {
        const defaults: PyValue[] = [];
        for (const p of e.params) if (p.default) defaults.push(yield* this.eval(p.default, scope));
        return new PyFunction(
          "<lambda>",
          e.params,
          defaults,
          e.body,
          scope,
          new Set(e.params.map((p) => p.name)),
          new Set(),
        );
      }
    }
  }

  private *comprehension(
    gens: Comprehension[],
    i: number,
    inner: Scope,
    outer: Scope,
    body: (this: Interpreter) => Gen<void>,
  ): Gen<void> {
    const g = gens[i] as Comprehension;
    // the first iterable is evaluated in the enclosing scope
    const iterable = yield* this.eval(g.iter, i === 0 ? outer : inner);
    const next = this.iterator(iterable);
    for (;;) {
      const item = yield* this.advance(next);
      if (item === DONE) return;
      yield* this.assign(g.target, item, inner);
      let ok = true;
      for (const cond of g.ifs) {
        if (!truthy(yield* this.eval(cond, inner))) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (i + 1 < gens.length) yield* this.comprehension(gens, i + 1, inner, outer, body);
      else yield* body.call(this);
    }
  }

  private genexp(
    e: Extract<Expr, { t: "GenExp" }>,
    first: () => PyValue | typeof DONE | Gen<PyValue | typeof DONE>,
    scope: Scope,
  ): PyValue {
    const inner = new Scope(comprehensionLocals(e.generators), new Set(), scope, scope.globals);
    const gens = e.generators;
    const self = this;
    // Yields Suspend requests (forwarded to the driver) and Produced values.
    function* loop(i: number): Generator<Suspend | Produced, void, unknown> {
      const g = gens[i] as Comprehension;
      const next = i === 0 ? first : self.iterator(yield* self.eval(g.iter, inner));
      for (;;) {
        const item = yield* self.advance(next);
        if (item === DONE) return;
        yield* self.assign(g.target, item, inner);
        let ok = true;
        for (const cond of g.ifs) {
          if (!truthy(yield* self.eval(cond, inner))) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        if (i + 1 < gens.length) yield* loop(i + 1);
        else yield new Produced(yield* self.eval(e.elt, inner));
      }
    }
    const state = new GenState(loop(0));
    return new PyIterator("generator", () => this.genNext(state));
  }

  private *genNext(state: GenState): Gen<PyValue | typeof DONE> {
    let r = state.gen.next();
    for (;;) {
      if (r.done) return DONE;
      if (r.value instanceof Produced) return r.value.value;
      const resume = yield r.value;
      r = state.gen.next(resume);
    }
  }

  private *fstring(parts: Extract<Expr, { t: "FString" }>["parts"], scope: Scope): Gen<string> {
    let out = "";
    for (const p of parts) {
      if (p.text !== undefined) {
        out += p.text;
        continue;
      }
      let v = yield* this.eval(p.expr as Expr, scope);
      if (p.conversion === "r") v = repr(v);
      else if (p.conversion === "s") v = str(v);
      const spec = p.spec ? yield* this.fstring(p.spec, scope) : "";
      out += formatValue(v, spec);
    }
    return out;
  }

  // ---------------------------------------------------------------- calls

  *call(fn: PyValue, call: CallArgs): Gen<PyValue> {
    if (fn instanceof PyFunction) return yield* this.callFunction(fn, call);
    if (fn instanceof PyBuiltin) return yield* this.runNative(fn.fn, call);
    if (fn instanceof PyTypeObject) return yield* this.runNative(fn.call, call);
    if (fn instanceof PyBoundMethod) return yield* this.runNative(fn.fn, call);
    if (fn instanceof PyExcClass) return new PyExceptionValue(makeException(fn.exc, call.args));
    throw pyErr(EXC.TypeError, `'${typeName(fn)}' object is not callable`);
  }

  private *runNative(fn: (call: CallArgs) => PyValue | Gen<PyValue>, call: CallArgs): Gen<PyValue> {
    const r = fn(call);
    if (isGenerator(r)) return yield* r;
    return r as PyValue;
  }

  *callFunction(fn: PyFunction, call: CallArgs): Gen<PyValue> {
    if (this.frames.length >= RECURSION_LIMIT)
      throw pyErr(EXC.RecursionError, "maximum recursion depth exceeded");
    const scope = new Scope(fn.localNames, fn.globalNames, fn.closure, fn.closure.globals);
    bindArguments(fn, call, scope);
    this.frames.push({ name: fn.name, line: 0 });
    try {
      if (Array.isArray(fn.body)) {
        this.returnValue = null;
        const c = yield* this.execBlock(fn.body, scope);
        const v = c === RETURN ? this.returnValue : null;
        this.returnValue = null;
        return v;
      }
      this.setLine((fn.body as Expr).line);
      return yield* this.eval(fn.body as Expr, scope);
    } catch (e) {
      throw this.withTrace(e);
    } finally {
      this.frames.pop();
    }
  }

  /** Call a Python callable from native code (callbacks, sort keys). */
  *callValue(fn: PyValue, ...args: PyValue[]): Gen<PyValue> {
    return yield* this.call(fn, { args, kwargs: new Map() });
  }

  // ---------------------------------------------------------------- attributes / items

  getAttr(obj: PyValue, name: string): PyValue {
    if (obj instanceof PyModule) {
      const v = obj.attrs.get(name);
      if (v !== undefined) return v;
      if (CPYTHON_ATTRIBUTES.has(name)) throw new Unsupported(`${obj.name}.${name}`);
      throw attributeError(`module '${obj.name}' has no attribute '${name}'`, `module:${obj.name}`, name);
    }
    if (obj instanceof PyNative) {
      const m = obj.methods.get(name);
      if (m) return new PyBoundMethod(obj, name, m);
      if (CPYTHON_ATTRIBUTES.has(name)) throw new Unsupported(`${obj.typeName}.${name}`);
      throw attributeError(`'${obj.typeName}' object has no attribute '${name}'`, obj.typeName, name);
    }
    if (obj instanceof PyExceptionValue && name === "args") return new PyTuple(obj.exc.args as PyValue[]);
    const table = this.methods.get(typeName(obj));
    const m = table?.get(name);
    if (m) return new PyBoundMethod(obj, name, (call) => m(obj, call));
    if (obj instanceof PyTypeObject) {
      const t = this.methods.get(obj.name)?.get(name);
      if (t)
        return new PyBuiltin(`${obj.name}.${name}`, (call) =>
          t(call.args[0] ?? null, { args: call.args.slice(1), kwargs: call.kwargs }),
        );
    }
    if (CPYTHON_ATTRIBUTES.has(name)) throw new Unsupported(`.${name}`);
    if (obj instanceof PyTypeObject || obj instanceof PyExcClass) {
      const cls = obj instanceof PyTypeObject ? obj.name : obj.exc.name;
      throw attributeError(`type object '${cls}' has no attribute '${name}'`, `class:${cls}`, name);
    }
    const kind = obj instanceof PyExceptionValue ? "exception" : typeName(obj);
    throw attributeError(`'${typeName(obj)}' object has no attribute '${name}'`, kind, name);
  }

  getItem(obj: PyValue, idx: PyValue): PyValue {
    if (obj instanceof PyList || obj instanceof PyTuple || typeof obj === "string") {
      if (idx instanceof PySlice) return sliceSeq(obj, idx);
      const kind = typeof obj === "string" ? "string" : obj.typeName === "list" ? "list" : "tuple";
      if (typeof obj === "string") {
        const chars = [...obj];
        return chars[this.index(idx, chars.length, kind)] as string;
      }
      return obj.items[this.index(idx, obj.items.length, kind)] as PyValue;
    }
    if (obj instanceof PyDict) {
      const v = obj.get(idx);
      if (v === undefined) throw new PyException(EXC.KeyError, repr(idx), [idx]);
      return v;
    }
    if (obj instanceof PyRange) {
      if (idx instanceof PySlice) throw new Unsupported("range 切片");
      const n = Number(obj.length);
      return obj.at(BigInt(this.index(idx, n, "range object")));
    }
    throw pyErr(EXC.TypeError, `'${typeName(obj)}' object is not subscriptable`);
  }

  setItem(obj: PyValue, idx: PyValue, value: PyValue): void {
    if (obj instanceof PyList) {
      if (idx instanceof PySlice) throw new Unsupported("切片赋值");
      obj.items[this.index(idx, obj.items.length, "list", true)] = value;
      return;
    }
    if (obj instanceof PyDict) {
      obj.set(idx, value);
      return;
    }
    throw pyErr(EXC.TypeError, `'${typeName(obj)}' object does not support item assignment`);
  }

  /** Normalise a Python index with CPython's messages. */
  index(idx: PyValue, length: number, kind: string, assignment = false): number {
    if (!isInt(idx)) {
      const what = kind === "string" ? "string" : kind === "range object" ? "range" : kind;
      throw pyErr(EXC.TypeError, `${what} indices must be integers or slices, not ${typeName(idx)}`);
    }
    let i = Number(toBig(idx));
    if (i < 0) i += length;
    if (i < 0 || i >= length) {
      throw pyErr(EXC.IndexError, `${kind} ${assignment ? "assignment " : ""}index out of range`);
    }
    return i;
  }

  // ---------------------------------------------------------------- iteration

  /** Returns a stepping function; call advance() on it. */
  iterator(v: PyValue): () => PyValue | typeof DONE | Gen<PyValue | typeof DONE> {
    if (v instanceof PyList) {
      let i = 0;
      return () => (i < v.items.length ? (v.items[i++] as PyValue) : DONE);
    }
    if (v instanceof PyTuple) {
      let i = 0;
      return () => (i < v.items.length ? (v.items[i++] as PyValue) : DONE);
    }
    if (typeof v === "string") {
      const chars = [...v];
      let i = 0;
      return () => (i < chars.length ? (chars[i++] as string) : DONE);
    }
    if (v instanceof PyRange) {
      let cur = v.start;
      const { stop, step } = v;
      return () => {
        if (step > 0n ? cur >= stop : cur <= stop) return DONE;
        const r = cur;
        cur += step;
        return r;
      };
    }
    if (v instanceof PyDict) {
      const keys = v.keys();
      const size = v.entries.size;
      let i = 0;
      return () => {
        if (v.entries.size !== size)
          throw pyErr(EXC.RuntimeError, "dictionary changed size during iteration");
        return i < keys.length ? (keys[i++] as PyValue) : DONE;
      };
    }
    if (v instanceof PyDictView) {
      const items = v.items();
      const size = v.dict.entries.size;
      let i = 0;
      return () => {
        if (v.dict.entries.size !== size)
          throw pyErr(EXC.RuntimeError, "dictionary changed size during iteration");
        return i < items.length ? (items[i++] as PyValue) : DONE;
      };
    }
    if (v instanceof PyIterator) return v.next;
    throw pyErr(EXC.TypeError, `'${typeName(v)}' object is not iterable`);
  }

  *advance(next: () => PyValue | typeof DONE | Gen<PyValue | typeof DONE>): Gen<PyValue | typeof DONE> {
    const r = next();
    if (isGenerator(r)) return yield* r;
    return r as PyValue | typeof DONE;
  }

  *collect(v: PyValue): Gen<PyValue[]> {
    if (v instanceof PyList || v instanceof PyTuple) return [...v.items];
    const next = this.iterator(v);
    const out: PyValue[] = [];
    for (;;) {
      const item = yield* this.advance(next);
      if (item === DONE) return out;
      out.push(item);
    }
  }
}

// ---------------------------------------------------------------- helpers

export class PySlice extends PyObject {
  readonly typeName = "slice";
  constructor(
    readonly lower: PyValue,
    readonly upper: PyValue,
    readonly step: PyValue,
  ) {
    super();
  }
}

function sliceBound(v: PyValue): number | null {
  if (v === null) return null;
  if (!isInt(v))
    throw pyErr(EXC.TypeError, "slice indices must be integers or None or have an __index__ method");
  return Number(toBig(v));
}

function sliceSeq(obj: PyList | PyTuple | string, s: PySlice): PyValue {
  const items: PyValue[] = typeof obj === "string" ? [...obj] : obj.items;
  const n = items.length;
  const step = sliceBound(s.step) ?? 1;
  if (step === 0) throw pyErr(EXC.ValueError, "slice step cannot be zero");
  const clamp = (v: number | null, def: number, lo: number, hi: number) => {
    if (v === null) return def;
    if (v < 0) v += n;
    return Math.min(Math.max(v, lo), hi);
  };
  const start = step > 0 ? clamp(sliceBound(s.lower), 0, 0, n) : clamp(sliceBound(s.lower), n - 1, -1, n - 1);
  const stop = step > 0 ? clamp(sliceBound(s.upper), n, 0, n) : clamp(sliceBound(s.upper), -1, -1, n - 1);
  const out: PyValue[] = [];
  if (step > 0) for (let i = start; i < stop; i += step) out.push(items[i] as PyValue);
  else for (let i = start; i > stop; i += step) out.push(items[i] as PyValue);
  if (typeof obj === "string") return out.join("");
  return obj instanceof PyList ? new PyList(out) : new PyTuple(out);
}

export function isGenerator(v: unknown): v is Gen<PyValue> {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { next?: unknown }).next === "function" &&
    typeof (v as { throw?: unknown }).throw === "function"
  );
}

/** AttributeError with CPython's "Did you mean" hint (shown in the traceback only). */
function attributeError(message: string, dirKind: string, name: string): PyException {
  const e = pyErr(EXC.AttributeError, message);
  const dir = cpythonDir(dirKind);
  if (!dir) throw new Unsupported(`属性 ${name}`);
  e.suggestion = suggestAttribute(dir, name);
  return e;
}

export function makeException(type: PyExcType, args: PyValue[]): PyException {
  if (args.length === 0) return new PyException(type, "", []);
  const text =
    args.length === 1
      ? type === EXC.KeyError
        ? repr(args[0] as PyValue)
        : str(args[0] as PyValue)
      : repr(new PyTuple(args));
  return new PyException(type, text, args);
}

function bindArguments(fn: PyFunction, call: CallArgs, scope: Scope): void {
  const params = fn.params;
  const nParams = params.length;
  const firstDefault = nParams - fn.defaults.length;
  const name = fn.name;
  if (call.args.length > nParams) {
    const takes =
      fn.defaults.length > 0
        ? `from ${firstDefault} to ${nParams} positional arguments`
        : `${nParams} positional argument${nParams === 1 ? "" : "s"}`;
    throw pyErr(
      EXC.TypeError,
      `${name}() takes ${takes} but ${call.args.length} ${call.args.length === 1 ? "was" : "were"} given`,
    );
  }
  const values: Array<PyValue | undefined> = new Array(nParams).fill(undefined);
  call.args.forEach((a, i) => {
    values[i] = a;
  });
  for (const [k, v] of call.kwargs) {
    const i = params.findIndex((p) => p.name === k);
    if (i < 0) throw pyErr(EXC.TypeError, `${name}() got an unexpected keyword argument '${k}'`);
    if (values[i] !== undefined)
      throw pyErr(EXC.TypeError, `${name}() got multiple values for argument '${k}'`);
    values[i] = v;
  }
  const missing: string[] = [];
  for (let i = 0; i < nParams; i++) {
    if (values[i] === undefined) {
      if (i >= firstDefault) values[i] = fn.defaults[i - firstDefault];
      else missing.push(`'${(params[i] as Param).name}'`);
    }
  }
  if (missing.length) {
    const list =
      missing.length === 1
        ? missing[0]
        : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
    throw pyErr(
      EXC.TypeError,
      `${name}() missing ${missing.length} required positional argument${missing.length === 1 ? "" : "s"}: ${list}`,
    );
  }
  for (let i = 0; i < nParams; i++) scope.vars.set((params[i] as Param).name, values[i] as PyValue);
}

/** Names assigned in a function body (Python's static local-variable rule). */
export function analyzeFunction(
  params: Param[],
  body: Stmt[],
): { locals: Set<string>; globals: Set<string> } {
  const locals = new Set(params.map((p) => p.name));
  const globals = new Set<string>();
  const target = (e: Expr) => {
    if (e.t === "Name") locals.add(e.id);
    else if (e.t === "Tuple" || e.t === "List") e.elts.forEach(target);
  };
  const walk = (stmts: Stmt[]) => {
    for (const s of stmts) {
      switch (s.t) {
        case "Assign":
          s.targets.forEach(target);
          break;
        case "AugAssign":
          target(s.target);
          break;
        case "For":
          target(s.target);
          walk(s.body);
          walk(s.orelse);
          break;
        case "While":
          walk(s.body);
          walk(s.orelse);
          break;
        case "If":
          walk(s.body);
          walk(s.orelse);
          break;
        case "FunctionDef":
          locals.add(s.name);
          break;
        case "Import":
          for (const n of s.names) locals.add(n.asname ?? n.name);
          break;
        case "ImportFrom":
          if (s.names === "*") throw new Unsupported("函数内 import *");
          for (const n of s.names) locals.add(n.asname ?? n.name);
          break;
        case "Global":
          for (const n of s.names) globals.add(n);
          break;
        case "Delete":
          s.targets.forEach(target);
          break;
        case "Try":
          walk(s.body);
          for (const h of s.handlers) {
            if (h.name) locals.add(h.name);
            walk(h.body);
          }
          walk(s.orelse);
          walk(s.finalbody);
          break;
      }
    }
  };
  walk(body);
  for (const g of globals) {
    if (params.some((p) => p.name === g)) throw new Unsupported("global 与参数同名");
    locals.delete(g);
  }
  return { locals, globals };
}

function comprehensionLocals(gens: Comprehension[]): Set<string> {
  const names = new Set<string>();
  const target = (e: Expr) => {
    if (e.t === "Name") names.add(e.id);
    else if (e.t === "Tuple" || e.t === "List") e.elts.forEach(target);
  };
  for (const g of gens) target(g.target);
  return names;
}

export type { Completion };
export { CPYTHON_ATTRIBUTES };
