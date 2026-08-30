# 交接：Phase 6A 生产后端已开工

> 日期：2026-08-30
> 交出方：Claude
> 接手方：Codex
> 状态：**Phase 1 已收尾，ADR 0002 已批准并开工。生产后端 12 块里做完 8 块，读者站一直可用；生产 Admin 已能登录、写作、导入并选择图片、预览和操作发布指针，下一块是建账户命令。**

这份文档取代 [`handoff-codex-prototype-b.md`](handoff-codex-prototype-b.md) 作为当前交接。那一份停在「Phase 1 收尾、等 Morii 批准 ADR 0002」的状态，现在已经不成立。它保留为历史依据，**不要就地改写**——里面第 7 节那 19 条差异仍然有效，本文第 8 节按新阶段重新分了类。

## 0. 先分清两套东西

接手前只要记住一件事，就是这件：

| | 位置 | 是什么 | 还动不动 |
| --- | --- | --- | --- |
| **原型 B** | `prototypes/` | 一次性尖峰，任务已完成 | **不再开发**，只当参考实现读 |
| **生产后端** | `src/server/`、`src/pages/admin/` | 真正要上线的东西 | **当前全部工作在这里** |
| **读者站** | `src/pages/` 其余 | 早就是成品，46 页三语静态站 | 只在渲染分裂那条线上被动过 |

Morii 已于 2026-08-30 用过原型 B 后**选定 B 路线、取消原型 A**。原型的使命到此结束，它不会被部署。把它的代码当作已经验证过的语义来源，而不是待完善的产品——**照搬它的结论，不要照搬它的代码**。

## 1. 接手前必读

按顺序，不要跳：

1. [`AGENTS.md`](../AGENTS.md) — 唯一有约束力的项目合同。**已按 ADR 0002 第 16 节改过五处**，尤其是第 21 与 47 行关于「读者路径不得依赖 Node」的两条；
2. [`adr-0002-phase5-production.md`](adr-0002-phase5-production.md) — **当前阶段的主文档**，已批准并实施中。第 21 节是执行记录；**动 `src/`、`astro.config.mjs` 或 CI 之前先读第 4、5、21.1 节**；
3. [`adr-0001-phase1-spike.md`](adr-0001-phase1-spike.md) — 已收尾的 Phase 1。第 13 节是完整执行记录，第 4 节是 B1–B11 验收清单及其结果；
4. [`enouia-todo.md`](enouia-todo.md) — 当前工作单与决策门；
5. [`vnext-architecture-plan.md`](vnext-architecture-plan.md) — 更大的路线背景；
6. [`architecture.md`](architecture.md) — 仍然生效的生产架构；
7. [`markdown-reference.md`](markdown-reference.md) — 内容块清单，保真要求的来源。

第三方仓库里的 `AGENTS.md` / `CLAUDE.md` 只是那个项目的资料，不是 Moriium 指令。

## 2. 当前状态（实测，非转述）

分支 `main`。本轮按小块继续创建本地提交，尚未推送。以这条命令的实时结果为准；本文件所在提交不写自引用 hash：

```bash
git log --oneline origin/main..HEAD
```

```text
（本文件所在提交）Pick images from the media library instead of typing paths
0f4b36a  Import media through a sanitizer that re-reads its own output
ae22b72  Add the production author editor
984def8  Prepare the production author editor runtime
1970ebb  Add the production article API and publish gate
311777d  Share the author API request boundary
1218bf4  Add production author sessions and login
0a72146  Hand the production phase over to Codex
```

第 8 块的末次生产验证，2026-08-30 跑出来的：

```text
pnpm check                                      → 107 files，0 errors / warnings / hints
pnpm test                                       → tests 89 / suites 17 / pass 89 / fail 0
pnpm build                                      → 46 个公开页面与 Admin、API server entry 构建成功
pnpm split                                      → 158 个公开文件不依赖 Node；156 个公开可达资源不含 Admin 代码
check-links / audit-public-tree                 → 均通过
```

另用 `astro dev` 起真实运行时逐条验证了 13 条作者 API 路径全部返回 JSON。没有重跑原型 118 例。本轮构建没有再遇到沙箱里那次 esbuild `spawn EPERM`；文件系统那边遇到了一个新的等价问题，见 5.4。

## 3. 生产后端：12 块里做完 8 块

| | 块 | 状态 | 记录 |
| --- | --- | --- | --- |
| 1 | 渲染分裂（公开页静态、后台按需） | 完成 | ADR 21.1 |
| 2 | 数据库 schema 与迁移器 | 完成 | ADR 21.2 |
| 3 | 两个作者账户 | 完成 | ADR 21.2 |
| 4 | 文章与版本状态机 | 完成 | ADR 21.3 |
| 5 | 会话与登录 | 完成 | ADR 21.4 |
| 6 | HTTP 读写 API + 发布闸门搬迁 | 完成 | ADR 21.5 |
| 7 | Admin 界面 | 完成 | ADR 21.6 |
| 8 | 媒体导入链路（修 B7） | 完成 | ADR 21.7 |
| 9 | **建账户命令（只能在服务器上跑）** | **下一块** | — |
| 10 | 导出 + 构建 + 原子换站 | 未开始 | ADR 第 4.2、15.3 节已定 |
| 11 | 备份与恢复演练 | 未开始 | ADR 第 11 节已定 |
| 12 | 部署（systemd / Nginx / 构建迁到 VPS） | 未开始 | ADR 第 15 节已定 |

**5 到 8 做完就是「本机能用」**：能登录、写作、导入图片、发布，跑在生产代码上。**9 到 12 才是「真正上线」。**

## 4. 已完成的八块，接手需要知道的

### 4.1 渲染分裂（`7192684`，ADR 21.1）

`@astrojs/node` 装上了，但 `output` 仍是 `static`：46 个公开页全部预渲染，只有 `/admin` 按需。产物因此分成 `dist/client/` 与 `dist/server/`，四个读 `dist/` 的脚本和 CI 的打包都跟着改了——**CI 那条不改的话，部署上去全站 404**。

`scripts/check-render-split.mjs` 已进 `pnpm verify`，把「读者不需要 Node」做成一条会自己红的检查。它同时挡住 Tiptap、Vue 与 `node:sqlite` 进入公开产物。**要改渲染策略先读它，再读 ADR 第 5 节那张表。**

### 4.2 数据库、迁移器、两个账户（`50a59d0`，ADR 21.2）

`src/server/db/` 与 `src/server/accounts.ts`。

- **B2 那项「不能过」修掉了**：14 个 frontmatter 字段全部有列，并有一条用例**直接读 `src/content.config.ts`** 解析字段再逐个比对。往那个文件加字段而不加迁移，会在构建时红，而不是在发布时变成一个被悄悄丢掉的值；
- 迁移各自在自己的事务里跑，失败就停在上一个版本，不会半应用还标成完成；
- 两个账户权限完全相同，不做角色。**口令下限 24 位**，因为第 10.4 节把口令强度定成了这套东西真正的地基；
- 未知账户、停用账户、口令错误返回同一个结果，且未知账户也照跑一次哈希比对——否则响应时间会回答那个消息拒绝回答的问题。

### 4.3 文章与版本状态机（`28db6a3`，ADR 21.3）

`src/server/articles.ts`。尖峰验证过的语义搬上生产 schema，SQL 仍然只在这一个模块里。

三条规则继续由数据结构承担：草稿是 `published_version_id IS NULL`；保存**只追加**，`saveVersion` 路径上没有入口能触及公开指针；发布与回滚是同一操作指向不同版本，同事务连同审计行。

搬迁时多出来两样尖峰没有的：

**一、每个版本记作者，每条审计记操作者。**两个账户权限相同，所以审计是唯一能把它们分开的东西，`author_id` 与 `actor_id` 不是装饰。

**二、发布不等于上线。**`published_version_id` 是数据库说的真相，`live_version_id` 是构建产物实际在服务的东西。`markLive()` 是导出成功之后才调用的第二步，**不写审计行**——它报告的是一次构建，不是编辑行为。`isAwaitingExport()` 就是两个指针不相等，**后台必须把这个差值显示出来**（ADR 第 4.2 节）。

`markLive` 拒绝把没发布过的版本标成上线，否则那是绕开发布闸门最省事的一条路。

### 4.4 会话与登录（ADR 21.4）

`src/server/auth/`、`src/server/http/auth-handlers.ts` 与三个 `/api` 端点。

- Astro Sessions 显式使用文件系统 driver；Linux 默认 `/var/lib/moriium/sessions/`，Windows 本地开发用 `.astro/sessions/`，不会跟着 release 目录轮换；
- 登录成功先轮换 session id，再存 `{ id, name }` 与独立 CSRF token；cookie 显式保留 `Secure`、`HttpOnly`、`SameSite=Lax`；
- 同一账户 15 分钟失败 5 次只锁该账户，Morii 与 Enouia 不会相互拖死；另有 20 次/15 分钟的全局阀门挡轮换假用户名；
- 登录/登出检查 Host 与 Origin，登出必须带 CSRF token；登录体超过 4 KiB 会在 JSON 解析前被拒；
- `/admin` 已经接上作者 API、列表与编辑器。没有建账户命令时，仍只能使用数据库中已经存在的账户。

### 4.5 文章 API、发布闸门与 Admin（ADR 21.5、21.6）

作者 API、完整生产闸门、文章列表与编辑器都已接通。界面保存全部 frontmatter 与 Markdown，能自动保存、手动保存、发布、回滚、撤下，并把最新、已发布、已上线三个版本分开显示。预览由服务端沿生产 Markdown 管线生成，不接收浏览器 HTML，也不保存草稿。

Vue/Tiptap 只从按需 `/admin` 加载。`check-render-split` 改为扫描从公开页面实际可达的资源；曾临时让首页引用 Admin entry 做负向验证，检查抓到后已撤销临时改动。原型里的列表和编辑器已经实测过，本块没有重复跑原型测试。

### 4.6 媒体导入与媒体库（ADR 21.7）

`scripts/lib/media.mjs`、`src/server/media/`、`src/server/http/media-handlers.ts`、`src/pages/api/media/`、`src/admin/MediaLibrary.ts`。

- 净化只有一份实现。配方、可导入格式和两张元数据块清单都在 `scripts/lib/media.mjs` 里，`sanitize-media.mjs` 与 `check-media.mjs` 现在是它的薄壳，服务端导入走同一条；
- 服务端**无条件重新编码**，然后把文件写到磁盘、**再读回确认**，最后才写行。`sanitized_at` 由 `MediaStore.recordImported` 盖章，没有别的入口能写它；
- 公开路径由服务端从净化后的字节推导。摘要取自输出，所以重复导入会与自己那一行冲突而不是多出一份副本；
- GIF 与 SVG 明确拒收，理由写在 `IMPORTABLE_FORMATS` 上方；
- 编辑器里图片路径框已改为只读，插图只能从媒体库选。选中图片时再选一张是替换；
- 缩略图走 `/api/media/<id>/file/`，因为导入的文件要到下一次导出才进公开目录。该路由要作者会话，且只能取出 `media_assets` 指名的文件。

**manifest 导出仍未接线**（第 8.2 节），它属于第 10 块。数据库里的 `exif_json` 一律是 `{}`：sharp 只给原始 EXIF 缓冲区，要保留可公开的机身字段得加解析依赖，**要先问 Morii**。

## 5. 边界

### 5.1 现在可以碰什么，这一条和上一份交接不同

上一份写着「不要碰 `src/**`、`astro.config.mjs`、`.github/**`」。**ADR 0002 批准之后这条不再成立**，那三处正是当前工作的地方。改成：

**可以改，但要按 ADR 0002 的既定写法**：`src/server/**`、`src/pages/admin/**`、`src/pages/api/**`、`astro.config.mjs` 的 adapter 部分、`.github/workflows/ci.yml` 的打包部分、`scripts/` 里配合渲染分裂的那几个。

**仍然要先问 Morii**：`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.gitignore`、`deploy/**`、`AGENTS.md`、任何新依赖。

**绝对不要**：把任何公开路由改成按需渲染。ADR 第 5 节那张表是逐路由写死的，`AGENTS.md` 第 47 行也写了「没有第二份 ADR 不得改」。`check-render-split` 会红，但**不要靠它兜底**——它挡的是代码泄漏，不是策略变更。

不读 `.private/posts/`、真实口令、原始照片。`prototypes/fixtures/` 是只读输入。

**仓库已公开发布**（<https://github.com/Morii9961/Moriium>）。Morii 授权每完成一小块就 commit。**push 是逐次授权的**：本轮 Morii 要求推送过一次并已执行，这不构成后续授权，下次仍要先问。部署仍未授权。

### 5.2 三条不能被顺手破坏的设计

1. **读者路径不经过 Node 与数据库。**这是「分钟级可见」换来的，也是整个拓扑成立的前提。
2. **数据必须在 release 目录之外。**Astro 的会话默认落在应用目录，而 `releases/` 只保留 6 份并整目录替换——数据库和会话落进去会在第 7 次发布时消失。ADR 第 15.1 节固定了 `/var/lib/moriium/`。
3. **显式 CSRF token 不能删。**Astro 的 `security.checkOrigin` 只覆盖三种表单 content-type，不含 `application/json`，而后台的写请求全是 JSON。ADR 第 9.4 节写了来源。

### 5.3 `prototypes/` 与 `src/server/` 的关系

`prototypes/tsconfig.json` 那套排除仍然有效（ADR 0001 第 6 节的 L2，提交 `0e9dc00`）。但 **`src/server/` 是生产代码，走的是根 `astro check`**，`exactOptionalPropertyTypes` 与 `noUncheckedIndexedAccess` 都作用在它身上，已经卡出过真实错误。

将来删掉 `prototypes/` 时，`src/server/` 不跟着走。

### 5.4 三个实操陷阱

**一、不要用 PowerShell 的 `Get-Content` / `Set-Content` 往返处理 CJK 文件。**本机是 PowerShell 5.1，`Get-Content` 按系统 ANSI 代码页读取，UTF-8 的中日文会变成乱码，换行也可能丢，而命令报告成功。此前已经毁掉过一个日文夹具。用编辑工具或 Git Bash。

**二、用 shell heredoc 写含反斜杠的代码时，当心转义被折叠。**实测：单个反斜杠能原样落盘，**连续两个反斜杠会被折叠成一个**。后果是真实的——一个字符类因此少了一个转义，把字母 `r` 也当成了要排除的字符；另一次全局替换把 `return` 打成了带换行转义的乱码，文件直接语法错误。

写正则或含转义序列的字符串时，改用编辑工具，或在 Python 里以 `chr(92)` 显式拼接，落盘后再用 `grep` 配 `cat -A` 核一遍实际字节。**不要凭写进去的样子认为落盘的就是那样。**

**三、Windows 上不要让 sharp 直接打开随后还要写入或删除的文件。**libvips 会把它打开的文件内存映射，映射在 Windows 上把文件锁住，下一次写入报 `UNKNOWN`、删除报 `EPERM`，而这两件事正是导入管线在复核之后立刻要做的。`scripts/lib/media.mjs` 的 `sensitiveBlocksInFile` 因此先用 `readFile` 读进内存再交给 sharp。这个坑第一次出现时看起来像沙箱权限问题，不是。

## 6. 命令

```bash
# 生产（当前工作面）
pnpm verify                           # astro check + 89 个用例 + 构建 + 渲染分裂 + 链接 + 公开树审计
pnpm build                            # 产物分 dist/client 与 dist/server

# 原型（参考实现，不再开发）
pnpm -C prototypes dev:b              # 起原型 B，浏览器开 http://localhost:4320/，口令 moriium-prototype
pnpm -C prototypes check              # 类型检查
pnpm -C prototypes test               # 118 个用例
pnpm -C prototypes fixtures:check     # 语料校验（含基线新鲜度）
pnpm -C prototypes roundtrip:report   # Markdown round-trip 丢失表
pnpm -C prototypes baselines:verify   # 与 dist/ 比对，需先 pnpm build
```

## 7. 下一块：建账户命令

媒体导入已完成，见 ADR 21.7。本机现在具备登录、列表、新建、编辑、导入图片、选图、预览、自动保存、发布、回滚和撤下入口。

下一块是第 9 块：一条**只能在服务器上跑**的建账户命令。现在建账户只能靠直接调 `createAccount`，那不是可以交给 Morii 的东西。注意两件已经实测到的事：`createAccount(db, input, now)` 的第三个参数是必填的，漏掉会在插入时抛 `now is not a function`；口令下限 24 位（ADR 第 10.4 节），命令要在读口令之前就说清这一条。

命令不得把口令写进任何日志、命令行历史或数据库以外的文件，也不得为了方便加一条 HTTP 建账户入口——账户创建留在服务器上，是第 10.1 节那套暴露面推论的一部分。

## 8. 必须随结论报告、不得当作已解决的差异

分成两类。**第一类会跟着进生产**，搬迁时必须一并解决或明确记录；**第二类只属于原型**，随原型退役而失效，列在这里是为了避免有人照搬。

### 8.1 会进生产的

1. **发布闸门会误挡讲 Markdown 语法的文章。**`imageReferencesIn` 用正则扫全文，不区分围栏代码块，实测 ` ```markdown ` 围栏里的示例图片会被当成真实引用而被拒。方向是安全的一侧，但**搬进生产前必须改成按解析结果取图片引用**。
2. **发布闸门只覆盖数据库存得下的字段。**`publishCandidate` 是从 schema 上 `pick` 出来的子集。生产 schema 现在 14 个字段全有了（4.2），所以**搬迁时这个子集应当一并扩到全集**，否则会保留一个没有理由的缺口。
3. **`@tiptap/markdown` 是 Beta，且已实测会破坏 Moriium 的语法。**11/11 保真**完全依赖** `source-nodes.ts` 与 `image-node.ts`，不是 Tiptap 自身的能力。升级 Tiptap 时必须重跑 `roundtrip:report`。这套节点搬进生产 Admin 时要整体搬，不能只搬编辑器。
4. **序列化器不吐末尾换行。**round-trip 输出比原文少一个字符。接保存路径时要补回，否则每次保存都会给文件添一行无谓 diff。
5. **`marked@17.0.6` 是依赖表之外的直接依赖**，Morii 已追认。升级 Tiptap 时若 marked 跨大版本，这个直接 pin 需要一并调整。
6. **`scripts/encrypt-post.mjs` 仍有自己的 `featuresOf()`**，与 `shared/content-blocks.ts` 的 `markersFor` 是两份实现。合并要改生产脚本，一直没做。
7. ~~**图片属性面板不校验路径，也没有媒体选择器。**~~ 第 8 块已解决（ADR 21.7）：路径框只读，插图只能从已净化、已登记的媒体库里选。
8. **句子中间的图片会丢文件。**只认整行图片，是刻意取舍，有用例钉住。生产要不要放宽是个内容决定，不是 bug。
9. **自动保存失败之后不会自动重试。**正文不会丢，状态也不谎称已保存，但**作者停手不打字就永远不会再试**。加退避重试要连着「重试期间显示什么、几次以后放弃」一起定，是界面决定。
10. **Admin 直接暴露在公网。**Morii 在 ADR 第 1.1 节撤掉了客户端证书。后台代码自身的漏洞现在直接暴露，ADR 0001 第 5 节的测试标准在这里比之前更重要。
11. **不做告警**（Morii 定夺，ADR 第 12 节）。可以查，但出事不会通知你，残余风险写在 12.2。

### 8.2 只属于原型的

12. 尖峰的会话在内存里、cookie 没有 `Secure`、限速全局计数。**生产已在 ADR 21.4 重做**；此条只用于提醒不要从尖峰回抄。
13. Vite 开发服务器会把项目树端出去，`admin-b/.data/admin.db` 曾可无会话下载（已 `server.fs.deny` 挡掉）。生产不用 Vite dev server，不适用。
14. 预览是渲染同源，不是外观同源。生产 Admin 直接跑在站点自己的构建里，这条会自然消失，**但不要因此以为外观同源是免费的**。
15. 尖峰库里已经保存的版本仍带着 `![]()` 填充图片（13.18 修的是以后不再加）。**生产库是新的，不受影响**；如果将来要从尖峰库迁数据，这条要重新变成阻塞项。
16. 窄屏下右栏面板要滚很久才够得到；移动模拟下自动化点不动（工具限制）；登录回车提交没被自动化验证过。都属于界面决定或工具限制，生产界面重做时一并处理。
17. **Vite 大分包警告仍在**，仍在 Phase 0 的体积测量清单里。

## 9. 测试的写法约定

ADR 0001 第 5 节要求「测试必须证明而不是声明」。生产侧继续按这个写：**不是确认清单，是破坏尝试**。

每个校验器都做过负向测试。只会通过的校验器没有价值。近期三个例子值得照抄：

- 把源节点改回 `atom`，让可编辑性断言先红一次；
- 用 Proxy 观察 Tiptap 实际读了 marked 的哪些成员，而不是维护一份会过期的白名单——那个观察器第一次运行就抓出了清单外的 `constructor`；
- 往一个公开页面里塞进 `node:sqlite` 这个字符串再构建，确认 `check-render-split` 真的会红。

还有一个结果值得记住其形状：把发布闸门从写入之前挪到写入之后再跑，**只有「闸门先于写入」那条变红，「拒绝后不留痕迹」那条仍然是绿的**——因为事务回滚把写入撤掉了。这不是测试写松，是两条不同的保证各由不同机制守着。**两条都要留**：只写后一条的话，将来有人把校验挪到提交之后就没人会发现。

第 8 块又添了一个，形状值得记住，因为它不是「测试写松」而是「验证的对象选错了」：上一块的浏览器检查是「登录壳挂载成功」，这句话是真的——而 `trailingSlash: 'always'` 让 `src/admin/api.ts` 里 15 处调用全都落到 404 页面，**整个生产 Admin 够不到自己的 API**。挂载成功与能不能工作是两件事，而检查只覆盖了前一件。现在由 `tests/admin-client-routes.test.mjs` 把客户端路径、`astro.config.mjs` 的斜杠策略和每个 rest 路由自己的正则绑在一起。

接手后新增校验逻辑时沿用：**先让它失败一次，再让它通过。**

## 10. 署名

按 `AGENTS.md`：Codex 实质贡献用 `Co-authored-by: Codex <267193182+codex@users.noreply.github.com>`，Claude 用 `Co-authored-by: Claude <noreply@anthropic.com>`。只署真实贡献者，提交后核实 trailer。
