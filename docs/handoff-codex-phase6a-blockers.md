# 交接：Phase 6A 本地收尾发现的问题清单

> 日期：2026 年 9 月 1 日
>
> 交出方：Claude
>
> 交给：Codex
>
> 目的：把 2026-09-01 本地收尾查出来的问题整理成可以直接接手的清单
>
> 当前结论（2026-09-01 二次更新）：**第 1 节的阻塞项已按 Morii 选定的方案 A 修复，并连带查出并修掉另外两个同类缺陷。浏览器场景 4–8 已在构建产物上跑通，多语上线也拿到了端到端证据。**剩下的都是等 VPS 的项目。

> **本文第 1、2、3 节记录的是已经解决的问题，保留为经过。当前状态看第 -1 节。**

## -1. 2026-09-01 第二轮：三个缺陷已修

Morii 选定方案 A（提取纯净的共享 Markdown 管线模块），明确不采用 `.npmrc`／hoist／`nodeLinker`／`ssr.external`。执行记录见 ADR 第 21.26、21.27、21.28 节。

修掉的三个缺陷，**全部是同一个形状**——生产请求处理器依赖只有构建树才有的东西：

| # | 缺陷 | 后果 | 修法 |
| --- | --- | --- | --- |
| 1 | `public-renderer.mjs` import `astro.config.mjs` | Vite／Rolldown／css-tree 被内联进 `dist/server/chunks/`，`/api/articles/*` 全线空 body 500 | 新增 `src/markdown/pipeline.mjs`，配置与 renderer 各自引用它 |
| 2 | `open.ts` 用 `import.meta.dirname` 读 `schema.sql` | 产物不含 `.sql`，**全新 VPS 第一次启动就建不了库** | schema 改为 `src/server/db/schema.ts` 导出的字符串，`schema.sql` 删除 |
| 3 | `ArticleEditor.ts` 把整个 `Version` 展开进表单 | 五个元数据字段进了 `.strict()` schema，**每次保存与自动保存都 400** | 新增 `toFields(version)` 显式列出十三个字段 |

第 2 和第 3 是修完第 1 之后才露出来的——单靠修第一个不会显形。第 3 个尤其值得记：TypeScript 看不见它（多余属性检查不作用于展开），既有测试也看不见它（用手写的干净载荷调 API，从没把客户端真正会发的载荷送进真正的 schema）。

新增 `tests/admin-built-artifact.test.mjs`：构建后用一次性目录启动 `dist/server/entry.mjs`，真实 HTTP 断言匿名 `/api/articles/` 得到**非空 JSON 401**、fixture 作者登录后得到 200 JSON，外加对三条边界本身的静态检查。反向验证过：把 `astro.config.mjs` 的 import 加回去，8 条里 5 条当场变红。

浏览器场景 4–8 已在产物上逐条通过；多语上线用一对无媒体的中日文章（共用 `translationKey`，`tide-notes` 夹具未动、SVG 未导入、媒体白名单未放宽）拿到端到端证据，`/zh/posts/parallel-notes/` 里含指向 `/ja/posts/parallel-notes/` 的互链。`.gitignore` 三条已加。

**仍然只能等 VPS：**换站原子性（Windows symlink 与 rename 覆盖 junction 都是 EPERM，且无 WSL）、异地副本与服务健康的真实读数、systemd／Nginx／TLS／fail2ban、异地传输与计时恢复。

执行记录见 [`adr-0002-phase5-production.md`](adr-0002-phase5-production.md) 第 21.23、21.24、21.25 节。本文不重复那三节的内容，只列**还没解决的问题**和接手需要的事实。

## 0. 开工边界（先读这一段）

**`codex/frontend-design-rebuild` 正在进行公开站重做，不要碰。**那棵工作树在 `E:\Moriium`，改动涉及 `src/layouts/`、`src/pages/[lang]/` 下的公开路由、`src/styles/` 下的公开样式，以及 `tests/` 里 `about`、`archive`、`article`、`categories`、`design-fonts`、`tags` 六个测试。本文所有工作都不需要动这些文件。

本轮的后端改动在 `claude/phase6a-local-closeout`，独立 worktree `E:\moriium-phase6a`，自 `main` 的 `b607ea4` 建立，**未提交、未推送**。改了 9 个文件：

```text
src/server/status.ts          四态合同主体
src/admin/api.ts              客户端类型
src/admin/App.ts              四态文案、每行读数时间、请求序号、面板与列表解耦
src/admin/style.css           四种 verdict 的样式
tests/admin-status.test.mjs   27 条用例
docs/adr-0002-phase5-production.md      新增 21.23 / 21.24 / 21.25
docs/vps-acceptance-checklist.md        E 节状态更新
docs/enouia-todo.md                     Phase 6A 状态更新
docs/handoff-claude-phase6-production.md 第 0 节与后续小节更新
```

`astro.config.mjs` 经 `git diff --exit-code` 确认未改动。

## 1. 阻塞项：构建产物里 Admin 的文章路由无法加载

### 现象

`node dist/server/entry.mjs` 起来之后，`/api/articles/*` 全部返回**空 body 的 500**，路由模块根本没加载成功。这是 `deploy/systemd/*.service` 里实际启动的东西：

```text
ExecStart=/usr/bin/env HOST=127.0.0.1 PORT=4321 /usr/bin/node /var/www/moriium/workspace/dist/server/entry.mjs
```

作者登录后看到的是「还没有文章。可以先建一篇测试文章。」，顶上一条「Request failed with 500.」。**一次失败被画成了一个空的、看起来健康的状态**——和验收清单 E 节要防的是同一件事。错误文案也退化了，因为空 body 让 21.14 那套上下文文案没有东西可用。

### 受影响范围

| 路由 | 结果 |
| --- | --- |
| `/api/articles/`、`/api/articles/:id/`、`/api/articles/:id/preview/` 等全部文章路由 | 500，空 body |
| `/api/session/`、`/api/login/`、`/api/logout/`、`/api/media/`、`/api/status/` | 正常（匿名 401，登录后可用） |

也就是说：登录、会话、媒体、运维面板都正常，**文章列表、单篇、新建、保存、自动保存、可信预览、发布、回滚、撤下在生产形态下全部不可用**。

### 链条

```text
src/pages/api/articles/*  →  src/server/http/article-handlers.ts
                          →  src/server/rendering/public-renderer.mjs
                          →  astro.config.mjs（以及直接 import 的 rehype-expressive-code）
```

第 7 节让可信 renderer 直接 import 生产 `astro.config.mjs`，为的是预览不会和生产漂移，这个意图本身没问题。代价是构建把这份配置连同它整个 import 图内联进了 `dist/server/chunks/`。被内联的包里有三个会按**自己的文件位置**去找资源，换了目录就全错：

| 包 | 报错 | 原因 |
| --- | --- | --- |
| `rolldown` | `Cannot find native binding` | 从 `dist/server/chunks/` 解析不到 `@rolldown/binding-win32-x64-msvc` 或 `@rolldown/binding-wasm32-wasi` |
| `vite` | `cannot test case insensitive FS, CLIENT_ENTRY does not point to an existing file` | `CLIENT_ENTRY = resolve(VITE_PACKAGE_DIR, "dist/client/client.mjs")`，而 `VITE_PACKAGE_DIR` 由内联文件自己的位置算出，指向了 workspace 根 |
| `css-tree` | `Cannot find module '../data/patch.json'` | `lib/data-patch.js` 里的 `createRequire(import.meta.url)("../data/patch.json")`，内联后相对路径指向别处 |

三个是同一类错误的三个实例，不是三个巧合。

### 复现

```bash
pnpm build
MORIIUM_DATABASE_PATH=<一次性库> MORIIUM_SESSION_DIRECTORY=<一次性目录> node dist/server/entry.mjs
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4321/api/articles/
```

期望 401，实际 500，服务端日志里是上表第一条。环境：Node 24.15.0、pnpm 11.22.0。

### 试过但不采纳的修法

在 `astro.config.mjs` 的 `vite` 里加：

```js
ssr: { external: ['rehype-expressive-code', 'astro-expressive-code', 'css-tree', 'vite', 'rolldown'] },
```

构建通过，`rolldown` 和 `vite` 两个错误消失，然后撞上 pnpm 的严格隔离：

```text
ERR_MODULE_NOT_FOUND: Cannot find package 'css-tree'
  imported from .../dist/server/chunks/article-handlers_*.mjs
```

`css-tree` 是传递依赖，不在顶层 `node_modules` 里。**这个实验已经完全回滚，仓库未改。**

### 两条可能的路，都要 Morii 先拍板

- **A：把 markdown 插件链从 `astro.config.mjs` 拆成独立模块**，让 `public-renderer.mjs` 只 import 那个模块，不再 import 整份配置。更贴近第 7 节「预览不能和生产漂移」的原意。**没有验证过它能修好**——配置里那个在模块作用域构造的 live `unified()` 处理器可能才是配置被内联的根因，拆完还要再试一次。
- **B：调 Astro 的 SSR 打包配置 + pnpm 的提升策略**（`.npmrc` 的 `public-hoist-pattern` 或 `node-linker`），让这些包在运行时保持真实的 `node_modules` 解析。改动面更小，但要动 `.npmrc`，会影响所有人的安装布局。

**已验证的是缺陷本身、链条和复现路径；没有验证过任何一条修法能走完全程。**不要把上面任何一条当成结论抄进代码。

### 修好之后要做什么

重跑 ADR 21.24 那 12 个浏览器场景里被挡住的 5 条：新建文章（slug／语言／`translationKey`）、编辑与自动保存只追加版本、可信预览、发布显示「已发布、等待上线」、回滚与撤下与审计。

## 2. 白名单 fixture 带媒体引用，多语上线无法端到端验

发布彩排第一次运行时导出直接拒绝：

```text
Published content references /media/fixtures/tide-cover.svg, which is not in the media library.
```

这是 21.9 那两道拒绝在正常工作，不是缺陷。但它带出一个事实——白名单 5 篇里有 3 篇带媒体引用：

| fixture | 媒体引用 |
| --- | --- |
| `prototypes/fixtures/posts/zh/zh-tide-notes.md` | 封面 `/media/fixtures/tide-cover.svg` + 正文 `/media/fixtures/tide-flats.svg` |
| `prototypes/fixtures/posts/ja/ja-tide-notes.md` | 同上 |
| `src/content/posts/zh/reader-capabilities.md` | 正文 `/fixtures/reader-image.svg` |
| `prototypes/fixtures/posts/zh/zh-darkroom-log.md` | 无 |
| `prototypes/fixtures/posts/zh/zh-winter-drafts.md` | 无 |

**中日双语那一对恰好是带媒体的那一对**，所以「多语文章端到端上线」这件事目前**只靠白名单验不到**。彩排改用了 `zh/darkroom-log`。

要 Morii 决定：先把这两张 SVG 走媒体入库链路，还是调整白名单。在此之前不要把「多语上线已验证」写进任何文档。

## 3. `.gitignore` 三条仍然待决

`src/content/posts/exported/`、`public/media/`、`src/generated/`。21.10 就挂着了，本轮用一次性 workspace 绕开，**没有顺手替 Morii 决定**。在决定之前，不要把仓库工作副本当作 release 的 workspace。

## 4. 两处文案瑕疵（不阻塞）

- 会话过期时面板显示的是服务端英文原文 `Authentication required.`，不是中文上下文文案。`messageForApiFailure` 对 `ApiError` 直接返回 `error.message`。
- 会话在服务端消失后，顶栏仍然显示「某某 已登录」，要到下一次请求才发现。

两条都在 `src/admin/`，改动面很小，但本轮没动——它们不在交接的三个工作包范围内。

## 5. 本机无解，不要再想办法的

以下几项本轮实测确认**在这台机器上无法取得证据**，留给影子 VPS：

| 事项 | 实测结论 |
| --- | --- |
| 换站的原子性 | `symlinkSync` 直接 EPERM；改用 junction 能建，但 `renameSync` 覆盖 junction 仍然 EPERM。21.10 那条 Windows skip 继续保留 |
| Linux 本地补验 | `wsl --list` 确认没有安装任何发行版，本轮没有为此去装 |
| 异地副本、服务健康的真实读数 | 本机没有采集器，面板始终显示「未观测」。**不要为了让面板变绿去造一个「正常」** |
| E3 对真实停摆采集器 | 只对着注入的过期读数验过 |
| systemd / Nginx / TLS / fail2ban / `DEPLOY_ENABLED` / 异地传输 / 计时恢复 | 全部等 VPS |

另外两条 Windows 事实，接手时会撞上：

- Node 24 拒绝在无 shell 的情况下 `spawnSync` 一个 `.cmd`，所以生产 host 的 `shell: false` 在 Windows 上无法启动 `pnpm`。彩排用「`node` 启动 pnpm 自己的 CJS 入口」绕过，**没有把 `shell` 打开**，也没有改 `src/server/release/host.ts`。
- 判断路径是否落在受保护目录里，必须用 `path.relative` 做边界判断，不能用字符串前缀：本轮的一次性目录 `E:\moriium-phase6a-run` 恰好以 worktree 路径 `E:\moriium-phase6a` 为前缀，字符串前缀法会把它误判成仓库。

## 6. 当前的验证基线

`claude/phase6a-local-closeout` 上的最新状态：

```text
pnpm check                                            0 errors / 0 warnings / 0 hints，exit 0
node --test --test-isolation=none tests/*.test.mjs    192 tests / 191 pass / 0 fail / 1 skip，exit 0
pnpm build                                            exit 0
pnpm links                                            exit 0
node scripts/audit-public-tree.mjs                    exit 0
pnpm split                                            exit 0
pnpm baseline                                         exit 0
```

开工基线是 174 / 173 pass / 1 skip。那条 skip 是 21.10 记过的 Windows 符号链接换站，属于**环境未执行**，不是断言失败。`pnpm audit` 不是 `package.json` 里的脚本，实际命令是 `node scripts/audit-public-tree.mjs`。

接手后如果改了 `src/server/` 或 `src/admin/`，先跑最窄的那一个：

```text
node --test --test-isolation=none tests/admin-status.test.mjs
```

## 7. 接手顺序建议

1. 先跟 Morii 确认第 1 节的修法走 A 还是 B——这决定要不要动 `astro.config.mjs` 和 `.npmrc`；
2. 修完之后用第 1 节的复现步骤确认 `/api/articles/` 返回 401 而不是 500；
3. 补跑 ADR 21.24 被挡住的 5 个浏览器场景；
4. 第 2 节的 fixture 媒体，等 Morii 决定后再动；
5. 第 3、4 节可以独立进行，互不依赖。

## 8. 不要做的事

- 不要碰 `codex/frontend-design-rebuild` 的工作树和它改的那些文件；
- 不要读取 `.private/posts/`，不要接触真实作者口令、原图或正式内容；
- 不要把 fixture 草稿发布到任何真实环境；
- 不要用默认的 `.astro/admin.db` 或未来的生产目录做任何验证，所有运行态路径都要落在一次性目录里，并在执行前打印解析后的绝对路径；
- 不要把「测试文件存在」写成「测试通过」，也不要把本机结果写成 VPS 证据。
