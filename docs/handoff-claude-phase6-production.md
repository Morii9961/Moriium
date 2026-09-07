# 交接：分支已收束，下一步仍是影子部署

> 日期：2026-08-31，2026-09-01 更新
> 交出方：Codex；2026-09-01 的本地收尾由 Claude 追加
> 当前结论：**公共 UI 研究已经移出 `main`，主线保留并补齐了后端运维能力。运维面板的四态合同已完成并验证，发布状态机已用真实构建彩排过。但生产构建产物里的 Admin 文章路由无法加载，这是一个上线阻塞缺陷。VPS 尚未购置，影子部署、异地备份和生产恢复仍未发生。**

这份文档替代上一版同名交接。当前事实以实际 Git 状态、ADR 21.9–21.25、[`enouia-todo.md`](enouia-todo.md) 第 00 与 06A 节为准。

## 0. 2026-09-01 的本地收尾

在 `claude/phase6a-local-closeout`（自 `main` 的 `b607ea4` 建立的独立 worktree）上完成了三个工作包，详见 ADR 第 21.23、21.24、21.25 节。公开站重做那棵工作树没有被碰过，本轮改动也没有触及 `src/layouts/`、`src/pages/[lang]/` 下的公开路由、公开样式或那六个公开页面测试。

**已完成：**

- 运维面板补齐了验收清单 E 节的四态合同：五项各自落入 `ok`／`attention`／`failure`／`unknown`，每项带自己的 `observedAt`，没有读数时显示「暂无读数」。专项用例 28/28，三次反向验证都当场变红，四种状态在真实浏览器里逐项看过。
- 发布状态机第一次用真实导出、真实 `pnpm install`、真实 Astro 构建、真实上线前检查和真实静态服务跑通，十条场景全部通过，包括构建失败、上线前检查失败、probe 失败回滚、免重发布的重试、`keep=1` 保留策略，以及把数据库整个移走之后仍由静态服务器返回 200。
- 生产 Admin 第一次用真实浏览器对着 `dist/server/entry.mjs` 验收，12 个场景中 7 个通过。生产会话 cookie 的 `secure: true` 没有被改动——浏览器在 `http://127.0.0.1` 下照常接受它。

**曾经的阻塞，已于同日修复（ADR 21.26–21.28）：**

Morii 选定方案 A，提取纯净的共享 Markdown 管线模块，明确不用 `.npmrc`／hoist／`nodeLinker`／`ssr.external` 掩盖。修的过程中又查出两个同类缺陷，三个全部是「生产请求处理器依赖只有构建树才有的东西」：

1. `public-renderer.mjs` import `astro.config.mjs` → Vite／Rolldown／css-tree 被内联 → `/api/articles/*` 空 body 500。修法：新增 `src/markdown/pipeline.mjs`。
2. `open.ts` 用 `import.meta.dirname` 读 `schema.sql` → 产物不含 `.sql` → **全新 VPS 第一次启动建不了库**。修法：schema 改为 `src/server/db/schema.ts` 的字符串常量。
3. `ArticleEditor.ts` 把整个 `Version` 展开进表单 → 五个元数据字段进了 `.strict()` schema → **每次保存与自动保存都 400**。修法：`toFields(version)` 显式列字段。

第 2、3 只有修完第 1 才会显形。新增 `tests/admin-built-artifact.test.mjs` 对最终产物做真实 HTTP 回归，反向验证过会红。浏览器场景 4–8 已在产物上逐条通过，多语上线也拿到端到端证据（ADR 21.28）。

**仍然只能等 VPS 的：**异地副本与服务健康的真实读数、换站的原子性（本机 Windows 的 `symlink` 与 rename 覆盖都是 EPERM，且没有安装任何 WSL 发行版）、systemd／Nginx／TLS／fail2ban、异地传输与计时恢复。

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

2026-09-01 的本地收尾补上了这一段缺口。在 `claude/phase6a-local-closeout` 的干净 worktree 里，开工基线为 174 tests / 173 pass / 1 skip，收尾后的组合验证是：

```text
pnpm check                                       0 errors / 0 warnings / 0 hints，exit 0
node --test --test-isolation=none tests/*.test.mjs   192 tests / 191 pass / 0 fail / 1 skip，exit 0
pnpm build                                       exit 0
pnpm links                                       exit 0
node scripts/audit-public-tree.mjs               exit 0
pnpm split                                       exit 0（158 个公开文件不依赖 Node；156 个不含 Admin 代码）
pnpm baseline                                    exit 0（四项预算全部在限额内）
```

那一条 skip 是 21.10 记过的 Windows 符号链接换站，环境未执行，不是断言失败。`pnpm audit` 不是 `package.json` 里的脚本，按仓库实际命令跑的是 `node scripts/audit-public-tree.mjs`。

## 5. 仍未完成

- **构建产物里的 Admin 文章路由无法加载**（ADR 21.24）。这是上线阻塞项，且要先于影子部署决定；
- VPS 未购置，验收清单尚未执行；
- 浏览器端到端只走到 fixture 账户与隔离数据库，正式作者口令与正式内容都没有参与；文章创建、编辑、预览、发布、回滚这五个场景被上面那个缺陷挡住；
- 白名单 5 篇 fixture 里有 3 篇带媒体引用，媒体入库之前无法端到端发布；中日双语那一对恰好在其中，所以「多语文章上线」尚无端到端证据；
- 没有迁移或发布正式文章；
- 没有打开 `DEPLOY_ENABLED`，没有真实换站；
- 没有选定异地备份目标，数据库 30 天保留与媒体每日同步未落地；
- 没有从异地副本完成计时恢复，RTO 小于等于 30 分钟仍是目标；
- fail2ban 初值尚未用真实日志校准；
- `.gitignore` 是否加入 `src/content/posts/exported/`、`public/media/`、`src/generated/` 仍待决定。

## 6. 下一入口

**第一件事不是买机器，是决定怎么修 21.24 那个打包缺陷。**在它修好之前，影子部署上去的 Admin 无法写文章，验收清单 B 节的作者流程也没法验。可选方向有两条，都要 Morii 拍板：把 markdown 插件链从 `astro.config.mjs` 拆成独立模块，让可信 renderer 不再 import 整份配置；或者调整 Astro 的 SSR 打包与 pnpm 的提升策略，让这些包在运行时保持真实的 `node_modules` 解析。前者更贴近第 7 节的原意，后者改动面更小但要动 `.npmrc`。

修好之后，重跑 ADR 21.24 的 12 个浏览器场景，把被挡住的 4 到 8 补上。

若 Morii 购置 VPS 并授权影子部署，按 [`vps-acceptance-checklist.md`](vps-acceptance-checklist.md) 从 A、B 两节开始。先安装为可回滚状态，确认 Admin 只监听回环地址，再停止 `moriium-admin.service`，验证三语公开页仍由 Nginx 返回 200。正式内容继续不迁移。

不要读取 `.private/posts/`，不要接触真实口令、原图或正式内容，也不要把 fixture 草稿发布出去。
