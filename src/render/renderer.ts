import type { HostEvent } from "../protocol";
import { tkColorToCss } from "./colors";
import { tkFontToCss } from "./fonts";
import type { Scene, SceneItem } from "./scene";

/**
 * Draws a Scene onto a <canvas> and turns pointer/keyboard input into
 * HostEvents in Tk canvas coordinates.
 *
 * Layout rule: the turtle window (scene.window) is scaled to fit the panel
 * and centred; canvas coordinate (0, 0) is the centre of the panel.
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private drawnVersion = -1;
  private scale = 1;
  private raf = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  onEvent: ((ev: HostEvent) => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly scene: Scene,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("renderer: 2D canvas context unavailable");
    this.ctx = ctx;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    this.bindInput();
    const loop = () => {
      if (this.scene.version !== this.drawnVersion) this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
  }

  /** Force a redraw on the next frame (e.g. after a theme change). */
  invalidate(): void {
    this.drawnVersion = -1;
  }

  toPngBlob(): Promise<Blob | null> {
    this.draw();
    return new Promise((resolve) => this.canvas.toBlob(resolve, "image/png"));
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cssWidth = Math.max(1, rect.width);
    this.cssHeight = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.cssWidth * dpr);
    this.canvas.height = Math.round(this.cssHeight * dpr);
    this.invalidate();
  }

  private toPixel(x: number, y: number): [number, number] {
    return [x * this.scale + this.cssWidth / 2, y * this.scale + this.cssHeight / 2];
  }

  private toCanvas(px: number, py: number): [number, number] {
    return [(px - this.cssWidth / 2) / this.scale, (py - this.cssHeight / 2) / this.scale];
  }

  draw(): void {
    const { ctx, scene } = this;
    const dpr = this.canvas.width / this.cssWidth;
    this.scale = Math.min(this.cssWidth / scene.window.width, this.cssHeight / scene.window.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = tkColorToCss(scene.background) ?? "white";
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
    for (const item of scene.drawOrder()) this.drawItem(item);
    this.drawnVersion = scene.version;
  }

  private drawItem(it: SceneItem): void {
    switch (it.kind) {
      case "line":
        this.drawLine(it);
        return;
      case "polygon":
        this.drawPolygon(it);
        return;
      case "text":
        this.drawText(it);
        return;
      case "image":
        return; // only blank images exist in PyPlay
    }
  }

  private path(coords: number[], close: boolean): void {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i + 1 < coords.length; i += 2) {
      const [px, py] = this.toPixel(coords[i] as number, coords[i + 1] as number);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    if (close) ctx.closePath();
  }

  private drawLine(it: SceneItem): void {
    const color = tkColorToCss(it.opts.fill);
    if (!color || it.coords.length < 4) return;
    const { ctx } = this;
    const width = Math.max(1, Number(it.opts.width ?? 1)) * this.scale;
    const round = (it.opts.capstyle ?? "butt") === "round";
    const c = it.coords;
    const allSame = c.every((v, i) => v === c[i % 2]);
    if (allSame) {
      // turtle.dot() draws a zero-length round-capped line
      if (!round) return;
      const [px, py] = this.toPixel(c[0] as number, c[1] as number);
      ctx.beginPath();
      ctx.arc(px, py, width / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      return;
    }
    this.path(c, false);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = round ? "round" : "butt";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  private drawPolygon(it: SceneItem): void {
    if (it.coords.length < 6) return;
    const { ctx } = this;
    const fill = tkColorToCss(it.opts.fill);
    const outline = tkColorToCss(it.opts.outline);
    this.path(it.coords, true);
    if (fill) {
      ctx.fillStyle = fill;
      // Tk fills polygons with the even-odd rule
      ctx.fill("evenodd");
    }
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = Math.max(1, Number(it.opts.width ?? 1)) * this.scale;
      ctx.lineJoin = "miter";
      ctx.stroke();
    }
  }

  private drawText(it: SceneItem): void {
    const { ctx } = this;
    const color = tkColorToCss(it.opts.fill ?? "black");
    if (!color) return;
    const [px, py] = this.toPixel(it.coords[0] ?? 0, it.coords[1] ?? 0);
    ctx.font = tkFontToCss(it.opts.font, this.scale);
    ctx.fillStyle = color;
    const anchor = it.opts.anchor ?? "center";
    ctx.textAlign = anchor.includes("w") ? "left" : anchor.includes("e") ? "right" : "center";
    ctx.textBaseline = anchor.startsWith("s") ? "bottom" : anchor.startsWith("n") ? "top" : "middle";
    const lines = String(it.opts.text ?? "").split("\n");
    const metrics = ctx.measureText("Mg");
    const lineHeight = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
    const startY = ctx.textBaseline === "bottom" ? py - (lines.length - 1) * lineHeight : py;
    for (const [i, line] of lines.entries()) ctx.fillText(line, px, startY + i * lineHeight);
  }

  private bindInput(): void {
    const c = this.canvas;
    c.tabIndex = 0;
    const pos = (e: PointerEvent): [number, number] => {
      const rect = c.getBoundingClientRect();
      return this.toCanvas(e.clientX - rect.left, e.clientY - rect.top);
    };
    let buttonsDown = 0;
    c.addEventListener("pointerdown", (e) => {
      c.focus();
      const [x, y] = pos(e);
      buttonsDown = e.button + 1;
      this.onEvent?.({ type: "button", press: true, num: e.button + 1, x, y });
    });
    c.addEventListener("pointerup", (e) => {
      const [x, y] = pos(e);
      buttonsDown = 0;
      this.onEvent?.({ type: "button", press: false, num: e.button + 1, x, y });
    });
    c.addEventListener("pointermove", (e) => {
      if (!buttonsDown) return;
      const [x, y] = pos(e);
      this.onEvent?.({ type: "motion", num: buttonsDown, x, y });
    });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
  }
}

/** Browser KeyboardEvent.key → Tk keysym. */
const KEYSYMS: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  " ": "space",
  Enter: "Return",
  Escape: "Escape",
  Backspace: "BackSpace",
  Tab: "Tab",
  Delete: "Delete",
  Shift: "Shift_L",
  Control: "Control_L",
  Alt: "Alt_L",
  Meta: "Meta_L",
  CapsLock: "Caps_Lock",
  Home: "Home",
  End: "End",
  PageUp: "Prior",
  PageDown: "Next",
  ",": "comma",
  ".": "period",
  "/": "slash",
  ";": "semicolon",
  "'": "apostrophe",
  "[": "bracketleft",
  "]": "bracketright",
  "-": "minus",
  "=": "equal",
  "+": "plus",
  "*": "asterisk",
  "!": "exclam",
  "?": "question",
};

export function keyEvent(e: KeyboardEvent, press: boolean): HostEvent | null {
  const keysym = KEYSYMS[e.key] ?? (e.key.length === 1 ? e.key : /^F\d+$/.test(e.key) ? e.key : null);
  if (!keysym) return null;
  return { type: "key", press, keysym, char: e.key.length === 1 ? e.key : "" };
}
