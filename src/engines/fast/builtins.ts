/** Builtin functions, types and str/list/dict/tuple methods for the fast engine. */
import { EXC, PyException, pyErr, Unsupported } from "./errors";
import { formatValue } from "./format";
import { type Interpreter, isGenerator, PyFunction } from "./interpreter";
import { roundFloat, roundHalfEvenToBigInt } from "./numbers";
import { binaryOp, cmp } from "./ops";
import {
  type CallArgs,
  DONE,
  type Gen,
  isInt,
  isNumber,
  PyBuiltin,
  PyDict,
  PyDictView,
  PyExcClass,
  PyExceptionValue,
  PyIterator,
  PyList,
  PyRange,
  PyTuple,
  PyTypeObject,
  type PyValue,
  pyEquals,
  repr,
  str,
  toBig,
  toFloat,
  truthy,
  typeName,
} from "./values";

type Native = (call: CallArgs) => PyValue | Gen<PyValue>;

function noKwargs(name: string, call: CallArgs): void {
  if (call.kwargs.size) throw pyErr(EXC.TypeError, `${name}() takes no keyword arguments`);
}

function arity(name: string, call: CallArgs, min: number, max: number): void {
  const n = call.args.length;
  if (n < min || n > max) {
    if (min === max)
      throw pyErr(
        EXC.TypeError,
        `${name}() takes exactly ${min === 1 ? "one argument" : `${min} arguments`} (${n} given)`,
      );
    if (n < min)
      throw pyErr(
        EXC.TypeError,
        `${name} expected at least ${min} argument${min === 1 ? "" : "s"}, got ${n}`,
      );
    throw pyErr(EXC.TypeError, `${name} expected at most ${max} argument${max === 1 ? "" : "s"}, got ${n}`);
  }
}

function asIndex(v: PyValue): bigint {
  if (isInt(v)) return toBig(v);
  throw pyErr(EXC.TypeError, `'${typeName(v)}' object cannot be interpreted as an integer`);
}

function kw(call: CallArgs, name: string, allowed: string[], fn: string): PyValue | undefined {
  for (const k of call.kwargs.keys()) {
    if (!allowed.includes(k)) throw pyErr(EXC.TypeError, `${fn}() got an unexpected keyword argument '${k}'`);
  }
  return call.kwargs.get(name);
}

// ---------------------------------------------------------------- conversions

function toInt(v: PyValue, base?: PyValue): bigint {
  if (base !== undefined) {
    if (typeof v !== "string")
      throw pyErr(EXC.TypeError, "int() can't convert non-string with explicit base");
    const b = Number(asIndex(base));
    if (b !== 0 && (b < 2 || b > 36)) throw pyErr(EXC.ValueError, "int() base must be >= 2 and <= 36, or 0");
    return parseIntString(v, b);
  }
  if (typeof v === "boolean" || typeof v === "bigint") return toBig(v);
  if (typeof v === "number") {
    if (Number.isNaN(v)) throw pyErr(EXC.ValueError, "cannot convert float NaN to integer");
    if (!Number.isFinite(v)) throw pyErr(EXC.OverflowError, "cannot convert float infinity to integer");
    return BigInt(Math.trunc(v));
  }
  if (typeof v === "string") return parseIntString(v, 10);
  throw pyErr(
    EXC.TypeError,
    `int() argument must be a string, a bytes-like object or a real number, not '${typeName(v)}'`,
  );
}

function parseIntString(text: string, base: number): bigint {
  const bad = () => pyErr(EXC.ValueError, `invalid literal for int() with base ${base}: ${repr(text)}`);
  let s = text.trim();
  let neg = false;
  if (s.startsWith("+") || s.startsWith("-")) {
    neg = s[0] === "-";
    s = s.slice(1);
  }
  let b = base;
  const prefix = s.slice(0, 2).toLowerCase();
  const prefixes: Record<string, number> = { "0x": 16, "0o": 8, "0b": 2 };
  if (prefixes[prefix] !== undefined && (b === 0 || b === prefixes[prefix])) {
    b = prefixes[prefix] as number;
    s = s.slice(2);
    if (s.startsWith("_")) s = s.slice(1);
  } else if (b === 0) {
    if (/^0+$/.test(s.replace(/_/g, ""))) return 0n;
    if (s.startsWith("0")) throw bad();
    b = 10;
  }
  if (!s || s.startsWith("_") || s.endsWith("_") || s.includes("__")) throw bad();
  s = s.replace(/_/g, "");
  let n = 0n;
  for (const ch of s.toLowerCase()) {
    const d =
      ch >= "0" && ch <= "9" ? ch.charCodeAt(0) - 48 : ch >= "a" && ch <= "z" ? ch.charCodeAt(0) - 87 : 99;
    if (d >= b) throw bad();
    n = n * BigInt(b) + BigInt(d);
  }
  return neg ? -n : n;
}

function toFloatValue(v: PyValue): number {
  if (isNumber(v)) return toFloat(v);
  if (typeof v === "string") {
    const s = v
      .trim()
      .toLowerCase()
      .replace(/_/g, (m, i, all) => (/\d/.test(all[i - 1]) && /\d/.test(all[i + 1]) ? "" : m));
    if (/^[+-]?(inf|infinity)$/.test(s)) return s.startsWith("-") ? -Infinity : Infinity;
    if (/^[+-]?nan$/.test(s)) return Number.NaN;
    if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(s)) return Number(s);
    throw pyErr(EXC.ValueError, `could not convert string to float: ${repr(v)}`);
  }
  throw pyErr(EXC.TypeError, `float() argument must be a string or a real number, not '${typeName(v)}'`);
}

export function installBuiltins(interp: Interpreter): void {
  const b = interp.builtins;
  const def = (name: string, fn: Native) => b.set(name, new PyBuiltin(name, fn));
  const type = (name: string, fn: Native) => b.set(name, new PyTypeObject(name, fn));

  function* iterate(v: PyValue): Gen<PyValue[]> {
    return yield* interp.collect(v);
  }

  function* keyed(items: PyValue[], key: PyValue | undefined): Gen<PyValue[]> {
    if (key === undefined || key === null) return items;
    const out: PyValue[] = [];
    for (const it of items) out.push(yield* interp.callValue(key, it));
    return out;
  }

  // -------------------------------------------------------------- output / input
  def("print", (call) => {
    for (const k of call.kwargs.keys())
      if (!["sep", "end", "flush", "file"].includes(k))
        throw pyErr(EXC.TypeError, `'${k}' is an invalid keyword argument for print()`);
    if (call.kwargs.has("file") && call.kwargs.get("file") !== null) throw new Unsupported("print(file=...)");
    const sepV = call.kwargs.get("sep") ?? null;
    const endV = call.kwargs.get("end") ?? null;
    if (sepV !== null && typeof sepV !== "string")
      throw pyErr(EXC.TypeError, `sep must be None or a string, not ${typeName(sepV)}`);
    if (endV !== null && typeof endV !== "string")
      throw pyErr(EXC.TypeError, `end must be None or a string, not ${typeName(endV)}`);
    interp.host.write(call.args.map(str).join(sepV ?? " ") + (endV ?? "\n"));
    return null;
  });

  def("input", function* (call): Gen<PyValue> {
    noKwargs("input", call);
    if (call.args.length > 1)
      throw pyErr(EXC.TypeError, `input expected at most 1 argument, got ${call.args.length}`);
    const prompt = call.args.length ? str(call.args[0] as PyValue) : "";
    if (prompt) interp.host.write(prompt);
    const answer = yield { kind: "input", prompt };
    if (answer === null || answer === undefined) throw pyErr(EXC.EOFError, "EOF when reading a line");
    return String(answer);
  });

  // -------------------------------------------------------------- types
  type("int", (call) => {
    const x = kw(call, "base", ["base"], "int");
    if (call.args.length === 0) {
      if (x !== undefined) throw pyErr(EXC.TypeError, "int() missing string argument");
      return 0n;
    }
    if (call.args.length > 2)
      throw pyErr(EXC.TypeError, `int() takes at most 2 arguments (${call.args.length} given)`);
    return toInt(call.args[0] as PyValue, call.args[1] ?? x);
  });
  type("float", (call) => {
    noKwargs("float", call);
    if (call.args.length > 1)
      throw pyErr(EXC.TypeError, `float expected at most 1 argument, got ${call.args.length}`);
    return call.args.length ? toFloatValue(call.args[0] as PyValue) : 0;
  });
  type("str", (call) => {
    noKwargs("str", call);
    if (call.args.length > 1) throw new Unsupported("str(bytes, encoding)");
    return call.args.length ? str(call.args[0] as PyValue) : "";
  });
  type("bool", (call) => {
    noKwargs("bool", call);
    if (call.args.length > 1)
      throw pyErr(EXC.TypeError, `bool expected at most 1 argument, got ${call.args.length}`);
    return call.args.length ? truthy(call.args[0] as PyValue) : false;
  });
  type("list", function* (call): Gen<PyValue> {
    noKwargs("list", call);
    if (call.args.length > 1)
      throw pyErr(EXC.TypeError, `list expected at most 1 argument, got ${call.args.length}`);
    return new PyList(call.args.length ? yield* iterate(call.args[0] as PyValue) : []);
  });
  type("tuple", function* (call): Gen<PyValue> {
    noKwargs("tuple", call);
    if (call.args.length > 1)
      throw pyErr(EXC.TypeError, `tuple expected at most 1 argument, got ${call.args.length}`);
    return new PyTuple(call.args.length ? yield* iterate(call.args[0] as PyValue) : []);
  });
  type("dict", function* (call): Gen<PyValue> {
    const d = new PyDict();
    if (call.args.length > 1)
      throw pyErr(EXC.TypeError, `dict expected at most 1 argument, got ${call.args.length}`);
    if (call.args.length) {
      const src = call.args[0] as PyValue;
      if (src instanceof PyDict) for (const [k, v] of src.entries.values()) d.set(k, v);
      else {
        const items = yield* iterate(src);
        items.forEach((pair, i) => {
          const kv =
            pair instanceof PyList || pair instanceof PyTuple
              ? pair.items
              : typeof pair === "string"
                ? [...pair]
                : null;
          if (!kv)
            throw pyErr(
              EXC.TypeError,
              `cannot convert dictionary update sequence element #${i} to a sequence`,
            );
          if (kv.length !== 2)
            throw pyErr(
              EXC.ValueError,
              `dictionary update sequence element #${i} has length ${kv.length}; 2 is required`,
            );
          d.set(kv[0] as PyValue, kv[1] as PyValue);
        });
      }
    }
    for (const [k, v] of call.kwargs) d.set(k, v);
    return d;
  });
  type("range", (call) => {
    noKwargs("range", call);
    const n = call.args.length;
    if (n === 0) throw pyErr(EXC.TypeError, "range expected at least 1 argument, got 0");
    if (n > 3) throw pyErr(EXC.TypeError, `range expected at most 3 arguments, got ${n}`);
    const a = call.args.map(asIndex);
    const [start, stop, step] =
      n === 1 ? [0n, a[0] as bigint, 1n] : [a[0] as bigint, a[1] as bigint, a[2] ?? 1n];
    if (step === 0n) throw pyErr(EXC.ValueError, "range() arg 3 must not be zero");
    return new PyRange(start, stop, step);
  });
  type("type", (call) => {
    if (call.args.length !== 1) throw new Unsupported("type(name, bases, dict)");
    const t = typeName(call.args[0] as PyValue);
    const known = b.get(t);
    if (known instanceof PyTypeObject) return known;
    return new PyTypeObject(t, () => {
      throw new Unsupported(`调用 ${t} 类型`);
    });
  });

  // -------------------------------------------------------------- numbers
  def("abs", (call) => {
    noKwargs("abs", call);
    arity("abs", call, 1, 1);
    const v = call.args[0] as PyValue;
    if (typeof v === "number") return Math.abs(v);
    if (isInt(v)) {
      const n = toBig(v);
      return n < 0n ? -n : n;
    }
    throw pyErr(EXC.TypeError, `bad operand type for abs(): '${typeName(v)}'`);
  });
  def("round", (call) => {
    const nd = kw(call, "ndigits", ["ndigits", "number"], "round");
    const v = call.args[0] ?? call.kwargs.get("number");
    if (v === undefined) throw pyErr(EXC.TypeError, "round() missing required argument 'number' (pos 1)");
    const digits = call.args.length > 1 ? call.args[1] : nd;
    if (typeof v === "number") {
      if (digits === undefined || digits === null) {
        if (Number.isNaN(v)) throw pyErr(EXC.ValueError, "cannot convert float NaN to integer");
        if (!Number.isFinite(v)) throw pyErr(EXC.OverflowError, "cannot convert float infinity to integer");
        return roundHalfEvenToBigInt(v);
      }
      return roundFloat(v, Number(asIndex(digits)));
    }
    if (isInt(v)) {
      const n = toBig(v);
      if (digits === undefined || digits === null) return n;
      const d = Number(asIndex(digits));
      if (d >= 0) return n;
      const p = 10n ** BigInt(-d);
      const q = n / p;
      let r = n - q * p;
      let base = q;
      if (r < 0n) {
        base -= 1n;
        r += p;
      }
      const twice = 2n * r;
      if (twice > p || (twice === p && base % 2n !== 0n)) base += 1n;
      return base * p;
    }
    throw pyErr(EXC.TypeError, `type ${typeName(v)} doesn't define __round__ method`);
  });
  def("divmod", (call) => {
    arity("divmod", call, 2, 2);
    const [x, y] = call.args as [PyValue, PyValue];
    if (!isNumber(x) || !isNumber(y))
      throw pyErr(
        EXC.TypeError,
        `unsupported operand type(s) for divmod(): '${typeName(x)}' and '${typeName(y)}'`,
      );
    return new PyTuple([interpBin(interp, "//", x, y), interpBin(interp, "%", x, y)]);
  });
  def("pow", (call) => {
    if (call.args.length === 3) throw new Unsupported("pow(x, y, mod)");
    arity("pow", call, 2, 2);
    return interpBin(interp, "**", call.args[0] as PyValue, call.args[1] as PyValue);
  });
  def("hex", (call) => fmtInt(call, "hex", 16, "0x"));
  def("oct", (call) => fmtInt(call, "oct", 8, "0o"));
  def("bin", (call) => fmtInt(call, "bin", 2, "0b"));
  def("chr", (call) => {
    arity("chr", call, 1, 1);
    const n = asIndex(call.args[0] as PyValue);
    if (n < 0n || n >= 0x110000n) throw pyErr(EXC.ValueError, "chr() arg not in range(0x110000)");
    return String.fromCodePoint(Number(n));
  });
  def("ord", (call) => {
    arity("ord", call, 1, 1);
    const s = call.args[0] as PyValue;
    if (typeof s !== "string")
      throw pyErr(EXC.TypeError, `ord() expected string of length 1, but ${typeName(s)} found`);
    const chars = [...s];
    if (chars.length !== 1)
      throw pyErr(EXC.TypeError, `ord() expected a character, but string of length ${chars.length} found`);
    return BigInt((chars[0] as string).codePointAt(0) as number);
  });

  // -------------------------------------------------------------- sequences
  def("len", (call) => {
    noKwargs("len", call);
    arity("len", call, 1, 1);
    const v = call.args[0] as PyValue;
    if (typeof v === "string") return BigInt([...v].length);
    if (v instanceof PyList || v instanceof PyTuple) return BigInt(v.items.length);
    if (v instanceof PyDict) return BigInt(v.entries.size);
    if (v instanceof PyRange) return v.length;
    if (v instanceof PyDictView) return BigInt(v.dict.entries.size);
    throw pyErr(EXC.TypeError, `object of type '${typeName(v)}' has no len()`);
  });

  function* minmax(name: "min" | "max", call: CallArgs): Gen<PyValue> {
    const key = kw(call, "key", ["key", "default"], name);
    const dflt = call.kwargs.get("default");
    let items: PyValue[];
    if (call.args.length === 0) throw pyErr(EXC.TypeError, `${name} expected at least 1 argument, got 0`);
    if (call.args.length === 1) {
      items = yield* iterate(call.args[0] as PyValue);
      if (items.length === 0) {
        if (dflt !== undefined) return dflt;
        throw pyErr(EXC.ValueError, `${name}() iterable argument is empty`);
      }
    } else {
      if (dflt !== undefined)
        throw pyErr(
          EXC.TypeError,
          `Cannot specify a default for ${name}() with multiple positional arguments`,
        );
      items = call.args;
    }
    const keys = yield* keyed(items, key);
    let best = 0;
    for (let i = 1; i < items.length; i++) {
      const c = cmp(keys[i] as PyValue, keys[best] as PyValue, name === "min" ? "<" : ">");
      if (name === "min" ? c < 0 : c > 0) best = i;
    }
    return items[best] as PyValue;
  }
  def("min", (call) => minmax("min", call));
  def("max", (call) => minmax("max", call));

  def("sum", function* (call): Gen<PyValue> {
    const start = kw(call, "start", ["start"], "sum") ?? call.args[1] ?? 0n;
    if (call.args.length === 0)
      throw pyErr(EXC.TypeError, "sum() takes at least 1 positional argument (0 given)");
    if (typeof start === "string")
      throw pyErr(EXC.TypeError, "sum() can't sum strings [use ''.join(seq) instead]");
    let total: PyValue = start;
    for (const x of yield* iterate(call.args[0] as PyValue)) total = interpBin(interp, "+", total, x);
    return total;
  });
  def("sorted", function* (call): Gen<PyValue> {
    if (call.args.length !== 1)
      throw pyErr(EXC.TypeError, `sorted expected 1 argument, got ${call.args.length}`);
    const items = yield* iterate(call.args[0] as PyValue);
    return new PyList(yield* sortItems(items, call, "sorted"));
  });

  function* sortItems(items: PyValue[], call: CallArgs, fn: string): Gen<PyValue[]> {
    const key = kw(call, "key", ["key", "reverse"], fn);
    const reverse = truthy(call.kwargs.get("reverse") ?? false);
    const keys = yield* keyed(items, key);
    const idx = items.map((_, i) => i);
    // stable merge sort using Python's < only (like list.sort)
    const less = (a: number, b: number) => cmp(keys[a] as PyValue, keys[b] as PyValue, "<") < 0;
    const sortedIdx = mergeSort(idx, reverse ? (a, b) => less(b, a) : less);
    return sortedIdx.map((i) => items[i] as PyValue);
  }

  def("reversed", (call) => {
    arity("reversed", call, 1, 1);
    const v = call.args[0] as PyValue;
    let items: PyValue[];
    if (v instanceof PyList || v instanceof PyTuple) items = [...v.items];
    else if (typeof v === "string") items = [...v];
    else if (v instanceof PyRange) {
      items = [];
      for (let i = v.length - 1n; i >= 0n; i--) items.push(v.at(i));
    } else throw pyErr(EXC.TypeError, `'${typeName(v)}' object is not reversible`);
    items.reverse();
    let i = 0;
    const kind =
      v instanceof PyList ? "list_reverseiterator" : v instanceof PyRange ? "range_iterator" : "reversed";
    return new PyIterator(kind, () => (i < items.length ? (items[i++] as PyValue) : DONE));
  });
  def("enumerate", (call) => {
    const start = kw(call, "start", ["start", "iterable"], "enumerate") ?? call.args[1] ?? 0n;
    const src = call.args[0] ?? call.kwargs.get("iterable");
    if (src === undefined) throw pyErr(EXC.TypeError, "enumerate() missing required argument 'iterable'");
    const next = interp.iterator(src);
    let n = asIndex(start);
    return new PyIterator("enumerate", function* (): Gen<PyValue | typeof DONE> {
      const item = yield* interp.advance(next);
      if (item === DONE) return DONE;
      return new PyTuple([n++, item]);
    });
  });
  def("zip", (call) => {
    if (call.kwargs.size) throw new Unsupported("zip(strict=...)");
    const nexts = call.args.map((a) => interp.iterator(a));
    return new PyIterator("zip", function* (): Gen<PyValue | typeof DONE> {
      if (nexts.length === 0) return DONE;
      const row: PyValue[] = [];
      for (const n of nexts) {
        const item = yield* interp.advance(n);
        if (item === DONE) return DONE;
        row.push(item);
      }
      return new PyTuple(row);
    });
  });
  def("map", (call) => {
    if (call.args.length < 2) throw pyErr(EXC.TypeError, "map() must have at least two arguments.");
    const fn = call.args[0] as PyValue;
    const nexts = call.args.slice(1).map((a) => interp.iterator(a));
    return new PyIterator("map", function* (): Gen<PyValue | typeof DONE> {
      const row: PyValue[] = [];
      for (const n of nexts) {
        const item = yield* interp.advance(n);
        if (item === DONE) return DONE;
        row.push(item);
      }
      return yield* interp.callValue(fn, ...row);
    });
  });
  def("filter", (call) => {
    arity("filter", call, 2, 2);
    const fn = call.args[0] as PyValue;
    const next = interp.iterator(call.args[1] as PyValue);
    return new PyIterator("filter", function* (): Gen<PyValue | typeof DONE> {
      for (;;) {
        const item = yield* interp.advance(next);
        if (item === DONE) return DONE;
        const keep = fn === null ? truthy(item) : truthy(yield* interp.callValue(fn, item));
        if (keep) return item;
      }
    });
  });
  def("any", function* (call): Gen<PyValue> {
    arity("any", call, 1, 1);
    const next = interp.iterator(call.args[0] as PyValue);
    for (;;) {
      const item = yield* interp.advance(next);
      if (item === DONE) return false;
      if (truthy(item)) return true;
    }
  });
  def("all", function* (call): Gen<PyValue> {
    arity("all", call, 1, 1);
    const next = interp.iterator(call.args[0] as PyValue);
    for (;;) {
      const item = yield* interp.advance(next);
      if (item === DONE) return true;
      if (!truthy(item)) return false;
    }
  });
  def("iter", (call) => {
    arity("iter", call, 1, 1);
    const src = call.args[0] as PyValue;
    if (src instanceof PyIterator) return src;
    const next = interp.iterator(src);
    const kinds: Record<string, string> = {
      list: "list_iterator",
      tuple: "tuple_iterator",
      str: "str_ascii_iterator",
      dict: "dict_keyiterator",
      range: "range_iterator",
      dict_keys: "dict_keyiterator",
      dict_values: "dict_valueiterator",
      dict_items: "dict_itemiterator",
    };
    const kind = kinds[typeName(src)];
    if (!kind) throw new Unsupported(`iter(${typeName(src)})`);
    if (
      kind === "str_ascii_iterator" &&
      [...(src as string)].some((c) => (c.codePointAt(0) as number) > 0x7f)
    )
      return new PyIterator("str_iterator", next);
    return new PyIterator(kind, next);
  });
  def("next", function* (call): Gen<PyValue> {
    arity("next", call, 1, 2);
    const it = call.args[0] as PyValue;
    if (!(it instanceof PyIterator))
      throw pyErr(EXC.TypeError, `'${typeName(it)}' object is not an iterator`);
    const item = yield* interp.advance(it.next);
    if (item === DONE) {
      if (call.args.length > 1) return call.args[1] as PyValue;
      throw new PyException(EXC.StopIteration, "", []);
    }
    return item;
  });

  // -------------------------------------------------------------- misc
  def("isinstance", (call) => {
    arity("isinstance", call, 2, 2);
    const v = call.args[0] as PyValue;
    const t = call.args[1] as PyValue;
    const types = t instanceof PyTuple ? t.items : [t];
    return types.some((ty) => {
      if (ty instanceof PyTypeObject) {
        const n = typeName(v);
        return n === ty.name || (ty.name === "int" && n === "bool");
      }
      if (ty instanceof PyExcClass) return v instanceof PyExceptionValue && v.exc.type.isSubclassOf(ty.exc);
      throw pyErr(EXC.TypeError, "isinstance() arg 2 must be a type, a tuple of types, or a union");
    });
  });
  def("repr", (call) => {
    arity("repr", call, 1, 1);
    return repr(call.args[0] as PyValue);
  });
  def("format", (call) => {
    arity("format", call, 1, 2);
    const spec = call.args[1] ?? "";
    if (typeof spec !== "string")
      throw pyErr(EXC.TypeError, `format() argument 2 must be str, not ${typeName(spec)}`);
    return formatValue(call.args[0] as PyValue, spec);
  });
  def("callable", (call) => {
    arity("callable", call, 1, 1);
    const v = call.args[0];
    return (
      v instanceof PyFunction ||
      v instanceof PyBuiltin ||
      v instanceof PyTypeObject ||
      v instanceof PyExcClass
    );
  });
  def("exit", () => {
    throw new PyException(EXC.SystemExit, "", []);
  });
  b.set("quit", b.get("exit") as PyValue);

  for (const [name, exc] of Object.entries(EXC)) {
    if (name === "TurtleGraphicsError" || name === "Terminator") continue;
    b.set(name, new PyExcClass(exc));
  }

  installMethods(interp, sortItems);
}

function fmtInt(call: CallArgs, name: string, radix: number, prefix: string): PyValue {
  arity(name, call, 1, 1);
  const n = asIndex(call.args[0] as PyValue);
  return (n < 0n ? "-" : "") + prefix + (n < 0n ? -n : n).toString(radix);
}

function interpBin(_interp: Interpreter, op: "+" | "//" | "%" | "**", a: PyValue, b: PyValue): PyValue {
  return binaryOp(op, a, b);
}

function mergeSort(a: number[], less: (x: number, y: number) => boolean): number[] {
  if (a.length <= 1) return a;
  const mid = a.length >> 1;
  const l = mergeSort(a.slice(0, mid), less);
  const r = mergeSort(a.slice(mid), less);
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < l.length && j < r.length) {
    if (less(r[j] as number, l[i] as number)) out.push(r[j++] as number);
    else out.push(l[i++] as number);
  }
  while (i < l.length) out.push(l[i++] as number);
  while (j < r.length) out.push(r[j++] as number);
  return out;
}

// ---------------------------------------------------------------- methods

type Method = (self: PyValue, call: CallArgs) => PyValue | Gen<PyValue>;

function installMethods(
  interp: Interpreter,
  sortItems: (items: PyValue[], call: CallArgs, fn: string) => Gen<PyValue[]>,
): void {
  const table = (name: string, entries: Record<string, Method>) =>
    interp.methods.set(name, new Map(Object.entries(entries)));

  const s = (v: PyValue) => v as string;
  const argStr = (call: CallArgs, i: number, meth: string): string => {
    const v = call.args[i] as PyValue;
    if (typeof v !== "string")
      throw pyErr(EXC.TypeError, `${meth}() argument ${i + 1} must be str, not ${typeName(v)}`);
    return v;
  };
  const optStr = (call: CallArgs, i: number): string | null => {
    const v = call.args[i];
    if (v === undefined || v === null) return null;
    if (typeof v !== "string") throw pyErr(EXC.TypeError, `must be str or None, not ${typeName(v)}`);
    return v;
  };
  const stripChars = (text: string, chars: string | null, left: boolean, right: boolean) => {
    const set = chars === null ? null : new Set([...chars]);
    const isStrip = (c: string) => (set ? set.has(c) : /\s/.test(c));
    const cs = [...text];
    let i = 0;
    let j = cs.length;
    if (left) while (i < j && isStrip(cs[i] as string)) i++;
    if (right) while (j > i && isStrip(cs[j - 1] as string)) j--;
    return cs.slice(i, j).join("");
  };
  const justify = (call: CallArgs, meth: string) => {
    const width = Number(asIndex(call.args[0] as PyValue));
    const fill = call.args[1] === undefined ? " " : argStr(call, 1, meth);
    if ([...fill].length !== 1)
      throw pyErr(EXC.TypeError, "The fill character must be exactly one character long");
    return { width, fill };
  };

  table("str", {
    upper: (self) => s(self).toUpperCase(),
    lower: (self) => s(self).toLowerCase(),
    title: (self) =>
      s(self)
        .toLowerCase()
        .replace(/(^|[^A-Za-z])([a-z])/g, (_, p, c) => p + c.toUpperCase()),
    capitalize: (self) => {
      const t = s(self);
      return t ? (t[0] as string).toUpperCase() + t.slice(1).toLowerCase() : t;
    },
    swapcase: (self) =>
      [...s(self)].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(""),
    strip: (self, call) => stripChars(s(self), optStr(call, 0), true, true),
    lstrip: (self, call) => stripChars(s(self), optStr(call, 0), true, false),
    rstrip: (self, call) => stripChars(s(self), optStr(call, 0), false, true),
    split: (self, call) => {
      const sep = call.kwargs.has("sep") ? (call.kwargs.get("sep") as PyValue) : (call.args[0] ?? null);
      const maxV = call.kwargs.get("maxsplit") ?? call.args[1] ?? -1n;
      const max = Number(asIndex(maxV));
      const text = s(self);
      if (sep === null) {
        const parts: string[] = [];
        let rest = text.replace(/^\s+/, "");
        while (rest && (max < 0 || parts.length < max)) {
          const m = rest.match(/\s+/);
          if (!m || m.index === undefined) break;
          parts.push(rest.slice(0, m.index));
          rest = rest.slice(m.index + m[0].length);
        }
        rest = max < 0 || parts.length < max ? rest.replace(/\s+$/, "") : rest;
        if (rest) parts.push(max >= 0 && parts.length >= max ? rest.replace(/\s+$/, "") : rest);
        return new PyList(parts);
      }
      if (typeof sep !== "string") throw pyErr(EXC.TypeError, `must be str or None, not ${typeName(sep)}`);
      if (sep === "") throw pyErr(EXC.ValueError, "empty separator");
      const all = text.split(sep);
      if (max >= 0 && all.length > max + 1)
        return new PyList([...all.slice(0, max), all.slice(max).join(sep)]);
      return new PyList(all);
    },
    join: function* (self, call): Gen<PyValue> {
      const items = yield* interp.collect(call.args[0] as PyValue);
      items.forEach((x, i) => {
        if (typeof x !== "string")
          throw pyErr(EXC.TypeError, `sequence item ${i}: expected str instance, ${typeName(x)} found`);
      });
      return items.join(s(self));
    },
    replace: (self, call) => {
      const old = argStr(call, 0, "replace");
      const neu = argStr(call, 1, "replace");
      const count = call.args[2] === undefined ? -1 : Number(asIndex(call.args[2] as PyValue));
      if (count < 0)
        return old === "" ? [...s(self)].join(neu).replace(/^/, neu) + neu : s(self).split(old).join(neu);
      let out = s(self);
      let done = 0;
      let pos = 0;
      while (done < count) {
        const i = out.indexOf(old, pos);
        if (i < 0) break;
        out = out.slice(0, i) + neu + out.slice(i + old.length);
        pos = i + neu.length + (old === "" ? 1 : 0);
        done++;
      }
      return out;
    },
    find: (self, call) => BigInt(s(self).indexOf(argStr(call, 0, "find"))),
    rfind: (self, call) => BigInt(s(self).lastIndexOf(argStr(call, 0, "rfind"))),
    index: (self, call) => {
      const i = s(self).indexOf(argStr(call, 0, "index"));
      if (i < 0) throw pyErr(EXC.ValueError, "substring not found");
      return BigInt(i);
    },
    count: (self, call) => {
      const sub = argStr(call, 0, "count");
      if (sub === "") return BigInt([...s(self)].length + 1);
      return BigInt(s(self).split(sub).length - 1);
    },
    startswith: (self, call) => {
      const p = call.args[0] as PyValue;
      const opts = p instanceof PyTuple ? p.items : [p];
      return opts.some((o) => s(self).startsWith(String(o)));
    },
    endswith: (self, call) => {
      const p = call.args[0] as PyValue;
      const opts = p instanceof PyTuple ? p.items : [p];
      return opts.some((o) => s(self).endsWith(String(o)));
    },
    isdigit: (self) => /^\d+$/u.test(s(self)),
    isnumeric: (self) => /^\p{N}+$/u.test(s(self)),
    isdecimal: (self) => /^\p{Nd}+$/u.test(s(self)),
    isalpha: (self) => /^\p{L}+$/u.test(s(self)),
    isalnum: (self) => /^[\p{L}\p{N}]+$/u.test(s(self)),
    isspace: (self) => /^\s+$/.test(s(self)),
    isupper: (self) => /\p{Lu}/u.test(s(self)) && !/\p{Ll}/u.test(s(self)),
    islower: (self) => /\p{Ll}/u.test(s(self)) && !/\p{Lu}/u.test(s(self)),
    center: (self, call) => {
      const { width, fill } = justify(call, "center");
      const t = s(self);
      const n = width - [...t].length;
      if (n <= 0) return t;
      const left = Math.floor(n / 2) + (n & width & 1);
      return fill.repeat(left) + t + fill.repeat(n - left);
    },
    ljust: (self, call) => {
      const { width, fill } = justify(call, "ljust");
      const t = s(self);
      return t + fill.repeat(Math.max(0, width - [...t].length));
    },
    rjust: (self, call) => {
      const { width, fill } = justify(call, "rjust");
      const t = s(self);
      return fill.repeat(Math.max(0, width - [...t].length)) + t;
    },
    zfill: (self, call) => {
      const width = Number(asIndex(call.args[0] as PyValue));
      let t = s(self);
      let sign = "";
      if (t.startsWith("+") || t.startsWith("-")) {
        sign = t[0] as string;
        t = t.slice(1);
      }
      return sign + "0".repeat(Math.max(0, width - [...t].length - sign.length)) + t;
    },
    format: (self, call) => strFormat(s(self), call),
  });

  const list = (v: PyValue) => v as PyList;
  table("list", {
    append: (self, call) => {
      arity("list.append", call, 1, 1);
      list(self).items.push(call.args[0] as PyValue);
      return null;
    },
    extend: function* (self, call): Gen<PyValue> {
      list(self).items.push(...(yield* interp.collect(call.args[0] as PyValue)));
      return null;
    },
    insert: (self, call) => {
      const items = list(self).items;
      let i = Number(asIndex(call.args[0] as PyValue));
      if (i < 0) i = Math.max(0, i + items.length);
      items.splice(Math.min(i, items.length), 0, call.args[1] as PyValue);
      return null;
    },
    pop: (self, call) => {
      const items = list(self).items;
      if (items.length === 0) throw pyErr(EXC.IndexError, "pop from empty list");
      let i = call.args.length ? Number(asIndex(call.args[0] as PyValue)) : items.length - 1;
      if (i < 0) i += items.length;
      if (i < 0 || i >= items.length) throw pyErr(EXC.IndexError, "pop index out of range");
      return items.splice(i, 1)[0] as PyValue;
    },
    remove: (self, call) => {
      const items = list(self).items;
      const i = items.findIndex((x) => pyEquals(x, call.args[0] as PyValue));
      if (i < 0) throw pyErr(EXC.ValueError, "list.remove(x): x not in list");
      items.splice(i, 1);
      return null;
    },
    index: (self, call) => {
      const i = list(self).items.findIndex((x) => pyEquals(x, call.args[0] as PyValue));
      if (i < 0) throw pyErr(EXC.ValueError, "list.index(x): x not in list");
      return BigInt(i);
    },
    count: (self, call) =>
      BigInt(list(self).items.filter((x) => pyEquals(x, call.args[0] as PyValue)).length),
    sort: function* (self, call): Gen<PyValue> {
      if (call.args.length) throw pyErr(EXC.TypeError, "sort() takes no positional arguments");
      const l = list(self);
      l.items = yield* sortItems(l.items, call, "sort");
      return null;
    },
    reverse: (self) => {
      list(self).items.reverse();
      return null;
    },
    clear: (self) => {
      list(self).items.length = 0;
      return null;
    },
    copy: (self) => new PyList([...list(self).items]),
  });

  table("tuple", {
    index: (self, call) => {
      const i = (self as PyTuple).items.findIndex((x) => pyEquals(x, call.args[0] as PyValue));
      if (i < 0) throw pyErr(EXC.ValueError, "tuple.index(x): x not in tuple");
      return BigInt(i);
    },
    count: (self, call) =>
      BigInt((self as PyTuple).items.filter((x) => pyEquals(x, call.args[0] as PyValue)).length),
  });

  const dict = (v: PyValue) => v as PyDict;
  table("dict", {
    keys: (self) => new PyDictView("dict_keys", dict(self)),
    values: (self) => new PyDictView("dict_values", dict(self)),
    items: (self) => new PyDictView("dict_items", dict(self)),
    get: (self, call) => {
      arity("get", call, 1, 2);
      return dict(self).get(call.args[0] as PyValue) ?? call.args[1] ?? null;
    },
    pop: (self, call) => {
      const d = dict(self);
      const k = call.args[0] as PyValue;
      const v = d.get(k);
      if (v === undefined) {
        if (call.args.length > 1) return call.args[1] as PyValue;
        throw new PyException(EXC.KeyError, repr(k), [k]);
      }
      d.delete(k);
      return v;
    },
    setdefault: (self, call) => {
      const d = dict(self);
      const k = call.args[0] as PyValue;
      const v = d.get(k);
      if (v !== undefined) return v;
      const dv = call.args[1] ?? null;
      d.set(k, dv);
      return dv;
    },
    update: (self, call) => {
      const d = dict(self);
      const src = call.args[0];
      if (src instanceof PyDict) for (const [k, v] of src.entries.values()) d.set(k, v);
      else if (src !== undefined) throw new Unsupported("dict.update(可迭代对象)");
      for (const [k, v] of call.kwargs) d.set(k, v);
      return null;
    },
    clear: (self) => {
      dict(self).entries.clear();
      return null;
    },
    copy: (self) => {
      const d = new PyDict();
      for (const [k, v] of dict(self).entries.values()) d.set(k, v);
      return d;
    },
  });
}

/** str.format with {} / {0} / {name} and format specs. */
function strFormat(template: string, call: CallArgs): string {
  let auto = 0;
  let out = "";
  let i = 0;
  while (i < template.length) {
    const ch = template[i] as string;
    if (ch === "{" && template[i + 1] === "{") {
      out += "{";
      i += 2;
      continue;
    }
    if (ch === "}" && template[i + 1] === "}") {
      out += "}";
      i += 2;
      continue;
    }
    if (ch === "}") throw pyErr(EXC.ValueError, "Single '}' encountered in format string");
    if (ch !== "{") {
      out += ch;
      i++;
      continue;
    }
    const end = template.indexOf("}", i);
    if (end < 0) throw pyErr(EXC.ValueError, "Single '{' encountered in format string");
    const field = template.slice(i + 1, end);
    if (field.includes("{")) throw new Unsupported("str.format 嵌套字段");
    let [name, spec] = field.includes(":")
      ? [field.slice(0, field.indexOf(":")), field.slice(field.indexOf(":") + 1)]
      : [field, ""];
    let conv: string | null = null;
    if (name?.includes("!")) {
      [name, conv] = name.split("!") as [string, string];
    }
    let v: PyValue;
    if (name === "") {
      const idx = auto++;
      if (idx >= call.args.length)
        throw pyErr(EXC.IndexError, `Replacement index ${idx} out of range for positional args tuple`);
      v = call.args[idx] as PyValue;
    } else if (/^\d+$/.test(name as string)) {
      const idx = Number(name);
      if (idx >= call.args.length)
        throw pyErr(EXC.IndexError, `Replacement index ${idx} out of range for positional args tuple`);
      v = call.args[idx] as PyValue;
    } else if (/^[A-Za-z_]\w*$/.test(name as string)) {
      const got = call.kwargs.get(name as string);
      if (got === undefined) throw new PyException(EXC.KeyError, repr(name as string), [name as string]);
      v = got;
    } else throw new Unsupported("str.format 字段写法");
    if (conv === "r") v = repr(v);
    else if (conv === "s") v = str(v);
    else if (conv !== null) throw new Unsupported("str.format 转换");
    out += formatValue(v, spec ?? "");
    i = end + 1;
  }
  return out;
}

export { isGenerator };
