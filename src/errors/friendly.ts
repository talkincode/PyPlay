import type { PyError } from "../protocol";

/**
 * Turn a Python error into a short Chinese explanation for kids.
 *
 * The original Python message is always shown as well (the UI prints the
 * traceback); this only adds a hint. Rules match on the exception type and
 * the exact CPython message, so both engines get the same explanation.
 */
export interface FriendlyError {
  title: string;
  hint: string;
}

const BUILTIN_NAMES = [
  "print",
  "input",
  "range",
  "len",
  "int",
  "float",
  "str",
  "bool",
  "list",
  "dict",
  "tuple",
  "set",
  "abs",
  "min",
  "max",
  "sum",
  "round",
  "sorted",
  "reversed",
  "enumerate",
  "zip",
  "type",
  "isinstance",
  "True",
  "False",
  "None",
  "import",
  "turtle",
  "random",
  "math",
  "time",
];

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) (dp[0] as number[])[j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const row = dp[i] as number[];
      const prev = dp[i - 1] as number[];
      row[j] = Math.min(
        (prev[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return (dp[a.length] as number[])[b.length] as number;
}

/** Closest known name (builtins + identifiers in the program), if any. */
export function suggestName(name: string, source: string): string | null {
  const idents = new Set([...BUILTIN_NAMES, ...(source.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])]);
  idents.delete(name);
  let best: string | null = null;
  let bestDist = Math.max(1, Math.floor(name.length / 3));
  for (const cand of idents) {
    const d = editDistance(name.toLowerCase(), cand.toLowerCase());
    if (d <= bestDist && (best === null || d < bestDist)) {
      best = cand;
      bestDist = d;
    }
  }
  return best;
}

export function explain(err: PyError, source: string): FriendlyError {
  const at = err.line ? `第 ${err.line} 行` : "程序里";
  const m = err.message;

  switch (err.type) {
    case "NameError": {
      const match = m.match(/name '(.+?)' is not defined/);
      if (match) {
        const name = match[1] as string;
        const s = suggestName(name, source);
        return {
          title: `${at}：Python 不认识 “${name}”`,
          hint: s
            ? `是不是想写 “${s}”？注意拼写和大小写。`
            : "检查一下拼写；如果是变量，要先赋值再使用；如果是模块里的功能，记得先 import。",
        };
      }
      break;
    }
    case "SyntaxError":
      if (/expected ':'/.test(m))
        return { title: `${at}：少了冒号 “:”`, hint: "if、for、while、def 这一行的末尾要加英文冒号。" };
      if (/unterminated string/.test(m))
        return { title: `${at}：字符串没有结束`, hint: '引号要成对出现，比如 "你好"。' };
      if (/was never closed/.test(m))
        return { title: `${at}：括号没有闭合`, hint: "每个 ( [ { 都要有对应的 ) ] }。" };
      if (/invalid character/.test(m))
        return { title: `${at}：有中文符号`, hint: "代码里的括号、引号、逗号、冒号要用英文输入法输入。" };
      if (/'(.+)' was never closed|unmatched/.test(m))
        return { title: `${at}：括号不配对`, hint: "检查括号是否一一对应。" };
      if (/Maybe you meant '==' or ':='/.test(m) || /cannot assign to/.test(m))
        return { title: `${at}：赋值写法不对`, hint: "比较两个值是否相等要用 ==，一个 = 是赋值。" };
      return { title: `${at}：语法写错了`, hint: "对照例子检查这一行（有时问题在上一行）。" };
    case "IndentationError":
    case "TabError":
      if (/expected an indented block/.test(m))
        return { title: `${at}：这里需要缩进`, hint: "冒号下面的代码要往右缩进 4 个空格。" };
      if (/unexpected indent/.test(m))
        return { title: `${at}：多缩进了`, hint: "这一行前面的空格太多了，和上一行对齐试试。" };
      return { title: `${at}：缩进没对齐`, hint: "同一块代码的缩进要一样多，建议统一用 4 个空格。" };
    case "TypeError":
      if (/can only concatenate str \(not "(int|float)"\) to str/.test(m))
        return {
          title: `${at}：文字和数字不能直接用 + 连接`,
          hint: '用 str(数字) 把数字变成文字，或者用逗号分开：print("年龄", age)。',
        };
      if (
        /unsupported operand type\(s\) for [+\-*/]+: '(int|float)' and 'str'|'str' and '(int|float)'/.test(m)
      )
        return {
          title: `${at}：数字和文字不能一起计算`,
          hint: "input() 得到的是文字，用 int(...) 或 float(...) 变成数字再计算。",
        };
      if (/missing \d+ required positional argument/.test(m))
        return { title: `${at}：调用函数时少给了参数`, hint: "看看函数定义里需要几个参数。" };
      if (/takes \d+ positional arguments? but \d+ (was|were) given/.test(m))
        return { title: `${at}：给函数的参数太多了`, hint: "看看函数定义里需要几个参数。" };
      if (/object is not callable/.test(m))
        return {
          title: `${at}：这个东西不能当函数调用`,
          hint: "是不是把变量名和函数名起重了？或者多写了括号。",
        };
      return { title: `${at}：类型不对`, hint: "检查参与运算的值是不是你以为的类型（数字、文字、列表……）。" };
    case "ZeroDivisionError":
      return { title: `${at}：不能除以 0`, hint: "除数（/、// 或 % 右边的数）变成了 0。" };
    case "ValueError": {
      const match = m.match(/invalid literal for int\(\) with base 10: '(.*)'/);
      if (match)
        return { title: `${at}：“${match[1]}” 不是整数`, hint: 'int() 只能转换像 "42" 这样的整数文字。' };
      if (/could not convert string to float/.test(m))
        return { title: `${at}：这段文字不是数字`, hint: 'float() 只能转换像 "3.14" 这样的数字文字。' };
      return { title: `${at}：值不对`, hint: "这个值的类型对，但内容不合适。" };
    }
    case "IndexError":
      return { title: `${at}：下标超出范围`, hint: "列表下标从 0 开始，最大是 长度-1。" };
    case "KeyError":
      return { title: `${at}：字典里没有这个键 ${m}`, hint: "先用 in 检查键是否存在，或用 .get()。" };
    case "AttributeError": {
      const match = m.match(/module '(.+?)' has no attribute '(.+?)'/);
      if (match) {
        return {
          title: `${at}：${match[1]} 里没有 “${match[2]}”`,
          hint: "检查拼写，比如 turtle.forward 而不是 turtle.foward。",
        };
      }
      return { title: `${at}：没有这个属性或方法`, hint: "检查点号后面的名字拼写。" };
    }
    case "ModuleNotFoundError": {
      const match = m.match(/No module named '(.+?)'/);
      if (match)
        return {
          title: `${at}：PyPlay 里没有模块 “${match[1]}”`,
          hint: "PyPlay 只带了适合学习的模块，比如 turtle、random、math、time。",
        };
      break;
    }
    case "RecursionError":
      return {
        title: `${at}：函数调用自己太多次了`,
        hint: "递归要有停止条件（比如 if level == 0: return）。",
      };
    case "TurtleGraphicsError":
      if (/bad color/.test(m))
        return {
          title: `${at}：Python 不认识这个颜色`,
          hint: '试试 "red"、"sky blue" 或 "#ff8800" 这样的颜色。',
        };
      return { title: `${at}：海龟画图出错了`, hint: m };
    case "EOFError":
      return { title: `${at}：没有收到输入`, hint: "输入被取消了。" };
    case "TclError":
      return {
        title: `${at}：画图参数不对`,
        hint: /color/.test(m) ? '这个颜色名 Python 不认识，试试 "red"、"blue" 或 "#ff8800"。' : m,
      };
  }
  return { title: `${at}：程序出错了（${err.type}）`, hint: "看看下面 Python 给出的原始提示。" };
}
