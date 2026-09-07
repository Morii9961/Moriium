# 交接：Phase 6A 本地收尾与验证

> 日期：2026 年 9 月 1 日
>
> 交给：Claude
>
> 目标：VPS 购置前，补齐本地仍能取得的后端证据
>
> 停止点：三个工作包完成、验证结果写回文档后停下，不进入公开站重做，也不模拟 VPS 验收

## 给 Claude 的启动提示

先完整阅读仓库根目录的 `AGENTS.md`，再读本文、`docs/adr-0002-phase5-production.md` 第 21.9 至 21.22 节、`docs/vps-acceptance-checklist.md` 的 E 节，以及 `docs/deployment.md` 的发布与恢复部分。

当前有人在 `codex/frontend-design-rebuild` 上进行未提交的公开站重做。不要在那棵工作树里切分支、还原文件、清理目录或运行会覆盖生成内容的发布命令。开始前重新检查 Git 状态，从当时同步后的 `main` 建立独立 worktree，再做本交接。2026 年 9 月 1 日记录的 `main` 是 `b607ea4`，这个提交号只用于核对，不代替开工时的重新检查。

本轮只做三件事：补齐运维面板的验收合同；用隔离数据跑一遍生产 Admin 的浏览器流程；在一次性工作区彩排发布状态机。不要碰公开站视觉文件，不要迁移正式内容，不要读取 `.private/posts/`，不要使用真实作者口令、默认数据库或原始照片。没有 Morii 当轮的明确授权，不提交、不推送、不部署。

## 一、开工边界

### 1. 独立工作区

这项工作必须从干净、同步的 `main` 开始，使用单独 worktree。当前公开站重做涉及布局、页面、样式和公共页面测试，本轮不得改动这些文件：

- `src/layouts/`
- `src/pages/[lang]/` 下的公开路由
- 公开站样式文件
- `tests/about.test.mjs`、`tests/archive.test.mjs`、`tests/article.test.mjs`、`tests/categories.test.mjs`、`tests/design-fonts.test.mjs`、`tests/tags.test.mjs`

如果后端工作确实需要改公共文件，先停下，把原因和最小改动面报告给 Morii，不要自行跨过边界。

### 2. 数据隔离

所有运行态路径都要落在本轮新建的一次性目录中，并在执行前打印解析后的绝对路径供人工确认：

- `MORIIUM_DATABASE_PATH`
- `MORIIUM_SESSION_DIRECTORY`
- `MORIIUM_BACKUP_ROOT`
- `MORIIUM_MEDIA_ROOT`
- `MORIIUM_CONTENT_ROOT`
- `MORIIUM_RELEASE_ROOT`

这些路径不得指向仓库默认的 `.astro/admin.db`，也不得指向未来生产目录。测试账户只能是临时 fixture 账户；密码不得出现在命令参数、日志、截图、测试报告或 Markdown 中。账户创建仍走服务端函数或现有隐藏输入命令，不得新增账户创建 API，也不得新增 `--password` 参数。

`MORIIUM_PROBE_URL` 只能指向本轮临时启动的本地静态服务。发布命令的 `--workspace` 也必须显式指向一次性 workspace，不能依赖默认值。

媒体测试只使用脚本生成的虚构 JPEG。不得读取原图，也不得从现有照片中复制 EXIF。发布彩排只使用固定白名单里的 fixture/测试文章，不能读取或导入正式文章和受保护文章。

### 3. 不属于本轮的工作

以下事项必须留到真实 VPS，不能用本机结果代替：

- systemd、Nginx、fail2ban 的安装与运行证据；
- TLS、临时域名和主域名切换；
- 异地备份传输、30 天保留和媒体每日同步；
- 从异地副本计时恢复，以及 RTO/RPO；
- `DEPLOY_ENABLED=true`；
- 正式内容迁移和真实作者账户验收。

本轮也不引入告警服务、读者行为分析、读者账户、公开 SSR 或新的 Admin 功能。

## 二、工作包 A：运维面板合同收尾

### 当前事实

面板已经存在，不是「尚未实现」。现有入口是：

- `src/admin/App.ts`
- `src/admin/api.ts`
- `src/pages/api/status.ts`
- `src/server/http/status-handlers.ts`
- `src/server/status.ts`
- `tests/admin-status.test.mjs`

它会显示本机备份、等待上线的文章、磁盘空间、异地副本和服务健康。当前代码只有 `ok`、`attention`、`unknown` 三种 verdict，响应只有全局 `checkedAt`；这还没有满足验收清单 E1 至 E4。2026 年 8 月 31 日，运维状态、部署合同和备份恢复三组专项曾以 `--test-isolation=none` 跑到 23/23。这个结果只说明旧实现没有测试失败，不说明四态合同已经完成。

### 要完成的合同

五个观测项必须明确落入四种状态之一：

| 状态 | 含义 | 本轮最低例子 |
| --- | --- | --- |
| `ok` | 读数新鲜，且没有接近阈值 | 一小时内有成功备份；没有文章等待上线；磁盘至少剩余 4 GiB |
| `attention` | 读数新鲜，尚未越线，但需要留意 | 备份距今一至两小时；文章已发布但等待上线不超过 15 分钟；磁盘剩余 2 至 4 GiB；首次备份仍在进行 |
| `failure` | 已知读数越过失败线，或已知任务停止/失败 | 备份超过两小时、调度器停止或最近一次备份失败；等待上线超过 15 分钟；磁盘低于 2 GiB |
| `unknown` | 没有可信的新鲜读数 | 目录不可读；本机拿不到异地副本或外部服务健康读数；面板采集本身出错 |

4 GiB 是本轮给「接近 2 GiB 失败线」设定的预警线，不是 VPS 采购规格。实现后把它写成命名常量和测试，不要把数字散落在模板里。

每一项都要带自己的观测时间，不能只依赖响应顶层时间。允许保留顶层 `checkedAt`，但 UI 必须让作者看得出每项读数是什么时候取得的。没有读数时要明确显示「暂无读数」和本次检查时间，不能伪造一个观测时间。

如果实现引入可缓存或外部注入的读数，测试必须证明读数过期后自动变成 `unknown`。异地副本和外部服务健康在本机仍应保持 `unknown`，不要为了让测试变绿而制造「正常」结果。

### 必测场景

服务端纯逻辑至少覆盖：

1. 五个观测项都存在，且 verdict 只能是四态之一；
2. 新鲜、预警、失败和未知各有真实用例；
3. 备份不存在、首次备份进行中、调度器停止、备份过期、最近一次失败分别得到正确状态；
4. 文章没有等待、等待不超过 15 分钟、等待超过 15 分钟分别得到正确状态；
5. 磁盘正常、接近阈值、越过失败线、读数失败分别得到正确状态；
6. 异地副本和服务健康在没有外部采集器时为 `unknown`；
7. 每项时间字段格式正确；需要 freshness 的读数过期后变成 `unknown`；
8. `/api/status/` 仍要求作者会话，匿名请求返回 401；
9. 状态接口和面板不含访问者、浏览量、IP、User-Agent 等读者数据。

Admin 客户端至少覆盖：

1. 四种状态都有独立、可读的文案和样式；
2. `unknown` 不能复用正常颜色或正常标签；
3. 面板请求失败时显示一条 `unknown`，页面不空白、不崩溃；
4. 每项显示自己的时间或「暂无读数」；
5. 「重新检查」期间按钮状态正确，重复点击不会产生难以解释的并发结果；
6. 客户端继续请求带尾斜杠的 `/api/status/`。

### 文档回写

代码通过后同步修正：

- `docs/vps-acceptance-checklist.md` 第 128、155、169 行附近的过期描述；
- `docs/enouia-todo.md` 第 105 行附近的 Phase 6A 状态；
- 在 `docs/adr-0002-phase5-production.md` 追加一段新的执行记录，说明四态阈值、时间语义、测试证据和仍为 `unknown` 的两项。

不要把 E 节标成 VPS 已验收。这里完成的是仓库和本地证据，VPS 上的读数仍然没有发生。

## 三、工作包 B：生产 Admin 的本地浏览器验收

### 目标

现有测试覆盖认证、CSRF、文章事务、媒体净化、发布回滚和客户端错误文案，但还没有证明一个真实浏览器能从登录页走完整个作者流程。本轮补的是这层证据，不是重复写 API 单元测试。

仓库目前没有 Playwright 依赖。优先使用 Claude 当时可用的浏览器控制能力做一次可复核的人工 E2E，不要为了这一轮直接增加大型浏览器依赖。如果必须增加自动化框架，先停下，单独向 Morii 说明新增依赖、锁文件变化、浏览器下载体积和维护成本，经批准后再做。

Astro 会话 cookie 在生产配置中固定为 `secure: true`。本地验收不得为了方便把生产 cookie 改成不安全。开始浏览器测试前，先确定一个只用于测试的 HTTPS 入口，或一个不会改变生产配置的隔离方案；方案和实际访问地址要写进验收记录。若环境无法安全承载 cookie，明确报告阻塞，不能把「Admin 外壳能打开」写成登录成功。

### 浏览器场景

按下面顺序跑，并记录每一步的可见结果。截图不得包含密码、cookie、CSRF token、完整请求头或本机私密路径。

1. 匿名访问 `/admin/`，看到登录界面，不能读取文章列表、单篇草稿、预览或媒体库；
2. 错误密码得到统一、可读的拒绝，不泄漏账户是否存在；
3. fixture 作者登录成功，刷新页面后会话仍成立；
4. 新建一篇 fixture 文章，确认 slug、语言和 `translationKey` 保存正确；需要验证翻译关系时，只使用现有的多语 fixture，不复制正文，也不生成占位翻译；
5. 修改标题、frontmatter 和 Markdown，确认自动保存只追加版本，不改变已发布/已上线指针；
6. 打开可信预览，确认预览使用生产 renderer，未保存内容不会意外写入数据库；
7. 显式发布，看到「已发布、等待上线」而不是「已上线」；
8. 回滚到旧版本，再撤下文章，三个状态和审计记录符合实际；
9. 导入脚本生成的虚构 JPEG，确认 UI 显示净化后的资源；拒绝路径不得留下数据库行或文件；
10. 打开运维面板，确认四态、时间和重新检查行为；本机拿不到的异地副本/服务健康必须显示 `unknown`；
11. 模拟 API 断开、会话过期和一个服务端拒绝，页面显示上下文错误，不出现 `TypeError: Failed to fetch`，也不把失败画成成功；
12. 退出登录后，浏览器返回匿名状态，后退或刷新都不能重新看到草稿数据。

不要用正式账户做登录限速演练。若要通过浏览器观察限速，只能使用专用 fixture 账户，并在独立数据库中完成。

### 证据要求

浏览器验收记录至少包括：

- 启动方式和隔离路径，但不包含秘密；
- 浏览器、Node 和 pnpm 版本；
- 每个场景的通过/未通过；
- 必要的无秘密截图；
- 对应数据库指针与审计事实的只读核对；
- 结束后确认临时服务已停、一次性目录可安全清理；默认数据库原本不存在时不得被创建，原本存在时用执行前后的哈希和修改时间证明它没有被改动。

## 四、工作包 C：隔离的本地发布彩排

### 为什么还要跑

`tests/admin-release.test.mjs` 已经覆盖发布状态机的成功、构建失败、上线前检查失败、探测失败回滚、重试、撤下和保留策略。它使用 fake host 钉住了顺序，但还缺一次把真实导出、真实 Astro 构建和真实静态服务串起来的本地彩排。

### 运行边界

发布状态机会替换 workspace 内的以下生成目录：

- `src/content/posts/exported/`
- `public/media/`
- `src/generated/`
- `dist/`

因此绝不能把发布彩排指向当前公开站工作树，也不要直接指向本轮写代码的 worktree。另建一次性 workspace 副本和 release root，执行前解析并检查所有绝对路径。任何一个路径落到原仓库、默认 `.astro` 或 `/var/www/moriium`，立即停止。

本轮不要顺手决定 `.gitignore`。一次性 workspace 可以避免生成文件污染；是否忽略这三个目录仍留给 Morii 单独决定。

### 彩排内容

1. 在隔离数据库中导入白名单 fixture，选一篇完成发布；
2. 启动只服务临时 `current` 输出的本地静态服务器，得到明确的 probe URL；
3. 使用一次性 `MORIIUM_*` 路径运行真实导出、真实构建、公开检查和发布命令；
4. 确认三语首页与被发布文章返回 200，`current` 指向新 release，随后才回写 `live_version_id`；
5. 撤下文章后再跑一次，确认页面消失且 live 指针清空；
6. 人为制造一次构建前失败或上线前检查失败，确认 `current` 和所有 live 指针不动；
7. 人为让 probe 返回非 2xx，确认能恢复上一个 release，并且不记录新的 live 指针；
8. 不重新发布数据库内容，直接重跑失败的同一状态，确认可以成功追平；
9. 以临时 `keep` 值验证保留策略，当前正在服务的 release 不得被删除；
10. 停掉 Admin/Node 进程后，仅用静态服务器访问 `/zh/`、`/ja/`、`/en/` 和 sitemap，确认读者路径不依赖数据库。

Windows 可能因为符号链接权限无法取得「真实原子换链」证据。若发生这种情况，保留已有 fake-host 顺序测试，并把该项标成环境未验证；不要把实现改成复制目录，也不要降低 Linux 上的原子切换合同。只有现成的 WSL 环境能在不碰用户其他数据的前提下安全运行时，才可以补一遍 Linux 本地证据；否则留到影子 VPS。

## 五、验证顺序

不要每改一个小文件就重复全套门禁。先跑最窄的变更面，三个工作包都稳定后再跑一次组合验证。

### 工作包 A

```text
node --test --test-isolation=none tests/admin-status.test.mjs
```

### 工作包 B 相关回归

```text
node --test --test-isolation=none \
  tests/admin-auth.test.mjs \
  tests/admin-articles-api.test.mjs \
  tests/admin-media.test.mjs \
  tests/admin-client-failures.test.mjs \
  tests/admin-client-routes.test.mjs
```

PowerShell 下不要照抄反斜杠续行，按当前 shell 改成一行或使用正确的 PowerShell 续行语法。

### 工作包 C

```text
node --test --test-isolation=none \
  tests/admin-export.test.mjs \
  tests/admin-release.test.mjs \
  tests/deployment-contract.test.mjs \
  tests/admin-backup.test.mjs
```

### 本轮组合验证

至少运行：

```text
pnpm check
node --test --test-isolation=none tests/*.test.mjs
pnpm build
pnpm links
pnpm audit
pnpm split
pnpm baseline
```

如果 `pnpm audit` 不是 `package.json` 中的脚本，以当前仓库实际命令 `node scripts/audit-public-tree.mjs` 为准，不要为了清单新增同名脚本。

Windows 沙箱若出现 `spawn EPERM`、临时 SQLite `EPERM` 或符号链接 skip，要把「环境未执行」与「断言失败」分开记录。`--test-isolation=none` 是本地诊断方式，不等于 VPS 证据。

## 六、完成标准与交还格式

三个工作包都必须有代码/行为证据和文档记录，不能只说「测试通过」。交还 Morii 时按以下顺序写：

1. 改了哪些文件，每个文件为什么改；
2. 运维面板四态、阈值和时间字段最后怎么定义；
3. 浏览器十二个场景逐条结果；
4. 发布彩排十个场景逐条结果；
5. 实际运行的命令、通过数、失败数、skip 数和退出码；
6. 哪些是本地证据，哪些仍然必须等 VPS；
7. 当前分支、工作树是否干净、是否有提交、是否推送；
8. 若存在阻塞，给出复现条件和下一入口，不要用「基本完成」代替失败项。

完成后更新 `docs/handoff-claude-phase6-production.md`，使它与当前代码和证据一致。不要改写公开站设计交接，也不要宣称已经可以切换主域名。
