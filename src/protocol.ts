/**
 * The contract between engines (which run Python) and the page (which
 * renders and collects input). Both engines speak exactly this protocol;
 * docs/protocol.md explains the design.
 *
 * Drawing commands mirror a Tk Canvas: engines create items with ids and
 * later change their coords/options. Coordinates are Tk canvas coordinates
 * (y grows downwards, origin at the centre of the turtle window).
 */

export type ItemKind = "line" | "polygon" | "text" | "image";

/** Tk item options PyPlay renders. Unknown keys are ignored by the renderer. */
export interface ItemOptions {
  fill?: string;
  outline?: string;
  width?: number;
  capstyle?: string;
  text?: string;
  anchor?: string;
  /** Tk font tuple: [family, size(points), style words...] */
  font?: Array<string | number>;
  image?: string;
}

export type CanvasCommand =
  | { op: "create"; id: number; kind: ItemKind; coords: number[]; opts: ItemOptions }
  | { op: "coords"; id: number; coords: number[] }
  | { op: "config"; id: number; opts: ItemOptions }
  | { op: "raise"; id: number }
  | { op: "lower"; id: number }
  | { op: "delete"; id: number | "all" }
  | { op: "bg"; color: string }
  | { op: "scrollregion"; region: [number, number, number, number] | number[] }
  | { op: "window"; width: number; height: number }
  | { op: "title"; text: string };

/** UI events delivered to the running program (Tk-style keysyms). */
export type HostEvent =
  | { type: "key"; press: boolean; keysym: string; char: string }
  | { type: "button"; press: boolean; num: number; x: number; y: number }
  | { type: "motion"; num: number; x: number; y: number };

export interface PyError {
  type: string;
  message: string;
  line: number | null;
  traceback: string;
}

export type RunResult = { status: "ok" } | { status: "stopped" } | { status: "error"; error: PyError };

export type EngineId = "fast" | "python";
