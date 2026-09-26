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
  private readonly mainCtx: CanvasRenderingContext2D;
  /** Target of the current paint (the main canvas or a thumbnail). */
  private ctx: CanvasRenderingContext2D;
  private originX = 0;
  private originY = 0;
  private halfW = 0;
  private halfH = 0;
  private drawnVersion = -1;
  private scale = 1;
  private raf = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  private readonly resizeObserver: ResizeObserver;
  onEvent: ((ev: HostEvent) => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly scene: Scene,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("renderer: 2D canvas context unavailable");
    this.mainCtx = ctx;
    this.ctx = ctx;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
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
    this.resizeObserver.disconnect();
  }

  /** Force a redraw on the next frame (e.g. after a theme change). */
  invalidate(): void {
    this.drawnVersion = -1;
  }

  toPngBlob(): Promise<Blob | null> {
    this.draw();
    return new Promise((resolve) => this.canvas.toBlob(resolve, "image/png"));
  }

  /**
   * Small PNG of the drawing, zoomed to what was actually drawn (project list
   * thumbnails). Null when nothing visible was drawn.
   */
  toThumbnail(width: number, height: number): Promise<Blob | null> {
    const box = this.drawingBounds();
    if (!box) return Promise.resolve(null);
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    const pad = 16;
    const scale = Math.min(
      3,
      (width - pad * 2) / Math.max(1, box.w),
      (height - pad * 2) / Math.max(1, box.h),
    );
    this.paint(ctx, width, height, scale, box.cx, box.cy, 1);
    this.invalidate();
    return new Promise((resolve) => c.toBlob(resolve, "image/png"));
  }

  /** Bounding box (canvas coordinates) of visible items, including line widths. */
  private drawingBounds(): { cx: number; cy: number; w: number; h: number } | null {
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const it of this.scene.drawOrder()) {
      const visible =
        it.kind === "text" ||
        (it.kind === "line" && !!it.opts.fill) ||
        (it.kind === "polygon" && (!!it.opts.fill || !!it.opts.outline));
      if (!visible || it.coords.length < 2) continue;
      if (it.kind === "polygon" && it.coords.every((v) => v === 0)) continue; // hidden turtle
      const r = Number(it.opts.width ?? 1) / 2 + (it.kind === "text" ? 20 : 0);
      for (let i = 0; i + 1 < it.coords.length; i += 2) {
        const x = it.coords[i] as number;
        const y = it.coords[i + 1] as number;
        x0 = Math.min(x0, x - r);
        y0 = Math.min(y0, y - r);
        x1 = Math.max(x1, x + r);
        y1 = Math.max(y1, y + r);
      }
    }
    if (!Number.isFinite(x0)) return null;
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
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
    return [(x - this.originX) * this.scale + this.halfW, (y - this.originY) * this.scale + this.halfH];
  }

  private toCanvas(px: number, py: number): [number, number] {
    return [(px - this.cssWidth / 2) / this.scale, (py - this.cssHeight / 2) / this.scale];
  }

  draw(): void {
    const dpr = this.canvas.width / this.cssWidth;
    const scale = Math.min(
      this.cssWidth / this.scene.window.width,
      this.cssHeight / this.scene.window.height,
    );
    this.paint(this.mainCtx, this.cssWidth, this.cssHeight, scale, 0, 0, dpr);
    this.drawnVersion = this.scene.version;
  }

  /** Paint the scene into `ctx` (width × height CSS px), centred on canvas point (originX, originY). */
  private paint(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scale: number,
    originX: number,
    originY: number,
    dpr: number,
  ): void {
    this.ctx = ctx;
    this.scale = scale;
    this.originX = originX;
    this.originY = originY;
    this.halfW = width / 2;
    this.halfH = height / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = tkColorToCss(this.scene.background) ?? "white";
    ctx.fillRect(0, 0, width, height);
    for (const item of this.scene.drawOrder()) this.drawItem(item);
    this.ctx = this.mainCtx;
    // keep the main view's mapping for pointer events
    this.scale = Math.min(this.cssWidth / this.scene.window.width, this.cssHeight / this.scene.window.height);
    this.originX = 0;
    this.originY = 0;
    this.halfW = this.cssWidth / 2;
    this.halfH = this.cssHeight / 2;
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
