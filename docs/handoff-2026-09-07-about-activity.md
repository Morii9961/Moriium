# 关于页活动热力图交接

> **后续**：数据来源已在 2026-09-08 重做，见
> [`handoff-2026-09-08-activity-data-sources.md`](handoff-2026-09-08-activity-data-sources.md)。
> 本文的组件与验收记录仍然有效，但其中的数据总量、来源描述和「AI 用量来自本机日志」
> 这一说法已被取代。

## 2026-09-08 续做结果

Morii 已要求 Codex 继续。热力图的本地实现与验收已完成；下文保留为
9 月 7 日交接快照，其中“尚未验收”、临时预览路由和旧数据总量已过时。
临时路由已被移除，独立的 `data-activity-calendar` 选择器已保留。

- 三来源数据刷新至上海时间 9 月 8 日 07:00：GitHub 335 次贡献；
  Codex 1,068,259,259 Token、44 个记录日；Claude Code 1,596,972,969 Token、10 个记录日。
- `pnpm check`、`pnpm build`、`pnpm links`、`pnpm split` 通过。
  全量测试有 8 项后台本地化断言失败，涉及发布门禁、文章、认证、媒体和状态文案；
  本任务的热力图与关于页测试通过。未修改其他任务的后台文案或测试。
- 中日英页面、明暗主题和 375/390/768/1024/1440 宽度已检查；
  方向键和日期输入读数正确。屏蔽全部脚本后，原生明细表仍可展开阅读。
- 实际启动后停止本次构建的 Node 服务，确认端口不可连接；独立静态服务器
  上的三语言关于页均返回 200，每页含三张日历。
- 公开 JSON 字段白名单检查通过，热力图脚本构建后为 1,173 字节，首页不加载。
  模拟采集工具缺失后退出码为 1，快照文件哈希保持不变。
- 已补充 `docs/design-research.md` 和 `docs/design-system.md` 的局部实现记录。
  没有提交、推送、部署或配置自动采集。后续用 `pnpm activity:collect` 手动刷新。

日期：2026-09-07。交接给 Claude。Morii 因剩余限额约 25%，要求 Codex 停止实现并立即交接。

## 当前结论

三个热力图组件、数据采集脚本和真实数据已写入工作区，并接入最新关于页。尚未完成最终验收，不能直接声称可以发布。没有提交、推送、部署，也没有配置定时任务。

下一步先检查工作区是否还在被其他任务修改，再完成下面的验证和收尾。不要重写已有实现，也不要把全仓库未提交内容都当成本任务产物。

## Morii 已确认的需求

- 在关于页加入 GitHub、Codex、Claude Code 三张热力图。
- 复用开源数据解析能力，视觉适配 Moriium，兼顾手机和明暗主题。
- 使用这台电脑的全部 Codex、Claude Code 使用记录，**不限于 Moriium 项目**。
- 只导出每日汇总，不公开对话、项目路径、会话标题、模型明细或费用。
- 遇到需要 Morii 补充的内容及时说明。当前数据已能采集，不缺账号或 Token。
- 最新指令是起草交接，后续实现交给 Claude；没有远端操作授权。

## 先看这些文件

| 文件 | 本任务内容 |
| --- | --- |
| `src/components/AboutActivity.astro` | 关于页区块、三语言数据入口、构建时日期范围 |
| `src/components/ActivityHeatmap.astro` | 三个来源共用的日历、图例、总量、明细表 |
| `src/styles/activity.css` | 独立样式，使用现有公开站蓝色和字体变量 |
| `src/scripts/activity.ts` | 指针选日、方向键、日期输入和读数，仅相关页面加载 |
| `src/lib/activity.ts` | 公开数据类型、白名单投影、日期校验、365 日日历、色阶 |
| `src/data/activity-copy.ts` | 中、日、英文文案 |
| `src/data/activity.json` | 已采集的真实每日汇总，可供离线构建 |
| `scripts/collect-activity.mjs` | 本地采集入口，单来源失败保留旧快照，原子写文件 |
| `scripts/lib/activity-import.ts` | ccusage 与 GitHub 返回值的适配和总量校验 |
| `tests/activity.test.mjs` | 7 项数据、隐私、日期边界测试 |
| `docs/activity.md` | 英文操作说明、口径、失败处理和来源链接 |

本任务对已有文件只做了两类修改：

- `package.json` 增加 `activity:collect` 命令，未新增项目依赖。
- `src/pages/[lang]/about/index.astro` 增加 `AboutActivity` 导入，以及联系方式区块前的 `<AboutActivity lang={lang} />`。交接时分别位于第 4、154 行；行号可能继续变化。

还有一个**临时预览路由** `src/pages/design/activity/[lang].astro`，当前仍存在。它使用真实汇总数据、`noindex` 和正式组件。正式关于页已恢复，收尾时可删除本任务创建的这个文件。此前一次删除补丁因另一处上下文不匹配整体失败，文件并未删除。

## 并行修改边界

实现过程中，其他任务更新了站点字体、首页、关于页和多处文案。关于页曾短暂被删除，之后写回为精简版；Codex 没有恢复旧版正文，而是把组件重新插入新版。

交接时关于页标题为“这个地方”，结构是介绍、收存内容、站点说明、热力图、订阅与其他地址。不要恢复已被另一任务移除的时间线和站点原则。

`git status` 还显示 `src/data/site.ts`、BaseLayout、ArticleLayout、首页、归档、分类、标签、文章列表、404、Markdown 管线、ReaderEnhancements、加密脚本、服务端渲染等修改，以及 `src/markdown/reader-copy.mjs`。这些都不是本任务编写的内容。**不要回退、覆盖、顺手修复或整体暂存。** 接手先重新查看实际 diff。

Codex 曾询问 Morii 是否有另一任务重写关于页，尚未收到该问题的回复；文件随后实际恢复，已通过增量插入完成接入，无需为这个已消失的缺文件状态停工。

## 数据与口径

固定使用 **ccusage 20.0.20**，作为仓库外部工具缓存在忽略目录，不写入项目 dependencies 或 pnpm lockfile。

| 来源 | 快照日期行数 | 快照总量 |
| --- | ---: | ---: |
| GitHub | 365 | 334 次贡献，33 个活跃日 |
| Codex | 43 | 1,054,717,300 Token |
| Claude Code | 10 | 1,593,951,023 Token |

三个来源的采集时间均为 `2026-09-07T09:41:33.546Z`，即上海时间 17:41。以上是快照值，后续刷新会变化，不能当作当前账户额度。GitHub 使用现有 `gh` 登录读取官方 GraphQL，账号为 Morii9961，没有请求仓库名称或贡献详情。

关键适配：这个 ccusage 版本将 Codex 的缓存输入从 inputTokens 中分离。两个来源的归一化日报均满足：

```text
totalTokens = inputTokens + cacheReadTokens + cacheCreationTokens + outputTokens
```

reasoningOutputTokens 已含在 outputTokens 内，不再相加。两个来源的全部实际日报均按这个关系成功通过导入。不要改回“Codex inputTokens 已含缓存”的原始日志算法。

缺失日期为“未收录”，即使在两个活跃日之间，也不擅自填零。只有来源明确返回零，才显示零值。日期窗口为构建日往前 365 天，首尾补齐完整周；超出范围的格子隐藏。旧快照中的日期在后续日志清理时保留，但目前合并是按日期替换，不保证识别同一天部分日志被清理造成的下降。

AI 使用上海时区；GitHub 直接保留返回日期。AI 总量包含缓存，不代表订阅额度、实际费用或完整云端使用历史。原始日志去重、累计计数差值、子代理继承历史由 ccusage 负责，尚未独立审计所有本机原始事件。

两张 AI 图共用固定阈值：1,000,000 / 50,000,000 / 150,000,000。GitHub 阈值：3 / 10 / 25。图例由阈值生成，避免与颜色脱节。

## 本地环境和命令

当前预览由本任务启动，只监听本机：

- 正式关于页：`http://127.0.0.1:4187/zh/about/#about-activity-title`
- 独立预览：`http://127.0.0.1:4187/design/activity/zh/`
- `.astro/dev.json` 记录 PID **45964**、端口 **4187**。接手先验证进程仍存在；停止时只停止这个已确认的进程，避免影响其他任务服务。
- 日、英文正式页分别为 `/ja/about/`、`/en/about/`。

当前 ccusage CLI 缓存位置：

```text
.cache/npm-activity/_npx/1d5d785c4e847f44/node_modules/ccusage/src/cli.js
```

采集脚本会在缓存中寻找匹配版本，不依赖这个具体哈希。也支持 `MORIIUM_CCUSAGE_CLI` 指向另外安装的同版本 CLI。

```powershell
# 缓存工具尚不存在时，仅执行一次
npm exec --yes --offline=false --cache .cache/npm-activity --package=ccusage@20.0.20 -- ccusage --version

# 刷新全部，或单独指定 github / codex / claude
pnpm activity:collect
```

调查时生成的 `.cache/activity/codex.json` 和 `claude.json` 是原始日报输出，可能含模型和费用字段；它们被 Git 忽略，不要复制到 public、提交或发布。

Windows 沙箱曾造成 `gh auth status` 假性显示登录失效，以及测试启动前 `spawn EPERM`。在允许联网和创建子进程的环境中，现有 gh 登录有效，全部来源采集成功。不要因这些沙箱错误要求 Morii 重新提供凭据。真实失败仍需检查。

## 已有验证证据及其限度

- `pnpm check` 最后一次输出：152 files，0 errors / 0 warnings / 0 hints。此后又改了组件、交互布局和文案，需要重跑。
- 全量 `pnpm test` 在允许创建子进程的环境下实际运行过。**新增 activity 测试 7 项全部通过，但全量未通过**。运行时关于页被另一任务删除，about 测试失败；另有分类/标签等文案断言仍期望旧文本。不要将这些归因于热力图，也不要未经检查就修改别人的测试。输出过长，没有可靠保存最终失败总数。
- `pnpm build` 成功退出过，但当时关于页恰好不存在，输出列表没有正式 about 路由。因此那次构建**不能证明热力图已进入生产输出**，必须重新构建。
- 在当前 dev 预览，正式关于页可见三张真实数据图。375、390、768、1024 宽度做过 DOM 溢出检查，未发现水平溢出。1440 做过桌面截图检查；还需最终尺寸数值核验。
- 浏览器视口设置可能晚一帧生效。曾在设置 1024 后读到旧的 768，随后单独截图和读取才确认 1024。不能只记录请求宽度，要核对 innerWidth。
- 看过手机浅色、桌面浅色和桌面深色。日期查询在 Codex 选择 `2026-06-03`，页面读数为 **82,589 Token**；键盘 Home 后 ArrowRight 得到 `2025-09-15 · 未收录`，行为符合按周向右移动。
- 最后把未收录格子的密集条纹改成单条斜线，降低视觉噪声；这一最终修改还没重新截图。
- 尚未检查关闭 JavaScript、停止 Node 后的静态访问、最终 links/split、最终三语言布局、最终构建隐私与 bundle 边界。

## Claude 接手顺序

1. 读根 `AGENTS.md`、`DESIGN.md`，确认其他任务是否仍在写相同文件。保留所有无关改动。
2. 确认正式 about 中导入和实例各一次，检查当前组件、CSS 和真实数据。临时预览页可在不再需要后删除。
3. 做一次代码检查，尤其留意：零/未知/未来日期、年界闰日、主题色辨识、两段日历衔接、键盘焦点、日期查询、空数据状态和采集失败回退。
4. 重新运行 `pnpm check`、activity 测试，再构建。全量测试可运行并保存简洁结果，分清本任务回归和并行文案改动；不要盲目反复跑整套。
5. 确认 `dist/client/{zh,ja,en}/about/index.html` 包含三张日历和静态明细，主页没有热力图模块，公开页没有新增 Vue/Tiptap 依赖，也没有原始日报、路径或费用字段。
6. 运行 `pnpm links`、`pnpm split`，按项目要求做相关隐私检查。用非 Node 静态文件服务检查 about，并实际停止本任务的 Node 预览进程后再次访问；现有 split 脚本只检查文件，不等同于实际停止进程的证据。
7. 完成五种宽度、两种主题、三语言、无脚本验证。必要时刷新当天数据后再构建。无需为这三张静态图加 UI 框架、数据库或公共 API。
8. 补记 `docs/design-research.md` 和 `docs/design-system.md`。Codex 还没写这两份记录。只追加热力图相关事实，不顺便整理其他任务的历史状态。
9. 向 Morii 展示正式关于页预览，说明实际检查结果和仍缺的条件。未获明确授权，不提交、推送或部署。

## 已核对的上游来源

- https://github.com/ccusage/ccusage （实际采用其 npm 工具，MIT）
- https://ccusage.com/guide/json-output
- https://ccusage.com/guide/codex/
- https://docs.github.com/en/graphql/reference/users#contributioncalendar
- https://docs.astro.build/en/guides/client-side-scripts/

研究阶段还看过 Tokscale、Cal-Heatmap 和 React Activity Calendar。当前实现未复制它们的 UI、代码或样式，也没有安装这些项目。公开图表是 Moriium 自己的 Astro/HTML/CSS 实现。
