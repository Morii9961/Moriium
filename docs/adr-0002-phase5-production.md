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
| ~~8~~ | ~~新增 `admin.morii9961.top` 的 DNS 记录与私有 CA~~ | **已撤销**，见 1.1 第三条。Admin 用主站的主机名与证书，无需新增任何一项 |

**批准这份 ADR 不等于批准迁移正式内容。**迁移是 Phase 6A 的退出条件，要另外验收。这份 ADR 批准的是「可以按这个形状去建影子系统」。

### 1.1 批准记录（2026-08-30）

Morii 批准以上八项，并同时定夺两件事，都缩小了范围：

**一、暂时不做告警。**第 12 节因此从「会通知你」降级为「可以查」，残余风险写在 12.2。

**二、不需要移动端的客户端证书。**（随第三条一并作废。）

**三、客户端证书整个撤掉，Admin 直接对公网开放。**Morii 看到证书的生命周期成本（吊销列表、CA 私钥离线备份、到期提醒）之后判断不值得，并明确表示不接受「会被扫死」这个前提。第 10 节据此重写为「公网 + 长随机口令 + 限速 + fail2ban」。

**这一条是加风险的减法，与前两条性质不同**，代价写在 10.4。第 4 到 9 节与第 11 到 15 节的结构决定不受影响。

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

**三、Admin 直接对公网开放，靠口令强度与限速防守。**这一条经过三轮：先定隧道，因为「每次要先连」改成客户端证书，再因为证书的生命周期成本整个撤掉。最终形态与代价见第 10 节。

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


                    公网 443 (Nginx)
                          │
                       /admin, /api
                          │
                    限速 + fail2ban
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

**`try_files` 的顺序仍然是关键。**公开路由先找静态文件，找到就直接发，永远不进 Node；只有 `/admin` 与 `/api` 这两个前缀反代过去。所以「Node 挂了读者受影响吗」这个问题的答案仍然是结构性的「不」，不是「一般不会」——这一点没有因为撤掉证书而改变。

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

## 10. Admin 的暴露面：公网加口令

### 10.1 三轮之后的结论

这一节改过三次，过程本身值得留着：

| 轮次 | 方案 | 为什么放弃 |
| --- | --- | --- |
| 一 | 隧道 | 每次写作前要先连 |
| 二 | 客户端证书 | 生命周期成本太高：吊销列表会过期、CA 私钥要离线备份、到期提醒还绕不出「过期就进不去后台」那个圈 |
| 三 | **公网 + 口令 + 限速** | 采用 |

第二轮的成本大部分是我按公网 PKI 的习惯堆上去的，对一台或两台设备的博客后台并不相称。Morii 判断不值得，这个判断成立。

### 10.2 形态

```nginx
server {
    listen 443 ssl;
    server_name morii9961.top;
    root /var/www/moriium/current;

    # 公开路由先走静态文件，命中就到此为止，永远不进 Node。
    location / { try_files $uri $uri/ $uri/index.html =404; }

    location ^~ /admin { proxy_pass http://127.0.0.1:4321; }
    location ^~ /api   { proxy_pass http://127.0.0.1:4321; }
}
```

不再需要第二个主机名、私有 CA、`ssl_client_certificate`、`ssl_crl`，第 15.5 节相应缩水。

Node 进程仍然只监听 `127.0.0.1`。读者路径仍然完全不经过它。

### 10.3 实际防线

| 层 | 做什么 |
| --- | --- |
| 口令 | 密码管理器生成的 30 位以上随机串，**不与任何其他地方重复**；scrypt 存储 |
| 限速 | 按账户计数（第 9.2 节），另有全局阀门防枚举 |
| fail2ban | 读 Nginx 日志，封反复失败的来源 IP |
| 会话 | `Secure` + `HttpOnly` + `SameSite=Lax`，生产 TLS 下全部成立 |
| CSRF | 显式 token，见第 9.4 节 |
| 审计 | 每次发布、回滚都记 actor |

**口令强度是这套东西真正的地基。**其余每一层都是在为它争取时间，没有一层能替代它。一个从别处复用过来的口令会让上面整张表失去意义。

### 10.4 这一步接受了什么

写清楚，不能因为是 Morii 的决定就当它没有代价：

**登录框会被无差别扫描找到并反复尝试。**这不取决于 Moriium 有没有名气——扫描器在扫地址空间，不在挑目标。所接受的赌注是：长随机口令扛得住猜测，限速与 fail2ban 扛得住频率。对绝大多数个人站点，这个赌注成立，而且是它们的常态。

**后台代码自身的漏洞现在直接暴露在公网上。**认证绕过、注入、越权这类问题，以前要先穿过证书才谈得上，现在不用。原型 B 是尖峰代码，`AGENTS.md` 的验收要求与 ADR 0001 第 5 节的测试标准在这里比之前更重要，不是更次要。

**没有告警**（第 12 节）意味着大量失败登录不会有人通知你。fail2ban 会挡，但「有人在持续尝试」这个信号只在你主动去看日志时才存在。

**要回头加防护的触发条件**：出现一次可疑的成功登录、或者日志里出现明显针对性的尝试（不是通用扫描），就把 TOTP 补上。

### 10.5 撤回一句我之前写的话

上一版这里写着「如果将来改成公网可达，TOTP 从『不做』变成必须做」。**那句话现在收回。**

写它的时候，「公网可达」在我脑子里等于「除了口令什么都没有」。实际方案里有长随机口令、按账户限速、全局阀门和 fail2ban，在这个组合上 TOTP 是可选的纵深，不是前提。把它写成硬性前提，是我把一句谨慎的话写得比它应得的更硬。

TOTP 仍然推荐，但它是一个可以以后再加的选项，不是开工条件。

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

**这些状态汇总在后台首页的一个面板里。**不需要新服务、不需要新依赖、不需要新账户，作者每次进后台写作时顺带就看见了。这是「不做告警」这个约束下成本最低的做法。

**边界不变**：这些是运维观测，不是读者行为分析。`AGENTS.md` 禁止统计与追踪脚本，服务端不建立读者画像，访问日志按最短必要期限轮转。

### 12.2 不做告警的残余风险

要写下来，不能因为是 Morii 的决定就当它没有代价：

**失败是安静的。**备份连续几周没成功、磁盘快满了、站点重建一直失败，在你主动打开后台之前都不会有人告诉你。写作频率高的时候这没什么，长时间不写的时候正好是风险最大的时候——而那恰恰是你最久不打开后台的时候。

**失败的登录尝试没人告诉你。**fail2ban 会挡住频率，但「有人在持续尝试」这个信号只在你主动翻日志时才存在。第 10.4 节把这一条列为接受的代价之一。

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
| 公网上的 `/admin`、`/api` | 长随机口令 + 按账户限速 + fail2ban + 会话 + CSRF token + Host/Origin + 审计 |
| 媒体上传 | 只收衍生图；服务端强制净化并复核；`sanitized_at` 为空不得发布 |
| 发布 | 内容、翻译关系、媒体三道闸门，在事务内执行，拒绝不留半公开状态与审计行 |
| SSH | 现有部署密钥流程不变 |

### 13.3 这份 ADR 不解决的

写出来，免得被误读成已覆盖：

- **供应链。**依赖被投毒不在这份 ADR 的范围内。缓解只有锁定精确版本与人工审阅新增依赖，那是 `AGENTS.md` 已有的要求。
- **VPS 主机沦陷。**拿到 root 就拿到数据库与会话。异地备份是止损，不是防护。
- **口令泄露或复用。**没有第二因素，口令就是唯一的门。第 10.3 节把「不与任何其他地方重复」写成硬要求，正是因为这里没有别的东西兜底。
- **后台代码自身的漏洞。**认证绕过、越权、注入这类问题现在直接暴露在公网上，见第 10.4 节。
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

### 15.5 Nginx 与 fail2ban

`deploy/nginx/moriium.conf` 仍然是一个 server block，只是多两条 `proxy_pass`（第 10.2 节）。不需要新主机名、新证书、私有 CA 或吊销列表。

新增的是 fail2ban：一个读 Nginx 访问日志的 filter 加一个 jail，封反复触发登录失败的来源 IP。两个配置文件都进 `deploy/`，跟着仓库走。

阈值不要拍脑袋定死，**上线后按真实日志调**——阈值太松等于没装，太紧会在自己连续输错口令时把自己封掉。所以还要记一条：怎么在被自己封掉之后解封（`fail2ban-client unban`），写在部署文档里。

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
- 用可猜的、或与别处复用的后台口令（第 10.3 节）；
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
| 10 | Morii 决定不做告警之后，证书到期提醒出现了一个圈 | 提醒面板在后台里，而证书过期之后进不了后台，等于最需要它的时候看不到它。当时的处理是把日历提醒定为唯一出口——**这一条随第 11 条一并作废** |
| 11 | 第 8 到 10 条堆出来的复杂度，是我自己加的 | 吊销列表、CA 私钥离线备份、日历提醒，都是把公网 PKI 的习惯搬到一个两台设备的博客后台上。Morii 判断不值得，这个判断成立。第 10 节整节重写为公网加口令，第 11、12、15.5、17 节相应缩水 |
| 12 | 上一版写死「改公网就必须先做 TOTP」 | 写那句时「公网可达」在我脑子里等于「除口令外一无所有」，而实际方案有长随机口令、按账户限速、全局阀门和 fail2ban。第 10.5 节明确收回那句，把 TOTP 降为可选纵深 |

**自审覆盖不到的地方**，需要 Morii 补位：这份 ADR 的架构取舍没有第二个独立技术视角复核过；第 11 节的 RPO/RTO 是我给的默认值，不是从 Morii 的实际容忍度推出来的；第 18 节第 1、2 两项直接依赖 Morii 的偏好，我给不出。

## 21. 执行记录

### 21.1 混合渲染成立，并且会自己红（2026-08-30）

Phase 6A 的第一块刻意不是数据库，而是第 4、5 节那面承重墙：**公开路由全部预渲染，只有 `/admin` 与 `/api` 按需**。它要是不成立，后面每一块都建在沙上。

装 `@astrojs/node@11.1.4`（peer 要求 `astro: ^7.2.1`，本仓库是 `7.2.4`），`output` 保持 `static`，加 `adapter: node({ mode: 'standalone' })`，再加一个 `src/pages/admin/index.astro` 占位页写明 `export const prerender = false`。

构建产物按官方文档所述一分为二：

```text
dist/client/   46 个 HTML 加静态资源      读者要的全在这里
dist/server/   entry.mjs                 按需渲染的入口
dist/client/admin/   不存在              占位页没有被静态化
```

页数没有变（之前 46，现在 46）。

#### 分裂的代价是四个脚本加一条流水线

产物换了位置，凡是读 `dist/` 的东西都要跟着改。这些不是琐事，漏掉任何一条都会安静地失效：

| 位置 | 问题 |
| --- | --- |
| `scripts/check-links.mjs` | 会去 `dist/` 找页面，找不到 |
| `scripts/audit-public-tree.mjs` | 隐私审计会漏掉真正的公开产物，同时开始扫服务端 bundle |
| `scripts/audit-design-fonts.mjs` | 同上 |
| `prototypes/tools/verify-baseline-pipeline.mjs` | 拿不到 `dist/` 里的真实文章 |
| `.github/workflows/ci.yml` | **`tar -C dist .` 会把 `client/`、`server/` 打成子目录，部署上去全站 404** |

前四个统一走新的 `scripts/lib/public-output.mjs`，一处解析，并且在没有 adapter 时回退到 `dist/`——第 14 节留着移除 adapter 这条回退路径，一个会在回退时坏掉的检查会让回退更难，那正好是最不该更难的时候。

CI 改成 `tar -C dist/client .`。**VPS 目前没有 Node 进程，所以只发布预渲染的那一半，release 的形状与加 adapter 之前完全一致。**第 15 节描述的那套（发布服务端、systemd、Nginx 反代）留到真正部署 Admin 时再动。

#### 把承重墙做成会红的检查

`scripts/check-render-split.mjs`，进 `pnpm verify`。它检查的是**构建出来的树**，不是那份本该产出它的配置：

```text
1. 每个公开路由都是磁盘上的一个文件
2. 三语搜索索引都在
3. admin、api 不在公开产物里
4. 有按需路由时，server entry 必须存在
5. 公开产物里不含 admin 专用代码（@tiptap、prosemirror、createApp、vue.runtime）
```

第 1 条是 `AGENTS.md` 新增那条质量门的可检验形式。那条门要求「停掉进程来证明公开站还在，而不是声称它在」——**一个路由如果解析到磁盘上的文件，停掉 Node 就不可能影响它**，所以文件存在就是那个证明。

**做过负向测试**：把占位页的 `prerender` 改成 `true` 重新构建，检查当场报「`/admin/` was prerendered」；改回来就绿。写这条检查的过程里它还抓到我自己的一个错——我把搜索索引的路径写成了 `zh.json` 而不是 `search/zh.json`，第一次运行就红了。

第 5 条现在是**平凡成立**的，因为占位页不带任何客户端 JS。它存在是为了等真编辑器进来那天，泄漏会让构建失败，而不是让每个读者下载一兆的编辑器。

另有两条源码级断言进 `tests/render-split.test.mjs`：`output` 必须是 `static` 且不得是 `server`；`src/pages/admin`、`src/pages/api` 下每个页面都必须声明 `prerender = false`，并且断言「至少检查到一个页面」——否则目录改名之后这条检查会平凡通过，那正是这类检查腐烂的方式。

写第一条时踩了个小坑值得记：配置文件里那段解释「不要用 `output: 'server'`」的注释，让 `doesNotMatch` 断言失败了。断言现在先剥掉行注释再看代码。

#### 本轮验证

```text
pnpm verify                       -> 退出码 0
  astro check                     -> Result (64 files): 0 errors, 0 warnings, 0 hints
  node --test tests/*.test.mjs    -> tests 32 / pass 32 / fail 0
  astro build                     -> dist/client 46 个 HTML，dist/server/entry.mjs
  check-links / audit-public-tree -> 通过
  check-render-split              -> Rendering split holds: 155 public files serve without Node
pnpm -C prototypes test           -> tests 118 / suites 30 / pass 118 / fail 0
```

#### 仍未做

Admin 只是个占位页，没有数据库、没有认证、没有编辑器。下一块是生产形态的数据库 schema：第 6.3 节那张表、迁移器、以及 B2 要求的完整 frontmatter。

### 21.2 生产形态的数据库：schema、迁移器、两个账户（2026-08-30）

第 6.3 与 6.4 节落地。代码在 `src/server/`，不在 `prototypes/`——第 14 节 L1 的回退是删掉 `prototypes/`，而这部分要活下来。

#### schema

`src/server/db/schema.sql`，六张表加 `schema_migrations`。全部 `STRICT`。三处形状值得单说，因为不写下来会被当成随手写的：

- **frontmatter 挂在 `versions` 上，不挂在 `articles` 上。**改标题、改分类、改标签都要产生新版本并且可回滚。挂在文章上的话，回滚正文会把新元数据留下。
- **`tags` 单独成表。**标签页和标签目录要按标签查询与聚合，JSON 列会把可以建索引的事逼成字符串匹配。
- **`articles` 同时有 `published_version_id` 与 `live_version_id`。**前者是库里的真相，后者是上一次成功构建真正包含的版本。第 4.2 节那个「发布了但还没上线」的状态靠这两列的差值表达，不靠猜。

`cover` 与 `cover_alt` 的关系用 CHECK 约束表达，与 `src/content.config.ts` 里那条 `superRefine` 对齐。

#### 迁移器

只向前，不写回退迁移（第 6.4 节）。每个迁移连同它的记账行在**同一个事务**里跑：抛异常就回滚，数据库停在上一个版本，而不是「改了一半但标记成已完成」。

有用例钉住这一条：往迁移表里塞一个语法错误的迁移，断言抛 `transaction-failed` 且版本号不变。

#### 两条 pragma，以及一条写错的注释

第 6.2 节点名的两条尖峰从来没配过：`journal_mode = WAL`、`busy_timeout`。现在都配了，而且**用例把它们读回来断言**——一条没生效的 pragma 和一条生效了的长得一模一样。

写第三条 `foreign_keys` 时我把注释写错了，实测才发现：

```text
node:sqlite 默认 foreign_keys        = 1     （裸 SQLite 是 0）
事务内执行 PRAGMA foreign_keys = ON  = no-op （SQLite 明确忽略）
```

两个后果。一，我原来写的「SQLite 默认关闭，没有这句 REFERENCES 全是摆设」对这个驱动是错的，已改。二，`schema.sql` 里原本也有一句 `PRAGMA foreign_keys = ON`，**它在迁移事务里执行，什么都没做**——留着会让人以为是它在保证外键。已经删掉并注明为什么不能放那里。

外键那条用例因此也标注清楚了它到底在防什么：不是防我们漏写 pragma（驱动默认已经覆盖），而是防驱动改默认值、或有人传了 `enableForeignKeyConstraints: false`——两种都会让 schema 里每条 REFERENCES 变成注释而没有别的症状。

#### B2 被修掉了，而且是可检验地修掉

尖峰只存 14 个 frontmatter 字段里的 5 个，这是验收清单里两项「不能过」之一。

现在有一条用例直接读 `src/content.config.ts`，解析出 `sharedMetadata` 声明的字段，逐个断言它们在数据库里有对应的列：`tags` 认 `version_tags`，`slug` / `lang` / `translationKey` 认 `articles`（它们是身份不是内容，不该逐版本变），其余认 `versions`。**做过负向测试**：把 `copy_protection` 列改个名，用例当场失败。

所以往 `src/content.config.ts` 加字段而不加迁移，会在构建时红，而不是在发布时变成一个被悄悄丢掉的值。

#### 两个账户

`src/server/accounts.ts`。第 9 节：Morii 与 Enouia 权限相同，不做角色也不做逐篇授权，区分靠审计的 `actor_id`。

- scrypt 参数写进哈希本身（`scrypt$N$r$p$salt$hash`），所以以后调高成本不会让已有哈希失效；
- **口令下限 24 位**，因为第 10.4 节把口令强度定成了这套东西真正的地基；
- 未知账户、已停用账户、口令错误返回同一个结果，且未知账户也照跑一次哈希比对——**否则响应时间会回答那个消息拒绝回答的问题**；
- 账户停用而不是删除，否则历史版本与审计行的作者引用会断。

#### 严格类型检查抓到的一处

`astro check` 在 `src/` 上跑，所以这些新代码要过 `exactOptionalPropertyTypes` 与 `noUncheckedIndexedAccess`。它抓到 `derive()` 的成本参数被推成了字面量类型（`r: 8, p: 1`），于是从存储哈希里解析出来的数字塞不进去——而那正是「旧哈希用它自己的成本验证」这条要求所依赖的路径。改成显式的 `ScryptCost`。

#### 顺带补上一个我自己说过头的地方

`open.ts` 的文件头写着「`scripts/check-render-split.mjs` 会在 `node:sqlite` 进入公开产物时让构建失败」。写的时候那句是**假的**——那个检查当时只认 Tiptap 和 Vue 的标记。现在 `node:sqlite` 也在标记表里了。

**做过负向测试**：往一个公开页面里塞进 `node:sqlite` 这个字符串再构建，检查报 `dist/client/leak-probe/index.html contains admin-only code (node:sqlite)`；删掉就绿。

#### 本轮验证

```text
pnpm verify                    -> 退出码 0
  astro check                  -> Result (68 files): 0 errors, 0 warnings, 0 hints
  node --test tests/*.test.mjs -> tests 44 / pass 44 / fail 0
  check-render-split           -> Rendering split holds
pnpm -C prototypes test        -> tests 118 / pass 118 / fail 0
```

#### 仍未做

没有建账户的入口（要一条只能在服务器上跑的命令）；没有文章与版本的读写 API；没有会话；Admin 仍是占位页。下一块是文章与版本的状态机，把尖峰里那套已经验证过的语义搬到这张 schema 上。（已完成，见 21.3。）

### 21.3 文章与版本的状态机（2026-08-30）

尖峰里验证过的语义（ADR 0001 13.7）搬到生产 schema 上，落在 `src/server/articles.ts`。SQL 仍然只在这一个模块里，模块外没有任何东西 import `node:sqlite`。

三条规则继续由数据结构承担，不靠调用方记得：

- 草稿仍然是 `published_version_id IS NULL`，不是一个会忘记设置的布尔字段；
- 保存仍然**只追加**版本行，`saveVersion` 这条路径上没有任何入口能触及 `published_version_id`；
- 发布与回滚仍然是同一个操作指向不同版本，在同一事务里连同审计行写完。

搬迁时多出来的是尖峰没有的两样东西。

#### 每个版本记作者，每条审计记操作者

第 9.1 节让两个账户权限完全相同，所以**审计是唯一能把它们分开的东西**。`versions.author_id` 与 `audit.actor_id` 因此不是可选的装饰。有用例断言同一篇文章的两个版本能分别归到 Morii 和 Enouia 名下。

#### 发布不等于上线

第 4.2 节那两步在这里第一次有了对应的代码。`published_version_id` 是数据库说的真相，`live_version_id` 是构建产物实际在服务的东西，`markLive` 是导出成功之后才调用的第二步，**不写审计行**——它报告的是一次构建，不是一次编辑行为。

`isAwaitingExport()` 就是两个指针不相等。后台要显示的正是这个差值：它是一个可观测、可重试的状态，而不是「到底发没发出去」这种说不清楚的状态。

`markLive` 拒绝把没发布过的版本标成上线。否则会把发布闸门从未检查过的内容摆到读者面前，而这恰恰是绕开闸门最省事的一条路。`markNotLive` 反过来拒绝在文章仍处于已发布状态时清空上线指针。

#### 一处值得记下来的测试结果

把闸门从写入之前挪到写入之后再跑，**只有「闸门先于写入」那条用例变红，「拒绝后不留痕迹」那条仍然是绿的**——因为事务回滚把那次写入撤掉了。

这不是测试写松了，而是两条不同的保证各由不同机制守着：事务保证「不留半公开状态」，顺序保证「闸门真的在写之前跑」。如果只写前一条，将来有人把校验挪到提交之后（不在同一事务里）就没人会发现。两条都留着。

#### 本轮验证

```text
pnpm verify                    -> 退出码 0
  astro check                  -> Result (70 files): 0 errors, 0 warnings, 0 hints
  node --test tests/*.test.mjs -> tests 62 / suites 6 / pass 62 / fail 0
  check-render-split           -> Rendering split holds: 155 public files serve without Node
```

新增 18 个用例，全部写成越权或绕过尝试：拿别的文章的版本去发布、重复发布同一版本、连发五次自动保存后检查读者看到的、在闸门里抛错之后翻找有没有半公开状态或多余的审计行、把没发布的版本标成上线。

#### 仍未做

没有建账户的入口（要一条只能在服务器上跑的命令）；没有会话；没有 HTTP 读写 API；发布闸门还在尖峰里没有搬过来；Admin 仍是占位页。**下一块是会话与登录**，之后是把闸门与 HTTP 层接上。

### 21.4 会话与登录（2026-08-30）

第 9 节的三条要求已经进生产代码：Astro Sessions 不落在 release 目录，JSON 写请求保留显式 CSRF token，登录限速同时有按账户计数和全局阀门。

#### 会话数据与目录

`astro.config.mjs` 显式使用 `sessionDrivers.fsLite()`。Linux 的默认目录是 `/var/lib/moriium/sessions/`；Windows 本地开发落在已忽略的 `.astro/sessions/`。`MORIIUM_SESSION_DIRECTORY` 可以覆盖它，但要注意 Astro 会在构建时读取 driver 配置，不是 Node 进程启动后再读。cookie 的 `Secure`、`HttpOnly` 与 `SameSite=Lax` 也写在配置里，不靠 adapter 默认值暗示。

会话只存两样：公开作者身份 `{ id, name }` 与独立生成的 CSRF token。登录成功先调用 `session.regenerate()`，再写身份与 token；口令不进会话。登出调用 `session.destroy()`，旧 cookie 与服务端数据一起失效。

数据库同样补了常驻连接入口。Linux 默认 `/var/lib/moriium/admin.db`，Windows 本地开发用 `.astro/admin.db`，生产可由 `MORIIUM_DATABASE_PATH` 覆盖。两个默认值都不会落进 `releases/<sha>/`。

#### 两层限速

尖峰只有一个全局数组，一个账户输错会把另一个账户一起锁住。生产实现改成 15 分钟滑动窗口：同一账户失败 5 次后只锁该账户；全局累计失败 20 次后再挡住轮换假用户名的枚举。成功登录只清掉这个账户自己的失败，不会抹掉全局攻击流量。

限速目前在 Node 进程内存里。重启会清空它；公网侧仍由第 10.3 与 15.5 节的 Nginx/fail2ban 承担跨进程封禁。这里没有把登录失败写进数据库，避免攻击流量把认证路径变成写放大器。

#### HTTP 边界

新增三个按需端点：`POST /api/login`、`GET /api/session` 与 `POST /api/logout`。登录只接收小于 4 KiB 的 JSON，未知账户与错误口令仍返回同一句话；触发限速时返回 429 与 `Retry-After`。登录和登出都检查 Host 与 Origin，登出还必须带当前会话的 CSRF token。

Astro 的 `security.checkOrigin` 保持开启，但第 9.4 节指出它不检查 `application/json`。代码在显式 token 旁保留了官方配置参考链接，避免以后有人把两道防线误当成重复实现。

`/admin` 的占位页改成了最低限度的登录页。它只证明会话能在真实 Astro 页面与 API 间往返；文章列表、编辑器和正式界面仍属于后面的第 6、7 块。

#### 负向测试与本轮窄验证

测试先在三个生产模块不存在时失败，再补实现。八个用例专门尝试以下绕过：锁住 Morii 后确认 Enouia 仍可尝试；把失败分散到 20 个假用户名后确认全局阀门会关；等待窗口边界后才解锁；检查登录会轮换 session id；用错 token、跨 Origin、反弹 Host、缺 Origin 和超大请求体都必须被拒；登出后会话必须销毁。

```text
node --test --test-isolation=none tests/admin-auth.test.mjs
  -> tests 8 / suites 3 / pass 8 / fail 0
pnpm check
  -> Result (79 files): 0 errors, 0 warnings, 0 hints
node --test --test-isolation=none tests/*.test.mjs
  -> tests 70 / suites 9 / pass 70 / fail 0
pnpm build
  -> 46 个公开页面、server entry 与 3 个 API 端点构建成功
pnpm split
  -> 155 个公开文件不依赖 Node；admin、api 保持按需
```

默认 Node 测试隔离在当前 Windows 沙箱仍会报已知的 `spawn EPERM`，所以测试沿用同进程模式。第一次构建也被沙箱拦在 esbuild 子进程；同一条 `pnpm build` 在获准的真实环境重跑后通过。没有为了记录这一块重跑原型的 118 个用例，也没有重复跑 `pnpm verify` 已经覆盖过的链接与公开树审计。

#### 仍未做

建账户命令仍未完成；当前登录页只有数据库里已经存在账户时才能使用。文章 HTTP API、生产发布闸门、Admin 编辑器也都没有接入。**下一块是 HTTP 读写 API 与发布闸门搬迁**，搬闸门时必须同时修第 8.3 节的围栏代码块误拦，并把发布候选扩到 14 个 frontmatter 字段。

### 21.5 文章 HTTP API 与生产发布闸门（2026-08-30）

第 6 块已经接入生产。`/api/articles` 提供作者文章列表与新建；`/api/articles/[id]` 及其 `versions`、`autosave`、`publish`、`rollback`、`unpublish` 子路径负责详情、版本追加和指针切换。所有读取都要求作者会话，所有写入再叠加 Host、Origin 与 CSRF 校验。没有新增匿名运行时文章端点，读者仍只访问预渲染文件。

读 DTO 与写 DTO 分开。列表 DTO 不带 Markdown 和编辑器 JSON；Admin 详情可以读取完整版本与审计；Public DTO 只沿 `published_version_id` 取内容，不会把较新的自动保存当成公开版本。写请求只接受完整、严格的字段集合，客户端不能提交 `authorId` 或版本类型覆盖服务端判断。

#### 闸门不再扫描 Markdown 原文

第 8.3 节的误拦已经修掉。生产闸门用 Astro 官方 Markdown processor 的 remark 插件读取 mdast `image`/`imageReference` 节点，围栏代码块里的 `![示例](...)` 只是 `code` 节点，不会被当成文章图片。原始 HTML `<img>` 直接拒绝；它还能携带 `srcset` 等额外 URL，拿一条属性正则冒充完整媒体审计反而会留下绕过。

Markdown 解析是异步的，`node:sqlite` 事务是同步的。实现先从不可变版本提取图片引用，再返回一个同步 validator；`ArticleStore.publish/rollback` 仍在事务内、任何写入之前调用它。最终判断会重新读取文章、翻译组和 `media_assets`，所以围栏修复没有把发布闸门挪出事务。

发布候选现在覆盖 `src/content.config.ts` 的全部 14 个 frontmatter 字段，并额外检查 Markdown 正文。媒体闸门同时检查正文图片和封面：引用 alt、数据库 alt、资源是否存在、光栅衍生图的 `sanitized_at`，以及公开 EXIF 白名单。缺失翻译仍然是“不可用”，不会复制别的语言内容补位。

#### 失败验证与精简门禁

测试先在生产处理器与闸门模块不存在时失败。新增 4 个集成用例，尝试用围栏示例触发误拦、用真实缺图和 HTML 图片绕过媒体表、发布超长摘要和未净化/GPS 媒体、匿名读取草稿、缺 CSRF 写入，以及完整走通新建、自动保存、发布和回滚。拒绝发布后，原公开指针与审计行保持不变。

```text
node --test --test-isolation=none tests/*.test.mjs
  -> tests 74 / suites 11 / pass 74 / fail 0
pnpm check
  -> Result (86 files): 0 errors, 0 warnings, 0 hints
pnpm build
  -> 46 个公开页面与文章 API server entry 构建成功
pnpm split
  -> 155 个公开文件不依赖 Node；admin、api 保持按需
```

第一次构建仍被 Windows 沙箱拦在 esbuild 子进程的 `spawn EPERM`；获准在真实环境重跑同一条命令后通过。本轮没有重跑原型 118 例，也没有用 `pnpm verify` 重复执行链接与公开树审计。

#### 仍未做

Admin 仍只有登录页，尚未接文章列表和编辑器；生产同源 renderer、媒体导入、建账户命令、导出构建、备份恢复与部署也未完成。**下一块是 Admin 界面**，它只消费本节已经固定的作者 API，不改变公开路由的渲染方式。

### 21.6 生产 Admin 界面与可信预览（2026-08-30）

第 7 块已经接入生产。`/admin` 现在用 Vue 3 和 Tiptap 提供作者文章列表、新建表单、完整编辑器、版本历史、自动保存、手动保存、发布、回滚和撤下入口。文章身份里的 `translationKey`、`lang`、`slug` 建立后只读；逐版本保存的 11 个 frontmatter 字段与 Markdown 正文全部在界面中可改。列表和编辑器同时显示最新版本、数据库发布指针与静态站上线指针；后两者不一致时明确写“等待导出”，不把它误报成发布失败。

这不是重做原型 B 的界面实验。文章列表、Tiptap 编辑、源节点保真、图片属性、自动保存与版本操作已经在原型里实际走过，本块只把已经定下的行为迁进生产边界。生产根依赖因此精确固定为 `vue@3.5.42`、Tiptap `3.30.5` 的 Vue/Core/PM/StarterKit/Markdown 包，以及隔离解析器需要的 `marked@17.0.6`；没有引入公开站 UI 框架，也没有让这些包进入公开路由。

#### 可信 renderer 与编辑器状态

预览只提交当前 Markdown。服务端从生产 Astro 配置读取 remark/rehype 链，在同一位置加入 Expressive Code，再移除注入的 `style` 与 `script`；浏览器只接收渲染结果，不能提交 HTML。预览路由仍在作者会话、Host、Origin 与 CSRF 守卫之后，返回结果放进不允许脚本的 sandbox iframe，也不保存版本或移动任何公开指针。

编辑器继续使用每实例隔离的 `Marked`，并整体迁入不透明源码节点与真图片节点，没有退回 Tiptap 默认 Markdown 的有损基线。异步挂载时正文先留在待装载状态，编辑器就绪后再写入，避免快请求把正文落在尚不存在的实例上。载入历史版本只把它放进编辑器并标为未保存，不会因这次点击自动生成新版本；从编辑器返回列表前若仍有改动，则先完成一次自动保存，失败时留在当前页。

#### 渲染分裂与验证

Astro 会把按需 Admin 的浏览器 bundle 一并放在 `dist/client/_astro/`。旧检查把“文件存在”当成“公开路由可达”，因此在隔离本来成立时也会误报。`check-render-split` 现在从公开静态 HTML/CSS/JS 出发，按产物里的文件名引用递归求可达集合，只扫描真正能由公开页面加载的资源。负向验证曾临时让公开首页引用 Admin entry，检查当场抓到 `prosemirror` 与 `createApp`；临时改动随后撤销。

```text
pnpm check
  -> Result (97 files): 0 errors, 0 warnings, 0 hints
pnpm test
  -> tests 75 / suites 11 / pass 75 / fail 0
pnpm build
  -> 46 个公开页面、Admin 与 API server entry 构建成功
pnpm split
  -> 158 个公开文件不依赖 Node；156 个公开可达 HTML/CSS/JS 文件不含 Admin 代码
```

测试在 Windows 沙箱里第一次因 Node 测试进程统一 `spawn EPERM` 而未启动；同一条 `pnpm test` 在获准的真实环境重跑后 75/75 通过。构建沿用已经批准的真实环境执行。浏览器只做了登录壳挂载冒烟检查，另用 Vue compiler 检查两份运行时模板；没有重跑原型 118 例，也没有再用 `pnpm verify` 重复链接与公开树审计。

#### 仍未做

图片仍只能填写公开路径，生产媒体导入、净化、manifest 写入和媒体选择器尚未接线。建账户命令、导出构建与原子换站、备份恢复和部署也未完成。**下一块是媒体导入链路**，必须调用现有净化与媒体检查，绝不能读取或改写原图。

### 21.7 媒体导入链路与媒体库（2026-08-30）

第 8 块已经接入生产，B7 那项「不能过」到此修完。此前闸门齐全而导入路径完全不存在：`media_assets` 里不可能出现任何一行，于是任何图片引用都发不出去。现在 `/api/media/` 接收上传，服务端按第 8.1 节的顺序处理——校验格式与尺寸、重新编码、剥离 EXIF/XMP/IPTC、把文件写进 `/var/lib/moriium/media/`、**再从磁盘读回确认**，最后才写 `media_assets` 行。

#### 净化只有一份实现

第 8.1 节要求服务端复用 `scripts/sanitize-media.mjs` 与 `scripts/check-media.mjs`，而不是另写第三份。做法是把两者共有的部分提到 `scripts/lib/media.mjs`：配方、可导入格式、两张元数据块清单、以及那次读回确认。两个命令行脚本现在是它上面的薄壳。

两张清单分开是有理由的。`SENSITIVE_BLOCKS`（exif、xmp、iptc）是绝不能到达读者的东西，公开目录审计按它检查；`STRIPPED_BLOCKS` 另加 icc，只用于确认自己的产物——色彩配置不是隐私，但带着它的衍生图说明那不是这条管线编码出来的，而「这个文件出自我们自己的管线」正是这一步要断言的东西。

三件事承担了这一块的全部保证：

**一、服务端无条件重新编码。**上传的东西按 `AGENTS.md` 本来就该是衍生图而不是原图，但那只是客户端的说法。重编码使这条保证与产生上传的工具无关。

**二、`sanitized_at` 由 store 盖章，不由参数传入。**`MediaStore.recordImported` 是唯一能写非空 `sanitized_at` 的入口，而它在确认之后才被调用。没有任何路径能写出一行「声称净化过而实际没有」的记录。

**三、公开路径由服务端从净化后的字节推导，不接受客户端提出。**目录段与文件名都经过收敛，摘要取自输出字节，所以没有可供过滤的穿越；`fileForPublicPath` 仍然拒绝越出媒体根目录，因为那道防线要对**其他来源**写进来的行也成立。摘要取自输出还有一个副作用：重复导入同一张照片会落在同一路径上，于是与自己那一行冲突，而不是悄悄多出一份副本。

GIF 与 SVG 被明确拒收。缩放会把动图压成第一帧却报告成功，那是无声的内容改动；SVG 是 XML，剥它的元数据和重编码一张位图是两回事，对可以携带脚本的标记做半套处理比直接拒绝更糟。

#### 编辑器不再手打路径

媒体库面板进了编辑器右栏，图片属性面板的路径框改为只读。第 8 节交接里的第 7 条差异（面板不校验路径、没有媒体选择器）到此闭合：产生图片引用的唯一途径是从已净化、已登记的列表里选，而那恰好是闸门会接受的引用。选中图片时再选一张是**替换**而不是新增，所以「换一张」和「插一张」是同一个手势，两个都不打路径。

缩略图走 `/api/media/<id>/file/`，不走 `publicPath`。导入的文件要到下一次导出才进公开目录（第 15.3 节），所以正在插入的那个路径此刻确实解析不了；用作者接口显示文件是对这件事诚实，显示一张坏图并称之为预览不是。该路由需要作者会话，且只能取出 `media_assets` 某一行指名的文件——行集合就是白名单，而不是对作者提交的路径做过滤。

#### 一个第 7 块看不见的缺陷

`trailingSlash: 'always'` 同样作用于 API 路由，而 `src/admin/api.ts` 里 15 处调用全都没写结尾斜杠。Astro 用 404 页面回答了它们全部：**生产 Admin 能挂出登录壳，却永远够不到自己的 API。**上一块的浏览器检查是「登录壳挂载成功」，这句话是真的，也什么都没证明。

修法是客户端补齐斜杠——改 `trailingSlash` 会动到全站公开 URL，不在考虑范围内。`tests/admin-client-routes.test.mjs` 把两半绑在一起：从 `astro.config.mjs` 读出斜杠策略，再从每个 rest 路由文件里读出它自己的路径正则，任何一边单独改动都会红。该用例分别用「少一个斜杠」和「一个路由不接受的动作」验证过会失败。

#### 失败验证

新增 14 个用例。破坏尝试包括：空 alt、空文件、SVG、动图 GIF、非图片字节各自被拒，且拒绝之后既不留行也不留文件；匿名读取媒体、缺 CSRF 的上传、JSON 上传、超限上传各自被拒；构造 `../../etc/passwd.jpg` 作为文件名，确认落点仍在媒体根之内；再用一条实际带 EXIF 与 GPS 的夹具，先断言夹具确实带着 EXIF，再断言 `assertStripped` 会因此报错——只跑过干净输入的确认步骤什么也证明不了。

两次变异验证都做了：让编码器 `keepMetadata()`，剥离相关的四个用例转红；把 gif 与 svg 加进可导入格式，拒收用例转红。两次变异同时施加时后者反而变绿（gif/svg 转出的文件带上了 icc，被另一道检查拦下），所以是分开验证的。

```text
pnpm check                        -> Result (107 files): 0 errors, 0 warnings, 0 hints
pnpm test                         -> tests 89 / suites 17 / pass 89 / fail 0
pnpm build                        -> 46 个公开页面、Admin 与 API server entry 构建成功
pnpm split                        -> 158 个公开文件不依赖 Node；156 个公开可达文件不含 Admin 代码
check-links / audit-public-tree   -> 均通过
```

另用 `astro dev` 起真实运行时逐条验证了 13 条作者 API 路径：全部返回 JSON 而不是 404 页面。**没有做登录后的浏览器验证**——代 Morii 输入口令不是我该做的事，所以面板的渲染依据是处理器层的集成用例，以及三份运行时模板都通过 Vue 编译器。本轮没有重跑原型 118 例。

#### 仍未做

manifest 导出仍未接线：第 8.2 节要求构建时从 `media_assets` 生成，那属于第 10 块（导出 + 构建 + 原子换站）。数据库里可发布的 EXIF 白名单字段目前一律存 `{}`——sharp 只给出原始 EXIF 缓冲区，解析它需要新依赖，要先问 Morii。媒体没有删除入口，也没有「哪些资源没被任何文章引用」的视图。建账户命令、导出构建、备份恢复与部署仍未开始。**下一块是建账户命令**，它只能在服务器上跑；`createAccount` 已经存在且要求显式传入 `now`，命令只是它的外壳。

### 21.8 服务器侧作者账户命令（2026-08-30）

第 9 块已经接入。服务器操作者现在用 `pnpm account:create Morii` 或 `pnpm account:create Enouia` 建立两个既定作者账户；口令不能放在参数里，只能从交互 TTY 隐藏输入并重复确认。命令在第一次读口令前先说明「密码管理器生成、至少 24 位、不得复用」，随后调用现有 `createAccount(db, input, now)`，没有另写哈希、校验或 SQL。数据库路径继续服从 `MORIIUM_DATABASE_PATH`，未设置时沿用生产 `/var/lib/moriium/admin.db` 与 Windows 本地 `.astro/admin.db` 的既定默认值。

停用走 `pnpm account:disable Morii` 或 `pnpm account:disable Enouia`。它只给现有账户写 `disabled_at`；没有删除命令，也没有 role 参数，历史版本与审计引用因此继续成立。整个入口只在 `scripts/`，没有新增 HTTP 路由。

加密文章命令原有的隐藏输入器被抽到 `scripts/lib/hidden-prompt.mjs` 共用。把密码管理器生成的口令整段粘贴进终端时，Node 会把「口令 + 回车」作为一个 `data` 块送入；旧实现把整块当作一个字符，因而不会结束输入。本块先用真实 PTY 与自动化用例复现，再改为逐字符消费输入块。测试同时覆盖成功建号、短口令、两次输入不一致、同名重建、停用后拒绝认证、账户行不删除，以及命令参数与输出都不携带口令。

```text
pnpm verify                    → 退出码 0
  astro check                  → Result (110 files): 0 errors / warnings / hints
  node --test tests/*.test.mjs → tests 95 / suites 18 / pass 95 / fail 0
  astro build                  → 46 个公开页面、Admin 与 API server entry 构建成功
  check-render-split           → 158 个公开文件不依赖 Node；156 个公开可达文件不含 Admin 代码
```

另用真实 PTY 把测试口令与回车一次性粘贴给隐藏输入器，输入正常结束且没有回显。没有在当前开发库创建真实账户，也没有重跑原型 118 例。

#### 仍未做

导出、构建与原子换站仍未接线，`media_assets` manifest 也仍未生成。**下一块是第 10 块**；`markLive()` 只能在新静态站成功换上之后调用，不能把数据库发布成功误当成站点已经上线。

### 21.9 第 10 块第一步：把数据库导出成构建输入（2026-08-30）

第 10 块分三步：**导出**、构建与上线前检查、原子换站与回写 `live_version_id`。这一轮只做第一步，后两步未开始，**因此第 10 块尚未完成**。

导出实现在 `src/server/export/`：`frontmatter.ts` 负责把一个版本还原成 Markdown 文件，`content-export.ts` 是导出本身；命令行入口是 `scripts/export-content.mjs`。

#### 只读已发布指针

`exportPublished()` 逐篇取 `published_version_id`，模块里没有一处调用 `getLatest`。这不是靠约定：自动保存不在这条路径能看见的范围内。用例把「发布后再自动保存」和「发布后回滚」都跑了一遍，导出的都是指针指的那一版。另做过反向验证——把那一行临时改成 `getLatest(article.id)`，两条用例当场红。

导出也**不碰 `live_version_id`**。第 4.2 节的第二步要到静态站真的换上之后才成立，在这里写等于记录一次还没发生的构建。用例断言导出之后 `isAwaitingExport()` 仍然是 true。

#### 失败不动上一份导出

产物落在导出根目录下的三个位置：

```text
<root>/current/     上一次成功的导出，构建的输入
<root>/staging/     正在写的，失败就删掉
<root>/previous/    只在换名的那一瞬存在
```

换站用两次目录改名，中间那一刻旧导出在 `previous/` 里。进程恰好死在这个窗口里时，下一次导出开头的 `recoverInterruptedPromote()` 把它改回 `current/`——中断的代价是重跑一次，不是恢复备份。用例直接构造这个中间态，也构造了上一次失败遗留的 `staging/`，确认它被删掉而不是被复用。

写下去的每个文件都读回来核对：Markdown 比对字符串，图片比对 SHA-256。这条规矩是第 8 块用真实故障换来的（21.7），导出如果默认自己写成功了，就是在另一个地方下同一个注。

#### manifest 与媒体投影

manifest 从 `media_assets` 生成，第 8.2 节那份手写夹具不进生产。**只投影已发布文章真正引用的图片**：正文引用从 remark AST 取（和发布闸门同一个 `imageReferencesIn`，围栏代码块里的示例图片因此不算引用），封面从版本字段取。媒体库里没被任何已发布文章用到的图片留在媒体根目录，不进公开树——这是有意的，媒体库是作者的，导出是读者的。

两道拒绝：引用的行在库里找不到，或者那行的 `sanitized_at` 是 NULL。第二条是重复防守，发布闸门已经挡过一次；用例先正常发布，再把该行的 `sanitized_at` 改回 NULL，导出拒绝，`current/` 完好。删掉磁盘上的图片文件也是同样结果。

manifest 里没有时间戳。同一份数据库状态两次导出产生逐字节相同的目录树，这是「重试导出」这句话能成立的前提，用例逐文件比对了两次导出的字节。

#### frontmatter 用 JSON 字符串

每个字符串标量都用 `JSON.stringify` 写成 YAML 双引号标量。JSON 是 YAML 1.2 的子集，所以带冒号、井号、百分号、引号、换行或中日文的标题都不需要这个模块自己判断该不该加引号——一套加引号的启发式规则，总会栽在第一个以 `- ` 开头的标题上。U+2028 与 U+2029 额外显式转义，因为 YAML 1.1 把它们当换行而 1.2 不当。

正确性不是自证的：用例用 `@astrojs/markdown-remark` 的 `parseFrontmatter` 读回来，那正是 `scripts/validate-content.mjs` 和 Astro 内容加载器用的同一个解析器，不是第二套实现和第一套互相点头。

#### 本轮验证

```text
pnpm verify                    → 退出码 0
  astro check                  → Result (114 files): 0 errors / warnings / hints
  node --test tests/*.test.mjs → tests 111 / suites 21 / pass 111 / fail 0
  astro build                  → 46 个公开页面、Admin 与 API server entry 构建成功
  check-links / audit-public-tree → 均通过
  check-render-split           → 158 个公开文件不依赖 Node；156 个公开可达文件不含 Admin 代码
```

另外跑了一次真实的端到端：在临时数据库里建号、建文章、发布、再自动保存一版，用 `node scripts/export-content.mjs` 导出，产物是已发布那一版而不是自动保存；把导出的文件复制进 `src/content/posts/zh/` 后，`scripts/validate-content.mjs` 通过，`astro build` 生成 `/zh/posts/tide-notes/`，标题为 `潮汐笔记 · Moriium`。核对完即删除该临时文件，仓库内容未改动。

#### 仍未做

- 构建、上线前检查、原子换站、curl 复核与回写 `live_version_id` 都还没有；`markLive()` 至今没有生产调用方；
- manifest 生成了但**还没有消费方**。公开页面目前不读它，图片的 caption、copyright 与宽高仍未从这份数据渲染；
- 导出目录还没有接进构建流程，`src/content/posts/` 与导出目录的双轨切换属于第 15.2 节，未开始；
- ~~`package.json` 没有加 `content:export` 脚本~~ Morii 于 2026-08-30 批准，已加 `pnpm content:export`；
- `.env.example` 增加了 `MORIIUM_CONTENT_ROOT`，因为导出目录必须在 release 目录之外，和数据库、会话、媒体是同一条要求。

### 21.10 第 10 块其余两步：构建、原子换站与回写上线指针（2026-08-30）

第 10 块到此**在代码层面完成**。导出（21.9）之后的全部步骤接进了一个状态机：`src/server/release/release.ts`，命令行入口 `scripts/release-site.mjs`。**这不等于已经上线**——它没有在 VPS 上跑过，systemd、Nginx 与 CI 的改动属于第 12 块。

#### 这一块的全部内容就是顺序

三条规则决定了每一个分支：

1. **换站之前的任何失败都不改变读者看到的东西。**导出、安装、构建、上线前检查失败时，`current` 指向不动，全部 `live_version_id` 不动。
2. **换站是一次 rename。**读者要么解析到旧 release，要么解析到新的，不会解析到不存在的路径。
3. **`live_version_id` 最后写，而且只在运行中的站点应答之后写。**它报告的是一份**正在服务**的构建，不是一份组装好的构建。curl 失败就把链接换回去，什么都不记；数据库仍然说「已发布、等待导出」，后台仍然显示这个差值，同一条命令可以直接再跑一次。

**重试永远不需要作者再点一次发布。**数据库是真相，这只是投影在追赶（第 4.2 节）。用例里就是这么验的：先让 curl 失败，确认 `live_version_id` 仍是 NULL、审计只有一行；再跑一次，文章上线，审计仍然只有一行。

失败信息带上走到了哪一阶段——`stopped after "checked"` 与 `stopped after "switched"` 对运维是两件完全不同的事，前者站没动过，后者要确认链接是否已经换回。没有这个，所有失败从外面看都长一样。

#### 三个副作用被隔在一个 host 后面

跑命令、换符号链接、发 HTTP 请求，这三件单元测试不该真做的事收在 `src/server/release/host.ts` 的 `ReleaseHost` 里。状态机因此可以用假 host 把失败精确放在某一步，其余全部跑真实文件系统：暂存、release 目录复制、可服务性检查、清理都是真的。假构建**读暂存目录里的文章再生成对应页面**——一个不读输入的假构建分不出「暂存成功」和「碰巧」。

代价要写明：真实 host 因此需要自己的用例。`run` 的非零退出与无法启动、`probe` 的 200 与 503 都用真实子进程和真实 `node:http` 服务器验过。**符号链接那条在 Windows 上跳过**（本机 `symlinkSync` 报 EPERM），用例声明跳过原因而不是假装通过；CI 跑 ubuntu，那一条会在 CI 上真正执行。

#### 暂存进 `exported/`，因为双轨还在

导出的文章落在 workspace 的 `src/content/posts/exported/`，不是集合根目录。第 15.2 节的迁移期里仓库自带的文章和导出的文章必须并存，而独占一个目录意味着「清掉上一次导出」就是删掉这个目录，不需要记住上次写了哪些文件。用例特意在暂存目录里放一份上一轮的残留，确认它被删掉而不是留到这一次的构建里。

媒体投影进 `public/media/`，manifest 复制到 `src/generated/`。**manifest 仍然没有消费方**，这一步只是把它放到构建能拿到的地方。

#### 上线前检查多了一条

沿用 CI 现有的四项（三语首页、sitemap、标题、无空 HTML），加上仓库自己的 `check-links`、`audit-public-tree`、`check-render-split` 在 workspace 里跑一遍——这三个已经存在，重写一份等于给同一条规则立两个定义。

新增的一条是：**导出写出的每一篇文章都必须有构建出来的页面。**没有它，构建悄悄丢掉一篇文章（schema 变了、loader 过滤了、改名了）会以 404 的形式上线，而数据库高高兴兴地把它记成 live。用例直接构造这种构建，检查拦住，站没动。

写这一条时发现并修掉了自己的一个问题：拒绝信息里带上了绝对磁盘路径，而 `src/server/errors.ts` 明确要求 `userMessage` 不含路径。改成按用途命名（「the page for zh/tide-notes is missing」），空 HTML 那条报 release 内的相对路径。

#### 清理与撤下

保留最近 6 份，**绝不删正在服务的那一份**，也不删 `releases/` 之外的任何路径——一个信任计算路径的删除操作，就是发布脚本变成事故的方式。

撤下的文章在成功换站后由 `markNotLive()` 清掉 `live_version_id`：站点已经不含它了，留着这个指针就是对一个不存在的页面做出的断言。

#### 本轮验证

```text
pnpm verify                    → 退出码 0
  astro check                  → Result (119 files): 0 errors / warnings / hints
  node --test tests/*.test.mjs → tests 132 / suites 27 / pass 131 / fail 0 / skipped 1
  astro build                  → 46 个公开页面、Admin 与 API server entry 构建成功
  check-links / audit-public-tree → 均通过
  check-render-split           → 158 个公开文件不依赖 Node；156 个公开可达文件不含 Admin 代码
```

那一条 skipped 就是 Windows 上的符号链接换站。

#### 仍未做，且不要当成做过

- **没有在真实 VPS 上跑过一次。**符号链接换站、pnpm 安装与构建、curl 复核在 Linux 上都还没有真实执行过；
- **CI 仍然是旧的那条**（CI 构建 → tar 上传 → VPS 解包）。第 15.2 节把构建迁到 VPS 的改动没有做，因为它连着 systemd 与 Nginx，属于第 12 块，且要先取得 Morii 授权；
- **`.gitignore` 需要 Morii 决定**：`src/content/posts/exported/`、`public/media/`、`src/generated/` 三条。在加上之前，**不要把仓库工作副本当作 release 的 workspace**，否则一次 release 会在工作树里留下未跟踪的暂存内容；
- `package.json` 的两个脚本已由 Morii 于 2026-08-30 批准并加上：`pnpm content:export` 与 `pnpm site:release`，命名沿用既有的 `namespace:verb`；
- manifest 生成了、复制到位了，但公开页面仍然不读它；
- 第 11 块（备份与恢复演练）与第 12 块（部署）未开始。

### 21.11 第 11 块：备份、恢复与演练（2026-08-30）

实现在 `src/server/backup/`：`backup.ts` 在线备份与保留，`restore.ts` 恢复，`media-mirror.ts` 媒体镜像，`schedule.ts` 每小时的调度。演练脚本是 `scripts/restore-drill.mjs`。

#### 备份必须从持有连接的进程里跑

第 11.3 节引的那句 Node 文档是这一块的形状来源：其他连接的写入会让备份**重新开始**。所以 `backupDatabase()` 收的是活的 `DatabaseSync`，不是一个路径——外部 cron 另开连接在作者写作时会永远重启，而且看起来像「正在备份」。

调度因此挂在 `getDatabase()` 上：常驻连接建立的那一刻武装，用的就是那一个连接。不放在某个启动钩子里，是因为那样调度可能先于连接存在，或者在连接之后继续存在。`MORIIUM_DISABLE_BACKUPS=1` 可以关掉，生产不设。

先按官方 API 实测过再写的：`backup(sourceDb, path, { rate, progress })` 返回 Promise，解析为复制的页数，`progress` 回调给 `{ totalPages, remainingPages }`。

#### 写下去的都读回来

和导出、媒体导入同一条规矩。备份先写成 `.partial`，**打开、跑 `integrity_check`、读出 schema 版本与四张表的行数**之后才改名。校验不过就删掉，不占保留窗口里的一格——否则 48 份真备份会悄悄变成 47 份真的加一个假的。

`inspectBackup()` 是恢复和演练共用的那一份判断。它把 SQLite 自己的措辞透出来，因为损坏页会让 `integrity_check` 直接抛错而不是返回一行，「读不出来」和「文件损坏」是两个不同的处置。

#### 恢复：先验证，再动目标

`restoreDatabase()` 先验证备份，再碰目标路径。顺序反过来的话，「发现备份读不出来」这件事会发生在覆盖掉现有数据库之后——一个问题变成两个。

`-wal` 与 `-shm` 在**复制之前**清掉。被替换的那个数据库留下的预写日志，就是同一个文件的第二份互相矛盾的账本。这一步顺带成了唯一可移植的「服务还在跑」信号：Windows 不允许删掉打开着的文件，所以锁住的 `-wal` 就是还在运行的服务，报 `conflict` 而不是 EPERM。Linux 允许删除，**所以「恢复前先停服务」在 Linux 上仍然只是操作规程，代码拦不住**。在任何平台上，对着活进程恢复都是静默损坏。

#### 演练：先让它失败一次

按 ADR 0001 第 5 节。`assertCorruptBackupIsRefused()` 复制一份备份、覆写其中 4096 字节、确认恢复拒绝它；**如果哪天它不再拒绝，演练就停在这里**，而不是继续报一个已经不检查任何东西的检查所用的时间。实测拒绝理由是 `database disk image is malformed`。

演练测的是**实测恢复时间**，不是「演练通过」。本机实测：

```text
node scripts/restore-drill.mjs
  在线备份     18 页；1 篇文章、2 个版本、0 张图片、schema 1
  损坏后拒绝   That backup could not be read: database disk image is malformed
  恢复+读+写   0.01s（RTO 目标 30 分钟）
  媒体镜像     2 张复制、0 张未变、0 张移除
```

这个 0.01s 是本机小数据库的数字，**不是 VPS 上的 RTO**。真实 RTO 要在第 12 块部署之后、在真实数据量与真实停服流程上重测；这里记的是「恢复这条路径能跑通」和当前的量级。

#### 一个跑真服务器才会看见的缺陷

用 `astro dev` 起真实运行时、请求 `/api/articles/` 触发连接建立之后，备份目录里是三个文件：备份本身，加上 `.partial-shm` 与 `.partial-wal`。校验时打开暂存副本会生成这两个 sidecar，改名只带走了主文件。

单看不起眼，按每小时一次算就是每次两个孤儿文件、永不回收——**一个把磁盘塞满的备份系统就是一个停止工作的备份系统**。所有退出路径现在都走同一个清理函数，并有一条用例断言备份目录里只剩备份本身。修完再起一次真服务器复核：目录里只有一个文件。

单元测试都是绿的时候，这个缺陷不存在于任何一条用例里。

#### 本轮验证

```text
pnpm verify                    → 退出码 0
  astro check                  → Result (125 files): 0 errors / warnings / hints
  node --test tests/*.test.mjs → tests 157 / suites 33 / pass 156 / fail 0 / skipped 1
  astro build                  → 46 个公开页面、Admin 与 API server entry 构建成功
  check-links / audit-public-tree → 均通过
  check-render-split           → 158 个公开文件不依赖 Node；156 个公开可达文件不含 Admin 代码
```

跳过的那一条仍是 Windows 上的符号链接换站（第 21.10 节）。`tests/admin-backup.test.mjs` 24 条，覆盖点还包括：备份是时间点副本（之后的写入不在里面）、保留只留最新且绝不删掉刚写的那一份、`.partial` 不被当成备份、不是数据库的文件被拒、没有迁移记录的数据库被拒、恢复拒绝覆盖未明示的目标、恢复在动目标之前就拒绝损坏备份、镜像跳过未变文件并重传同尺寸但内容变了的文件、调度失败只记录不抛出。

最后一条是有意的：**备份失败不能把后台带下去**。磁盘满了导致作者打不开写作界面，是把备份问题升级成了停站。

#### 仍未做

- **异地副本没有做。**第 11.2 节要求每日异地，现在只有本机镜像。同一块磁盘上的第二份只挡误删，不挡磁盘故障。传输属于第 12 块；
- 每小时调度已经武装并实测过一次立即备份，**但没有观察过跨越一小时的连续运行**；
- 第 12.1 节那个后台状态面板还没接。`backupStatus()` 已经把数据准备好了（上次成功、上次失败、最近一份的年龄），没有消费方——**Morii 决定不做告警，所以在面板接上之前，备份失败是完全看不见的**；
- 会话不备份，源码不备份，与第 11.2 节一致；
- `package.json` 没有加演练脚本的入口，要先问 Morii；当前用 `node scripts/restore-drill.mjs`；
- 真实 RTO 未在 VPS 上实测。
