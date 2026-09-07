# 交接：公开站 V1 非视觉验收的遗留问题

> 日期：2026 年 9 月 1 日
>
> 交给：Codex
>
> 来自：Claude。那一轮的完整证据在[非视觉验收结果](handoff-claude-public-v1-nonvisual-results.md)
>
> 状态：**已按 Enouia 的三轮复核修订。** 第一轮：原稿的 P1／P3 判断有误，P5／P6 的建议被更好的官方做法取代，并补上一处漏掉的隐私证据缺口。第二轮：`verify` 顺序、视频键盘语义、历史路径枚举三项收口，文档口径改为逐项如实登记。第三轮（PR 前）：ref 直接指向 blob 的审计盲区、音乐控件的无脚本收口、`after` 钩子的已退出判断。本文是修订后的版本。
>
> 注：那一轮的任务书 `docs/handoff-claude-public-v1-nonvisual-acceptance.md` 目前只存在于主检出 `E:\Moriium\docs\` 且**未被 Git 跟踪**，因此不在本工作树里，本文不对它做链接。需要原始任务书请向 Morii 取。
>
> 停止点：本分支已经 Morii 授权提交并推送，**未合并、未部署**。此后的改动仍需另行授权。

## 给 Codex 的启动提示

先读 `AGENTS.md`，再读本文与[非视觉验收结果](handoff-claude-public-v1-nonvisual-results.md)。后者是每个结论的完整复现与证据，本文只做清单。

本文不是新一轮验收任务。上一轮已经完成路由与索引边界、按需加载、无 JavaScript 回退、第三方连接与 CSP、三语公开元数据、隐私与生成物审计，并留下了可复跑的测试。**不要重做这些，也不要重复它们的浏览器验收。**

开工前重新确认 Git 状态。下面第一节描述的三处状态在本文写成时为真，但它们正在变动。

## 一、开工前必须搞清的仓库状态

三处状态同时存在，混淆任何两处都会造成返工。

| 位置 | 分支 | 状态 |
| --- | --- | --- |
| `E:\Moriium`（主检出） | `codex/frontend-design-rebuild` | 公开站视觉重做已提交为 `144327a`（21 个文件）。**尚未合入 `main`。** |
| `E:\Moriium\.claude\worktrees\handoff-doc-workpackages-71e712` | `claude/handoff-doc-workpackages-71e712` | 11 个提交，已推送到 `origin`，**已开 PR，未合并**。 |
| `main` / `origin/main` | — | `179c709`。既不含视觉提交，也不含非视觉修复。 |

两批改动都还没进 `main`，而且**互不知情**：非视觉分支的全部验收是针对 `179c709` 做的，不含 `144327a`。

**合并顺序已定**（Enouia）：先把非视觉改动修正、审阅并形成独立提交，再合入视觉提交 `144327a`，最后对组合结果跑一次完整门禁。两批源码目前没有同名文件冲突。**不要 rebase 或强推已经发布的视觉分支。**

本分支的改动：

```text
 M astro.config.mjs                        Sitemap filter/serialize、assetsInlineLimit
 M docs/enouia-todo.md                     只勾选证据齐全的条目
 M package.json                            audit → audit:public；改用 astro build --force；verify 先构建再测试
 M scripts/audit-public-tree.mjs           隐私审计扩展到全历史路径与内容，新增 --root
 M src/components/ReaderEnhancements.astro 视频链接拦截并保持链接语义、音乐按钮启用
 M src/markdown/rehype-moriium-content.mjs 无脚本回退修复（视频链接、音乐按钮与文案、本地音频 controls）
+  docs/handoff-claude-public-v1-nonvisual-results.md
+  docs/handoff-codex-public-v1-nonvisual-followups.md   本文
+  tests/public-contracts.test.mjs         输出合同（22 项）
+  tests/reader-loading.test.mjs           eager 可达性（14 项）
+  tests/reader-fallbacks.test.mjs         无脚本回退（23 通过 + 1 todo）
+  tests/privacy-audit.test.mjs            审计规则与全历史扫描的红绿测试（26 项）
```

不要丢弃、重置或重写这批改动，也不要 rebase 或强推本分支——它已经推到 `origin`。

## 二、待办清单

### T1　合并后重新构建确认 eager CSS 预算

**不是预算阻塞项。** `144327a` 现有视觉构建产物的 eager CSS 实测 102.7 KB gzip，预算上限 120 KB，尚有 17.3 KB 余量。**现在没有理由提高预算。**

合并非视觉改动后仍要重新构建确认一次：

```text
pnpm build && pnpm baseline
```

若届时超出，先报告实测值与超出原因再决定，不要静默抬高——`measure-baseline.mjs` 的注释写明：抬高预算是正常编辑，不在提交信息里说明理由就不是。

同时确认上一轮四个测试仍全绿。已核对 `144327a` 未改动 `hreflang`/`canonical`/`robots` 逻辑，未新增 `<script>`，未新增指向 `/design/` 的链接，因此预期不受影响——但要实际跑，不要假定。

### T2　剧透的无脚本回退（唯一未通过的回退项）

上一轮把这项写成"通过"是错的，已改回未通过并记为 `tests/reader-fallbacks.test.mjs` 中的一条 `todo` 用例，`docs/enouia-todo.md` 的"逐项验收无 JavaScript 回退"也已改回 `[~]`。

| 项 | 内容 |
| --- | --- |
| 现象 | 无脚本时剧透是一块 `color: rgba(0,0,0,0)` 的透明文字，不可操作、无说明。当前测试只证明文字存在于 HTML，并没有证明读者看得懂。 |
| 复现 | 用 `script-src 'none'` 提供 `dist/client`，打开 `/zh/posts/reader-capabilities/`，读取剧透元素的计算样式。 |
| 何时做 | **等视觉提交合入后**再做。 |
| 怎么做 | 渐进增强：静态状态必须能读到内容或明确说明；只有脚本成功绑定后才添加按钮语义（`role`/`aria-pressed`）和遮蔽交互。 |
| 不要怎么做 | **不要把行内 spoiler 改成 `<details>`**——它不是行内语义元素，会破坏当前段落结构。 |
| 所有权 | `src/styles/` 与 `ReaderEnhancements.astro` 的 `bindSpoilers`。 |

### T3　`/design/` 的内联脚本：暂不修

已定：`/design/` 继续留作视觉评审材料，**不为研究页面专门调整 CSP，也绝对不能加入 `'unsafe-inline'`**。等公开视觉正式验收后，再把 `/design/` 路由移出生产构建；研究历史保留在 Git 和设计分支中。

所以这不是当前上线阻塞项，**现在也不要外部化那 11 处研究页脚本**。

背景（正式页面部分上一轮已修）：`deploy/nginx/moriium.conf` 的 `script-src 'self'` 不含 `'unsafe-inline'`、nonce 或 hash，而构建原本把小脚本内联进 HTML，导致视频同意、音乐卡片、剧透、复制限制与首页 feature reel 在生产环境根本不执行。修法是 `vite.build.assetsInlineLimit: 0`，让每个脚本成为 `'self'` 可加载的文件，没有削弱 CSP。**任何 CSP 问题都不要用加 `'unsafe-inline'` 的方式处理。**

### T4　本地化 taxonomy 页没有 Sitemap alternate（工作包 D 的 follow-up）

路径段随语言变化的分类／标签页各自得到 0 条 alternate：

```text
/en/tags/Rebuild/    /ja/tags/再構築/    /zh/tags/重构/        → 各 0 条
/en/tags/Moriium/    /ja/tags/Moriium/   /zh/tags/Moriium/     → 各 3 条
```

成因与文章那处相同：`@astrojs/sitemap` 按路径形状分组，三语同名的标签恰好能分到一组，译名不同的分不到。

修复需要一份 taxonomy 译名对照表，项目里目前不存在。**分类**理论上可从 `translationKey` 反推（同组文章的 `category` 互为译名，且分类是单值）；**标签**不行——标签是集合，跨语言没有可靠的对应顺序，靠位置或数量对齐会造出错误的翻译关系，比没有 alternate 更糟。因此本轮没有实现半套映射。

由于这项未做，`docs/enouia-todo.md` 中"检查 `hreflang`、canonical、RSS 与 Sitemap 的语言关系"保持 `[~]`，结果文档也把工作包 D 记为部分通过。

## 三、已经查清、不需要再动的事

写在这里是为了避免有人重新拾起这些判断。

**结构页的 `hreflang` 不缺，不要改 `BaseLayout.astro`。** 原稿把"HTML `<head>` 里没有 `hreflang`"当成缺陷，是错的。Sitemap 已经为首页、writing、archive、categories、tags、about 三语生成互指，实测每个代表性条目都有 3 条 alternate、双向且包含自身。Google 明确说明 HTML、HTTP Header 和 Sitemap 三种方式等价，同时维护多套没有搜索收益反而更容易漂移（[Google 多语言页面说明](https://developers.google.com/search/docs/specialty/international/localized-versions)）。

分工保持现状：**文章按 `translationKey`，结构页按 Sitemap。** 两者不要合并成一套代码——文章的译文可能使用不同 slug，路径推断会静默丢失关系；结构页每语言同路径，路径就是分组依据。已在 `tests/public-contracts.test.mjs` 补了回归测试（结构页 alternate 完整、双向、包含自身），未进入任何视觉文件。

**`prototypes.css` 命名问题已消解。** `144327a` 已用 `public.css` / `public-home.css` / `public-reading.css` 替换。

**`pnpm audit` 的命令歧义已修。** `pnpm audit` 是 pnpm 内置的依赖漏洞审计，只有 `pnpm run audit` 才会运行同名项目脚本（[pnpm audit](https://pnpm.io/cli/audit)、[pnpm run](https://pnpm.io/cli/run)）。经 Morii 同意，项目脚本已改名：

```text
pnpm run audit:public
```

`pnpm audit` 保留其原本的依赖漏洞审计含义。文档中的命令已同步修正。

**构建缓存问题已修，不要自制失效器。** 改动 `src/markdown/` 转换层后 `pnpm build` 会静默复用旧产物，因为 Astro 内容层缓存 `node_modules/.astro/data-store.json` 不感知渲染器变化。Astro 7.2.4 提供了正式参数 `astro build --force`，作用就是清除内容层与内容集合缓存并强制完整重建（[Astro CLI 文档](https://docs.astro.build/en/reference/cli-reference/)）。`package.json` 的 `build` 与 `verify` 已改用它，发布链路调用 `pnpm build` 自然获得干净构建。**不要实现自制 mtime 判断，也不要手工删除缓存目录。**

**隐私审计的历史覆盖已补齐两轮。** 第一版宣称"全历史审计通过"是超出证据的：当时对历史只应用了路径规则和两个固定字符串。第二版把内容规则铺满历史后，路径枚举仍依赖 `git log --diff-filter=A`，那又漏两类：纯重命名进入禁止路径是 R 不是 A，同一 blob 位于多个路径时只会被归到其中一个。

第三版又补上第三类：ref 可以直接指向一个 blob，上面没有树也没有提交，因而没有任何路径。`rev-list --objects` 把这种对象输出成一个没有路径的裸 id，所有按路径索引的枚举都会丢掉它，内容根本不会被读——`git hash-object -w` 加 `git update-ref` 就能造出来，工具误操作也会。

现在的做法是三者求并集：遍历**所有可达提交的完整 `ls-tree` 快照**拿到每个 blob 曾经存放过的全部路径；并上 `rev-list --objects --all`，它能看到直接指向树的 ref（本仓库有 15 个 `refs/codex/turn-diffs/checkpoints/*` 就是这种，藏着 35 个任何提交树里都没有的 blob）；再并上 `for-each-ref`，用 ref 名代替路径覆盖直接挂在 ref 上的 blob，对它们执行全部无作用域规则（有作用域的规则问的是路径，这里没有路径，硬编一个就是编造答案）。缺任何一路都是覆盖漏洞。实测 117 个可达提交、343 条历史路径、778 个 blob（777 文本、1 二进制跳过、0 个由 ref 直接命名），命中 0。

`cat-file` 子进程现在非零退出、报告对象缺失、或返回数量少于请求数时，一律让审计失败——静默少读几个对象却照样打印 "clean"，是这个脚本最危险的失败方式。

补这一项时发现三条规则需要按路径限定作用域（`private-source-path`、`exif-location`、`coordinate-frontmatter`，只在 `src/content/`、`dist/`、`public/media/` 内生效）。不限定时全历史返回 15 处命中，逐条核对全部是测试夹具与设计文档在描述"如何去除 EXIF"——`scripts/sanitize-media.mjs` 与它的测试必须写出 `GPSLatitude` 才能去掉它。把安全网报成泄漏只会让人学会忽略审计。同一套作用域同时适用于当前树与历史。

红绿测试已补，`tests/privacy-audit.test.mjs` 共 26 项。除了给每条规则喂合成危险样本与良性近邻，还建临时 Git 仓库验证五件事：含合成口令与坐标的文件提交后再删除仍会被抓到；纯重命名进入 `data/moriium.db` 再删除仍会被抓到；同一 blob 同时位于 `docs/` 与 `src/content/` 时，作用域内那条路径会被报出而作用域外那条不会；`update-ref` 直接挂一个含合成私钥标记的 blob 仍会被抓到；以及删掉某个 loose object 后审计必须失败而不是打印 "clean"。全部断言都同时检查**不打印任何匹配内容**。

## 四、验证方式

上一轮留下的证据，接手后应当仍然如此：

```text
pnpm check
pnpm test
pnpm build
pnpm links
pnpm run audit:public
pnpm split
pnpm baseline
```

实测数字见[非视觉验收结果](handoff-claude-public-v1-nonvisual-results.md)第十节，那里是按 CI 顺序跑出来的最终结果。本机 Windows 沙箱未出现 `spawn EPERM`。

那 1 项 skip 是既有的 `tests/admin-release.test.mjs:451`（Windows 符号链接），与本轮无关。那 1 项 todo 是 T2 主动登记的剧透缺口，不是被跳过的断言。

四个新测试挡住的回归：

| 测试 | 挡住的回归 |
| --- | --- |
| `tests/public-contracts.test.mjs` | `/admin/`、`/api/`、`/design/`、draft 或 `unlisted` 进入 Sitemap；搜索/RSS 混入非本语言或未列出文章；文章 `hreflang` 不按 `translationKey`；结构页语言组不完整或不双向；同一 URL 重复声明某语言。 |
| `tests/reader-loading.test.mjs` | 普通页面 eager 加载 PhotoSwipe / Mermaid / KaTeX / 搜索 / 解密 / Admin 代码；文章加载正文并不需要的模块；重型库脱离 `import()`。 |
| `tests/reader-fallbacks.test.mjs` | 无脚本回退退化：远程视频退回成纯 `<button>`、音乐按钮（本地或远程）变回可点、本地音频丢掉 `controls`、静态文案又去指使读者按一个 disabled 的按钮；以及视频控件重新戴上 `role="button"` 却不实现空格键。 |
| `tests/privacy-audit.test.mjs` | 审计规则失效而没人察觉；全历史扫描的 git 管道退化到"扫不出已删除提交里的秘密"或"扫不出直接挂在 ref 上的 blob"。 |

期望值一律从内容元数据与实际构建产物推导，没有写死任何篇目的 slug。新增或改名文章不需要改测试；若某个测试因为文章集合变化而失败，那通常是它在正确报告问题。

## 五、边界

- 不要重做上一轮已完成的验收，也不要重复其浏览器验证。
- 不要用加 `'unsafe-inline'` 的方式处理任何 CSP 问题。
- 不要为了让预算通过而静默抬高预算。
- 不要用硬编码 slug 的方式让测试通过。
- 不要 rebase 或强推已发布的视觉分支。
- 不要为结构页在 HTML 里再加一套 `hreflang`。
- 不要把行内 spoiler 改成 `<details>`。
- 不要实现自制的构建缓存失效器。
- 不接触正式内容、私密文章与原始照片；不读取 `.private/posts/`。
- 不新增公开 SSR，不新增读者账户、分析或第三方服务。
- 隐私相关的输出只报路径、Git 对象标识与命中数量，不回显匹配内容。
- 没有 Morii 的明确授权，不提交、不合并、不推送、不部署。
