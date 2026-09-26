/**
 * Tk font tuples ("Arial", 16, "bold italic") → CSS font strings.
 * Positive Tk sizes are points; the browser works in CSS px (96 dpi).
 */
export const PX_PER_POINT = 96 / 72;

export function tkFontToCss(font: ReadonlyArray<string | number> | undefined, scale = 1): string {
  const family = String(font?.[0] ?? "Arial");
  const rawSize = Number(font?.[1] ?? 8);
  // negative sizes are pixels in Tk
  const px = (rawSize < 0 ? -rawSize : rawSize * PX_PER_POINT) * scale;
  const style = font
    ?.slice(2)
    .map(String)
    .join(" ")
    .split(/\s+/)
    .filter((w) => w && w !== "normal" && w !== "roman");
  const weight = style?.includes("bold") ? "bold " : "";
  const italic = style?.includes("italic") ? "italic " : "";
  return `${italic}${weight}${px.toFixed(2)}px "${family}", sans-serif`;
}
