# 交接给 Claude：Phase 6A 本机故障矩阵完成，下一步是影子部署验收

> 日期：2026-08-31
> 交出方：Codex
> 接手方：Claude
> 当前结论：**Phase 6A 第 1–13 块和六项故障矩阵的仓库/本机工作已经完成。下一阶段是影子 VPS 安装与验收，但尚未获得本轮部署授权，也没有迁移正式内容。**

这份文档替代上一版同名交接，作为当前生产工作的入口。[`handoff-codex-phase6-production.md`](handoff-codex-phase6-production.md) 保留前九块的详细实施记录；当前状态以本文件、[`adr-0002-phase5-production.md`](adr-0002-phase5-production.md) 第 21.9–21.19 节和 [`enouia-todo.md`](enouia-todo.md) 第 06A 节为准。

## 1. Checkout 与推送状态

生成本文前的状态：

```text
branch: main
HEAD: 3b54423 Complete the local production failure matrix
origin/main: 5c874ca Give the export and the release their own pnpm commands
ahead / behind: 11 / 0
worktree: clean
```

本文提交后，Morii 已明确要求把 `main` 的全部本地提交推送到 `origin`。因此接手时不要沿用上面的历史 ahead 数字，应先核对实际状态：

```bash
git status --short --branch
git log --oneline --decorate -15
git rev-list --left-right --count origin/main...HEAD
```

推送目标是 `main` 与 `origin/main` 同步，ahead/behind 为 `0 / 0`。本文不写自己的提交 hash；若推送没有达到这个状态，以实际 Git 输出为准，不要假定远端已经更新。

从原远端基线 `5c874ca` 到本文之前共有 11 个本地提交：

```text
82bab04  Back up and drill the production database
73c4301  Prepare the Phase 6 production deployment
7a3ce3a  Fix the design font audit output path
8706867  Add the Hanshin design foundation
c11c76e  Add the Hanshin page layouts
fc0b980  Add the Hanshin design study routes
7cb08c9  Extract the production content schema
bb9cdf2  Migrate approved fixture content into database drafts
c8b758f  Hand the Phase 6A fault matrix to Claude
2a3ae51  Exercise API and database failure paths
3b54423  Complete the local production failure matrix
```

其中 Hanshin 三个主体提交和字体修复仍是隔离的设计研究，不是生产视觉定案。其余提交属于 Phase 6A 生产链路、证据或交接。

## 2. 现在到了哪一步

| 工作块 | 当前状态 | 仍缺什么 |
| --- | --- | --- |
| 1–9. 数据库、认证、Admin、媒体、发布闸门 | 仓库侧完成 | 真实作者登录与浏览器验收 |
| 10. 导出、构建、原子换站 | 代码与失败顺序完成 | 真实 VPS 首次执行 |
| 11. 在线备份与恢复演练 | 本机备份和隔离恢复完成 | 异地传输、媒体同步、完整 VPS RTO |
| 12. systemd、Nginx、fail2ban、部署脚本 | 仓库侧完成 | 安装配置、打开部署开关、生产验收 |
| 13. fixture/测试文章迁移 | 完成 | 只进临时数据库草稿；正式内容未迁移 |
| 六项故障矩阵 | 仓库/本机完成 | VPS 停 Node 静态验收仍属于第 12 块生产证据 |

不要继续增加 Phase 6A 功能。下一个工程阶段是影子部署验收：先取得 Morii 对具体 VPS、备份目标和操作窗口的当轮授权，再安装和验证；没有这些信息时只做只读盘点或文档准备。

## 3. 本轮完成的六项故障矩阵

### 3.1 Admin API 断开

`src/admin/api.ts` 现在统一区分可读的服务端拒绝、浏览器网络 `TypeError` 和其他程序错误。登录/列表、文章编辑和媒体导入各自给出明确断网提示，不再把 `TypeError: Failed to fetch` 暴露给作者。文章编辑器说明本次没有保存、改动仍在页面中；本轮没有擅自加入自动重试。

### 3.2 生产 SQLite 写锁

真实双连接测试发现并修正了 `ArticleStore.#transaction()` 的边界：`BEGIN IMMEDIATE` 原先在 `try` 外，真正抢锁失败会绕过 `asStoreError()` 并返回 500。现在事务起点也经过统一分类，文章接口返回 `db-locked`/503，`articles` 与 `versions` 都不留下残行。

### 3.3 本机备份恢复

复用第 11 块的 7 个用例，没有另造恢复代码。它们覆盖旧副本保全、损坏副本拒绝、干净副本迁移、持久写入、关闭和只读重开。异地下载、换生产库、重启 Admin、重建站点和完整计时仍未发生；RTO 小于等于 30 分钟仍是目标。

### 3.4 草稿越权

匿名文章列表、单篇详情和未保存预览都返回 401；新增单篇详情断言确认响应不含最新自动保存。公开导出只读 `published_version_id`，未发布文章不导出，已发布文章也不会被较新的自动保存覆盖。Morii 与 Enouia 权限相同，本轮没有引入按文章所有者隔离。

### 3.5 媒体故障

媒体 HTTP 接口在真实 SQLite 写锁下返回 `db-locked`/503，`media_assets` 保持 0 行，已净化但未落库的 WebP 会被删除。反向不一致也有明确结果：数据库有记录但文件丢失时，作者收到 `validation-failed` 和存储缺失说明；匿名请求仍先停在 401。

### 3.6 静态回退

部署/渲染契约确认公开文件默认由静态目录提供，只有 `/admin/` 与 `/api/` 进入 Node。本机没有启动 Astro Admin，而是用 Python 直接托管 `dist/client`：三语首页与 sitemap 都返回 200，静态树中的 `/admin/` 返回预期的 404。

这个结果只证明构建产物不依赖 Admin Node，不能代替真实 VPS 上停止 `moriium-admin.service` 后由 Nginx 继续服务公开页的验收。

## 4. 最新验证证据

以下结果都在 `3b54423` 的代码与测试上重新运行：

```text
pnpm check
  → Astro 144 个文件，0 errors / 0 warnings / 0 hints

node --test --test-isolation=none tests/*.test.mjs
  → 沙箱内：154 tests / 152 pass / 1 fail / 1 skip
  → 唯一 fail：release-host 启动 Node 子进程时 spawnSync EPERM

node --test --test-isolation=none tests/admin-release.test.mjs（沙箱外）
  → 22 tests / 21 pass / 0 fail / 1 Windows symlink skip

合并证据
  → 154 tests / 153 pass / 0 assertion failures / 1 platform skip

故障矩阵专项
  → article API + export + media：34 / 34
  → deployment contract + render split：7 / 7

pnpm build（沙箱外）
  → exit 0；内容、指令和媒体检查通过；生产构建完成

pnpm links
  → exit 0；本地链接通过

pnpm run audit
  → exit 0；公开树未发现私有路径、退役受保护内容或口令 frontmatter

pnpm split
  → exit 0；192 个公开文件不依赖 Node；
    190 个公开可达 HTML/CSS/JS 文件不含 Admin 代码
```

`pnpm verify` 的默认 Node 隔离在当前 Windows 沙箱中会因 `spawn EPERM` 无法启动测试文件，因此本轮没有把单一命令的非零退出写成绿灯。上面列出的是逐项重跑和 release-host 沙箱外复核后的真实结果。

本机静态 HTTP 探测：

```text
/zh/               → 200
/ja/               → 200
/en/               → 200
/sitemap-index.xml → 200
/admin/            → 404（纯静态树的预期结果）
```

## 5. 接手顺序

1. 读仓库根目录 [`AGENTS.md`](../AGENTS.md)，它是当前共享合同。
2. 运行第 1 节的 Git 命令，确认本次 push 是否已经让 `main` 与 `origin/main` 同步。
3. 读 ADR 21.9–21.19，尤其区分仓库/本机证据与真实 VPS 证据。
4. 读 [`deployment.md`](deployment.md) 和 `deploy/`，只读核对首装、回滚、恢复和验收步骤。
5. 若 Morii 明确授权影子部署，再先确认主机、数据目录、备份目的地、维护窗口与回滚点；一次完成一个可恢复步骤并留下真实输出。
6. 第一个 VPS 验收切片应是：安装配置但保持可回滚，验证 Admin 只监听回环地址，随后停止 Admin 服务并确认三语公开页仍由 Nginx 返回 200。

## 6. 仍未完成或未经授权

- 没有用 Morii 的真实口令做生产登录后的浏览器端到端验证；
- 没有迁移正式文章，没有发布数据库草稿，也没有写入 `live_version_id`；
- 没有安装 VPS 配置、打开 `DEPLOY_ENABLED` 或执行真实原子换站；
- 没有选定异地备份目标，数据库异地保留 30 天与媒体每日同步尚未落地；
- 没有从异地副本完成 VPS 计时恢复，RTO 小于等于 30 分钟仍无生产证据；
- 没有在 VPS 上停 Admin 服务并验证静态公开站；
- fail2ban 初始阈值没有用真实访问日志校准；
- Admin 仍只显示“等待导出”，没有经过评审的自动构建或重试入口；
- `.gitignore` 是否加入 `src/content/posts/exported/`、`public/media/`、`src/generated/` 仍待决定；
- Hanshin 设计研究没有取得生产视觉选择授权。

## 7. 不可越过的边界

不要读取或迁移 `.private/posts/`，不要接触真实口令、原图或正式内容。不要把 fixture 草稿发布出去。不要因为仓库侧故障矩阵完成就宣称 VPS 已上线、异地备份已建立或 RTO 已达标。

本轮授权只包括提交并推送当前 `main` 的仓库修改，不包括部署、发布站点、运行数据库迁移或改变 VPS。接手后任何远端基础设施操作都需要 Morii 在当轮重新明确授权。
