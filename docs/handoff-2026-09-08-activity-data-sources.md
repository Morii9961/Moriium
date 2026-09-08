# 活动数据源交接（Claude → Codex）

日期：2026-09-08。承接 [`handoff-2026-09-07-about-activity.md`](handoff-2026-09-07-about-activity.md)。
那份交接里的热力图实现仍然有效；本次只换了**数据从哪来**，没有动组件、样式和交互脚本。

口径、操作步骤和失败处理的正式说明在 [`docs/activity.md`](activity.md)，本文不重复，只记录
交接需要的状态、调研结论和待办。

## 1. 一句话状态

三张热力图的数据管线已经重做完并验证通过。Codex 改用官方服务端接口（覆盖 iOS Work 模式和
云端），Claude Code 补上了 Cowork，快照不再随滚动窗口丢历史，并且有了可重复的刷新与归档命令。
**没有提交、推送、部署，也没有注册计划任务。** 剩下的是按年份展示的 UI 和文案修正。

## 2. 本次改动清单

新增：

| 文件 | 作用 |
| --- | --- |
| `scripts/lib/codex-usage.ts` | 通过 `codex app-server` 的 JSON-RPC 取账号级 token 活动，含严格校验 |
| `scripts/lib/cowork.ts` | 定位 Cowork 每个 task 的私有 `CLAUDE_CONFIG_DIR` |
| `scripts/refresh-activity.mjs` | 采集 + 差异汇报 + 带日期归档 + 运行日志（`pnpm activity:refresh`） |

修改：

| 文件 | 改动 |
| --- | --- |
| `scripts/collect-activity.mjs` | codex 分支改走官方接口；claude 分支叠加 Cowork store；档案地板 `ARCHIVE_START` / `RETAIN_FROM` |
| `scripts/lib/activity-import.ts` | `importUsage` 收窄成只服务 `claude` |
| `src/lib/activity.ts` | 新增 `TIMEZONES` 映射，时区标签按源校验 |
| `tests/activity.test.mjs` | 6 → 10 项 |
| `docs/activity.md` | 口径、Cowork、官方接口、`Keep it current` 一节 |
| `package.json` | 新增 `activity:refresh` |
| `src/data/activity.json` | 重新采集；codex 44 天→60 天，claude 11 天→19 天 |

验证证据（都实际跑过）：

```
node --test tests/activity.test.mjs   →  10 pass / 0 fail
pnpm check                            →  154 files, 0 errors / 0 warnings / 0 hints
pnpm activity:collect                 →  github 365, codex 60, claude 19
pnpm activity:refresh                 →  同上，并写出归档与日志
```

当前快照：

| 源 | 天数 | 区间 | 合计 | 时区标签 |
| --- | ---: | --- | ---: | --- |
| github | 365 | 2025-09-09 → 2026-09-08 | 336 次贡献 | `GitHub` |
| codex | 60 | 2026-05-12 → 2026-09-07 | 1,200,520,787 | `Codex` |
| claude | 19 | 2026-07-02 → 2026-09-08 | 约 16.8 亿（每次会话都在涨） | `Asia/Shanghai` |

## 3. 数据源真相（不要重新推导）

这一节是本次调研的结论。每一条都是在这台机器上实测出来的，不是文档推测。

### 3.1 三源对照

| 源 | 数据在哪 | 能否脱离这台电脑 | 覆盖面 |
| --- | --- | --- | --- |
| GitHub | 公开 GraphQL | 能 | 完整 |
| Codex | **服务端账号数据** | 技术上能，但要搬走登录凭据 | 全 surface：CLI、桌面、iOS Work、云端 |
| Claude Code | 本地 transcript | **不能** | 只有这台机器 |

### 3.2 Codex：`account/usage/read`

`codex app-server` 的 JSON-RPC 方法，底层 HTTP 是 `GET /backend-api/wham/usage`
（或 API host 上的 `/api/codex/usage`）。响应：

```
AccountTokenUsageSummary { lifetimeTokens, peakDailyTokens, longestRunningTurnSec,
                           currentStreakDays, longestStreakDays }
AccountTokenUsageDailyBucket { startDate, tokens }
GetAccountTokenUsageResponse { summary, dailyUsageBuckets[], threadUsage? }
```

用 `codex app-server generate-json-schema --out <dir>` 可以随时导出官方契约核对。

**必须走 app-server，不要直接打 HTTP。** 直接 `fetch('/backend-api/wham/usage')` 返回 401，
它要 Bearer token；走 app-server 则由 CLI 自己用 `~/.codex/auth.json` 完成鉴权，仓库全程不接触
凭据。把那把凭据搬进 CI 或脚本是被否决的方案——它能跑 Codex、花账户额度，为一张热力图不值得。

这正是 Codex TUI 里「Token 活动」面板的数据源（`tui/src/chatwidget/tokens.rs`），面板上的
五张卡片就是 summary 的五个字段。

服务端返回的疑似是**全量历史而非滚动窗口**：最早的桶、最早的本地 session 目录、
`~/.codex/installation_id` 的创建时间三者都落在 2026-05-12。**这是三个巧合推出的推断，不是
文档保证**，所以长期不采集仍是唯一真实风险。

`importCodexUsage` 会在桶合计与 `lifetimeTokens` 不等时直接抛错——被静默截断的分页会读起来
像用量真的崩了。

### 3.3 Cowork

Cowork 是桌面端的 local agent mode，底下跑 Claude Code，但**每个 task 有自己的
`CLAUDE_CONFIG_DIR`**，transcript 落在 task 目录内的 `.claude/projects/`，永远不会进
`~/.claude/projects`。所以默认那次 ccusage 一条都看不见。

存储位置（两个名字都要扫，桌面端改过一次名且没有迁移逻辑）：

```
%APPDATA%\Claude\{local-agent-mode-sessions, claude-code-sessions}     Windows
~/Library/Application Support/Claude/...                                macOS
~/.config/Claude/...                                                    Linux
```

这台机器上两个目录装的**不是同一种东西**，实测：

| 目录 | session 数 | 在 `~/.claude/projects` 有 transcript |
| --- | ---: | --- |
| `claude-code-sessions` | 25 | 25 / 25（桌面版 Code tab，ccusage 早已统计） |
| `local-agent-mode-sessions` | 10 | 0 / 10（真正的 Cowork，原先完全漏掉） |

`cowork.ts` 的规则是「扫两个目录，但只认自己带 transcript 的 task」，`claude-code-sessions`
因此被自然排除，不会重复计数。这条规则有测试覆盖。

Windows 上原生 transcript **没有缺失**，11 个 task 全都有，`audit.jsonl` 的兜底路径一次都没
走到。

**去重是这里最容易踩的坑**：原始行合计 141,429,877，按 `message.id:requestId` 去重后
47,070,897，**削掉 66.7%**。Claude Code 在 resume / 压缩 / 分叉时会重复写同一条 assistant
message，直接 glob 求和会把总量夸大三倍。所以实现是把 `CLAUDE_CONFIG_DIR` 指向每个 task 再跑
已 pin 的 ccusage，让去重留在 ccusage 手里，而不是自己写解析器。手写扫描与 ccusage 两条独立
路径的结果逐日一致（8 天 / 47,070,897），可作为回归基准。

**远程 Cowork session 跑在 Anthropic 云端，本地不落盘，统计不到。** 这是硬限制。

### 3.4 Claude Code 没有官方历史接口

在 `claude.exe` 里实测：唯一的用量端点是 `/api/oauth/usage?at_wall=1&skip_spend=1`
（函数名 `fetchUtilization`），返回的是限额利用率百分比，给 `/usage` 命令用，不是历史。
搜 `daily_usage` / `dailyUsage` / `usage_history` / `lifetimeTokens` 全部 0 命中。

Admin API 的 `usage_report/messages` 与 `usage_report/claude_code` 确实存在，但要 Console
组织的 `sk-ant-admin`，且 OAuth/订阅登录用户不出现在返回里（anthropics/claude-code#27780、
#20819，两个 issue 都还开着）。

所以本地 JSONL + Cowork task store 是唯一 token 来源。**不要再去找 Claude 的官方接口。**

### 3.5 `~/.claude/stats-cache.json`

Claude Code 自己维护的持久每日汇总（`dailyActivity`、`dailyModelTokens`、`modelUsage`、
`hourCounts`、`longestSession`），日志被清理后仍在，是 5 月数据的唯一存世记录：7 个活跃日
（05-02 05-03 05-04 05-12 05-26 05-31 06-03）、27 sessions、1,692 messages。

但它 **`lastComputedDate` 停在 2026-06-25 之后再没写过**，不能当作未来的档案。而且它的
`dailyModelTokens` 是**非缓存口径**（input + output）——已核对：05-02 的 sonnet 37,928 恰好
等于 `modelUsage` 里的 in 51 + out 37,877。六天合计仅 655,045，而同文件 `modelUsage` 的含缓存
总量是 58,550,958，**差 89 倍**。

**因此这 6 天被刻意不回填。** 已备份到归档目录。

## 4. 已定的口径决策

Morii 已拍板，不要再翻案：

1. **全部使用含缓存总量**（非缓存输入 + 缓存读取 + 缓存写入 + 输出）。非缓存口径比它小一到两个
   数量级，两种单位**永远不得共用一张图**。
2. **5 月那 6 天不回填**，理由见 3.5。
3. **两个 AI 源的时区不统一，而且不能强行统一。** Codex 用服务端日界（标签 `Codex`），
   Claude 用 `Asia/Shanghai`。快照的 `timezone` 字段如实记录，不许改标签冒充统一。
   证据：换源前后 7/22–7/23 出现明显此消彼长（官方 41.5M / 20.5M，本地 19.9M / 38.5M），
   就是跨零点归属不同。
4. **两种日界的序列不得合并。** 换官方源时旧的 codex 快照是整体替换而非 merge，旧快照留在
   归档目录。

## 5. 档案地板与一个已修复的回归

`src/data/activity.json` 是**档案本身**，不是最近一年的缓存。上游都会删自己的历史，这里丢掉的
一天没人还得回来。

```js
const start = shiftDate(end, -364);          // 只给 GitHub 查询用，官方限一年
const ARCHIVE_START = '2026-01-01';          // 档案地板
const RETAIN_FROM = ARCHIVE_START < start ? ARCHIVE_START : start;
```

⚠️ **踩过的坑**：第一版只用 `ARCHIVE_START` 过滤，跑完 GitHub 从 365 天掉到 251 天，
2025-09-09 → 2025-12-31 那 114 天被砍——而页面当时显示的仍是「最近 365 天」，那段会变成斜线。
是靠采集前先备份、采集后逐日 diff 才发现的。`RETAIN_FROM` 取「地板」和「显示窗口」的较早者，
保证两边都不丢。有测试断言这条规则，**改这段前先看那条测试**。

**改数据管线时请沿用这个习惯**：先备份 `activity.json`，跑完做逐日 diff，确认没有历史日被丢弃
或改写。`activity:refresh` 已经内建了「档案掉天数就报警」。

## 6. 仓库外的环境改动

| 位置 | 改动 |
| --- | --- |
| `~/.claude/settings.json` | 新增 `"cleanupPeriodDays": 3650`（原为默认 30 天）。原文件备份为 `settings.json.bak-2026-09-08` |
| `E:\Moriium_ActivityArchive\` | 新建。归档快照、原始响应、`refresh.log`、`README.md` |

归档目录内容见其 `README.md`。注意 `activity-before-codex-official-2026-09-08.json` **通不过
当前的 `validateActivity`**（它的 codex 时区标签还是 `Asia/Shanghai`），这是换源前的产物，不是
损坏。

`.last-cleanup` 显示清理在 2026-09-08 当天跑过；8-29 之前的 Claude Code 日志已经永久丢失，
改保留期只挡住将来。

## 7. 待办（交给 Codex）

### 7.1 按年份展示 + 下拉框选择（主要工作）

Morii 的要求：以后显示 2026 年起的数据，按年份区分，加下拉框切换。涉及：

| 位置 | 改动 |
| --- | --- |
| `src/lib/activity.ts` | `calendarDays()` 从「滚动 365 天」改成「某一自然年」；处理 1/1 与 12/31 的补周、闰年 366 天 |
| `ActivityHeatmap.astro` | 每年一张日历；月份标签固定 1–12 月 |
| 年份切换 | `<select>` + 脚本 |
| `activity-copy.ts` | 三语言补「年份」标签与 select 的 aria-label |
| `tests/activity.test.mjs` | 跨年边界、闰年、地板不被裁剪 |

**必须保住的约束**：

- **无 JS 可用。** 现有实现的明细表靠 `<details>`，年份切换如果只做成 JS 隐藏，屏蔽脚本后就只剩
  一年。建议全部年份都渲染进 HTML，默认展开当前年，脚本只负责收起其余年份并接管下拉框。
- **HTML 体积。** 现在三张图已经 419 个 known + 679 个 unknown 格子、约 238 KB。年份累积会线性
  增长，结构上留好口子。
- **`ARCHIVE_START` 是 `2026-01-01`**，但 GitHub 快照目前含 2025-09-09 起的数据（`RETAIN_FROM`
  的效果）。按年份展示时要决定 2025 那段怎么处理——它是可以随时从 API 重新取回的，与两个 AI 源
  不同。

### 7.2 三语言文案已经不准确（必须改）

`src/data/activity-copy.ts` 的 `note` 三种语言都写着「AI 用量来自 Morii 电脑上保留的全部日志，
按上海时区汇总」。**换源之后这句对 Codex 已经不成立**：

- Codex 是服务端账号数据，覆盖 iOS Work 模式和云端，不是「这台电脑的日志」；
- Codex 用的是服务端时区，不是上海时区；
- Claude Code 现在包含 Cowork，但**不含**远程 Cowork session。

正确的说法要按源分别表述。`docs/activity.md` 的 `Meaning of the numbers` 一节已经是准确版本，
可以照它改写成面向读者的措辞。日文、英文同步。

### 7.3 色阶阈值需要复核

共用阈值仍是 `TOKEN_THRESHOLDS = [1M, 50M, 150M]`。换源后的实际分布：

```
codex   level0-4:  0 10 41  9  0    （60 天，峰值 96,807,786，永远够不到 level 4）
claude  level0-4:  0  0  9  5  5    （19 天）
```

Codex 的 level 4 恒为空。这**可能是诚实的**——Claude 单日确实烧得更多，共用刻度如实反映了差距；
也可能需要重标。请先判断再动，不要为了好看直接改。图例是由阈值生成的，改阈值图例会跟着变。

### 7.4 构建与验收

`src/data/activity.json` 已经变了但**还没重新构建**，线上/`dist` 里仍是旧数据。做完 UI 后按
`docs/activity.md` 的 `Presentation and checks` 走完：三语言、明暗主题、375/390/768/1024/1440
五种宽度、无脚本可读、停掉 Node 后静态访问。

## 8. 等 Morii 决定的事

1. **注册计划任务。** 命令在 `docs/activity.md` 的 `Keep it current` 一节，已做语法与 cmdlet
   可用性验证，但**没有注册**。要点：登录触发器延迟 15 分钟（刚开机时工具还没打开，且不该和启动
   抢资源）、`-LogonType S4U` 静默无窗口、`-MultipleInstances IgnoreNew`。
   S4U 是非交互会话，环境与手动运行不同，**第一次注册后必须看 `refresh.log` 确认，不要默认成功**。
2. **自动提交 / 推送 / 部署。** 一律没有配置，也不得擅自添加。`activity:refresh` 只采集和归档。

## 9. 边界

`git status` 里还有 `docs/design-research.md`、`docs/design-system.md`、
`src/pages/[lang]/about/index.astro` 等其他任务的改动。**不要回退、覆盖、顺手修复或整体暂存。**
本次只碰了第 2 节列出的文件。

`AboutActivity.astro`、`ActivityHeatmap.astro`、`activity.css`、`src/scripts/activity.ts` 本次
一行未改，仍是 9 月 7 日那份实现。

## 10. 验证过的命令

```powershell
pnpm activity:collect [all|github|codex|claude]   # 采集
pnpm activity:refresh [all|github|codex|claude]   # 采集 + 归档 + 日志
node --test tests/activity.test.mjs               # 10 项
pnpm check
codex app-server generate-json-schema --out <dir> # 导出官方协议契约
```

环境变量：`MORIIUM_CCUSAGE_CLI`（指定 ccusage）、`MORIIUM_CODEX_CLI`（指定 codex 可执行文件）、
`MORIIUM_ACTIVITY_ARCHIVE`（归档目录）、`GITHUB_TOKEN` / `GH_TOKEN`。
