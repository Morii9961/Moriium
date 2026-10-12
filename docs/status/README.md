# 项目状态快照使用说明

这是 Moriium 主站的手动进度记录，采用 Project Status Protocol v1。首次基线由本轮生成；Morii 可明确要求修订当前报告，或发出 **「生成项目状态快照」** 生成新快照。

- [PROJECT_STATUS.md](PROJECT_STATUS.md)：给 Morii 阅读的中文报告。
- [project-status.json](project-status.json)：供 Moriium Dashboard 手动导入的同一份状态。
- 继续使用既有计划、任务、部署交接及验收清单作为依据；快照只汇总，不建立第二套任务系统。
- About 页运行状态、活动数据与本目录项目进度用途不同，不共用协议或发布链路。

## 手动更新与导出

1. Morii 在主站仓库会话中发出「生成项目状态快照」。Agent 只读核对当前分支、完整提交号、工作树、近期提交，以及与状态有关的既有记录。
2. 同次更新 Markdown 与 JSON。时间使用实际生成时刻，按 Asia/Shanghai 写为带 `+08:00` 的 ISO 8601；记录未提交或未跟踪依据，不能把它们归入提交内容。
3. 检查 JSON 语法、必填字段、枚举、引用与两份内容的一致性。这个触发语只授权状态文档更新，不授权运行测试、构建、安装、服务、部署或执行报告中的下一步。更新协议继续固定 `tests_rerun: false`。
4. 在 Dashboard 的手动导入入口选择 `project-status.json`；若该入口尚未提供，保留文件待导入。JSON 本身就是导出文件，无需额外工具。本轮只交付文件，未验证 Dashboard 的导入界面或导入结果。
5. Markdown 中的阶段、摘要、成果、缺口、阻碍、待决事项、三项行动、时间和来源必须与 JSON 一致。JSON 可以保留更详细的证据引用；每次更新覆盖当前快照，历史是否入 Git 由 Morii 另行决定。

只读文件与元数据检查不会执行项目测试。若核实当前部署、补跑验收或更改配置确有必要，应在另一个明确授权的工作范围处理，再将其已有记录纳入下一次快照。

## 百分比的估算口径

按 Morii 本次要求，采用既有路线的加权里程碑，避免把成熟功能与运维尾项等量平均。这组权重由 Agent 根据工作范围拟定，用于沟通，不是实测工时或 Morii 的验收结论。

| 里程碑 ID | 路线权重 | 本次计入 |
| --- | --- | --- |
| `public_core` | 45 | 45 |
| `public_design` | 15 | 15 |
| `public_deployment_record` | 20 | 20 |
| `production_acceptance` | 12 | 0 |
| `icp_preparation` | 5 | 0 |
| `vps_activity_activation` | 3 | 0 |
| 合计 | 100 | 80 |

本次只给有明确历史完成记录的 `done` 里程碑计入全部权重；其余收尾尚未闭环，暂不计入，不编造部分完成率。整体为 `80 / 100 × 100% = 80%`，表示路线工作约完成八成，不能解释为当前生产正常率、验收率或剩余工期只有两成。

心跳、Gallery 和普通微调不纳入；确认必需的修补归入生产验收。活动启用先保留 3 点收尾工作，若 Morii 明确后置，从首发口径剔除并重新计算，不能把后置改成 `done`。依据、权重、计入规则与结果同步写入 JSON 的 `source.basis`，协议字段不增加也不改名。范围改变或证据不足时重新说明估算；无法支撑数字则回到 `null`。阶段和 `human_acceptance` 仍独立记录。

## 协议 v1

根对象必须包含以下字段，不改名、不改含义：

| 字段 | 约束 |
| --- | --- |
| `schema_version` | 固定字符串 `"1.0"` |
| `project_id` | 固定字符串 `"moriium.main"` |
| `project_name` | 固定字符串 `"Moriium 主站"` |
| `snapshot_at` | 实际生成时刻的 ISO 8601，带时区 |
| `source` | `branch`、`commit_sha` 为字符串或无法取得时为 `null`；`basis` 为实际读取的文件、提交、既有记录或一手资料引用数组；`tests_rerun` 固定 `false` |
| `stage` | `planning / development / integration / acceptance / launch_preparation / live / maintenance / paused / unknown` |
| `summary` | 不超过 160 字的中文摘要 |
| `overall_progress` | 数字 0–100 或 `null`；只有明确里程碑与估算依据才填数字 |
| `milestones` | 数组；每项包含 `id`、`title`、`status`、`evidence_level`、`evidence_refs`、`human_acceptance` |
| `blockers` | 数组；每项包含 `title`、`impact` |
| `next_actions` | 通常最多三项；每项包含 `title`、`priority`（`P0 / P1 / P2`）、`result`（具体产物或可验结果） |
| `needs_morii` | 数组；每项包含 `decision` |

里程碑字段：

- `status`：`not_started / in_progress / blocked / done / unknown`。
- `evidence_level`：`self_report / repository / existing_test / morii_accepted / unknown`。
- `evidence_refs`：证据文件、提交或既有测试记录的路径/引用数组。
- `human_acceptance`：`pending / accepted / rejected / not_required / unknown`。

`done` 只说明该条标题界定的成果有完成依据；历史部署验证完成不代表当前站点在线，更不代表全量生产验收通过。`existing_test` 必须指向已读到的既有验证记录，并写明时间和适用范围；本轮不重新验证。设计选择或部署授权也不等于对整个成果的人工验收。只有 Morii 的明确验收记录才能支持 `accepted` 或 `morii_accepted`。

未知信息用 `null`、空数组或 `unknown`；已知缺口写清影响，不无依据填写完成度、备案类型或验收结果。历史较新的实际执行记录可以更正旧计划中的状态，但不能替代当前在线核验。阶段围绕上线准备或已上线维护判断，不因运维尾项把成熟功能退回开发初期。

只记录进度元数据。账号、口令、密钥、证件材料、私密文章和原始媒体都不得进入快照；证件与备案授权由 Morii 在服务商办理。本机制不新增自动任务、进程、Webhook、CI、在线 Dashboard 连接或管理界面。
