/**
 * The fast engine's Python object model.
 *
 *   int      → bigint           float → number
 *   bool     → boolean          str   → string
 *   None     → null             everything else → a class below
 *
 * Keeping ints as bigint and floats as number keeps `4/2 == 2.0` and
 * `2**100` exact without tagging every value.
 */
import { EXC, PyException, type PyExcType, pyErr } from "./errors";
import { floatRepr, toFixedExact } from "./numbers";

export type PyValue = bigint | number | boolean | string | null | PyObject;

export abstract class PyObject {
  abstract readonly typeName: string;
}

export class PyList extends PyObject {
  readonly typeName = "list";
  constructor(public items: PyValue[]) {
    super();
  }
}

export class PyTuple extends PyObject {
  readonly typeName: string = "tuple";
  constructor(readonly items: PyValue[]) {
    super();
  }
}

/** turtle's Vec2D: a tuple with its own repr and vector arithmetic. */
export class PyVec2D extends PyTuple {
  override readonly typeName = "Vec2D";
  constructor(x: number, y: number) {
    super([x, y]);
  }
  get x(): number {
    return this.items[0] as number;
  }
  get y(): number {
    return this.items[1] as number;
  }
}

export class PyDict extends PyObject {
  readonly typeName = "dict";
  /** hashKey → [key, value], in insertion order */
  readonly entries = new Map<string, [PyValue, PyValue]>();

  get(key: PyValue): PyValue | undefined {
    return this.entries.get(hashKey(key))?.[1];
  }
  set(key: PyValue, value: PyValue): void {
    const h = hashKey(key);
    const existing = this.entries.get(h);
    if (existing) existing[1] = value;
    else this.entries.set(h, [key, value]);
  }
  has(key: PyValue): boolean {
    return this.entries.has(hashKey(key));
  }
  delete(key: PyValue): boolean {
    return this.entries.delete(hashKey(key));
  }
  keys(): PyValue[] {
    return [...this.entries.values()].map((e) => e[0]);
  }
}

export class PyRange extends PyObject {
  readonly typeName = "range";
  constructor(
    readonly start: bigint,
    readonly stop: bigint,
    readonly step: bigint,
  ) {
    super();
  }
  get length(): bigint {
    const { start, stop, step } = this;
    if (step > 0n) return stop > start ? (stop - start + step - 1n) / step : 0n;
    return start > stop ? (start - stop - step - 1n) / -step : 0n;
  }
  at(i: bigint): bigint {
    return this.start + i * this.step;
  }
}

/** A Python-level exception instance (what `except E as e` binds). */
export class PyExceptionValue extends PyObject {
  readonly typeName: string;
  constructor(readonly exc: PyException) {
    super();
    this.typeName = exc.type.name;
  }
}

/** An exception class used as a value (ValueError, ...). */
export class PyExcClass extends PyObject {
  readonly typeName = "type";
  constructor(readonly exc: PyExcType) {
    super();
  }
}

/** A builtin type object used as a value: int, str, list, ... */
export class PyTypeObject extends PyObject {
  readonly typeName = "type";
  constructor(
    readonly name: string,
    /** Call the type (conversion/constructor). */
    readonly call: NativeFn,
  ) {
    super();
  }
}

export interface CallArgs {
  args: PyValue[];
  kwargs: Map<string, PyValue>;
}

/** Suspension requests a running program yields to the engine driver. */
export type Suspend =
  | { kind: "sleep"; ms: number }
  | { kind: "input"; prompt: string }
  | { kind: "dialog"; title: string; prompt: string }
  | { kind: "event"; timeoutMs: number | null }
  | { kind: "tick" };

/** Resume value the driver sends back (text for input, event dict, ...). */
export type Resume = unknown;

export type Gen<T> = Generator<Suspend, T, Resume>;

/** Native callables may be plain or generators (to call back into Python). */
export type NativeFn = (call: CallArgs) => PyValue | Gen<PyValue>;

export class PyBuiltin extends PyObject {
  readonly typeName = "builtin_function_or_method";
  constructor(
    readonly name: string,
    readonly fn: NativeFn,
  ) {
    super();
  }
}

export class PyModule extends PyObject {
  readonly typeName = "module";
  constructor(
    readonly name: string,
    readonly attrs: Map<string, PyValue>,
  ) {
    super();
  }
}

/** Objects implemented natively with named methods (turtles, screens). */
export class PyNative extends PyObject {
  constructor(
    readonly typeName: string,
    readonly methods: Map<string, NativeFn>,
  ) {
    super();
  }
}

export class PyBoundMethod extends PyObject {
  readonly typeName = "builtin_function_or_method";
  constructor(
    readonly self: PyValue,
    readonly name: string,
    readonly fn: NativeFn,
  ) {
    super();
  }
}

/** dict.keys() / values() / items(): live views over a dict. */
export class PyDictView extends PyObject {
  constructor(
    readonly typeName: "dict_keys" | "dict_values" | "dict_items",
    readonly dict: PyDict,
  ) {
    super();
  }
  items(): PyValue[] {
    const entries = [...this.dict.entries.values()];
    if (this.typeName === "dict_keys") return entries.map((e) => e[0]);
    if (this.typeName === "dict_values") return entries.map((e) => e[1]);
    return entries.map(([k, v]) => new PyTuple([k, v]));
  }
}

/** Iterator protocol: next() returns DONE when exhausted. May suspend. */
export const DONE: unique symbol = Symbol("DONE");
export class PyIterator extends PyObject {
  constructor(
    readonly typeName: string,
    readonly next: () => PyValue | typeof DONE | Gen<PyValue | typeof DONE>,
  ) {
    super();
  }
}

// ---------------------------------------------------------------- type names

export function typeName(v: PyValue): string {
  if (v === null) return "NoneType";
  switch (typeof v) {
    case "bigint":
      return "int";
    case "number":
      return "float";
    case "boolean":
      return "bool";
    case "string":
      return "str";
    default:
      return v.typeName;
  }
}

export function isInt(v: PyValue): v is bigint | boolean {
  return typeof v === "bigint" || typeof v === "boolean";
}

export function isNumber(v: PyValue): v is bigint | boolean | number {
  return typeof v === "bigint" || typeof v === "boolean" || typeof v === "number";
}

export function toBig(v: bigint | boolean): bigint {
  return typeof v === "boolean" ? (v ? 1n : 0n) : v;
}

export function toFloat(v: bigint | boolean | number): number {
  if (typeof v === "number") return v;
  const n = Number(toBig(v));
  if (!Number.isFinite(n)) throw pyErr(EXC.OverflowError, "int too large to convert to float");
  return n;
}

// ---------------------------------------------------------------- truthiness

export function truthy(v: PyValue): boolean {
  if (v === null) return false;
  switch (typeof v) {
    case "boolean":
      return v;
    case "bigint":
      return v !== 0n;
    case "number":
      return v !== 0;
    case "string":
      return v.length > 0;
  }
  if (v instanceof PyList || v instanceof PyTuple) return v.items.length > 0;
  if (v instanceof PyDict) return v.entries.size > 0;
  if (v instanceof PyRange) return v.length > 0n;
  if (v instanceof PyDictView) return v.dict.entries.size > 0;
  return true;
}

// ---------------------------------------------------------------- repr / str

const STR_ESCAPES: Record<string, string> = { "\\": "\\\\", "\n": "\\n", "\r": "\\r", "\t": "\\t" };

export function strRepr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    const esc = STR_ESCAPES[ch];
    if (esc) out += esc;
    else if (ch === quote) out += `\\${quote}`;
    else {
      const cp = ch.codePointAt(0) as number;
      if (cp < 0x20 || cp === 0x7f) out += `\\x${cp.toString(16).padStart(2, "0")}`;
      else if (isNonPrintable(cp)) {
        out +=
          cp <= 0xff
            ? `\\x${cp.toString(16).padStart(2, "0")}`
            : cp <= 0xffff
              ? `\\u${cp.toString(16).padStart(4, "0")}`
              : `\\U${cp.toString(16).padStart(8, "0")}`;
      } else out += ch;
    }
  }
  return out + quote;
}

function isNonPrintable(cp: number): boolean {
  // Python's str.isprintable: control, format, surrogate, private use,
  // unassigned and separators other than ASCII space are escaped.
  if (cp >= 0x80 && cp <= 0xa0) return true;
  if (cp === 0xad) return true;
  if (cp >= 0xd800 && cp <= 0xdfff) return true;
  if (cp === 0x2028 || cp === 0x2029) return true;
  return /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u.test(String.fromCodePoint(cp)) && cp !== 0x20;
}

export function repr(v: PyValue, seen: Set<PyObject> = new Set()): string {
  if (v === null) return "None";
  switch (typeof v) {
    case "boolean":
      return v ? "True" : "False";
    case "bigint":
      return v.toString();
    case "number":
      return floatRepr(v);
    case "string":
      return strRepr(v);
  }
  if (seen.has(v)) return v instanceof PyList ? "[...]" : v instanceof PyDict ? "{...}" : "(...)";
  if (v instanceof PyVec2D) return `(${fmt2(v.x)},${fmt2(v.y)})`;
  if (v instanceof PyList) {
    seen.add(v);
    const s = `[${v.items.map((x) => repr(x, seen)).join(", ")}]`;
    seen.delete(v);
    return s;
  }
  if (v instanceof PyTuple) {
    seen.add(v);
    const inner = v.items.map((x) => repr(x, seen));
    seen.delete(v);
    return inner.length === 1 ? `(${inner[0]},)` : `(${inner.join(", ")})`;
  }
  if (v instanceof PyDict) {
    seen.add(v);
    const s = `{${[...v.entries.values()].map(([k, x]) => `${repr(k, seen)}: ${repr(x, seen)}`).join(", ")}}`;
    seen.delete(v);
    return s;
  }
  if (v instanceof PyRange) {
    return v.step === 1n ? `range(${v.start}, ${v.stop})` : `range(${v.start}, ${v.stop}, ${v.step})`;
  }
  if (v instanceof PyDictView) return `${v.typeName}(${repr(new PyList(v.items()), seen)})`;
  if (v instanceof PyTypeObject) return `<class '${v.name}'>`;
  if (v instanceof PyExcClass) return `<class '${v.exc.name}'>`;
  if (v instanceof PyExceptionValue) {
    const args = v.exc.args.map((a) => repr(a as PyValue));
    return `${v.typeName}(${args.join(", ")})`;
  }
  if (v instanceof PyModule) return `<module '${v.name}'>`;
  if (v instanceof PyBuiltin) return `<built-in function ${v.name}>`;
  // CPython shows a memory address here; any address is as good as another
  return `<${v.typeName} object at 0x${(0x7f0000000000 + Number(hashKey(v).slice(1)) * 16).toString(16)}>`;
}

/** '%.2f' — used by Vec2D.__repr__ */
function fmt2(n: number): string {
  if (!Number.isFinite(n)) return floatRepr(n);
  return toFixedExact(n, 2);
}

export function str(v: PyValue): string {
  if (typeof v === "string") return v;
  if (v instanceof PyExceptionValue) {
    const args = v.exc.args;
    if (args.length === 0) return "";
    if (args.length === 1)
      return v.exc.type === EXC.KeyError ? repr(args[0] as PyValue) : str(args[0] as PyValue);
    return repr(new PyTuple(args as PyValue[]));
  }
  return repr(v);
}

// ---------------------------------------------------------------- equality / hashing

export function pyEquals(a: PyValue, b: PyValue): boolean {
  if (isNumber(a) && isNumber(b)) {
    if (typeof a === "number" || typeof b === "number") return toFloat(a) === toFloat(b);
    return toBig(a) === toBig(b);
  }
  if (typeof a === "string" || typeof b === "string") return a === b;
  if (a === null || b === null) return a === b;
  if (a instanceof PyList && b instanceof PyList) return seqEquals(a.items, b.items);
  if (a instanceof PyTuple && b instanceof PyTuple && !(a instanceof PyVec2D) === !(b instanceof PyVec2D))
    return seqEquals(a.items, b.items);
  if (a instanceof PyTuple && b instanceof PyTuple) return seqEquals(a.items, b.items);
  if (a instanceof PyDict && b instanceof PyDict) {
    if (a.entries.size !== b.entries.size) return false;
    for (const [h, [, v]] of a.entries) {
      const other = b.entries.get(h);
      if (!other || !pyEquals(v, other[1])) return false;
    }
    return true;
  }
  if (a instanceof PyRange && b instanceof PyRange) {
    const la = a.length;
    return la === b.length && (la === 0n || (a.start === b.start && (la === 1n || a.step === b.step)));
  }
  return a === b;
}

function seqEquals(a: PyValue[], b: PyValue[]): boolean {
  return a.length === b.length && a.every((x, i) => pyEquals(x, b[i] as PyValue));
}

/** Key for dict storage; equal Python values (1, 1.0, True) share a key. */
export function hashKey(v: PyValue): string {
  if (v === null) return "N";
  switch (typeof v) {
    case "boolean":
      return `i${v ? 1 : 0}`;
    case "bigint":
      return `i${v}`;
    case "number":
      return Number.isInteger(v) ? `i${BigInt(v)}` : `f${v}`;
    case "string":
      return `s${v}`;
  }
  if (v instanceof PyTuple) return `t(${v.items.map(hashKey).join(",")})`;
  if (v instanceof PyList || v instanceof PyDict) {
    throw pyErr(EXC.TypeError, `cannot use '${v.typeName}' as a dict key (unhashable type: '${v.typeName}')`);
  }
  // identity-hashed objects
  let id = identities.get(v);
  if (id === undefined) {
    id = nextIdentity++;
    identities.set(v, id);
  }
  return `o${id}`;
}
const identities = new WeakMap<PyObject, number>();
let nextIdentity = 1;

export { PyException };
