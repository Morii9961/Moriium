# ADR 0004：Activity 改由 Moriium 拉取 GitHub 与 tokens.ci

日期：2026-10-25。状态：后端实现；尚未部署，也不代表前端接入、自动提交或无人值守验收完成。授权：Morii 要求 Codex 负责 Moriium / Runtime 后端，前端交给 Claude。

## 决定

新增 `pnpm activity:remote`，在 Moriium 部署侧每小时从 GitHub 官方 GraphQL 日历与 `https://tokens.ci/api/users/Morii9961?period=all` 拉取公开计数。GitHub 凭据只通过服务端环境进入请求头；tokens.ci 当前公开账号无需凭据。客户端日志扫描和提交交给各设备的 tokens 工具，Moriium 不读取个人日志、模型密钥或 Runtime 数据。

新统计遵循 [Activity feed v2](../contracts/activity-feed-v2.schema.json)。这不是 ActivityData v1 或 Dashboard UsageSnapshot 的格式升级兼容层。新旧统计分开，未经核实的日界标为 `tokens.ci device configuration`，不冒称 `Codex` 账户日界或上海日界。

## 数据与发布

- `/status-data/activity-v2/current.json`：`{version:2, generatedAt, hash, url}`，URL 必须为同源 `/status-data/activity-v2/<hash>.json`。先读取和校验指针，再读取文件并校验原始 UTF-8 字节的 SHA-256，才切换界面数据。
- `/status-data/activity-v2/<hash>.json`：v2 白名单数据。每个来源含 `provider/dayBoundary/attemptedAt/result/snapshot`。快照含 `updatedAt/fetchedAt/days`；失败时快照可为 null，也可为上一份成功数据。
- `generatedAt` 是本次发布，`attemptedAt` 是本次尝试，`fetchedAt` 是最近成功拉取，`updatedAt` 是上游数据更新，四者不能互换。tokens 上游不变时仍可成功拉取，但数据不因此变新。界面可沿用三小时过期窗口，按 snapshot.updatedAt 判定数据过期，按指针 generatedAt 判定拉取服务过期；失败、有旧数据与从未有数据分别表达。
- tokens.ci 的 `updatedAt` 是整个公开档案的最近提交时间，不是各客户端的最后活动或完整覆盖证明。页面应标为上游档案更新；不能据此推断 Morii 正在使用某客户端。
- `legacy.hash/url` 指向独立、不可变的 ActivityData v1。首次优先保存部署侧最近已发布数据；没有时采用明确的本地 v1 快照。后续不混合两套日期和值。旧 Codex 5 月数据保留在这里。

Runtime 的旧接收上传继续只拥有 v1 命名空间；新服务只拥有 v2 指针和哈希文件。它们不竞争同一输出。前端接入后再退役旧服务；不能在现有 v1 指针下发布 v2，现有 About 的 v1 校验会拒绝它。

采集器重建公开字段，API 的账号 ID、设备、模型、费用、会话、原始响应或错误不进入公开文件。校验全历史 token 总数与每日拆分一致，按客户端取 input + output + cacheRead + cacheWrite + reasoning。这里是 tokens.ci 已拆开的互斥分类：其 Codex 解析器先从 input 扣除缓存、从 output 扣除 reasoning；不能套用原始 Codex 日志的子集加总规则。允许同来源计数修正下降；拒绝已接受日期消失或上游时间倒退，保留旧快照并记录失败。不同来源不相加、不取最大值。

数据写入使用独立排他锁。先写完整不可变哈希文件，最后原子替换指针；进程退出、请求失败或发布中断不以部分文件覆盖原指针。遗留锁沿用 ADR 0003 的人工核对恢复规则。本实现不把普通原子重命名称为掉电持久化证据。

## 依赖与验证依据

没有新增 npm 依赖。复用 Node 24 和现有存储端口。tokens API 适配依据固定官方源码 [missuo/tokens@496e1174](https://github.com/missuo/tokens/blob/496e1174d125ade19e2801393cebb1275621fa75/web/src/lib/publicProfileData.ts)；设备日界依据 [timezone.rs](https://github.com/missuo/tokens/blob/496e1174d125ade19e2801393cebb1275621fa75/cli/tokens-cli/src/timezone.rs)。公开 API 没有在响应中声明稳定版本；结构或守恒关系改变时拒绝新数据并保留旧数据。

`tests/remote-activity.test.mjs` 覆盖拆分、零值、覆盖缺口、修订、失败保留、上游时间、隐私白名单、真实文件/锁竞争、哈希和中断恢复。生产 GitHub 凭据、tokens 自动提交、真实定时执行和关于页消费由部署及前端接入分别验证。
