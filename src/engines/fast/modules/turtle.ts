/**
 * A faithful TypeScript port of CPython's turtle.py (3.14), for the fast
 * engine. Method bodies follow turtle.py line by line — same state, same
 * order of canvas operations, same animation stepping — so the resulting
 * canvas matches what the full-Python engine (which runs the real
 * turtle.py) draws. tests/conformance compares the two.
 *
 * Deliberately not ported (they switch the program to full Python):
 * undo, clone, polygons recording, tilt/shear/shapetransform, image shapes,
 * world coordinates, bgpic, save.
 */
import type { CanvasCommand } from "../../../protocol";
import { tkColorToCss } from "../../../render/colors";
import { EXC, PyException, pyErr, Unsupported } from "../errors";
import { type Interpreter, PyFunction } from "../interpreter";
import { modFloat, roundFloat, roundHalfEvenToBigInt } from "../numbers";
import {
  type CallArgs,
  type Gen,
  isInt,
  isNumber,
  PyBuiltin,
  PyExcClass,
  PyList,
  PyModule,
  PyNative,
  PyTuple,
  type PyValue,
  PyVec2D,
  repr,
  str,
  toBig,
  toFloat,
  truthy,
  typeName,
} from "../values";
import { type Binding, TkCanvas } from "./tkcanvas";

export interface TurtleHost {
  emit(cmd: CanvasCommand): void;
  measureText(text: string, font: Array<string | number>): [number, number];
  /** Monotonic clock in ms (virtual in tests). */
  now(): number;
}

/** A Python number kept with its int/float identity (positions can be ints). */
type N = bigint | number;
type V = [N, N];

const f = (n: N): number => (typeof n === "bigint" ? Number(n) : n);
const add = (a: N, b: N): N => (typeof a === "bigint" && typeof b === "bigint" ? a + b : f(a) + f(b));
const sub = (a: N, b: N): N => (typeof a === "bigint" && typeof b === "bigint" ? a - b : f(a) - f(b));
const mul = (a: N, b: N): N => (typeof a === "bigint" && typeof b === "bigint" ? a * b : f(a) * f(b));
const vadd = (a: V, b: V): V => [add(a[0], b[0]), add(a[1], b[1])];
const vsub = (a: V, b: V): V => [sub(a[0], b[0]), sub(a[1], b[1])];
const vmul = (a: V, k: N): V => [mul(a[0], k), mul(a[1], k)];
const vabs = (a: V): number => Math.hypot(f(a[0]), f(a[1]));
function vrotate(v: V, angle: number): V {
  const perp: [number, number] = [-f(v[1]), f(v[0])];
  const rad = angle * (Math.PI / 180);
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [f(v[0]) * c + perp[0] * s, f(v[1]) * c + perp[1] * s];
}

const CFG = {
  width: 0.5,
  height: 0.75,
  canvwidth: 400,
  canvheight: 300,
  mode: "standard",
  colormode: 1.0,
  delay: 10,
  shape: "classic",
  pencolor: "black",
  fillcolor: "black",
  resizemode: "noresize",
  visible: true,
  title: "Python Turtle Graphics",
  screen: [1280, 800] as const,
};

type Poly = Array<[number, number]>;
interface Shape {
  type: "polygon" | "image";
  data: Poly | null;
}

const SHAPES: Record<string, Poly> = {
  arrow: [
    [-10, 0],
    [10, 0],
    [0, 10],
  ],
  turtle: [
    [0, 16],
    [-2, 14],
    [-1, 10],
    [-4, 7],
    [-7, 9],
    [-9, 8],
    [-6, 5],
    [-7, 1],
    [-5, -3],
    [-8, -6],
    [-6, -8],
    [-4, -5],
    [0, -7],
    [4, -5],
    [6, -8],
    [8, -6],
    [5, -3],
    [7, 1],
    [6, 5],
    [9, 8],
    [7, 9],
    [4, 7],
    [1, 10],
    [2, 14],
  ],
  circle: [
    [10, 0],
    [9.51, 3.09],
    [8.09, 5.88],
    [5.88, 8.09],
    [3.09, 9.51],
    [0, 10],
    [-3.09, 9.51],
    [-5.88, 8.09],
    [-8.09, 5.88],
    [-9.51, 3.09],
    [-10, 0],
    [-9.51, -3.09],
    [-8.09, -5.88],
    [-5.88, -8.09],
    [-3.09, -9.51],
    [-0.0, -10.0],
    [3.09, -9.51],
    [5.88, -8.09],
    [8.09, -5.88],
    [9.51, -3.09],
  ],
  square: [
    [10, -10],
    [10, 10],
    [-10, 10],
    [-10, -10],
  ],
  triangle: [
    [10, -5.77],
    [0, 11.55],
    [-10, -5.77],
  ],
  classic: [
    [0, 0],
    [-5, -9],
    [0, -7],
    [5, -9],
  ],
};

function tgError(msg: string): PyException {
  return new PyException(EXC.TurtleGraphicsError, msg);
}

// =================================================================== screen

class Screen {
  readonly cv: TkCanvas;
  canvwidth = CFG.canvwidth;
  canvheight = CFG.canvheight;
  readonly xscale = 1.0;
  readonly yscale = 1.0;
  winWidth = 0;
  winHeight = 0;
  shapes = new Map<string, Shape>();
  mode_ = CFG.mode;
  delayvalue = CFG.delay;
  colormode_: N = CFG.colormode;
  keys: string[] = [];
  tracing = 1;
  updatecounter = 0;
  turtles: Turtle[] = [];
  bgpicItem = 0;
  bg = "white";
  running = true;
  destroyed = false;
  timers: Array<{ due: number; seq: number; fn: PyValue }> = [];
  timerSeq = 0;
  native: PyNative | null = null;

  constructor(readonly env: TurtleEnv) {
    const emit = env.host.emit;
    // _Root(): title; ScrolledCanvas: Canvas(bg=white), reset() → scrollregion
    emit({ op: "title", text: env.title });
    this.cv = new TkCanvas(emit);
    emit({ op: "bg", color: "white" });
    emit({
      op: "scrollregion",
      region: [-this.canvwidth / 2, -this.canvheight / 2, this.canvwidth / 2, this.canvheight / 2].map(
        Math.floor,
      ),
    });
    for (const [name, data] of Object.entries(SHAPES)) this.shapes.set(name, { type: "polygon", data });
    this.shapes.set("blank", { type: "image", data: null });
  }

  /** TurtleScreen.__init__ tail + _Screen.__init__ (clear, setup). */
  *init(): Gen<void> {
    yield* this.clear();
    yield* this.setup(CFG.width, CFG.height);
  }

  // ---- TurtleScreenBase
  createpoly(): number {
    return this.cv.create("polygon", [0, 0, 0, 0, 0, 0], { fill: "", outline: "" });
  }
  drawpoly(
    item: number,
    coords: Array<[N, N]>,
    fill?: string,
    outline?: string,
    width?: N,
    top = false,
  ): void {
    const cl: number[] = [];
    for (const [x, y] of coords) cl.push(f(x) * this.xscale, -f(y) * this.yscale);
    this.cv.setCoords(item, cl);
    if (fill !== undefined) this.cv.configure(item, { fill });
    if (outline !== undefined) this.cv.configure(item, { outline });
    if (width !== undefined) this.cv.configure(item, { width: f(width) });
    if (top) this.cv.raise(item);
  }
  createline(): number {
    return this.cv.create("line", [0, 0, 0, 0], { fill: "", width: 2, capstyle: "round" });
  }
  drawline(item: number, coords?: Array<[N, N]>, fill?: string, width?: N, top = false): void {
    if (coords !== undefined) {
      const cl: number[] = [];
      for (const [x, y] of coords) cl.push(f(x) * this.xscale, -f(y) * this.yscale);
      this.cv.setCoords(item, cl);
    }
    if (fill !== undefined) this.cv.configure(item, { fill });
    if (width !== undefined) this.cv.configure(item, { width: f(width) });
    if (top) this.cv.raise(item);
  }
  *update_(): Gen<void> {
    yield* this.env.pump();
  }
  *delay_(ms: number): Gen<void> {
    yield { kind: "sleep", ms };
  }
  iscolorstring(color: string): boolean {
    return tkColorToCss(color) !== null;
  }
  *bgcolor_(color: string | null): Gen<string | null> {
    if (color !== null) {
      if (!this.iscolorstring(color)) throw pyErr(EXC.TypeError, `unknown color name "${color}"`);
      this.bg = color;
      this.env.host.emit({ op: "bg", color });
      yield* this.update_();
      return null;
    }
    return this.bg;
  }
  write_(
    pos: V,
    txt: string,
    align: string,
    font: Array<string | number>,
    pencolor: string,
  ): [number, number] {
    const x = f(pos[0]) * this.xscale;
    const y = f(pos[1]) * this.yscale;
    const anchor: Record<string, string> = { left: "sw", center: "s", right: "se" };
    const a = anchor[align];
    if (a === undefined) throw new PyException(EXC.KeyError, repr(align), [align]);
    const item = this.cv.create("text", [x - 1, -y], { text: txt, anchor: a, fill: pencolor, font });
    const [, , x1] = this.cv.textBBox(item, (t, fo) => this.env.host.measureText(t, fo));
    return [item, x1 - 1];
  }

  // ---- TurtleScreen
  *clear(): Gen<void> {
    this.delayvalue = CFG.delay;
    this.colormode_ = CFG.colormode;
    this.cv.delete("all");
    this.bgpicItem = this.cv.create("image", [0, 0], { image: "" });
    this.tracing = 1;
    this.updatecounter = 0;
    this.turtles = [];
    yield* this.bgcolor(["white"]);
    this.cv.bindings.clear();
    this.keys = [];
    this.env.pen = null;
  }

  *setup(width: PyValue, height: PyValue): Gen<void> {
    const [sw, sh] = CFG.screen;
    let w: number = typeof width === "number" && width >= 0 && width <= 1 ? sw * width : num(width, "width");
    let h: number =
      typeof height === "number" && height >= 0 && height <= 1 ? sh * height : num(height, "height");
    // geometry("%dx%d...") truncates to int
    w = Math.trunc(w);
    h = Math.trunc(h);
    this.winWidth = w;
    this.winHeight = h;
    this.env.host.emit({ op: "window", width: w, height: h });
    yield* this.update();
  }

  colorstr(args: PyValue[]): string {
    let color: PyValue = args.length === 1 ? (args[0] as PyValue) : new PyTuple(args);
    if (typeof color === "string") {
      if (this.iscolorstring(color) || color === "") return color;
      throw tgError(`bad color string: ${color}`);
    }
    const items = color instanceof PyTuple || color instanceof PyList ? color.items : null;
    if (items?.length !== 3) throw tgError(`bad color arguments: ${str(color)}`);
    let [r, g, b] = items as [PyValue, PyValue, PyValue];
    if (!isNumber(r) || !isNumber(g) || !isNumber(b)) throw new Unsupported("颜色分量不是数字");
    if (this.colormode_ === 1.0 && typeof this.colormode_ === "number") {
      [r, g, b] = [r, g, b].map((x) => roundHalfEvenToBigInt(255.0 * toFloat(x))) as [bigint, bigint, bigint];
    }
    const inRange = (x: PyValue) => toFloat(x as number) >= 0 && toFloat(x as number) <= 255;
    if (!(inRange(r) && inRange(g) && inRange(b))) throw tgError(`bad color sequence: ${str(color)}`);
    if (!isInt(r) || !isInt(g) || !isInt(b)) throw new Unsupported("255 颜色模式下的小数颜色");
    color = null;
    return `#${[r, g, b]
      .map((x) =>
        toBig(x as bigint)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  }

  color(cstr: string): PyValue {
    if (!cstr.startsWith("#")) return cstr;
    let cl: number[];
    if (cstr.length === 7) cl = [1, 3, 5].map((i) => Number.parseInt(cstr.slice(i, i + 2), 16));
    else if (cstr.length === 4) cl = [...cstr.slice(1)].map((h) => 16 * Number.parseInt(h, 16));
    else throw tgError(`bad colorstring: ${cstr}`);
    const cm = f(this.colormode_);
    return new PyTuple(cl.map((c) => (c * cm) / 255));
  }

  *bgcolor(args: PyValue[]): Gen<PyValue> {
    const color = args.length ? this.colorstr(args) : null;
    const r = yield* this.bgcolor_(color);
    return r === null ? null : this.color(r);
  }

  *tracer(n: PyValue, delay: PyValue): Gen<PyValue> {
    if (n === null) return BigInt(this.tracing);
    this.tracing = Number(intOf(n));
    this.updatecounter = 0;
    if (delay !== null) this.delayvalue = Number(intOf(delay));
    if (this.tracing) yield* this.update();
    return null;
  }

  incrementudc(): void {
    if (!this.running) {
      this.running = true;
      throw new PyException(EXC.Terminator, "", []);
    }
    if (this.tracing > 0) {
      this.updatecounter += 1;
      this.updatecounter %= this.tracing;
    }
  }

  *update(): Gen<void> {
    const tracing = this.tracing;
    this.tracing = 1;
    for (const t of this.turtles) {
      t.updateData();
      t.drawturtle();
    }
    this.tracing = tracing;
    yield* this.update_();
  }

  addTimer(ms: number, fn: PyValue): void {
    this.timers.push({ due: this.env.host.now() + ms, seq: ++this.timerSeq, fn });
    this.timers.sort((a, b) => a.due - b.due || a.seq - b.seq);
  }

  *mainloop(): Gen<void> {
    this.env.flush();
    for (;;) {
      if (this.destroyed) return;
      yield* this.env.runDueTimers();
      if (this.destroyed || (!this.timers.length && !this.cv.hasBindings())) return;
      const next = this.timers[0];
      const timeout = next ? Math.max(0, next.due - this.env.host.now()) : null;
      const ev = yield { kind: "event", timeoutMs: timeout };
      if (ev) yield* this.env.dispatch(ev as HostEventLike);
    }
  }

  destroy(): void {
    this.env.pen = null;
    this.env.screen = null;
    this.running = false;
    this.destroyed = true;
    this.timers = [];
  }
}

interface HostEventLike {
  type: "key" | "button" | "motion";
  press?: boolean;
  keysym?: string;
  char?: string;
  num?: number;
  x?: number;
  y?: number;
}

// =================================================================== turtle

class Turtle {
  // TNavigator
  angleOffset: number = 0;
  angleOrient = 1;
  mode_ = "standard";
  fullcircle = 360.0;
  degreesPerAU = 1.0;
  position: V = [0.0, 0.0];
  orient: V = [1.0, 0.0];
  // TPen
  resizemode_ = CFG.resizemode;
  pensize_: N = 1n;
  shown = true;
  pencolor_ = CFG.pencolor;
  fillcolor_ = CFG.fillcolor;
  drawing = true;
  speed_ = 3;
  stretchfactor: [N, N] = [1.0, 1.0];
  outlinewidth: N = 1n;
  shapetrafo: [number, number, number, number] = [1.0, 0.0, 0.0, 1.0];
  // RawTurtle
  drawingLineItem: number;
  shapeIndex = CFG.shape;
  shapeType: "polygon" | "image" | null = null;
  shapeItem = 0;
  fillitem: number | null = null;
  fillpath: V[] | null = null;
  hiddenFromScreen = false;
  currentLineItem: number;
  currentLine: V[];
  items: number[];
  stampItems: number[] = [];
  native: PyNative | null = null;

  constructor(
    readonly screen: Screen,
    shape: string,
    visible: boolean,
  ) {
    this.mode_ = screen.mode_;
    this.degrees(360.0);
    this.setmode(screen.mode_);
    this.navReset();
    this.penReset();
    screen.turtles.push(this);
    this.drawingLineItem = screen.createline();
    this.setshape(shape);
    this.shown = visible;
    this.currentLineItem = screen.createline();
    this.currentLine = [this.position];
    this.items = [this.currentLineItem];
  }

  // ---- TNavigator
  navReset(): void {
    this.position = [0.0, 0.0];
    this.orient = this.mode_ === "logo" ? [0.0, 1.0] : [1.0, 0.0];
  }
  setmode(mode: string): void {
    this.mode_ = mode;
    if (mode === "standard" || mode === "world") {
      this.angleOffset = 0;
      this.angleOrient = 1;
    } else {
      this.angleOffset = this.fullcircle / 4.0;
      this.angleOrient = -1;
    }
  }
  setDegreesPerAU(fullcircle: number): void {
    this.fullcircle = fullcircle;
    this.degreesPerAU = 360 / fullcircle;
    this.angleOffset = this.mode_ === "standard" ? 0 : fullcircle / 4.0;
  }
  degrees(fullcircle = 360.0): void {
    this.setDegreesPerAU(fullcircle);
  }
  radians(): void {
    this.setDegreesPerAU(2 * Math.PI);
  }
  *go(distance: N): Gen<void> {
    yield* this.goto_(vadd(this.position, vmul(this.orient, distance)));
  }
  heading(): number {
    const [x, y] = this.orient;
    let result = modFloat(roundFloat(Math.atan2(f(y), f(x)) * (180 / Math.PI), 10), 360.0);
    result /= this.degreesPerAU;
    return modFloat(this.angleOffset + this.angleOrient * result, this.fullcircle);
  }
  towards(pos: V): number {
    const [x, y] = vsub(pos, this.position);
    let result = modFloat(roundFloat(Math.atan2(f(y), f(x)) * (180 / Math.PI), 10), 360.0);
    result /= this.degreesPerAU;
    return modFloat(this.angleOffset + this.angleOrient * result, this.fullcircle);
  }
  *setheading(toAngle: number): Gen<void> {
    let angle = (toAngle - this.heading()) * this.angleOrient;
    const full = this.fullcircle;
    angle = modFloat(angle + full / 2.0, full) - full / 2.0;
    yield* this.rotate(angle);
  }
  *circle(radius: number, extentV: number | null, stepsV: number | null): Gen<void> {
    const speed = this.speed_;
    const extent = extentV === null ? this.fullcircle : extentV;
    let steps = stepsV;
    if (steps === null) {
      const frac = Math.abs(extent) / this.fullcircle;
      steps = 1 + Math.trunc(Math.min(11 + Math.abs(radius) / 6.0, 59.0) * frac);
    }
    let w = (1.0 * extent) / steps;
    let w2 = 0.5 * w;
    let l = 2.0 * radius * Math.sin(w2 * (Math.PI / 180) * this.degreesPerAU);
    if (radius < 0) [l, w, w2] = [-l, -w, -w2];
    const tr = this.screen.tracing;
    const dl = this.screen.delayvalue;
    if (speed === 0) yield* this.screen.tracer(0n, 0n);
    else yield* this.speed(0);
    yield* this.rotate(w2);
    for (let i = 0; i < steps; i++) {
      yield* this.speed(speed);
      yield* this.go(l);
      yield* this.speed(0);
      yield* this.rotate(w);
    }
    yield* this.rotate(-w2);
    if (speed === 0) yield* this.screen.tracer(BigInt(tr), BigInt(dl));
    yield* this.speed(speed);
  }

  // ---- TPen
  penReset(): void {
    this.pensize_ = 1n;
    this.shown = true;
    this.pencolor_ = CFG.pencolor;
    this.fillcolor_ = CFG.fillcolor;
    this.drawing = true;
    this.speed_ = 3;
    this.stretchfactor = [1.0, 1.0];
    this.shapetrafo = [1.0, 0.0, 0.0, 1.0];
    this.outlinewidth = 1n;
  }
  *speed(speed: PyValue): Gen<void> {
    const speeds: Record<string, number> = { fastest: 0, fast: 10, normal: 6, slow: 3, slowest: 1 };
    let s: number;
    if (typeof speed === "string") {
      if (!(speed in speeds))
        throw pyErr(EXC.TypeError, "'<' not supported between instances of 'float' and 'str'");
      s = speeds[speed] as number;
    } else {
      const x = toFloat(numOrError(speed));
      s = 0.5 < x && x < 10.5 ? Number(roundHalfEvenToBigInt(x)) : 0;
    }
    yield* this.pen({ speed: s });
  }
  pen_dict(): PenState {
    return {
      shown: this.shown,
      pendown: this.drawing,
      pencolor: this.pencolor_,
      fillcolor: this.fillcolor_,
      pensize: this.pensize_,
      speed: this.speed_,
      resizemode: this.resizemode_,
      stretchfactor: this.stretchfactor,
      outline: this.outlinewidth,
    };
  }
  *pen(p: Partial<PenState>): Gen<void> {
    let newLine = false;
    if (p.pendown !== undefined && this.drawing !== p.pendown) newLine = true;
    if (p.pencolor !== undefined && this.pencolor_ !== p.pencolor) newLine = true;
    if (p.pensize !== undefined && !numEq(this.pensize_, p.pensize)) newLine = true;
    if (newLine) this.newLine();
    if (p.pendown !== undefined) this.drawing = p.pendown;
    if (p.pencolor !== undefined) this.pencolor_ = p.pencolor;
    if (p.pensize !== undefined) this.pensize_ = p.pensize;
    if (p.fillcolor !== undefined) this.fillcolor_ = p.fillcolor;
    if (p.speed !== undefined) this.speed_ = p.speed;
    if (p.resizemode !== undefined) this.resizemode_ = p.resizemode;
    if (p.stretchfactor !== undefined) this.stretchfactor = p.stretchfactor;
    if (p.outline !== undefined) this.outlinewidth = p.outline;
    if (p.shown !== undefined) this.shown = p.shown;
    if (p.stretchfactor !== undefined) {
      const [scx, scy] = this.stretchfactor.map(f) as [number, number];
      // tilt and shear are always 0 here (not ported)
      this.shapetrafo = [scx * 1, scy * (0 * 1 + 0), -scx * 0, scy * (1 - 0 * 0)];
    }
    yield* this.update();
  }
  *pencolor(args: PyValue[]): Gen<PyValue> {
    if (!args.length) return this.screen.color(this.pencolor_);
    const color = this.screen.colorstr(args);
    if (color === this.pencolor_) return null;
    yield* this.pen({ pencolor: color });
    return null;
  }
  *fillcolor(args: PyValue[]): Gen<PyValue> {
    if (!args.length) return this.screen.color(this.fillcolor_);
    const color = this.screen.colorstr(args);
    if (color === this.fillcolor_) return null;
    yield* this.pen({ fillcolor: color });
    return null;
  }
  *color(args: PyValue[]): Gen<PyValue> {
    if (!args.length)
      return new PyTuple([this.screen.color(this.pencolor_), this.screen.color(this.fillcolor_)]);
    let pcolor: PyValue[];
    let fcolor: PyValue[];
    if (args.length === 1) pcolor = fcolor = [args[0] as PyValue];
    else if (args.length === 2) {
      pcolor = [args[0] as PyValue];
      fcolor = [args[1] as PyValue];
    } else if (args.length === 3) pcolor = fcolor = [new PyTuple(args)];
    else
      throw pyErr(
        EXC.UnboundLocalError,
        "cannot access local variable 'pcolor' where it is not associated with a value",
      );
    const pc = this.screen.colorstr(pcolor);
    const fc = this.screen.colorstr(fcolor);
    yield* this.pen({ pencolor: pc, fillcolor: fc });
    return null;
  }

  // ---- RawTurtle
  setshape(name: string): void {
    const screen = this.screen;
    const shape = screen.shapes.get(name) as Shape;
    this.shapeIndex = name;
    if (this.shapeType === shape.type) return;
    if (this.shapeType !== null) screen.cv.delete(this.shapeItem);
    this.shapeType = shape.type;
    this.shapeItem =
      shape.type === "polygon" ? screen.createpoly() : screen.cv.create("image", [0, 0], { image: "" });
  }
  *reset(): Gen<void> {
    this.navReset();
    this.penReset();
    this.clear_();
    this.drawturtle();
    yield* this.update();
  }
  clear_(): void {
    this.fillitem = null;
    this.fillpath = null;
    for (const item of this.items) this.screen.cv.delete(item);
    this.currentLineItem = this.screen.createline();
    this.currentLine = [];
    if (this.drawing) this.currentLine.push(this.position);
    this.items = [this.currentLineItem];
    for (const s of [...this.stampItems]) this.clearstamp_(s);
  }
  *clear(): Gen<void> {
    this.clear_();
    yield* this.update();
  }
  updateData(): void {
    this.screen.incrementudc();
    if (this.screen.updatecounter !== 0) return;
    if (this.currentLine.length > 1)
      this.screen.drawline(this.currentLineItem, this.currentLine, this.pencolor_, this.pensize_);
  }
  *update(): Gen<void> {
    const screen = this.screen;
    if (screen.tracing === 0) return;
    if (screen.tracing === 1) {
      this.updateData();
      this.drawturtle();
      yield* screen.update_();
      yield* screen.delay_(screen.delayvalue);
    } else {
      this.updateData();
      if (screen.updatecounter === 0) {
        for (const t of screen.turtles) t.drawturtle();
        yield* screen.update_();
      }
    }
  }
  polytrafo(poly: Poly): Array<[number, number]> {
    const screen = this.screen;
    const [p0, p1] = [f(this.position[0]), f(this.position[1])];
    let [e0, e1] = [f(this.orient[0]), f(this.orient[1])];
    const e: [number, number] = [e0, (e1 * screen.yscale) / screen.xscale];
    const inv = 1.0 / Math.hypot(e[0], e[1]);
    [e0, e1] = [inv * e[0], inv * e[1]];
    return poly.map(([x, y]) => [
      p0 + (e1 * x + e0 * y) / screen.xscale,
      p1 + (-e0 * x + e1 * y) / screen.yscale,
    ]);
  }
  getshapepoly(polygon: Poly): Poly {
    let t11: number;
    let t12: number;
    let t21: number;
    let t22: number;
    if (this.resizemode_ === "user") [t11, t12, t21, t22] = this.shapetrafo;
    else if (this.resizemode_ === "auto") {
      const l = Math.max(1, f(this.pensize_) / 5.0);
      [t11, t12, t21, t22] = [l, 0, 0, l];
    } else return polygon;
    return polygon.map(([x, y]) => [t11 * x + t12 * y, t21 * x + t22 * y]);
  }
  outlineWidth(): N {
    if (this.resizemode_ === "noresize") return 1n;
    if (this.resizemode_ === "auto") return this.pensize_;
    return this.outlinewidth;
  }
  drawturtle(): void {
    const screen = this.screen;
    const shape = screen.shapes.get(this.shapeIndex) as Shape;
    const titem = this.shapeItem;
    if (this.shown && screen.updatecounter === 0 && screen.tracing > 0) {
      this.hiddenFromScreen = false;
      if (shape.type === "polygon") {
        const w = this.outlineWidth();
        const poly = this.polytrafo(this.getshapepoly(shape.data as Poly));
        screen.drawpoly(titem, poly, this.fillcolor_, this.pencolor_, w, true);
      } else {
        screen.cv.setCoords(titem, [
          f(this.position[0]) * screen.xscale,
          -f(this.position[1]) * screen.yscale,
        ]);
        screen.cv.configure(titem, { image: "" });
      }
    } else {
      if (this.hiddenFromScreen) return;
      if (shape.type === "polygon")
        screen.drawpoly(
          titem,
          [
            [0, 0],
            [0, 0],
            [0, 0],
          ],
          "",
          "",
        );
      else {
        screen.cv.setCoords(titem, [
          f(this.position[0]) * screen.xscale,
          -f(this.position[1]) * screen.yscale,
        ]);
        screen.cv.configure(titem, { image: "" });
      }
      this.hiddenFromScreen = true;
    }
  }
  stamp(): PyValue {
    const screen = this.screen;
    const shape = screen.shapes.get(this.shapeIndex) as Shape;
    let stitem: number;
    if (shape.type === "polygon") {
      stitem = screen.createpoly();
      const w = this.outlineWidth();
      const poly = this.polytrafo(this.getshapepoly(shape.data as Poly));
      screen.drawpoly(stitem, poly, this.fillcolor_, this.pencolor_, w, true);
    } else {
      stitem = screen.cv.create("image", [0, 0], { image: "" });
      screen.cv.setCoords(stitem, [
        f(this.position[0]) * screen.xscale,
        -f(this.position[1]) * screen.yscale,
      ]);
    }
    this.stampItems.push(stitem);
    return BigInt(stitem);
  }
  clearstamp_(id: number): void {
    const i = this.stampItems.indexOf(id);
    if (i >= 0) {
      this.screen.cv.delete(id);
      this.stampItems.splice(i, 1);
    }
  }
  *goto_(end: V): Gen<void> {
    const screen = this.screen;
    const start = this.position;
    if (this.speed_ && screen.tracing === 1) {
      const diff = vsub(end, start);
      const diffsq = (f(diff[0]) * screen.xscale) ** 2 + (f(diff[1]) * screen.yscale) ** 2;
      const nhops = 1 + Math.trunc(diffsq ** 0.5 / (3 * 1.1 ** this.speed_ * this.speed_));
      const delta = vmul(diff, 1.0 / nhops);
      for (let n = 1; n < nhops; n++) {
        const top = n === 1;
        this.position = vadd(start, vmul(delta, n));
        if (this.drawing)
          screen.drawline(this.drawingLineItem, [start, this.position], this.pencolor_, this.pensize_, top);
        yield* this.update();
      }
      if (this.drawing)
        screen.drawline(
          this.drawingLineItem,
          [
            [0, 0],
            [0, 0],
          ],
          "",
          this.pensize_,
        );
    }
    if (this.drawing) this.currentLine.push(end);
    if (this.fillpath) this.fillpath.push(end);
    this.position = end;
    if (this.currentLine.length > 42) this.newLine();
    yield* this.update();
  }
  *rotate(angleAU: number): Gen<void> {
    const angle = angleAU * this.degreesPerAU;
    const neworient = vrotate(this.orient, angle);
    const tracing = this.screen.tracing;
    if (tracing === 1 && this.speed_ > 0) {
      const anglevel = 3.0 * this.speed_;
      const steps = 1 + Math.trunc(Math.abs(angle) / anglevel);
      const delta = (1.0 * angle) / steps;
      for (let i = 0; i < steps; i++) {
        this.orient = vrotate(this.orient, delta);
        yield* this.update();
      }
    }
    this.orient = neworient;
    yield* this.update();
  }
  newLine(usePos = true): void {
    if (this.currentLine.length > 1) {
      this.screen.drawline(this.currentLineItem, this.currentLine, this.pencolor_, this.pensize_);
      this.currentLineItem = this.screen.createline();
      this.items.push(this.currentLineItem);
    } else {
      this.screen.drawline(this.currentLineItem, undefined, undefined, undefined, true);
    }
    this.currentLine = [];
    if (usePos) this.currentLine = [this.position];
  }
  filling(): boolean {
    return this.fillpath !== null;
  }
  *beginFill(): Gen<void> {
    if (!this.filling()) {
      this.fillitem = this.screen.createpoly();
      this.items.push(this.fillitem);
    }
    this.fillpath = [this.position];
    this.newLine();
    yield* this.update();
  }
  *endFill(): Gen<void> {
    if (this.filling()) {
      const path = this.fillpath as V[];
      if (path.length > 2) this.screen.drawpoly(this.fillitem as number, path, this.fillcolor_);
      this.fillitem = null;
      this.fillpath = null;
      yield* this.update();
    }
  }
  *dot(sizeV: PyValue, colorArgs: PyValue[]): Gen<void> {
    let size: N;
    let color: string;
    if (!colorArgs.length) {
      if (typeof sizeV === "string" || sizeV instanceof PyTuple) {
        color = this.screen.colorstr([sizeV]);
        size = add(this.pensize_, maxN(this.pensize_, 4n));
      } else {
        color = this.pencolor_;
        size =
          sizeV === null || !truthy(sizeV) ? add(this.pensize_, maxN(this.pensize_, 4n)) : numOrError(sizeV);
      }
    } else {
      size = sizeV === null ? add(this.pensize_, maxN(this.pensize_, 4n)) : numOrError(sizeV);
      color = this.screen.colorstr(colorArgs);
    }
    const pen = this.pen_dict();
    try {
      if (this.resizemode_ === "auto") yield* this.pen({ shown: false });
      if (!this.drawing) yield* this.pen({ pendown: true });
      yield* this.pen({ pensize: size });
      if (color !== this.pencolor_) yield* this.pen({ pencolor: color });
      yield* this.go(0n);
    } finally {
      yield* this.pen(pen);
    }
  }
  *write(arg: PyValue, move: boolean, align: string, font: Array<string | number>): Gen<void> {
    const [item, end] = this.screen.write_(
      this.position,
      str(arg),
      align.toLowerCase(),
      font,
      this.pencolor_,
    );
    yield* this.update();
    this.items.push(item);
    if (move) yield* this.goto_([BigInt(end), this.position[1]]);
  }
  *teleport(x: PyValue, y: PyValue, fillGap: boolean): Gen<void> {
    const pendown = this.drawing;
    const wasFilling = this.filling();
    if (pendown) yield* this.pen({ pendown: false });
    if (wasFilling && !fillGap) yield* this.endFill();
    const nx: N = x !== null ? numOrError(x) : this.position[0];
    const ny: N = y !== null ? numOrError(y) : this.position[1];
    this.position = [nx, ny];
    yield* this.pen({ pendown });
    if (wasFilling && !fillGap) yield* this.beginFill();
  }
}

interface PenState {
  shown: boolean;
  pendown: boolean;
  pencolor: string;
  fillcolor: string;
  pensize: N;
  speed: number;
  resizemode: string;
  stretchfactor: [N, N];
  outline: N;
}

function numEq(a: N, b: N): boolean {
  return typeof a === "bigint" && typeof b === "bigint" ? a === b : f(a) === f(b);
}
function maxN(a: N, b: N): N {
  return f(a) >= f(b) ? a : b;
}
function numOrError(v: PyValue): N {
  if (typeof v === "boolean") return v ? 1n : 0n;
  if (typeof v === "bigint" || typeof v === "number") return v;
  throw new Unsupported(`海龟参数类型 ${typeName(v)}`);
}
function num(v: PyValue, what: string): number {
  if (typeof v === "bigint" || typeof v === "number" || typeof v === "boolean") return toFloat(v);
  throw new Unsupported(`${what} 参数类型 ${typeName(v)}`);
}
function intOf(v: PyValue): bigint {
  if (isInt(v)) return toBig(v);
  if (typeof v === "number") return BigInt(Math.trunc(v));
  throw new Unsupported(`整数参数类型 ${typeName(v)}`);
}

// =================================================================== environment + Python bindings

class TurtleEnv {
  screen: Screen | null = null;
  pen: Turtle | null = null;
  title = CFG.title;
  everCreated = false;

  constructor(
    readonly interp: Interpreter,
    readonly host: TurtleHost,
  ) {}

  flush(): void {}

  *getScreen(): Gen<Screen> {
    if (!this.screen) {
      if (this.everCreated && !this.running) {
        // turtle.py: calling turtle functions after bye() raises Terminator once
        this.running = true;
        throw new PyException(EXC.Terminator, "", []);
      }
      const s = new Screen(this);
      this.screen = s;
      this.everCreated = true;
      yield* s.init();
    }
    return this.screen;
  }
  running = true;

  *newTurtle(shape: string, visible: boolean): Gen<Turtle> {
    const screen = yield* this.getScreen();
    const t = new Turtle(screen, shape, visible);
    yield* t.update();
    return t;
  }

  *getPen(): Gen<Turtle> {
    if (!this.pen) this.pen = yield* this.newTurtle(CFG.shape, true);
    return this.pen;
  }

  /** Tk update(): deliver pending events and due timers without blocking. */
  *pump(): Gen<void> {
    for (;;) {
      const ev = yield { kind: "event", timeoutMs: 0 };
      if (!ev) break;
      yield* this.dispatch(ev as HostEventLike);
    }
    yield* this.runDueTimers();
  }

  *runDueTimers(): Gen<void> {
    const screen = this.screen;
    if (!screen) return;
    const now = this.host.now();
    while (screen.timers.length && (screen.timers[0] as { due: number }).due <= now && !screen.destroyed) {
      const t = screen.timers.shift() as { fn: PyValue };
      yield* this.interp.callValue(t.fn);
    }
  }

  *dispatch(ev: HostEventLike): Gen<void> {
    const screen = this.screen;
    if (!screen || screen.destroyed) return;
    const cv = screen.cv;
    if (ev.type === "key") {
      const keysym = ev.keysym ?? "";
      const seqs = ev.press !== false ? [`<KeyPress-${keysym}>`, "<KeyPress>"] : [`<KeyRelease-${keysym}>`];
      for (const seq of seqs) {
        const fn = cv.bindings.get(seq);
        if (fn) {
          yield* runBinding(fn, { x: 0, y: 0, keysym, char: ev.char ?? "", num: 0 });
          break;
        }
      }
      return;
    }
    const numB = ev.num ?? 1;
    const e = { x: ev.x ?? 0, y: ev.y ?? 0, keysym: "", char: "", num: numB };
    const seq =
      ev.type === "motion"
        ? `<Button${numB}-Motion>`
        : ev.press !== false
          ? `<Button-${numB}>`
          : `<Button${numB}-ButtonRelease>`;
    const item = cv.hit(e.x, e.y);
    if (item !== null) {
      const fn = cv.tagBindings.get(item)?.get(seq);
      if (fn) yield* runBinding(fn, e);
    }
    const fn = cv.bindings.get(seq);
    if (fn) yield* runBinding(fn, e);
  }
}

function* runBinding(fn: Binding, e: Parameters<Binding>[0]): Gen<void> {
  const r = fn(e);
  if (r && typeof (r as Gen<PyValue>).next === "function") yield* r as Gen<PyValue>;
}

type Method = (args: PyValue[], kwargs: Map<string, PyValue>) => PyValue | Gen<PyValue>;

function argCheck(
  name: string,
  args: PyValue[],
  kwargs: Map<string, PyValue>,
  names: string[],
  required: number,
): PyValue[] {
  if (args.length > names.length) throw new Unsupported(`${name} 参数个数`);
  const out: PyValue[] = [...args];
  for (const [k, v] of kwargs) {
    const i = names.indexOf(k);
    if (i < 0) throw pyErr(EXC.TypeError, `${name}() got an unexpected keyword argument '${k}'`);
    if (i < args.length) throw pyErr(EXC.TypeError, `${name}() got multiple values for argument '${k}'`);
    out[i] = v;
  }
  for (let i = 0; i < required; i++) {
    if (out[i] === undefined) throw new Unsupported(`${name} 缺少参数`);
  }
  return out;
}

function realArg(v: PyValue | undefined, what: string): number {
  if (v !== undefined && isNumber(v)) return toFloat(v);
  throw new Unsupported(`${what} 参数类型 ${typeName(v ?? null)}`);
}

function posArg(x: PyValue, y: PyValue | undefined): V {
  if (y === undefined || y === null) {
    if (x instanceof PyTuple || x instanceof PyList) {
      if (x.items.length !== 2) throw new Unsupported("坐标参数");
      return [numOrError(x.items[0] as PyValue), numOrError(x.items[1] as PyValue)];
    }
    throw new Unsupported("坐标参数");
  }
  return [numOrError(x), numOrError(y)];
}

const vec = (v: V): PyVec2D => new PyVec2D(f(v[0]), f(v[1]));
const pyNum = (n: N): PyValue => n;

function turtleMethods(env: TurtleEnv, get: () => Gen<Turtle>): Map<string, Method> {
  const m = new Map<string, Method>();
  const def = (
    names: string[],
    fn: (t: Turtle, args: PyValue[], kwargs: Map<string, PyValue>) => PyValue | Gen<PyValue>,
  ) => {
    for (const n of names)
      m.set(n, function* (args, kwargs) {
        const t = yield* get();
        const r = fn(t, args, kwargs);
        if (r && typeof (r as Gen<PyValue>).next === "function") return yield* r as Gen<PyValue>;
        return r as PyValue;
      });
  };
  const noArgs = (name: string, args: PyValue[], kwargs: Map<string, PyValue>) => {
    if (args.length || kwargs.size) throw new Unsupported(`${name} 参数`);
  };
  def(["forward", "fd"], function* (t, a, k) {
    const [d] = argCheck("forward", a, k, ["distance"], 1);
    yield* t.go(numOrError(d as PyValue));
    return null;
  });
  def(["back", "bk", "backward"], function* (t, a, k) {
    const [d] = argCheck("back", a, k, ["distance"], 1);
    const n = numOrError(d as PyValue);
    yield* t.go(typeof n === "bigint" ? -n : -n);
    return null;
  });
  def(["right", "rt"], function* (t, a, k) {
    const [d] = argCheck("right", a, k, ["angle"], 1);
    yield* t.rotate(-realArg(d, "angle"));
    return null;
  });
  def(["left", "lt"], function* (t, a, k) {
    const [d] = argCheck("left", a, k, ["angle"], 1);
    yield* t.rotate(realArg(d, "angle"));
    return null;
  });
  def(["goto", "setpos", "setposition"], function* (t, a, k) {
    const [x, y] = argCheck("goto", a, k, ["x", "y"], 1);
    yield* t.goto_(posArg(x as PyValue, y));
    return null;
  });
  def(["setx"], function* (t, a, k) {
    const [x] = argCheck("setx", a, k, ["x"], 1);
    yield* t.goto_([numOrError(x as PyValue), t.position[1]]);
    return null;
  });
  def(["sety"], function* (t, a, k) {
    const [y] = argCheck("sety", a, k, ["y"], 1);
    yield* t.goto_([t.position[0], numOrError(y as PyValue)]);
    return null;
  });
  def(["home"], function* (t, a, k) {
    noArgs("home", a, k);
    yield* t.goto_([0n, 0n]);
    yield* t.setheading(0);
    return null;
  });
  def(["setheading", "seth"], function* (t, a, k) {
    const [h] = argCheck("setheading", a, k, ["to_angle"], 1);
    yield* t.setheading(realArg(h, "to_angle"));
    return null;
  });
  def(["heading"], (t) => t.heading());
  def(["position", "pos"], (t) => vec(t.position));
  def(["xcor"], (t) => pyNum(t.position[0]));
  def(["ycor"], (t) => pyNum(t.position[1]));
  def(["distance"], (t, a, k) => {
    const [x, y] = argCheck("distance", a, k, ["x", "y"], 1);
    const target = x instanceof PyNative ? (turtleOf(x) as Turtle).position : posArg(x as PyValue, y);
    return vabs(vsub(target, t.position));
  });
  def(["towards"], (t, a, k) => {
    const [x, y] = argCheck("towards", a, k, ["x", "y"], 1);
    const target = x instanceof PyNative ? (turtleOf(x) as Turtle).position : posArg(x as PyValue, y);
    return t.towards(target);
  });
  def(["circle"], function* (t, a, k) {
    const [r, e, s] = argCheck("circle", a, k, ["radius", "extent", "steps"], 1);
    const steps = s === undefined || s === null ? null : Number(intOf(s));
    yield* t.circle(realArg(r, "radius"), e === undefined || e === null ? null : realArg(e, "extent"), steps);
    return null;
  });
  def(["dot"], function* (t, a, k) {
    if (k.size) throw new Unsupported("dot 关键字参数");
    yield* t.dot(a[0] ?? null, a.slice(1));
    return null;
  });
  def(["stamp"], (t, a, k) => {
    noArgs("stamp", a, k);
    return t.stamp();
  });
  def(["clearstamps"], function* (t, a, k) {
    const [n] = argCheck("clearstamps", a, k, ["n"], 0);
    let toDelete = [...t.stampItems];
    if (n !== undefined && n !== null) {
      const c = Number(intOf(n));
      toDelete = c >= 0 ? t.stampItems.slice(0, c) : t.stampItems.slice(c);
    }
    for (const s of toDelete) t.clearstamp_(s);
    yield* t.update();
    return null;
  });
  def(["clearstamp"], function* (t, a, k) {
    const [id] = argCheck("clearstamp", a, k, ["stampid"], 1);
    t.clearstamp_(Number(intOf(id as PyValue)));
    yield* t.update();
    return null;
  });
  def(["speed"], function* (t, a, k) {
    const [s] = argCheck("speed", a, k, ["speed"], 0);
    if (s === undefined || s === null) return BigInt(t.speed_);
    yield* t.speed(s);
    return null;
  });
  def(["pensize", "width"], function* (t, a, k) {
    const [w] = argCheck("pensize", a, k, ["width"], 0);
    if (w === undefined || w === null) return pyNum(t.pensize_);
    yield* t.pen({ pensize: numOrError(w) });
    return null;
  });
  def(["penup", "pu", "up"], function* (t, a, k) {
    noArgs("penup", a, k);
    if (t.drawing) yield* t.pen({ pendown: false });
    return null;
  });
  def(["pendown", "pd", "down"], function* (t, a, k) {
    noArgs("pendown", a, k);
    if (!t.drawing) yield* t.pen({ pendown: true });
    return null;
  });
  def(["isdown"], (t) => t.drawing);
  def(["pencolor"], (t, a, k) => {
    if (k.size) throw new Unsupported("pencolor 关键字参数");
    return t.pencolor(a);
  });
  def(["fillcolor"], (t, a, k) => {
    if (k.size) throw new Unsupported("fillcolor 关键字参数");
    return t.fillcolor(a);
  });
  def(["color"], (t, a, k) => {
    if (k.size) throw new Unsupported("color 关键字参数");
    return t.color(a);
  });
  def(["begin_fill"], function* (t, a, k) {
    noArgs("begin_fill", a, k);
    yield* t.beginFill();
    return null;
  });
  def(["end_fill"], function* (t, a, k) {
    noArgs("end_fill", a, k);
    yield* t.endFill();
    return null;
  });
  def(["filling"], (t) => t.filling());
  def(["showturtle", "st"], function* (t, a, k) {
    noArgs("showturtle", a, k);
    yield* t.pen({ shown: true });
    return null;
  });
  def(["hideturtle", "ht"], function* (t, a, k) {
    noArgs("hideturtle", a, k);
    yield* t.pen({ shown: false });
    return null;
  });
  def(["isvisible"], (t) => t.shown);
  def(["shape"], function* (t, a, k) {
    const [name] = argCheck("shape", a, k, ["name"], 0);
    if (name === undefined || name === null) return t.shapeIndex;
    if (typeof name !== "string" || !t.screen.shapes.has(name))
      throw tgError(`There is no shape named ${str(name as PyValue)}`);
    t.setshape(name);
    yield* t.update();
    return null;
  });
  def(["shapesize", "turtlesize"], function* (t, a, k) {
    const [sw, sl, ol] = argCheck("shapesize", a, k, ["stretch_wid", "stretch_len", "outline"], 0);
    if ((sw ?? null) === null && (sl ?? null) === null && (ol ?? null) === null)
      return new PyTuple([pyNum(t.stretchfactor[0]), pyNum(t.stretchfactor[1]), pyNum(t.outlinewidth)]);
    const swN = sw === undefined || sw === null ? null : numOrError(sw);
    const slN = sl === undefined || sl === null ? null : numOrError(sl);
    if ((swN !== null && f(swN) === 0) || (slN !== null && f(slN) === 0))
      throw tgError("stretch_wid/stretch_len must not be zero");
    let sf: [N, N];
    if (swN !== null) sf = slN === null ? [swN, swN] : [swN, slN];
    else if (slN !== null) sf = [t.stretchfactor[0], slN];
    else sf = t.stretchfactor;
    const outline = ol === undefined || ol === null ? t.outlinewidth : numOrError(ol);
    yield* t.pen({ resizemode: "user", stretchfactor: sf, outline });
    return null;
  });
  def(["write"], function* (t, a, k) {
    const [arg, move, align, font] = argCheck("write", a, k, ["arg", "move", "align", "font"], 1);
    const fontV = font ?? new PyTuple(["Arial", 8n, "normal"]);
    if (!(fontV instanceof PyTuple) && !(fontV instanceof PyList)) throw new Unsupported("write font 参数");
    const fontList = fontV.items.map((x) =>
      typeof x === "bigint" ? Number(x) : typeof x === "number" ? x : String(x),
    );
    const alignV = align ?? "left";
    if (typeof alignV !== "string") throw new Unsupported("write align 参数");
    yield* t.write(arg as PyValue, truthy(move ?? false), alignV, fontList);
    return null;
  });
  def(["clear"], function* (t, a, k) {
    noArgs("clear", a, k);
    yield* t.clear();
    return null;
  });
  def(["reset"], function* (t, a, k) {
    noArgs("reset", a, k);
    yield* t.reset();
    return null;
  });
  def(["degrees"], (t, a, k) => {
    const [fc] = argCheck("degrees", a, k, ["fullcircle"], 0);
    t.degrees(fc === undefined ? 360.0 : realArg(fc, "fullcircle"));
    return null;
  });
  def(["radians"], (t) => {
    t.radians();
    return null;
  });
  def(["teleport"], function* (t, a, k) {
    const [x, y, gap] = argCheck("teleport", a, k, ["x", "y", "fill_gap"], 0);
    yield* t.teleport(x ?? null, y ?? null, truthy(gap ?? false));
    return null;
  });
  def(["getscreen"], function* () {
    return screenNative(env, yield* env.getScreen());
  });
  def(["getturtle", "getpen"], (t) => t.native);
  const bindTurtle = (seqFmt: (n: number) => string) =>
    function* (t: Turtle, a: PyValue[], k: Map<string, PyValue>): Gen<PyValue> {
      const [fun, btn] = argCheck("onclick", a, k, ["fun", "btn", "add"], 1);
      const num = btn === undefined || btn === null ? 1 : Number(intOf(btn));
      const map = t.screen.cv.tagBindings.get(t.shapeItem) ?? new Map<string, Binding>();
      if (fun === null) map.delete(seqFmt(num));
      else
        map.set(seqFmt(num), (e) =>
          env.interp.callValue(fun as PyValue, e.x / t.screen.xscale, -e.y / t.screen.yscale),
        );
      t.screen.cv.tagBindings.set(t.shapeItem, map);
      yield* t.update();
      return null;
    };
  def(
    ["onclick"],
    bindTurtle((n) => `<Button-${n}>`),
  );
  def(
    ["onrelease"],
    bindTurtle((n) => `<Button${n}-ButtonRelease>`),
  );
  def(["ondrag"], (t, a, k) => {
    const [fun, btn] = argCheck("ondrag", a, k, ["fun", "btn", "add"], 1);
    const num = btn === undefined || btn === null ? 1 : Number(intOf(btn));
    const map = t.screen.cv.tagBindings.get(t.shapeItem) ?? new Map<string, Binding>();
    if (fun === null) map.delete(`<Button${num}-Motion>`);
    else
      map.set(`<Button${num}-Motion>`, (e) =>
        env.interp.callValue(fun as PyValue, e.x / t.screen.xscale, -e.y / t.screen.yscale),
      );
    t.screen.cv.tagBindings.set(t.shapeItem, map);
    return null;
  });
  return m;
}

function screenMethods(env: TurtleEnv, get: () => Gen<Screen>): Map<string, Method> {
  const m = new Map<string, Method>();
  const def = (
    names: string[],
    fn: (s: Screen, args: PyValue[], kwargs: Map<string, PyValue>) => PyValue | Gen<PyValue>,
  ) => {
    for (const n of names)
      m.set(n, function* (args, kwargs) {
        const s = yield* get();
        const r = fn(s, args, kwargs);
        if (r && typeof (r as Gen<PyValue>).next === "function") return yield* r as Gen<PyValue>;
        return r as PyValue;
      });
  };
  def(["bgcolor"], (s, a, k) => {
    if (k.size) throw new Unsupported("bgcolor 关键字参数");
    return s.bgcolor(a);
  });
  def(["tracer"], (s, a, k) => {
    const [n, d] = argCheck("tracer", a, k, ["n", "delay"], 0);
    return s.tracer(n ?? null, d ?? null);
  });
  def(["delay"], (s, a, k) => {
    const [d] = argCheck("delay", a, k, ["delay"], 0);
    if (d === undefined || d === null) return BigInt(s.delayvalue);
    s.delayvalue = Number(intOf(d));
    return null;
  });
  def(["update"], function* (s) {
    yield* s.update();
    return null;
  });
  def(["colormode"], (s, a, k) => {
    const [c] = argCheck("colormode", a, k, ["cmode"], 0);
    if (c === undefined || c === null) return s.colormode_;
    if (isNumber(c) && toFloat(c) === 1.0) s.colormode_ = 1.0;
    else if (isNumber(c) && toFloat(c) === 255) s.colormode_ = 255n;
    return null;
  });
  def(["mode"], function* (s, a, k) {
    const [mode] = argCheck("mode", a, k, ["mode"], 0);
    if (mode === undefined || mode === null) return s.mode_;
    if (typeof mode !== "string") throw new Unsupported("mode 参数");
    const lower = mode.toLowerCase();
    if (lower === "world") throw new Unsupported("world 坐标模式");
    if (lower !== "standard" && lower !== "logo") throw tgError(`No turtle-graphics-mode ${lower}`);
    s.mode_ = lower;
    s.env.host.emit({
      op: "scrollregion",
      region: [-s.canvwidth / 2, -s.canvheight / 2, s.canvwidth / 2, s.canvheight / 2].map(Math.floor),
    });
    for (const t of s.turtles) {
      t.setmode(s.mode_);
      yield* t.reset();
    }
    return null;
  });
  def(["setup"], function* (s, a, k) {
    const [w, h] = argCheck("setup", a, k, ["width", "height", "startx", "starty"], 0);
    yield* s.setup(w ?? CFG.width, h ?? CFG.height);
    return null;
  });
  def(["title"], (s, a, k) => {
    const [t] = argCheck("title", a, k, ["titlestring"], 1);
    env.title = str(t as PyValue);
    s.env.host.emit({ op: "title", text: env.title });
    return null;
  });
  def(["window_width"], (s) => BigInt(s.winWidth));
  def(["window_height"], (s) => BigInt(s.winHeight));
  def(["turtles"], (s) => new PyList(s.turtles.map((t) => t.native as PyValue)));
  def(["getshapes"], (s) => new PyList([...s.shapes.keys()].sort()));
  def(["register_shape", "addshape"], (s, a, k) => {
    const [name, shape] = argCheck("register_shape", a, k, ["name", "shape"], 1);
    if (!(shape instanceof PyTuple)) throw new Unsupported("图片形状");
    const poly: Poly = shape.items.map((p) => {
      if (!(p instanceof PyTuple) || p.items.length !== 2) throw new Unsupported("形状坐标");
      return [realArg(p.items[0], "x"), realArg(p.items[1], "y")];
    });
    s.shapes.set(str(name as PyValue), { type: "polygon", data: poly });
    return null;
  });
  const keyBinding = (s: Screen, seq: string, fun: PyValue) => {
    if (fun === null) s.cv.bindings.delete(seq);
    else s.cv.bindings.set(seq, () => env.interp.callValue(fun));
  };
  def(["onkey", "onkeyrelease"], (s, a, k) => {
    const [fun, key] = argCheck("onkey", a, k, ["fun", "key"], 2);
    const keyS = str(key as PyValue);
    if (fun === null) s.keys = s.keys.filter((x) => x !== keyS);
    else if (!s.keys.includes(keyS)) s.keys.push(keyS);
    keyBinding(s, `<KeyRelease-${keyS}>`, fun as PyValue);
    return null;
  });
  def(["onkeypress"], (s, a, k) => {
    const [fun, key] = argCheck("onkeypress", a, k, ["fun", "key"], 1);
    const seq = key === undefined || key === null ? "<KeyPress>" : `<KeyPress-${str(key)}>`;
    keyBinding(s, seq, fun as PyValue);
    return null;
  });
  def(["onscreenclick", "onclick"], (s, a, k) => {
    const [fun, btn] = argCheck("onclick", a, k, ["fun", "btn", "add"], 1);
    const num = btn === undefined || btn === null ? 1 : Number(intOf(btn));
    const seq = `<Button-${num}>`;
    if (fun === null) s.cv.bindings.delete(seq);
    else s.cv.bindings.set(seq, (e) => env.interp.callValue(fun as PyValue, e.x / s.xscale, -e.y / s.yscale));
    return null;
  });
  def(["listen"], () => null);
  def(["ontimer"], (s, a, k) => {
    const [fun, t] = argCheck("ontimer", a, k, ["fun", "t"], 1);
    const ms = t === undefined || t === null ? 0 : realArg(t, "t");
    s.addTimer(ms, fun as PyValue);
    return null;
  });
  def(["mainloop", "done"], function* (s) {
    yield* s.mainloop();
    return null;
  });
  def(["exitonclick"], function* (s) {
    s.cv.bindings.set("<Button-1>", () => {
      s.destroy();
      return null;
    });
    yield* s.mainloop();
    return null;
  });
  def(["bye"], (s) => {
    s.destroy();
    return null;
  });
  def(["textinput"], function* (_s, a, k) {
    const [title, prompt] = argCheck("textinput", a, k, ["title", "prompt"], 2);
    const answer = yield { kind: "dialog", title: str(title as PyValue), prompt: str(prompt as PyValue) };
    return answer === null || answer === undefined ? null : String(answer);
  });
  def(["numinput"], function* (_s, a, k) {
    const [title, prompt, dflt, minv, maxv] = argCheck(
      "numinput",
      a,
      k,
      ["title", "prompt", "default", "minval", "maxval"],
      2,
    );
    void dflt;
    let p = str(prompt as PyValue);
    for (;;) {
      const answer = yield { kind: "dialog", title: str(title as PyValue), prompt: p };
      if (answer === null || answer === undefined) return null;
      const text = String(answer).trim();
      const v = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text) ? Number(text) : Number.NaN;
      if (Number.isNaN(v)) {
        const retry = "请输入一个数字 (please enter a number)";
        p = p.startsWith(retry) ? p : `${retry}\n${p}`;
        continue;
      }
      if (minv !== undefined && minv !== null && v < realArg(minv, "minval")) continue;
      if (maxv !== undefined && maxv !== null && v > realArg(maxv, "maxval")) continue;
      return v;
    }
  });
  def(["clearscreen", "clear"], function* (s) {
    yield* s.clear();
    return null;
  });
  def(["resetscreen", "reset"], function* (s) {
    for (const t of s.turtles) {
      t.setmode(s.mode_);
      yield* t.reset();
    }
    return null;
  });
  def(["screensize"], (s, a, k) => {
    const [w, h, bg] = argCheck("screensize", a, k, ["canvwidth", "canvheight", "bg"], 0);
    if ((w ?? null) === null && (h ?? null) === null && (bg ?? null) === null)
      return new PyTuple([BigInt(s.canvwidth), BigInt(s.canvheight)]);
    throw new Unsupported("screensize 修改画布大小");
  });
  return m;
}

const turtleNatives = new WeakMap<PyNative, Turtle>();
function turtleOf(v: PyValue): Turtle | undefined {
  return v instanceof PyNative ? turtleNatives.get(v) : undefined;
}

function toNative(typeName: string, methods: Map<string, Method>): PyNative {
  const nm = new Map<string, (call: CallArgs) => PyValue | Gen<PyValue>>();
  for (const [k, fn] of methods) nm.set(k, (call) => fn(call.args, call.kwargs));
  return new PyNative(typeName, nm);
}

function turtleNative(env: TurtleEnv, t: Turtle): PyNative {
  if (t.native) return t.native;
  const native = toNative(
    "Turtle",
    // biome-ignore lint/correctness/useYield: the getter protocol takes a generator; this one never suspends
    turtleMethods(env, function* () {
      return t;
    }),
  );
  t.native = native;
  turtleNatives.set(native, t);
  return native;
}

function screenNative(env: TurtleEnv, s: Screen): PyNative {
  if (s.native) return s.native;
  s.native = toNative(
    "_Screen",
    // biome-ignore lint/correctness/useYield: the getter protocol takes a generator; this one never suspends
    screenMethods(env, function* () {
      return s;
    }),
  );
  return s.native;
}

export const UNSUPPORTED_FUNCTIONS = [
  "bgpic",
  "getcanvas",
  "no_animation",
  "save",
  "setworldcoordinates",
  "begin_poly",
  "end_poly",
  "get_poly",
  "clone",
  "fill",
  "poly",
  "get_shapepoly",
  "pen",
  "resizemode",
  "setundobuffer",
  "shapetransform",
  "shearfactor",
  "tilt",
  "tiltangle",
  "undo",
  "undobufferentries",
  "write_docstringdict",
  "ScrolledCanvas",
  "TurtleScreen",
  "RawTurtle",
  "RawPen",
  "Shape",
  "Vec2D",
];

export function createTurtleModule(interp: Interpreter, host: TurtleHost): PyModule {
  const env = new TurtleEnv(interp, host);
  const attrs = new Map<string, PyValue>();

  // Turtle() / Pen() and Screen()
  const makeTurtle = function* (call: CallArgs): Gen<PyValue> {
    const [shape, undo, visible] = argCheck(
      "Turtle",
      call.args,
      call.kwargs,
      ["shape", "undobuffersize", "visible"],
      0,
    );
    void undo;
    const shapeName = shape === undefined ? CFG.shape : str(shape);
    const screen = yield* env.getScreen();
    if (!screen.shapes.has(shapeName)) throw new Unsupported(`形状 ${shapeName}`);
    const t = yield* env.newTurtle(shapeName, visible === undefined ? true : truthy(visible));
    return turtleNative(env, t);
  };
  attrs.set("Turtle", new PyBuiltin("Turtle", makeTurtle));
  attrs.set("Pen", new PyBuiltin("Pen", makeTurtle));
  attrs.set(
    "Screen",
    new PyBuiltin("Screen", function* (): Gen<PyValue> {
      return screenNative(env, yield* env.getScreen());
    }),
  );

  // module-level functions operate on the singleton pen / screen
  const pen = function* (): Gen<Turtle> {
    const t = yield* env.getPen();
    turtleNative(env, t);
    return t;
  };
  for (const [name, fn] of turtleMethods(env, pen)) {
    attrs.set(name, new PyBuiltin(name, (call) => fn(call.args, call.kwargs)));
  }
  const screen = function* (): Gen<Screen> {
    return yield* env.getScreen();
  };
  for (const [name, fn] of screenMethods(env, screen)) {
    if (name === "clear" || name === "reset" || name === "onclick") continue; // module-level names mean the turtle's
    attrs.set(name, new PyBuiltin(name, (call) => fn(call.args, call.kwargs)));
  }
  for (const name of UNSUPPORTED_FUNCTIONS) {
    attrs.set(
      name,
      new PyBuiltin(name, () => {
        throw new Unsupported(`turtle.${name}`);
      }),
    );
  }
  attrs.set("Terminator", new PyExcClass(EXC.Terminator));
  attrs.set("TurtleGraphicsError", new PyExcClass(EXC.TurtleGraphicsError));
  void PyFunction;
  return new PyModule("turtle", attrs);
}
