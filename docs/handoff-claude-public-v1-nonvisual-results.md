# 结果：公开站 V1 非视觉验收

> 日期：2026 年 9 月 1 日
>
> 执行：Claude
>
> 依据：`docs/handoff-claude-public-v1-nonvisual-acceptance.md`（目前只存在于主检出 `E:\Moriium\docs\`，未被 Git 跟踪，故不在本工作树内）
>
> 状态：工作包 A、B、E 通过；C 与 D 大部分通过，各留一处 follow-up（剧透的无脚本状态、taxonomy 页的 Sitemap alternate）。详见第十四节。

## 一、起点

| 项目 | 值 |
| --- | --- |
| 起始分支 | `main` |
| 起始提交 | `179c709`（与 `origin/main` 一致，与交接文档记录的提交号相同，无漂移） |
| 工作分支 | `claude/handoff-doc-workpackages-71e712` |
| 独立工作树 | `E:\Moriium\.claude\worktrees\handoff-doc-workpackages-71e712` |
| 依赖安装 | `pnpm install --frozen-lockfile`，未改动 `pnpm-lock.yaml`，未新增依赖 |

开工前确认：`E:\Moriium` 主检出当时位于 `codex/frontend-design-rebuild`，带有未提交的公开站重做。本轮全程未在该目录执行任何写操作。

**需要 Morii 注意**：本轮进行中，另一个会话把那批视觉改动提交为 `144327a`（"Rebuild the public frontend around Blue Aperture"，21 个文件）。不是本轮所为，内容没有丢失，但那棵工作树的状态已从"未提交"变为"已提交"。本轮验收针对 `179c709`，不含这次视觉提交。

## 二、修改的文件与理由

| 文件 | 理由 |
| --- | --- |
| `astro.config.mjs` | 三处。① Sitemap `filter` 改为按内容元数据排除，修掉两个红旗；② 新增 `serialize`，让文章 alternate 依据 `translationKey` 而不是路径形状；③ `vite.build.assetsInlineLimit: 0`，让内联脚本变成外部文件，以符合既有 CSP。 |
| `src/markdown/rehype-moriium-content.mjs` | 远程视频的同意控件由 `<button>` 改为带 `href` 的 `<a>`；远程音乐的播放按钮默认 `disabled`；本地音乐补 `controls`。三项都是无脚本回退缺口。 |
| `src/components/ReaderEnhancements.astro` | 与上面配套：视频处理器改为拦截链接默认跳转并保持链接语义，音乐处理器在绑定后启用按钮。 |
| `scripts/audit-public-tree.mjs` | 扩大隐私审计范围（Git 全历史路径与内容、服务端产物、本轮生成物），新增 `--root`，并导出规则集以便被合成样本验证。 |
| `package.json` | 经 Morii 同意的三处：`audit` 改名为 `audit:public`（避开 pnpm 内置命令）；`build` 与 `verify` 的构建步骤改为 `astro build --force`；`verify` 把构建提到测试之前，否则 CI 干净检出没有 `dist/` 可读。 |
| `tests/public-contracts.test.mjs`（新增） | 工作包 A 与 D 的输出合同断言。 |
| `tests/reader-loading.test.mjs`（新增） | 工作包 B 的 eager 可达性断言。 |
| `tests/reader-fallbacks.test.mjs`（新增） | 工作包 C 的无脚本回退断言。 |
| `tests/privacy-audit.test.mjs`（新增） | 工作包 E：用合成危险样本证明每条审计规则确实会失败。 |

未修改任何视觉工作所有的文件。未修改 `pnpm-lock.yaml` 与全局测试配置，未新增依赖。`package.json` 改了三处，都经 Morii 单独同意：`audit` 改名、构建改用 `astro build --force`、`verify` 调整顺序（见第十节）。

## 三、两个 Sitemap 红旗

两个都在干净构建上复现，先让新测试失败，再做最小修复。

| 红旗 | 复现 | 原因 | 处理 |
| --- | --- | --- | --- |
| Sitemap 含 `/admin/` | 复现。`sitemap-0.xml` 第 2 条即 `https://morii9961.top/admin/`，而 `dist/client/admin/` 并不存在 | 旧 `filter` 只排除 `/design/`；`@astrojs/sitemap` 会列出构建已知的全部路由，包括 on-demand 的 `/admin/` | `filter` 增加 `/admin/`、`/api/` 排除 |
| Sitemap 含 `/zh/posts/reader-capabilities/` | 复现。该文 `unlisted: true` | 同上，`filter` 完全不看内容元数据 | `filter` 读取 `src/content/` 的 frontmatter，按 `draft` / `unlisted` / 受保护集合的 `listed` 排除，不写死任何 slug |

**验证规则确实随元数据生效**：临时加入三个合成文章（一个 `unlisted: true`，一对 `translationKey` 相同但 slug 故意不同的 ja/en 译文），重建后合成的 unlisted 文章被正确排除，两篇 listed 合成文章被正确收录。随后删除，构建回到原状。

顺带发现并修复的第三项：根路径 `/` 曾进入 Sitemap。它只是 `302` 跳转到 `/zh/` 的存根，自身带 `noindex`，且会让语言组里出现两条 `zh-CN`（`/` 与 `/zh/`）。已一并排除。

## 四、正式公开路由矩阵

构建后逐项核对 `dist/client`。

| 类别 | 代表性路径 | 静态生成 | Sitemap | 搜索/RSS | 结果 |
| --- | --- | --- | --- | --- | --- |
| 三语首页 | `/zh/`、`/ja/`、`/en/` | 是 | 是 | 不适用 | 通过 |
| 列表页 | writing、archive、categories、tags、about | 是 | 是 | 不适用 | 通过 |
| 已列出文章 | 三语 `moriium-reconstruction` | 是 | 是 | 三语各自可见 | 通过 |
| 未列出文章 | `reader-capabilities` | 是，直达可达 | 否（修复后） | 否 | 通过 |
| 搜索索引 | `/search/{zh,ja,en}.json` | 是 | 否 | 只含同语言已列出文章 | 通过 |
| RSS | `/{zh,ja,en}/rss.xml` | 是 | 否 | 只含同语言已列出文章 | 通过 |
| 作者后台/API | `/admin/`、`/api/*` | 否，保持 on-demand | 否（修复后） | 否 | 通过 |
| 设计研究 | `/design/*` | 保留研究构建 | 否 | 否 | 通过 |

补充断言结果：

- `/design/` 下 13 份 HTML 全部带 `<meta name="robots" content="noindex,nofollow">`——通过；
- 正式页面无任何指向 `/design/` 的 `href`——通过；
- `robots.txt` 指向实际存在的 `sitemap-index.xml`，与 Sitemap / RSS / 搜索无矛盾——通过；
- Sitemap 不含 `/admin/`、`/api/`、`/design/`、draft 或 `unlisted` 内容——修复后通过；
- Sitemap 每条 URL 都能落到实际构建出的 `index.html`，全部使用正式域名与尾斜杠，无重复——通过；
- 设计研究仍留在源码中，未删除、未搬迁。

## 五、资源加载结果

新测试从 HTML 的 `src`/`href` 出发，只跟随**静态** import 与 CSS 引用，`import()` 按定义不跟随——这条排除本身就是被验收的合同。哈希文件名不参与判断。

| 页面 | eager JS | 高级模块 | 结果 |
| --- | --- | --- | --- |
| 三语首页 | 1.4 KB | 无 | 通过 |
| writing 列表 | 1.0 KB | 无 | 通过 |
| 普通文章 | 2.3 KB | 仅一份共用 reader 脚本 | 通过 |
| 能力文章 | 12.8 KB | photoswipe.css、katex.css 及六份 reader 脚本 | 通过 |
| 搜索（未打开） | 未加载模块与索引 | 索引以 `data-search-index` 属性传递，模块经 `import()` | 通过 |
| 加密文章 | 无公开加密文章（唯一条目是 draft fixture） | 公开产物中不存在任何解密代码 | 按交接约定，只验证生成逻辑与隐私合同 |

逐条合同：

1. 普通页面 eager 图不含 PhotoSwipe、Mermaid、远程音乐、视频 iframe、解密器、Vue、Tiptap、ProseMirror——通过；
2. 文章只启用自身正文需要的模块：期望值由 `detectReaderFeatures` 对该文正文计算得出，不写死篇目——通过；
3. 搜索模块与三语 JSON 只在读者打开搜索后加载——通过；
4. 解密逻辑只可能出现在受保护文章；当前公开树中 `crypto.subtle`、`PBKDF2`、`deriveKey`、`AES-GCM` 一处都没有，`data-decrypt-form` 也只在 protected 路由——通过；
5. Admin 的 Vue/Tiptap/数据库代码不可从任何公开入口到达——`pnpm split` 覆盖 164 个可达文件，通过；
6. 预算全部满足，**没有抬高任何预算**：

   | 预算项 | 实测 | 上限 |
   | --- | --- | --- |
   | 普通页 eager JS | 2.3 KB | 8.0 KB |
   | 能力文章 eager JS | 12.8 KB | 24.0 KB |
   | eager CSS（gzip） | 85.7 KB | 120.0 KB |
   | 搜索索引（gzip） | 0.3 KB | 256.0 KB |

关于 `assetsInlineLimit: 0` 的影响：原先被内联进 HTML 的小脚本改为独立文件，普通文章 eager JS 由此从约 1 KB 变为 2.3 KB。这些字节此前也一样要下载，只是计在 HTML 里；两项预算仍有大量余量。

## 六、无 JavaScript 回退结果

用本地静态服务复刻生产头部，另开一个端口把 `script-src` 换成 `'none'`，以此得到"脚本一律不执行"的状态。已确认该页面确实没有任何脚本运行（`data-video-bound` 未被设置）。

| 能力 | 无 JavaScript 时 | 结果 |
| --- | --- | --- |
| 普通图片 | 图片可见，外层是指向原图 `/fixtures/reader-image.svg` 的普通链接 | 原本即通过 |
| GitHub 卡片 | 普通 `https://github.com/Morii9961/Moriium` 链接；缓存缺失时仍是完整链接卡而非空卡 | 原本即通过 |
| 提示块 | 标题与正文是普通语义内容，不依赖脚本 | 原本即通过 |
| 剧透 | 正文仍在文档中，`color: rgba(0,0,0,0)` 保持遮蔽，带 `role="button"`、`aria-label`、`aria-pressed="false"` | **未通过**：无脚本时是一块不可操作的透明文字，读者既看不到内容也没有任何说明。合同要求的是「可理解的无脚本状态」，只做到「内容仍在文档中」。见第十二节第 2 条 |
| 远程视频 | **原为缺陷**：只有一个 `<button>`，URL 藏在 `data-video-src`，无脚本时完全无路可走。已改为带 `href` 的 `<a>`，指向同一个已在白名单内的 provider 地址 | 修复后通过 |
| 本地视频 | 原生 `controls`，`preload="none"` | 原本即通过 |
| 远程音乐 | **原为缺陷**：播放按钮在无脚本时形同虚设，却看起来可播放。已改为默认 `disabled`，由脚本绑定后启用；标题与作者始终可读，状态文案说明需要主动加载 | 修复后通过 |
| 本地音乐 | **原为缺陷**：`<audio>` 没有 `controls`，无脚本时无法播放。已补 `controls`，保持 `preload="none"` | 修复后通过 |
| 复制限制 | 标记层没有 `user-select: none`，无脚本时正常复制；限制只由 `copy` 监听器施加，且放行 `pre`、`code`、输入框与 `[data-allow-copy]` | 原本即通过 |
| 加密文章 | 页面外壳只服务端渲染公开元数据、加密说明与警告，正文位于 `hidden` 容器，路由在 `getStaticPaths` 阶段过滤 draft，正文从不进入 HTML | 通过（当前无公开加密文章，按逻辑与隐私合同验证） |

三项修复都落在 Markdown 转换层与其配套的 reader 脚本，没有进入 CSS 或页面重做。

**本节不能整体宣称通过**：剧透一项是真实缺口。`tests/reader-fallbacks.test.mjs` 里那条断言只证明文字留在文档中，不证明无脚本读者看得懂；缺口本身记为一条 `todo` 用例，会在测试输出里显示为 todo 1，不会被算成通过。

## 七、第三方连接与 CSP

浏览器：Chrome 148.0.7778.280（Claude 浏览器 1.40609.0）。访问地址：`http://127.0.0.1:4399`（生产 CSP）与 `http://127.0.0.1:4400`（`script-src 'none'`）。截图未采集，本节结论均来自网络记录与 DOM 读数，不含本机私密路径或请求头。

- **初始加载第三方请求数：0**。能力文章共 64 个请求，来源集合只有 `http://127.0.0.1:4399`；`<iframe>` 数量为 0。
- **主动操作后的目标 origin**（用拦截方式验证，未真正连接第三方，也不依赖对方是否在线）：

  | 操作 | 目标 | CSP 指令 | 是否一致 |
  | --- | --- | --- | --- |
  | 点击视频同意控件 | `https://www.youtube-nocookie.com` | `frame-src` | 一致 |
  | 点击音乐播放 | `https://meting.spr-aachen.com` | `connect-src` | 一致（`credentials: omit`、`referrerPolicy: no-referrer`） |

  视频：拦截 `replaceWith`，捕获到即将插入的 iframe（`src` 为白名单地址，`referrerPolicy: strict-origin-when-cross-origin`，`loading: lazy`），因未接入文档故未产生任何网络请求；链接的默认跳转被正确阻止。音乐：拦截 `fetch`，捕获到唯一一次调用指向白名单接口。

- 三处允许列表逐字一致，**未新增任何来源**：`VIDEO_PROVIDERS`（youtube-nocookie、player.bilibili）对应 `frame-src`；`ALLOWED_METING_ORIGIN` 对应 `connect-src`；GitHub 仅在构建期读缓存，公开产物中不含 `api.github.com`。没有使用 `https:` 通配新增 iframe 或 connect 服务。

### 本轮发现的最严重问题：内联脚本被生产 CSP 拦截

用生产 CSP 打开构建产物时，控制台报出 **4 条**违规（能力文章）与 1 条（首页）：

```text
Executing inline script violates the following Content Security Policy directive 'script-src 'self''.
```

`deploy/nginx/moriium.conf` 的 `script-src 'self'` 不含 `'unsafe-inline'`、nonce 或 hash，而构建把体积较小的脚本内联进了 HTML。后果是这些脚本在生产环境**根本不会执行**：视频同意控件、音乐卡片、剧透、解密代码块的复制、复制限制提示，以及首页的 feature reel。本地不带该头部预览时一切看起来正常，因此此前未被发现；文档与测试中也没有任何关于内联脚本或 `unsafe-inline` 的记录。

处理方式选择了不削弱策略的一侧：`vite.build.assetsInlineLimit: 0`，让每个脚本都成为 `'self'` 可加载的文件，而不是给 CSP 加 `'unsafe-inline'`。修复后重新构建，正式页面内联脚本数为 **0**，同一浏览器同一 CSP 下控制台**无任何错误**。

遗留：`/design/` 研究页仍有 11 处内联脚本，同样会被该 CSP 拦截。研究页本轮不动，记录在第九节。

## 八、三语公开元数据

期望值一律由内容集合与实际构建结果推导，不把当前三篇文章的 slug 写死。

**页面头部**

1. `<html lang>` 与当前语言一致（`zh-CN` / `ja-JP` / `en-US`）——通过；
2. canonical 是当前页面的绝对正式 URL，不指向 `/design/`、本地地址或其他语言——通过；
3. `hreflang` 只按真实 `translationKey` 关系生成：`moriium-reconstruction` 三语互指，各得 3 条——通过；
4. 缺失翻译不生成链接：`reader-capabilities` 只有自身 `zh-CN` 一条，没有虚构 ja/en alternate——通过；
5. 只使用既有的 `zh-CN`、`ja-JP`、`en-US`，未引入 `x-default`——通过；
6. 未翻译文章不会凭路径相似获得虚构 alternate——通过。

**搜索、RSS 与 Sitemap**

- 三语搜索索引各只含同语言、已公开且允许列出的文章——通过；
- RSS 的 `<language>`、标题、条目与链接均属当前语言——通过；
- draft、`unlisted` 与受保护正文不进入搜索或 RSS——通过；
- Sitemap 的 alternate **原为潜在缺陷**：`@astrojs/sitemap` 的 `i18n` 依据路径形状推断语言组。当前三篇译文恰好共用同一 slug，所以结果看上去正确——这正是交接文档警告的假通过。用一对 `translationKey` 相同、slug 故意不同的合成译文验证，旧实现给出的 alternate 数量是 **0**：翻译关系被静默丢失。已改为在 `serialize` 中按 `translationKey` 重建，合成样本下两篇正确互指，删除样本后正式产物不变；
- 结构页（三语首页、writing、archive、categories、tags、about）的 Sitemap alternate 完整、双向、包含自身——通过，已加回归测试；
- **分类与标签详情页的 alternate 未通过**：译名不同的 taxonomy 页得不到任何 alternate，见第十二节第 3 条；
- Sitemap 全部使用正式域名，尾斜杠一致，无重复，无失效地址——通过；
- 未新增占位翻译，未为测试公开任何内容文件（合成样本用完即删）。

## 九、隐私与生成物审计

`scripts/audit-public-tree.mjs` 已扩展。**输出只含路径、Git 对象/提交标识与命中数量**，明确不打印匹配行、口令、token、坐标或正文。

**覆盖范围**（原为：Git 索引 + `src/content` + `dist/client`）

| 范围 | 说明 |
| --- | --- |
| `git-index` | 当前被跟踪的文件 |
| `git-history` | 333 条曾被新增的路径，加上**所有 ref 可达的 752 个 blob 的完整内容**（751 个按文本扫描，1 个二进制跳过），每个 blob 过一遍全部内容规则 |
| `content` | `src/content/`，含受保护密文 envelope |
| `public-output` | `dist/client`，含搜索 JSON、RSS、Sitemap |
| `server-output` | `dist/server`（新增：不面向读者，但会随发布复制到 VPS） |
| `round-artifacts` | `artifacts/`、`playwright-report/`、`test-results/` 与仓库内 `.log`（新增） |

**检查目标**：7 条路径规则（`.private/` 路径、退役受保护文章、`.db`/`.db-wal`/`.db-shm`/`.sqlite`、会话文件、真实 `.env`、原始照片格式、数据库备份与转储）与 7 条内容规则（退役文章标识、私密源路径、`password:` frontmatter、私钥块、字面 Authorization 头、EXIF GPS 字段、精确坐标 frontmatter）。Admin 代码进入读者可达资源由 `pnpm split` 覆盖；`/design/`、`/admin/`、draft/`unlisted` 进入正式索引由 `tests/public-contracts.test.mjs` 覆盖。

**关于"全历史"的边界**：扫描的是所有 ref 可达的对象，这正是一次 push 会传输的范围；不可达的悬空对象不在其列，`git gc` 会清理它们。数量写进了脚本的正常输出，不是隐式截断。

**三条规则按路径限定作用域**（`private-source-path`、`exif-location`、`coordinate-frontmatter`），只在 `src/content/`、`dist/` 与 `public/media/` 内生效。这不是猜的：先不限定跑一遍全历史，得到 15 处命中，逐一核对全部是测试夹具与设计文档在描述"如何去除 EXIF"——`scripts/sanitize-media.mjs` 与它的测试必须写出 `GPSLatitude` 才能去掉它，`AGENTS.md` 必须写出 `.private/posts` 才能规定它。把安全网报成泄漏，只会让人学会忽略这个审计。同一套作用域规则同时适用于当前树与历史，避免同名规则在两处含义不同。

**结果**

| 项 | 值 |
| --- | --- |
| 命中数量 | 0 |
| 退出码 | 0 |

**先证明它会失败，再相信绿色**（交接文档的明确要求）：

- `tests/privacy-audit.test.mjs` 给每条规则喂合成危险样本与良性近邻，17 项全部通过；样本全部是本文件内编造的，没有任何一条来自 `.private/`、受保护文章或真实照片元数据；
- 端到端验证：在 `src/content/posts/` 放入含 `password:`、坐标与私密路径的合成文件，并在 `dist/client` 放入含 `GPSLatitude` 的合成文件，审计报出 4 处、退出码 1，且输出只有路径与规则标识；删除后回到 0 处、退出码 0。

扩展过程中曾出现一次误报：最初把 `.private/posts` 的历史扫描放在全仓库范围，结果报出 `AGENTS.md`、`docs/encrypted-posts.md`、`scripts/encrypt-post.mjs` 等——那是文档在正当地记录这条约定，不是泄漏。已按上表收窄范围。

**未发现任何真实敏感内容**，因此没有触发"停下并只报告位置"的路径。未删除任何文件，未改写 Git 历史，未把任何内容复制进 fixture。未引入云端 secret scanner。

## 十、实际命令与结果

先跑既有专项，再跑本轮新增，最后跑一次组合门禁。

```text
node --test --test-isolation=none tests/search.test.mjs tests/render-split.test.mjs \
  tests/public-baseline.test.mjs tests/crypto.test.mjs tests/render-markdown.test.mjs
```

| 命令 | 通过 | 失败 | skip | 退出码 |
| --- | --- | --- | --- | --- |
| 上述既有专项（开工基线） | 21 | 0 | 0 | 0 |
| `node --test tests/public-contracts.test.mjs` | 22 | 0 | 0 | 0 |
| `node --test tests/reader-loading.test.mjs` | 14 | 0 | 0 | 0 |
| `node --test tests/reader-fallbacks.test.mjs` | 19 | 0 | 1 todo（剧透缺口） | 0 |
| `node --test tests/privacy-audit.test.mjs` | 22 | 0 | 0 | 0 |
| `pnpm check` | 0 error / 0 warning / 0 hint | — | — | 0 |
| `pnpm test`（全量） | 278 | 0 | 1 skip + 1 todo | 0 |
| `pnpm build` | — | — | — | 0 |
| `pnpm links` | 本地链接全部解析 | — | — | 0 |
| `pnpm run audit:public` | 命中 0 | — | — | 0 |
| `pnpm split` | 167 个文件不需 Node；164 个可达文件无 admin 代码 | — | — | 0 |
| `pnpm baseline` | 四项预算全部满足 | — | — | 0 |

说明两点：

- 全量 `pnpm test` 在本机 Windows 沙箱**没有**出现 `spawn EPERM`，是真实执行后的结果，不是用 `--test-isolation=none` 代替的诊断；
- 唯一的 1 项 skip 是既有的 `tests/admin-release.test.mjs:451`，因 Windows 符号链接支持而跳过，与本轮无关；唯一的 1 项 todo 是本轮主动登记的剧透回退缺口（第十二节第 1 条），不是被跳过的断言。

**交接文档第七节的命令表有一处需要更正**：`pnpm audit` 会执行 pnpm 内置的依赖漏洞审计，不是 `scripts/audit-public-tree.mjs`。经 Morii 同意，项目脚本已改名为 `audit:public`，此后统一运行 `pnpm run audit:public`；`pnpm audit` 保留其原本的依赖漏洞审计含义。`pnpm verify` 直接调用 `node scripts/audit-public-tree.mjs`，不受影响。

## 十一、构建缓存陷阱（值得单独记一笔）

改动 Markdown 转换层后，`pnpm build` 仍然产出旧的文章 HTML。原因是 Astro 的内容层缓存 `node_modules/.astro/data-store.json` 按内容文件是否变化决定复用已渲染的结果，而**渲染器本身变了它并不感知**。删除 `.astro/collections` 不够。

后果值得注意：只改渲染管线而不动文章的改动，在本地和 CI 都可能被静默地用旧产物覆盖过去，测试因此给出假通过。本轮所有涉及转换层的结论，都是在清掉缓存后重新构建验证的。

**处理**：Astro 7.2.4 本身提供了正式参数 `astro build --force`，作用就是清除内容层与内容集合缓存并强制完整重建（`npx astro build --help` 可见）。`package.json` 的 `build` 与 `verify` 已改用它，因此 `pnpm build` 与发布链路自然得到干净构建。没有自制 mtime 判断，也不需要手工删缓存目录。

## 十二、遗留项目

以下都不是本轮修复的，只记录复现、结论与已定的处理方式：

1. **剧透在无脚本时无法揭示**——本轮唯一未通过的回退项。正文在文档中且被 `color: rgba(0,0,0,0)` 遮蔽，满足"内容仍在文档中"，但无脚本读者看到的是一块不可操作的透明文字，没有任何说明。已记为 `tests/reader-fallbacks.test.mjs` 中的一条 `todo` 用例，测试输出显示 todo 1，不会被算成通过。等视觉提交合入后按渐进增强补：静态状态必须能读到内容或明确说明，按钮语义与遮蔽交互只在脚本成功绑定后添加。**不要把行内 spoiler 改成 `<details>`**——它不是行内语义元素，会破坏当前段落结构。所有权在 `src/styles/`。
2. **`/design/` 研究页仍有 11 处内联脚本**，在生产 CSP 下会被拦截（与第七节同一成因）。经 Morii 决定**暂不修**：研究页继续留作视觉评审材料，不为它专门调整 CSP，更不加 `'unsafe-inline'`；等公开视觉正式验收后再把 `/design/` 路由移出生产构建，研究历史保留在 Git 与设计分支中。读者不会到达这些页面，因此不是上线阻塞项。
3. **本地化分类与标签页没有 Sitemap alternate**。路径段随语言不同的 taxonomy 页（`/en/tags/Rebuild/`、`/ja/tags/再構築/`、`/zh/tags/重构/`，以及三语分类名）各自得到 0 条 alternate，而三语同名的 `/{lang}/tags/Moriium/` 正常得到 3 条。成因与文章那处相同：`@astrojs/sitemap` 按路径形状分组。修复需要一份 taxonomy 译名对照表，目前不存在。本轮只记录，未修。

**已消解**：上一版曾记录"列表页没有 `hreflang`"与"`src/styles/prototypes.css` 名不副实"两条。前者不成立——结构页的 `hreflang` 由 Sitemap 提供，已确认完整、双向、含自身，Google 明确 HTML／HTTP 头／Sitemap 三种方式等价，同时维护多套没有收益反而更容易漂移；已在 `tests/public-contracts.test.mjs` 加了对应回归测试，`BaseLayout.astro` 未动。后者已被视觉提交 `144327a` 用 `public.css` / `public-home.css` / `public-reading.css` 替换。

## 十三、工作树状态

| 项 | 值 |
| --- | --- |
| 是否产生提交 | 否 |
| 是否推送 | 否 |
| 是否部署 | 否 |
| 工作树是否干净 | 否——保留 6 个已修改文件与 6 个新增文件（含本文件），等待 Morii 审阅 |

```text
 M astro.config.mjs
 M docs/enouia-todo.md
 M package.json
 M scripts/audit-public-tree.mjs
 M src/components/ReaderEnhancements.astro
 M src/markdown/rehype-moriium-content.mjs
?? docs/handoff-claude-public-v1-nonvisual-results.md
?? docs/handoff-codex-public-v1-nonvisual-followups.md
?? tests/privacy-audit.test.mjs
?? tests/public-contracts.test.mjs
?? tests/reader-fallbacks.test.mjs
?? tests/reader-loading.test.mjs
```

本轮临时产生的合成内容文件与合成危险样本均已删除，`git status` 中不含任何残留。本地静态服务脚本写在会话临时目录，不在仓库内。

## 十四、结论

### 逐个工作包的实际状态

| 工作包 | 状态 | 说明 |
| --- | --- | --- |
| A　公开路由与索引边界 | **通过** | 两个红旗已修并有回归测试；路由矩阵逐项通过。 |
| B　按需加载与公开分包 | **通过** | eager 可达性有测试，四项预算全部满足且未抬高。 |
| C　无 JavaScript 回退与第三方同意 | **部分通过** | 十项能力中九项通过（含三处本轮修复）；**剧透未通过**，见第十二节第 1 条，已记为 `todo` 用例。第三方与 CSP 部分通过。 |
| D　三语公开元数据 | **部分通过** | canonical、`hreflang`、RSS、搜索、结构页 Sitemap alternate 全部通过；**译名不同的分类与标签页没有 alternate**，见第十二节第 3 条。 |
| E　隐私与生成物审计 | **通过** | 全历史路径与内容都已覆盖，命中 0，且有证明它会失败的红绿测试。 |

所以准确的说法是：**A、B、E 通过；C 与 D 各留一处 follow-up。** 不能写成"工作包 A 至 E 全部完成"。

### 本轮修复的缺陷

两个 Sitemap 红旗；一个会静默丢失翻译关系的 Sitemap alternate 实现；三项无脚本回退缺口（远程视频、远程音乐、本地音乐）；一个使生产环境全部内联脚本失效的 CSP 不一致。

### 按 Morii 复核追加的修正

第一轮复核：隐私审计的历史扫描从"两个固定字符串"补成"全部内容规则"；剧透回退从"通过"改回未通过；结构页 `hreflang` 的判断被推翻并补了回归测试；`audit` 脚本改名，构建改用 `astro build --force`。

第二轮复核：`verify` 顺序改为先构建再跑测试，否则 CI 干净检出没有 `dist/` 可读；视频同意控件不再伪装成按钮（`role="button"` 承诺了空格键，而锚点做不到），保持链接语义并补了回归测试；历史路径枚举不再依赖 `--diff-filter=A`，改为遍历所有可达提交的完整快照并与 `rev-list --objects` 求并集，补上纯重命名与同一 blob 多路径两种失败测试；`cat-file` 子进程非零退出、对象缺失或返回不全时一律让审计失败。

### 仍未验收

视觉（五档宽度、焦点、对比度、排版、移动端溢出、减弱动画、灯箱手感、暗色外观、加密解锁界面三语视觉）、VPS 实机、Nginx 实机、TLS、fail2ban、异地备份、RTO 与正式域名。
