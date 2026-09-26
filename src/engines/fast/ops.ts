/** Arithmetic, comparison and containment with CPython's exact semantics and error messages. */
import type { BinOpName, CmpOp } from "./ast";
import { EXC, pyErr, Unsupported } from "./errors";
import { bigToFloat, floorDivBig, floorDivFloat, modBig, modFloat, trueDivBig } from "./numbers";
import {
  isInt,
  isNumber,
  PyDict,
  PyDictView,
  PyList,
  PyRange,
  PyTuple,
  type PyValue,
  PyVec2D,
  pyEquals,
  toBig,
  toFloat,
  typeName,
} from "./values";

function unsupportedOperands(op: string, a: PyValue, b: PyValue): never {
  throw pyErr(EXC.TypeError, `unsupported operand type(s) for ${op}: '${typeName(a)}' and '${typeName(b)}'`);
}

function checkVec(a: PyValue, b: PyValue): void {
  // turtle's Vec2D has vector arithmetic; the fast engine does not model it
  if (a instanceof PyVec2D || b instanceof PyVec2D) throw new Unsupported("Vec2D 向量运算");
}

function repeatSeq(seq: PyValue, n: bigint | boolean): PyValue {
  const count = Number(toBig(n));
  if (typeof seq === "string") return count > 0 ? seq.repeat(count) : "";
  if (count > 1e7) throw pyErr(EXC.OverflowError, "repeated sequence is too large");
  const items = (seq as PyList | PyTuple).items;
  const out: PyValue[] = [];
  for (let i = 0; i < count; i++) out.push(...items);
  return seq instanceof PyList ? new PyList(out) : new PyTuple(out);
}

export function binaryOp(op: BinOpName, a: PyValue, b: PyValue): PyValue {
  checkVec(a, b);
  if (isNumber(a) && isNumber(b)) return numericOp(op, a, b);
  switch (op) {
    case "+":
      if (typeof a === "string") {
        if (typeof b === "string") return a + b;
        throw pyErr(EXC.TypeError, `can only concatenate str (not "${typeName(b)}") to str`);
      }
      if (a instanceof PyList) {
        if (b instanceof PyList) return new PyList([...a.items, ...b.items]);
        throw pyErr(EXC.TypeError, `can only concatenate list (not "${typeName(b)}") to list`);
      }
      if (a instanceof PyTuple) {
        if (b instanceof PyTuple) return new PyTuple([...a.items, ...b.items]);
        throw pyErr(EXC.TypeError, `can only concatenate tuple (not "${typeName(b)}") to tuple`);
      }
      return unsupportedOperands("+", a, b);
    case "*":
      if ((typeof a === "string" || a instanceof PyList || a instanceof PyTuple) && isInt(b))
        return repeatSeq(a, b);
      if ((typeof b === "string" || b instanceof PyList || b instanceof PyTuple) && isInt(a))
        return repeatSeq(b, a);
      if (typeof a === "string" || a instanceof PyList || a instanceof PyTuple)
        throw pyErr(EXC.TypeError, `can't multiply sequence by non-int of type '${typeName(b)}'`);
      if (typeof b === "string" || b instanceof PyList || b instanceof PyTuple)
        throw pyErr(EXC.TypeError, `can't multiply sequence by non-int of type '${typeName(a)}'`);
      return unsupportedOperands("*", a, b);
    case "%":
      if (typeof a === "string") throw new Unsupported("% 字符串格式化");
      return unsupportedOperands("%", a, b);
    default:
      return unsupportedOperands(op, a, b);
  }
}

function numericOp(op: BinOpName, a: bigint | boolean | number, b: bigint | boolean | number): PyValue {
  if (typeof a !== "number" && typeof b !== "number") {
    const x = toBig(a);
    const y = toBig(b);
    switch (op) {
      case "+":
        return x + y;
      case "-":
        return x - y;
      case "*":
        return x * y;
      case "/":
        if (y === 0n) throw pyErr(EXC.ZeroDivisionError, "division by zero");
        return trueDivBig(x, y);
      case "//":
        if (y === 0n) throw pyErr(EXC.ZeroDivisionError, "division by zero");
        return floorDivBig(x, y);
      case "%":
        if (y === 0n) throw pyErr(EXC.ZeroDivisionError, "division by zero");
        return modBig(x, y);
      case "**":
        if (y < 0n) {
          if (x === 0n) throw pyErr(EXC.ZeroDivisionError, "zero to a negative power");
          return bigToFloat(x) ** bigToFloat(y);
        }
        if (y > 100000n && (x > 1n || x < -1n)) throw new Unsupported("超大整数幂");
        return x ** y;
    }
  }
  const x = toFloat(a);
  const y = toFloat(b);
  switch (op) {
    case "+":
      return x + y;
    case "-":
      return x - y;
    case "*":
      return x * y;
    case "/":
      if (y === 0) throw pyErr(EXC.ZeroDivisionError, "division by zero");
      return x / y;
    case "//":
      if (y === 0) throw pyErr(EXC.ZeroDivisionError, "division by zero");
      return floorDivFloat(x, y);
    case "%":
      if (y === 0) throw pyErr(EXC.ZeroDivisionError, "division by zero");
      return modFloat(x, y);
    case "**": {
      if (x === 0 && y < 0) throw pyErr(EXC.ZeroDivisionError, "zero to a negative power");
      if (x < 0 && !Number.isInteger(y)) throw new Unsupported("负数的小数次幂（复数）");
      const r = x ** y;
      if (!Number.isFinite(r) && Number.isFinite(x) && Number.isFinite(y))
        throw pyErr(EXC.OverflowError, "(34, 'Numerical result out of range')");
      return r;
    }
  }
}

export function unaryMinus(v: PyValue): PyValue {
  if (typeof v === "number") return -v;
  if (isInt(v)) return -toBig(v);
  throw pyErr(EXC.TypeError, `bad operand type for unary -: '${typeName(v)}'`);
}

export function unaryPlus(v: PyValue): PyValue {
  if (typeof v === "number") return v;
  if (isInt(v)) return toBig(v);
  throw pyErr(EXC.TypeError, `bad operand type for unary +: '${typeName(v)}'`);
}

/** <, >, <=, >= */
export function orderCompare(op: "<" | ">" | "<=" | ">=", a: PyValue, b: PyValue): boolean {
  const c = cmp(a, b, op);
  switch (op) {
    case "<":
      return c < 0;
    case ">":
      return c > 0;
    case "<=":
      return c <= 0;
    case ">=":
      return c >= 0;
  }
}

/** Three-way comparison for ordering; NaN compares as unordered (returns NaN). */
export function cmp(a: PyValue, b: PyValue, op: string): number {
  if (isNumber(a) && isNumber(b)) {
    if (typeof a !== "number" && typeof b !== "number") {
      const x = toBig(a);
      const y = toBig(b);
      return x < y ? -1 : x > y ? 1 : 0;
    }
    // exact int/float comparison
    if (typeof a === "number" && typeof b === "number")
      return a < b ? -1 : a > b ? 1 : a === b ? 0 : Number.NaN;
    const [f, i, flip] = typeof a === "number" ? [a, toBig(b as bigint), 1] : [b as number, toBig(a), -1];
    if (Number.isNaN(f)) return Number.NaN;
    if (!Number.isFinite(f)) return (f > 0 ? 1 : -1) * flip;
    const fi = BigInt(Math.trunc(f));
    let r: number;
    if (fi !== i) r = fi < i ? -1 : 1;
    else {
      const frac = f - Math.trunc(f);
      r = frac > 0 ? 1 : frac < 0 ? -1 : 0;
    }
    return r * flip;
  }
  if (typeof a === "string" && typeof b === "string") {
    // compare by code point
    const ca = [...a];
    const cb = [...b];
    for (let i = 0; i < Math.min(ca.length, cb.length); i++) {
      const x = (ca[i] as string).codePointAt(0) as number;
      const y = (cb[i] as string).codePointAt(0) as number;
      if (x !== y) return x < y ? -1 : 1;
    }
    return ca.length - cb.length === 0 ? 0 : ca.length < cb.length ? -1 : 1;
  }
  if ((a instanceof PyList && b instanceof PyList) || (a instanceof PyTuple && b instanceof PyTuple)) {
    const xs = a.items;
    const ys = b.items;
    for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
      if (!pyEquals(xs[i] as PyValue, ys[i] as PyValue)) return cmp(xs[i] as PyValue, ys[i] as PyValue, op);
    }
    return xs.length === ys.length ? 0 : xs.length < ys.length ? -1 : 1;
  }
  throw pyErr(
    EXC.TypeError,
    `'${op}' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`,
  );
}

export function contains(container: PyValue, item: PyValue): boolean {
  if (typeof container === "string") {
    if (typeof item !== "string")
      throw pyErr(EXC.TypeError, `'in <string>' requires string as left operand, not ${typeName(item)}`);
    return container.includes(item);
  }
  if (container instanceof PyList || container instanceof PyTuple)
    return container.items.some((x) => x === item || pyEquals(x, item));
  if (container instanceof PyDict) return container.has(item);
  if (container instanceof PyDictView)
    return container.typeName === "dict_keys"
      ? container.dict.has(item)
      : container.items().some((x) => pyEquals(x, item));
  if (container instanceof PyRange) {
    if (!isInt(item)) {
      if (typeof item === "number" && Number.isInteger(item)) return contains(container, BigInt(item));
      return false;
    }
    const v = toBig(item);
    const { start, stop, step } = container;
    if (step > 0n ? v < start || v >= stop : v > start || v <= stop) return false;
    return (v - start) % step === 0n;
  }
  throw pyErr(EXC.TypeError, `argument of type '${typeName(container)}' is not a container or iterable`);
}

export function compareOp(op: CmpOp, a: PyValue, b: PyValue): boolean {
  switch (op) {
    case "==":
      return pyEquals(a, b);
    case "!=":
      return !pyEquals(a, b);
    case "in":
      return contains(b, a);
    case "not in":
      return !contains(b, a);
    case "is":
      return isSame(a, b);
    case "is not":
      return !isSame(a, b);
    default:
      return orderCompare(op, a, b);
  }
}

function isSame(a: PyValue, b: PyValue): boolean {
  if (a === null || b === null || typeof a === "boolean" || typeof b === "boolean") return a === b;
  if (typeof a === "object" || typeof b === "object") return a === b;
  // identity of ints/floats/strs is an implementation detail in CPython
  throw new Unsupported("对数字或字符串使用 is");
}
