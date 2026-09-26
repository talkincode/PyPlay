# PyPlay 🐢

**给孩子的 Python 与海龟画图练习场。** 打开浏览器就能写代码：左边编辑、右边画图，
`print`、`input`、`turtle`、方向键控制、鼠标点击、定时器动画都能用，不需要安装任何东西。

线上地址：<https://pyplay.talkincode.net>

## 特点

- **真正的 Python。** 学到的写法拿回家用 IDLE 跑，结果一模一样。
  - 海龟画图用的是 CPython 自带的 `turtle.py` 原文件（一个字节都没改）。PyPlay 只替换了它底下的 tkinter。
  - 快速引擎的每项行为都通过自动化测试与真实 CPython 逐字比对。
- **双引擎，自动选择。**
  - ⚡ **快速引擎**：PyPlay 自研的 Python 子集解释器，打开页面即可运行（约 180 KB），支持逐行演示。
  - 🐍 **完整 Python**：浏览器里的 CPython 3.14（Pyodide），在后台加载。程序超出快速引擎的范围时（`class`、`import json`、深度递归……）自动接手，并告诉孩子原因。
- **为孩子设计。**
  - 中文报错解释，例如"第 3 行：Python 不认识 “prnt”，是不是想写 “print”？"，同时保留 Python 的原始 traceback。
  - 出错的行会高亮。
  - 🐾 逐行演示：一边运行一边高亮正在执行的代码。
  - 明暗主题：顶栏一键切换，选择记在本机；没选过时跟随系统。
  - 自带示例程序：五角星、螺旋、递归树、猜数字、方向键控制、点击绘图、定时器动画。
- **📁 本地项目管理。** 每个作品都是一个项目，自动保存，不需要账号。
  - 项目列表带缩略图，最近打开的排在前面，可以按名字和标签筛选。
  - 支持新建、重命名、打标签、复制、删除，导入 `.py` 文件。
  - 可以导出单个 `.py` 文件，或者导出整个项目的 `.zip`（代码加保存过的截图）。
  - 数据存储：代码、截图和导出的资源放在浏览器的 **OPFS**（源私有文件系统），项目信息、收藏、学习进度放在 **IndexedDB**，都只保存在本机。
- **📚 示例库。** 76 个示例，分为入门、Turtle、小游戏、数学、字符串、列表、随机、函数、挑战几类，支持搜索和收藏。
  - 点开一个示例会先看到详情页：你会学到什么、难度、实时运行的效果预览、代码和说明。确认后才"加载到编辑器"，而且会存成一个新项目，不会覆盖正在写的程序。
  - 记录每个示例的学习进度（看过、已加载、运行过）。
- **分享与保存图片。** 分享链接把代码放在 URL 片段中，不经过服务器，打开后会存成新项目。"保存图片"会下载 PNG，同时把图片存进项目里。

## 快速开始

需要 Node.js ≥ 22、pnpm 11，以及 Python 3.14（用于一致性测试和生成脚本）。

```bash
pnpm install
pnpm dev            # http://localhost:5173（已开启跨源隔离）
```

常用命令：

| 命令 | 作用 |
| --- | --- |
| `pnpm build` | 准备 Pyodide 运行时、类型检查、构建到 `dist/` |
| `pnpm test` | 单元测试 + 一致性测试（快速引擎 vs 真实 CPython） |
| `pnpm test:e2e` | Playwright 端到端测试（先 `pnpm build`） |
| `pnpm lint` / `pnpm typecheck` | Biome / TypeScript 检查 |
| `pnpm gen` | 重新生成颜色表、CPython 属性表、标准库清单 |
| `pnpm check:generated` | 确认生成文件是最新的（CI 会执行） |
| `pnpm preview` | 用 `wrangler dev` 按生产方式预览 `dist/` |

代码结构、两个引擎和本地存储的工作方式见 [docs/architecture.md](docs/architecture.md)。

## 部署

站点是纯静态的，部署在 Cloudflare Workers Static Assets，域名为 `pyplay.talkincode.net`（见 `wrangler.jsonc`）。

- **CI 自动发布：** 推送到 `main` 后，[CI](.github/workflows/ci.yml) 依次跑完 lint、类型检查、生成文件检查、单元与一致性测试、构建和 E2E，全部通过后把同一份 `dist/` 发布到 Cloudflare。
- **发布凭据：**
  - Secret `CLOUDFLARE_API_TOKEN`：`talkincode` 组织已经提供了组织级 secret。如需单独配置，用 Cloudflare 的 "Edit Cloudflare Workers" 模板创建 token，作用范围限定为本账号和 `talkincode.net` 这个 zone。
  - Variable `CLOUDFLARE_ACCOUNT_ID`：已在仓库中设置。
  - 两者任一缺失时，发布步骤会明确失败并提示。
- **手动发布：** `pnpm build && pnpm deploy`（使用本机 `wrangler login` 的身份）。
- **跨源隔离：** COOP/COEP 响应头来自 `public/_headers`。完整 Python 引擎的 `input()`、键盘事件和停止按钮都依赖跨源隔离。如果 PyPlay 被嵌进别的网页的 iframe，完整 Python 会不可用（页面会提示），但快速引擎仍然正常。

## Python 裁剪规格

完整 Python 引擎基于 **Pyodide 314.0.7（CPython 3.14.2）** 的 npm 发行包。PyPlay 不重新编译 Pyodide，只做"少带东西"：

### 实际发布的文件

| 文件 | 原始大小 | brotli 后 | 说明 |
| --- | ---: | ---: | --- |
| `pyodide.asm.wasm` | 9.60 MB | 2.77 MB | CPython 解释器本体，未修改 |
| `python_stdlib.zip` | 0.85 MB | 0.84 MB | **裁剪后的标准库**（官方为 2.55 MB） |
| `pyodide.asm.mjs` | 1.25 MB | 0.21 MB | Emscripten 胶水代码 |
| `pyodide-lock.json` | 0.12 MB | 0.02 MB | 包索引（加载器需要；不附带任何包文件） |
| `pyodide.mjs` | 18 KB | 6 KB | 加载器 |
| PyPlay Worker（含 `turtle.py` 与 tkinter 替身） | 0.21 MB | 0.04 MB | |

- **只用快速引擎时：** 首屏约 180 KB（brotli，包括编辑器）。
- **完整 Python：** 在页面空闲时于后台加载，合计约 3.9 MB。所有文件路径都带版本号，按 `immutable` 永久缓存。
- **不附带的东西：**
  - Pyodide 的第三方包（numpy、pandas 等），因此 `import numpy` 会报 `ModuleNotFoundError`。
  - micropip，也就是不能在线安装包。
  - Pyodide 发行包里的控制台页面、source map 和类型声明。

### 标准库怎么裁

裁剪规格就是 `scripts/python-stdlib.mjs` 里的 **`TEACHING_MODULES`**，也就是孩子可以 `import` 的模块：

> `turtle` `random` `math` `cmath` `time` `datetime` `calendar` `string` `textwrap` `re` `json`
> `collections` `itertools` `functools` `operator` `copy` `heapq` `bisect` `fractions` `decimal`
> `statistics` `dataclasses` `enum` `typing`

保留哪些文件不靠手工挑选，而是实际运行得出：

1. 在 Node 里启动真实的 Pyodide（带完整标准库），加载 PyPlay 的运行时，逐个 import 上述模块，再运行几段冒烟程序，把海龟绘图、报错格式化、递归错误、f-string 这些会触发延迟导入的路径都走一遍；
2. 记录实际加载的每一个标准库文件，连同 Pyodide 自身启动需要的文件，写入 **`python/stdlib-manifest.json`**（纳入版本控制，每次修改都在代码审查中可见）；
3. 构建时，`scripts/prepare-runtime.mjs` 按清单从官方 `python_stdlib.zip` 中原样复制这些条目，不重新压缩，生成新的 zip。

结果是 614 个条目缩减到 148 个文件（2.55 MB → 0.85 MB）。被去掉的包括 `sqlite3`、`email`、`http`、`urllib`、`xml`、`unittest`、`multiprocessing`、`pdb`、`pydoc`、`doctest`、真正的 `tkinter`，以及 `utf-8` 以外的编码。

- **行为：** import 被裁掉的模块会得到标准的 `ModuleNotFoundError`，PyPlay 会附上中文说明"PyPlay 只带了适合学习的模块"。
- **修改规格：** 编辑 `TEACHING_MODULES`，运行 `node scripts/python-stdlib.mjs --write`，然后提交新的清单。CI 会用 `pnpm check:generated` 确认清单与规格一致，升级 Pyodide 版本时也必须重新生成。

### 快速引擎支持的子集

快速引擎只运行它能**与 CPython 逐字一致**的程序，其余程序全部交给完整 Python。目前支持：

- **语法：**
  - 赋值、增量赋值、元组解包；`if`/`elif`/`else`、`while`/`for`（含 `else`）、`break`/`continue`
  - `def`（带默认值和关键字参数）、`lambda`、`global`、递归
  - `try`/`except`/`else`/`finally`、`raise`、`assert`、`del`
  - 列表推导式和生成器表达式、f-string（完整的格式说明符）
- **类型：** `int`（任意精度）、`float`、`bool`、`str`、`list`、`tuple`、`dict`、`range`、`None`，以及常用内置函数和这些类型的常用方法。
- **模块：**
  - `math`
  - `random`：与 CPython 相同的梅森旋转算法，同一个种子产生同样的序列
  - `time`
  - `turtle`：逐行移植 CPython 的 `turtle.py`，包括画线、填充、圆、点、印章、文字、形状、`tracer`、键盘/鼠标/定时器事件、`textinput`
- **交给完整 Python 的情况：**
  - `class`、`with`、`set`、字符串 `%` 格式化、其他模块
  - 快速引擎没有实现、但 CPython 确实存在的方法
  - 约 200 层以上的递归
  - 所有语法错误（这样孩子看到的是 CPython 原汁原味的 `SyntaxError`）

## 质量与验收

- 功能清单、非目标和**验收矩阵**见 [docs/roadmap.md](docs/roadmap.md)。新增一级功能时必须同步补充 E2E 测试，并在矩阵里登记，详见 [AGENTS.md](AGENTS.md)。
- 快速引擎的任何行为变化都必须由 `tests/conformance/` 中与真实 CPython 的比对来证明。

## 许可

PyPlay 以 MIT 许可发布。第三方代码：

- `python/turtle.py` 来自 CPython，适用 PSF 许可证；
- `data/tk/xcolors.c` 来自 Tcl/Tk，适用 Tcl/Tk 许可证；
- Pyodide 适用 MPL-2.0 许可证。

详见 [THIRD_PARTY.md](THIRD_PARTY.md)。
