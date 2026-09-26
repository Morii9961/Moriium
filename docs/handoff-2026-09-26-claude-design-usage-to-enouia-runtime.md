# Claude Design 用量获取交接：Moriium → Enouia Runtime

日期：2026-09-26。本文只说明数据来源、获取条件和验收方法，供 Morii 转交给独立项目 Enouia Runtime。当前没有为 Claude Design 创建采集任务、API 凭据、公开数据源或关于页日历。实施前重新核对文末官方文档和账号计划。

## 先确定要统计什么

Anthropic 已将 Claude Design 纳入 Claude 的**共享用量限额**，不再为它单设周额度。Design 可以在 `claude.ai/design` 独立使用，也可以从普通对话、Artifacts 或 Claude Code `/design` 发起。这些入口产生的内容都可能叫“Design”，但按产品入口归因的 token 与共享限额进度不是同一种数据。见 [Claude Design 使用说明](https://support.claude.com/en/articles/14604416-get-started-with-claude-design)。

| 所需数据 | 当前可行来源 | 边界 |
| --- | --- | --- |
| Morii 每日、可按产品归因的 Design tokens | **有条件**：Claude Enterprise Analytics API 的 `claude_design` 产品筛选 | 需要 Enterprise 组织、Primary Owner 配置和 `read:analytics` 凭据；计划的计费方式决定覆盖范围 |
| 独立 `claude.ai/design` 的活跃用户数 | Team／Enterprise 后台 `Analytics > Claude Design` | 是活跃用户指标，不是 token；官方说明只覆盖独立入口，不覆盖对话或 Artifacts 中的设计 |
| 账号共享限额进度 | Claude 网页或桌面版 [`Settings > Usage`](https://support.claude.com/en/articles/9797557-usage-limit-best-practices) | 是五小时／周限额的进度条，混合多个 Claude 入口，不能转换为 Design 的日 token |
| 本机 Claude Code `/design` 的 token | `~/.claude/projects` 和本机 Cowork 私有会话，由现有 `ccusage` 采集 | 计入 Moriium 的 **Claude Code** 汇总；日志没有已核实的 Design 产品标签，不能可靠拆分或重复计入独立 Design |

本机还存在 Chrome 与 Claude 桌面版的 `claude.ai` IndexedDB、Local Storage 和缓存。检查到 Design 项目设置与静态资源，但**没有确认可复核的逐日 token 汇总**。这些缓存可能被清理，结构也不构成稳定接口；不能把项目数、消息数、缓存命中词或限额百分比推算成 tokens。Claude 桌面版 Microsoft Store 数据根目录为 `%LOCALAPPDATA%\Packages\Claude_<package-id>\LocalCache\Roaming\Claude`；本机 Cowork 的可计量 JSONL 在其中的 task store，具体发现方式见[主交接文件](handoff-2026-09-26-activity-to-enouia-runtime.md)。

## 如果账号具备 Enterprise Analytics API

优先确认组织是**按用量计费的 Enterprise**，以及 Morii 的使用确实归属该组织。官方说明：Enterprise 的用量与费用接口在按用量计费方案上提供消费数据；在席位制方案上只反映额外 usage credits，不能当作完整的席位内用量。只有 Primary Owner 可以在 `claude.ai > Organization settings > API` 启用访问并创建带 `read:analytics` 权限的 Analytics API key。Claude Console 的 Admin API key 与它不能互换。见 [Analytics API 指南](https://platform.claude.com/docs/en/manage-claude/analytics-api)。

要取 **Morii 一人的逐日用量**，使用官方 [Get Per-User Token Usage](https://platform.claude.com/docs/en/api/http/beta/organization/analytics/usage/list_by_user)；若只需组织汇总，使用 [Get Token Usage Over Time](https://platform.claude.com/docs/en/api/http/beta/organization/analytics/usage/list)。请求由 Runtime 的受控后端发出，凭据留在其密钥存储中，不进入 Moriium 仓库、浏览器或公开 JSON。

| 参数／结果 | Runtime 应采用的值或处理 |
| --- | --- |
| 方法与路径 | `GET https://api.anthropic.com/v1/organizations/analytics/user_usage_report` |
| 请求头 | `anthropic-version: 2023-06-01`；`x-api-key` 从服务端密钥存储注入 |
| 时间 | `starting_at` 含起点、`ending_at` 不含终点，均为带时区的 RFC 3339；`bucket_width=1d`。单次最多 31 天，起点须在最近 365 天内且不早于 2026-01-01 |
| 筛选 | `products[]=claude_design`、`group_by[]=product`、`user_ids[]=<Morii 的组织内 tagged user ID>`。不要用邮箱文本匹配或把用户 ID 放进公开结果 |
| 响应 | 分页直到 `has_more=false`；逐行核对 `actor.user_id`、`starting_at`、`ending_at`、`product`、`total_tokens`，保存成功采集的 UTC 日桶与 `data_refreshed_at` |

示意查询为 `...?starting_at=2026-09-01T00:00:00Z&ending_at=2026-09-02T00:00:00Z&bucket_width=1d&products[]=claude_design&group_by[]=product&user_ids[]=<tagged-user-id>`。这只是接口形状，**本机尚未获得该接口的真实响应**，不能把示意当作已开通或已验证的数据。

官方文档把 `claude_design` 列为“产品入口”筛选。独立站点、对话中的 Design、Artifacts 模板和 Claude Code `/design` 的具体归因范围，应先用组织内可控的样本分别验证；不要因都叫 Design 就推定 API 会把它们合并。组织后台的 Claude Design 活跃用户图明确只计独立 `claude.ai/design`，见 [Artifacts 管理说明](https://support.claude.com/en/articles/16994751-artifacts-admin-guide-for-team-and-enterprise-plans)。

## Runtime 采集与发布规则

1. 先确认账号计划、组织归属、API 权限和 Morii 的 tagged user ID。未具备条件时，将 Design token 来源标为“不可获取”；保留 Claude Code 原有日历，不发布估算值。`Settings > Usage` 可以单独供人查看共享额度进度，但不得塞进 token 热力图。
2. 首次采集选一个已完成的 UTC 日和一段真实使用记录，核对产品筛选、用户筛选与 `total_tokens`；若组织后台没有同口径 token 读数，用受控操作和官方组织汇总端点交叉核对，不把活跃用户数当作 token。再分别检查独立站点、对话／Artifacts、Claude Code 三种入口的归因；任何不可解释的重复或缺口都先停止发布。
3. 以 `data_refreshed_at` 判断新鲜度；官方称用量数据通常在四小时内到达，可能延迟至 24 小时，近 30 天还可能修订。定期重取最近 30 天并允许官方值向上或向下修正；分页失败、权限错误或数据尚未完整时保留上次成功快照及时间，不把缺失当作零。
4. 只对确认完整且成功返回的日期补零。保留 UTC 日界和来源标签，不把它改写成 `Asia/Shanghai` 的 Claude Code 日桶，也不把 Design 与现有 Claude Code 值相加。公开数据只包含必要的日汇总和时间戳，剔除用户 ID、邮箱、费用、原始响应、凭据及会话内容。
5. Moriium 的 `ActivityData v1` 固定为 `github/codex/claude` 三源，`src/lib/activity.ts` 和接收／发布批次协议会拒绝第四源。若要在关于页加 Design 日历，先与 Morii 确定展示含义、覆盖入口、日界和缺失状态，再版本化修改两端协议并做静态页面与上传验收；Runtime 不要单边增加 `sources.claude_design`。

## 交接时仍需确认

- Morii 当前 Claude 账号是否属于可使用上述接口的 Enterprise 组织，以及是否为按用量计费；本次没有读取账号计划、启用 API 或创建密钥。
- Runtime 要展示独立入口的 Design tokens，还是所有“生成设计”行为的 tokens。官方产品筛选按入口归因，后者目前没有已验证的完整来源。
- 是否需要公开第四张日历。现有 Moriium 代码与发布协议均未为它预留字段；本交接文件不构成公开展示或生产启用批准。
