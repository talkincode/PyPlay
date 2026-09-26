/**
 * TypeScript twin of python/tkinter's Canvas mirror: the same item store,
 * the same "only emit real changes" rule, the same hit testing. Keeping the
 * two identical is what makes both engines produce identical scenes.
 */
import type { CanvasCommand, ItemKind, ItemOptions } from "../../../protocol";

interface Item {
  kind: ItemKind;
  coords: number[];
  opts: Record<string, unknown>;
}

export type Binding = (ev: { x: number; y: number; keysym: string; char: string; num: number }) => unknown;

export class TkCanvas {
  private readonly items = new Map<number, Item>();
  private order: number[] = [];
  private nextId = 1;
  readonly bindings = new Map<string, Binding>();
  readonly tagBindings = new Map<number, Map<string, Binding>>();

  constructor(private readonly emit: (cmd: CanvasCommand) => void) {}

  create(kind: ItemKind, coords: number[], opts: Record<string, unknown>): number {
    const id = this.nextId++;
    this.items.set(id, { kind, coords: [...coords], opts: { ...opts } });
    this.order.push(id);
    this.emit({ op: "create", id, kind, coords: [...coords], opts: { ...opts } as ItemOptions });
    return id;
  }

  getCoords(id: number): number[] {
    return [...this.require(id).coords];
  }

  setCoords(id: number, coords: number[]): void {
    const it = this.require(id);
    if (coords.length === it.coords.length && coords.every((c, i) => c === it.coords[i])) return;
    it.coords = [...coords];
    this.emit({ op: "coords", id, coords: [...coords] });
  }

  configure(id: number, opts: Record<string, unknown>): void {
    const it = this.require(id);
    const changed: Record<string, unknown> = {};
    let any = false;
    for (const [k, v] of Object.entries(opts)) {
      if (!(k in it.opts) || !sameValue(it.opts[k], v)) {
        changed[k] = v;
        it.opts[k] = v;
        any = true;
      }
    }
    if (any) this.emit({ op: "config", id, opts: { ...changed } as ItemOptions });
  }

  type(id: number): ItemKind {
    return this.require(id).kind;
  }

  raise(id: number): void {
    this.require(id);
    if (this.order[this.order.length - 1] === id) return;
    this.order = this.order.filter((x) => x !== id);
    this.order.push(id);
    this.emit({ op: "raise", id });
  }

  lower(id: number): void {
    this.require(id);
    this.order = this.order.filter((x) => x !== id);
    this.order.unshift(id);
    this.emit({ op: "lower", id });
  }

  delete(id: number | "all"): void {
    if (id === "all") {
      this.items.clear();
      this.order = [];
      this.tagBindings.clear();
      this.emit({ op: "delete", id: "all" });
      return;
    }
    if (!this.items.has(id)) return;
    this.items.delete(id);
    this.order = this.order.filter((x) => x !== id);
    this.tagBindings.delete(id);
    this.emit({ op: "delete", id });
  }

  textBBox(
    id: number,
    measure: (text: string, font: Array<string | number>) => [number, number],
  ): [number, number, number, number] {
    const it = this.require(id);
    const x = it.coords[0] as number;
    const y = it.coords[1] as number;
    const font = (it.opts.font as Array<string | number>) ?? ["Arial", 8, "normal"];
    const [w, h] = measure(String(it.opts.text ?? ""), font);
    const anchor = String(it.opts.anchor ?? "center");
    const x0 = ["sw", "nw", "w"].includes(anchor)
      ? x
      : ["se", "ne", "e"].includes(anchor)
        ? x - w
        : x - w / 2;
    const y0 = ["sw", "s", "se"].includes(anchor)
      ? y - h
      : ["nw", "n", "ne"].includes(anchor)
        ? y
        : y - h / 2;
    return [Math.trunc(x0), Math.trunc(y0), Math.trunc(x0 + w), Math.trunc(y0 + h)];
  }

  /** Topmost polygon under (x, y) that has tag bindings. */
  hit(x: number, y: number): number | null {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const id = this.order[i] as number;
      if (!this.tagBindings.has(id)) continue;
      const it = this.items.get(id) as Item;
      if (it.kind === "polygon" && pointInPolygon(x, y, it.coords)) return id;
    }
    return null;
  }

  hasBindings(): boolean {
    if (this.bindings.size) return true;
    for (const m of this.tagBindings.values()) if (m.size) return true;
    return false;
  }

  private require(id: number): Item {
    const it = this.items.get(id);
    if (!it) throw new Error(`tkcanvas: invalid canvas item ${id}`);
    return it;
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i]);
  return a === b;
}

function pointInPolygon(x: number, y: number, c: number[]): boolean {
  let inside = false;
  const n = c.length / 2;
  for (let i = 0; i < n; i++) {
    const x1 = c[2 * i] as number;
    const y1 = c[2 * i + 1] as number;
    const x2 = c[(2 * ((i + 1) % n)) as number] as number;
    const y2 = c[(2 * ((i + 1) % n) + 1) as number] as number;
    if (y1 > y !== y2 > y) {
      const xi = x1 + ((y - y1) * (x2 - x1)) / (y2 - y1);
      if (x < xi) inside = !inside;
    }
  }
  return inside;
}
