# ADR 0001：vNext Phase 1 隔离原型尖峰

> 状态：**方向已定（2026-08-30）：Morii 选择 B，原型 A 取消；生产合同暂不变**
> 日期：2026-08-29
> 起草：Claude
> 审查：Claude 自审（Enouia 额度耗尽，见 1.1）
> 上级依据：[`AGENTS.md`](../AGENTS.md)、[`vnext-architecture-plan.md`](vnext-architecture-plan.md) 第 7 节 Phase 1、[`enouia-todo.md`](enouia-todo.md) 01 节、[`claude-vnext-handoff.md`](claude-vnext-handoff.md)

## 1. 授权状态

最初的开工批准来自 Codex 并由 Morii 转述。按 `AGENTS.md`「直接来自 Morii 的指示优先」，协作 agent 之间不能互相授予这一层授权，因此当时本 ADR 只交付文档。

**2026-08-29，Morii 本人批准本 ADR**，并明确：隔离原型获准，生产合同不变。同时定夺了第 8 节的三项未决问题，见该节。

**2026-08-30，Morii 实际使用原型 B 后确认满意，并选择 B 作为 Moriium vNext 的最终路线。**原型 A 不再开发，原计划的 A/B 对照评分随之取消。这个决定结束路线比较，但不把尖峰代码直接批准为生产实现：生产数据库、会话、安全、备份、监控、逐路由渲染与回退仍须由 Phase 5 ADR 定稿，`AGENTS.md` 与当前静态生产合同在那之前继续生效。完整记录见 13.14。

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

## 4. 原型 B 的验收清单

2026-08-30 Morii 选定 B 之后（13.14），这一节不再是 A/B 对照。任务本身仍然成立，换掉的是判据：不再问「哪个更快」，而是问「B 能不能过」。评分表取消，因为已经没有第二个候选可以比。**硬性否决项保留**，现在只对 B 生效。

旧编号保留可追溯：B1–B10 一一对应原来的 T1–T10，B11 是原表没有的一项。

### 4.1 什么样的判据才算数

每一项要有能被检查的通过判据，不收印象。证据只认三类：

- **自动化用例**——能防回归，但证明不了「能不能用」；
- **实测命令输出**——原样贴，不转述；
- **Morii 在真实浏览器里的操作记录**——能证明可用，但下一次改动不会自己重跑。

三者不能互相替代。13.13 已经有过一次教训：每一层都有测试，Morii 却一件事都做不了。

当前状态如实标注，**清单不是许愿单**。一项做不到就写做不到，不用「基本可用」这种词把缺口糊过去。

### 4.2 清单

| 编号 | 任务 | 通过判据 | 当前状态 |
| --- | --- | --- | --- |
| B1 | 进入写作环境 | 口令正确才发会话；失败限速生效；退出后旧 cookie 读不到任何草稿 | **部分**——守卫有集成用例，登录框的回车提交仍未验证 |
| B2 | 新建一篇中文文章并填全 frontmatter | 生产 `sharedMetadata` 的 14 个字段都能填、能存、能取回 | **不能过**——库里只有 5 个字段的位置 |
| B3 | 正文写入全部高级内容块 | `markdown-reference.md` 的 11 类块写进去再取出来，逐字节与输入一致 | **已通过**——`roundtrip:report` 11/11，两篇夹具 |
| B4 | 自动保存后模拟中断并恢复 | 杀掉进程重开，最后一次自动保存的正文还在，且读者看到的内容没变过 | **已通过**——ADR 13.20 实测，两条都成立；自动保存**失败**之后打的字不在保障范围内 |
| B5 | 预览与生产渲染逐项比对 | 预览产出与 `fixtures/baseline/` 逐字节相等 | **已通过**——ADR 13.17，四篇夹具，另有反向断言 |
| B6 | 补一篇日语翻译，确认英语显示为不可用 | 同 `translationKey` 下三语状态正确，缺失的显示为不可用而不是空白 | **部分**——发布闸门会校验，界面上看不到翻译状态 |
| B7 | 导入一张图片并过隐私闸门 | 导入时去 EXIF/GPS，原图不被触碰，不合格的图片进不了正文 | **不能过**——只有闸门，没有导入路径 |
| B8 | 发布到测试目标，然后回滚 | 发布显式、可回滚；不合格内容发不出去，且失败不留公开指针与审计行 | **已通过**——ADR 13.15，含拒绝路径的集成用例 |
| B9 | 在 375 CSS 像素宽度下完成一次小修改 | 编辑器、图片属性面板、预览面板在 375 像素下可操作，不横向溢出 | **已通过**——ADR 13.20 实测，页面无横向溢出，改动与自动保存都成立；右栏三个面板落在长文之下 |
| B10 | 故障演练 | 数据库锁与 API 断开时给出可理解的失败，不静默丢改动 | **部分**——ADR 13.20 演练并修了两处；自动保存失败后仍不会自动重试 |
| B11 | 匿名公开阅读 | 匿名只能读到已发布版本，读到的就是读者真正会看到的东西 | **部分**——越权已被用例挡住，但公开侧只有 JSON，没有渲染出来的阅读页 |

B3 的内容块清单取自 `markdown-reference.md`：代码 fence metadata、行内与块级数学、Mermaid、admonition（含 GitHub 风格 callout）、spoiler、`::github`、`::music`、`::video`、图片 alt 与 caption，以及一段中日英混排标点。夹具语料已覆盖全部 11 类，`fixtures:check` 会在漏掉任何一类时失败。

### 4.3 三项不能过的，缺在哪里

**B2**：生产的 `sharedMetadata` 有 14 个字段，B 的库里只放得下 `title`、`slug`、`summary`、`lang`、`translationKey` 五个。`publishedAt`、`updatedAt`、`category`、`tags`、`cover`、`coverAlt`、`draft`、`unlisted`、`copyProtection` 九个没有列可以放。其中草稿状态与两个时间戳在 B 里由状态机和时间列承担，但那不等于它们是作者能填的 frontmatter 字段。`publishCandidate` 因此是从生产 schema 上 `pick` 出来的子集，注释里写明这是 Phase 2 的缺口——**存不下就在发布时补默认值，等于替 Morii 编内容**，所以宁可让它显式地缺着。

**B7**：`shared/media.ts` 的闸门是齐的，`blockersForPublishing` 会拦下未净化的位图和白名单外的 EXIF。但 B 里**没有任何导入路径**：不能上传，不会调 `scripts/sanitize-media.mjs`，媒体清单是手写的夹具文件。图片属性面板只能手打路径。也就是说隐私闸门目前守的是「正文引用了什么」，不是「导入了什么」。

**B11 的另一半**：匿名端点返回的是 JSON，不是渲染好的页面。「读者看到的」面板显示的也是 Markdown 源码。越权这条已经证明了（草稿与未发布的自动保存都读不到），但「读到的就是读者真正会看到的东西」这半条还没有对象可以验。13.17 的预览已经把生产渲染接进来了，把它接到匿名侧是下一步能做的事。

这三项都不是缺陷，是 Phase 1 尖峰划出来的范围边界。B2 与 B7 要在 Phase 5 的生产架构 ADR 里连同数据库模型和媒体管线一起定，不要在尖峰里就地补一个将来要推翻的实现。

### 4.4 硬性否决项

任一出现，B 在该维度直接不合格，不接受「后面会补」：

- 草稿泄漏到公开路由、RSS、Sitemap 或搜索索引；
- 媒体闸门可绕过；
- 口令或明文进入日志，或落到磁盘上非预期的位置；
- 发布不可回滚；
- 发布被拒之后留下了半公开状态或一条审计记录。

最后一条是这一轮加的。13.15 把校验放进事务，正是为了让它可检查而不只是一句主张。

### 4.5 现在就能说的结论

已通过并有证据：B3、B5、B8、B4、B9。

部分：B1（缺回车提交）、B6（缺界面）、B10（失败后不自动重试）、B11（缺渲染出来的公开页）。

不能过：B2、B7。

一次都没验过：没有了。

**B 被选中，不等于 B 通过了这份清单。**十一项里五项拿得出完整证据，四项部分，两项不能过。剩下的四项部分里，B10 的重试是一块能做的活；B1、B6、B11 与两项不能过的，都要连着 Phase 5 的生产架构一起定，不在尖峰里就地补一个将来要推翻的实现。

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

HTTP 层按仓库锁定的 Node 24 实现，接口行为核对了 [Node.js v24 `node:http` 文档](https://nodejs.org/download/release/latest-v24.x/docs/api/http.html)：`IncomingMessage` 是可读流，响应头在写出前通过 `setHeader()` 设置。原型自己负责请求体上限与 JSON 解析，不假设底层会缓冲完整请求。

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

### 13.6 共享契约（2026-08-29）

3.6 要求 `shared/` 收敛 frontmatter schema、三语关系、内容块清单与 feature marker、媒体 asset 形状、错误模型。除 frontmatter schema 已随 13.2 落地外，其余四项本轮补齐，依赖方向按 3.6 保持单向：只依赖普通 TypeScript 与 `astro/zod`，不反向引用任何原型。

| 模块 | 作用 | 设计上的要点 |
| --- | --- | --- |
| `content-blocks.ts` | 内容块清单与 feature marker 推导 | 把 `markdown-reference.md` 的清单变成可断言的数据 |
| `translations.ts` | 三语与 `translationKey` 关系 | 查询返回带判别标签的状态，**不返回替代语言** |
| `media.ts` | 媒体 asset 形状与发布闸门 | 结构上没有存放原图路径的字段 |
| `errors.ts` | 错误分类与日志脱敏 | 脱敏在日志边界，不在抛出点 |

三处刻意的设计，都是为了让规则由结构承担而不是由自觉承担：

1. **翻译查询不提供回退。**`AGENTS.md` 要求缺失翻译显示为不可用、不得伪造或复制。这条规则容易讲、也容易被顺手破坏——UI 遇到缺失语言时最省事的做法就是拿另一种语言顶上。因此 `statusOf` 返回判别联合，只有 `available` 那一支带 `entry`；调用方想拿到正文必须先收窄类型，「忘了检查就回退」在类型上不成立。草稿单独是一支 `draft`，不会被算成可用翻译。
2. **媒体 manifest 没有原图字段。**`AGENTS.md` 要求原图不可触碰、衍生图须先去除 GPS 与敏感 EXIF。manifest 只记录可发布的衍生图，没有存放原图磁盘路径的地方，因此不会「不小心」带上。EXIF 允许列表由发布闸门 `blockersForPublishing` 强制，而不是由键的类型强制——这样越界的标签得到的是一句可读的阻断说明，而不是一个难解的解析错误，且规则只存在于一处。
3. **`roundTripOptional` 一律为 `false`。**这个字段存在的唯一目的，是让「某个块 round-trip 丢了也算过」这种豁免将来无法被悄悄加进评分表——要加就得显式改这里。

内容块清单同时补上了本 ADR 此前的一个漏洞：语料的 README 声称覆盖了全部内容块，但没有任何东西验证这句话。现在 `fixtures:check` 会断言两件事——清单里每个块的 section 都在 `markdown-reference.md` 中存在（防止清单与参考文档漂移），以及语料确实用到了每一个块（当前 11 个全覆盖）。`build-protected-fixture.mjs` 也改为使用共享的 `markersFor`，不再自带一份正则副本。

**已知的一处未收敛**：`scripts/encrypt-post.mjs` 仍有它自己的 `featuresOf()`，服务于真实受保护文章。它与 `markersFor` 是两份实现，本轮没有合并，因为合并意味着改动生产脚本。等哪个原型接管加密流程时再一并处理。

`shared/` 的行为由 `pnpm -C prototypes test` 覆盖，20 个用例，用 `node:test` 运行，无新依赖。用例按第 5 节「测试必须证明而不是声明」的要求写成破坏尝试而不是确认清单：试图让缺失的英文翻译解析到别的语言、试图把口令和 `.private/` 路径送进日志、试图发布未净化的 raster 媒体与越界 EXIF。

### 13.7 原型 B 的存储层（2026-08-29）

3.5 的状态语义落地为 `prototypes/admin-b/src/storage/`，`node:sqlite`，无新依赖。数据库文件在 `prototypes/admin-b/.data/`，由**新增的 `prototypes/.gitignore`** 忽略——用嵌套 ignore 文件而不是改根 `.gitignore`，好让 Phase 1 的根配置改动仍然只有 13.4 那一次。

**状态机由数据结构承担，而不是由调用方的自觉承担。**这是本轮唯一重要的设计决定：

- 文章是不是草稿，取决于 `published_version_id` 是否为 `NULL`，而不是某个 `draft` 布尔字段。新文章天然是草稿，因为根本没有东西可供读者解析到；
- 保存**只追加**版本行，从不改写已有行，并且 `saveVersion` 这条路径上没有任何办法触及 `published_version_id`。因此「自动保存改变了读者看到的内容」不是靠纪律避免的，而是 API 上做不到；
- 发布与回滚是同一个操作指向不同版本，在同一个事务里连同审计行一起写。**回滚因此不会腐烂**——它不是一条独立的代码路径，发布跑通就等于回滚跑通。

`validate` 回调在任何写入之前执行，所以校验失败不会留下发布到一半的状态。发布前会检查版本确实属于该文章：发布别人的版本会静默替换读者看到的内容，只检查版本存在是不够的。

SQL 全部收在 `store.ts` 内，模块外没有任何东西 import `node:sqlite`，API 说的是文章、版本、发布，而不是行、事务和驱动类型。3.5 强调这一点的理由是 `node:sqlite` 只是尖峰工具：约束守住，换引擎就是重写一个文件；一旦渗出去，换实现的代价会到很晚才被发现，并且会被归咎到错误的决定上。

canonical content 是 Markdown，`editor_json` 并存但不作真源，也没有任何东西从它渲染——对应第 8 节第 3 项的定夺。

17 个用例，同样写成破坏尝试：连续自动保存五次后检查读者看到的仍是原版本、让发布校验在中途抛错后确认公开版本与审计都没动、拿另一篇文章的版本去发布、回滚后再前滚确认历史版本一个都没丢。另外用文件库（而非内存库）实跑过一遍，确认建目录、WAL 与 `.gitignore` 都正常。

**尚未做**：认证、会话、CSRF、速率限制、对象级授权，以及第 5 节要求的 Origin/Host 校验与路径穿越防护。这些属于 B 的 HTTP 层，存储层不涉及，但在 B 能被实际操作之前必须补齐，不能因为「存储层测试通过」就认为 3.5 已经完成。（其中大部分已在 13.8 完成。）

### 13.8 安全边界（2026-08-29）

第 5 节的多数要求已落地。三个模块，无新依赖。

**路径防护放在 `shared/safe-path.ts`**，因为 A 与 B 都从浏览器接收路径。它避免三类错误：在规范化之前检查字符串；用前缀比较判断包含关系（`/data` 是 `/data-other` 的前缀，`startsWith` 会放行同级目录，因此改用 `path.relative`）；以及只做文本检查就收手。

最后一条是第 5 节点名的那条。**测试真的在磁盘上建了一个指向根目录之外的 junction**，并断言两件事：文本检查认为 `escape/secret.md` 是被包含的，而 `safeResolve` 拒绝了它。这就明确了拦截来自 realpath 那一步，而不是来自字符串检查——只断言字符串处理的话，这一整类漏洞根本测不出来。不存在的路径也要能检查，因为写新文件是常态，做法是解析最近一个已存在的祖先。

**口令用 scrypt，参数与 salt 一起编码进哈希串**（`scrypt$N=...,r=...,p=...,len=...$salt$hash`）。记录参数这件事容易被省略而代价很高：不写明成本的哈希，将来提高强度时只能要求全部重设口令。写进去之后旧哈希仍可验证，并可在下次成功登录时重算，`needsRehash()` 就是为此存在。比较用 `timingSafeEqual`，`===` 会通过耗时泄漏匹配了多少前缀。

**Origin / Host / CSRF 三道守卫**是「仅绑定 `127.0.0.1` 不构成安全模型」这句话的落地。本地服务对作者打开的任何页面都是可达的：浏览器会老实地把跨站表单 POST 发到 `http://127.0.0.1:4321`，而 DNS rebinding 能让恶意站点的脚本在浏览器看来同源。因此 Host 必须在允许列表内（这条挡住 rebinding，因为改绑后的名字不在列表里），写请求的 Origin 必须匹配，并且必须带 CSRF token。**缺失的 Origin 按拒绝处理**，当作可接受就等于把这个头存在的意义还回去了。

**一处必须报告、不得当作已解决的与生产的差异**：本地 http 下 cookie 不能带 `Secure`，而 `__Host-` 前缀依赖 `Secure`，因此两者都没用。这条写在 `sessions.ts` 的 `COOKIE_LIMITATIONS` 常量里并有测试断言它存在，好让它跟着代码走而不是只躺在文档里。任何可从网络访问的部署都必须补上。

41 个新用例，全部写成越权尝试：用错误口令登录、越过次数上限继续猜、拿另一个会话的 CSRF token、从别的 Origin 提交、带着改绑的 Host 到达、穿过 junction 读根目录外的文件。当前总计 78 个用例、18 个套件。

**仍未做**：对象级授权（草稿不可越权读取）要等 HTTP 路由存在后才能测；会话存在内存里，重启即失效——这是尖峰的性质，不是设计主张；速率限制按单一作者账户全局计数，多账户场景需要改。

### 13.9 原型 B 的 HTTP 边界（2026-08-29）

`prototypes/admin-b/src/http/server.ts` 把 13.7 的存储状态机与 13.8 的安全守卫接到 `node:http`。当前路由覆盖登录、退出、文章列表与详情、创建、手动保存、自动保存、发布和回滚，没有引入框架或新依赖。

请求入口只做四件事：校验 Host / Origin / CSRF 与作者会话、限制并解析 JSON 请求体、把输入收窄成存储层接受的类型、把共享错误模型映射成稳定的 HTTP 响应。SQL 仍然只存在于 `store.ts`；`IncomingMessage`、cookie 和 header 也没有渗入存储层。

登录是唯一没有现成会话的写请求，因此先过 Host 与 Origin，再校验口令；其余写路由必须同时带有效 session cookie 和对应的 CSRF token。管理端的列表、详情和版本历史一律要求作者会话。另设的只读公开端点只返回 `published_version_id` 指向的版本，不返回 `editor_json`、版本历史或审计记录。未发布文章得到 404；已发布文章即使后来产生新的自动保存，匿名请求仍只能看到原公开版本。

对象级授权没有停留在函数级断言。`routes.test.ts` 启动真实的 `node:http` server，走 socket 发请求，尝试匿名读取草稿、在发布后读取尚未发布的自动保存、伪造 Host、跨 Origin 提交和漏掉 CSRF token。四组集成测试全部通过，原型测试总数由 78 增至 82，套件由 18 增至 22。测试首次运行时因 `server.ts` 尚不存在按预期失败，补实现后才转绿。

**这一层完成不等于 B 已经可操作。**目前没有启动入口和界面，Tiptap 尚未接入；发布路由也只做请求形状校验，内容、媒体与翻译关系的完整发布闸门还没有接线。它们必须在 Morii 实际执行 T1–T10 前补齐。

### 13.10 编辑器工具链与 round-trip 基线（2026-08-29）

第 8 节点名的下一块。3.3 批准的依赖按表安装，`@tiptap/static-renderer` 没有装——它的用途是服务端可信渲染，而 3.3 已经写明那要等 round-trip 通过之后才评估，提前装进来只会给锁文件添一个没人 import 的包。

`admin-b/src/editor/roundtrip.ts` 把夹具正文送进 `Editor`，取回 `getMarkdown()`，再用 `shared/content-blocks.ts` 的清单在输入和输出两侧各数一遍。**它不因为解析没抛异常就判定某个块安全**：11 个内容块逐个比对，只有在输入里出现过、输出里也还在，才记为保留。

未加扩展的 Beta 基线，中日两篇夹具结果一致，11 个块保留 8 个，丢 3 个：

```text
zh-tide-notes.md  unextended  11 blocks  preserved 8  lost 3  1889 -> 1942 chars
ja-tide-notes.md  unextended  11 blocks  preserved 8  lost 3  2060 -> 2110 chars
lost: image, admonition-github-callout, spoiler
```

三条丢法各不相同，值得分开看：

```text
输入   ![潮位計](/media/fixture.svg "标题")
输出   潮位計

输入   > [!TIP]
       > 保留标记。
输出   > \[!TIP\]
       > 保留标记。

输入   正文 :spoiler[被遮住] 结尾。
输出   正文 :spoiler\[被遮住\] 结尾。
```

图片是**真正的数据丢失**，不是格式退化：文件路径、alt 与 caption 全部消失，只剩 alt 文本变成了普通段落文字。后两条是转义，语法标记还在字面上，但 `[` 前多了反斜杠，再解析就不再是 callout 和 spoiler。字符数增加正是这些反斜杠。

**还有一条块级计数看不见的损坏。**行内数学 `$H_0$` 被写成 `$H\_0$`，因为下划线照通用 Markdown 规则做了转义。`$...$` 的外形没变，所以清单仍然把 math-inline 记作保留，可数学源码已经不是原来那段。由此得出的结论对后面所有测量都成立：**块级清单是必要条件，不是充分条件**，最终仍要拿字符逐位比对来兜底。

### 13.11 不透明源节点与被隔离的 marked 实例（2026-08-29）

13.10 的三处丢失和那处转义损坏，都出在同一个地方：Beta 序列化器在处理它并不拥有的语法。因此 `admin-b/src/editor/source-nodes.ts` 的做法不是教它认识 Moriium 的指令，而是**让它不要碰**。

两个 atom 节点，`moriiumSourceBlock` 与 `moriiumSourceInline`，覆盖图片、块级数学、`::video` / `::github` / `::music`、五种 admonition、GitHub callout、行内数学和 spoiler。它们把原始源码整段收进 `raw` 属性，`renderMarkdown` 再原样吐回，中间不做任何解释。走的是 Tiptap 文档给出的自定义 tokenizer 加 `parseMarkdown` / `renderMarkdown` 扩展点，不是绕过它。

结果是 11 个块全部保留，且比「全部保留」更强：

```text
zh-tide-notes.md  source-fallback  11 blocks  preserved 11  lost 0  1889 -> 1888 chars
ja-tide-notes.md  source-fallback  11 blocks  preserved 11  lost 0  2060 -> 2059 chars
```

少掉的那一个字符是**唯一**的差异。79 行逐行比对，前 78 行完全一致，序列化器只是不吐最后那个换行。测试因此直接断言「序列化结果补回一个换行就等于原文」，而不是断言块清单为空——13.10 已经说明清单看不见转义损坏，这里就不能再靠它下结论。将来接保存路径时要补回这个换行，否则每次保存都会给文件添一行无谓的 diff。

**这个方案实际上替一条尚未定夺的取舍做了选择。**`enouia-todo.md` 00 节那条「优先 Markdown 全量保真，还是优先 Tiptap 所见即所得」，在这里事实上被选成了前者：上述七类语法在编辑器里是不可编辑的源码块，不是所见即所得的富文本。Markdown 保真拿满，代价是这些块的可视化编辑要另想办法。**这一条需要 Morii 定夺**，不要因为丢失计数归零就当成已经通过。

#### 一个隐蔽的跨编辑器污染

Tiptap 的 `MarkdownManager` 用 `markedInstance.use(...)` 注册扩展 tokenizer。不注入实例时它回落到 `marked` 的模块单例，于是**一个编辑器注册的 tokenizer 会留在之后创建的每一个编辑器上**。基线测量因此会被此前跑过的原型配置污染，而报告本身不会有任何异常。

`Markdown.configure({ marked })` 就是为注入而存在的。测试把这条钉死：先跑一遍带源节点的 round-trip，再跑基线，断言基线仍然如实丢掉那三个块。如果污染成立，基线会「正常」地一个都不丢，而那是假的。

#### 新增依赖 `marked@17.0.6`（Morii 已追认）

注入需要能 `new Marked()`，因此 `marked` 从传递依赖提升为 `admin-b` 的直接依赖。它不在 3.3 批准的依赖表内，**Morii 于 2026-08-29 追认保留**。三条事实一并记下：

- 锁文件只多了 3 行 importer 记录，`marked@17.0.6` 本来就是 `@tiptap/markdown` 的依赖，磁盘上仍然只有一份，安装树没有新增任何包；
- 版本号必须与 `@tiptap/markdown` 解析到的那份保持一致。将来升级 Tiptap 时若 marked 跨了大版本，这个直接 pin 会造成两份副本，需要一并调整；
- 不注入的替代方案是接受单例污染，那等于让每次测量取决于此前跑过什么，测量本身就不成立。

#### 类型断言，以及为什么它不是盲的

`marked` 选项的声明类型是 `typeof marked`，即那个可调用的模块命名空间，而 `new Marked()` 是实例。两者相差**恰好一个成员** `getDefaults`，实测确认，不是估计：

```text
type Gap = Exclude<keyof typeof marked, keyof Marked>   ->  "getDefaults"
```

而 `MarkdownManager` 从注入实例上只读 `Lexer`、`defaults`、`lexer`、`setOptions`、`use` 五个成员，从不读 `getDefaults`，也从不把实例当函数调用。这五个 `Marked` 实例全都有。所以 `marked-instance.ts` 里那处断言在当前版本下是安全的。

安全的前提是「Tiptap 只读这五个」，而这句话会随升级失效。因此断言配了一个会失败的检查，而不是一句注释：`marked-instance.test.ts` 用 Proxy 包住实例跑一次真实 round-trip，记录 Tiptap 实际读过的每个成员，再断言其中没有任何一个是 `Marked` 实例所缺的。方法返回时绑定回原对象，这样 marked 自己的内部取值不会被误记成 Tiptap 的读取。

这个观察器**当场就证明了自己有用**：第一次运行时它报出一个清单外的读取 `constructor`，来自 Tiptap 合并 options 时的 `isPlainObject` 判断。该成员两个类型都有，与类型缺口无关，因此断言改成按「实例是否缺这个成员」动态判定，而不是比对一份会过期的白名单。另用 `getDefaults` 做了负向验证，确认它确实会被捕获。

`missingMarkedMembers` 单独拆出来，是为了能拿一个空对象去测这个检查器本身。按第 5 节和交接文档第 7 节的约定，只会通过的校验器没有价值。

#### 接手时的实际状态

Codex 的这部分工作**没有提交**，且留下的工作树类型检查不过：

```text
admin-b/src/editor/roundtrip.ts(47,9): error TS2741:
  Property 'getDefaults' is missing in type 'Marked<string, string>'
  but required in type 'typeof marked'
```

测试当时是绿的，`pnpm -C prototypes check` 是红的。Claude 接手后补了 `marked-instance.ts` 与 `marked-instance.test.ts`，在 `source-nodes.test.ts` 里加了两条逐字节比对，并把注入改成可被测试观察的形式。源节点本身的设计原样保留。

本轮末次验证：

```text
pnpm -C prototypes check            -> 退出码 0
pnpm -C prototypes test             -> tests 94 / suites 25 / pass 94 / fail 0
pnpm -C prototypes fixtures:check   -> Fixture corpus is valid.
pnpm -C prototypes roundtrip:report -> 见上两张表
pnpm verify                         -> 退出码 0
  astro check                       -> Result (60 files): 0 errors, 0 warnings, 0 hints
  node --test tests/*.test.mjs      -> tests 30 / pass 30 / fail 0
  astro build                       -> 46 page(s) built
```

**仍未做**：源节点在界面上还没有可视化呈现，B 依然没有启动入口和 UI；发布闸门、媒体与翻译关系仍未接线。round-trip 保真成立不等于原型 B 可以交给 Morii 操作。

### 13.12 Morii 定夺：源码块可编辑，图片做成真节点（2026-08-29）

13.11 把取舍摆到台面上之后，Morii 选了「第 2 档打底，图片做到第 3 档」。也就是说，Markdown 保真继续是硬约束，但那七类语法不能是碰都碰不了的死块。

#### 从原子块改成可编辑文本

原来的两个节点是 `atom: true`，源码整段塞在 `raw` 属性里。后果很具体：光标进不去，视频 id 改一个字符也要整块删掉重打。

现在改用 Tiptap 自己 CodeBlock 的形状——`content: 'text*'` 配 `marks: ''` 和 `code: true`，源码成为节点的普通文本内容。

原先跟在 `raw` 尾巴上的那个换行挪进了 `trailing` 属性。这一步不是洁癖：换行留在文本里，作者会在每个源码块末尾看到一行凭空多出来的空行；而直接丢掉换行又会让输出不再等于原文。放进属性，两头都成立，逐字节比对仍然通过。

#### 图片单独做成有预览的节点

只有图片值得这份额外工作，理由在 13.10：其余几类是被转义，图片是被**彻底销毁**——路径和 caption 全没，只剩 alt 文本掉成普通段落。它也恰好是写作时最常碰的块。

`image-node.ts` 把 `src`、`alt`、`title` 拆成三个结构化属性，`renderHTML` 画的是 `<figure><img>` 加 `<figcaption>`，而不是产生它的那行 Markdown。等 B 有了界面，属性面板可以直接改这三个字段。

**要说清楚的是这一档现在只完成了一半。**结构和渲染已经就位，但「改 alt」需要的属性面板属于界面，而 B 至今没有界面。今天能证明的是：编辑器把它当图片而不是源码，且序列化逐字节还原。

#### 断言的是结构，不是说法

「光标能进去」这句话直接写成了 ProseMirror 层面的断言，而不是注释：源码块必须 `isTextblock === true` 且 `isAtom === false`，图片必须 `isAtom === true`。另有一条把编辑本身走完——在源码块里把 `id="old"` 改成 `id="new"`，再让 schema `check()` 通过。

这几条做过负向测试：把块节点临时改回 `atom: true`，`lets the cursor into a block source node` 如期报 `math-block is not a textblock` 并失败，还原后转绿。

#### 一条明确不做、并已钉死的限制

只认整行图片。夹在句子中间的图片仍然走未加扩展的老路，alt 保留、文件丢失。Moriium 的图片本来就独占一行，夹具里也是如此，因此没有为它加宽 `BLOCK_IMAGE`。但这条不是默认它不会发生，`image-node.test.ts` 有一条用例断言这个行为，将来真要支持时会看见它。

#### 本轮验证

保真数字与 13.11 完全一致，改的是编辑形态，不是输出：

```text
pnpm -C prototypes check            -> 退出码 0
pnpm -C prototypes test             -> tests 102 / suites 26 / pass 102 / fail 0
pnpm -C prototypes fixtures:check   -> Fixture corpus is valid.
pnpm -C prototypes roundtrip:report -> unextended 8/11；moriium-nodes 11/11，1889 -> 1888
pnpm verify                         -> 退出码 0（60 files 0 errors、30/30、46 pages）
```

**下一块仍然是界面。**源码块和图片节点到今天为止没有任何人用眼睛看过，`getHTML()` 在 Node 里跑不了，因为 ProseMirror 的 DOM 序列化需要 `window`。可编辑、可预览这两件事现在成立于结构层面，能不能用还要等 B 有了启动入口和 Vue 外壳才知道。

### 13.13 原型 B 可以被操作了（2026-08-29）

到 13.12 为止，B 的每一层都有测试，但**没有入口也没有界面**，Morii 一件事都做不了。这一节把它接通。

`pnpm -C prototypes dev:b` 一条命令起两个进程：`node:http` 的 API 在 4321，Vite 在 4320，浏览器只看见 4320。Vite 以 `changeOrigin: false` 反向代理 `/api`，因此 Host 与 Origin 守卫收到的是浏览器真实发出的值，而不是被代理改写过的值——改写等于把这两道守卫绕过去测。代价是 API 的 `allowedHosts` 必须把 UI 端口也写进去，这一条已在 `serve.ts` 注明。

界面是 Vue 3 加 `@tiptap/vue-3`，覆盖登录、列表、新建、编辑、自动保存、手动保存版本、发布、按版本回滚、载入历史版本，外加一个「读者看到的」面板，直接打匿名的公开端点，所以「自动保存不会改变读者看到的内容」这句话在屏幕上可以当场验证，不必相信文档。

数据库首次启动时用夹具语料播种，四篇中日文章。语料仍是只读输入，播种只往 B 自己的库里写。已有数据不动，重启保留上次写的东西。

**编辑器配置抽进了 `editor/extensions.ts`。**round-trip 测量用的扩展集和 Morii 实际敲字的扩展集必须是同一个；一旦分叉，保真数字描述的就不是被操作的那个东西了。13.5 已经在渲染基线上犯过一次这个错，这里不再犯第二次。

#### 跑起来才暴露的两个问题

**一、Vite 开发服务器把整个项目树端出去了，其中包括 `admin-b/.data/admin.db`。**整个数据库，http 直接下载，不需要任何会话——而隔壁 API 对每个请求检查 Host、Origin、CSRF 和对象级授权。守卫再严，文件本身能从旁边那个端口取走就没有意义。实测确认过：

```text
GET /.data/admin.db                            -> 200，4096 字节
GET /media/fixtures/../../.data/admin.db       -> 200，4096 字节
加上 server.fs.deny 之后                        -> 两条都是 403，媒体仍然 200
```

这不是原型代码的漏洞，是开发服务器的默认行为，但**属于「必须随结论报告」那一类**：任何把 Vite 开发服务器暴露出去的做法都会连带暴露数据库。

**二、图片节点取不到图片。**夹具正文写的是 `/media/fixtures/*.svg`，而文件在 `prototypes/fixtures/media/`，编辑器里只有一个碎图标。13.12 做图片真节点的意义正在于让作者看见图，所以补了一个只读的媒体中间件。

containment 用的是原型自己的 `safeResolve`，没有另写一套字符串判断。写的过程中还撞上一个值得记的点：第一版把已经拼好的绝对路径当 candidate 传进去，`safeResolve` 直接拒绝——它**刻意**只接受相对路径，绝对路径一律不猜。也就是说这个 API 的设计当场挡下了一次误用。

#### 靠操作真实应用验证，不是靠单元测试

浏览器里实际走了一遍：登录、列表出四篇夹具、打开中文那篇、七类语法全部按预期渲染（图片是图，其余是带左侧强调线的源码块）、点进 `::video` 源码块打字、自动保存、发布、读者面板出现正文。

其中最该记下的一条：光标点进 `::video` 块后打字，块内文本变成

```text
::vide  <- 光标进来了o{provider="youtube" id="aqz-KE-bpKQ" ...}
```

字插在了点击位置，也就是**块内部**。13.12 那条「源码块可编辑」的结构断言，到这里有了操作层面的对应证据。

登录表单的回车提交没能在自动化里验证：合成的 Return 没触发隐式提交。表单结构是对的（`<form>` 加 `type="submit"` 且未禁用），`requestSubmit()` 能正常登录，所以判断是自动化工具的限制。**这一条留给 Morii 在真实浏览器里确认。**

#### 本轮验证

```text
pnpm -C prototypes check          -> 退出码 0
pnpm -C prototypes test           -> tests 102 / suites 26 / pass 102 / fail 0
pnpm -C prototypes fixtures:check -> Fixture corpus is valid.
pnpm verify                       -> 退出码 0（60 files 0 errors、30/30、46 pages）
生产文件改动                        -> 无
```

#### 仍未做

截至 13.13，发布闸门只有请求形状校验，内容、媒体与翻译关系的完整校验没有接线；图片的 `alt` / `src` / `title` 虽然是结构化属性，但还没有属性面板可以改；没有草稿预览的生产同源渲染；原型 A 一行未写。**B 现在可以被操作，不等于 T1–T10 可以开跑。**13.14 随后记录 Morii 结束 A/B 比较并选定 B。

### 13.14 Morii 选定 B，原型 A 取消（2026-08-30）

Morii 实际使用原型 B 后确认体验满意，并明确表示不再需要开发原型 A。Phase 1 因此不再继续 A/B 对照，B 成为 Moriium vNext 的目标路线：Vue + Tiptap Admin 负责作者端，版本化数据库保存草稿与发布历史，公开站采用逐路由 Hybrid 策略，优先保留预渲染或缓存，只有确有需要的后台、权限草稿和即时路由按需渲染。

这项决定带来四个直接结果：

1. `prototypes/studio-a/` 不再开发；它没有失败，也没有输掉量化比较，而是由 Morii 根据 B 的实际体验直接结束候选比较。
2. 第 4 节 T1–T10 不再承担 A/B 评分任务。仍有价值的登录、写作、保存、预览、发布、回滚、移动端和故障演练会改成 B 的验收清单。
3. Phase 5 不再选择 A 或 B，而是为已经选定的 B 固定生产架构与项目合同，包括 API、数据库、可信 renderer、媒体、认证、备份、监控、安全、逐路由策略和回退。
4. 当前原型仍缺完整发布闸门、图片属性面板和生产同源草稿预览。选择 B 不会把这些缺口自动变成已完成，也不批准把 Vite 开发服务器、本地会话或 `node:sqlite` 尖峰直接暴露到公网。

**下一块固定为完整发布闸门。**先把 `shared/` 已有的内容、媒体与翻译关系契约接入发布路由，并用失败用例证明不合格内容无法公开。完成并验证后，再处理图片属性面板和生产同源草稿预览。

### 13.15 完整发布闸门（2026-08-30）

Codex 在 `3e55fae` 实现，本节由 Claude 依据提交内容与重新跑过的检查补记；Codex 当轮额度耗尽，没来得及自己写。

闸门放在 `admin-b/src/publishing/publish-gate.ts`，一次写操作都不做。HTTP 层不直接调用它，而是把它作为 `validate` 回调交给 `store.publish` / `store.rollback`：

```ts
const validate = (version: Version): void =>
  validateVersionForPublishing(options.store, version, options.media);
```

`store` 早就在事务里、改 `published_version_id` 与写审计行之前调用这个回调。位置选在这里是有代价意识的——放在路由里也能拦住请求，但拦不住「校验通过、写一半、再失败」的窗口。被拒时数据库应当**什么痕迹都不留**，这一点由 `routes.test.ts` 的新用例钉住：拒绝后 `publishedVersionId` 仍是 `null`，`listAudit` 仍是空数组，匿名端点仍返回 404。

三条契约都从 `shared/` 接过来，没有在闸门里重述规则：

- **内容**走新增的 `publishCandidate`。它从生产同源的 `sharedMetadata` 上 `pick` 出 title、slug、summary、lang、translationKey，再补一个非空 markdown，而不是在 HTTP 层另写一遍标题与摘要的长度规则。生产 frontmatter 剩下的字段仍是缺口，注释里写明这属于 Phase 2，理由是数据库模型还存不下它们，此时补默认值等于在发布时替 Morii 编内容。
- **翻译关系**走 `buildTranslationIndex` 与 `statusOf`，确认候选在自己的翻译组里确实是 available。
- **媒体**走新增的 `imageReferencesIn`：扫出正文里的图片引用，逐条要求正文 alt 非空、路径在媒体清单里、清单条目本身能过 `blockersForPublishing`。

两类失败刻意分开：内容不合格是 `validation-failed`（400），媒体不合格是 `media-gate-refused`（403）。夹具侧新增 `prototypes/fixtures/media/manifest.json`，收录两张 SVG。

负向用例按第 5 节的要求写成破坏尝试，不是确认清单：清单里没有的图片、指向站外的远程图片、空 alt 配未净化且带 GPSLatitude 的 jpeg、超长摘要，各自要求特定的错误码与错误文本。

#### 复核时补跑的一条

拦得住不合格内容只是一半，另一半是**别把合格内容也拦住**。播种进数据库的四篇夹具如果过不了自己的闸门，Morii 一点发布就会撞墙。把四篇全过一遍：

```text
seeded 4
PUBLISHABLE   zh/tide-notes
PUBLISHABLE   ja/tide-notes
PUBLISHABLE   zh/darkroom-log
PUBLISHABLE   zh/winter-drafts
```

#### 一处确认存在的过度拦截

`imageReferencesIn` 是正则扫全文，不区分围栏代码块。实测：

```text
输入   ```markdown 围栏里的 ![An example alt](/media/does-not-exist.svg)
       加正文里的行内 ![x](/media/inline.svg)
输出   两条都被当成真实图片引用
```

后果是具体的：一篇讲 Markdown 写法、正文里贴了图片语法示例的文章会被闸门拒绝，而那张图并不存在也不需要存在。方向是安全的一侧——`media.ts` 的注释写明了取舍理由，是不能让编辑器建模不了的行内图片绕过闸门——但这属于「必须随结论报告」那一类，接生产前要改成按解析结果取图片引用，而不是正则扫原文。

### 13.16 图片属性面板（2026-08-30）

Codex 在 `73d3bfb` 实现，同样由 Claude 补记。

13.12 把图片做成了带 `src` / `alt` / `title` 的真节点，但没有改它们的地方，`alt` 事实上改不了。这一节补齐第 3 档。

命令留在 Vue 之外，`editor/image-properties.ts` 只有两个函数：`selectedImageAttributes` 读当前 `NodeSelection`，不是图片就返回 `null`；`updateSelectedImage` 走 Tiptap 文档给的 `updateAttributes`。这样分是为了让测试能用真的 `Editor` 实例证明序列化结果，而不是绕过编辑器断言一个数据结构。

面板挂在 `selectionUpdate` 上，选中图片才出现。`title` 留空写回 `null`，Markdown 里就不带标题；`alt` 为空时面板当场提示发布闸门会拒绝这篇文章，与 13.15 的媒体闸门对上。

断言的是序列化结果：

```text
选中 ![Old alt](/media/a.svg "Old caption") 改 alt、清空 title
  -> getMarkdown() === '![New alt](/media/a.svg)\n'      路径与末尾换行都还在
选区是普通段落时
  -> selectedImageAttributes 返回 null
  -> updateSelectedImage 返回 false，原图片路径不变
```

#### 仍未做

面板不检查路径是否在媒体清单里，不合格的路径要到发布时才被闸门拒；没有媒体选择器，路径只能手打；13.12 那条「只认整行图片」的限制没有变。

#### 本轮验证（Claude 重跑，非转述）

```text
pnpm -C prototypes check            -> 退出码 0
pnpm -C prototypes test             -> tests 110 / suites 27 / pass 110 / fail 0
pnpm -C prototypes fixtures:check   -> Fixture corpus is valid.
pnpm -C prototypes roundtrip:report -> unextended 8/11；moriium-nodes 11/11（未变）
pnpm -C prototypes baselines:verify -> All 14 markers agree with the built page.
pnpm verify                         -> 退出码 0（60 files 0 errors、30/30、46 pages）
生产文件改动                          -> 无（git diff 21c739b..HEAD -- ':!prototypes' ':!docs' 为空）
```

三项待补的前两项到此完成，**剩下草稿的生产同源预览**。

### 13.17 草稿的生产同源预览（2026-08-30）

三项待补的最后一项。要求写在 13.14 与交接第 9 节里：**不要另写一套渲染**。

`preview/render.ts` 因此没有自己的渲染器，只调 `tools/build-baselines.mjs` 的 `createPublicRenderer()`——那个函数从 `astro.config.mjs` 取生产自己的 remark/rehype 链，并补回作为 Astro 集成、因而不在 processor 插件表里的 Expressive Code。为了让预览和基线连「写盘那一步」都同源，`build-baselines.mjs` 多导出两个函数：

- `renderMarkdown(renderer, markdown)`——render 加上剥掉内联 style/script，基线生成器现在也走它；
- `baselineBytes(html)`——基线文件真正落盘的字节。测试要断言逐字节相等，就不能自己再抄一遍那条末尾换行规则。

处理器缓存的是 promise 而不是结果：构建一次要装全部插件和两套 Expressive Code 主题，慢到不能按次重建，缓存 promise 还顺带让并发的第一次请求只建一个。

#### 路由

`POST /api/articles/:id/preview`。放在 `guardRequest` 之后是目的而不是顺手：**未发布的草稿不能被匿名请求或别的来源渲染出来**。请求体带 `markdown` 就渲染编辑器里还没保存的内容，不带就渲染库里的最新版本。两条路径都不写任何东西。

用 POST 而不是 GET，是因为要带的正文就是编辑器里的草稿，塞不进 URL，也不该进 URL。

#### 断言的是同源，不是「看着像」

```text
四篇夹具                  -> baselineBytes(预览) 逐字节等于 fixtures/baseline/ 里的文件
不带插件链的普通 processor  -> 与基线不相等（否则上一条对任何渲染器都成立，等于没断言）
一个 ts 代码围栏           -> 出 expressive-code，不出 astro-code（baselines:verify 抓过的正是这处）
HTTP                      -> 匿名 401；带会话但缺 CSRF 403；带齐 200 且文章仍未发布
带 markdown 的预览         -> 不新增版本，库里最新版本原样不动
```

**做过负向测试**：把 `renderPreview` 换成不带插件链的普通 processor，三条渲染断言当场红两条，换回来三条全绿。

#### 界面

右栏一个「生产渲染预览」面板，按钮触发，结果进 `iframe` 的 `srcdoc`。

刻意是手动的：处理器不便宜，而一个跟着每次击键自动更新的预览会被读成「线上就长这样」。

`sandbox="allow-same-origin"` 而没有 `allow-scripts`。第一版是 `sandbox=""`，实际打开发现图片全是碎图标：不透明来源下 `/media/fixtures/...` 没有可解析的基地址。给回同源之后图片正常，而没有 `allow-scripts` 的 srcdoc 框架拿到来源也做不了任何事。**以后要加 `allow-scripts`，必须先给媒体另找一条路。**

#### 说清楚它不是什么

**渲染同源，不是外观同源。**站点外壳、样式表和阅读端模块都不在原型里，所以提示块、代码块、剧透出来的是结构正确但没有样式的标记。面板上写了这句，不指望读者自己推断。

#### 顺带改的一处开发入口

`dev:b` 的两个端口和数据库路径现在认 `MORIIUM_API_PORT`、`MORIIUM_UI_PORT`、`MORIIUM_ADMIN_DB`。起因是实测：Morii 的实例还开着，第二个实例直接 EADDRINUSE 死掉，唯一的出路是杀掉别人的会话。三个环境变量让第二个实例带自己的端口和自己的库跑在旁边。Vite 那两个数字用内联配置覆盖，`vite.config.ts` 不动，`fs.deny` 那些规则仍然只有一份。

### 13.18 预览第一次运行就查出编辑器在给每篇文章加一张空图（2026-08-30）

预览接好之后，在浏览器里对夹具 `zh/tide-notes` 按下渲染，数了一下图片：**预览里两张，文章里一张**。多出来的那张是 `<img src="" alt="">`，挂在正文最后一段之后。

这不是预览的问题。预览渲染的是编辑器当前的 Markdown，所以多出来的东西是编辑器序列化出来的。

#### 复现

无头环境复现不了——`new Editor({ content: '' })` 需要 window。所以复现放在浏览器里，用 Vite 起一个临时页面，把 UI 的构造方式和 round-trip 的构造方式并排跑：

```text
new Editor({ content: markdown, contentType: 'markdown' })     -> 结尾正常
new Editor({ content: '' }) 之后 setContent(markdown)          -> 结尾多出 "\n\n![]()"

空文档的 JSON = {"type":"doc","content":[{"type":"moriiumImage","attrs":{"src":"",...}}]}
```

最后一行就是原因。ProseMirror 给 `block+` 补空位时，挑的是它能不带属性建出来的第一个块级类型；扩展 priority 同时决定 schema 里节点类型的顺序，而 `MoriiumImage` 写的是 `priority: 1_100`，压在 paragraph 的 1000 之上。于是**空文档被补成一张空图片**，`setContent` 之后那张填充图还留在末尾。

后果不止是难看：`ArticleEditor.vue` 正是 `content: ''` 起编辑器再 `setContent` 的，而自动保存写的是 `editor.getMarkdown()`。也就是说**打开一篇文章，自动保存就会把 `![]()` 写回正文**。空 alt 加不在媒体清单里的路径，13.15 的发布闸门迟早会拦下它——但那时呈现出来的会是「发布莫名其妙被拒」，不是「编辑器在改我的文章」。

#### 修法

先试的是把 `src` 变成必填属性，因为 ProseMirror 的 `defaultType` 会跳过 `hasRequiredAttrs()` 的类型。实测不成立：Tiptap 会把没写 `default` 的属性补成 `null`，在 ProseMirror 眼里仍然有默认值，空文档照样被补成图片。

成立的是把 `priority` 降到 `1_000`，也就是不再压过 paragraph。没有别的 tokenizer 认以 `![` 开头的行，所以它本来就不需要那个位置。

#### 断言

机制可以在无头环境里断言，不必等浏览器：

```text
getSchema(moriiumExtensions()).topNodeType.createAndFill() 的第一个子节点必须是 paragraph
```

**做过负向测试**：把 priority 改回 `1_100`，这条当场失败；改回 `1_000` 通过。

浏览器里另外确认了两件事：夹具的预览现在正好一张图，末尾那张没有了；在编辑器里全选删除，留下的是一个空段落而不是一张空图片。

#### 本轮验证

```text
pnpm -C prototypes check            -> 退出码 0
pnpm -C prototypes test             -> tests 116 / suites 29 / pass 116 / fail 0
pnpm -C prototypes fixtures:check   -> Fixture corpus is valid.（基线未变）
pnpm -C prototypes roundtrip:report -> unextended 8/11；moriium-nodes 11/11（未变）
pnpm -C prototypes baselines:verify -> All 14 markers agree with the built page.
pnpm verify                         -> 退出码 0（60 files 0 errors、30/30、46 pages）
生产文件改动                          -> 无
浏览器实操                            -> 登录、打开夹具、按生产管线渲染、图片可加载、全选删除
```

13.14 定下的三项待补到此全部完成。下一块是把第 4 节的 T1–T10 改写成 B 的验收清单，然后进入 Phase 5 的 B Hybrid 生产架构 ADR。

### 13.19 把 T1–T10 改写成 B 的验收清单（2026-08-30）

13.14 说过第 4 节不再承担 A/B 评分，但那一节的正文当时还是原样。这一轮把它改掉。

改的不是任务，是判据。登录、写作、保存、预览、发布、回滚、移动端、故障演练这些任务本身仍然成立，只是问题从「A 和 B 哪个更快」变成「B 能不能过」。评分表整个取消——已经没有第二个候选可以比，留着一张只有一列的表只会假装还有比较。编号从 T1–T10 变成 B1–B11，一一对应，旧编号在 4 节开头写明可追溯。

新增的是 B11 匿名公开阅读。原表没有这一项，因为 A/B 比的是作者端体验；一旦 B 成为路线，读者侧能不能读到、会不会读到不该读的，就必须进清单。

硬性否决项加了一条：**发布被拒之后不得留下半公开状态或一条审计记录**。13.15 把校验放进事务之前，这句话只能算主张，现在它可检查了，所以升成否决项。

#### 写清单逼出来的三个显式缺口

清单要求每项写「当前状态」，不接受「基本可用」。写到一半就发现有三项根本过不了，而此前没有任何文档说过：

1. **B2 存不下完整 frontmatter。**生产 `sharedMetadata` 有 14 个字段，B 的库里只有 5 个位置。`publishedAt`、`updatedAt`、`category`、`tags`、`cover`、`coverAlt`、`draft`、`unlisted`、`copyProtection` 九个没有列可放。`publishCandidate` 的注释里写过它是子集，但没有人把这件事换算成「B2 过不了」。
2. **B7 没有导入路径。**媒体闸门是齐的，导入不存在：不能上传，不调 `scripts/sanitize-media.mjs`，媒体清单是手写的夹具文件。闸门守的是「正文引用了什么」，不是「导入了什么」——这两件事此前一直被混着说。
3. **B11 的公开侧只有 JSON。**越权那半条早有用例证明，但「读到的就是读者真正会看到的东西」这半条没有对象可验，因为原型里没有渲染出来的阅读页。

三项都不是新出现的缺陷，是一直存在、只是没被写下来。**这就是把清单写实的价值**：判据一旦要求填「当前状态」，含糊的地方就藏不住。

#### 结论没有粉饰

十一项里，拿得出完整证据的只有三项（B3 内容块保真、B5 预览同源、B8 发布回滚）。部分三项，不能过两项，一次都没验过的三项。**B 被选中，不等于 B 通过了这份清单。**

其中 B4 中断恢复、B9 375 像素、B10 故障演练三项不需要任何新功能，只需要有人真的去做。做完之后清单上的空白就只剩范围边界那几项，而那几项要留到 Phase 5 的生产架构 ADR 里连同数据库模型和媒体管线一起定，不在尖峰里就地补一个将来要推翻的实现。

#### 顺带

`prototypes/` 里引用旧编号的地方一并改成 B 编号：`fixtures/README.md`、`shared/content-blocks.ts`、`shared/errors.ts`、`tools/build-baselines.mjs`、`tools/validate-fixtures.ts`。README 里留了一句映射说明，免得读到旧交接里的 T3 时对不上。全是注释与文档文字，没有行为改动。

```text
pnpm -C prototypes check          -> 退出码 0
pnpm -C prototypes test           -> tests 116 / suites 29 / pass 116 / fail 0
pnpm -C prototypes fixtures:check -> Fixture corpus is valid.
生产文件改动                        -> 无
```

### 13.20 B4、B9、B10 三项演练（2026-08-30）

13.19 说这三项「不需要新功能，只需要有人真的去做」。这一轮去做了。

演练用的是独立实例：`MORIIUM_API_PORT=4331`、`MORIIUM_UI_PORT=4330`、`MORIIUM_ADMIN_DB` 指向一个临时库。Morii 那个从上午一直开着的实例占着 4320/4321，**没有碰它**——13.17 加那三个环境变量就是为了不必杀掉别人的会话。

#### B9：375 像素

浏览器视口设成 375×812，打开夹具 `zh/tide-notes`，在正文里真的敲了字。

```text
documentElement.scrollWidth / clientWidth   = 375 / 375     无横向溢出
.cols                                        = 单列 grid    侧栏改为堆叠
编辑器里的源码块 pre                          = overflow-x: auto + pre-wrap，自己滚
敲字之后                                      = 自动保存于 11:15:27（读者看到的内容不变）
```

**通过**，但有一条要记下来的观察：右栏那三个面板（版本历史、生产渲染预览、读者看到的）在这篇长文下落到 `top ≈ 3124px`。不是溢出，是**在手机上要滚完整篇正文才够得到**。窄屏下要不要把面板挪到正文之前，或者做成可折叠，是界面决定，留给 Morii。

工具限制要写清楚，别记成应用缺陷：**移动模拟打开后，自动化的合成触摸点击一律 30 秒超时**。光标位置因此是用脚本放的，敲进去的字仍然是真实键盘事件。B1 那条回车提交没验过，同样卡在这个限制上。

#### B4：杀进程再起来

按顺序做的：发布版本 #5 → 继续在正文里打字 → 自动保存出版本 #6 → `Stop-Process -Force` 杀掉进程 → 用同一个库重启。

```text
重启后 dev:b        -> Articles: kept from the previous session
编辑器里            -> #6 的内容还在（带 UNSAVED-AFTER-PUBLISH 标记）
公开指针            -> 仍然是 #5
匿名端点            -> 200，正文里没有那个标记
会话                -> 没了，要重新登录（内存会话，已知）
```

两条判据都成立：最后一次自动保存的正文还在，读者看到的内容没变过。**通过。**

边界要写明白：**自动保存失败之后打的字没有活下来。**在 API 已经停掉的窗口里敲的 `WHILE-API-DOWN` 只存在于那个没刷新的页面上，重开就没了。这不是缺陷，是自动保存的定义；但它和下面 B10 的发现合起来，就是一句要说给作者听的话——连接断了以后打的字，只活在这一个没刷新的标签页里。

#### B10：两种故障，两个真问题

**API 断开。**趁进程停着继续打字：

```text
编辑器内容      -> 还在，没有被清掉
状态            -> 停在「未保存的改动…」，没有谎称已保存
作者看到的错误  -> TypeError: Failed to fetch
```

数据没丢，状态没撒谎，但**「可理解的失败」这条不成立**：作者读到的是一个 JavaScript 类型名。而且自动保存失败之后不会自己重试，`scheduleAutosave` 只在下一次编辑时才再排一次。

**数据库锁。**另一个进程拿住写锁（`BEGIN IMMEDIATE`，持有 20 秒），期间点「保存版本」：

```text
HTTP        -> 500 Unexpected server error.
服务端日志  -> Error: database is locked
版本表      -> 仍是 6 / 5 / 1，没有半条记录
公开指针    -> 仍是 5
审计        -> 仍只有一条 publish
```

数据是安全的，事务回滚正确。但 `shared/errors.ts` 早就把 `db-locked` 建模成可重试，`statusForError` 早就把它映射成 503——**从来没有人把 SQLite 的 `SQLITE_BUSY` 抛成它**，所以那整条路径是死的。声明了一个失败模式而从不触发它，比没声明更糟：读代码的人会以为它被处理了。

#### 演练当场修掉的两处

**一、`store.ts` 现在把写入争用分类成 `db-locked`。**`asStoreError` 认 SQLite 自己的措辞，`#write` 包住每一条写路径。第一版只包了 `#transaction`，用例照样红——因为 `saveVersion` 是单条 INSERT，根本不走事务。**这就是先让它失败一次的价值**：不写这条用例，就会以为包住事务等于包住了写入。

用例需要文件库，`:memory:` 没有第二个连接可以争：开一个临时目录，用第二个 `DatabaseSync` 持锁，断言 `saveVersion` 抛 `PrototypeError`、`code === 'db-locked'`、`retryable === true`，并且版本数不变、锁一放开就能正常写。修之前它抛的是裸 `Error: database is locked`，断言函数返回 false。

**二、界面不再把 `TypeError` 端给作者。**`report()` 现在分开处理：`ApiError` 照原样显示，其余按「连接不上后台」讲，并且明说这次没有保存、改动还在编辑器里、再改一个字才会重新触发保存。原始信息留在括号里备查。

**没修的：自动保存失败之后仍然不会自动重试。**加一个退避重试要连着「重试期间界面显示什么」「重试多少次以后放弃」一起想，属于界面决定，不在这一块里顺手做。B10 因此记「部分」而不是「通过」。

#### 本轮验证

```text
pnpm -C prototypes check          -> 退出码 0
pnpm -C prototypes test           -> tests 117 / suites 30 / pass 117 / fail 0
生产文件改动                        -> 无
浏览器实操                          -> 375 像素改稿、杀进程恢复、API 断开、数据库锁四个场景
```

清单上「一次都没验过」这一格，现在是空的。

### 13.21 闸门原来看不见空路径的图片（2026-08-30）

Morii 问「现在有什么可以测的」，顺手读了一下他实际在用的那个库（`admin-b/.data/admin.db`，只读副本），结果是：

```text
#1 zh/tide-notes    4 个版本，已发布 #7   带 ![]() 的版本：5、6、7
#3 zh/darkroom-log  2 个版本，已发布 #8   带 ![]() 的版本：8
audit  publish#1 publish#1 rollback#1 rollback#1 publish#3 publish#3
```

13.18 那个填充图片确实写进了他的正文，而且**两篇文章当前公开的版本都带着它**。这一条本身已经记过了。

新的发现是第二层：把这四篇的最新版本逐一过一遍发布闸门，**四篇全部「可发布」**。

原因在 `media.ts` 的正则：

```text
路径组写的是 ([^\s)]+)   至少一个字符
而 ![]() 的路径是空的     根本不匹配
```

不匹配意味着这个引用对闸门**不可见**——不是被判为合格，是压根没被看见。所以 13.18 之后交接里写的那句「发布时靠闸门拦下来」是错的，已改。

修法是把路径组改成 `*` 并单独判空，给一句自己的错误信息（「missing from the media manifest」用在空路径上会打印一个空名字，读起来像清单出了问题）。**做过负向测试**：把 `*` 改回 `+`，新用例当场失败。

值得记的一点：**这个缺口是靠读真实数据发现的，不是靠读代码。**闸门的每条用例都在传一个非空路径，因为写用例的人想的是「路径对不对」，而不是「有没有路径」。夹具语料里也没有空路径的图片——它是编辑器生成的，不是人写的。

```text
pnpm -C prototypes check          -> 退出码 0
pnpm -C prototypes test           -> tests 118 / suites 30 / pass 118 / fail 0
pnpm -C prototypes fixtures:check -> Fixture corpus is valid.
生产文件改动                        -> 无
```
