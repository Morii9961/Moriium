# ADR 0001：vNext Phase 1 隔离原型尖峰

> 状态：**已获 Morii 批准（2026-08-29）；隔离原型获准，生产合同不变**
> 日期：2026-08-29
> 起草：Claude
> 审查：Claude 自审（Enouia 额度耗尽，见 1.1）
> 上级依据：[`AGENTS.md`](../AGENTS.md)、[`vnext-architecture-plan.md`](vnext-architecture-plan.md) 第 7 节 Phase 1、[`enouia-todo.md`](enouia-todo.md) 01 节、[`claude-vnext-handoff.md`](claude-vnext-handoff.md)

## 1. 授权状态

最初的开工批准来自 Codex 并由 Morii 转述。按 `AGENTS.md`「直接来自 Morii 的指示优先」，协作 agent 之间不能互相授予这一层授权，因此当时本 ADR 只交付文档。

**2026-08-29，Morii 本人批准本 ADR**，并明确：隔离原型获准，生产合同不变。同时定夺了第 8 节的三项未决问题，见该节。

开工前置：

1. ~~Morii 本人确认批准范围~~ — **已完成**；
2. ~~Enouia 完成交叉审查~~ — **改为 Claude 自审，已完成**，见 1.1；
3. Phase 0 的虚构 fixture corpus 就位 — **未完成，转由 Claude 承担**，是 Phase 1 的第一件事。

第 3 项是硬前置：两个原型必须吃同一套 fixture，否则 A/B 比较不成立。

本 ADR 不修改 `AGENTS.md` 的静态生产合同。改写生产合同属于 Phase 5 ADR 的职责。Morii 的批准覆盖隔离原型，不覆盖生产迁移。

### 1.1 Enouia 退出带来的变化

Enouia 额度耗尽，退出本项目。原定的双 agent 分工作废，Claude 承担全部切片，包括原属 Enouia 的 Phase 0 基线、fixture corpus、原型 A、摄影与灯箱验收。

**这削弱了本 ADR 原本依赖的一项质量机制。**交叉审查的价值在于审查者不共享作者的盲点；自审不具备这个性质。已做的补偿是：把可机器验证的部分尽量做成命令与测试，让结论由输出而不是判断承担——第 9 节的核验记录就是按这个原则写的。不能机器验证的部分（架构取舍、A/B 主观体验）现在只有 Morii 一个独立视角，Morii 在 Phase 1 结束时的实际操作因此变得更关键，不能省略。

自审已发现并修复的问题记录在第 12 节，避免「自审 = 没问题」这种无信息量的结论。

原定「不同时编辑同一文件」的防撞规则失去意义，但 3.2 的目录划分保留：它现在的作用是让 A、B 与共享契约的边界在代码里保持清晰，而不是分配写权限。

## 2. 已核验的前置事实

以下为本轮在本机实测所得，不是记忆或转述：

| 事实 | 值 | 影响 |
| --- | --- | --- |
| Node | `v24.15.0` | 见下 |
| `node:sqlite` | 免 flag 可用，导出 `DatabaseSync`、`StatementSync`、`Session`、`backup`；已完成建表、写入、读取往返 | 原型 B **不需要**任何数据库依赖 |
| `crypto.scrypt` | 内置 | 口令哈希**不需要** argon2 或 bcrypt 依赖 |
| `node:test` | 内置，且已是本项目 `pnpm test` 的运行器 | 测试**不需要**新依赖 |
| `astro/zod` | `src/content.config.ts` 已在用 | 共享 schema **不需要** zod 依赖 |
| pnpm | `11.22.0`，与 `packageManager` 声明一致 | |
| `.npmrc` 的 `save-exact` | pnpm 11 下**已不生效**，等效设置是 `pnpm-workspace.yaml` 的 `saveExact` | 精确锁版本不能依赖 `.npmrc`；嵌套 workspace 必须自己写 `saveExact`，见 3.1 与第 10 节 |
| `pnpm-workspace.yaml` | 仅包含根目录 | `prototypes/` 天然在根 workspace 之外，可自建嵌套 workspace 而不污染根 lockfile |
| `pnpm-workspace.yaml` 的 `allowBuilds` | 仅放行 `esbuild`、`sharp` | pnpm 11 默认拦截 lifecycle script。原型的 Vite 链路需要 `esbuild`，但只写进 `prototypes/` 自己的 workspace 配置，生产文件仍不改 |
| 生产 Markdown 管线 | `astro.config.mjs` 组合 `remarkMath`、`remarkDirective`、`remarkMoriiumDirectives`、`rehypeKatex`、`rehypeMoriiumContent` | 原型 A 可直接相对路径引用，不重写解析器 |

工作树核验：分支 `main`，HEAD `64ac315`。当前未提交改动分两组，互不重叠：`AGENTS.md` 与 `CLAUDE.md` 是 Claude 本轮的技能路由配置；`docs/architecture.md`、`docs/design-system.md`、`docs/enouia-todo.md`、`docs/claude-vnext-handoff.md`、`docs/vnext-architecture-plan.md` 是 Enouia 本轮的 vNext 规划。

构建基线本轮已由 Claude 重跑确认，与 `vnext-architecture-plan.md` 记录的 Enouia 2026-08-29 11:50 结果一致：60 个 Astro 文件 0 错误 0 警告 0 提示、30/30 测试通过、46 个静态页面、本地链接与公开树审计通过。完整命令与输出见第 9 节。

## 3. 决策

### 3.1 隔离边界：嵌套 workspace

按 Morii 定夺，原型使用**自己的嵌套 workspace**：`prototypes/` 持有独立的 `pnpm-workspace.yaml`、`package.json` 与 `pnpm-lock.yaml`，把 `studio-a`、`admin-b`、`shared` 作为它自己的 workspace 成员。根 `pnpm-workspace.yaml` 保持 `packages: [.]` 不变，因此 `prototypes/` 天然落在根 workspace 之外。

```text
E:\Moriium\
├── pnpm-workspace.yaml        packages: [.]        ← 不改
├── pnpm-lock.yaml                                  ← 不改
└── prototypes\
    ├── pnpm-workspace.yaml    packages: studio-a, admin-b, shared
    ├── pnpm-lock.yaml         ← 原型自己的锁文件
    ├── studio-a\
    ├── admin-b\
    └── shared\
```

此结构已在仓外副本用 pnpm `11.22.0` 实测验证（第 9 节）：`pnpm -C prototypes root -w` 解析到 `prototypes/node_modules` 而非父级；`pnpm -C prototypes install` 报告 `Scope: all 4 workspace projects`；只生成 `prototypes/pnpm-lock.yaml`，父目录不产生任何锁文件或 `node_modules`。上一版标注的「pnpm 是否会把子目录并入 workspace」这一未验证项就此关闭。

据此，Phase 1 期间以下生产文件保持零改动：`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`astro.config.mjs`、`src/**`、`.github/**`、`deploy/**`。

`.gitignore` 现有的 `node_modules/` 规则在任意深度生效，无需新增条目；原型的数据目录另行忽略，见 3.5。

**嵌套 workspace 必须自带配置，父仓库的配置不会继承下来。** `prototypes/pnpm-workspace.yaml` 至少要写：

```yaml
packages:
  - studio-a
  - admin-b
  - shared

enableGlobalVirtualStore: false

saveExact: true

allowBuilds:
  esbuild: true
```

`saveExact` 承担 `AGENTS.md`「Lock exact versions」的要求；`allowBuilds` 是因为 pnpm 11 默认拦截依赖的 lifecycle script，而 `esbuild` 带 `postinstall: node install.js`，Vite 链路会用到它。两项都已实测，见第 9 节与第 10 节。

`enableGlobalVirtualStore: false` 是建骨架时补上的，本 ADR 初稿漏了它。根 `pnpm-workspace.yaml` 显式写了这一条，注释写明意图是让本项目独立于机器级虚拟 store；嵌套 workspace 不继承父配置，不重写就只能靠 pnpm 的默认值兜住。实测虚拟 store 确实落在 `prototypes/node_modules/.pnpm`，但那是默认行为而非声明，与根仓库刻意声明它的理由相抵触，因此补齐。

### 3.2 目录职责

Enouia 退出后写权限全部归 Claude，这张表不再分配权限，而是固定模块边界：改动共享契约时必须同时检查两个消费者，不能只改 B 顺手把 A 带坏。

| 路径 | 职责 | 说明 |
| --- | --- | --- |
| `prototypes/studio-a/**` | 原型 A | 本地 Markdown Studio |
| `prototypes/admin-b/**` | 原型 B | 全栈 Admin 垂直切片 |
| `prototypes/shared/**` | 双向依赖点 | 内容契约、schema、DTO、错误模型。改动必须同时核对 A 与 B |
| `prototypes/fixtures/**` | 只读输入 | Phase 0 产物，两个原型都不得写回 |
| `docs/adr-*.md` | 决策记录 | 本文件及后续 ADR |
| `docs/enouia-todo.md`、`docs/vnext-architecture-plan.md` | Enouia 遗留文档 | 保留为历史依据。若与本 ADR 冲突，以本 ADR 为准，不就地改写 |
| `src/**` 与根配置 | Phase 1 冻结 | 需要改动时先停下来提出 |

### 3.3 依赖决策

核心结论是**把能力从依赖挪回运行时内置**。Node 24 的内置 sqlite、scrypt、test runner，加上 Astro 自带的 zod，消除了这类原型通常要引入的数据库驱动、ORM、口令哈希库和测试框架四类依赖。

原型 A 的新依赖数为 **0**：用 `node:http` 起本地服务，用相对路径调用生产 remark/rehype 管线，用根 `node_modules` 里已有的 unified 生态。

原型 B 的新依赖是编辑器一族加 Vue 3 工具链。Morii 已定夺 Admin B 使用 **Vue 3**：

| 包 | 版本 | 用途 | 备注 |
| --- | --- | --- | --- |
| `vue` | `3.5.42` | Admin 前端框架 | 无 native build |
| `@tiptap/vue-3` | `3.30.5` | Tiptap 的官方 Vue 3 绑定 | 免去自行封装编辑器组件 |
| `@tiptap/core` | `3.30.5` | 编辑器内核 | 无 native build |
| `@tiptap/pm` | `3.30.5` | ProseMirror 封装 | `@tiptap/core` 的 peer |
| `@tiptap/starter-kit` | `3.30.5` | 基础节点与 mark | |
| `@tiptap/markdown` | `3.30.5` | Markdown 双向转换 | **官方标注 Beta**，本 ADR 不预设保真 |
| `@tiptap/static-renderer` | `3.30.5` | 服务端可信渲染候选 | 仅在 round-trip 通过后才评估 |
| `vite` | `8.2.2` | Vue SFC 构建与开发服务器 | 传递依赖 `esbuild` 带 `postinstall`，需 `allowBuilds` |
| `@vitejs/plugin-vue` | `6.0.8` | SFC 编译 | |

版本为 2026-08-29 向 npm registry 实查所得。注意 `@tiptap/extension-markdown` 不存在，第三方 `tiptap-markdown@0.9.0` 与官方 `@tiptap/markdown` 是两个包，只用官方那个。

Vue 与 Vite 只服务 `prototypes/admin-b/`。公开站 `src/**` 不引入任何 UI 框架，`AGENTS.md` 的这条工程约束在 Phase 1 内不变。

以下不在 Phase 1 引入，理由是内置能力已覆盖，或决策尚未做出：`better-sqlite3`（`node:sqlite` 覆盖，且需 native build）、`drizzle-orm`（原型规模不需要 ORM，直接写 SQL 更便于审计迁移语义）、`hono`（`node:http` 覆盖）、`@astrojs/node`（Phase 1 不接 Astro 路由）、任何口令哈希库（scrypt 覆盖）。

因为 Vue 进入了 B，`vercel-react-best-practices` 与 `vercel-composition-patterns` 在本仓库仍然没有适用对象。它们留在技能路由表里，但 Phase 1 不触发。

### 3.4 原型 A 范围

本地 Markdown 编辑器、frontmatter 表单、生产同源预览。

- 直接读写 `prototypes/fixtures/posts/`，**不碰** `src/content/posts/`；
- 预览调用生产管线本体，不维护第二套近似解析器；
- 文件写入使用临时文件加原子替换；
- 只改本地工作树，不动 Git index，不 commit，不 push；
- 媒体导入必须过 `scripts/sanitize-media.mjs` 闸门，原图不可写。

### 3.5 原型 B 范围

单一作者登录、Tiptap 编辑、自动保存、数据库内容版本、权限草稿预览、测试发布与回滚。

- 存储用 `node:sqlite`，库文件放在 `prototypes/admin-b/.data/`，加入 `.gitignore`。按 Morii 定夺，**`node:sqlite` 只是尖峰工具，不构成生产选型**：它的作用是让 B 在零依赖、零 native build 的前提下尽快跑通状态机与版本语义。若 B 在 Phase 5 胜出，生产数据库与访问层重新开放评估，届时可以是另一个 SQLite 驱动、另一种数据库或 ORM，本 ADR 不为其背书。因此 B 的数据访问代码必须把 SQL 收在一个薄存储层内，不让 `node:sqlite` 的 API 形状渗进业务逻辑，否则换实现的成本会被低估；
- canonical content 在 Phase 1 期间**仍是 Markdown**。数据库保存 Markdown 正文与版本元数据；Tiptap JSON 只作为编辑器状态并存，用于度量 round-trip 丢失，不取代真源。切换 canonical 需要另一份迁移 ADR；
- 状态语义：新文章默认草稿；编辑产生新草稿版本，不覆盖当前公开版本；自动保存只写未发布版本；
- 发布是显式动作，先跑内容、媒体、翻译关系校验，展示将要公开的差异，再在事务内原子切换公开版本，并留审计记录；
- 回滚可指向任一历史版本，同样原子，同样留审计记录。

### 3.6 共享契约

`prototypes/shared/` 收敛两个原型都要用的东西：frontmatter schema（复用 `astro/zod`，与 `src/content.config.ts` 同源规则）、三语与 `translationKey` 关系、自定义内容块清单与 feature marker、媒体 asset 元数据形状、错误模型。

依赖方向固定：`shared` 只依赖普通 TypeScript 与 `astro/zod`，不反向引用任何一个原型。

## 4. A/B 验收任务与评分表

两个原型跑同一套任务、同一套 fixture。任务由 Morii 实际操作，Claude 记录两侧的可测量项。评分表必须在 Morii 操作前定稿，避免事后按结果反向调整口径。

| 编号 | 任务 | A 的形态 | B 的形态 |
| --- | --- | --- | --- |
| T1 | 进入写作环境 | 启动本地 Studio | 作者登录 |
| T2 | 新建一篇中文文章并填全 frontmatter | 表单加文件写入 | 表单加数据库草稿 |
| T3 | 正文写入全部高级内容块 | 源码编辑 | Tiptap 加必要的源码块 |
| T4 | 自动保存后模拟中断并恢复 | 杀进程后重开 | 杀进程后重开 |
| T5 | 预览与生产渲染逐项比对 | 同源管线预览 | 同源管线预览 |
| T6 | 补一篇日语翻译，确认英语显示为不可用 | 同 `translationKey` | 同 `translationKey` |
| T7 | 导入一张图片并过隐私闸门 | sanitize 后写入 | sanitize 后写入 |
| T8 | 发布到测试目标，然后回滚 | 测试分支上的 Git 流程 | 显式发布动作加版本回滚 |
| T9 | 在 375 CSS 像素宽度下完成一次小修改 | 同 | 同 |
| T10 | 故障演练 | 磁盘写入失败、文件被占用 | 数据库锁、API 断开 |

T3 的内容块清单取自 `markdown-reference.md`：代码 fence metadata、行内与块级数学、Mermaid、admonition（含 GitHub 风格 callout）、spoiler、`::github`、`::music`、`::video`、图片 alt 与 caption，以及一段中日英混排标点。

评分维度每项记录实测值，不记录主观印象：任务耗时、点击与按键数、内容保真（round-trip 丢失项计数）、三语关系正确性、媒体隐私闸门是否可被绕过、错误恢复成功率、预览与生产渲染的差异项数、发布延迟、新增安全面、维护成本（新依赖数与新增运维项）。

硬性否决项，任一出现则该原型在该维度直接不合格：草稿泄漏到公开路由、RSS、Sitemap 或搜索索引；媒体闸门可绕过；口令或明文进入日志或磁盘非预期位置；发布不可回滚。

## 5. 安全边界

**fixture 与私密内容**：全部 fixture 为人工编写的虚构数据。加密 fixture 只用测试口令与测试密文。原型在任何情况下不读取 `.private/posts/`、真实口令、原始照片，也不写入 `src/content/`。

**本地绑定不构成安全模型**。除了只监听 `127.0.0.1`，两个原型都必须实现：`Origin` 与 `Host` 校验、状态变更请求的 CSRF token、批准的文件根白名单、路径规范化之后再校验（拒绝 `..` 与绝对路径穿越），以及 symlink 与 Windows reparse point、junction 的越界检查。最后一项在本机尤其要测，NTFS junction 不是 symlink，容易漏。

**原型 B 追加**：scrypt 口令哈希并记录 salt 与参数、会话 cookie 置 `HttpOnly` 与 `SameSite=Strict`、登录失败速率限制、对象级授权（草稿不可越权读取）、审计日志记录发布与回滚。本地 http 下无法用 `Secure` 与 `__Host-` 前缀，这是与生产的已知差异，须在结论中标注，不得当作已解决。

**日志**：不打印口令、明文、`.private/` 路径。

**测试必须证明**而不是声明：草稿不出现在任何公开输出中；媒体闸门在绕过尝试下失败；路径穿越被拒绝。

## 6. 回退方式

分三级，级别越低影响越小：

- **L1，预期路径**：删除 `prototypes/` 目录。因为根 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`astro.config.mjs`、`src/**` 全程零改动，生产站不受影响，无需 revert 任何提交。
- **L2**：若 Phase 1 中确实需要改动某个根配置，例如某依赖意外需要 `allowBuilds` 放行，该改动单独成一次提交、单独说明，回退即 `git revert` 该提交。本 ADR 的依赖选择就是为了让 L2 不发生。
- **L3**：生产站的回退基线始终是 HEAD 通过 `pnpm verify`。Phase 1 不改变部署合同，`deploy/` 与 CI 不动，`docs/deployment.md` 描述的发布与手动回滚流程保持有效。

原型 B 自身的数据回退由内容版本表承担，与仓库回退无关。

## 7. 明确不做

- 不接入生产路由，不迁移正式文章；
- 不读取真实 `.private/posts/`、真实口令、原始照片；
- 不改写 `AGENTS.md` 的静态生产合同；
- 不 commit、push、部署、发布；
- 不覆盖 Morii 的未提交改动；
- 不在 Phase 1 把 canonical content 从 Markdown 切成 JSON；
- 不引入 UI 框架到公开站 `src/`。

## 8. 未决问题

Morii 已于 2026-08-29 定夺前三项：

1. **Admin B 的前端框架** — **已定：Vue 3**（`3.5.42`），配 `@tiptap/vue-3` 官方绑定与 Vite 工具链。依赖与工具链见 3.3。
2. **账户对象** — **已定：Phase 1 只做 Morii 的作者账户**。读者账户不进 Phase 1，留到 Phase 5 结合明确用户价值再评估。
3. **canonical content** — **已定：Phase 1 保持 Markdown 为真源**。Tiptap JSON 只作为编辑器状态并存，用于度量 round-trip 丢失。切换 canonical 仍需另一份迁移 ADR。

仍待定夺，不阻塞开工：

4. **发布新鲜度**：发布后秒级可见是否是硬需求，会影响 Phase 5 对 Hybrid 逐路由策略的取舍。这一项等两个原型的实测发布延迟出来后再判断更有依据。

此外由 Morii 定夺、已并入正文的还有：原型采用嵌套 workspace（3.1），`node:sqlite` 仅作尖峰工具而非生产选型（3.5）。

## 9. 本轮核验记录

运行时与依赖核验：

```text
git status --short --branch          → main，改动如第 2 节所列
node -v                              → v24.15.0
require('node:sqlite')               → DatabaseSync, StatementSync, Session, constants, backup
node:sqlite 建表/写入/读取往返        → { a: 1 }
node:sqlite ExperimentalWarning      → 未出现（Node 24.15.0 下 require 与 import 均无告警）
crypto.scrypt / crypto.webcrypto     → function / object
pnpm -v（PATH 与仓库内）              → 11.22.0，与 packageManager 声明一致
npm view vue version                 → 3.5.42
npm view @tiptap/core version        → 3.30.5
npm view @tiptap/vue-3 version       → 3.30.5
npm view @tiptap/markdown version    → 3.30.5
npm view @tiptap/static-renderer     → 3.30.5
npm view vite version                → 8.2.2
npm view @vitejs/plugin-vue version  → 6.0.8
npm view @astrojs/node version       → 11.1.4
npm view drizzle-orm version         → 0.45.2
npm view hono version                → 4.13.5
npm view esbuild scripts             → { postinstall: 'node install.js' }
npm search tiptap markdown           → 官方包为 @tiptap/markdown；@tiptap/extension-markdown 不存在
```

嵌套 workspace 核验，在仓库外的临时副本上进行，复制了根 `pnpm-workspace.yaml`（`packages: [.]`）与 `packageManager: pnpm@11.22.0`：

```text
pnpm -C prototypes -v                → 11.22.0
pnpm -C prototypes root -w           → …\prototypes\node_modules（不是父级）
pnpm -C prototypes install           → Scope: all 4 workspace projects
生成的锁文件                          → 只有 prototypes/pnpm-lock.yaml；父目录无锁文件、无 node_modules
```

`saveExact` 归属核验，同一副本内逐项对照：

```text
.npmrc(save-exact=true) 放 prototypes/        → pnpm add nanoid 写入 "^6.0.1"
.npmrc(save-exact=true) 放 prototypes/admin-b/ → pnpm add nanoid 写入 "^6.0.1"
pnpm-workspace.yaml 写 saveExact: true         → pnpm add nanoid 写入 "6.0.1"
```

`engineStrict` 归属核验，构造 `engines.node: ">=99.0.0"` 的临时包：

```text
.npmrc(engine-strict=true)              → [WARN] Unsupported engine，安装仍然 Done
pnpm-workspace.yaml 写 engineStrict:true → ERR_PNPM_UNSUPPORTED_ENGINE，安装中止
```

结论：pnpm 11.22.0 下这两项都必须写在 `pnpm-workspace.yaml`，`.npmrc` 中的等价设置分别是「完全无效」和「降级为警告」。修复见第 10 节。

修复后在**仓库内**的实测与还原：

```text
git status package.json pnpm-lock.yaml   → 干净，可安全测试
pnpm add nanoid --lockfile-only          → package.json 写入 "nanoid": "6.0.1"（精确）
git checkout -- package.json pnpm-lock.yaml → 两文件恢复干净，nanoid 已移除
```

修复后的完整项目验证：

```text
pnpm verify                → 退出码 0（&& 链全部通过）
pnpm check                 → Result (60 files): 0 errors, 0 warnings, 0 hints
pnpm test                  → tests 30 / pass 30 / fail 0
astro build                → 46 page(s) built
check-links                → Built-site local links resolve.
audit-public-tree          → 无私密源路径、无退役保护内容、无口令 frontmatter
```

`pnpm verify` 的后台输出当时经 `tail -60` 截断，因此 `astro check` 与 `pnpm test` 的具体数字是随后单独重跑取得的；退出码 0 已足以证明整条 `&&` 链通过。Vite 的大分包警告本轮未捕获到输出，不能据此断言它已消失，仍留在 Phase 0 的体积测量清单里。

第一轮曾把 pnpm 报成 `10.33.0`，那是临时副本缺少 `packageManager` 字段导致 corepack 回退所致，补上字段后为 `11.22.0`。真实仓库始终是 `11.22.0`，不存在版本不符问题。

本轮**未**运行 `pnpm verify`、`pnpm build`、`pnpm test`，未在仓库内安装任何依赖，未创建 `prototypes/` 目录，未 commit。所有 workspace 实验均在仓库外的临时目录进行并已删除。

## 10. 已修复：根 `.npmrc` 的 pnpm 设置在 pnpm 11 下已失效

这不属于 Phase 1 原本的范围，是在核验嵌套 workspace 配置时撞到的。Morii 指示单独修复，已完成。

**问题**：根 `.npmrc` 原本写着 `save-exact=true` 与 `engine-strict=true`。pnpm `11.22.0` 下这两条都不再按原意生效：

| 设置 | `.npmrc` 中的实际行为 | `pnpm-workspace.yaml` 中的行为 |
| --- | --- | --- |
| `save-exact` / `saveExact` | 完全忽略，`pnpm add` 写入 `^` 范围 | 生效，写入精确版本 |
| `engine-strict` / `engineStrict` | 降级为 `[WARN] Unsupported engine`，安装照常完成 | 生效，报 `ERR_PNPM_UNSUPPORTED_ENGINE` 并中止 |

两条都由对照实验确认，命令与输出见第 9 节。方向与本仓库既有做法一致：`enableGlobalVirtualStore` 和 `allowBuilds` 早就放在 `pnpm-workspace.yaml` 里。

**影响**：现有依赖全是精确版本，所以现状未被破坏。风险在将来——此后任何一次 `pnpm add` 都会写入 `^` 范围，与 `AGENTS.md`「Lock exact versions」相抵触，且不会有任何报错。`engine-strict` 失效则意味着 Node 或 pnpm 版本不符时只警告不拦截，`engines` 字段形同虚设。

**修复**：`saveExact: true` 与 `engineStrict: true` 迁入根 `pnpm-workspace.yaml`；`.npmrc` 保留为注释，说明这两条设置去了哪里，避免下一个读者继续信任失效配置。

**验证**：在仓库内实跑 `pnpm add nanoid --lockfile-only`，写入 `"nanoid": "6.0.1"`（精确，无 `^`），随后 `git checkout --` 还原 `package.json` 与 `pnpm-lock.yaml`，两文件回到干净状态。修复后 `pnpm verify` 全链路通过。

**注意**：`engineStrict: true` 是行为收紧。此后 Node 或 pnpm 版本超出 `engines`（`node >=24 <25`、`pnpm >=11.22 <12`）时安装会**直接失败**而不是警告。CI 使用 `.nvmrc` 的 Node 24 与 `packageManager` 的 pnpm 11.22.0，均在范围内，已确认不受影响。将来升级 pnpm 到 12 时必须同步改 `engines`，否则本地与 CI 都会安装失败——这是恢复原本意图的代价，不是回归。

## 11. 一手来源

Astro 与 Tiptap 的行为判断继承自 [`vnext-architecture-plan.md`](vnext-architecture-plan.md) 第 10 节，访问日期 2026-08-29，本 ADR 未重新核验其中的官方文档链接。本 ADR 新增的一手事实全部来自第 9 节的本机实测与 npm registry 实查。

`@tiptap/markdown` 的 Beta 状态取自该计划文档引用的 [Tiptap Markdown](https://tiptap.dev/docs/editor/markdown)。Phase 1 要做 round-trip corpus，理由正是不预设它保真。

## 12. 自审记录

Enouia 退出后由 Claude 自审。以下是自审**实际改掉**的问题，不是确认清单。

| # | 问题 | 严重度 | 处理 |
| --- | --- | --- | --- |
| 1 | `AGENTS.md` 的 `ui-ux-pro-max` 示例里硬编码了 `C:/Users/Morii/...` 绝对路径。该文件将随 `Morii9961/Moriium` 公开发布，会泄露 Windows 用户名，且在任何其他机器上都是错的 | 需修 | 改为 `$HOME/.claude/skills/...`，并加一句说明此文件会公开 |
| 2 | `CLAUDE.md` 的阅读顺序没有收录本 ADR。下一个 session 按 `CLAUDE.md` 读文件会完全错过已批准的 Phase 1 范围 | 需修 | 插入为第 3 项，并修正插入后重复的编号 |
| 3 | 本 ADR 多处仍假设 Enouia 在场：交叉审查门、文件写权限表、原型 A 主责、评分记录分工 | 需修 | 新增 1.1 说明影响，3.2 由「写权限」改为「模块边界」，3.4 / 第 4 节去掉分工假设 |
| 4 | 第 2 节的 `.npmrc`「精确锁版本已由工具强制」与 `allowBuilds`「本 ADR 全部规避」两行，在发现 `saveExact` 行为并引入 Vite 之后已经变成错误陈述 | 需修 | 两行都按实测结果重写 |
| 5 | `AGENTS.md` 的文档语言清单没有涵盖 `docs/adr-*.md`，可能导致下一次用英文改写中文 ADR | 次要 | 补入 `docs/adr-*.md` 为中文 |

自审过程中还纠正了两处自己的判断错误，已写入第 9 节与第 10 节：把临时副本里 corepack 回退产生的 `pnpm 10.33.0` 误读成版本不符（真实仓库始终是 `11.22.0`）；用 `pnpm config get` 判断 `.npmrc` 继承，而该命令根本不读项目级 `.npmrc`，换成行为测试后结论才成立。

**自审覆盖不到的地方**，需要 Morii 补位：本 ADR 的架构取舍（嵌套 workspace、`node:sqlite` 作尖峰、Markdown 保持真源）没有第二个独立技术视角复核过；A/B 的体验优劣按设计就只能由 Morii 实际操作判定。第 4 节的硬性否决项是为了让「体验好」不能盖过「草稿泄漏」这类客观失败，但它挡不住评分维度本身选错。

**已关闭的遗留风险**：`prototypes/` 嵌套 workspace 此前只在仓库外副本验证过。2026-08-29 已在真实仓库路径下建立骨架并当场复验，四条验收标准全部成立，备选的仓外目录方案不需要启用。命令与输出见 13.1。

自审在这一步又发现一处本 ADR 自己的疏漏：3.1 列出的嵌套 workspace 最小配置漏了 `enableGlobalVirtualStore: false`，已补，理由写在 3.1。这类「父配置不继承」的遗漏还可能存在于其他设置上，往 `prototypes/` 加配置时应逐条对照根 `pnpm-workspace.yaml`，不要假设本 ADR 的清单是完整的。

## 13. 执行记录

### 13.1 骨架与隔离验证（2026-08-29）

建立 `prototypes/`，成员为 `studio-a`、`admin-b`、`shared`，各带一个 `private: true` 的最小 `package.json`。四条验收标准逐条实测：

```text
pnpm -C prototypes root -w        → E:\Moriium\prototypes\node_modules
pnpm -C prototypes install        → Scope: all 4 workspace projects
仓库内 pnpm-lock.yaml（排除 node_modules）→ 只有根的与 prototypes/ 的两个
git status --short --untracked-files=no → 空（无 tracked 文件被修改）
git check-ignore -v prototypes/node_modules → .gitignore:1:node_modules/
pnpm verify（仓库根）              → 退出码 0
```

`pnpm verify` 的构成与第 9 节一致：60 个 Astro 文件 0 错误 0 警告 0 提示、30/30 测试、46 个静态页面、链接与公开树审计通过。既有的 Vite 大分包警告仍在，与第 9 节的记录一致，仍留在 Phase 0 的体积测量清单里。

**零依赖安装是弱证据，因此补做了一次真实依赖往返。** 四个成员当时都没有依赖，`install` 只输出 `Already up to date`，并未解析任何包，隔离的关键问题（装依赖时会不会串到根 store 或根 lockfile）没有被触及。按第 9 节的做法给 `admin-b` 装 `nanoid` 再移除：

```text
pnpm -C prototypes --filter @moriium-prototypes/admin-b add nanoid
  → admin-b/package.json 写入 "nanoid": "6.0.1"（精确，saveExact 在嵌套 workspace 生效）
根 node_modules/.pnpm        → nanoid@3.3.18（生产传递依赖，在未修改的根 lockfile 内）
prototypes/node_modules/.pnpm → nanoid@6.0.1
prototypes/admin-b/node_modules/nanoid
  → prototypes/node_modules/.pnpm/nanoid@6.0.1/node_modules/nanoid
根 package.json / pnpm-lock.yaml → 全程未修改
pnpm -C prototypes --filter @moriium-prototypes/admin-b remove nanoid → 已还原
```

两个 `nanoid` 大版本各自独立解析、互不干扰，这比零依赖安装更能证明隔离成立。
