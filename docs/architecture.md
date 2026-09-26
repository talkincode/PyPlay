# PyPlay 架构与协议

本文说明 PyPlay 由哪些部分组成、它们之间传递什么，以及几条不能破坏的约束。
面向要修改代码的人和 Agent；产品目标与边界见 [roadmap.md](roadmap.md)。

## 总览

```text
┌──────────────────────────── 浏览器页面（主线程）────────────────────────────┐
│  CodeMirror 编辑器   控制台 / input 框   Canvas 渲染器 ← Scene ← 绘图指令     │
│         │                 ▲    │                ▲            ▲              │
│         ▼                 │    ▼ HostEvent      │            │              │
│   router.ts ──选择──▶ ⚡ 快速引擎（src/engines/fast，主线程时间片）          │
│         │                      同一套协议：stdout / 绘图指令 / 输入请求       │
│         └────回退──────▶ 🐍 完整 Python（src/engines/pyodide）               │
└────────────────────────────────────────│───────────────────────────────────┘
                                         │ postMessage（输出、绘图指令）
                                         │ SharedArrayBuffer（输入、事件、停止）
                                         ▼
                ┌──────────── Web Worker ────────────┐
                │ Pyodide (CPython 3.14, WASM)       │
                │  python/turtle.py   ← 上游原样      │
                │  python/tkinter/    ← PyPlay 替身   │
                │  python/_pyplay_*.py               │
                └────────────────────────────────────┘
```

两个引擎对页面来说是可互换的：都实现 `src/engines/engine.ts` 的 `Engine` 接口，
都只通过下面的**绘图协议**和**输入/事件**与页面交流。

## 1. 绘图协议（`src/protocol.ts`）

协议是 Tk Canvas 的一个子集，因为 CPython 的 `turtle.py` 本来就只和 Tk Canvas 打交道：

| 指令 | 含义 |
| --- | --- |
| `create {id, kind, coords, opts}` | 新建 `line` / `polygon` / `text` / `image` 图元 |
| `coords {id, coords}` | 改坐标 |
| `config {id, opts}` | 改属性（`fill` `outline` `width` `capstyle` `text` `anchor` `font` `image`） |
| `raise` / `lower {id}` | 调整叠放次序 |
| `delete {id \| "all"}` | 删除 |
| `bg` / `window` / `title` / `scrollregion` | 背景色、海龟窗口大小、标题、滚动区域 |

- 坐标是 Tk 画布坐标：y 向下，原点在海龟窗口中心。渲染器把窗口等比缩放居中到面板里。
- 颜色是 **Tk 颜色**（约 1000 个名字 + `#rgb` 等十六进制写法），不是 CSS 颜色。
  唯一数据源是 `python/tkinter/tk_colors.json`，由 `scripts/gen-tk-colors.py` 从 Tk 源码
  `xcolors.c` 生成，并用 Tk 自己的匹配算法逐个校验。Python 侧校验和 TS 侧渲染共用它。
- `Scene`（`src/render/scene.ts`）只通过应用指令来构建；`snapshot()` 给出可比较的规范化画面，
  用于一致性测试。

两侧的 Canvas 镜像（`python/tkinter/__init__.py` 的 `Canvas` 与
`src/engines/fast/modules/tkcanvas.ts`）遵守同一条规则：**只发送真正的变化**。
`turtle.py` 在每个动画帧都会重设颜色和线宽，去重后指令量约为原来的五分之一。

## 2. 完整 Python 引擎（Pyodide）

- `python/turtle.py` 是 CPython 3.14.5 的 `Lib/turtle.py`，**一个字节都不改**
  （`tests/unit/upstream.test.ts` 校验 SHA-256）。
- `python/tkinter/` 是 PyPlay 的 tkinter 替身：实现 `turtle.py` 用到的那部分
  `Tk` / `Frame` / `Canvas` / `Scrollbar` / `PhotoImage` / `simpledialog`，
  把 Canvas 调用变成绘图指令，自身不画任何东西。
- 替身的所有 I/O 都经过 `_pyplay_host` 模块（接口写在 `python/tkinter/__init__.py` 顶部）：

  | 函数 | 说明 |
  | --- | --- |
  | `emit(cmd)` / `flush()` | 排队 / 送出绘图指令 |
  | `sleep(ms)` | 阻塞；停止时抛 `KeyboardInterrupt` |
  | `wait_event(timeout_ms)` | 阻塞等 UI 事件（`None` 为无限等待） |
  | `measure_text(text, font)` | 文字尺寸（浏览器用 OffscreenCanvas 实测） |
  | `ask_string(title, prompt)` | `textinput` / `numinput` 对话框 |
  | `screen_size()` | 虚拟屏幕 1280×800（`setup(0.5, 0.75)` → 640×600） |

  浏览器里由 `python/_pyplay_browser_host.py` 基于 JS 实现；测试里由
  `tools/reference_run.py` 的录制实现提供（虚拟时钟）。
- **为什么要 SharedArrayBuffer**：Worker 里的 Python 是同步执行的，`input()`、`time.sleep()`、
  `turtle.done()` 都需要"阻塞等待"。页面把输入、事件、停止写进 SAB 通道
  （`src/engines/channel.ts`），Worker 用 `Atomics.wait` 阻塞等待。停止按钮同时写 Pyodide 的
  interrupt buffer（纯计算循环里抛 `KeyboardInterrupt`）；2 秒内没有结束就直接终止 Worker 并重建。
- 事件循环在替身的 `_Loop` 里：`update()` 处理已到达的事件和到期的定时器，`mainloop()` 在
  没有任何绑定和定时器时返回（与脚本方式运行的 CPython 行为一致：画面保留、程序结束）。
- 这要求页面处于跨源隔离状态（COOP/COEP 头，见 `public/_headers`）。

## 3. 快速引擎（`src/engines/fast`）

PyPlay 自己的 Python 子集解释器，运行在主线程：

| 文件 | 职责 |
| --- | --- |
| `lexer.ts` / `parser.ts` / `ast.ts` | 词法、语法。子集之外的写法和**所有语法错误**都抛 `Unsupported` |
| `interpreter.ts` | 基于生成器的求值器：`yield` 挂起（输入、睡眠、等事件、时间片） |
| `values.ts` / `ops.ts` / `numbers.ts` / `format.ts` | 对象模型、运算、CPython 精确的数字打印/舍入、格式化 |
| `builtins.ts` | 内置函数与 str/list/dict/tuple 方法 |
| `modules/` | `math`、`random`（MT19937，与 CPython 同种子同序列）、`time`、`turtle`（逐行移植 `turtle.py`） |
| `subset.ts` | 运行前的静态子集判定 |
| `program.ts` | 一次运行：`resume()` 推进到下一个挂起点；报错格式与 `_pyplay_run.py` 相同 |
| `engine.ts` | 浏览器驱动：真实定时器、12ms 时间片、逐行演示 |
| `headless.ts` | 测试驱动：虚拟时钟、脚本化输入与事件 |

### 核心规则：要么和 CPython 一模一样，要么交给 CPython

快速引擎**绝不能**给出与 CPython 不同的结果。凡是做不到逐字一致的地方，一律让程序改由完整 Python 运行：

1. 运行前：`analyzeSubset()` 拒绝子集外的语法、`math/random/time/turtle` 以外的 import、
   快速引擎没有的 CPython 内置名（`set`、`open`…）、以及 CPython 有但快速引擎没实现的属性名。
   属性名的判断依据是 `cpython-attributes.json`（`scripts/gen-cpython-attrs.mjs` 在 Node 里启动
   Pyodide，收集完整 Python 引擎所用 CPython 的 `dir()`，因此与开发机平台无关）：CPython 也没有的名字（孩子的拼写错误）属于真正的
   `AttributeError`，快速引擎会给出同样的报错和 `Did you mean` 提示。
2. 运行中：遇到未实现的分支抛 `Unsupported`；JS 调用栈耗尽（约 200 层以上的递归）也按此处理。
   页面清空输出，改用完整 Python 从头重跑，并提示原因。

### 一致性测试是快速引擎的验收标准

`tests/conformance/` 中的每个程序都会：

1. 在真实 CPython 上跑 `tools/reference_run.py`（上游 `turtle.py` + tkinter 替身），得到参考结果；
2. 在快速引擎上跑 `runHeadless()`；

然后逐项比较 stdout、结束状态、异常类型/信息/行号/traceback，以及最终画面快照。
两边使用相同的虚拟时钟、输入行（`NAME.stdin`）和事件脚本（`NAME.events.json`）。
第一行为 `# expect: full-python` 的程序则断言快速引擎会拒绝它（用来锁住回退边界）。

## 4. 部署

纯静态站点，部署在 Cloudflare Workers Static Assets（`wrangler.jsonc`，没有 Worker 脚本）。
`public/_headers` 负责 COOP/COEP 和缓存。注意：`_headers` 只作用于静态资源，
将来如果加 Worker 脚本（比如 `/api/*`），它返回的响应必须自己设置这些头。

Pyodide 从同源的 `/pyodide/<版本>/` 加载（国内访问 CDN 不稳定，而且跨源隔离要求同源），
由 `scripts/prepare-runtime.mjs` 在构建时放入 `public/`，只包含实际需要的文件和裁剪后的标准库。
