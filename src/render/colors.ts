import tkColors from "../../python/tkinter/tk_colors.json";

/**
 * Tk color spec → CSS color. Tk accepts ~1000 X11-style names (with its own
 * spacing/case rules) plus #rgb, #rrggbb, #rrrgggbbb and #rrrrggggbbbb.
 * python/tkinter/tk_colors.json (generated from Tk's xcolors.c) is the single
 * source of truth for names, shared with the Python side.
 */
const NAMES = tkColors as unknown as Record<string, [number, number, number]>;

export function tkColorToCss(spec: string | undefined | null): string | null {
  if (!spec) return null;
  if (spec[0] === "#") {
    const hex = spec.slice(1);
    if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
    const n = hex.length;
    if (n === 3 || n === 6) return `#${hex}`;
    if (n === 9 || n === 12) {
      const w = n / 3;
      const parts = [0, 1, 2].map((i) => hex.slice(i * w, i * w + 2));
      return `#${parts.join("")}`;
    }
    return null;
  }
  const rgb = NAMES[spec.toLowerCase()];
  return rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : null;
}

export function isTkColor(spec: string): boolean {
  return tkColorToCss(spec) !== null;
}
