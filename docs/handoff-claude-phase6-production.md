# 交接给 Claude：Phase 6A 生产后端，9/12

> 日期：2026-08-30
> 交出方：Enouia（Codex）
> 接手方：Claude
> 当前结论：**生产后端 12 块已完成 9 块。`main` 的当前提交随本报告一并推到 `origin/main`；下一块是导出、构建与原子换站。**

这是一份反向交接。Claude 之前交出的生产后端基础已经由 Enouia 继续推进到第 9 块；[`handoff-codex-phase6-production.md`](handoff-codex-phase6-production.md) 保留完整实施记录，本文件只写 Claude 重新接手时真正需要的当前状态。

## 1. 接手时先确认

```bash
git fetch origin
git status --short --branch
git log --oneline -12
```

预期：`main` 与 `origin/main` 一致，工作区干净。若结果不同，先停下来确认新增改动的归属，不要覆盖或重排历史。

必读顺序：

1. [`AGENTS.md`](../AGENTS.md)：当前唯一有约束力的项目合同；
2. [`adr-0002-phase5-production.md`](adr-0002-phase5-production.md)：第 4.2、8.2、15.1–15.3、21.1–21.8 节；
3. [`handoff-codex-phase6-production.md`](handoff-codex-phase6-production.md)：九块实现的详细文件、测试和陷阱；
4. [`enouia-todo.md`](enouia-todo.md)：当前工作单；
5. [`deployment.md`](deployment.md)：仍描述旧的纯静态发布，**不能当作已完成的新部署合同**。

## 2. 当前提交链

最近与生产 Admin 直接相关的提交如下：

```text
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
| 10. 导出、构建、原子换站 | **下一块** | ADR 4.2、8.2、15.3 |
| 11. 备份与恢复演练 | 未开始 | ADR 11 |
| 12. systemd、Nginx 与部署 | 未开始 | ADR 15 |

现在的“本机能用”包括：正规建号、登录、文章列表、新建与编辑、自动保存、生产渲染预览、媒体净化与插入、发布、回滚和撤下。它还不是“已经上线”；第 10–12 块没有完成前，不要使用上线措辞。

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
- `media_assets` manifest 还没有导出；这是第 10 块的工作。

### 账户

- `pnpm account:create Morii` / `Enouia` 从隐藏 TTY 读两次口令，不接受口令参数。
- `pnpm account:disable Morii` / `Enouia` 只写 `disabled_at`，不删除账户，不破坏版本与审计引用。
- 只允许这两个名字，不增加 role，也没有 HTTP 建号入口。
- 隐藏输入器已经修正密码管理器把“口令 + 回车”一次性交付的问题；不要改回按整个 `data` 块处理。

另有一处已经修过、不能复发的路由问题：项目使用 `trailingSlash: 'always'`，Admin 作者 API 必须带末尾斜杠。第 7 块最初只证明登录壳能挂载，第 8 块才发现所有作者 API 都返回 404；`tests/admin-client-routes.test.mjs` 现在负责钉住两边的合同。

## 6. 第 10 块：导出、构建与原子换站

这一块应当是一个完整的可重试状态机，不是把若干 shell 命令串起来就结束。既定序列是：

1. 从数据库的 `published_version_id` 导出公开文章，不能读取最新自动保存；
2. 从 `media_assets` 生成生产 manifest，并把已登记的净化媒体投影到构建输入；
3. 把导出的 Markdown 写到 `/var/lib/moriium/content/`，再复制进 VPS workspace；
4. 在 workspace 运行冻结 lockfile 安装和 Astro 构建，产物进入新的不可变 release；
5. 跑三语首页、Sitemap、标题、空 HTML、链接、公开树与渲染分裂检查；
6. 原子替换 `/var/www/moriium/current`；
7. 本地 curl `/zh/`，失败就恢复上一条链接；
8. 只有换站和 curl 都成功后，才把本次导出的各文章版本写入 `live_version_id`；
9. 保留最近 6 份 release。

最低验收必须覆盖失败顺序，而不仅是成功路径：

- 导出失败、构建失败、上线前检查失败时，`current` 与全部 `live_version_id` 不变；
- 原子换链成功但 curl 失败时，恢复旧链接，`live_version_id` 不变；
- 同一个已发布状态可以重试，不要求作者再次点击发布；
- 构建只读数据库发布指针，任何自动保存都不能混入公开文件、RSS、Sitemap 或搜索索引；
- manifest 来自数据库，不能回到手写 JSON；
- Node 停止时，新 release 的全部公开路由仍可由 Nginx 静态提供。

第 10 块会开始触碰部署输入面。若要新增依赖、修改 `deploy/**`、工作流或根配置，按 `AGENTS.md` 先取得 Morii 授权；不要把第 12 块的 systemd/Nginx 部署顺手混进来。

## 7. 验证基线与残余风险

第 9 块提交前记录的完整生产门禁：

```text
pnpm verify                    -> exit 0
astro check                    -> 110 files, 0 diagnostics
node --test tests/*.test.mjs   -> 95 tests, 18 suites, 95 pass, 0 fail
astro build                    -> 46 public pages plus Admin/API server entry
check-render-split             -> 158 public files; 156 public-reachable assets contain no Admin code
```

还没有完成或不能声称完成的部分：

- 没有用 Morii 的真实口令做登录后浏览器端到端验证；
- 没有把正式文章迁入数据库；
- 没有媒体删除与未引用资源视图；
- `exif_json` 当前一律是 `{}`，若要解析并保留可公开相机字段，需要新依赖和 Morii 授权；
- 自动保存失败后不会自行退避重试，作者停手时不会再次尝试；
- 第 11 块的 SQLite、会话、媒体与导出内容备份恢复尚未演练；
- 第 12 块部署、fail2ban 与 `docs/deployment.md` 更新尚未开始；
- 原型 B 的 118 例没有在最近生产块中重复运行，原型只作历史参考。

## 8. 交接边界

Claude 从第 10 块继续即可。每完成一块单独提交，记录改动文件、失败验证、真实检查结果和仍未解决的风险。不要修改原型，不要迁移正式内容，不要部署，也不要推送，除非 Morii 在当轮明确授权。
