/**
 * CPython's `random` module, bit for bit: MT19937 seeded with
 * init_by_array like _randommodule.c, and the same derivation algorithms as
 * Lib/random.py, so seeded programs print the same numbers as real Python.
 */
import { EXC, pyErr, Unsupported } from "../errors";
import type { Interpreter } from "../interpreter";
import {
  type CallArgs,
  type Gen,
  isInt,
  isNumber,
  PyBuiltin,
  PyList,
  PyModule,
  PyRange,
  PyTuple,
  type PyValue,
  toBig,
  toFloat,
  typeName,
} from "../values";

class MersenneTwister {
  private readonly mt = new Uint32Array(624);
  private index = 625;

  private initGenrand(s: number): void {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) {
      const prev = (mt[i - 1] as number) ^ ((mt[i - 1] as number) >>> 30);
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.index = 624;
  }

  initByArray(key: number[]): void {
    const mt = this.mt;
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    const len = key.length;
    for (let k = Math.max(624, len); k > 0; k--) {
      const prev = (mt[i - 1] as number) ^ ((mt[i - 1] as number) >>> 30);
      mt[i] = (((mt[i] as number) ^ Math.imul(prev, 1664525)) + (key[j] as number) + j) >>> 0;
      i++;
      j++;
      if (i >= 624) {
        mt[0] = mt[623] as number;
        i = 1;
      }
      if (j >= len) j = 0;
    }
    for (let k = 623; k > 0; k--) {
      const prev = (mt[i - 1] as number) ^ ((mt[i - 1] as number) >>> 30);
      mt[i] = (((mt[i] as number) ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= 624) {
        mt[0] = mt[623] as number;
        i = 1;
      }
    }
    mt[0] = 0x80000000;
    this.index = 624;
  }

  uint32(): number {
    const mt = this.mt;
    if (this.index >= 624) {
      for (let k = 0; k < 624; k++) {
        const y = ((mt[k] as number) & 0x80000000) | ((mt[(k + 1) % 624] as number) & 0x7fffffff);
        mt[k] = (mt[(k + 397) % 624] as number) ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.index = 0;
    }
    let y = mt[this.index++] as number;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  random(): number {
    const a = this.uint32() >>> 5;
    const b = this.uint32() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }

  getrandbits(k: number): bigint {
    if (k <= 32) return BigInt(k === 0 ? 0 : this.uint32() >>> (32 - k));
    let result = 0n;
    let shift = 0n;
    for (let left = k; left > 0; left -= 32) {
      let r = this.uint32();
      if (left < 32) r >>>= 32 - left;
      result |= BigInt(r) << shift;
      shift += 32n;
    }
    return result;
  }

  randbelow(n: bigint): bigint {
    const k = n.toString(2).length;
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }

  seed(n: bigint): void {
    let v = n < 0n ? -n : n;
    const key: number[] = [];
    while (v > 0n) {
      key.push(Number(v & 0xffffffffn));
      v >>= 32n;
    }
    if (key.length === 0) key.push(0);
    this.initByArray(key);
  }

  seedFromEntropy(): void {
    const words = new Uint32Array(624);
    crypto.getRandomValues(words);
    this.initByArray([...words]);
  }
}

function index(v: PyValue): bigint {
  if (isInt(v)) return toBig(v);
  throw pyErr(EXC.TypeError, `'${typeName(v)}' object cannot be interpreted as an integer`);
}

export function createRandomModule(interp: Interpreter): PyModule {
  const mt = new MersenneTwister();
  mt.seedFromEntropy();
  const attrs = new Map<string, PyValue>();
  const def = (name: string, fn: (call: CallArgs) => PyValue | Gen<PyValue>) =>
    attrs.set(name, new PyBuiltin(name, fn));

  const seqItems = (v: PyValue): PyValue[] | PyRange => {
    if (v instanceof PyList || v instanceof PyTuple) return v.items;
    if (typeof v === "string") return [...v];
    if (v instanceof PyRange) return v;
    throw new Unsupported(`random 作用于 ${typeName(v)}`);
  };
  const lenOf = (s: PyValue[] | PyRange) => (s instanceof PyRange ? s.length : BigInt(s.length));
  const at = (s: PyValue[] | PyRange, i: bigint): PyValue =>
    s instanceof PyRange ? s.at(i) : (s[Number(i)] as PyValue);

  def("seed", (call) => {
    const a = call.args[0] ?? null;
    if (a === null) mt.seedFromEntropy();
    else if (isInt(a)) mt.seed(toBig(a));
    else throw new Unsupported(`random.seed(${typeName(a)})`);
    return null;
  });
  def("random", () => mt.random());
  def("uniform", (call) => {
    const a = toFloat(num(call.args[0] ?? null));
    const b = toFloat(num(call.args[1] ?? null));
    return a + (b - a) * mt.random();
  });
  def("getrandbits", (call) => {
    const k = Number(index(call.args[0] ?? null));
    if (k < 0) throw pyErr(EXC.ValueError, "number of bits must be non-negative");
    return mt.getrandbits(k);
  });
  def("randint", (call) => {
    if (call.args.length !== 2)
      throw pyErr(
        EXC.TypeError,
        `Random.randint() missing ${2 - call.args.length} required positional argument${call.args.length === 1 ? "" : "s"}: ${call.args.length === 1 ? "'b'" : "'a' and 'b'"}`,
      );
    const a = index(call.args[0] as PyValue);
    const b = index(call.args[1] as PyValue);
    if (b < a) throw pyErr(EXC.ValueError, `empty range in randint(${a}, ${b})`);
    return a + mt.randbelow(b - a + 1n);
  });
  def("randrange", (call) => {
    const [startV, stopV, stepV] = call.args;
    const start = index(startV ?? null);
    if (stopV === undefined || stopV === null) {
      if (stepV !== undefined) throw pyErr(EXC.TypeError, "Missing a non-None stop argument");
      if (start > 0n) return mt.randbelow(start);
      throw pyErr(EXC.ValueError, "empty range for randrange()");
    }
    const stop = index(stopV);
    const width = stop - start;
    const step = stepV === undefined ? 1n : index(stepV);
    if (step === 1n) {
      if (width > 0n) return start + mt.randbelow(width);
      throw pyErr(EXC.ValueError, `empty range in randrange(${start}, ${stop})`);
    }
    let n: bigint;
    if (step > 0n) n = floorDiv(width + step - 1n, step);
    else if (step < 0n) n = floorDiv(width + step + 1n, step);
    else throw pyErr(EXC.ValueError, "zero step for randrange()");
    if (n <= 0n) throw pyErr(EXC.ValueError, `empty range in randrange(${start}, ${stop}, ${step})`);
    return start + step * mt.randbelow(n);
  });
  def("choice", (call) => {
    const s = seqItems(call.args[0] ?? null);
    const n = lenOf(s);
    if (n === 0n) throw pyErr(EXC.IndexError, "Cannot choose from an empty sequence");
    return at(s, mt.randbelow(n));
  });
  def("shuffle", (call) => {
    const l = call.args[0];
    if (!(l instanceof PyList)) throw new Unsupported("random.shuffle(非列表)");
    const x = l.items;
    for (let i = x.length - 1; i > 0; i--) {
      const j = Number(mt.randbelow(BigInt(i + 1)));
      [x[i], x[j]] = [x[j] as PyValue, x[i] as PyValue];
    }
    return null;
  });
  def("sample", (call) => {
    if (call.kwargs.size) throw new Unsupported("random.sample(counts=...)");
    const pop = seqItems(call.args[0] ?? null);
    const k = Number(index(call.args[1] ?? null));
    const n = Number(lenOf(pop));
    if (k < 0 || k > n) throw pyErr(EXC.ValueError, "Sample larger than population or is negative");
    const result: PyValue[] = new Array(k).fill(null);
    let setsize = 21;
    if (k > 5) setsize += 4 ** Math.ceil(Math.log(k * 3) / Math.log(4));
    if (n <= setsize) {
      const pool: PyValue[] = [];
      for (let i = 0; i < n; i++) pool.push(at(pop, BigInt(i)));
      for (let i = 0; i < k; i++) {
        const j = Number(mt.randbelow(BigInt(n - i)));
        result[i] = pool[j] as PyValue;
        pool[j] = pool[n - i - 1] as PyValue;
      }
    } else {
      const selected = new Set<number>();
      for (let i = 0; i < k; i++) {
        let j = Number(mt.randbelow(BigInt(n)));
        while (selected.has(j)) j = Number(mt.randbelow(BigInt(n)));
        selected.add(j);
        result[i] = at(pop, BigInt(j));
      }
    }
    return new PyList(result);
  });
  void interp;
  return new PyModule("random", attrs);
}

function num(v: PyValue): bigint | boolean | number {
  if (isNumber(v)) return v;
  throw pyErr(EXC.TypeError, `unsupported operand type(s) for -: '${typeName(v)}' and '${typeName(v)}'`);
}

function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}
