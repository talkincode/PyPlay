/**
 * Deterministic text size used where no browser font engine exists (the
 * conformance suite, and workers without OffscreenCanvas). Must match
 * measure_text() in tools/reference_run.py.
 */
export function approximateTextSize(text: string, font: ReadonlyArray<string | number>): [number, number] {
  const size = Math.abs(Math.trunc(Number(font[1] ?? 8)));
  return [pyRound(text.length * size * 0.6), pyRound(size * 1.25)];
}

/** Python's round(): half to even. */
function pyRound(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
