# 交接：公开站 V1 非视觉验收

> 日期：2026 年 9 月 1 日
>
> 交给：Claude
>
> 目标：在公开站视觉重做暂停期间，完成不依赖最终视觉方案的 V1 本地验收
>
> 停止点：非视觉合同、回归测试和验收记录完成后停下；不进入视觉修复，不提交、不推送、不部署

## 给 Claude 的启动提示

先完整阅读仓库根目录的 `AGENTS.md`，再读本文、`docs/enouia-todo.md` 第 07 至 14 节、`docs/markdown-reference.md`、`docs/encrypted-posts.md` 和 `docs/deployment.md` 中的 CSP、静态站与隐私部分。

本轮是此前所说的“第三优先”。只验收公开站的非视觉合同：路由与索引边界、按需加载、无 JavaScript 回退、第三方连接与 CSP、三语公开元数据，以及构建产物和 Git 历史中的隐私边界。

当前另有一棵 `codex/frontend-design-rebuild` 工作树，里面保留着未提交的公开站重做。不要在那棵工作树里切分支、还原、清理或运行会覆盖生成目录的命令。开始前重新检查 Git 状态，从当时同步后的 `main` 建立独立 worktree。2026 年 9 月 1 日检查到的 `main` 是 `179c709`，这个提交号只用于发现起点漂移，不能代替开工时的重新确认。

第二优先的 Phase 6A 本地收尾已经进入 `main`。本轮不要重新实现 Admin、文章运行时、运维面板或发布状态机，也不要重复它们的浏览器验收。

没有 Morii 当轮的明确授权，不提交、不推送、不部署。

## 一、范围与所有权

### 本轮要完成的内容

1. 验证正式公开路由、搜索、RSS 和 Sitemap 只暴露应当公开的内容；
2. 验证普通页面不会提前加载高级阅读模块或 Admin 代码；
3. 验证图片、GitHub、视频、音乐、剧透、复制限制和加密文章在无 JavaScript 时仍有诚实的回退；
4. 验证视频、音乐等第三方服务只在读者主动操作后连接，并与 Nginx CSP 保持一致；
5. 验证三语 canonical、`hreflang`、RSS、Sitemap、搜索索引和真实翻译关系；
6. 扩大隐私检查，但只报告文件路径、对象标识和命中数量，不回显秘密或受保护正文；
7. 给每一项留下可复跑的测试或脚本，并写一份结果记录。

### 暂时不做的内容

以下事项依赖最终视觉实现，继续留给第一优先：

- 375、390、768、1024、1440 五档宽度；
- 最终焦点样式、对比度、排版、移动端溢出和减弱动画；
- 灯箱的缩放手感、动画和返回焦点体验；
- Mermaid、代码块与数学公式的暗色外观；
- 加密文章解锁界面的最终三语视觉；
- 任何页面布局、导航结构或视觉方向调整。

本轮也不处理 Pages CMS 写作流程，不迁移正式文章，不读取 `.private/posts/`，不接触原始照片，不增加公开 SSR，不增加读者账户、分析或第三方服务。

### 文件边界

优先新增专门的非视觉测试或检查脚本，不要把断言继续塞进已有的视觉测试。允许在证明确有缺陷后修改：

- `astro.config.mjs`；
- `src/components/ReaderEnhancements.astro`；
- `src/markdown/rehype-moriium-content.mjs`；
- `src/markdown/remark-moriium-directives.mjs`；
- `src/pages/robots.txt.ts`；
- `scripts/audit-public-tree.mjs`、`scripts/check-render-split.mjs` 及本轮新增的检查脚本；
- `deploy/nginx/moriium.conf`，但仅限 CSP 与已验证的公开静态合同；
- 与实际行为直接对应的英文说明文档，以及本轮中文交接/验收记录。

以下文件由暂停中的视觉工作拥有，本轮不得修改：

- `src/layouts/BaseLayout.astro`；
- `src/layouts/ArticleLayout.astro`；
- `src/pages/[lang]/` 下的公开页面；
- `src/styles/`；
- `docs/design-research.md`、`docs/design-system.md`；
- `tests/about.test.mjs`、`tests/archive.test.mjs`、`tests/article.test.mjs`、`tests/categories.test.mjs`、`tests/design-fonts.test.mjs`、`tests/tags.test.mjs`。

如果验收证明缺陷只能在上述文件中修复，先写下最小复现、影响路由和建议改法，然后停在该项，不要跨过所有权边界。

不要修改 `package.json`、`pnpm-lock.yaml` 或全局测试配置。现有 Node 测试、构建产物检查和浏览器控制足够完成本轮；若确实需要新增依赖，先向 Morii 单独说明原因、体积和维护成本。

## 二、工作包 A：公开路由与索引边界

### 先确认两个已有红旗

开工后的第一次干净构建，要先检查下面两件事，不要直接沿用旧 `dist`：

1. 2026 年 9 月 1 日现存的构建产物中，Sitemap 包含 `/admin/`；作者后台不属于读者索引，正式 Sitemap 不应列出它。
2. 同一份 Sitemap 还包含 `/zh/posts/reader-capabilities/`。这篇文章标记为 `unlisted: true`，可通过直达链接验收，但不应进入 Sitemap、RSS、搜索或普通文章列表。

先让回归测试在当前行为上失败，再做最小修复。不要用硬编码单篇 slug 的方式排除 `unlisted` 内容；规则必须随着内容元数据生效。

### 正式公开矩阵

构建后至少检查这些代表性路由：

| 类别 | 代表性路径 | 必须静态生成 | Sitemap | 搜索/RSS |
| --- | --- | --- | --- | --- |
| 三语首页 | `/zh/`、`/ja/`、`/en/` | 是 | 是 | 不适用 |
| 列表页 | writing、archive、categories、tags、about | 是 | 是 | 不适用 |
| 已列出文章 | 三语 `moriium-reconstruction` | 是 | 是 | 对应语言可见 |
| 未列出文章 | `reader-capabilities` | 是，可直达 | 否 | 否 |
| 搜索索引 | `/search/zh.json`、`ja.json`、`en.json` | 是 | 否 | 只含对应语言的已列出文章 |
| RSS | `/zh/rss.xml`、`/ja/rss.xml`、`/en/rss.xml` | 是 | 可由站点约定决定 | 只含对应语言的已列出文章 |
| 作者后台/API | `/admin/`、`/api/*` | 否，保持 on-demand | 否 | 否 |
| 设计研究 | `/design/*` | 允许保留研究构建 | 否 | 否 |

测试还要证明：

- `/design/*` 的每一份 HTML 都有 `noindex,nofollow`；
- 正式公开页面没有指向 `/design/` 的入口；
- `robots.txt`、Sitemap、RSS 和搜索索引之间没有互相矛盾；
- Sitemap 不包含 `/admin/`、`/api/`、`/design/`、draft 或 `unlisted` 内容；
- 设计研究仍可留在源代码中，本轮不删除、不搬迁，也不把“无法被导航发现”写成访问控制。

优先把这些断言放进新的输出合同测试，例如 `tests/public-contracts.test.mjs`。断言应读取实际构建产物，不要只匹配 `astro.config.mjs` 中看起来正确的字符串。

## 三、工作包 B：按需加载与公开分包

### 现有证据怎么使用

`tests/search.test.mjs`、`tests/public-baseline.test.mjs`、`tests/render-split.test.mjs`、`scripts/measure-baseline.mjs` 和 `scripts/check-render-split.mjs` 已经覆盖了一部分合同。先读清现有断言，缺什么补什么，不要另造一套重量统计，也不要把动态 chunk 仅仅“存在于 `_astro/`”误判成普通页面已经加载。

### 必测页面

至少比较：

- 三语首页；
- 一篇普通文章；
- `reader-capabilities` 能力验收文章；
- 搜索对话框尚未打开的任意普通页面；
- 一篇公开的加密文章；若当前只有 draft fixture，就只验证生成逻辑和隐私合同，不把 draft 公开出来。

### 必须成立的行为

1. 普通页面的初始 HTML 与 eager 可达资源不包含 PhotoSwipe、Mermaid、远程音乐、视频 iframe、解密器、Vue、Tiptap 或 ProseMirror。
2. 有图片、Mermaid、数学、视频、音乐或复制限制时，只启用该文章实际需要的模块；能力文章不是普通页面的重量基线。
3. 搜索按钮可以全站存在，但搜索模块和三语 JSON 索引只能在读者打开搜索后加载。
4. 加密逻辑只出现在受保护文章，不进入普通文章或列表页。
5. Admin 的 Vue/Tiptap/数据库代码不得从任何公开 HTML、CSS 或 JS 入口可达。
6. 普通页面 eager JavaScript、能力文章 eager JavaScript、CSS 与搜索索引继续遵守现有预算。若预算需要调整，先报告原因，不在本轮静默抬高。

检查资源可达性时，从 HTML 的 `src`/`href` 和 JS/CSS 导入继续追踪；不要依赖会变化的哈希文件名。对搜索和高级模块，最好再用本地浏览器网络记录验证一次，但不得为此增加 Playwright 等新依赖。

## 四、工作包 C：无 JavaScript 回退与第三方同意

### 验收方式

先检查构建后的 HTML，再用禁用 JavaScript 的浏览器打开能力文章。浏览器测试只访问本地静态服务。第三方请求应使用请求拦截、离线模式或只读网络记录验证目标地址；本轮不需要真正播放外部视频或音乐，也不要依赖第三方服务当时是否在线。

### 逐项合同

| 能力 | 无 JavaScript 时 | 启用 JavaScript 后 |
| --- | --- | --- |
| 普通图片 | 图片可见，原图链接可直接打开 | 读者点击后才加载灯箱模块 |
| GitHub 卡片 | 始终是普通 `https://github.com/<owner>/<repo>` 链接；缓存缺失也不能变成空卡 | 不需要运行时 GitHub API |
| 提示块 | 标题和正文保持普通语义内容 | 不依赖脚本成立 |
| 剧透 | 内容仍在文档中，并有可理解的无脚本状态 | Enter、Space 和点击可切换 |
| 远程视频 | 至少保留标题和可主动打开的提供商链接，不生成 iframe | 只有点击同意按钮后创建 allowlist iframe |
| 本地视频 | 原生 controls，`preload="none"` | 不额外连接第三方 |
| 远程音乐 | 标题与作者始终可读；无脚本时明确说明需要主动加载，不能伪装成可播放 | 只有点击后访问 allowlist 接口或音频地址 |
| 本地音乐 | 保留原生音频回退，`preload="none"` | 播放控制不提前下载媒体 |
| 复制限制 | 没有 JavaScript 时允许正常复制 | 仅限制正文，代码、输入框和明确允许复制的区域不受影响 |
| 加密文章 | 只显示公开元数据、加密说明和无法无脚本解锁的诚实提示 | 正确口令解锁；错误或损坏密文不泄漏内容 |

现有远程视频和音乐输出可能只有按钮与文字，没有完整的无脚本行动路径。必须用新构建确认；若失败，优先在 Markdown 转换层补语义回退，不要进入 CSS 或页面重做。

### 外部连接与 CSP

必须验证初始加载没有向视频、音乐或 GitHub 发出运行时请求。读者主动操作后，只允许当前合同中的来源：

- iframe：`https://www.youtube-nocookie.com`、`https://player.bilibili.com`；
- 音乐接口：`https://meting.spr-aachen.com`；
- 本地及经过验证的 HTTPS 媒体地址，遵守现有 `media-src` 规则；
- GitHub 数据继续在构建期读取缓存，读者浏览器不连接 GitHub API。

对照 `src/markdown/rehype-moriium-content.mjs`、`src/components/ReaderEnhancements.astro` 与 `deploy/nginx/moriium.conf`。三处必须一致，不能靠 `https:` 通配新增 iframe 或 `connect-src` 服务。若增加任何新来源，停止并请 Morii 决定，不能在验收中顺手扩白名单。

## 五、工作包 D：三语公开元数据

### 页面头部

从实际 HTML 验证：

1. `<html lang>` 与当前语言一致；
2. canonical 是当前页面的绝对正式 URL，不指向 `/design/`、本地地址或其他语言；
3. 已存在的翻译只按真实 `translationKey` 关系生成 `hreflang`；
4. 缺失翻译显示为不可用，不生成链接，也不复制别的语言正文；
5. `hreflang` 使用项目既有的 `zh-CN`、`ja-JP`、`en-US`，本轮不自行引入 `x-default` 新合同；
6. 一组中每个真实翻译互相指向，未翻译的能力文章不会凭路径相似获得虚构 alternate。

若这里发现只能修改 `BaseLayout.astro` 或 `ArticleLayout.astro` 的问题，按第一节的所有权规则记录后停下，不要直接改。

### 搜索、RSS 与 Sitemap

- 三语搜索索引只含相同语言、已公开且允许列出的文章；
- RSS 的语言声明、标题、条目和链接属于当前语言；
- draft、`unlisted` 和受保护正文不得进入搜索或 RSS；
- Sitemap 的 alternate 不能把相同路径形状误当成翻译关系；文章翻译以 `translationKey` 为准；
- Sitemap 中的 URL 使用正式域名、尾斜杠合同一致，并且没有重复或失效地址；
- 不新增占位翻译或专门为了测试而公开的内容文件。

优先让测试从现有内容集合和实际构建结果推导期望关系。不要把当前三篇文章的 slug 写死成唯一正确形状，否则以后翻译使用不同 slug 时测试会给出假通过。

## 六、工作包 E：隐私与生成物审计

### 现有脚本的边界

`scripts/audit-public-tree.mjs` 已检查当前 Git 索引、公开内容和构建产物中的一部分已知风险，但它不能自动等同于“整个 Git 历史与所有生成物都安全”。本轮补齐缺口时，要让脚本在合成危险样本上确实失败，再相信绿色结果。

### 检查范围

至少覆盖：

- 当前被 Git 跟踪的文件；
- `dist/client` 及服务器构建中可能被错误打包的资源；
- 搜索 JSON、RSS、Sitemap、公开内容集合和受保护密文 envelope；
- 本轮生成的日志、截图、测试报告和临时目录；
- Git 历史中的已知私密路径、退役受保护文章标识和内容 frontmatter 风险。

检查目标包括：

- `.private/posts/` 路径或其中的正文；
- plaintext protected posts、口令、session、CSRF token、数据库内容与认证头；
- `password:` frontmatter；
- 精确 GPS/EXIF 定位字段；
- `.db`、`.db-wal`、`.db-shm`、会话文件、备份和原始照片；
- Admin 的 Vue/Tiptap/ProseMirror/`node:sqlite` 进入读者可达资源；
- `/design/`、`/admin/` 或 draft/`unlisted` 内容进入正式索引。

敏感扫描只能输出路径、Git 对象/提交标识和命中数量，不能把匹配行、口令、token、坐标或正文打印到终端和 Markdown。若发现真实敏感内容，立即停止并只告诉 Morii 位置与影响范围；不要自行删除文件、重写 Git 历史或把内容复制进 fixture。

不为本轮引入新的云端 secret scanner。优先扩展现有本地脚本，或用 Git 的只读命令做针对性历史检查。

## 七、验证顺序

先跑已有的相关专项，了解当前证据，不要一开始就重复全套门禁：

```text
node --test --test-isolation=none tests/search.test.mjs tests/render-split.test.mjs tests/public-baseline.test.mjs tests/crypto.test.mjs tests/render-markdown.test.mjs
```

随后完成干净构建，再运行本轮新增的输出合同、回退与隐私测试。文件名由实现决定，但交还时必须列出，例如：

```text
pnpm build
node --test --test-isolation=none tests/public-contracts.test.mjs tests/reader-fallbacks.test.mjs
pnpm links
pnpm audit
pnpm split
pnpm baseline
```

浏览器验收只需要覆盖本轮的网络时序和无 JavaScript 语义，不重复第一优先的视觉、键盘与五档宽度检查。记录浏览器版本、访问地址、是否禁用 JavaScript、初始第三方请求数，以及主动操作后的目标 origin。截图不得包含本机私密路径、浏览器凭据或请求头。

各工作包稳定后，只运行一次组合门禁：

```text
pnpm check
pnpm test
pnpm build
pnpm links
pnpm audit
pnpm split
pnpm baseline
```

若 `pnpm test` 在 Windows 沙箱出现 `spawn EPERM`，先区分环境未执行与断言失败。`--test-isolation=none` 可用于诊断，但不能把未运行的正式门禁写成通过。

## 八、完成标准与交还格式

完成后新增一份中文结果记录，建议命名为 `docs/handoff-claude-public-v1-nonvisual-results.md`。不要重写公开站设计文档。只有实际证据齐全后，才更新 `docs/enouia-todo.md` 对应条目；视觉敏感条目继续保持未完成。

交还 Morii 时按下面顺序写：

1. 起始分支、起始提交和独立 worktree 路径；
2. 修改文件及每个文件的理由；
3. 两个 Sitemap 红旗的复现结果与最终处理；
4. 正式路由矩阵逐项结果；
5. 普通页、能力文章、搜索和加密文章的资源加载结果；
6. 无 JavaScript 回退逐项结果；
7. 初始第三方请求数、主动操作后的 origin 与 CSP 对照；
8. canonical、`hreflang`、RSS、Sitemap 和搜索的三语结果；
9. 隐私审计范围、命中数和退出码，不附敏感匹配内容；
10. 实际命令、通过数、失败数、skip 数和退出码；
11. 哪些项目因视觉文件所有权而留给第一优先；
12. 工作树是否干净、是否产生提交、是否推送。

完成不等于“公开站已经全部验收”。准确结论应是：非视觉合同已经取得本地证据；视觉、VPS、Nginx 实机、TLS、fail2ban、异地备份、RTO 和正式域名仍未验收。
