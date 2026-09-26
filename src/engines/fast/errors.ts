/**
 * Python exceptions inside the fast engine, plus the signal used when a
 * program steps outside the supported subset at run time.
 */

/** An exception class (NameError, ValueError, ...). */
export class PyExcType {
  constructor(
    readonly name: string,
    readonly base: PyExcType | null,
    /** defining module for non-builtin exceptions (tracebacks print "turtle.X") */
    readonly module: string | null = null,
  ) {}

  isSubclassOf(other: PyExcType): boolean {
    for (let t: PyExcType | null = this; t; t = t.base) if (t === other) return true;
    return false;
  }
}

const BaseException = new PyExcType("BaseException", null);
const Exception = new PyExcType("Exception", BaseException);
const ArithmeticError = new PyExcType("ArithmeticError", Exception);
const LookupError = new PyExcType("LookupError", Exception);
const NameError = new PyExcType("NameError", Exception);
const ImportError = new PyExcType("ImportError", Exception);
const RuntimeError = new PyExcType("RuntimeError", Exception);

export const EXC = {
  BaseException,
  Exception,
  ArithmeticError,
  LookupError,
  NameError,
  ImportError,
  RuntimeError,
  KeyboardInterrupt: new PyExcType("KeyboardInterrupt", BaseException),
  SystemExit: new PyExcType("SystemExit", BaseException),
  ZeroDivisionError: new PyExcType("ZeroDivisionError", ArithmeticError),
  OverflowError: new PyExcType("OverflowError", ArithmeticError),
  IndexError: new PyExcType("IndexError", LookupError),
  KeyError: new PyExcType("KeyError", LookupError),
  UnboundLocalError: new PyExcType("UnboundLocalError", NameError),
  TypeError: new PyExcType("TypeError", Exception),
  ValueError: new PyExcType("ValueError", Exception),
  AttributeError: new PyExcType("AttributeError", Exception),
  AssertionError: new PyExcType("AssertionError", Exception),
  ModuleNotFoundError: new PyExcType("ModuleNotFoundError", ImportError),
  RecursionError: new PyExcType("RecursionError", RuntimeError),
  EOFError: new PyExcType("EOFError", Exception),
  StopIteration: new PyExcType("StopIteration", Exception),
  NotImplementedError: new PyExcType("NotImplementedError", RuntimeError),
  TurtleGraphicsError: new PyExcType("TurtleGraphicsError", Exception, "turtle"),
  Terminator: new PyExcType("Terminator", Exception, "turtle"),
} as const;

export interface TraceFrame {
  name: string;
  line: number;
}

/** A raised Python exception travelling through the interpreter. */
export class PyException extends Error {
  /** Frames from outermost to innermost, captured when raised. */
  frames: TraceFrame[] = [];
  /** CPython's "Did you mean" hint, appended to the traceback's last line. */
  suggestion: string | null = null;

  constructor(
    readonly type: PyExcType,
    /** str(exc) — for KeyError this is already repr(key). */
    readonly text: string,
    /** The Python-visible args (used by str()/repr() of caught exceptions). */
    readonly args: unknown[] = text === "" ? [] : [text],
  ) {
    super(`${type.name}: ${text}`);
  }
}

export function pyErr(type: PyExcType, text: string): PyException {
  return new PyException(type, text);
}

/**
 * Thrown when a running program uses something the fast engine does not
 * implement. The engine re-runs the program on full Python.
 */
export class Unsupported extends Error {
  constructor(readonly feature: string) {
    super(`unsupported: ${feature}`);
  }
}
