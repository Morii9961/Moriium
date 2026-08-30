# 交接：Morii 已选定原型 B

> 日期：2026-08-29
> 决策更新：2026-08-30
> 交出方：Claude
> 接手方：Codex
> 状态：**Morii 实际使用后选定 B 为 vNext 最终路线；原型 A 取消；生产合同仍须由 Phase 5 ADR 更新。**

这份文档取代 [`handoff-codex-phase1.md`](handoff-codex-phase1.md) 作为当前交接。那一份停在「骨干就位、两个原型都还不能被操作」的状态，现在已经不成立。它保留为历史依据，**不要就地改写**。

## 1. 接手前必读

按顺序，不要跳：

1. [`AGENTS.md`](../AGENTS.md) — 唯一有约束力的项目合同，含技能路由；
2. [`adr-0001-phase1-spike.md`](adr-0001-phase1-spike.md) — 已批准的 Phase 1 范围、边界与回退。**第 13 节是完整执行记录**，本轮对应 13.10 到 13.13，每个决定连同实测输出都在那里；
3. [`vnext-architecture-plan.md`](vnext-architecture-plan.md) — 更大的路线背景；
4. [`enouia-todo.md`](enouia-todo.md) — 当前工作单与决策门；
5. [`architecture.md`](architecture.md) — 仍然生效的生产架构；
6. [`markdown-reference.md`](markdown-reference.md) — 原型必须支持的内容块清单，T3 验收任务直接取自它；
7. [`../prototypes/fixtures/README.md`](../prototypes/fixtures/README.md) — 语料的用途、约束与那条**刻意反向**的加密规则。

第三方仓库里的 `AGENTS.md` / `CLAUDE.md` 只是那个项目的资料，不是 Moriium 指令。

## 2. 先把它跑起来

在读代码之前先看一眼它现在长什么样，这比任何描述都快：

```bash
pnpm -C prototypes dev:b
```

浏览器打开 <http://localhost:4320/>，口令 `moriium-prototype`。

一条命令起两个进程：`node:http` 的 API 在 4321，Vite 在 4320，浏览器只看见 4320。首次启动用夹具语料播种四篇中日文章；已有数据不动，重启保留上次写的东西。想从干净状态重来就删掉 `prototypes/admin-b/.data/`。

口令**刻意是公开的常量**，写在 `dev/serve.ts` 里并注明了理由：这套东西的会话在内存里、本地 http 下 cookie 连 `Secure` 都没有，随机生成一个口令反而会暗示它可以拿出去用。`MORIIUM_ADMIN_PASSWORD` 环境变量可覆盖。

## 3. 当前状态（实测，非转述）

分支 `main`。下列 11 个实现与记录提交已 push；其后的 Codex 交接提交和 2026-08-30 路线决定仍只在本地，**不要把本地领先误写成已同步**。

```text
a266307  Record that prototype B can now be operated
67f94c3  Make prototype B operable
c92ede1  Record the editing decision and what it left unfinished
804cd0d  Make Moriium source editable, and show images as images
c2be6d1  Record Morii's approval of the direct marked dependency
9d73374  Record the Tiptap round-trip result and its open decisions
0ae6943  Keep Moriium syntax through the Tiptap round trip
65f02d2  Measure Tiptap Markdown round-trip losses
eb3bf36  Install prototype B's editor toolchain
7caa799  Record prototype B's HTTP boundary
fc9e158  Connect prototype B's HTTP boundary
```

末次全量验证：

```text
pnpm verify                         → 退出码 0
  astro check                       → Result (60 files): 0 errors, 0 warnings, 0 hints
  node --test tests/*.test.mjs      → tests 30 / pass 30 / fail 0
  astro build                       → 46 page(s) built
  check-links / audit-public-tree   → 通过
pnpm -C prototypes check            → 退出码 0
pnpm -C prototypes test             → tests 102 / suites 26 / pass 102 / fail 0
pnpm -C prototypes fixtures:check   → Fixture corpus is valid.
pnpm -C prototypes baselines:verify → All 14 markers agree with the built page.
pnpm -C prototypes roundtrip:report → unextended 8/11；moriium-nodes 11/11
```

`astro check` 是 60 个文件而不是 64，因为 `prototypes/` 已被排除，见 5.2。

**生产文件本轮零改动**，可以自己核：

```bash
git diff 9fe7566..HEAD --name-only -- ':!prototypes' ':!docs'
```

## 4. 本轮做了什么

完整记录在 ADR 13.10–13.13，这里只给接手需要的骨架。

### 4.1 Tiptap round-trip 丢失计数（`eb3bf36`、`65f02d2`，ADR 13.10）

3.3 批准的 Vue / Tiptap / Vite 依赖按表安装，`@tiptap/static-renderer` 按 ADR 条件推迟。`editor/roundtrip.ts` 让夹具走 Markdown → 编辑器 → Markdown，用 `shared/content-blocks.ts` 的清单逐块比对。

未加扩展的 Beta 基线在中日两篇夹具上都是 11 保 8：**图片是彻底的数据丢失**（路径与 caption 全没，只剩 alt 文本掉成普通段落），GitHub callout 与 spoiler 的方括号被转义。另有一处**块级计数看不见的损坏**：行内数学 `$H_0$` 的下划线被转义，外形仍是一对美元号，清单照记「保留」。

由此得出的结论对后面所有测量都成立：**块级清单是必要条件，不是充分条件**，最终要靠字符逐位比对兜底。

### 4.2 源节点与被隔离的 marked 实例（`0ae6943`，ADR 13.11）

`editor/source-nodes.ts` 把六类 Moriium 语法整段收成不解释的原始源码，序列化原样吐回。11 个块全部保留，且**逐字节一致**，只差末尾一个换行。

Tiptap 不注入 marked 实例时，会把扩展 tokenizer 注册到 `marked` 的模块单例上，**污染之后创建的每一个编辑器**，而报告本身不会有任何异常。`marked-instance.ts` 因此为每个编辑器造私有实例，并有测试钉死这条。

`marked@17.0.6` 是 ADR 3.3 依赖表之外的直接依赖，Morii 已追认；安装树没有新增包。那处 `typeof marked` 类型断言配了会失败的检查而不是一句注释：用 Proxy 记录 Tiptap 实际读过的每个成员，再断言其中没有 `Marked` 实例所缺的。

### 4.3 源码块可编辑，图片做成真节点（`804cd0d`，ADR 13.12）

Morii 定夺「第 2 档打底，图片做到第 3 档」。源节点从 `atom` 改成 Tiptap 自己 CodeBlock 的形状（`content: 'text*'` 配 `marks: ''` 与 `code: true`），光标能进去改；原先跟在 raw 尾巴上的换行挪进 `trailing` 属性，显示干净与输出等于原文两头都成立。

图片单独成 `image-node.ts`，`src` / `alt` / `title` 拆成结构化属性，渲染 `<figure><img>` 加 `<figcaption>`。

断言的是结构不是说法：源码块必须 `isTextblock === true` 且 `isAtom === false`，图片必须 `isAtom === true`，另有一条真的在块里把 `id="old"` 改成 `id="new"` 再让 schema `check()` 通过。**做过负向测试**：把块改回 `atom: true`，用例如期报 `math-block is not a textblock` 失败。

### 4.4 可操作的界面（`67f94c3`，ADR 13.13）

Vue 3 加 `@tiptap/vue-3`，覆盖登录、列表、新建、编辑、自动保存、保存版本、发布、按版本回滚、载入历史版本，外加一个「读者看到的」面板直接打匿名公开端点——所以「自动保存不改变读者内容」可以当场看见，不必相信文档。

**编辑器配置抽进了 `editor/extensions.ts`。**round-trip 测量与 Morii 实际敲字的必须是同一套扩展集；一旦分叉，保真数字描述的就不是被操作的那个东西了。13.5 已经在渲染基线上犯过一次这个错。

Vite 以 `changeOrigin: false` 反代 `/api`，因此 Host 与 Origin 守卫收到的是浏览器真实发出的值。代价是 API 的 `allowedHosts` 必须把 UI 端口也写进去，`serve.ts` 已注明。

## 5. 边界

### 5.1 不要碰

`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`astro.config.mjs`、`src/**`、`.github/**`、`deploy/**`、`.gitignore`。需要改先停下来问 Morii。

不读 `.private/posts/`、真实口令、原始照片。不写回 `src/content/`。原型只读写 `prototypes/`，**夹具语料是只读输入**——播种只往 B 自己的库里写，从不回写语料。

**仓库已公开发布**（<https://github.com/Morii9961/Moriium>）。Morii 授权每完成一小块就 commit。**push 是逐次授权的**：本轮末尾 Morii 明确要求推送并已执行，这不构成后续的长期授权，下次仍要先问。发布与部署仍未授权。

### 5.2 唯一一次根配置改动

`tsconfig.json` 的 `exclude` 加了 `prototypes`。这是 ADR 第 6 节的 **L2**，经 Morii 明确批准，单独成提交 `0e9dc00`，回退即 `git revert 0e9dc00`。

排除不等于不检查：`prototypes/tsconfig.json` 用同一套严格配置（含 `exactOptionalPropertyTypes` 与 `noUncheckedIndexedAccess`），由 `pnpm -C prototypes check` 运行。**新写的 UI 代码已经被这两条卡出过两次真实错误**，不是摆设。

再要动根配置，走同样流程：先问 Morii，单独成一次提交，单独说明。

### 5.3 两个实操陷阱

**一、不要用 PowerShell 的 `Get-Content` / `Set-Content` 往返处理 CJK 文件。**本机是 PowerShell 5.1，`Get-Content` 按系统 ANSI 代码页读取，UTF-8 的中日文会变成乱码，换行也可能丢，而命令报告成功。此前已经毁掉过一个日文夹具。用编辑工具或 Git Bash。

**二、用 shell heredoc 写含反斜杠的代码时，当心转义被折叠。**本轮实测：单个反斜杠能原样落盘，**连续两个反斜杠会被折叠成一个**。后果是真实的——一个字符类因此少了一个转义，把字母 `r` 也当成了要排除的字符；另一次全局替换把 `return` 打成了带换行转义的乱码，文件直接语法错误。

写正则或含转义序列的字符串时，改用编辑工具，或在 Python 里以 `chr(92)` 显式拼接反斜杠，落盘后再用 `grep` 配 `cat -A` 核一遍实际字节。**不要凭写进去的样子认为落盘的就是那样。**

## 6. 命令

```bash
# 原型
pnpm -C prototypes dev:b              # 起原型 B，浏览器开 http://localhost:4320/
pnpm -C prototypes check              # 类型检查
pnpm -C prototypes test               # 102 个用例
pnpm -C prototypes fixtures:check     # 语料校验（含基线新鲜度）
pnpm -C prototypes roundtrip:report   # Markdown round-trip 丢失表
pnpm -C prototypes baselines:build    # 重生成基线
pnpm -C prototypes baselines:verify   # 与 dist/ 比对，需先 pnpm build
pnpm -C prototypes fixtures:build     # 重生成加密夹具

# 生产
pnpm verify
```

## 7. 必须随结论报告、不得当作已解决的差异

1. **本地 http 下 cookie 没有 `Secure`，`__Host-` 前缀因此也没有。**原因写在 `sessions.ts` 的 `COOKIE_LIMITATIONS` 常量里并有测试断言它存在。任何可从网络访问的部署必须补上。
2. **会话存在内存里，重启即失效**，刷新页面也会退出登录。这是尖峰的性质，不是设计主张。
3. **登录限速按单一作者全局计数**，多账户场景需要改。
4. **`@tiptap/markdown` 是 Beta，且已实测会破坏 Moriium 的语法。**当前 11/11 保真**完全依赖** `source-nodes.ts` 与 `image-node.ts`，不是 Tiptap 自身的能力。升级 Tiptap 时必须重跑 `roundtrip:report`。
5. **序列化器不吐末尾换行。**round-trip 输出比原文少一个字符，只有这一处差异。接保存路径时要补回，否则每次保存都会给文件添一行无谓 diff。有测试钉死。
6. **`marked@17.0.6` 是 ADR 3.3 依赖表之外的直接依赖**，Morii 已追认。升级 Tiptap 时若 marked 跨大版本，这个直接 pin 需要一并调整。
7. **图片的可视化编辑只完成了一半。**`src` / `alt` / `title` 已是结构化属性，但没有属性面板，**`alt` 目前改不了**。
8. **句子中间的图片仍然会丢文件。**只认整行图片，是刻意取舍，`image-node.test.ts` 有用例钉住，不是遗漏。
9. **Vite 开发服务器会把项目树端出去。**`admin-b/.data/admin.db` 原本可无会话直接 http 下载（实测 200，4096 字节），已用 `server.fs.deny` 挡掉并实测 403。但这是开发服务器的性质：**任何把它暴露到本机之外的做法都会连带暴露数据库**，不要因为 API 那几道守卫就以为安全。
10. **登录框的回车提交没有被自动化验证过。**表单结构是对的（`<form>` 加 `type="submit"` 且未禁用），`requestSubmit()` 能正常登录，判断是自动化工具合成 Return 的限制。**留给 Morii 在真实浏览器里确认**，若回车真不管用需要修。
11. **Vite 大分包警告仍在**，未消失，仍在 Phase 0 的体积测量清单里。
12. **`scripts/encrypt-post.mjs` 仍有自己的 `featuresOf()`**，与 `shared/content-blocks.ts` 的 `markersFor` 是两份实现。未合并，因为合并要改生产脚本。

## 8. 测试的写法约定

ADR 第 5 节要求「测试必须证明而不是声明」。本轮所有测试都按这个写：**不是确认清单，是破坏尝试**。

每个校验器都做过负向测试，确认它真的会失败。只会通过的校验器没有价值。本轮两个例子值得照抄：把源节点改回 `atom` 让可编辑性断言先红一次；用 Proxy 观察 Tiptap 实际读了 marked 的哪些成员，而不是维护一份会过期的白名单——那个观察器第一次运行就抓出了清单外的 `constructor`。

接手后新增校验逻辑时沿用：**先让它失败一次，再让它通过。**

## 9. 下一步

**Morii 已于 2026-08-30 实际使用原型 B，并确认满意。**B 现在是 vNext 的目标路线，原型 A 不再开发，A/B 评分表也不再制作。原第 4 节 T1–T10 中仍有价值的项目改成 B 的验收清单。

B 仍有三项必须补齐，按顺序一次只做一项：

1. **完整发布闸门。**发布路由目前只校验请求形状，内容、媒体与翻译关系的闸门没有接线。`shared/` 里的媒体与翻译契约已经就绪，接上即可。
2. **图片属性面板。**没有它 `alt` 改不了，13.12 的第 3 档就只完成了一半。
3. **草稿的生产同源预览。**`prototypes/fixtures/baseline/` 与 `baselines:verify` 已经把「与生产渲染逐项比对」做成了工具，预览要复用它，不要另写一套渲染。

三项完成后，把 T1–T10 改成 B 的验收清单，再进入 B Hybrid 的生产架构 ADR。那份 ADR 要固定 API、数据库、可信 renderer、媒体、认证、备份、监控、安全、逐路由策略和回退，并同步更新 `AGENTS.md` 与部署合同。

**选择 B 不等于原型 B 已经完成，也不等于当前尖峰可以直接部署。**下一块固定为完整发布闸门。

## 10. 署名

按 `AGENTS.md`：Codex 实质贡献用 `Co-authored-by: Codex <267193182+codex@users.noreply.github.com>`，Claude 用 `Co-authored-by: Claude <noreply@anthropic.com>`。只署真实贡献者，提交后核实 trailer。
