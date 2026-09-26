/**
 * CPython-exact number formatting and arithmetic helpers.
 *
 * Python floats are IEEE doubles like JS numbers, but Python *prints* and
 * *rounds* them differently: repr switches to exponent form at 1e16/1e-5,
 * and round()/format() round the exact binary value half-to-even, while JS
 * toFixed rounds ties away from zero. Everything here works from the exact
 * decimal expansion of the double, so results match CPython digit for digit.
 */

/** Exact decimal expansion of a finite double: value = digits × 10^exp (digits has no sign). */
export function exactDecimal(x: number): { neg: boolean; digits: string; exp: number } {
  const neg = x < 0 || Object.is(x, -0);
  x = Math.abs(x);
  if (x === 0) return { neg, digits: "0", exp: 0 };
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  const hi = buf.getUint32(0);
  const lo = buf.getUint32(4);
  const biasedExp = (hi >>> 20) & 0x7ff;
  let mantissa = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e2: number;
  if (biasedExp === 0) {
    e2 = -1074;
  } else {
    mantissa |= 1n << 52n;
    e2 = biasedExp - 1075;
  }
  // value = mantissa * 2^e2
  if (e2 >= 0) return { neg, digits: (mantissa << BigInt(e2)).toString(), exp: 0 };
  // mantissa / 2^k = mantissa * 5^k / 10^k
  const k = -e2;
  const digits = (mantissa * 5n ** BigInt(k)).toString();
  return { neg, digits, exp: -k };
}

/**
 * Round the exact value of x to `ndigits` digits after the decimal point,
 * half to even. Returns the rounded integer significand and scale:
 * result = sig × 10^-ndigits.
 */
function roundScaled(x: number, ndigits: number): { neg: boolean; sig: bigint } {
  const { neg, digits, exp } = exactDecimal(x);
  // value = digits × 10^exp; we want round(value × 10^ndigits)
  const shift = exp + ndigits;
  let sig: bigint;
  if (shift >= 0) {
    sig = BigInt(digits) * 10n ** BigInt(shift);
  } else {
    const cut = -shift;
    if (cut > digits.length) {
      sig = 0n;
      // value < 0.1 × 10^-ndigits: rounds to 0 (can't be exactly half)
    } else {
      const keep = digits.slice(0, digits.length - cut) || "0";
      const rest = digits.slice(digits.length - cut);
      sig = BigInt(keep);
      const first = rest.charCodeAt(0) - 48;
      const tailNonZero = /[1-9]/.test(rest.slice(1));
      if (first > 5 || (first === 5 && (tailNonZero || sig % 2n === 1n))) sig += 1n;
    }
  }
  return { neg, sig };
}

/** Fixed-point digits, like '%.{p}f' in C / Python (exact, half-even). */
export function toFixedExact(x: number, precision: number): string {
  const { neg, sig } = roundScaled(x, precision);
  let s = sig.toString();
  if (precision > 0) {
    s = s.padStart(precision + 1, "0");
    s = `${s.slice(0, s.length - precision)}.${s.slice(s.length - precision)}`;
  }
  return (neg ? "-" : "") + s;
}

/** Scientific digits, like '%.{p}e' (exact, half-even). */
export function toExponentialExact(x: number, precision: number): string {
  if (x === 0) {
    const zeros = precision > 0 ? `.${"0".repeat(precision)}` : "";
    return `${Object.is(x, -0) ? "-" : ""}0${zeros}e+00`;
  }
  const { neg, digits, exp } = exactDecimal(x);
  // decimal exponent of the leading digit
  let e10 = digits.length - 1 + exp;
  // round to precision+1 significant digits
  let sig = roundScaled(Math.abs(x), precision - e10).sig;
  if (sig.toString().length > precision + 1) {
    // rounding carried into a new digit (9.99 → 10.0)
    e10 += 1;
    sig = roundScaled(Math.abs(x), precision - e10).sig;
  }
  const s = sig.toString();
  const mant = precision > 0 ? `${s[0]}.${s.slice(1)}` : s;
  const es = `${e10 < 0 ? "-" : "+"}${String(Math.abs(e10)).padStart(2, "0")}`;
  return `${neg ? "-" : ""}${mant}e${es}`;
}

/** Shortest round-trip digits (JS and Python agree on these). */
function shortest(x: number): { digits: string; e10: number } {
  const s = Math.abs(x).toExponential(); // shortest round-trip mantissa
  const [m, e] = s.split("e") as [string, string];
  return { digits: m.replace(".", ""), e10: Number(e) };
}

/** repr(float) / str(float) exactly as CPython prints them. */
export function floatRepr(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const sign = x < 0 ? "-" : "";
  const { digits, e10 } = shortest(x);
  if (e10 >= 16 || e10 < -4) {
    const mant = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    return `${sign}${mant}e${e10 < 0 ? "-" : "+"}${String(Math.abs(e10)).padStart(2, "0")}`;
  }
  if (e10 < 0) return `${sign}0.${"0".repeat(-e10 - 1)}${digits}`;
  const intLen = e10 + 1;
  if (digits.length <= intLen) return `${sign}${digits}${"0".repeat(intLen - digits.length)}.0`;
  return `${sign}${digits.slice(0, intLen)}.${digits.slice(intLen)}`;
}

/** Python's round(x, n) for floats (n may be negative). */
export function roundFloat(x: number, ndigits: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  if (ndigits > 22) return x;
  const { neg, sig } = roundScaled(x, ndigits);
  const text = `${neg ? "-" : ""}${sig.toString()}e${-ndigits}`;
  const r = Number(text);
  return r === 0 && neg ? -0 : r;
}

/** Python round(x) with no ndigits → int (half to even). */
export function roundHalfEvenToBigInt(x: number): bigint {
  const { neg, sig } = roundScaled(x, 0);
  return neg ? -sig : sig;
}

// ---------------------------------------------------------------- int ops

export function floorDivBig(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

export function modBig(a: bigint, b: bigint): bigint {
  const r = a % b;
  return r !== 0n && r < 0n !== b < 0n ? r + b : r;
}

/** Python float %: result has the sign of the divisor. */
export function modFloat(a: number, b: number): number {
  const r = a % b;
  if (r !== 0 && r < 0 !== b < 0) return r + b;
  if (r === 0) return b < 0 ? -0 : 0;
  return r;
}

/** Python float //. */
export function floorDivFloat(a: number, b: number): number {
  const mod = a % b;
  let div = (a - mod) / b;
  if (mod !== 0 && b < 0 !== mod < 0) div -= 1;
  if (div === 0) return a / b < 0 ? -0 : 0;
  const floordiv = Math.floor(div);
  return div - floordiv > 0.5 ? floordiv + 1 : floordiv;
}

/** int → float with Python's OverflowError semantics left to the caller. */
export function bigToFloat(n: bigint): number {
  return Number(n);
}

/** True division of ints, correctly rounded for the common range. */
export function trueDivBig(a: bigint, b: bigint): number {
  const LIMIT = 2n ** 53n;
  const absA = a < 0n ? -a : a;
  const absB = b < 0n ? -b : b;
  if (absA <= LIMIT && absB <= LIMIT) return Number(a) / Number(b);
  // scale into range keeping ~64 significant bits, then divide
  const q = (a * 2n ** 64n) / b;
  return Number(q) / 2 ** 64;
}

export function parseIntLiteral(text: string): bigint {
  const t = text.replace(/_/g, "").toLowerCase();
  if (t.startsWith("0x")) return BigInt(t);
  if (t.startsWith("0o")) return BigInt(`0o${t.slice(2)}`);
  if (t.startsWith("0b")) return BigInt(t);
  return BigInt(t);
}
