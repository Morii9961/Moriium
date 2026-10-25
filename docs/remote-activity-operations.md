# GitHub / tokens.ci 后端部署与前端交接

后端入口：`scripts/collect-remote-activity.mjs`。本次提供代码及部署模板，不安装或启用生产任务。

## 部署步骤

1. 将脚本、`scripts/lib/remote-activity.mjs`、现有存储/状态模块、`src/lib/activity.ts`、`src/lib/status.ts` 和经过审核的 v1 回退快照部署到状态服务代码目录。新服务不需要 Astro、数据库、Runtime、ccusage 或作者 Node 进程。Node 必须为 24。
2. 根据 `deploy/status/activity.env.example` 创建仅服务账户可读的 `/etc/moriium/activity.env`，配置用于贡献日历的 GitHub 凭据。不要通过终端参数、浏览器或 Git 提交传递密钥。
3. 检查 `/var/lib/moriium-status/public/current.json` 中最新已发布 v1 快照。新采集器首次启动会校验哈希并冻结这份历史；没有已发布数据时才读本地回退文件。已有 v2 指针时不会重新导入 v1。
4. 安装 `moriium-activity.service` / `.timer`，先手动运行服务，核对三来源结果、token 上游时间、公开文件哈希、legacy 历史引用及隐私白名单。单源失败时服务以非零退出，但仍发布其余成功来源与保留数据。
5. 合入 Nginx 的两个 v2 静态路径并检查配置；私有锁、v1 inbox、环境文件与源码均不可公开。首次接口验证通过后才启用 timer，并观察一次实际定时更新。
6. 前端改用 v2 后，再核对和停用旧 Windows 上传任务。不要删除历史或清空 pending 来模拟切换成功。旧 v1 publisher 和服务可以继续为未迁移客户端提供历史数据，直到单独退役。

小时 timer 在运行期间周期拉取，开机两分钟补跑；离线时保留现有数据，恢复后取回上游保留的历史。它不能让未运行的设备提交器产生新 tokens 数据。各设备仍需按 tokens 官方指引单独配置自动提交，并观察提交时间确实推进。

## Claude 前端接入合同

本轮没有改 About 的布局、样式、文案或浏览器入口。现有页面仍消费 v1；仅部署新后端不会让旧页面自动改用 v2。

- 读取 `/status-data/activity-v2/current.json`，校验固定同源路径和 SHA-256 后消费 v2 文件；失败保留此前内容并显示过期/不可用。
- 三个来源分开显示。GitHub 的值是贡献；Codex / Claude 是 tokens.ci 计数。来源和日界直接说明，不把 tokens 用量当作账单或在线状态。
- `snapshot=null` 代表没有成功快照，不是零。缺失日期不能默认为已测量的零；显式 value=0 才是已测量零。当前日可能尚未完整。
- 使用 `snapshot.updatedAt` 表示上游档案更新时间、`fetchedAt` 表示拉取时间。tokens 的档案时间属于整个账号，不代表某客户端的最后活动。来源失败不隐藏仍有效的其他来源，也不能把发布当前时间显示成统计更新。
- v1 `legacy.url` 提供独立“旧统计”视图/链接，并说明账户侧 Codex、ccusage / Cowork 的旧口径。不要拼接到同一条新统计中。
- 保留无 JS 的审核后静态快照，不让访客请求直接连接 tokens.ci / GitHub 或依赖作者 Node。
- 旧 `/status-data/current.json` 里的 Activity 状态仍是旧上传链的状态。前端切换后应根据 v2 元数据展示新的拉取状态，不混用旧 status 行作为新链路健康证明。

Runtime 的独立后端交接：桌面不再注册 `activity_call/activity_setup/usage_call/usage_pick/usage_cancel`；Claude 移除对应前端调用和页面，Memory、Provider、Windows 外壳保留。旧独立程序与个人数据暂留。

## 回退

停止新 timer 后保留所有 v2 文件。前端回到旧 v1 只能说明展示旧快照，不能宣称恢复了持续采集。恢复旧上传器前，核对任务及 pending 的实际状态；新旧数据命名空间始终分开。任何删除账本、归档、已安装程序或任务的动作均不属于本次源码修改。
