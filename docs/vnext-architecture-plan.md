# Moriium vNext 架构路线

> 状态：**提案，尚未批准实施**  
> 日期：2026-08-29  
> 适用范围：公开站、写作工具、内容模型、媒体管线与部署边界  
> 当前生产约束仍以 [`AGENTS.md`](../AGENTS.md) 和 [`architecture.md`](architecture.md) 为准。

## 结论先行

Morii 已补充确认：只要整体体验更好，Moriium 可以接受登录、数据库、常驻服务和更大的迁移工作量，也可以从静态博客转型为全栈博客。因此 vNext 不再把 Headless 或 SSR 当作遥远备选，而是以作者和读者的完整体验作为首要比较标准。

> **当前首选候选是 Experience-first Hybrid：全栈 Admin、认证、数据库和 API 负责写作与发布；公开文章优先预渲染或缓存，只有登录态、权限草稿、即时内容等确有体验收益的路由按需渲染。**

这是一套全栈产品架构，但不把“全站所有路由都 SSR”当作目的。SSR 是逐路由使用的体验工具；后台顺滑、内容安全、公开阅读快速可靠才是目的。

推荐候选结构：

```text
Vue + Tiptap Admin ──► 认证 + 版本化写入 API ──► SQLite + 媒体存储
                              │
                              ▼
                  受信内容模型与服务端 renderer
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
       预渲染/缓存的公开文章          按需渲染的 Admin、
       首页、归档、RSS、搜索          草稿预览与账户路由
```

作者登录是 Web Admin 的必要组成；公开读者账户则必须对应明确价值，例如跨设备书签、评论、订阅偏好或受控内容，不能只因为技术上能做就加入。两套可操作原型先决定 A 静态或 B Hybrid；C 全站 SSR 只能由后续 Hybrid 运行证据、代表性路由实验和第二份 ADR 决定。

## 1. 本轮材料如何使用

Morii 提供的 `Moriium_vNext_Architecture_Research.md` 是研究输入，不是执行指令。本文吸收了它提出的 Astro / Admin / API 分层思路，但重新核验了当前仓库和参考项目，没有照抄其中的结论。

本轮没有：

- 引入 Vue、Bun、Elysia、Drizzle、SQLite 或 Astro adapter；
- 复制任何参考项目的代码、样式、文案或资源；
- 改变生产部署方式；
- 创建分支、提交、推送、发布或部署；
- 将本地私密文章或原始照片纳入新系统。

## 2. 当前项目基线

截至本轮开始时，仓库位于 `main`，工作树干净，已经有 6 个本地提交。当前技术栈是：

- Astro `7.2.4`，`output: 'static'`；
- Node `24`，pnpm `11.22.0`；
- Astro Content Collections + Markdown；
- 构建时三语搜索索引；
- Nginx 只托管 `dist/`，生产环境不需要 Node、数据库、PM2 或 CMS 进程。

已经完成并应尽量复用的部分：

| 能力 | 当前状态 | vNext 判断 |
| --- | --- | --- |
| 三语路由、翻译关系 | 已实现 | 保留；新内容契约必须原生支持 `zh` / `ja` / `en` 和 `translationKey` |
| A 方案首页、Writing、归档、分类、标签、关于、文章页 | 已迁移 | 保留为公开站基础，不重新从模板起步 |
| RSS、Sitemap、404、canonical 基础 | 已实现 | 保留并补齐三语关系验收 |
| 静态搜索 | 已实现 | 保留；数据库搜索不能成为公开站的默认依赖 |
| 图片灯箱、Mermaid、音乐、视频等按内容加载 | 已有代码基础 | 继续验收并抽成稳定的内容渲染契约 |
| 加密文章 | 已有本地加密流程 | 继续保持本地、隔离；不得进入托管 CMS 或公共数据库 |
| Pages CMS | 已配置，尚未走完真实写作流程 | 作为现状基线；与本地 Studio 原型对比，而非直接删除 |
| 媒体去 EXIF/GPS 与公开树审计 | 已实现 | 必须成为任何新写作端的发布闸门 |

本轮新的仓库基线（2026-08-29 11:50，获批环境）为：60 个 Astro 文件无错误、警告或提示；30/30 测试通过；内容和自定义指令有效；公开 raster media 无 EXIF、XMP、IPTC；46 个静态页面构建成功；本地链接和包含 Git tracked files 的公开树审计通过。Vite 仍有一个既有的“大于 500 kB 分包”警告，进入 Phase 0 的体积测量清单。

这是 repository/build baseline，不是对当前线上站点的探测。`architecture.md` 描述的是获批部署合同；当前线上 SHA、Nginx 实际配置和外部可达性没有在本轮核验。

原 TODO 的 07–14 项没有作废。它们成为“当前公开站稳定化清单”，在 vNext 选择完成前暂停新增视觉迁移，但其中的灯箱、内容块、加密、多语言和隐私验收会直接转化为 vNext 的验收样本。

## 3. 参考项目核验后的修正

### 3.1 ohmyblog：适合拆解，不适合整仓继承

当前源码确认它是 Vue 3 + Tiptap 前端，以及 Bun + Elysia + Drizzle + SQLite 后端。值得研究的部分包括：

- 草稿、发布、归档、回收站状态流；
- Admin 自动保存和上传体验；
- 公共与管理路由分组；
- 反向代理层数与真实 IP 的显式配置；
- 数据目录和 SQLite 持久化约定。

附件中的正文契约描述已经漂移。当前数据库同时保存：

- `content`：ProseMirror JSON，编辑器源数据；
- `contentHtml`：前端编辑器导出的 HTML；
- `contentText`：搜索与摘要文本。

公开文章查询的源码选择的是 `contentHtml`，而仓库 README 又写作 `contentMarkdown`；路由注释仍提到返回 ProseMirror JSON。也就是说，项目本身存在文档与实现不同步，不能把任一处说明直接当作 Moriium 的稳定 API 设计。

另一个不能忽略的信号是：后端 `test` 脚本仍是失败占位符，浅克隆中没有项目测试文件。Moriium 若借用其架构，必须自行建立契约、迁移、安全和状态机测试，不能把“项目功能丰富”理解成“可直接作为可靠内核”。

因此：

- 不 fork 整个 ohmyblog 作为 Moriium 主仓库；
- 不继承评论、友链申请、访问量、注册、公开账户等超出 Moriium 范围的功能；
- 不让浏览器提交的派生 HTML 成为可信公开正文；
- 如采用 Tiptap，以 JSON 为编辑器主数据，服务端或受信构建阶段重新生成并净化 HTML；
- Admin DTO 与 Public DTO 分开，公共 API 必须版本化。

### 3.2 Momo：不只是视觉参考，也提供了更贴近现状的写作路线

Momo 当前 `main` 已包含 `cms/`：一个 Hono + Vite 的本地管理工具，直接读写 `src/content/blog/**/*.md`，提供 frontmatter 表单、Markdown 源码编辑、实时预览、图片上传和内容统计。

这条路线对 Moriium 的价值高于直接引入数据库：

- 继续以 Git 中可审阅、可回滚的 Markdown 为唯一公开内容源；
- 可以直接复用当前三语 schema、扩展指令、构建校验和部署；
- CMS 不暴露到公网，不新增登录、Cookie、CSRF、限流、备份和灾难恢复责任；
- 写作体验可以独立换血，不必同时重写公开站。

Moriium 不应复制 Momo 的 CMS 代码或样式。可借鉴的是“本地写作 UI 写回 canonical Markdown”的边界，以及预览必须调用与生产一致的 Markdown 处理器这一原则。

### 3.3 Revista：摄影站更需要媒体契约与交互测试

Revista 3 仍采用 Astro 内容集合和静态页面，按内容类型拆分多个 collection，并为 lightbox、键盘、导航、搜索、SEO、无障碍和视觉基线建立 Playwright 测试。

可取之处：

- 摄影内容不必通过数据库或 SSR 才能获得良好体验；
- 图像集合、文章集合和作者信息可以有不同 schema；
- 灯箱的缩放、触摸、预加载、焦点与退出行为应成为自动化测试对象。

其自制灯箱只作为交互案例，不直接移植。Moriium 已使用 PhotoSwipe，并且还要验证 focus return、长图、键盘和无图片文章不加载资源；没有理由为了“换血”退回一套未经本项目验证的自制实现。

### 3.4 Astro 7：能做按需渲染，不代表当前就该做

Astro 官方文档说明：页面默认在构建时预渲染；需要按请求渲染时才添加 adapter 并逐路由退出预渲染，或者为高度动态的应用选择 `output: 'server'`。

Astro 7 的 live content collections 可以在请求时从 CMS、数据库或 API 读取内容，但官方也明确列出当前代价：

- 需要 adapter；
- 每次请求读取，除非自行缓存；
- 没有持久 content-layer data store；
- 运行时没有 MDX 支持；
- 运行时没有 Astro 图片优化。

这些限制正好击中 Moriium 的高级 Markdown 与摄影需求。因此 live collections 可以做后续原型，不能被当成无成本的 Content Collections 替代品。

若以后在 VPS 使用 `@astrojs/node`，官方支持的是 Node standalone，或挂到 Express / Fastify 等 Node request/response 兼容服务器。不要假定它可以直接塞进 Elysia/Bun 同一进程。默认设计应是两个独立服务，由 Nginx/Caddy 路由；只有经过可运行原型和官方兼容性证据后才考虑合并。

### 3.5 AstroPaper 与 Retypeset：作为静态路线的对照组

本轮也复查了当前 AstroPaper 与 Retypeset。它们继续以 Astro 静态内容站为核心，通过构建时内容、静态搜索和按文章增强获得完整博客体验。Moriium 已经在早期设计研究中记录过两者，因此本轮不重复吸收视觉样式，只保留一个架构结论：高级阅读能力、三语发现路径和良好 SEO 并不天然要求数据库或 SSR。

## 4. 三条候选路线

| 路线 | 公开站 | 写作源 | 发布方式 | 优点 | 主要代价 | 判断 |
| --- | --- | --- | --- | --- | --- | --- |
| A. 静态站 + 本地 Studio | Astro SSG | Markdown | Git + CI | 运维最轻；内容保真与隐私边界清楚 | 远程写作、即时预览和发布体验较弱 | 保留为体验与可靠性对照组 |
| B. 全栈 Admin + 混合公开站 | Astro 逐路由预渲染/按需渲染 | DB 中的版本化 canonical content | Admin 发布 + 重验证/构建/缓存失效 | 接近 ohmyblog 的后台体验；公开阅读仍可保持静态速度与降级能力 | 需要认证、权限、迁移、备份、缓存和监控 | **当前首选候选，先做垂直切片** |
| C. 全栈 Admin + 全站 SSR | Astro server | DB 中的版本化 canonical content | 请求时读取 | 所有内容与个性化状态即时 | 故障域、缓存和公开阅读可用性成本最大 | 只有实测优于 B 才选择 |

### 选择 B 的判断标准

不再要求先证明本地 Studio 失败。B 与 A 使用同一内容 fixture 完成可操作原型，比较完成任务所需时间、点击数、错误恢复、移动端写作、预览一致性、发布等待和长期维护成本。只要后台体验的净收益足以覆盖运行时成本，B 可以直接成为 vNext 主线。

### 选择 C 而不是 B 的条件

至少同时满足以下大部分条件，才值得让所有公开内容默认按需渲染：

1. 已选择全栈 Admin 与数据库；
2. 发布到公网必须在一分钟内可见，CI 构建延迟不可接受；
3. 需要带权限、带过期时间的真实草稿预览；
4. 内容量或更新频率让全站构建成为已测量的瓶颈；
5. 全站 SSR 相比混合路线在真实网络和缓存条件下有可感知收益；
6. 已经完成故障时的静态降级或缓存兜底设计。

Morii 已确认可以接受对应工作量，但当前仍没有证据证明“所有公开页面 SSR”比混合路线体验更好。

## 5. 推荐目标：Experience-first Hybrid vNext

### 5.1 应用边界

```text
apps/web       Astro 公开站；逐路由预渲染、缓存或按需渲染
apps/admin     作者后台；文章、翻译、媒体、预览、发布、版本历史
backend        候选一：Astro Actions + middleware + sessions
               候选二：独立的版本化 API 服务
database       canonical content、版本、账户、会话与审计元数据
object/media   经净化的公开衍生图；原图不进入服务端

packages/contracts         Public/Admin DTO、权限与 schema
packages/content-core      canonical content、版本迁移与校验
packages/content-renderer  服务端可信渲染
packages/media             资源元数据与衍生图策略
```

Phase 1 仍保留本地 Markdown Studio 作为对照原型，但全栈 Admin 是同等优先、当前更有希望的候选。Astro 当前提供 Sessions、Actions、中间件与按需渲染能力；官方同时说明没有唯一的 Astro 认证方案，因此认证库、会话存储和独立 API 拓扑都必须通过尖峰与安全 ADR 决定。

公开站按页面选择渲染方式：文章、分类、标签、归档、RSS、Sitemap 和匿名搜索优先预渲染或缓存；Admin、账户、权限草稿预览和真正依赖登录态的页面按需渲染。这样全栈能力不会无条件扩大公开阅读的故障域。

### 5.2 内容契约

两条原型先共用现有 Markdown fixture 作为输入基线；最终 canonical source 由原型决定：

- frontmatter 仍由 `src/content.config.ts` 约束；
- Moriium 自定义指令仍由现有 remark/rehype 管线处理；
- 两个预览都必须调用同一受信处理器，不维护第二套“看起来差不多”的 CSS/解析器；
- 文件原型使用临时文件 + 原子替换；数据库原型使用事务、内容版本与并发控制；
- 自动保存只产生草稿版本，不直接改变公开版本；
- 发布动作先运行内容、媒体与权限校验，再原子切换公开版本并留下审计记录；
- `.private/posts/` 和口令不在 Studio 的公开文章接口中出现。

两个原型必须保持等价的状态语义：

- 新文章默认是草稿；编辑现有文章产生新草稿版本，不直接覆盖当前公开版本；
- 文件原型自动保存只改本地工作树；数据库原型自动保存只写未发布版本；
- “准备发布”运行内容、媒体、翻译关系与权限检查，并展示将要公开的差异；
- 文件原型通过另行批准的 Git 流程发布；数据库原型通过显式、可审计、可回滚的发布动作切换版本；
- draft 不得进入公开路由、RSS、Sitemap 或搜索索引，测试必须证明这一点；
- 文件原型开放编辑期间，不允许 Pages CMS 同时编辑同一分支；数据库路线迁移后，Pages CMS 只能保留为只读历史入口或停用，不能形成长期双写。

### 5.3 Tiptap 的位置

Tiptap 可以进入 Admin，但原型开始时仍是可替换的编辑界面，不自动改变内容真源。

官方的 Markdown extension 已支持 Markdown 与 Tiptap JSON 双向转换，但仍标为 Beta，并明确存在表格与部分复杂内容限制。Moriium 还有 admonition、音乐、视频、GitHub 卡片、剧透、Mermaid、加密文章等自定义语法，所以必须先做 round-trip corpus：

```text
Markdown fixture
   │ parse
   ▼
Tiptap JSON
   │ serialize
   ▼
Markdown output
   │ production render
   ▼
HTML / feature markers / no-JS fallback
```

只有在语义、资源引用、空行、代码 fence metadata 和自定义指令不丢失时，Tiptap JSON 才能成为 canonical content。否则 Admin 必须保留源码编辑器或为高级块提供无损专用节点，不能用派生 HTML 掩盖数据丢失。

## 6. 全栈候选的迁移边界

全栈方案应作为可回退的独立迁移项目，而不是在现有根目录一次性推倒重来。

建议边界：

```text
apps/web       Astro；逐路由选择预渲染、缓存或按需渲染
apps/admin     已选编辑器；Tiptap 仅在 Phase 1 通过后采用
backend        Astro Actions/中间件/会话，或独立 Bun + Elysia API
packages/contracts         Public/Admin DTO 与 schema
packages/content-core      canonical content、版本迁移与校验
packages/content-renderer  服务端可信渲染
packages/media             资源元数据与衍生图策略
```

关键规则：

- Headless 不自动改变内容真源：若 Phase 1 选择 Markdown 保真，API/数据库保存或引用的 canonical content 仍是 Markdown；只有 Tiptap 成为完整默认编辑器且迁移 ADR 获批后，`contentJson` 才成为 canonical source；
- HTML、纯文本、目录和搜索字段都由服务端或受信构建任务从 canonical source 派生；
- 不接受浏览器把任意 `contentHtml` 当作公开真源；
- 文档 schema 必须有版本号和向前迁移器；
- Public DTO 不返回草稿状态、删除时间、账户字段或内部配置；
- 多语言不是一个 `language` 筛选条件，而是文章实体与翻译版本的明确关系；
- 图片 binary 不进 SQLite；数据库只保存 asset metadata；
- 原始照片继续留在本地私有目录，上传链路只接收经过批准的公开衍生图；
- 加密文章继续使用本地流程，不以“数据库私有行”替代端到端加密边界。

如需从 Markdown 切换到 `contentJson`，必须另有一份迁移 ADR，至少定义：写入冻结时刻、一次性 importer、schema version、逐篇语义/媒体摘要、旧新渲染对照、失败回滚点，以及禁止长期双写。没有这份 ADR 和 Morii 的迁移批准，Markdown 始终是 canonical source；采用 Headless 本身不构成切换理由。

## 7. 分阶段开发路线

### Phase 0 — 决策基线与冻结样本

目标：让后续重构有可比较的基准。

- 对当前 `main` 跑一次完整 `pnpm verify`；
- 记录当前页面数、初始 JS、搜索索引、构建耗时和大型分包；固定机器、冷构建、无 GitHub token，分别记录 `/zh/`、无高级模块文章和全功能 fixture 的未压缩/压缩传输量；
- 建立内容 fixture corpus：三语、图片、长图、代码、数学、Mermaid、音乐、视频、GitHub 卡片、提示块、剧透、加密文章；加密内容只能使用人工编写的虚构正文、测试口令和测试密文，绝不读取真实 `.private/posts/`；图片只用生成素材或已批准且已净化的公开衍生图；
- 把旧 TODO 07–14 的验收要求转成可重复测试；
- 写出作者与读者体验任务：登录、进入后台、新建、自动保存、预览、发布、回滚、公开阅读和故障降级；
- 明确作者账户与可选读者账户的角色、权限和实际价值。

退出条件：vNext 有可量化的“不能退步”清单。

### Phase 1 — 两条端到端体验尖峰

获得 Morii 对 Phase 1 的代码与依赖授权后，使用同一套虚构 fixture 做两个隔离原型，不进入生产路由：

1. A：本地 Markdown 编辑 + frontmatter 表单 + 生产同源预览；
2. B：单一作者登录 + Tiptap 编辑 + 自动保存 + 数据库存储 + 权限草稿预览 + 测试发布。

比较：任务完成时间、点击数、移动端体验、内容保真、三语与图片处理、自动保存/冲突恢复、预览到公开页面的一致性、发布延迟、安全、依赖和维护成本。

退出条件：Morii 实际操作两个原型并选择 A 静态或 B Hybrid 全栈作为主线；所有 fixture 仍可由现有站点安全渲染。C 全站 SSR 不在本阶段选择。

### Phase 2 — 内容、身份与媒体契约

- 抽出可由 CLI、Studio 和 Astro 共用的 schema；
- 为自定义内容块定义稳定语法、属性、no-JS fallback 和版本策略；
- 为照片定义 asset manifest：公开路径、宽高、格式、alt、caption、版权、可公开 EXIF 白名单；
- Studio 调用现有 sanitize/check 流程，不能绕过；
- 定义 Markdown import/export 与失败回滚。
- 定义作者、管理员和可选读者角色；认证、授权、会话、CSRF、速率限制、审计日志与恢复流程写入独立安全 ADR；
- 定义数据库迁移、事务、备份恢复、canonical content 与派生 HTML 的信任边界。

共享代码的依赖方向固定为：框架无关的 `content-core` 只依赖普通 TypeScript/Zod/Unified 能力；Astro 配置、Studio HTTP 层和 CLI 都是薄适配器，不能反向被 core 导入。Phase 2 再根据原型决定它留在 `src/lib/content-core/` 还是升级为 workspace package。

退出条件：写作端不需要复制生产解析逻辑，媒体隐私门禁可自动证明。

### Phase 3 — 选中写作系统的可用版

- 三语文章列表和 translationKey 关系；
- 新建、编辑、草稿、预览、媒体导入；
- 自动保存、冲突检测、版本差异和恢复；文件路线使用原子写入，全栈路线使用事务与内容版本；
- 静态路线只显示 Git diff，不自动 commit/push；全栈路线使用版本历史与显式发布动作，不让自动保存直接公开；
- Windows/PowerShell 本地启动说明；
- 选中系统的单元、集成与端到端测试；全栈路线额外覆盖作者登录、授权、显式发布、回滚和数据库故障。

退出条件：Morii 能用选中的写作系统完成一篇三语或部分翻译文章，并通过对应的发布与回滚检查。

### Phase 4 — 公开站内容系统稳定化

- 完成旧 TODO 07–12；
- 将内容 feature detection 从正则约定逐步收敛到解析后的 manifest；
- 完成图片/灯箱、复杂代码、Mermaid、外部媒体、加密文章验收；
- 补齐 `hreflang`、canonical、RSS 和 Sitemap 三语关系；
- 固定设计 tokens 和摄影宽度层级。

退出条件：公开站对新旧写作端生成的同一内容表现一致。

### Phase 5 — 架构选择 ADR

用 Phase 0–4 的原型数据和 Morii 的实际操作回答：

- A 与 B 哪个后台更顺手，差距是否足以承担全栈运维；
- 公开路由哪些需要个性化或即时数据，哪些应继续预渲染；
- canonical content 应继续为 Markdown，还是在完整 Tiptap 验证后迁移为版本化 JSON；
- 作者登录、读者账户、草稿权限和恢复机制是否完整；
- 数据库、媒体、缓存和构建任一故障时如何降级。

ADR 只能选择 A 或 B，并为 B 固定初始逐路由 Hybrid 策略。当前首选候选是 B，但必须由可操作原型而不是架构偏好胜出。选中全栈路线时，同一 ADR 还要更新 `AGENTS.md`、部署合同、威胁模型和回退方案。C 只能在 Phase 6A 运行证据、Phase 6B 实验和第二份扩围 ADR 后成为生产候选。

### Phase 6A — 全栈 Hybrid 影子系统

- 只迁移 fixture 和测试文章，不先迁移全部内容；
- 先实现 `/api/v1/public/*` 契约与 Admin 状态机；
- 建立作者认证、Admin、版本化 API、数据库迁移与备份恢复；
- 公开文章默认预渲染或缓存，Admin 与权限草稿按需渲染；
- 测试构建触发、断网、数据库锁、备份恢复、媒体故障与草稿越权；
- 双轨运行，旧静态内容保持可回退。

退出条件：B 在写作、发布、公开阅读与故障恢复上均达到验收线，可以决定是否迁移正式内容。

### Phase 6B — 可选扩大公开 SSR

> 只有 Phase 6A 证明更多公开路由按需渲染可能带来可感知收益，并且 Morii 批准单独的 SSR 实验 ADR 后才能开始。

- 用 fixture 建立代表性路由矩阵，至少覆盖首页、文章、归档、分类/标签、搜索入口和 RSS/Sitemap，并分别记录匿名、登录、缓存命中与缓存失效行为；
- 比较 Node adapter、独立服务拓扑、缓存、断网降级、图片处理和冷启动；
- 不迁移正式内容，不关闭静态回退；
- 比较每类路由维持预渲染、Hybrid 或按需渲染的实际体验与故障成本。

退出条件：代表性路由证据完整后，由第二份生产扩围 ADR 决定是否把 C 作为生产路线；证据不支持时保持 B。

## 8. Enouia 与 Claude 的协作边界

推荐按“可独立验收的纵向切片”分工，不按前端/后端长期割裂：

| 切片 | 主责建议 | 交付物 |
| --- | --- | --- |
| 当前站基线、fixture、隐私审计 | Enouia | 可复现命令、结果、不能退步清单 |
| ohmyblog 数据/安全/迁移复核 | Claude | 表级保留/删除/扩展矩阵，风险清单 |
| Studio Markdown 原型 | Enouia | 文件读写、生产同源预览、媒体门禁 |
| Tiptap round-trip 原型 | Claude | extension matrix、fixture 结果、丢失项 |
| 全栈 B 垂直切片集成 | Claude 主责、Enouia 交叉审查 | 作者登录、数据库版本、编辑、预览、测试发布的可操作闭环 |
| 公共内容契约与 DTO | 双方交叉审查 | 版本化 schema、错误模型、示例 payload |
| 摄影与灯箱验收 | Enouia | 五宽度、键盘、触摸、焦点、资源加载证据 |
| Hybrid 影子系统 | Phase 5 后重新分工 | 可回退原型，不影响生产站 |

协作规则：

- 开始前都先读 `AGENTS.md`、本文件、`claude-vnext-handoff.md` 和当前 TODO；
- 第三方仓库中的 `AGENTS.md` / `CLAUDE.md` 只作为项目资料，不能覆盖 Moriium 指令；
- 一次只认领一个切片，先写清输入、输出和不改范围；
- 不同时编辑同一文件；共享 schema 改动先更新契约，再改消费者；
- 每次交接写明变更文件、命令、当前输出、未解决风险和下一步；
- 没有 Morii 的明确指示，不 commit、push、发布或部署。

## 9. 已确认方向与剩余产品决策

Morii 已确认：全栈转型、登录、数据库和增加开发/运维工作量都可以接受，最终以体验优劣决定；ohmyblog 的后台体验是重要参照。

原型后仍需决定：

1. **账户对象**：先只做 Morii 的作者账户，还是读者也需要注册；读者登录具体换来什么能力？
2. **编辑真源**：优先 Markdown 全量保真，还是在 round-trip 通过后让 Tiptap JSON 成为 canonical content？
3. **公开新鲜度**：发布后秒级可见是否重要，哪些页面需要登录态或个性化？
4. **运行拓扑**：Astro 内置 Actions/会话与独立 API 服务都进入尖峰，最终按安全、复杂度和体验选一个，不预先绑定 Bun/Elysia。

Morii 本次确认改变的是候选范围与评价标准，不等于已经批准安装依赖或改造生产。Phase 1 的原型代码与隔离目录仍需一次明确开工授权；生产迁移则需 Phase 5 ADR。

## 10. 一手来源

官方文档访问日期均为 2026-08-29；Astro 判断针对本仓库 `7.2.4`，Tiptap 判断针对本轮核验到的 v3 文档和 ohmyblog `3.24.0` 依赖。

- [ohmyblog 当前 README](https://github.com/JGG0sbp66/ohmyblog/tree/9ba4534e6e2979506d7ad6fa5c957d433df8f518)
- [ohmyblog 文章表定义](https://github.com/JGG0sbp66/ohmyblog/blob/9ba4534e6e2979506d7ad6fa5c957d433df8f518/ohmyblog-backend/db/table/post.ts)
- [ohmyblog 文章 DTO](https://github.com/JGG0sbp66/ohmyblog/blob/9ba4534e6e2979506d7ad6fa5c957d433df8f518/ohmyblog-backend/src/dtos/post.dto.ts)
- [ohmyblog 后端 package.json](https://github.com/JGG0sbp66/ohmyblog/blob/9ba4534e6e2979506d7ad6fa5c957d433df8f518/ohmyblog-backend/package.json)
- [Momo 当前仓库](https://github.com/Motues/Momo/tree/24c37d28a5c7d27e235506baea2623a3f0a13ad1)
- [Momo 本地 CMS 说明](https://github.com/Motues/Momo/blob/24c37d28a5c7d27e235506baea2623a3f0a13ad1/cms/AGENT.md)
- [Revista 3 当前仓库](https://github.com/erfianugrah/revista-3/tree/1cacd1312dfaaaac5b3e2cf4f45c02f628d307ff)
- [AstroPaper](https://github.com/satnaing/astro-paper)
- [Retypeset](https://github.com/radishzzz/astro-theme-retypeset)
- [Astro 按需渲染](https://docs.astro.build/en/guides/on-demand-rendering/)
- [Astro Sessions](https://docs.astro.build/en/guides/sessions/)
- [Astro Actions 与授权要求](https://docs.astro.build/en/guides/actions/)
- [Astro Authentication](https://docs.astro.build/en/guides/authentication/)
- [Astro Node adapter](https://docs.astro.build/en/guides/integrations-guide/node/)
- [Astro Content Collections 与 live collections](https://docs.astro.build/en/guides/content-collections/)
- [Tiptap 内容持久化](https://tiptap.dev/docs/editor/core-concepts/persistence)
- [Tiptap Static Renderer](https://tiptap.dev/docs/editor/api/utilities/static-renderer)
- [Tiptap Markdown（Beta）](https://tiptap.dev/docs/editor/markdown)
