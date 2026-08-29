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

5. ~~**`prototypes/` 是否排除出 `astro check`**~~ — **已由 Morii 定夺（2026-08-29）：采用排除加原型自带 tsconfig 的方案。已实施，见 13.4。**

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

### 13.2 fixture corpus（2026-08-29）

第 1 节前置第 3 项完成。语料在 `prototypes/fixtures/`，四篇公开文章、一篇加密文章、两个 SVG 媒体，全部人工虚构。

按用途设计，不是凑数：

| 夹具 | 服务的验收任务 | 形态理由 |
| --- | --- | --- |
| `posts/zh/zh-tide-notes.md` | T3、T5 | 覆盖 `markdown-reference.md` 的全部内容块，含 fence metadata（标题、行号、标记行、折叠段）、行内与块级数学、Mermaid、五种 admonition 加 GitHub callout、spoiler、`::github`、`::video`、`::music`、带 alt 与 caption 的图片，以及一段中日英混排标点 |
| `posts/ja/ja-tide-notes.md` | T3、T5、T6 | 同 `translationKey`、同内容块的日文版。round-trip 保真需要一个非拉丁正文来暴露丢字 |
| *(无英文版)* | T6 | 缺席本身就是夹具。「不可用」必须能与「还没写」区分开，且 `AGENTS.md` 禁止伪造或复制翻译 |
| `posts/zh/zh-darkroom-log.md` | T6 | 故意只有中文。T6 要 Morii 在任务中补日语，所以必须有一组是从不完整状态起步的 |
| `posts/zh/zh-winter-drafts.md` | T8、硬性否决项 | `draft: true` 配 `unlisted: false`，确保泄漏测试验证的是 `draft` 过滤本身，而不是被 `unlisted` 顺带挡住 |
| `protected/zh-sealed-notebook.json` | T3、解锁流程 | 用生产的 `scripts/lib/crypto.mjs` 生成的真实 AES-256-GCM 信封，正文含图片与数学，`features` 标记因此不是全 false |

`prototypes/tools/validate-fixtures.ts` 把语料的每条性质做成断言而不是注释：schema 校验、`slug` 前缀与目录同 `lang` 一致、三语关系符合 T6 的起始状态、草稿夹具存在且 `unlisted: false`、媒体文件存在且 alt 非空且无孤儿、加密夹具的 feature 标记与源文一致、用测试口令能解密且用错误口令必须失败。

**校验器本身做过负向测试。** 只会通过的校验器没有价值，因此把日文夹具的 `lang` 临时改成 `en` 跑了一次，如期触发四条断言并以退出码 1 结束，随后还原：

```text
node prototypes/tools/validate-fixtures.ts   → Fixture corpus is valid.（退出码 0）
临时把 ja-tide-notes 的 lang 改成 en          → 4 problem(s)，退出码 1
  - slug "ja/tide-notes" does not start with lang "en"
  - sits in directory "ja" but declares lang "en"
  - tide-notes must ship zh and ja
  - tide-notes must NOT ship en
还原后                                        → 退出码 0
```

顺带确认了两件影响后续选型的事实：

1. **原型可以用相对路径吃到生产管线。**`build-protected-fixture.mjs` 从 `prototypes/` 导入 `scripts/lib/render-markdown.mjs`，裸依赖正常解析到根 `node_modules`。3.3 关于「原型 A 新依赖为 0」的前提到此在真实路径下成立，不再只是推断。
2. **Node 24.15.0 直接执行 `.ts`，无需 flag、无需构建步骤。**因此 3.6 要求 `shared/` 用普通 TypeScript 不需要引入任何工具链，原型 A 也可以全程 TypeScript 而仍然保持零新依赖。

**尚未完成**：这些正文还没有生产 HTML 的基线快照，所以第 4 节要求的 round-trip 丢失项计数目前还无法自动统计。生成并存下基线是语料的下一块工作。

### 13.3 发现：隔离不覆盖 `astro check`

建完语料后 `pnpm verify` **失败**了。根 `tsconfig.json` 的 `include` 是 `["**/*"]`，`exclude` 只有 `dist` 与 `node_modules`，因此 `astro check` 把 `prototypes/**/*.ts` 一并纳入了类型检查：文件数从 60 变成 64，并报出 5 个错误。

这与 3.1 的判断有出入。3.1 说 Phase 1 期间生产文件零改动即可保证生产不受影响，但零改动**不等于**零耦合：原型的 TypeScript 现在必须满足生产的严格配置（`astro/tsconfigs/strict` 加 `exactOptionalPropertyTypes`、`noUncheckedIndexedAccess`），任何一个不合规的原型文件都会让 `pnpm verify` 失败。

本次的处理是**改原型代码去适配，不动根配置**：Morii 给本轮定的边界明确包含「不碰根配置」，而 `tsconfig.json` 属于根配置。5 个错误全部是 `noUncheckedIndexedAccess` 下的真实空值风险（正则捕获组、解构结果可能为 `undefined`），修掉是应该的，不是为了迁就检查器。修复后 64 个文件 0 错误 0 警告 0 提示，`pnpm verify` 退出码 0。

**这一项已由 Morii 定夺**，处理见 13.4。第 6 节的 L1 回退不受影响——删掉 `prototypes/` 目录后一切照旧。

### 13.4 L2：把 `prototypes/` 排除出生产类型检查（2026-08-29）

Morii 选择 13.3 的第二个方案。这是本 ADR 第 6 节定义的 **L2 改动**：Phase 1 期间第一次、也是目前唯一一次改动根配置，因此单独成一次提交，需要时 `git revert` 即可，不牵连语料与骨架。

改动三处：

- 根 `tsconfig.json` 的 `exclude` 加入 `prototypes`，并注明删除 `prototypes/` 时应一并移除该条；
- 新增 `prototypes/tsconfig.json`，继承同一套 `astro/tsconfigs/strict` 加 `exactOptionalPropertyTypes`、`noUncheckedIndexedAccess`。**排除不等于不检查**，严格度与生产一致；
- `prototypes/package.json` 增加 `check` 脚本。它以 `node ../node_modules/typescript/bin/tsc` 调用根仓库已有的 TypeScript 6.0.3，因此不给原型新增任何依赖——pnpm 不会把父 workspace 的 `.bin` 串进嵌套 workspace 的 PATH，直接写 `tsc` 会找不到。

`allowImportingTsExtensions` 与 `noEmit` 是必需的：Node 24 直接执行 `.ts` 时，相对导入要带真实扩展名，而 tsc 只在不产出文件时接受这种写法。原型树本来就不编译，这个组合是正确的而不是将就。

实测两侧都成立，且是用一次刻意注入的错误证明的，不是声明：

```text
pnpm exec astro check                    → Result (60 files)（此前为 64）
pnpm -C prototypes check                 → 退出码 0
临时放入一个类型错误的 .ts 到 prototypes/  →
  pnpm -C prototypes check               → error TS2322，退出码 2
  pnpm exec astro check                  → Result (60 files): 0 errors（不受影响）
删除该文件后                              → 两侧均恢复退出码 0
pnpm verify                              → 退出码 0
```

关键的一条是中间那两行：原型里存在一个坏文件时，原型自查会失败而生产验证依然干净。3.1 的隔离主张到此才真正覆盖类型检查，而不只是覆盖文件改动。

### 13.5 渲染基线（2026-08-29）

第 4 节的「内容保真」与 T5 的「预览与生产渲染逐项比对」都需要一份基准 HTML。基线存在 `prototypes/fixtures/baseline/`，由 `pnpm -C prototypes baselines:build` 生成。

**基准取公开文章管线，由 Morii 定夺。**这不是形式问题：`scripts/lib/render-markdown.mjs` 是受保护文章的路径，它关掉了 `smartypants` 与 `syntaxHighlight`，拿它当基准会让所有保真度数字朝同一方向系统性偏移。生成器改为导入 `astro.config.mjs` 并使用站点自身配置的插件列表，而不是另抄一份，因此不存在「改了一边忘了另一边」的漂移。

**这里出过一个真实的错误，值得记下来。**第一版基线渲出的代码块是 `<pre class="astro-code">`，也就是 Astro 默认的 Shiki。但把真实文章 `reader-capabilities.md` 的构建产物拿来一比，`dist/` 里是 `<div class="expressive-code">`，`astro-code` 出现 0 次。原因是 Expressive Code 以 **Astro 集成**的身份接入，不在 `markdown.processor` 的插件链里。如果没做这次比对，两个原型的每一个代码块都会被记成一项渲染差异，而根因在基线自己。

因此新增 `pnpm -C prototypes baselines:verify`：它把生产文章过一遍基线渲染器，与 `dist/` 的真实产物逐项比对结构标记。当前 14 项标记全部一致。**推理插件顺序无法确立这件事，比对输出可以**，这个工具的价值就在于此。

由此带来两处必须记录的取舍：

1. Expressive Code 的选项在 `build-baselines.mjs` 里是**重复**的一份，因为 Astro 集成把选项关在闭包里、不交还。`validate-fixtures.ts` 因此增加了一条守卫：`astro.config.mjs` 的 `expressiveCode({...})` 调用一旦改变就报错，要求同步更新并重生成基线。
2. 基线剥掉了注入的 `<style>` 与 `<script>`。Expressive Code 的 rehype 版会内联它们，而 Astro 集成抽成 `/_astro/ec.*` 外链，构建产物里并没有内联块。不剥的话，48 KB 的基线里有 24 KB 是这些资产，正文会淹没在自己的 diff 里。剥掉之后基线离 `dist/` 更近而不是更远。

`fixtures:check` 现在还会校验每份基线与当前渲染结果一致，不一致即失败。这条同样做过负向测试：改动一篇夹具正文后，校验器如期报出 1 份基线过期并以退出码 1 结束，还原后恢复。基线过期意味着公开渲染发生了变化，应当先读 diff 再重生成。

**仍未完成**：基线只覆盖「渲染出去」这一半。round-trip 丢失计数还需要反方向——编辑器吐回的 Markdown 与原文对比——那要等原型 B 存在之后才能做。
