# AGENTS.md — PyPlay

## 最高优先级

所有代码工作必须遵守 [docs/agent-coding-guidelines.md](docs/agent-coding-guidelines.md)（Agent 编码规范）。
它与本文件冲突时，以它为准；与用户的明确指示冲突时，以用户为准。

开始前先读：

- [docs/architecture.md](docs/architecture.md)：两个引擎、绘图协议、host 接口
- [docs/roadmap.md](docs/roadmap.md)：目标、非目标、验收矩阵

## 项目不变量（破坏任何一条都视为 bug）

1. **`python/turtle.py` 是 CPython 上游原文件，禁止修改。** 适配只能改 `python/tkinter/`（tkinter 替身）。升级 CPython 版本时：
   - 整体替换该文件，并更新 `python/turtle.upstream.json`；
   - 同步检查 `src/engines/fast/modules/turtle.ts` 的移植是否需要跟进。
2. **快速引擎要么与 CPython 逐字一致，要么交给完整 Python。**
   - 不允许"近似"实现。
   - 做不到一致的写法，在 `parser.ts` / `subset.ts` 中拒绝，或者在运行时抛 `Unsupported`。
   - 禁止让它产生不同的输出或报错。
3. **快速引擎的任何行为变化，都必须有 `tests/conformance/programs/` 中的比对程序证明。**
   - 新增能力就新增程序。
   - 修 bug 就先加一个在修复前会失败的程序。
   - 不许为了让比对通过而修改参考实现（`tools/reference_run.py`、`python/`）的语义，除非它与真实 Tk/CPython 的行为不符；这种情况要在提交说明里写清证据。
4. **两个引擎只通过 `src/protocol.ts` 与页面交流。** 给协议加字段时，两侧的 Canvas 镜像（`python/tkinter/__init__.py` 与 `src/engines/fast/modules/tkcanvas.ts`）必须同步修改，并保持"只发送真正的变化"这条规则。
5. **Tk 颜色只有一个数据源：`python/tkinter/tk_colors.json`。** 它由 `scripts/gen-tk-colors.py` 从 Tk 源码生成，禁止手改。
6. **生成文件禁止手改。** 需要改时，修改生成脚本或它的输入，然后运行 `pnpm gen`：
   - `python/tkinter/tk_colors.json`
   - `src/engines/fast/cpython-attributes.json`
   - `python/stdlib-manifest.json`
7. **标准库裁剪规格是 `scripts/python-stdlib.mjs` 的 `TEACHING_MODULES`。** 增删模块属于产品决策，必须同步更新 README 的"Python 裁剪规格"。
8. **运行所需的资源一律同源加载。** `_headers` 只作用于静态资源；如果新增 Worker 脚本，它必须自己设置 COOP/COEP。

## 常用命令

```bash
pnpm install
pnpm dev                 # 本地开发（已开启跨源隔离）
pnpm lint && pnpm typecheck
pnpm test                # 单元 + 一致性（需要 python3 = 3.14）
pnpm build && pnpm test:e2e
pnpm check:generated     # 生成文件是否最新
```

完成一项改动前，至少跑一遍 `pnpm lint`、`pnpm typecheck` 和 `pnpm test`。涉及页面、引擎或部署的改动，还要跑 `pnpm build && pnpm test:e2e`。

## 验收矩阵（硬性规定）

完整矩阵只维护在 [docs/roadmap.md](docs/roadmap.md#验收矩阵业务能力覆盖矩阵)。以下为 MUST 级规定：

1. 每个一级功能 **MUST** 至少有一条 Happy Path E2E（`tests/e2e/`）。
2. 每个高风险功能 **MUST** 至少覆盖一条失败路径。
3. 每个涉及权限的功能 **MUST** 至少验证两种角色（目前没有权限体系；引入时必须遵守）。
4. 每个会修改系统状态的操作 **MUST** 至少验证一次失败后的恢复或回滚。
5. 新增一级业务功能时，**MUST** 同步新增对应的 E2E，并更新 `docs/roadmap.md` 的验收矩阵，否则改动不完整。删除功能时同步移除矩阵行。

## 目录速览

| 路径 | 内容 |
| --- | --- |
| `src/main.ts`、`src/ui/` | 页面编排、编辑器、控制台 |
| `src/render/` | 场景模型、Canvas 渲染、Tk 颜色与字体 |
| `src/engines/pyodide/` | 完整 Python：Worker 与主线程客户端 |
| `src/engines/fast/` | 快速引擎：词法、语法、解释器、内置函数、模块、子集判定 |
| `python/` | 进入 Pyodide 的 Python 运行时（上游 turtle.py、tkinter 替身、运行器） |
| `tools/reference_run.py` | 一致性测试的 CPython 参考实现 |
| `scripts/` | 生成脚本、Pyodide 运行时准备 |
| `tests/unit`、`tests/conformance`、`tests/e2e` | 单元、与 CPython 比对、端到端 |
