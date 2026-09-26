# PyPlay 项目画像与方向

## 项目概述

PyPlay 是给孩子（大约 8～14 岁）学习 Python 基础和海龟画图的在线极简 IDE。孩子在浏览器里写代码、点运行，
立刻看到输出和画面；老师和家长把示例或作业以链接的形式分享出去。它服务的核心诉求是：
**学的是真正的 Python**（回家用 IDLE 跑，结果一模一样），同时要**打开就能用、交互不卡、出错看得懂**。

运行方式：纯静态站点（Cloudflare Workers Static Assets），所有代码都在孩子自己的浏览器里执行。
两个可互换的引擎共用一套绘图协议：自研的快速引擎（CPython 精确子集，主线程，秒开，可逐行演示）
和完整 Python（Pyodide/CPython 3.14，Web Worker，后台加载，兜底）。

- 架构图

```text
孩子的浏览器
┌──────────────────────────────────────────────────────────────┐
│ 编辑器 · 控制台 · 画布渲染器                                   │
│      │  router：子集内 → 快速引擎；子集外/运行中越界 → 完整 Python │
│      ├──▶ ⚡ 快速引擎（主线程）                                  │
│      └──▶ 🐍 完整 Python（Worker + SharedArrayBuffer）           │
│              CPython 3.14 · 上游 turtle.py · tkinter 替身        │
└──────────────────────────────────────────────────────────────┘
        ▲ 静态文件（含同源 Pyodide，COOP/COEP 头）
Cloudflare Workers Static Assets  ←  GitHub Actions（测试全过后发布）
```

## 项目画像（目标状态）

- **真 Python 优先于一切。** 任何写法在 PyPlay 里的行为（输出、报错类型/信息/行号、画面）都与
  CPython 一致；做不到一致就交给完整 Python，而不是给出"差不多"的结果。
- **打开即用。** 首屏只加载编辑器和快速引擎；大多数入门程序不需要等待完整 Python。
- **交互像本地一样。** `input()`、方向键、鼠标、定时器动画、停止按钮都实时响应；死循环能被停止，页面永远不卡死。
- **孩子看得懂。** 报错先给中文解释和修改建议，再给 Python 原文；出错行高亮；能逐行看程序怎么执行。
- **极简。** 一个页面，一块编辑区，一块画布，一个输出区；没有账号、没有安装、没有配置。
- **可验证。** 快速引擎的正确性由与真实 CPython 的自动比对证明，而不是由人工试用证明。

品质冲突时的优先级：**与 CPython 一致 > 交互实时 > 启动速度 > 功能多少**。例如：宁可让程序回退到
完整 Python 多等两秒，也不让快速引擎给出与 CPython 不同的结果。

## 当前能力清单

- 编写与运行 Python

CodeMirror 编辑器（Python 高亮、Ctrl+Enter 运行、自动保存到浏览器）、输出面板。入口 `src/main.ts`、`src/ui/`。

- 海龟画图

两个引擎都支持 CPython `turtle.py` 的绘图、填充、圆、点、印章、文字、形状、`tracer`、多只海龟。
完整 Python 运行上游原版 `python/turtle.py`；快速引擎运行逐行移植版 `src/engines/fast/modules/turtle.ts`。
渲染器 `src/render/`。

- `input()` 与对话框

`input()` 在输出面板下方输入；`turtle.textinput/numinput` 弹出对话框。

- 键盘、鼠标、定时器事件

`onkey/onkeypress/onclick/onscreenclick/ondrag/onrelease/ontimer/mainloop/done/exitonclick`。

- 停止运行

两个引擎都能停止死循环、`sleep`、等待输入和事件循环中的程序；完整 Python 在 2 秒内无响应则重建 Worker。

- 中文报错

`src/errors/friendly.ts`：常见错误的中文标题和建议，保留原始 traceback，出错行高亮。

- 双引擎自动选择与回退

`src/engines/router.ts`、`src/engines/fast/subset.ts`：静态判定子集；运行中越界自动切换到完整 Python 重跑。
用户也可以手动指定引擎。

- 逐行演示

快速引擎按选定速度逐条语句执行并高亮当前行（`🐾 逐行演示` / `🐌 逐行慢放`）。

- 明暗主题

顶栏按钮在浅色和深色之间切换，选择记在 `localStorage`（`pyplay.theme`）。没有选择时跟随系统，选过之后就不再跟着变。
编辑器、示例库和项目列表一起变。海龟画布的纸张保持白色，和 CPython 一样。

- 分享与保存图片

分享链接把代码压缩后放在 URL 片段（`src/share.ts`），打开后存成新项目（已打开的标签页里粘贴链接也生效）；
"保存图片"下载 PNG 并存入项目的 `screenshots/`。

- 本地项目管理

每个作品是一个项目：自动保存（OPFS 存代码、缩略图、截图；IndexedDB 存元数据），最近打开排序、标签筛选、
新建、导入 `.py`、改名、复制、导出 `.py` / `.zip`、删除；关闭标签页前未保存的编辑会自动恢复。
入口 `src/app/session.ts`、`src/storage/`、`src/ui/projectPanel.ts`。

- 示例库

76 个示例，9 个分类，搜索、收藏、最近看过、学习进度；详情页（你会学到、难度、实时预览、代码、说明）确认后才
"加载到编辑器"，并存成新项目。数据在 `src/examples/`，界面在 `src/ui/exampleLibrary.ts`。
每个示例都经测试在 CPython 与快速引擎上结果一致。
其中 12 课排成一条路径（`src/learn/lessons.ts`）：每课要求改一处，运行后对照输出或画面颜色，对上才记为「做到了」。
新项目从第一课开始。逐行演示时在输出区上方显示当前能看懂的变量。

- 裁剪的 Python 运行时与部署

标准库按 `TEACHING_MODULES` 裁剪（`python/stdlib-manifest.json`），同源分发 Pyodide；
Cloudflare 静态部署，COOP/COEP 头（`public/_headers`）；CI 测试全过后自动发布（`.github/workflows/ci.yml`）。

## 非目标（铁律）

- **不做通用 tkinter / GUI 框架。** 只支持海龟画图所需的那一小块 Canvas。按钮、输入框、布局管理器等控件不做；
  它们会把项目拖进"重写 Tk"的无底洞。
- **不在服务器上执行孩子的代码。** 代码只在浏览器里运行；服务器（如果将来有）只负责存取数据和可信的作业批改。
- **快速引擎不允许"近似正确"。** 任何与 CPython 不一致的行为都是 bug；做不到一致的功能必须回退到完整 Python，
  不能为了"能跑"而放宽语义。
- **不修改上游 `turtle.py`。** 适配只发生在 tkinter 替身一侧。
- **不引入账号体系与收费功能到本仓库的核心页面。** 核心页面必须保持无登录可用。
- **不依赖第三方 CDN 运行。** 运行所需的所有文件都从同源加载。

## 方向与意图

- 更深的递归与更高的执行效率

快速引擎目前依赖 JS 调用栈，大约 200 层以上的递归会回退到完整 Python。改为显式栈的虚拟机后，
可以在主线程上支持到 CPython 的 1000 层上限，并提高循环密集型程序的速度。服务于"打开即用"。

- 更大的快速子集

在逐字一致的前提下逐步覆盖 `class`、`set`、`%` 格式化、`with` 等常见教学内容，
每一项都以一致性测试为准入条件。服务于"打开即用"和"真 Python 优先"。

- 离线可用与更快的二次打开

用 Service Worker 缓存页面与 Pyodide，让教室弱网或断网时也能使用。服务于"打开即用"。

- 可视化教学

逐行演示时已经在输出区上方显示当前几个简单变量。还没做的是调用栈/递归树，以及单步前进/后退。服务于"孩子看得懂"。

- 多设备与备份

作品目前只在本机。可以考虑：整库导出/导入（一个 zip 包含所有项目），或者在"课堂与作业"方向里提供可选的云端同步。
本地优先、无账号可用的铁律不变。

- 课堂与作业（需要后端时）

作品库、班级、作业下发与自动批改。批改在隔离环境（如 Cloudflare Dynamic Workers）中运行，
页面本身仍然无需登录。必须遵守"不在服务器上执行交互式代码"的铁律。

- 运行时体积

如有证据表明 Pyodide 体积是瓶颈，可评估自定义编译（去掉用不到的 C 扩展），前提是不增加长期维护负担。

## 完成的样子

> 当孩子打开链接就能写出第一幅海龟画，交互不卡，出错看得懂，而且老师能确信 PyPlay 教的就是 CPython 的行为时，这个项目就达成了。

- 与 CPython 的一致性由机器证明

快速引擎的每项能力都有 `tests/conformance/` 中的比对程序守护（stdout、异常、行号、traceback、最终画面），
任何回归都会在 CI 中被挡下。新增的快速引擎能力如果没有比对程序，就视为未完成。

- 用户路径由端到端测试守护

两个引擎的核心路径（绘图、输入、事件、停止、报错）和回退、逐行演示、分享都有 Playwright 测试，
在生产构建和同样的响应头下运行。

- 发布可追溯

只有全部检查通过的构建才会被发布；生成文件（颜色表、CPython 属性表、标准库清单）与其来源保持一致。

## 验收矩阵（业务能力覆盖矩阵）

> 覆盖底线（硬性规定）：
>
> 1. 每个一级功能至少有一条 Happy Path E2E。
> 2. 每个高风险功能至少覆盖一条失败路径。
> 3. 每个涉及权限的功能至少验证两种角色。
> 4. 每个会修改系统状态的操作至少验证一次失败后的恢复或回滚。
> 5. 每次新增一级业务功能，必须同步新增对应的 E2E 并更新本矩阵。

| 一级功能 | 风险级别 | Happy Path E2E | 失败路径 | 权限角色覆盖 | 失败恢复/回滚 | 证据（测试路径/用例） |
| --- | --- | --- | --- | --- | --- | --- |
| 编写与运行 Python | 中 | ✅ | ✅ | 不适用 | 不适用（持久化见"本地项目管理"） | `tests/e2e/pyplay.spec.ts`：`turtle drawing appears on the canvas`、`errors show a Chinese hint…` |
| 海龟画图 | 高（行为必须与 CPython 一致） | ✅ | ✅ | 不适用 | 不适用（只读渲染） | e2e：`turtle drawing appears on the canvas`（两引擎）；`tests/conformance/programs/turtle_*.py`（含 `turtle_errors.py`）；`tests/conformance/examples.test.ts` |
| `input()` 与对话框 | 中 | ✅ | ✅ | 不适用 | 不适用 | e2e：`input() reads what the child types`（两引擎）；conformance：`input_basic.py`、`guess_game.py`；对话框 ❌ 缺口 |
| 键盘、鼠标、定时器事件 | 中 | ✅ | ✅ | 不适用 | 不适用 | e2e：`arrow keys drive onkey handlers until Stop`（两引擎）；conformance：`turtle_keys.py`、`turtle_click.py`、`turtle_timer.py`、`turtle_exitonclick.py`；鼠标点击 e2e ❌ 缺口 |
| 停止运行 | 高（页面卡死） | ✅ | ✅ | 不适用 | ✅ | e2e：`Stop ends an infinite loop and the page stays usable`（两引擎，含停止后再次运行） |
| 中文报错 | 中 | ✅ | ✅ | 不适用 | 不适用 | e2e：`errors show a Chinese hint, the traceback and the line`（两引擎）；`tests/unit/friendly.test.ts`；conformance：`err_*.py` |
| 双引擎自动选择与回退 | 高（结果必须正确） | ✅ | ✅ | 不适用 | ✅ | e2e：`programs outside the fast subset run on full Python`、`a fast run that hits its limits restarts on full Python`；`tests/unit/share-router.test.ts`；conformance：`expect_full_*.py` |
| 逐行演示 | 低 | ✅ | ❌ 缺口 | 不适用 | 不适用 | e2e：`step mode highlights the running line` |
| 明暗主题 | 低 | ✅ | ✅ | 不适用 | ✅（记在 localStorage，刷新后仍是所选主题；非法取值退回系统） | `tests/e2e/pyplay.spec.ts`：`theme toggle switches to dark and is remembered` |
| 分享链接 | 低 | ✅ | ✅ | 不适用 | 不适用（总是新建项目） | e2e：`share link restores the program`、`Stop ends an infinite loop…`（已打开的标签页里粘贴链接）；`tests/unit/share-router.test.ts`（非法片段返回 null） |
| 保存图片 | 低 | ✅ | ❌ 缺口 | 不适用 | 不适用 | e2e：`runs leave a thumbnail and saved pictures are counted`（`tests/e2e/projects.spec.ts`） |
| 本地项目管理（OPFS + IndexedDB） | 高（孩子作品丢失） | ✅ | ✅ | 不适用 | ✅ | `tests/e2e/projects.spec.ts`：`edits are saved to OPFS and survive a reload`、`create, rename, tag, switch and delete projects`（含取消删除、删除当前项目后回落）、`export .py / .zip and import a .py file`；恢复：`an edit is not lost when the tab closes before autosave`；`tests/unit/projects.test.ts`（含 zip 由 Python `zipfile` 校验） |
| 示例库 | 中 | ✅ | ✅ | 不适用 | ✅（加载不覆盖现有项目） | `tests/e2e/library.spec.ts`：`browse, search, preview, and load into a new project`、`example preview feeds scripted input() answers`、`favorites and learning progress are remembered`、`keyboard examples can be tried inside the preview`；搜索无结果/空收藏的提示；`tests/conformance/examples.test.ts`（76 个示例 vs CPython） |
| 学习路径 | 中 | ✅ | ✅ | 不适用 | ✅（没改对不记「做到了」，改对后再运行才记下） | `tests/e2e/pyplay.spec.ts`：`a lesson counts only after the asked-for change`；`tests/unit/lessons.test.ts`（12 课原程序不通过、改一处通过）；逐行变量：e2e `step mode highlights the running line and shows variables` |
| 运行时裁剪与部署（跨源隔离） | 高（缺失则完整 Python 不可用） | ✅ | ✅ | 不适用 | ✅ | e2e：`page is cross-origin isolated`；页面在未隔离时提示并保留快速引擎（`src/main.ts`）；`pnpm check:generated`；CI 只发布测试通过的构建 |

缺口的最低期望：

- **对话框：** 补一条 `textinput` 的 e2e。
- **鼠标点击：** 补一条 `onscreenclick` 的 e2e，点击画布后断言坐标输出。
- **逐行演示失败路径：** 断言逐行演示中途停止后恢复正常速度可用。
- **保存图片失败路径：** 断言画布为空时不生成缩略图，且下载仍可用。

"权限角色覆盖"均为不适用：PyPlay 没有账号和权限体系。"失败恢复/回滚"标"不适用"的功能不修改任何持久状态；修改状态的只有本地项目管理与示例库（加载即新建项目）。
