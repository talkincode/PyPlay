/** AST for the fast engine's Python subset. Every node records its line. */

export type Expr =
  | { t: "Name"; line: number; id: string }
  | { t: "Const"; line: number; value: bigint | number | string | boolean | null }
  | { t: "FString"; line: number; parts: FPart[] }
  | { t: "List"; line: number; elts: Expr[] }
  | { t: "Tuple"; line: number; elts: Expr[] }
  | { t: "Dict"; line: number; keys: Expr[]; values: Expr[] }
  | { t: "BinOp"; line: number; op: BinOpName; left: Expr; right: Expr }
  | { t: "UnaryOp"; line: number; op: "-" | "+" | "not"; operand: Expr }
  | { t: "BoolOp"; line: number; op: "and" | "or"; values: Expr[] }
  | { t: "Compare"; line: number; left: Expr; ops: CmpOp[]; comparators: Expr[] }
  | { t: "IfExp"; line: number; test: Expr; body: Expr; orelse: Expr }
  | { t: "Call"; line: number; func: Expr; args: Expr[]; keywords: Array<{ name: string; value: Expr }> }
  | { t: "Attribute"; line: number; value: Expr; attr: string }
  | { t: "Subscript"; line: number; value: Expr; index: Expr }
  | { t: "Slice"; line: number; lower: Expr | null; upper: Expr | null; step: Expr | null }
  | { t: "ListComp"; line: number; elt: Expr; generators: Comprehension[] }
  | { t: "GenExp"; line: number; elt: Expr; generators: Comprehension[] }
  | { t: "Lambda"; line: number; params: Param[]; body: Expr };

export type BinOpName = "+" | "-" | "*" | "/" | "//" | "%" | "**";
export type CmpOp = "<" | ">" | "<=" | ">=" | "==" | "!=" | "in" | "not in" | "is" | "is not";

export interface FPart {
  text?: string;
  expr?: Expr;
  conversion?: "r" | "s" | null;
  spec?: FPart[] | null;
}

export interface Comprehension {
  target: Expr;
  iter: Expr;
  ifs: Expr[];
}

export interface Param {
  name: string;
  default: Expr | null;
}

export type Stmt =
  | { t: "Expr"; line: number; value: Expr }
  | { t: "Assign"; line: number; targets: Expr[]; value: Expr }
  | { t: "AugAssign"; line: number; target: Expr; op: BinOpName; value: Expr }
  | { t: "If"; line: number; test: Expr; body: Stmt[]; orelse: Stmt[] }
  | { t: "While"; line: number; test: Expr; body: Stmt[]; orelse: Stmt[] }
  | { t: "For"; line: number; target: Expr; iter: Expr; body: Stmt[]; orelse: Stmt[] }
  | { t: "Break"; line: number }
  | { t: "Continue"; line: number }
  | { t: "Pass"; line: number }
  | { t: "Return"; line: number; value: Expr | null }
  | { t: "FunctionDef"; line: number; name: string; params: Param[]; body: Stmt[] }
  | { t: "Global"; line: number; names: string[] }
  | { t: "Import"; line: number; names: Array<{ name: string; asname: string | null }> }
  | {
      t: "ImportFrom";
      line: number;
      module: string;
      names: Array<{ name: string; asname: string | null }> | "*";
    }
  | { t: "Delete"; line: number; targets: Expr[] }
  | { t: "Raise"; line: number; exc: Expr | null }
  | { t: "Assert"; line: number; test: Expr; msg: Expr | null }
  | {
      t: "Try";
      line: number;
      body: Stmt[];
      handlers: Array<{ line: number; type: Expr | null; name: string | null; body: Stmt[] }>;
      orelse: Stmt[];
      finalbody: Stmt[];
    };
