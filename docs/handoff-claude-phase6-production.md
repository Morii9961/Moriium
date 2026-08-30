# 交接给 Claude：Phase 6A 生产后端，12/12（仓库侧）

> 日期：2026-08-30
> 交出方：Enouia（Codex）
> 接手方：Claude
> 当前结论：**十二块的仓库侧实现已经接通；第 10 块由 Claude 提交到 `origin/main`，第 11、12 块仍是当前工作树里尚未提交的 Codex 改动。systemd、Nginx、fail2ban 与 VPS 构建链路只是配置和代码，尚未安装、部署或取得真实 VPS 证据。**

这是一份反向交接。Claude 已把第 10 块拆成三个提交推到 `main`，Codex 随后接通第 11 块的在线备份与恢复演练，以及第 12 块的部署配置与运行手册。[`handoff-codex-phase6-production.md`](handoff-codex-phase6-production.md) 保留前九块的详细实施记录，本文件写重新接手时真正需要的当前状态。

## 1. 接手时先确认

```bash
git fetch origin
git status --short --branch
git log --oneline -12
```

当前已知：`main` 与 `origin/main` 都在 `5c874ca`；工作区**不干净**。第 11、12 块改动与另一组「版心」设计研究并存，后者包含 `package.json`、`pnpm-lock.yaml`、`src/data/hanshin.ts`、`src/layouts/Hanshin*.astro`、`src/pages/design/hanshin/`、`src/styles/hanshin.css` 与 `src/utils/hanshin.ts`。先确认归属，不要覆盖、重排或把三组变化混成一个提交。

必读顺序：

1. [`AGENTS.md`](../AGENTS.md)：当前唯一有约束力的项目合同；
2. [`adr-0002-phase5-production.md`](adr-0002-phase5-production.md)：第 4.2、8.2、11、15、21.1–21.12 节；
3. [`handoff-codex-phase6-production.md`](handoff-codex-phase6-production.md)：前九块实现的详细文件、测试和陷阱；
4. [`enouia-todo.md`](enouia-todo.md)：当前工作单；
5. [`deployment.md`](deployment.md)：新的部署、回滚与恢复合同；其中所有 VPS 命令仍待真实执行。

## 2. 当前提交链

最近与生产 Admin 直接相关的提交如下：

```text
5c874ca  Give the export and the release their own pnpm commands
f86827c  Build, switch, and record a release as one retryable sequence
0473609  Export published articles as build input
37af11d  Hand Phase 6 production back to Claude
978540a  Manage production author accounts
1058793  Hand block 9 over to Codex with the media surface written down
32a0c9d  Record the media import block and the route defect it uncovered
d8274d4  Pick images from the media library instead of typing paths
0f4b36a  Import media through a sanitizer that re-reads its own output
ae22b72  Add the production author editor
984def8  Prepare the production author editor runtime
1970ebb  Add the production article API and publish gate
311777d  Share the author API request boundary
1218bf4  Add production author sessions and login
```

本报告另有一个纯文档提交，位于这条链最上方。不要因为交接文件没有写自己的 hash 而改写提交。

## 3. 十二块进度

| 块 | 状态 | 主要记录 |
| --- | --- | --- |
| 1. 公开静态、Admin/API 按需 | 完成 | ADR 21.1 |
| 2. 生产 schema 与迁移器 | 完成 | ADR 21.2 |
| 3. Morii、Enouia 两个账户 | 完成 | ADR 21.2 |
| 4. 文章与版本状态机 | 完成 | ADR 21.3 |
| 5. 会话、登录与限速 | 完成 | ADR 21.4 |
| 6. 作者 API 与发布闸门 | 完成 | ADR 21.5 |
| 7. 生产 Admin 与可信预览 | 完成 | ADR 21.6 |
| 8. 媒体导入与媒体库 | 完成 | ADR 21.7 |
| 9. 建立、停用作者账户命令 | 完成 | ADR 21.8 |
| 10. 导出、构建、原子换站 | 代码完成，未上 VPS | ADR 21.9、21.10 |
| 11. 备份与恢复演练 | 代码完成，异地/VPS 实测待部署 | ADR 21.11 |
| 12. systemd、Nginx 与部署 | 仓库侧完成，未部署 | ADR 15、21.12 |

现在的“仓库侧已接通”包括：正规建号、登录、文章列表、新建与编辑、自动保存、生产渲染预览、媒体净化与插入、发布、回滚、撤下、导出、构建换站、每小时数据库备份、隔离恢复演练，以及 systemd、Nginx、fail2ban 与 CI 源码部署链路。它还不是“已经上线”：后三块都没有真实 VPS 证据。

## 4. 已固定的生产合同

### 4.1 公开读者路径保持静态

`output` 仍是 `static`。公开首页、文章、归档、分类、标签、RSS、Sitemap 和搜索索引全部预渲染；只有 `/admin/*` 与 `/api/*` 进入 Node。`scripts/check-render-split.mjs` 会从公开 HTML/CSS/JS 递归求可达资源，阻止 Vue、Tiptap、ProseMirror 或 `node:sqlite` 混进读者 bundle。

### 4.2 发布与上线是两个指针

作者发布只切换 `published_version_id` 并写审计。静态站成功换上之后才能调用 `markLive()` 写 `live_version_id`。构建、检查或换链接失败时，旧 `current` 必须继续服务，数据库发布状态也不能回滚；后台把两者不一致显示为“等待导出”。

### 4.3 Markdown 是真源

数据库保存完整 frontmatter 与 Markdown，Tiptap JSON 只是编辑状态。生产编辑器带有隔离 `Marked`、源码节点和真图片节点；不要退回 Tiptap 默认 Markdown 序列化，也不要把编辑器 JSON 暴露成 Public DTO。

### 4.4 数据永远不进 release

数据库、会话、净化媒体、导出内容和备份固定在 `/var/lib/moriium/`。`releases/` 是可删除的不可变产物，只保留最近 6 份。原图、`.private/posts/` 明文和真实口令都不在本阶段可读范围内。

## 5. 最近两块最容易踩错的地方

### 媒体

- 上传只接受衍生图，但服务端仍无条件重新编码并从磁盘读回检查；确认干净后才写 `media_assets`。
- 公开路径由净化后字节推导，客户端不能指定。GIF 与 SVG 明确拒收。
- 编辑器不再手填图片路径，只能从作者媒体库选择。
- 缩略图走受保护的 `/api/media/<id>/file/`，因为新媒体在下一次导出前还不在公开站。
- `media_assets` manifest 已由第 10 块从数据库生成并复制进构建输入，但公开页面还没有消费它。

### 账户

- `pnpm account:create Morii` / `Enouia` 从隐藏 TTY 读两次口令，不接受口令参数。
- `pnpm account:disable Morii` / `Enouia` 只写 `disabled_at`，不删除账户，不破坏版本与审计引用。
- 只允许这两个名字，不增加 role，也没有 HTTP 建号入口。
- 隐藏输入器已经修正密码管理器把“口令 + 回车”一次性交付的问题；不要改回按整个 `data` 块处理。

另有一处已经修过、不能复发的路由问题：项目使用 `trailingSlash: 'always'`，Admin 作者 API 必须带末尾斜杠。第 7 块最初只证明登录壳能挂载，第 8 块才发现所有作者 API 都返回 404；`tests/admin-client-routes.test.mjs` 现在负责钉住两边的合同。

## 6. 第 10–12 块结果与部署边界

第 10 块已经实现为完整的可重试状态机，不是若干 shell 命令的串联。实际序列是：

1. 从数据库的 `published_version_id` 导出公开文章，不能读取最新自动保存；
2. 从 `media_assets` 生成生产 manifest，并把已登记的净化媒体投影到构建输入；
3. 把导出的 Markdown 写到 `/var/lib/moriium/content/`，再复制进 VPS workspace；
4. 在 workspace 运行冻结 lockfile 安装和 Astro 构建，产物进入新的不可变 release；
5. 跑三语首页、Sitemap、标题、空 HTML、链接、公开树与渲染分裂检查；
6. 原子替换 `/var/www/moriium/current`；
7. 本地 curl `/zh/`，失败就恢复上一条链接；
8. 只有换站和 curl 都成功后，才把本次导出的各文章版本写入 `live_version_id`；
9. 保留最近 6 份 release。

用例覆盖了失败顺序，而不仅是成功路径：

- 导出失败、构建失败、上线前检查失败时，`current` 与全部 `live_version_id` 不变；
- 原子换链成功但 curl 失败时，恢复旧链接，`live_version_id` 不变；
- 同一个已发布状态可以重试，不要求作者再次点击发布；
- 构建只读数据库发布指针，任何自动保存都不能混入公开文件、RSS、Sitemap 或搜索索引；
- manifest 来自数据库，不能回到手写 JSON；
- Node 停止时，新 release 的全部公开路由仍可由 Nginx 静态提供。

第 11 块新增 `src/server/backup/` 与 `scripts/drill-database-restore.mjs`。常驻 `getDatabase()` 连接启动时立即备份一次，之后每小时一次；每份先写 staging、只读重开跑 `PRAGMA integrity_check`，再晋升并只保留最新 48 份。恢复演练先证明损坏数据库会被拒绝，再在干净副本上完成读取、持久写入、关闭重开与计时。它故意没有替换生产库的入口。

第 12 块把 `deploy/systemd/`、`deploy/fail2ban/`、Nginx 反代、CI 源码包与 `deploy/bin/deploy-code.sh` 补齐。代码部署和内容发布共用 `/var/www/moriium/release.lock`；部署驱动先停 Node，再替换 workspace。静态换站成功后若 Node 起不来，公开站继续服务，工作流明确失败，不把 L1 回退伪装成整次成功。`docs/deployment.md` 已改为首装、验收、回滚与恢复手册，并明确作者发布目前仍要由运维触发 release。

第 12 块没有替 Morii 选择异地存储，也没有连接 VPS、安装配置、打开 `DEPLOY_ENABLED` 或执行恢复演练。数据库每日异地保留 30 天、媒体每日同步、真实 RTO 和上线后 fail2ban 阈值调优仍需真实目标与日志。

## 7. 验证基线与残余风险

第 10 块提交前记录的最近一次完整生产门禁：

```text
pnpm verify                    -> exit 0
astro check                    -> 119 files, 0 diagnostics
node --test tests/*.test.mjs   -> 132 tests, 27 suites, 131 pass, 0 fail, 1 Windows symlink skip
astro build                    -> 46 public pages plus Admin/API server entry
check-render-split             -> 158 public files; 156 public-reachable assets contain no Admin code
```

第 11 块本轮新证据：`tests/admin-backup.test.mjs` 7/7 通过。全套 Node 测试在沙箱外重跑后是 140 例、139 通过、0 失败、1 个 Windows symlink 跳过；`pnpm build`、`pnpm run audit` 与 `pnpm split` 通过。全量门禁仍没有伪造成功：`pnpm check` 被并行「版心」页面的 4 个类型错误和 1 个未使用导入挡住，`pnpm links` 也被那组页面尚未建立的说明页与文章页挡住。详见 ADR 21.11。

第 12 块新增的部署契约用例 5/5 通过，覆盖静态根、两条反代、回环监听、systemd 写入边界、fail2ban 正反样本、源码归档和发布锁。`deploy-code.sh` 另用 Git Bash `bash -n` 在沙箱外通过语法检查；`git diff --check` 没有空白错误。完整门禁仍要等版心工作解开，不能把专项通过写成 `pnpm verify` 通过。

还没有完成或不能声称完成的部分：

- 没有用 Morii 的真实口令做登录后浏览器端到端验证；
- 没有把正式文章迁入数据库；
- 没有媒体删除与未引用资源视图；
- `exif_json` 当前一律是 `{}`，若要解析并保留可公开相机字段，需要新依赖和 Morii 授权；
- 自动保存失败后不会自行退避重试，作者停手时不会再次尝试；
- SQLite 本地在线备份与隔离恢复已经演练；数据库异地传输、媒体每日同步和真实 VPS RTO 尚未演练；
- 第 12 块配置已写入仓库，但没有安装到 VPS，fail2ban 启动阈值也没有真实日志校准；
- Admin 只显示“等待导出”，还没有经过单独评审的自动构建或重试入口；
- 原型 B 的 118 例没有在最近生产块中重复运行，原型只作历史参考。

## 8. 交接边界

当前工作树里有第 11 块、第 12 块和「版心」三组变化，全量 `pnpm check` 仍被版心文件挡住。先按归属完成各自门禁，提交时也要拆成小的逻辑块。不要迁移正式内容，不要连接 VPS、部署、提交或推送，除非 Morii 在当轮明确授权。
