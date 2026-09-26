/** CPython's `math` module (the functions a beginner uses), with CPython's messages. */
import { EXC, pyErr, Unsupported } from "../errors";
import type { Interpreter } from "../interpreter";
import { floatRepr } from "../numbers";
import {
  type CallArgs,
  type Gen,
  isInt,
  isNumber,
  PyBuiltin,
  PyModule,
  type PyValue,
  toBig,
  toFloat,
  typeName,
} from "../values";

function real(v: PyValue | undefined): number {
  if (v !== undefined && isNumber(v)) return toFloat(v);
  throw pyErr(EXC.TypeError, `must be real number, not ${typeName(v ?? null)}`);
}

function intArg(v: PyValue | undefined): bigint {
  if (v !== undefined && isInt(v)) return toBig(v);
  throw pyErr(EXC.TypeError, `'${typeName(v ?? null)}' object cannot be interpreted as an integer`);
}

function checkResult(r: number, x: number): number {
  if (Number.isNaN(r) && !Number.isNaN(x)) throw pyErr(EXC.ValueError, "math domain error");
  if (!Number.isFinite(r) && Number.isFinite(x)) throw pyErr(EXC.OverflowError, "math range error");
  return r;
}

export function createMathModule(interp: Interpreter): PyModule {
  const attrs = new Map<string, PyValue>([
    ["pi", Math.PI],
    ["e", Math.E],
    ["tau", 2 * Math.PI],
    ["inf", Number.POSITIVE_INFINITY],
    ["nan", Number.NaN],
  ]);
  const def = (name: string, fn: (call: CallArgs) => PyValue | Gen<PyValue>) =>
    attrs.set(name, new PyBuiltin(name, fn));
  const unary = (name: string, f: (x: number) => number, domain?: (x: number) => string | null) =>
    def(name, (call) => {
      if (call.args.length !== 1)
        throw pyErr(EXC.TypeError, `math.${name}() takes exactly one argument (${call.args.length} given)`);
      const x = real(call.args[0]);
      const msg = domain?.(x);
      if (msg) throw pyErr(EXC.ValueError, msg);
      return checkResult(f(x), x);
    });

  unary("sqrt", Math.sqrt, (x) => (x < 0 ? `expected a nonnegative input, got ${floatRepr(x)}` : null));
  unary("sin", Math.sin);
  unary("cos", Math.cos);
  unary("tan", Math.tan);
  unary("asin", Math.asin, (x) =>
    x < -1 || x > 1 ? `expected a number in range from -1 up to 1, got ${floatRepr(x)}` : null,
  );
  unary("acos", Math.acos, (x) =>
    x < -1 || x > 1 ? `expected a number in range from -1 up to 1, got ${floatRepr(x)}` : null,
  );
  unary("atan", Math.atan);
  unary("exp", Math.exp);
  unary("fabs", Math.abs);
  unary("log10", Math.log10, (x) => (x <= 0 ? "expected a positive input" : null));
  unary("log2", Math.log2, (x) => (x <= 0 ? "expected a positive input" : null));
  unary("degrees", (x) => x * (180 / Math.PI));
  unary("radians", (x) => x * (Math.PI / 180));
  def("atan2", (call) => Math.atan2(real(call.args[0]), real(call.args[1])));
  def("pow", (call) => {
    const x = real(call.args[0]);
    const y = real(call.args[1]);
    if (x === 0 && y < 0) throw pyErr(EXC.ValueError, "math domain error");
    if (x < 0 && !Number.isInteger(y)) throw pyErr(EXC.ValueError, "math domain error");
    return checkResult(x ** y, x);
  });
  def("log", (call) => {
    const x = real(call.args[0]);
    if (x <= 0) throw pyErr(EXC.ValueError, "expected a positive input");
    if (call.args.length > 1) {
      const b = real(call.args[1]);
      if (b <= 0) throw pyErr(EXC.ValueError, "expected a positive input");
      if (b === 1) throw pyErr(EXC.ZeroDivisionError, "division by zero");
      return Math.log(x) / Math.log(b);
    }
    return Math.log(x);
  });
  const rounding = (name: string, f: (x: number) => number) =>
    def(name, (call) => {
      const v = call.args[0];
      if (v !== undefined && isInt(v)) return toBig(v);
      const x = real(v);
      if (Number.isNaN(x)) throw pyErr(EXC.ValueError, "cannot convert float NaN to integer");
      if (!Number.isFinite(x)) throw pyErr(EXC.OverflowError, "cannot convert float infinity to integer");
      return BigInt(f(x));
    });
  rounding("floor", Math.floor);
  rounding("ceil", Math.ceil);
  rounding("trunc", Math.trunc);
  def("hypot", (call) => Math.hypot(...call.args.map((a) => real(a))));
  def("factorial", (call) => {
    const n = intArg(call.args[0]);
    if (n < 0n) throw pyErr(EXC.ValueError, "factorial() not defined for negative values");
    let r = 1n;
    for (let i = 2n; i <= n; i++) r *= i;
    return r;
  });
  def("gcd", (call) => {
    let r = 0n;
    for (const a of call.args) {
      let x = intArg(a);
      if (x < 0n) x = -x;
      let y = r;
      while (y) [x, y] = [y, x % y];
      r = x;
    }
    return r;
  });
  def("isqrt", (call) => {
    const n = intArg(call.args[0]);
    if (n < 0n) throw pyErr(EXC.ValueError, "isqrt() argument must be nonnegative");
    if (n < 2n) return n;
    let x = BigInt(Math.floor(Math.sqrt(Number(n))));
    while (x * x > n) x--;
    while ((x + 1n) * (x + 1n) <= n) x++;
    return x;
  });
  def("comb", (call) => {
    const n = intArg(call.args[0]);
    const k = intArg(call.args[1]);
    if (n < 0n) throw pyErr(EXC.ValueError, "n must be a non-negative integer");
    if (k < 0n) throw pyErr(EXC.ValueError, "k must be a non-negative integer");
    if (k > n) return 0n;
    let r = 1n;
    const kk = k < n - k ? k : n - k;
    for (let i = 0n; i < kk; i++) r = (r * (n - i)) / (i + 1n);
    return r;
  });
  def("isclose", () => {
    throw new Unsupported("math.isclose");
  });
  void interp;
  return new PyModule("math", attrs);
}
