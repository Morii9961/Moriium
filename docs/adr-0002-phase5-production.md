# ADR 0002：原型 B 的生产架构

> 日期：2026-08-30
> 状态：**已由 Morii 于 2026-08-30 批准。**批准的是形状与合同改动，不是内容迁移——迁移仍是 Phase 6A 的退出条件。
> 起草：Claude（Enouia 已退出，见 ADR 0001 第 1.1 节，本文同样是自审而非交叉审查）
> 前置：[`adr-0001-phase1-spike.md`](adr-0001-phase1-spike.md) — Phase 1 尖峰与 B 的验收清单；[`vnext-architecture-plan.md`](vnext-architecture-plan.md) — 路线背景

## 1. 授权状态

这份 ADR 请求批准的是一份清单，不是一句「上全栈」。逐条列出来，是为了让批准和拒绝都能落到具体的东西上：

| # | 请求批准的事 | 现状 |
| --- | --- | --- |
| 1 | 给公开站加 `@astrojs/node` adapter，`output` 仍为 `static` | 现在无 adapter |
| 2 | VPS 上常驻一个 Node 进程，只服务 `/admin` 与 `/api` | 现在 VPS 上无 Node |
| 3 | VPS 上常驻一个 SQLite 数据库文件 | 现在无数据库 |
| 4 | 构建从 CI 迁到 VPS（CI 仍然负责验证） | 现在 CI 构建、VPS 只解包 |
| 5 | 建立 Morii 与 Enouia 两个作者账户 | 现在无账户 |
| 6 | 改写 `AGENTS.md` 的五处条款（后台与数据库、VPS 运行时、adapter 与 UI 框架、质量门、Pages CMS） | 见第 16 节；**批准后已改完** |
| 7 | 改写 `docs/deployment.md` 的五处（目录布局、构建位置、发布序列、systemd、Nginx 与证书） | 见第 15 节；**留到 06A 实施时改**，那份文档描述的是实际怎么部署，提前改会让它描述一套还不存在的东西 |
| 8 | 新增 `admin.morii9961.top` 的 DNS 记录与 TLS 证书，并自建一个只用于客户端证书的私有 CA | 现在都没有 |

**批准这份 ADR 不等于批准迁移正式内容。**迁移是 Phase 6A 的退出条件，要另外验收。这份 ADR 批准的是「可以按这个形状去建影子系统」。

### 1.1 批准记录（2026-08-30）

Morii 批准以上八项，并同时定夺两件事，都缩小了范围：

**一、暂时不做告警。**第 12 节因此从「会通知你」降级为「可以查」，残余风险写在 12.2。

**二、不需要移动端的客户端证书。**Admin 只在导入了证书的桌面设备上使用，手机上写作不在范围内。第 10 节相应去掉了移动端导入那一条，第 18 节的对应未决项一并撤销。

这两条都是减法，不改变第 4 到 14 节的任何结构决定。

## 2. 背景：这份 ADR 要固定什么

Phase 1 结束时，B 的验收清单（ADR 0001 第 4 节）是这样的：五项通过、四项部分、两项不能过。两项不能过的是：

- **B2**：生产 frontmatter 有 14 个字段，尖峰的库里只有 5 个位置；
- **B7**：媒体闸门齐了，但没有任何导入路径。

这两项当时刻意没有就地补，理由写在 13.19：补出来的实现将来要连同数据库模型和媒体管线一起推翻。**这份 ADR 就是那个「一起」。**

除此之外，尖峰刻意没做而生产必须有的还有：可信 renderer 的生产形态、备份与恢复、监控、Admin 的暴露面、以及一套能真的退回去的回退方案。

这份 ADR 不重开 A/B 选择。B 已由 Morii 在 2026-08-30 实际操作后选定（ADR 0001 第 13.14 节）。

## 3. Morii 已经定下的四项

2026-08-30 定夺，连同各自的直接后果：

**一、只做作者账户，但建两个：Morii 和 Enouia。**读者保持匿名，注册、评论、收藏都不做。两个账户不带来权限分级（第 9 节），但带来三个必须改的地方：审计要记 actor、登录限速要按账户计数、口令要分别存储和轮换。

**二、发布后分钟级可见即可。**这一条的价值比它看起来大：公开路由因此可以全部留在预渲染，**读者路径完全不经过 Node 进程和数据库**。后台挂了、数据库锁了、构建失败了，读者照样读。秒级可见会把这份保障换掉。

**三、Admin 用客户端证书（mTLS）保护，不从主站公网入口访问。**主站 443 上不存在登录端点。Morii 先选了隧道，随后因为「每次要先连」而改成客户端证书：日常零操作，而陌生人同样到不了登录页。代价是每台设备要导入一次证书。见第 10 节。

**四、后端用 Astro 内置的 Actions、中间件与 Sessions，不拆独立 API 服务。**单作者站点没有拆服务的理由，运维项最少，尖峰里 `node:http` 那套边界可以直接映射过去。

## 4. 运行拓扑与渲染策略

### 4.1 形态

```text
                    公网 443 (Nginx)
                          │
              ┌───────────┴───────────┐
              │                       │
     try_files 命中静态文件      /admin, /api → 404
              │
              ▼
   /var/www/moriium/current/  (预渲染 HTML、CSS、JS、媒体)
   读者路径到此为止，不经过 Node


     admin.morii9961.top 443 (Nginx，server 级 mTLS)
                          │
              没有客户端证书 → TLS 握手就失败
                          │
                          ▼
                       /admin, /api
                          │
                          ▼
                          127.0.0.1:4321  Node (systemd)
                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
              /var/lib/moriium/admin.db    /var/lib/moriium/media/
```

`output` 保持 `'static'`，加 `@astrojs/node` adapter，只给 `/admin/*` 与 `/api/*` 写 `export const prerender = false`。这是官方推荐的 Hybrid 做法，不是绕路：

> Start with the default 'static' mode until you are sure that most or all of your pages will be rendered on demand!
> — <https://docs.astro.build/en/guides/on-demand-rendering/>

adapter 用 **standalone** 模式而不是 middleware 模式。middleware 模式要自己接一个 Express 或 Fastify 并自己处理静态文件服务，等于为了省一个进程多写一层；standalone 自带静态服务，Nginx 只做 TLS 与反代。（<https://docs.astro.build/en/guides/integrations-guide/node/>）

**主站的 server block 永远不反代。**它先找静态文件，找不到就 404。只有 Admin 那个独立主机名的 server block 会把请求交给 Node。所以「Node 挂了读者受影响吗」这个问题的答案是结构性的「不」，不是「一般不会」。

公网上 `/admin` 返回 404 而不是 403：403 等于告诉对方这里有东西。

### 4.2 发布是两步，而且第二步失败不影响第一步

这是整套设计里最值得说清楚的一处。

```text
第一步  作者点「发布」
        → 校验闸门（内容、翻译关系、媒体）
        → 事务内切换 published_version_id，写审计行
        → 立即完成，可回滚
        数据库此刻已经是真相

第二步  导出 + 构建 + 原子换 current
        → 分钟级
        → 失败不改动 current，站点保持上一版
        → 可重试，重试不需要作者再点一次
```

**数据库是真相，站点是它的投影。**投影失败不污染真相，这样「发布成功但站点没更新」是一个可以观测、可以重试的状态，而不是一个说不清楚是发布了还是没发布的状态。后台要显示这个差异：某篇文章的「已发布版本」与「已上线版本」不一致时，明确标出来并给一个重试按钮。

## 5. 逐路由策略

| 路由 | 渲染 | 理由 |
| --- | --- | --- |
| `/`、`/zh/`、`/ja/`、`/en/` 首页 | 预渲染 | 分钟级够用 |
| 文章详情 | 预渲染 | 同上；这是读者最该不依赖 Node 的一类 |
| 归档、分类、标签、关于 | 预渲染 | 同上 |
| RSS、Sitemap | 预渲染 | 抓取方不该打到 Node |
| 搜索索引与搜索模块 | 预渲染（构建时生成） | `AGENTS.md` 要求搜索保持构建期静态索引，这一条不变 |
| 加密文章页 | 预渲染 | 解密仍在浏览器里，服务端不持有明文与口令 |
| 404 | 预渲染 | — |
| `/admin/*` | **按需**（`prerender = false`） | 需要会话 |
| `/api/*`（Actions 端点） | **按需** | 同上 |

一条要写死的规则：**任何公开路由都不得因为「顺手」改成按需渲染。**要改必须回到这张表，说明它为什么值得把读者路径的故障域扩大一次。Phase 6B 存在的意义就是给这种改动准备证据，不要在实现里绕过它。

## 6. canonical content 与数据库

### 6.1 Markdown 继续是真源

不迁 Tiptap JSON。三条理由，都是实测出来的而不是偏好：

1. **11/11 保真完全依赖 `source-nodes.ts` 与 `image-node.ts`，不是 Tiptap 自身的能力。**未加扩展的 Beta 基线在夹具上丢 3 个块，图片是彻底的数据丢失（ADR 0001 第 13.10 节）。把真源换成一个靠自定义节点撑住的格式，等于把内容押在自己写的兼容层上。
2. **`@tiptap/markdown` 仍是 Beta。**升级 Tiptap 时必须重跑 `roundtrip:report`，这条已经在交接里；真源换过去之后，这个动作的失败后果从「编辑器坏了」变成「文章坏了」。
3. **Markdown 是回退方案的地基。**见第 14 节 L4：只要真源是 Markdown，最坏情况下可以把全部文章导回 `src/content/posts/` 并退回纯静态架构。换成 JSON 之后这条路要靠一个导出器，而导出器是需要被验证的新代码。

要迁移必须另立一份迁移 ADR，至少定义：写入冻结时刻、一次性 importer、schema version、逐篇语义与媒体摘要、新旧渲染对照、失败回滚点，以及禁止长期双写。这条继承自 `vnext-architecture-plan.md` 第 6 节，不因这份 ADR 而放松。

### 6.2 数据库引擎：继续 `node:sqlite`

ADR 0001 第 3.5 节把 `node:sqlite` 定为「尖峰工具而非生产选型」，并要求生产时重新评估。这是重新评估的结论：**留下**，但理由换了。

不再是「反正是尖峰」，而是：

- 在项目锁定的 Node 24 上，它是 **Stability 1.2 – Release candidate**，不是 experimental，也不需要命令行开关。`.nvmrc` 锁的是 `24`，实测运行版本 `v24.15.0`，而 `v24.15.0` 正是它转为 release candidate 的版本。（<https://nodejs.org/docs/latest-v24.x/api/sqlite.html>）
- 零依赖。`AGENTS.md` 要求「避免全局依赖churn，锁定精确版本并解释新增」，一个不需要新增依赖的数据库最省事。
- 它自带 `sqlite.backup()` 在线备份，第 11 节直接用它，不必为备份再引一个工具。

单作者站点、两个账户、每天几次写入，SQLite 的并发上限离得很远。真正要配的只有两条：`journal_mode = WAL`、`busy_timeout` 设一个非零值。尖峰里两条都没配，第 13.20 节的锁演练正是在没有 `busy_timeout` 的情况下跑出来的。

**换引擎的触发条件**要写下来，否则「以后再说」等于永远不说：出现多写入者、需要跨机器读写、或单表超过千万行时重新评估。这三条现在都不成立。

### 6.3 B2 的修复：frontmatter 完整进库

尖峰只存 5 个字段，生产要存全部 14 个。表结构方向：

```text
accounts        id, name, password_hash, created_at, disabled_at

articles        id, translation_key, lang, slug,
                published_version_id, live_version_id,
                created_at

versions        id, article_id, author_id, kind, created_at,
                -- frontmatter，与 src/content.config.ts 一一对应
                title, summary, published_at, updated_at,
                category, cover, cover_alt,
                draft, unlisted, copy_protection,
                -- 正文
                markdown, editor_json

version_tags    version_id, tag        -- tags 是数组，单独成表

media_assets    id, public_path, format, width, height,
                alt, caption, copyright, exif_json,
                sanitized_at, created_at

audit           id, at, actor_id, action, article_id,
                from_version_id, to_version_id, note
```

四个决定藏在这张表里，值得点出来：

1. **frontmatter 挂在 version 上，不挂在 article 上。**改标题、改分类、改标签都应该产生新版本并且可回滚。挂在 article 上的话，回滚正文不会回滚元数据。
2. **`tags` 单独成表而不是 JSON 列。**标签要能被查询和聚合（标签页、标签目录），JSON 列会逼出字符串匹配。
3. **`articles` 同时有 `published_version_id` 与 `live_version_id`。**前者是数据库里的真相，后者是当前 `current` 里那份站点实际包含的版本。第 4.2 节那个「发布了但还没上线」的状态就靠这两列的差值表达，不靠猜。
4. **`media_assets` 只存元数据，图片二进制不进库。**继承 `vnext-architecture-plan.md` 第 6 节。

### 6.4 schema 版本与迁移

一张 `schema_migrations` 表，迁移器只向前，不写回退迁移。回退靠备份恢复（第 14 节 L3），因为回退迁移本身是很少被执行、因而很少被验证的代码，指望它在事故当下第一次跑对是不现实的。

每个迁移必须有一条针对它的测试，按 ADR 0001 第 5 节的标准：先让它对旧数据失败一次，再让它通过。

## 7. 可信 renderer

**服务端是唯一的渲染入口。浏览器提交的 HTML 一律不接受。**

实现直接沿用 ADR 0001 第 13.17 节已经建成的那条路：`createPublicRenderer()` 从 `astro.config.mjs` 取生产自己的 remark/rehype 链，预览与最终站点走同一个处理器。那一节已经证明这条路可以被逐字节断言——四篇夹具的预览与 `fixtures/baseline/` 完全相等，而不带插件链的普通 processor 与基线不等。

生产要补的是把这条断言接进 CI：**渲染器一旦与生产管线分叉，构建就该红。**`baselines:verify` 已经是这个形状（拿真实文章与 `dist/` 的产物比对 14 个结构标记），把它从原型脚本升成正式检查即可。

第 13.17 节记下的那条限制继续有效并要写进后台界面：预览是**渲染同源，不是外观同源**——除非把站点样式表也接进预览，那是单独一块活。

## 8. 媒体：B7 的修复

### 8.1 上传链路只接收衍生图

原图不上服务器。这不是流程建议，是硬边界，继承自 `AGENTS.md`（「Original photos remain untouched」）与 `vnext-architecture-plan.md` 第 6 节。

但**服务端不信任客户端说「我已经净化过了」**。上传后仍然强制跑一次：

```text
接收 → 格式与尺寸校验 → 剥离 EXIF/XMP/IPTC → 复核剥离结果
     → 写入 /var/lib/moriium/media/ → 写 media_assets 行（sanitized_at 落时间）
```

复核那一步是关键：剥离之后再读一遍确认真的没有了，而不是相信剥离函数的返回值。生产已有的 `scripts/sanitize-media.mjs` 与 `scripts/check-media.mjs` 是同一套逻辑的两半，服务端复用它们，不另写一份。

`sanitized_at` 为空的资源不允许被引用发布，这条由第 6.3 节的闸门执行。

### 8.2 manifest 不再手写

尖峰的 `prototypes/fixtures/media/manifest.json` 是手写夹具。生产的 manifest 从 `media_assets` 生成，构建时导出。手写的那份留在原型里做测试输入，不进生产。

### 8.3 一处必须一起修掉的过度拦截

ADR 0001 第 13.15 节记了一条：图片引用是正则扫全文，围栏代码块里的示例图片会被当成真实引用，于是**一篇讲 Markdown 语法的文章会被闸门拒绝**。

方向是安全的一侧，但生产不能带着它上线——`docs/markdown-reference.md` 那类文章正是会被误伤的。生产实现改成从解析结果取图片引用（remark AST 里 `image` 节点，天然不包含代码块内容），不再正则扫原文。

## 9. 认证、会话与两个作者账户

### 9.1 两个账户，不分级

Morii 与 Enouia 对全部文章有相同的读写与发布权。**不做角色、不做每篇授权。**理由：两个可信作者的站点上，RBAC 增加的是配置错误的机会，不是安全。

区分靠审计不靠授权：`audit.actor_id` 记谁发布、谁回滚，`versions.author_id` 记谁写的。这样「谁改的」永远答得出来，而不需要为此限制任何人。

账户可以停用（`disabled_at`）而不是删除，否则历史版本的作者引用会断。

### 9.2 三处因为「两个账户」必须改的实现

1. **登录限速从全局计数改成按账户计数。**交接第 7 节第 3 条早就指出尖峰是单作者全局计数——两个账户时，一个人被锁会把另一个人一起锁死。改成按账户，另外保留一个全局阀门防枚举（总失败率超阈值时全体降速）。
2. **口令分别存储、分别轮换。**继续 scrypt 并记录 salt 与参数（ADR 0001 第 5 节）。
3. **若 Enouia 账户由 agent 操作**，它的口令应当是长随机串、存在部署密钥管理里、可单独轮换，不与 Morii 的口令共享任何东西。人记得住的口令和程序读取的口令有不同的失效方式，不要混。

### 9.3 会话

用 Astro Sessions。Node adapter 自带默认驱动，官方说明它「uses the local filesystem for session storage」（<https://docs.astro.build/en/guides/integrations-guide/node/>）。

**这里有一个会咬人的地方，必须在配置里显式解决**：会话默认落在应用目录，而现在的部署布局是 `releases/<sha>/` 不可变发布目录、只保留 6 份。会话文件落进去的结果是每次发布把作者踢下线，目录被清理时还会连带删掉。所以 `session.driver` 的路径必须显式指向 `/var/lib/moriium/sessions/`，与 release 目录彻底分开。第 15 节的目录布局就是为这件事改的。

cookie 用 Astro 的默认值即可：`{ name: "astro-session", sameSite: "lax", httpOnly: true, secure: true }`（<https://docs.astro.build/en/reference/configuration-reference/>）。生产有 TLS，`secure: true` 成立——**交接第 7 节第 1 条那个「本地 http 下没有 `Secure`」的已知差异到这里才真正被解决**，不是被绕过。

会话不进备份（第 11 节）：会话丢失的代价是重新登录，为它增加备份复杂度不划算。

### 9.4 CSRF：Astro 自带的那道盖不住 JSON

`security.checkOrigin` 默认为 `true`，做的是「检查 origin 头与请求 URL 是否匹配」。但它的适用范围是有限的：

> POST, PATCH, DELETE, and PUT requests with specific content-type headers (`'application/x-www-form-urlencoded'`, `'multipart/form-data'`, or `'text/plain'`), and only for on-demand rendered pages.
> — <https://docs.astro.build/en/reference/configuration-reference/>

**原型 B 的写请求全部是 `application/json`，正好落在这三种之外。**所以：

- `security.checkOrigin` 保留开启，它挡表单形态的跨站提交；
- 尖峰里那道**显式 CSRF token 继续作为主防线**，不能因为「Astro 自带 CSRF」删掉；
- Host 与 Origin 守卫一并保留。

这一条要在代码注释里写明来源，否则将来有人读到 Astro 文档说「默认有 CSRF 保护」，会顺手把 token 删掉。

## 10. Admin 的暴露面：客户端证书

### 10.1 为什么是证书，不是隧道也不是裸公网

Morii 先选了隧道，随后因为「每次写作前要先连」改成客户端证书。三个选项的实际差别：

| 方案 | 日常操作 | 换设备 | 陌生人能看到登录页吗 |
| --- | --- | --- | --- |
| 隧道 | 每次要连 | 装 app 并登录 | 看不到 |
| **客户端证书** | **无** | 导入一次证书 | **看不到** |
| 裸公网 | 无 | 无 | 能，而且会被无差别扫描命中 |

**裸公网被否掉的理由不是「有人会盯上 Moriium」。**攻击不是这么来的：扫描器无差别地扫地址空间，一个真实存在的 `/admin` 登录页会在很短时间内进入命中列表，与站点是谁、有没有名气无关。客户端证书在保住「日常零操作」的同时保住「陌生人到不了登录页」，这是它比另外两个都合适的原因。

**范围**：Morii 于 2026-08-30 决定不做移动端证书（第 1.1 节）。Admin 只在导入了证书的桌面设备上使用，手机上写作不在这份 ADR 的范围内。将来要加，只是多签一张证书，不改变这一节的任何结构。

### 10.2 形态：独立主机名 + server 级 mTLS

约束来自 Nginx 自己。`ssl_verify_client` 的上下文是：

```text
Context: http, server
```

—— <https://nginx.org/en/docs/http/ngx_http_ssl_module.html>

**它不能写在 `location` 里。**所以「同一个 server block，只给 `/admin` 要证书」这种写法不成立，Admin 必须有自己的 server block，也就必须有自己的主机名。

```nginx
# 主站。/admin 与 /api 在这里不存在，也永不反代。
server {
    listen 443 ssl;
    server_name morii9961.top;
    root /var/www/moriium/current;

    location ^~ /admin { return 404; }
    location ^~ /api   { return 404; }

    location / { try_files $uri $uri/ $uri/index.html =404; }
}

# 作者后台。没有客户端证书的连接在 TLS 握手阶段就被拒绝。
server {
    listen 443 ssl;
    server_name admin.morii9961.top;
    root /var/www/moriium/current;

    ssl_client_certificate /etc/nginx/moriium-client-ca.pem;
    ssl_crl                /etc/nginx/moriium-client-crl.pem;
    ssl_verify_client      on;

    location ^~ /admin { proxy_pass http://127.0.0.1:4321; }
    location ^~ /api   { proxy_pass http://127.0.0.1:4321; }

    location / { try_files $uri $uri/ $uri/index.html =404; }
}
```

**没有证书的客户端在 TLS 握手阶段就被拒绝，请求根本不会变成一个 HTTP 请求。**这比在应用层返回 404 更早也更彻底：Node 进程完全看不到这些连接。

主站那两条 `return 404` 保留下来当第二道：万一将来有人在主站上误加了后台路由，这条还在。

Node 进程仍然只监听 `127.0.0.1`，不监听 `0.0.0.0`。即使 Nginx 配错，进程本身也不对外。

### 10.3 主机名不是秘密，也不需要是

`admin.morii9961.top` 会因为签发 TLS 证书而出现在证书透明度（CT）日志里，是可被枚举的公开信息。

**这不构成问题，因为 mTLS 的安全性不依赖主机名保密。**写下来是为了防止有人误以为「换一个冷僻的名字会更安全」，然后基于这个错觉放松别的东西。同理，不要把「换个端口」当成一层防护。

ACME 签发不受影响：HTTP-01 挑战走 80 端口的明文 HTTP，不经过 `ssl_verify_client`。

### 10.4 CA 与证书的生命周期

自建一个只服务于这件事的私有 CA，不复用任何现有 CA。

- **CA 私钥不放在 VPS 上。**服务器只需要 CA 的公钥证书（`ssl_client_certificate` 指向它）。
- **每台设备一张独立证书**，便于单独吊销而不影响其他设备。
- **有效期 1 年。**更长则丢失后的暴露窗口太大，更短则换证太频繁。
- **吊销用 `ssl_crl`**（上引同一份文档），设备丢失时签发新 CRL 并 reload。

两个必须写下来的失效模式：

**一、证书过期会把你自己锁在门外。**Morii 决定不做告警（第 1.1 节），所以这一条有个圈：提醒面板在后台里，而证书过期之后进不了后台。出口是日历提醒，见第 12.2 节。同时保留一条带外恢复路径：SSH 进 VPS，临时把 `ssl_verify_client` 改成 `off`，签一张新证书后改回来。**这条恢复路径要在第 11.4 节的演练里真的走一遍**，不能只写在文档里。

**二、CA 私钥丢了就再也签不出新证书。**CA 私钥要离线备份，且与第 11 节的数据备份分开存放——同一次事故不该同时带走数据和签发能力。

### 10.5 有证书不等于登录成功

口令、会话、CSRF token、Host/Origin 守卫、按账户限速、审计，全部保留。

理由很直接：**证书保护的是「谁能连上来」，不是「谁是作者」。**设备丢失、证书被复制、浏览器配置文件被整个拷走，这些场景里 mTLS 已经失效，剩下的全靠应用层。

ADR 0001 第 5 节那句在这里同样成立：本地绑定不构成安全模型。换成客户端证书也一样。

### 10.6 不做 TOTP

在这个拓扑下 TOTP 的边际收益低而成本真实：攻击者在 TLS 握手阶段就被挡住，到不了登录页；而 TOTP 引入一个新的恢复面——密钥丢了怎么办，恢复码存哪里，agent 账户怎么处理。这三个问题的答案都是新的攻击面。

**触发条件写下来**：如果将来 Admin 改成不要求客户端证书的公网可达形态，TOTP 从「不做」变成「必须做」，且必须先做。

## 11. 备份与恢复

### 11.1 目标

| | 值 | 含义 |
| --- | --- | --- |
| RPO | ≤ 1 小时 | 最坏丢失一小时内的写入 |
| RTO | ≤ 30 分钟 | 从发现到恢复可写状态 |

对一个单人博客，这两个数字是宽松的；写下来是为了让「够不够」变成一个可以检验的问题。

### 11.2 备份什么

- `admin.db` — 每小时一次在线备份，本地保留 48 份；每日一份异地，保留 30 天。
- `/var/lib/moriium/media/` — 每日同步到异地。
- **客户端 CA 的私钥** — 离线备份，且**与上面两项分开存放**。同一次事故不该同时带走数据和签发新证书的能力（第 10.4 节）。它不参与每小时备份，因为它几乎不变。
- **会话不备**，理由见第 9.3 节。
- **源码不备**，它在 Git 里。

### 11.3 用 `sqlite.backup()`，而且从应用进程内跑

`node:sqlite` 自带在线备份，不需要额外工具。但官方有一句必须照做的说明：

> The backed-up database can be used normally during the backup process. Mutations coming from the same connection — same `DatabaseSync` object — will be reflected in the backup right away. However, **mutations from other connections will cause the backup process to restart**.
> — <https://nodejs.org/docs/latest-v24.x/api/sqlite.html>

所以备份要从**持有那个连接的应用进程内部**触发，不是外部 cron 另开一个连接。外部备份在作者正在写作时会反复重启，而且这个失败模式是安静的——备份看起来在跑，只是永远不结束。

### 11.4 没演练过的备份不算备份

每季度做一次完整恢复演练，并且**记录实测的 RTO**，而不是记录「演练通过」。演练要在一个干净的目录里从异地副本恢复，然后跑一遍读取与写入。

演练脚本本身要按 ADR 0001 第 5 节的标准写：先拿一个损坏的备份让它失败一次，确认它真的会失败。

**同一次演练要一并走通把自己锁在门外之后的恢复路径**（第 10.4 节）：假装客户端证书已过期，SSH 进去临时关掉 `ssl_verify_client`、签一张新证书、改回来。这条路径平时用不到，因此更需要在没出事的时候证明它能走通。

## 12. 监控：可以查，但不会通知你

### 12.1 观测项

Morii 于 2026-08-30 决定暂不做告警（第 1.1 节），理由是不想为此引入一个新的第三方服务。所以这一节收集状态，但不主动推送。

| 观测项 | 判定为不正常的条件 |
| --- | --- |
| systemd 单元状态 | 非 `active` |
| 健康端点 | 连续 3 次失败 |
| 备份 | 任一次未在预期时间内成功 |
| 站点重建 | 失败，或 `published_version_id` 与 `live_version_id` 持续不一致超过 15 分钟 |
| 磁盘 | 剩余空间低于阈值 |
| 客户端证书与 CA | 任一张在 30 天内到期 |

**这些状态汇总在后台首页的一个面板里。**不需要新服务、不需要新依赖、不需要新账户，作者每次进后台写作时顺带就看见了。这是「不做告警」这个约束下成本最低的做法。

**边界不变**：这些是运维观测，不是读者行为分析。`AGENTS.md` 禁止统计与追踪脚本，服务端不建立读者画像，访问日志按最短必要期限轮转。

### 12.2 不做告警的残余风险

要写下来，不能因为是 Morii 的决定就当它没有代价：

**失败是安静的。**备份连续几周没成功、磁盘快满了、站点重建一直失败，在你主动打开后台之前都不会有人告诉你。写作频率高的时候这没什么，长时间不写的时候正好是风险最大的时候——而那恰恰是你最久不打开后台的时候。

**证书到期这一条有个圈。**面板在后台里，而证书过期之后你进不了后台，也就看不到那个本该提醒你的面板。所以这一条不能只靠面板：

- 面板在证书还有效时显示剩余天数，这是主路径；
- **另外在日历上设一个到期前 30 天的提醒**，这一条不依赖任何系统，是那个圈的唯一出口；
- 真锁在外面时走第 10.4 节的带外恢复：SSH 进去临时关掉 `ssl_verify_client`，签新证书，改回来。这条路径在第 11.4 节的季度演练里走过一遍。

**要加告警的触发条件**：如果出现过一次「因为没人通知而造成实际损失」的事件——备份失败很久才发现、站点停更很久才发现——就把告警补上，不再权衡。

## 13. 威胁模型与安全边界

### 13.1 资产

| 资产 | 在哪里 | 泄露后果 |
| --- | --- | --- |
| 未发布草稿 | 数据库 | 内容提前曝光 |
| 作者口令 | 数据库（scrypt 哈希） | 完全接管写入 |
| 会话 | 文件系统 | 有效期内接管写入 |
| 加密文章明文与口令 | **不在服务器上** | — |
| 原始照片与 GPS | **不在服务器上** | — |

最后两行是这套设计里最省事的部分：把它们排除在服务端之外，就不用为它们设计防护。这条边界不能因为「放进来更方便」而松动。

### 13.2 攻击面与对应防线

| 面 | 防线 |
| --- | --- |
| 公网 443 | 只有静态文件；`/admin`、`/api` 返回 404；无登录端点 |
| Admin 主机名 | 客户端证书（TLS 握手层）+ 口令 + 会话 + CSRF token + Host/Origin + 按账户限速 + 审计 |
| 媒体上传 | 只收衍生图；服务端强制净化并复核；`sanitized_at` 为空不得发布 |
| 发布 | 内容、翻译关系、媒体三道闸门，在事务内执行，拒绝不留半公开状态与审计行 |
| SSH | 现有部署密钥流程不变 |

### 13.3 这份 ADR 不解决的

写出来，免得被误读成已覆盖：

- **供应链。**依赖被投毒不在这份 ADR 的范围内。缓解只有锁定精确版本与人工审阅新增依赖，那是 `AGENTS.md` 已有的要求。
- **VPS 主机沦陷。**拿到 root 就拿到数据库与会话。异地备份是止损，不是防护。
- **客户端证书泄露。**设备被拿走、证书被导出、浏览器配置文件被整个拷走，都等于攻击者能连上 Admin 主机名。此后完全依赖第 10.5 节那几道应用层防线。缓解是吊销该设备的证书（`ssl_crl`），前提是你察觉到了。
- **作者设备沦陷。**会话 cookie 与口令都在那台机器上。

## 14. 回退方案

四级，级别越低影响越小。前三级都不需要改代码。

**L1 — 关掉后台，站点不变。**停掉 systemd 单元，Nginx 里把 Admin 那个 server block 注释掉或整块移除。读者完全无感，因为读者路径本来就不经过 Node。数据库原样保留。这是第 4.1 节那个拓扑最直接的回报。

**L2 — 回滚站点。**现有的 `current` 符号链接原子替换流程完全不变（`docs/deployment.md` 的手动回滚一节继续有效）。数据库不动，只是站点回到上一版产物。

**L3 — 从备份恢复数据库。**停进程、换库文件、起进程、重建站点。目标 30 分钟，第 11.4 节的演练要证明这个数字。

**L4 — 放弃 vNext，退回纯静态。**把数据库里的文章导出为 Markdown 写回 `src/content/posts/`，移除 adapter，`AGENTS.md` 与部署合同改回去。

**L4 之所以成立，完全是因为第 6.1 节坚持了 Markdown 真源。**导出器只是把库里已经存着的 Markdown 加上 frontmatter 写成文件，不需要格式转换，因此不需要一个「希望它能跑对」的转换器。这是那个决定最实际的回报，不是原则问题。

## 15. 部署合同的改动

`docs/deployment.md` 要改的地方，逐条列出。

### 15.1 目录布局：代码与数据彻底分开

```text
/var/www/moriium/                 代码与产物，可随时整个删掉重建
├── current -> releases/<sha>
├── releases/<sha>/               不可变，保留 6 份
└── workspace/                    VPS 构建工作区（源码 + node_modules）

/var/lib/moriium/                 数据，永不进 release 目录
├── admin.db                      SQLite（含 -wal、-shm）
├── sessions/                     Astro session driver 的路径
├── media/                        已净化的公开衍生图
├── content/                      数据库导出的 Markdown，构建输入
└── backups/                      本地备份
```

**这条分离是硬要求，不是整洁偏好。**`releases/` 只保留 6 份、发布时整目录替换；任何落在里面的数据都会在第 7 次发布时消失。

### 15.2 构建从 CI 迁到 VPS

现在：CI 构建 → 上传 tar → VPS 解包。

之后：CI **验证**（`pnpm check` / `test` / `build` / `links`，用仓库内容）→ 上传源码 tar 到 `workspace/` → VPS 上 `pnpm install --frozen-lockfile` 并构建。

原因是结构性的：**内容在 VPS 的数据库里，CI 拿不到。**要么把内容回写进仓库（引入长期双写，`vnext-architecture-plan.md` 第 6 节明确禁止），要么在有数据库的地方构建。选后者。

代价要写明：VPS 上要有 Node 与 `node_modules`（数百 MB），构建期间占用资源。实测当前站点 46 页构建约 4 秒，这个量级不构成问题。`node_modules` 放在 `workspace/` 里持久保留，只有 lockfile 变化时才重装。

构建输入的合并方式：**发布时应用把该文章导出为 Markdown 到 `/var/lib/moriium/content/`，构建前复制进 `workspace/`。**用复制而不是符号链接或 `glob()` 的 `base` 指向项目外——官方文档只演示了项目内的相对路径，没有说明 `base` 是否接受项目外的绝对路径，而 Markdown 只有几百 KB，复制是确定的、不依赖未验证行为的做法。

迁移期间 `src/content/posts/` 与导出目录同时存在（Phase 6A 的双轨），迁移完成后仓库那份清空。

### 15.3 发布序列

代码发布与内容发布走同一条构建路径，只是触发者不同：

```text
1. 触发（CI 推送代码，或作者点发布）
2. 从 /var/lib/moriium/content/ 复制内容进 workspace
3. pnpm install --frozen-lockfile（lockfile 未变则跳过）
4. astro build → releases/<sha-or-timestamp>/
5. 上线前检查：三语首页、sitemap、标题、无空 HTML（现有检查不变）
6. 原子替换 current
7. 本地 curl 检查 /zh/，失败则恢复上一个链接（现有流程不变）
8. 回写 articles.live_version_id
9. 保留最新 6 份 release
```

第 8 步是新增的，它让第 4.2 节那个「发布了但没上线」的状态有据可查。

### 15.4 systemd

一个单元，`Restart=on-failure`，`User` 为非特权部署用户，`WorkingDirectory` 指向 `current`，环境变量里给出 `/var/lib/moriium/` 下各路径。`HOST=127.0.0.1`、`PORT=4321`（<https://docs.astro.build/en/guides/integrations-guide/node/>）。

单元文件与 Nginx 配置一样进 `deploy/`，跟着仓库走。

### 15.5 Nginx 与证书

`deploy/nginx/moriium.conf` 从一个 server block 变成两个（第 10.2 节）。新增的第二个需要三样东西，都要写进部署文档：

1. `admin.morii9961.top` 的 DNS 记录与 TLS 证书。ACME 的 HTTP-01 挑战走 80 端口明文，不受 `ssl_verify_client` 影响，所以续期流程与主站一致。
2. `/etc/nginx/moriium-client-ca.pem` — 私有 CA 的**公钥证书**。这个文件可以进仓库的 `deploy/`，它本来就是公开的。
3. `/etc/nginx/moriium-client-crl.pem` — 吊销列表。会随设备增减而变，**不进仓库**，在 VPS 上维护。

**CA 私钥永远不进仓库、不进 VPS。**签发新设备证书在本地做，只把签出来的证书交给设备。仓库里要有一份签发与吊销的操作步骤，因为这件事一年做不了几次，不写下来到时候一定想不起来。

`.gitignore` 要挡住 CA 私钥的常见文件名，作为手滑的兜底。

## 16. `AGENTS.md` 的改动

五处，都要精确改而不是整段重写。每一条先引原句，再说改法。

**一、产品合同里禁止后台与数据库的那句。**

> Do not add comments, analytics, accounts, an admin runtime, a database, or an API without Morii explicitly changing scope.

这句本来就留了「除非 Morii 明确改变范围」这个口子，本 ADR 就是来兑现它的。改法不是删掉：评论与分析仍然禁止；管理后台、数据库、作者账户与内部 API 由本 ADR 批准进入，并写明它们只服务作者路径。**读者账户与评论仍在禁止之列**，不因本 ADR 松动。

**二、同一段里禁止 VPS 运行时的那句。**

> Search must remain a build-time static index; static build tooling is allowed, but the deployed site must not require Node, a database, PM2, a search service, or a CMS process on the VPS.

这是最需要小心改的一句。改成按路径区分，而不是整句作废：

> 读者路径不得依赖 Node 进程、数据库或 CMS。公开路由必须保持预渲染，Nginx 直接服务静态产物；作者后台可以依赖常驻 Node 进程与数据库，且不得从公网可达。

这样保留了原句真正在保护的东西（读者的可靠性），只放开它顺带禁止的东西（作者端的运行时）。**搜索索引必须保持构建期静态这半句原样保留。**

**三、工程约束里同时禁止 UI 框架和 adapter 的那句。**

> Use Astro static output, TypeScript, and pnpm. Do not add a UI framework, Tailwind, or server adapter.

这句挡住了本 ADR 的两件事，要分开改：

- `output` 仍然是 `static`，这半句不变；
- **adapter 由本 ADR 批准加入**，但要写明它的唯一用途是让 `/admin`、`/api` 按需渲染，公开路由不得因此改成按需；
- 公开站 `src/` 仍然不加 UI 框架与 Tailwind；作者后台使用 Vue 3 与 Tiptap，其代码不得被公开路由引入。

最后一条要有测试兜底，不能只写在文档里。质量门已有「普通页面不含未使用的高级阅读端包」，把后台包加进同一条检查：**公开页面产物里出现 Vue 或 Tiptap 就该红。**

**四、质量门里的那句。**

> Release output is static and works behind Nginx without Node.

改成：公开产物必须是静态的，并且在 Node 进程停止时仍可完整服务；这一条要用「停掉 systemd 单元后公开路由仍然全部可达」来验证，而不是靠声明。这正是第 14 节 L1 那条回退路径，把它同时作为一条常设检查。

**五、Pages CMS 的两处。**

> Pages CMS authoring for public posts and a local-only encryption flow for protected posts.
> Public posts live in `src/content/posts/` and may be edited through Pages CMS.

迁移期内两者并存，但**不得形成长期双写**（`vnext-architecture-plan.md` 第 6 节）。改法：迁移完成后 Pages CMS 只保留为只读历史入口或停用，`src/content/posts/` 的可写状态随之收回。在 Phase 6A 双轨期间，同一篇文章不得同时存在于两个入口。加密文章的本地流程完全不变，不接入后台。

## 17. 明确不做

- 评论；
- 读者账户与公开注册；
- 分析与追踪脚本；
- **不要求客户端证书的后台。**Admin 的主机名解析在公网上，但没有证书的连接在 TLS 握手阶段就被拒；把 `ssl_verify_client` 关掉或改成 `optional` 等于换成另一个威胁模型，要先补 TOTP 与封禁机制（第 10.6 节的触发条件）；
- 在这份 ADR 下把 canonical content 迁成 JSON；
- 把公开文章路由改成按需渲染（要改走 Phase 6B 与第二份 ADR）；
- 把加密文章的明文或口令放进服务端；
- 把原始照片上传到服务器。

## 18. 未决问题

不阻塞 Phase 6A 开工，但要在影子系统验收前有答案：

1. **搜索索引在双源内容下怎么生成。**构建时生成这条不变，但索引要同时覆盖仓库内容与数据库导出内容。做法直接，只是要写下来并测试。
2. **迁移正式内容的时机与顺序。**Phase 6A 的退出条件，那时再定。
3. **`glob()` 的 `base` 是否接受项目外路径。**第 15.2 节用复制绕开了它，所以这一条现在无关紧要；如果将来想去掉复制这一步，需要先验证。

原第 1 项（移动端证书体验）与第 2 项（告警渠道）已由 Morii 于 2026-08-30 撤销，见第 1.1 节。

## 19. 一手来源

访问日期均为 2026-08-30。版本判断针对本仓库锁定的 `astro@7.2.4` 与 `.nvmrc` 的 Node 24（实测 `v24.15.0`）。

- Astro 按需渲染与 Hybrid：<https://docs.astro.build/en/guides/on-demand-rendering/>
- Astro Sessions：<https://docs.astro.build/en/guides/sessions/>
- Astro Actions：<https://docs.astro.build/en/guides/actions/>
- Node adapter（standalone / middleware、`HOST`/`PORT`、会话存储）：<https://docs.astro.build/en/guides/integrations-guide/node/>
- 配置参考（`security.checkOrigin` 的适用范围、`session` 选项与 cookie 默认值）：<https://docs.astro.build/en/reference/configuration-reference/>
- `node:sqlite` 稳定性与 `sqlite.backup()`：<https://nodejs.org/docs/latest-v24.x/api/sqlite.html>
- Astro 内容集合与 `glob()` loader：<https://docs.astro.build/en/guides/content-collections/>
- Nginx `ssl_verify_client` / `ssl_client_certificate` / `ssl_crl` 的上下文与取值：<https://nginx.org/en/docs/http/ngx_http_ssl_module.html>

## 20. 自审记录

Enouia 已退出，这份 ADR 与 ADR 0001 一样是自审。以下是自审**实际改掉**的问题，不是确认清单。

| # | 问题 | 处理 |
| --- | --- | --- |
| 1 | 初稿把会话按 Astro 默认配置写，没注意默认落在应用目录 | 与现有 release 布局对照后发现每次发布都会踢下线、第 7 次发布会删数据。第 9.3 与 15.1 节因此把数据目录单独固定 |
| 2 | 初稿写「Astro 自带 CSRF 保护」，准备去掉尖峰的显式 token | 查配置参考发现 `checkOrigin` 只覆盖三种表单 content-type，不含 `application/json`。第 9.4 节改为两道并存，并要求在代码注释里写明来源 |
| 3 | 初稿把发布写成一步 | 内容在数据库、站点要构建，一步会造出「说不清发布没发布」的状态。第 4.2 节改成两步，第 6.3 节加 `live_version_id` 承载差值 |
| 4 | 初稿准备用外部 cron 跑 `sqlite.backup()` | Node 文档说别的连接写入会让备份重启，而且这个失败是安静的。第 11.3 节改为从应用进程内触发 |
| 5 | 初稿沿用 `node:sqlite` 但理由仍是「尖峰工具」 | ADR 0001 要求生产重新评估。第 6.2 节换成实际理由（Node 24.15 起是 RC、零依赖、自带在线备份），并写下换引擎的触发条件 |
| 6 | 初稿打算用 `glob()` 的 `base` 直接指向 `/var/lib/moriium/content/` | 官方文档只演示项目内相对路径，没有说明项目外绝对路径是否受支持。第 15.2 节改为复制，并把这条列进未决问题 |
| 7 | 初稿没提第 13.15 节那个围栏代码块误拦 | 生产会误伤 `markdown-reference.md` 那类文章。第 8.3 节要求改成从解析结果取图片引用 |
| 8 | 改用客户端证书后，初稿想写成「同一个 server block，只给 `/admin` 要证书」 | 查 Nginx 文档发现 `ssl_verify_client` 的上下文是 `http, server`，**不能写在 `location` 里**。第 10.2 节因此改成独立主机名加独立 server block |
| 9 | 改用客户端证书后，初稿没写自锁与 CA 私钥丢失两种失效 | 这两种都是「平时不会发生、发生时没有退路」。第 10.4 节补了过期提醒与带外恢复路径，第 11.2 与 11.4 节把 CA 私钥纳入备份、把自锁恢复纳入演练 |
| 10 | Morii 决定不做告警之后，证书到期提醒出现了一个圈 | 提醒面板在后台里，而证书过期之后进不了后台，等于最需要它的时候看不到它。第 12.2 节把日历提醒定为这个圈的唯一出口，并写明它不依赖任何系统 |

**自审覆盖不到的地方**，需要 Morii 补位：这份 ADR 的架构取舍没有第二个独立技术视角复核过；第 11 节的 RPO/RTO 是我给的默认值，不是从 Morii 的实际容忍度推出来的；第 18 节第 1、2 两项直接依赖 Morii 的偏好，我给不出。
