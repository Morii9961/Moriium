# 交接：分支已收束，下一步仍是影子部署

> 日期：2026-08-31
> 交出方：Codex
> 当前结论：**公共 UI 研究已经移出 `main`，主线保留并补齐了后端运维能力。VPS 尚未购置，影子部署、异地备份和生产恢复仍未发生。**

这份文档替代上一版同名交接。当前事实以实际 Git 状态、ADR 21.9–21.22、[`enouia-todo.md`](enouia-todo.md) 第 00 与 06A 节为准。

## 1. 三个分支怎么处理

### `main`

`main` 继续承载生产后端与当前公开站。Hanshin 的三个已推送提交没有通过 rebase 或 force-push 从历史里抹掉；本轮新增一个反向提交，把它们的文件从当前树移除。后续数据库、fixture 迁移、故障矩阵与部署提交全部保留。

本轮新增的主线提交：

```text
337edcc  Remove the unapproved Hanshin study from main
b3f2d04  Clean up validated backup sidecars
67280a9  Show operational failures in the author admin
```

本交接、体积基线与 VPS 清单会作为下一笔独立提交落在它们之后。

### `codex/ui-comparison-recovery`

未完成的 Hanshin、Jiege、Juanshou 研究和并行出现的设计文档保存在：

```text
0fd8124  Preserve public design studies off main
```

这个分支只负责保全和后续视觉评审，不是生产批准。

### `design/ui-restart`

保持 Claude 当时留下的两笔提交不动：

```text
4bbf3c8  Back up the database from inside the process that owns it
4d2f5ce  Put the failures nobody would be told about on a screen
```

它与 `main` 从 `5c874ca` 分叉。不要把它整体 merge 或 cherry-pick 回主线；其中备份文件名、测试文件和数据库 runtime 都与主线另一套实现冲突。该分支作为原始工作记录保留。

## 2. 后端取舍

主线继续使用 `src/server/backup/database-backup.ts` 和非破坏性的恢复演练。没有引入 Claude 分支里的覆盖式 restore，也没有把同机媒体镜像写成异地备份。

本轮从真实文件复现出一个主线缺陷：每次校验 staging 数据库都会遗留随机名的 `-wal` 与 `-shm`。修复前回归用例确实失败，修复后备份与恢复专项 8/8。

运维状态没有照搬 Claude 那套备份 API，而是接到主线调度器上。作者后台现在汇总：

- 本机备份是否存在、是否过期、最近一次是否失败；
- 已发布但尚未上线的文章是否超过 15 分钟；
- 数据盘剩余空间；
- 异地副本与服务健康这两项当前无法自证的状态，明确显示为「未观测」。

接口仍是作者会话专用的 `/api/status/`。公开路由保持静态，不新增读者分析。

## 3. 第 00 节补完的两项

`scripts/measure-baseline.mjs`、`tests/public-baseline.test.mjs` 与 `pnpm baseline` 固定了公开构建体积口径，并接到 `pnpm verify` 末尾。`/design/` 研究资源按可达性排除，不会把研究专用的共享 `_astro/` 文件误算进生产；生产页面一旦引用同一资源，它会立刻重新计入生产。

[`vps-acceptance-checklist.md`](vps-acceptance-checklist.md) 把采购、部署、安全、恢复和运维面板整理成可验收条目。采购默认下限为 2 核、4 GB 内存、80 GB SSD。影子阶段不改主域名；会改状态的验收只使用隔离测试库、fixture 账户和生成的虚构图片；日志检查只报命中数，不回显内容。

## 4. 验证边界

移除 Hanshin 时已经取得以下新鲜证据：

```text
Astro check                 0 errors / 0 warnings / 0 hints
主测试集                    154 tests；152 pass；1 sandbox EPERM；1 Windows skip
admin-release 沙箱外重跑    21 pass / 0 fail / 1 Windows skip
Astro build                 exit 0
links / audit / split       全部 exit 0
```

备份 sidecar 修复在用户叫停后续测试前完成红绿验证，专项 8/8。

Morii 随后明确要求不再继续测试，直接整理并推送。因此运维状态的最终实现、体积基线恢复后的组合状态，以及本交接提交都没有再跑新门禁。不要把测试文件存在误写成已经通过。

## 5. 仍未完成

- VPS 未购置，验收清单尚未执行；
- 没有真实作者口令的浏览器端到端验证；
- 没有迁移或发布正式文章；
- 没有打开 `DEPLOY_ENABLED`，没有真实换站；
- 没有选定异地备份目标，数据库 30 天保留与媒体每日同步未落地；
- 没有从异地副本完成计时恢复，RTO 小于等于 30 分钟仍是目标；
- fail2ban 初值尚未用真实日志校准；
- `.gitignore` 是否加入 `src/content/posts/exported/`、`public/media/`、`src/generated/` 仍待决定。

## 6. 下一入口

若 Morii 购置 VPS 并授权影子部署，按 [`vps-acceptance-checklist.md`](vps-acceptance-checklist.md) 从 A、B 两节开始。先安装为可回滚状态，确认 Admin 只监听回环地址，再停止 `moriium-admin.service`，验证三语公开页仍由 Nginx 返回 200。正式内容继续不迁移。

不要读取 `.private/posts/`，不要接触真实口令、原图或正式内容，也不要把 fixture 草稿发布出去。
