# 交接给 Claude：Phase 6A 仓库侧完成，下一步是故障矩阵

> 日期：2026-08-31
> 交出方：Codex
> 接手方：Claude
> 当前结论：**Phase 6A 第 1–12 块的仓库侧实现已经接通，第 13 块已把 5 篇固定 fixture/测试文章迁移为数据库草稿。现在进入故障矩阵，不迁移正式内容，也不连接或部署 VPS。**

这份文档是当前生产工作的入口。[`handoff-codex-phase6-production.md`](handoff-codex-phase6-production.md) 保留前九块的详细实施记录；本文件记录第 10–13 块之后的 checkout、边界、验证证据和下一步。

## 1. 当前 checkout

交接文档修改前的 Git 状态：

```text
branch: main
HEAD: bb9cdf2 Migrate approved fixture content into database drafts
origin/main: 5c874ca Give the export and the release their own pnpm commands
ahead / behind: 8 / 0
worktree: clean
```

本文提交会位于这 8 个本地提交之后，不在文档里写自己的 hash。接手时以实际命令为准：

```bash
git status --short --branch
git log --oneline --decorate -12
git diff --stat origin/main..HEAD
```

这 8 个提交都还没有推送：

```text
82bab04  Back up and drill the production database
73c4301  Prepare the Phase 6 production deployment
7a3ce3a  Fix the design font audit output path
8706867  Add the Hanshin design foundation
c11c76e  Add the Hanshin page layouts
fc0b980  Add the Hanshin design study routes
7cb08c9  Extract the production content schema
bb9cdf2  Migrate approved fixture content into database drafts
```

其中 `82bab04`、`73c4301`、`7cb08c9`、`bb9cdf2` 属于 Phase 6A；`7a3ce3a` 到 `fc0b980` 属于独立的 Hanshin 设计研究。不要把设计研究当成生产视觉定案，也不要为了继续后端工作改动它。

## 2. 现在到了哪一步

| 块 | 当前状态 | 尚缺什么 |
| --- | --- | --- |
| 1–9 | 完成 | 详细记录见旧交接与 ADR 21.1–21.8 |
| 10. 导出、构建、原子换站 | 代码完成 | 尚未在真实 VPS 执行 |
| 11. 在线备份与恢复演练 | 本机代码和隔离演练完成 | 异地传输、媒体同步、VPS 完整 RTO 仍无证据 |
| 12. systemd、Nginx、fail2ban 与部署 | 仓库侧完成 | 尚未安装配置、打开 `DEPLOY_ENABLED` 或做生产验收 |
| 13. fixture/测试文章迁移 | 完成 | 只写临时数据库草稿；没有迁移正式内容、发布或上线 |

第 13 块之后，Phase 6A 的下一条明确工作是 [`enouia-todo.md`](enouia-todo.md) 第 06A 节的故障矩阵：

- API 断开；
- SQLite 锁；
- 备份恢复；
- 草稿越权；
- 媒体故障；
- Node 停止后的静态回退。

不要直接把六项一次性铺开。先盘点现有用例已经覆盖到哪里，再完成一个最小、可独立验证和提交的故障切片，避免重复写已经存在的数据库锁或备份单元测试。

## 3. 第 10–13 块留下的生产合同

### 3.1 公开路径始终是静态站

Astro 的 `output` 继续是 `static`。公开首页、文章、归档、分类、标签、搜索、RSS 和 Sitemap 都预渲染；只有 `/admin/*` 与 `/api/*` 进入 Node。Node 停止时，Nginx 仍必须从 `current` 直接服务公开站。Vue、Tiptap、ProseMirror 和 `node:sqlite` 不得进入公开可达 bundle。

### 3.2 发布与上线分属两个指针

作者发布只更新 `published_version_id`。导出、构建、上线前检查、原子换链和 curl 健康检查全部成功后，才能写 `live_version_id`。换站前失败不得碰 `current` 或上线指针；换站后健康检查失败必须恢复旧链接，也不能记录上线成功。

### 3.3 数据不进入 release

数据库、会话、净化媒体、导出内容与备份都放在 `/var/lib/moriium/`。`releases/` 只保存不可变静态产物，`workspace/` 保存服务端代码和依赖。数据库在线备份只能由持有常驻 `DatabaseSync` 的进程执行，外部任务以后只负责搬走已经完成并校验过的副本。

### 3.4 fixture 迁移不是正式内容迁移

`pnpm content:migrate-fixtures <Morii|Enouia>` 只接受四篇虚构 Markdown fixture 和 `reader-capabilities` 验收文章，共 5 篇固定来源。命令不接收路径。导入前全部经过生产 schema 与身份冲突预检，整批在一个事务里写入；重复执行保留已有编辑。

这些文章只创建数据库版本。`published_version_id` 与 `live_version_id` 都保持 `NULL`，SVG fixture 也不会冒充已净化媒体。当前没有运行默认 `.astro/admin.db`，没有连接 VPS，更没有发布任何文章。

### 3.5 Hanshin 仍是隔离研究

`/design/hanshin/` 已有三语首页、文章、归档、分类、标签、写作页、关于页和懒加载搜索，并修正了分裂构建后的字体审计路径。它是单独提交的设计研究，不改变生产路由，不表示已经完成三方案比较或选定生产方向。

## 4. 最近的验证证据

以下是各源代码提交写入 ADR/TODO 的提交前证据，接手时不要把它们误写成 VPS 证据：

```text
第 11 块专项：tests/admin-backup.test.mjs 7/7 通过
第 11 块全套：140 例，139 通过，0 失败，1 个 Windows symlink 跳过
第 12 块专项：tests/deployment-contract.test.mjs 5/5 通过
第 12 块脚本：Git Bash `bash -n deploy/bin/deploy-code.sh` 退出码 0

第 13 块完整门禁：
  pnpm verify
  → Astro 143 个文件，0 条诊断
  → 150 例 / 31 套，149 通过，0 失败，1 跳过
  → build、links、public-tree audit、render split 通过

  pnpm -C prototypes check
  → exit 0

  pnpm -C prototypes fixtures:check
  → 4 篇公开 fixture、1 篇受保护 fixture、2 个媒体文件、
    11 种内容块、4 份 baseline 通过
```

完整门禁已经在最新源代码提交上运行过；本交接只改 Markdown，不要无条件重复耗时门禁。若后续改了代码，再按改动面运行新证据。

## 5. 接手顺序

1. 读 [`AGENTS.md`](../AGENTS.md)，它是当前唯一有约束力的项目合同。
2. 读 [`adr-0002-phase5-production.md`](adr-0002-phase5-production.md) 第 21.9–21.13 节，尤其区分“仓库侧完成”和“真实 VPS 已验证”。
3. 读 [`enouia-todo.md`](enouia-todo.md) 第 06A 节，以故障矩阵为下一入口。
4. 搜索现有测试对六类故障的覆盖，先写缺口清单，不重复已有证据。
5. 只完成一个最小故障切片，运行对应专项检查，审阅 diff 后单独提交。

## 6. 仍未完成或未经授权

- 没有用 Morii 的真实口令做生产登录后的浏览器端到端验证；
- 没有迁移正式文章，也没有把任何数据库草稿发布或标记为上线；
- 没有安装 VPS 配置、打开部署开关或执行真实原子换站；
- 没有选定异地备份目标，数据库异地保留 30 天与媒体每日同步尚未落地；
- 没有从异地副本完成 VPS 计时恢复，RTO 小于等于 30 分钟仍是目标，不是结果；
- fail2ban 的初始阈值没有用真实访问日志校准；
- Admin 仍只显示“等待导出”，没有经过评审的自动构建或重试入口；
- `.gitignore` 是否加入 `src/content/posts/exported/`、`public/media/`、`src/generated/` 仍待决定；
- Hanshin 设计研究没有取得生产视觉选择授权；
- 本地提交尚未推送，VPS、GitHub Actions 和远端状态都没有在本轮改变。

## 7. 交接边界

继续工作时不要读取或迁移 `.private/posts/`，不要接触真实口令、原图或正式内容；不要部署、推送或改变远端状态，除非 Morii 在当轮明确授权。故障矩阵完成一个逻辑块后，更新 ADR/TODO/本交接，写清改动文件、专项证据、残余风险和下一个入口，再单独提交。
