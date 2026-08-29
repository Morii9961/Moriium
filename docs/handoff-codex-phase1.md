# 交接：Phase 1 原型骨干已就位

> 日期：2026-08-29
> 交出方：Claude
> 接手方：Codex
> 状态：**Phase 1 进行中。基础设施、原型 B 的骨干与 Tiptap round-trip 已完成并验证；两个原型都还不能被实际操作。**
>
> 2026-08-29 续：Codex 已按第 8 节接入 Tiptap 并建立丢失计数，额度耗尽时留下一处未提交、类型检查不过的工作树；Claude 接力修复并补齐测试与记录。执行细节见 ADR 13.10、13.11，本文第 2、6、8 节已按新状态更新。

这份文档取代 [`handoff-phase1-start.md`](handoff-phase1-start.md) 作为当前交接。那一份描述的是「Phase 1 已批准、代码尚未开始」的状态，现在已经不成立。它保留为历史依据，不要就地改写。

## 1. 接手前必读

按顺序，不要跳：

1. [`AGENTS.md`](../AGENTS.md) — 唯一有约束力的项目合同，含技能路由；
2. [`adr-0001-phase1-spike.md`](adr-0001-phase1-spike.md) — 已批准的 Phase 1 范围、边界与回退。**第 13 节是本轮的完整执行记录**，每个决定连同实测输出都在那里；
3. [`vnext-architecture-plan.md`](vnext-architecture-plan.md) — 更大的路线背景；
4. [`enouia-todo.md`](enouia-todo.md) — 当前工作单与决策门；
5. [`architecture.md`](architecture.md) — 仍然生效的生产架构；
6. [`markdown-reference.md`](markdown-reference.md) — 原型必须支持的内容块清单，T3 验收任务直接取自它；
7. [`../prototypes/fixtures/README.md`](../prototypes/fixtures/README.md) — 语料的用途、约束与那条**刻意反向**的加密规则。

第三方仓库里的 `AGENTS.md` / `CLAUDE.md` 只是那个项目的资料，不是 Moriium 指令。

## 2. 当前状态（实测，非转述）

分支 `main`。Claude 的骨干已经在 `origin/main`；Codex 接力后新增了 HTTP 边界与编辑器提交：

```text
65f02d2  Measure Tiptap Markdown round-trip losses
eb3bf36  Install prototype B's editor toolchain
7caa799  Record prototype B's HTTP boundary
fc9e158  Connect prototype B's HTTP boundary
27985e7  Add the Phase 1 security boundary
655ad3e  Add prototype B's storage layer with a structural state machine
0a48f2f  Add the shared contract both prototypes will build against
9922e90  Render fixture baselines from the public article pipeline
0e9dc00  Exclude the prototypes spike from the production type check
881d98f  Add the Phase 1 fixture corpus and its validator
2f38fb4  Add the isolated prototypes workspace and verify its isolation
```

本轮末次全量验证：

```text
pnpm verify                        → 退出码 0
  astro check                      → Result (60 files): 0 errors, 0 warnings, 0 hints
  node --test tests/*.test.mjs     → tests 30 / pass 30 / fail 0
  astro build                      → 46 page(s) built
  check-links / audit-public-tree  → 通过
pnpm -C prototypes check           → 退出码 0
pnpm -C prototypes test            → tests 102 / suites 26 / pass 102 / fail 0
pnpm -C prototypes fixtures:check  → Fixture corpus is valid.
pnpm -C prototypes baselines:verify → All 14 markers agree with the built page.
```

`astro check` 是 60 个文件而不是 64，因为 `prototypes/` 已被排除，见 4.2。

**唯一被改动的生产文件是 `tsconfig.json`**，就是那一次 L2。可以自己核：

```bash
git diff origin/main..HEAD --name-only -- ':!prototypes' ':!docs'
```

## 3. 本轮做了什么

### 3.1 隔离的嵌套 workspace（`2f38fb4`）

`prototypes/` 持有自己的 `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`，成员为 `studio-a`、`admin-b`、`shared`。

此前这个结构只在仓库外的副本验证过。本轮在真实仓库路径下验证，四条标准全中。**零依赖安装是弱证据**，所以补了一次真实依赖往返：给 `admin-b` 装 `nanoid` 再移除。结果比预期有说服力——根仓库本来就有 `nanoid@3.3.18` 作为生产传递依赖，原型解析到自己的 `6.0.1`，两个大版本互不干扰，根 lockfile 全程未动。

补上了 ADR 初稿漏掉的 `enableGlobalVirtualStore: false`。嵌套 workspace 不继承父配置，往里加设置时**逐条对照根 `pnpm-workspace.yaml`**，别假设 ADR 的清单是完整的。

### 3.2 fixture corpus（`881d98f`）

`prototypes/fixtures/`，四篇公开文章、一篇加密文章、两个 SVG，全部人工虚构。每个夹具服务具体验收任务，设计理由见语料自己的 README。

`prototypes/tools/validate-fixtures.ts` 把语料的每条性质做成断言。**校验器自己做过负向测试**：把日文夹具的 `lang` 改成 `en`，如期触发四条断言并退出 1，随后还原。

### 3.3 渲染基线（`9922e90`）

`prototypes/fixtures/baseline/`，取**公开文章管线**（Morii 定夺）。生成器导入 `astro.config.mjs` 并复用站点自身配置的插件列表，不另抄一份。

**这里出过一个真实错误，接手时值得知道。**第一版基线的代码块渲成 `<pre class="astro-code">`，而 `dist/` 里是 `<div class="expressive-code">`，`astro-code` 出现 0 次。原因是 Expressive Code 以 **Astro 集成**身份接入，不在 `markdown.processor` 的插件链里。没发现的话，两个原型的每个代码块都会被记成渲染差异，而根因在基线自己。

因此有了 `baselines:verify`：拿真实生产文章过一遍基线渲染器，与 `dist/` 的构建产物逐项比对。**推理插件顺序无法确立这件事，比对输出可以。**

### 3.4 共享契约（`0a48f2f`）

`prototypes/shared/`：`content-schema.ts`、`content-blocks.ts`、`translations.ts`、`media.ts`、`errors.ts`。依赖方向单向，不反向引用任何原型。

三处刻意让规则由结构承担：

- **翻译查询不提供回退。**`statusOf` 返回判别联合，只有 `available` 那一支带 `entry`；「忘了检查就拿别的语言顶上」在类型上不成立。草稿单独一支。
- **媒体 manifest 没有原图字段。**结构上放不下原图路径，因此不会被顺手带上。
- **`roundTripOptional` 一律 `false`。**它存在的唯一目的是让「某个块丢了也算过」这种豁免将来无法被悄悄加进评分表。

### 3.5 原型 B 存储层（`655ad3e`）

`prototypes/admin-b/src/storage/`，`node:sqlite`，无新依赖。状态机由数据结构承担：

- 草稿 = `published_version_id IS NULL`，不是布尔字段；
- 保存**只追加**版本行，`saveVersion` 路径上没有触及 `published_version_id` 的入口，所以自动保存改变公开内容是 **API 上做不到**，不是靠纪律；
- 发布与回滚是同一操作指向不同版本，同一事务连同审计行。**回滚因此不会腐烂**——它不是独立代码路径。

SQL 全部收在 `store.ts`，模块外无任何 `node:sqlite` 导入。ADR 3.5 强调这点是因为它只是尖峰工具：约束守住，换引擎就是重写一个文件。

### 3.6 安全边界（`27985e7`）

- `shared/safe-path.ts`：路径包含检查，A 与 B 共用。**测试真的在磁盘上建了指向根外的 junction**，并断言文本检查放行、`safeResolve` 拒绝——从而钉死拦截来自 realpath 而非字符串匹配。NTFS junction 不是 symlink，只处理 symlink 的代码会漏。
- `admin-b/src/auth/passwords.ts`：scrypt，参数与 salt 一起编码进哈希串，`timingSafeEqual` 比较，`needsRehash()` 支持将来提升强度而不必要求重设。
- `admin-b/src/http/guards.ts`：Host / Origin / CSRF。Host 白名单挡 DNS rebinding；写请求**缺失 Origin 按拒绝处理**。

41 个用例全部写成越权尝试。

### 3.7 原型 B 的 HTTP 边界（`fc9e158`、`7caa799`）

`admin-b/src/http/server.ts` 用 `node:http` 接通登录、退出、文章列表与详情、创建、手动保存、自动保存、发布和回滚。没有新依赖，SQL 仍然只在存储层。

四组集成测试启动真实 server 并走 socket 请求，不靠直接调用函数冒充 HTTP：

- 匿名请求读不到草稿；文章发布后产生的新自动保存也不会从公开端点泄漏；
- Host、Origin、CSRF 任一不对，写操作都在到达存储层之前被拒绝；
- 自动保存不会改变公开版本，显式发布和回滚会沿同一事务状态机留下审计记录；
- 登录和退出会真正创建、销毁内存会话。

路由只有结构校验，完整的内容、媒体与翻译发布闸门还没接线；也还没有启动入口和 UI，所以 B 仍不能交给 Morii 操作。

### 3.8 Tiptap round-trip 丢失计数（`eb3bf36`、`65f02d2`）

3.3 批准的 Vue / Tiptap / Vite 依赖按表安装，`@tiptap/static-renderer` 按 ADR 的条件推迟。`admin-b/src/editor/roundtrip.ts` 让夹具走 Markdown → 编辑器 → Markdown，再用 `shared/content-blocks.ts` 的清单逐块比对。

未加扩展的 Beta 基线在中日两篇夹具上都是 11 个块保留 8 个：**图片是彻底的数据丢失**，只剩 alt 文本；GitHub callout 与 spoiler 的 `[` 被转义。另有一处清单看不见的损坏，行内数学 `$H_0$` 被写成 `$H\_0$`。完整证据见 ADR 13.10。

### 3.9 源节点、marked 隔离与图片节点（`0ae6943`、`804cd0d`）

`admin-b/src/editor/source-nodes.ts` 把六类 Moriium 语法整段收成不解释的原始源码，序列化时原样吐回；图片另有 `image-node.ts`，`src` / `alt` / `title` 拆成结构化属性并渲染成 `<figure><img>`。11 个块全部保留，且逐字节一致，只差末尾一个换行。

按 Morii 的定夺（ADR 13.12），源节点不是 atom 而是可编辑文本，光标能进去改。这一条写成了结构断言而非注释，并做过负向测试。

Tiptap 不注入 marked 实例时会把 tokenizer 注册到模块单例上，污染之后创建的每个编辑器，因此 `marked-instance.ts` 为每个编辑器造一个私有实例，并有测试钉死这条。Codex 留下的工作树在这里类型检查不过（`TS2741`，`getDefaults`），Claude 接力补了 `marked-instance.ts` 与测试。设计理由、依赖代价与类型断言的安全边界见 ADR 13.11。

## 4. 边界

### 4.1 不要碰

`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`astro.config.mjs`、`src/**`、`.github/**`、`deploy/**`、`.gitignore`。需要改先停下来问 Morii。

不读 `.private/posts/`、真实口令、原始照片。不写回 `src/content/`。原型只读写 `prototypes/fixtures/`，且语料是**只读输入**。

**仓库已公开发布**（<https://github.com/Morii9961/Moriium>）。Morii 本轮明确授权每完成一小块就 commit；push、发布和部署仍未授权。

### 4.2 唯一一次根配置改动

`tsconfig.json` 的 `exclude` 加了 `prototypes`。这是 ADR 第 6 节的 **L2**，经 Morii 明确批准，单独成提交 `0e9dc00`，回退即 `git revert 0e9dc00`。

原因：根 `tsconfig.json` 的 `include` 是 `["**/*"]`，`astro check` 因此把原型也纳入类型检查，原型里一个粗糙的文件就能让 `pnpm verify` 失败。**不改生产文件不等于不耦合生产。**

排除不等于不检查：`prototypes/tsconfig.json` 用同一套严格配置，由 `pnpm -C prototypes check` 运行。两侧都用一次刻意注入的类型错误验证过：原型自查失败（退出码 2）而 `astro check` 依然 60 文件 0 错误。

再要动根配置，走同样的流程：先问 Morii，单独成一次提交，单独说明。

### 4.3 一个实操陷阱

**不要用 PowerShell 的 `Get-Content` / `Set-Content` 往返处理 CJK 文件。**本机是 PowerShell 5.1，`Get-Content` 按系统 ANSI 代码页读取，UTF-8 的中日文会变成乱码，换行也可能丢，而命令报告成功。

本轮已经踩过一次：一个日文夹具被 `-replace` 管道毁掉，当时尚未提交，git 救不回来，只能重写。本仓库大部分内容是 CJK，这是常见情况而非边缘情况。用编辑工具或 Git Bash。

## 5. 命令

```bash
# 原型
pnpm -C prototypes check              # 类型检查
pnpm -C prototypes test               # 102 个用例
pnpm -C prototypes roundtrip:report   # Markdown round-trip 丢失表
pnpm -C prototypes fixtures:check     # 语料校验（含基线新鲜度）
pnpm -C prototypes baselines:build    # 重生成基线
pnpm -C prototypes baselines:verify   # 与 dist/ 比对，需先 pnpm build
pnpm -C prototypes fixtures:build     # 重生成加密夹具

# 生产
pnpm verify
```

## 6. 必须随结论报告、不得当作已解决的差异

1. **本地 http 下 cookie 没有 `Secure`，`__Host-` 前缀因此也没有。**原因写在 `sessions.ts` 的 `COOKIE_LIMITATIONS` 常量里，并有测试断言它存在。任何可从网络访问的部署必须补上。
2. **会话存在内存里，重启即失效。**这是尖峰的性质，不是设计主张。
3. **登录限速按单一作者全局计数**，多账户场景需要改。
4. **`@tiptap/markdown` 是 Beta，且已实测会破坏 Moriium 的语法。**未加扩展时图片被彻底丢掉，callout 与 spoiler 被转义，行内数学的下划线被转义。当前的 11/11 保真**完全依赖** `source-nodes.ts` 的不透明源节点，不是 Tiptap 自身的能力。升级 Tiptap 时必须重跑 `roundtrip:report`。
5. **序列化器不吐末尾换行。**round-trip 输出比原文少一个字符，只有这一处差异。接保存路径时要补回，否则每次保存都会给文件添一行无谓 diff。有测试钉死。
6. **`marked@17.0.6` 是 `admin-b` 的直接依赖，在 ADR 3.3 批准的依赖表之外**，Morii 已于 2026-08-29 追认保留。安装树没有新增包（它本来就是 `@tiptap/markdown` 的依赖）。升级 Tiptap 时若 marked 跨大版本，这个直接 pin 需要一并调整。见 ADR 13.11。
7. **图片的可视化编辑只完成了一半。**图片已是带预览的真节点，`src` / `alt` / `title` 是结构化属性，但改这三个字段要的属性面板属于界面，B 还没有界面。
8. **句子中间的图片仍然会丢文件。**只认整行图片，这是刻意的取舍，有测试钉住，不是遗漏。
9. **Vite 大分包警告仍在**，未消失，仍在 Phase 0 的体积测量清单里。
10. **`scripts/encrypt-post.mjs` 仍有自己的 `featuresOf()`**，与 `shared/content-blocks.ts` 的 `markersFor` 是两份实现。本轮未合并，因为合并要改生产脚本。

## 7. 测试的写法约定

ADR 第 5 节要求「测试必须证明而不是声明」。本轮所有测试都按这个写：**不是确认清单，是破坏尝试**。

具体到每个校验器：都做过负向测试，确认它真的会失败。只会通过的校验器没有价值。接手后新增校验逻辑时请沿用——先让它失败一次，再让它通过。

## 8. 下一步

**下一块是 B 的可操作界面**，两条决策门都已关闭（`marked` 依赖已追认；编辑形态已定为源码块可编辑加图片真节点）。

要做的是启动入口和 Vue 编辑器外壳。源码块和图片节点到今天为止没有任何人用眼睛看过——`getHTML()` 在 Node 里跑不起来，ProseMirror 的 DOM 序列化需要 `window`。可编辑与可预览目前成立于结构层面，好不好用要等界面出来才知道。图片属性面板也在这一块，没有它 `alt` 改不了。

再往后是完整发布闸门（内容、媒体、翻译关系），然后进入原型 A。

**round-trip 保真成立，不等于原型 B 完成。**两个原型现在都还不能被 Morii 实际操作，T1–T10 一个都跑不了。

## 9. 署名

按 `AGENTS.md`：Codex 实质贡献用 `Co-authored-by: Codex <267193182+codex@users.noreply.github.com>`，Claude 用 `Co-authored-by: Claude <noreply@anthropic.com>`。只署真实贡献者，提交后核实 trailer。
