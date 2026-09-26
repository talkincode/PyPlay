/** `time` module: sleep suspends the program; clocks read the browser's. */
import { EXC, pyErr } from "../errors";
import {
  type CallArgs,
  type Gen,
  isNumber,
  PyBuiltin,
  PyModule,
  type PyValue,
  toFloat,
  typeName,
} from "../values";

export function createTimeModule(): PyModule {
  const attrs = new Map<string, PyValue>();
  const def = (name: string, fn: (call: CallArgs) => PyValue | Gen<PyValue>) =>
    attrs.set(name, new PyBuiltin(name, fn));
  def("sleep", function* (call): Gen<PyValue> {
    const v = call.args[0];
    if (v === undefined || !isNumber(v))
      throw pyErr(EXC.TypeError, `'${typeName(v ?? null)}' object cannot be interpreted as an integer`);
    const s = toFloat(v);
    if (s < 0) throw pyErr(EXC.ValueError, "sleep length must be non-negative");
    yield { kind: "sleep", ms: s * 1000 };
    return null;
  });
  def("time", () => Date.now() / 1000);
  def("monotonic", () => performance.now() / 1000);
  def("perf_counter", () => performance.now() / 1000);
  return new PyModule("time", attrs);
}
