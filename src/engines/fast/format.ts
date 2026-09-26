/**
 * Python's format-spec mini-language (format(), f-strings, str.format) and
 * printf-style `%` formatting, for int, float and str.
 */
import { EXC, pyErr } from "./errors";
import { floatRepr, toExponentialExact, toFixedExact } from "./numbers";
import { isInt, type PyValue, str, toBig, typeName } from "./values";

interface Spec {
  fill: string;
  align: string | null;
  sign: string;
  alt: boolean;
  zero: boolean;
  width: number;
  grouping: string;
  precision: number | null;
  type: string;
}

const SPEC_RE = /^(?:(.)?([<>=^]))?([+\- ])?(z)?(#)?(0)?(\d+)?([,_])?(?:\.(\d+))?([bcdeEfFgGnosxX%])?$/s;

function parseSpec(spec: string, forType: string): Spec {
  const m = spec.match(SPEC_RE);
  if (!m) throw pyErr(EXC.ValueError, "Invalid format specifier");
  if (m[4]) throw pyErr(EXC.ValueError, "z option not supported in PyPlay fast engine");
  return {
    fill: m[1] ?? (m[6] && !m[2] ? "0" : " "),
    align: m[2] ?? (m[6] && !m[2] ? "=" : null),
    sign: m[3] ?? "-",
    alt: !!m[5],
    zero: !!m[6],
    width: m[7] ? Number(m[7]) : 0,
    grouping: m[8] ?? "",
    precision: m[9] !== undefined ? Number(m[9]) : null,
    type: m[10] ?? (forType === "str" ? "s" : ""),
  };
}

function group(intPart: string, sep: string, every = 3): string {
  if (!sep) return intPart;
  let out = "";
  for (let i = 0; i < intPart.length; i++) {
    if (i > 0 && (intPart.length - i) % every === 0) out += sep;
    out += intPart[i];
  }
  return out;
}

function pad(body: string, signStr: string, spec: Spec, defaultAlign: string): string {
  const align = spec.align ?? defaultAlign;
  const total = signStr.length + [...body].length;
  const n = Math.max(0, spec.width - total);
  const fill = spec.fill.repeat(n);
  switch (align) {
    case "<":
      return signStr + body + fill;
    case ">":
      return fill + signStr + body;
    case "=":
      return signStr + fill + body;
    default: {
      const left = spec.fill.repeat(Math.floor(n / 2));
      const right = spec.fill.repeat(n - Math.floor(n / 2));
      return left + signStr + body + right;
    }
  }
}

function signOf(neg: boolean, spec: Spec): string {
  if (neg) return "-";
  return spec.sign === "+" ? "+" : spec.sign === " " ? " " : "";
}

function formatInt(n: bigint, spec: Spec): string {
  if ("eEfFgG%".includes(spec.type) && spec.type !== "") return formatFloat(Number(n), spec);
  if (spec.precision !== null)
    throw pyErr(EXC.ValueError, "Precision not allowed in integer format specifier");
  const neg = n < 0n;
  const abs = neg ? -n : n;
  let body: string;
  let prefix = "";
  switch (spec.type) {
    case "":
    case "d":
    case "n":
      body = group(abs.toString(), spec.grouping);
      break;
    case "b":
      body = group(abs.toString(2), spec.grouping === "_" ? "_" : "", 4);
      prefix = spec.alt ? "0b" : "";
      break;
    case "o":
      body = group(abs.toString(8), spec.grouping === "_" ? "_" : "", 4);
      prefix = spec.alt ? "0o" : "";
      break;
    case "x":
    case "X":
      body = group(abs.toString(16), spec.grouping === "_" ? "_" : "", 4);
      if (spec.type === "X") body = body.toUpperCase();
      prefix = spec.alt ? (spec.type === "X" ? "0X" : "0x") : "";
      break;
    case "c":
      body = String.fromCodePoint(Number(n));
      return pad(body, "", spec, "<");
    default:
      throw pyErr(EXC.ValueError, `Unknown format code '${spec.type}' for object of type 'int'`);
  }
  return pad(body, signOf(neg, spec) + prefix, spec, ">");
}

function formatFloat(x: number, spec: Spec): string {
  const neg = x < 0 || Object.is(x, -0);
  const ax = Math.abs(x);
  let body: string;
  const p = spec.precision;
  if (!Number.isFinite(ax)) {
    body = Number.isNaN(ax) ? "nan" : "inf";
    if (spec.type && spec.type === spec.type.toUpperCase() && spec.type !== "%") body = body.toUpperCase();
    return pad(spec.type === "%" ? `${body}%` : body, signOf(neg && !Number.isNaN(x), spec), spec, ">");
  }
  switch (spec.type) {
    case "f":
    case "F":
      body = toFixedExact(ax, p ?? 6);
      break;
    case "e":
    case "E":
      body = toExponentialExact(ax, p ?? 6);
      if (spec.type === "E") body = body.toUpperCase();
      break;
    case "%":
      body = `${toFixedExact(ax * 100, p ?? 6)}%`;
      break;
    case "g":
    case "G":
    case "n":
      body = formatG(ax, p ?? 6, spec.alt, false);
      if (spec.type === "G") body = body.toUpperCase();
      break;
    case "":
      body = p === null ? floatRepr(ax) : formatG(ax, p, spec.alt, true);
      break;
    default:
      throw pyErr(EXC.ValueError, `Unknown format code '${spec.type}' for object of type 'float'`);
  }
  if (spec.grouping) {
    const m = body.match(/^(\d+)(.*)$/s);
    if (m) body = group(m[1] as string, spec.grouping) + m[2];
  }
  if (spec.alt && !body.includes(".") && /^\d+(e|%|$)/.test(body)) body = body.replace(/^(\d+)/, "$1.");
  return pad(body, signOf(neg, spec), spec, ">");
}

/** 'g' formatting; `noType` is the no-type-code variant used for floats. */
function formatG(x: number, precision: number, alt: boolean, noType: boolean): string {
  const p = precision === 0 ? 1 : precision;
  if (x === 0) return noType ? "0.0" : alt ? `0.${"0".repeat(p - 1)}` : "0";
  const exp = toExponentialExact(x, p - 1);
  const e10 = Number(exp.slice(exp.indexOf("e") + 1));
  let out: string;
  if (-4 <= e10 && e10 < p) {
    out = toFixedExact(x, p - 1 - e10);
    if (!alt) out = out.includes(".") ? out.replace(/\.?0+$/, "") : out;
    if (noType && !out.includes(".")) out += ".0";
  } else {
    let [m, e] = exp.split("e") as [string, string];
    if (!alt && m.includes(".")) m = m.replace(/\.?0+$/, "");
    out = `${m}e${e}`;
  }
  return out;
}

export function formatValue(v: PyValue, specText: string): string {
  if (isInt(v)) {
    const spec = parseSpec(specText, "int");
    if (spec.type === "s") throw pyErr(EXC.ValueError, "Unknown format code 's' for object of type 'int'");
    if (typeof v === "boolean" && specText === "") return v ? "True" : "False";
    return formatInt(toBig(v), spec);
  }
  if (typeof v === "number") {
    const spec = parseSpec(specText, "float");
    if ("sbcdoxX".includes(spec.type) && spec.type !== "")
      throw pyErr(EXC.ValueError, `Unknown format code '${spec.type}' for object of type 'float'`);
    return formatFloat(v, spec);
  }
  if (typeof v === "string") {
    const spec = parseSpec(specText, "str");
    if (spec.type !== "s")
      throw pyErr(EXC.ValueError, `Unknown format code '${spec.type}' for object of type 'str'`);
    if (spec.sign !== "-") throw pyErr(EXC.ValueError, "Sign not allowed in string format specifier");
    const body = spec.precision !== null ? [...v].slice(0, spec.precision).join("") : v;
    return pad(body, "", spec, "<");
  }
  if (specText === "") return str(v);
  throw pyErr(EXC.TypeError, `unsupported format string passed to ${typeName(v)}.__format__`);
}
