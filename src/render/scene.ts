import type { CanvasCommand, ItemKind, ItemOptions } from "../protocol";

export interface SceneItem {
  id: number;
  kind: ItemKind;
  coords: number[];
  opts: ItemOptions;
}

/** Default turtle window before the program calls setup(). */
export const DEFAULT_WINDOW = { width: 640, height: 600 };

/**
 * Retained model of the turtle canvas, built only by applying protocol
 * commands. The renderer draws it; tests compare snapshots of it.
 */
export class Scene {
  readonly items = new Map<number, SceneItem>();
  /** z-order, bottom first */
  order: number[] = [];
  background = "white";
  window = { ...DEFAULT_WINDOW };
  title = "";
  /** bumped on every change so the renderer knows when to redraw */
  version = 0;

  apply(cmd: CanvasCommand): void {
    this.version++;
    switch (cmd.op) {
      case "create":
        this.items.set(cmd.id, {
          id: cmd.id,
          kind: cmd.kind,
          coords: [...cmd.coords],
          opts: { ...cmd.opts },
        });
        this.order.push(cmd.id);
        return;
      case "coords":
        this.require(cmd.id).coords = [...cmd.coords];
        return;
      case "config":
        Object.assign(this.require(cmd.id).opts, cmd.opts);
        return;
      case "raise":
        this.require(cmd.id);
        this.order = this.order.filter((id) => id !== cmd.id);
        this.order.push(cmd.id);
        return;
      case "lower":
        this.require(cmd.id);
        this.order = this.order.filter((id) => id !== cmd.id);
        this.order.unshift(cmd.id);
        return;
      case "delete":
        if (cmd.id === "all") {
          this.items.clear();
          this.order = [];
        } else if (this.items.delete(cmd.id)) {
          this.order = this.order.filter((id) => id !== cmd.id);
        }
        return;
      case "bg":
        this.background = cmd.color;
        return;
      case "window":
        this.window = { width: cmd.width, height: cmd.height };
        return;
      case "title":
        this.title = cmd.text;
        return;
      case "scrollregion":
        // The renderer always centres the canvas origin; nothing to store.
        return;
    }
  }

  applyAll(cmds: readonly CanvasCommand[]): void {
    for (const c of cmds) this.apply(c);
  }

  reset(): void {
    this.items.clear();
    this.order = [];
    this.background = "white";
    this.window = { ...DEFAULT_WINDOW };
    this.title = "";
    this.version++;
  }

  /** Items in z-order (bottom first). */
  *drawOrder(): Iterable<SceneItem> {
    for (const id of this.order) {
      const it = this.items.get(id);
      if (it) yield it;
    }
  }

  private require(id: number): SceneItem {
    const it = this.items.get(id);
    if (!it) throw new Error(`scene: unknown canvas item ${id}`);
    return it;
  }
}

/**
 * Canonical, comparable description of what is visible. Used by the
 * conformance suite: two engines agree when their snapshots are equal.
 * Invisible items (no fill and no outline, blank images) are dropped and
 * numbers are rounded so float noise does not count as a difference.
 */
export interface SnapshotItem {
  kind: ItemKind;
  coords: number[];
  fill: string;
  outline: string;
  width: number;
  text?: string;
  font?: string;
  anchor?: string;
}

export function snapshot(scene: Scene, digits = 6): { background: string; items: SnapshotItem[] } {
  const r = (n: number) => {
    const v = Number(n.toFixed(digits));
    return Object.is(v, -0) ? 0 : v;
  };
  const items: SnapshotItem[] = [];
  for (const it of scene.drawOrder()) {
    const fill = String(it.opts.fill ?? (it.kind === "text" ? "black" : ""));
    const outline = String(it.opts.outline ?? "");
    if (it.kind === "image") continue;
    if (it.kind === "line" && fill === "") continue;
    if (it.kind === "polygon" && fill === "" && outline === "") continue;
    const s: SnapshotItem = {
      kind: it.kind,
      coords: it.coords.map(r),
      fill,
      outline,
      width: r(Number(it.opts.width ?? 1)),
    };
    if (it.kind === "text") {
      s.text = String(it.opts.text ?? "");
      s.font = JSON.stringify(it.opts.font ?? []);
      s.anchor = String(it.opts.anchor ?? "center");
    }
    items.push(s);
  }
  return { background: scene.background, items };
}
