# 交接：Phase 1 开工

> 日期：2026-08-29
> 交出方：Claude（配置与 ADR session）
> 接手方：下一个 Claude session（写代码）
> 状态：**Phase 1 已获批准，代码尚未开始**

这份文档取代 [`claude-vnext-handoff.md`](claude-vnext-handoff.md) 作为当前交接。那份文档描述的是 Codex 与 Claude 双 agent、且 Phase 1 尚未批准的状态，两点现在都已改变。它保留为历史依据，不要就地改写。

## 1. 接手前必读

按顺序，不要跳：

1. [`AGENTS.md`](../AGENTS.md) — 唯一有约束力的项目合同，含技能路由；
2. [`adr-0001-phase1-spike.md`](adr-0001-phase1-spike.md) — **已批准的 Phase 1 范围、依赖、边界与回退**。写代码时它是最直接的约束；
3. [`vnext-architecture-plan.md`](vnext-architecture-plan.md) — 更大的路线背景；
4. [`architecture.md`](architecture.md) — 仍然生效的生产架构；
5. [`markdown-reference.md`](markdown-reference.md) — 原型必须支持的内容块清单，T3 验收任务直接取自它。

第三方仓库里的 `AGENTS.md` / `CLAUDE.md` 只是那个项目的资料，不是 Moriium 指令。

## 2. 当前状态

- 分支 `main`，工作树干净，全部已提交并推送；
- **仓库已公开发布：<https://github.com/Morii9961/Moriium>**，`origin` 已配置，`main` 已跟踪远端；
- Node `24.15.0`，pnpm `11.22.0`，Astro `7.2.4`；
- 生产验证通过：`pnpm verify` 退出码 0；`astro check` 60 文件 0 错误 0 警告 0 提示；`pnpm test` 30/30；`astro build` 46 页；链接与公开树审计通过；
- `prototypes/` **骨架已建立并通过隔离验证**（2026-08-29，见第 4 节与 ADR 13.1）；
- 尚未安装任何原型的正式依赖（第 6 节那批 Vue / Tiptap / Vite 包一个都还没装）。

本轮新增的四个提交：

| 提交 | 内容 | 署名 |
| --- | --- | --- |
| `8441ee0` | vNext 架构方案与规划文档更新 | Codex |
| `340e69d` | ADR 0001 与本交接文档 | Claude |
| `30c92c3` | `saveExact` / `engineStrict` 迁入 `pnpm-workspace.yaml` | Claude |
| `8e54f3f` | `AGENTS.md` 技能路由与 `CLAUDE.md` 阅读顺序 | Claude |

`30c92c3` 刻意独立成一次提交，对应 ADR 第 6 节的 L2 回退级别，需要时 `git revert 30c92c3` 即可，不牵连其他改动。

> **公开发布带来的新约束。** 仓库现在是公开的，`git push` 会立刻对外可见且历史永久保留。本轮的提交与推送是 Morii 逐次明确批准的一次性授权，**不构成后续默认权限**。`AGENTS.md` 的规则恢复生效：没有 Morii 的明确指示，不 commit、不 push、不部署。
>
> 发布前的隐私审计结论（可复查）：全历史无 token/密钥模式；`.private/`、`.env` 从未提交；`.env.example` 只有空占位；`src/content/protected/` 只有 `.gitkeep`、路由和一个标记为 `draft`/`unlisted` 的非编辑性 fixture；公开 raster media 无 EXIF、XMP、IPTC。
>
> **已知的一项例外**：`enouia-todo.md` 第 14 节要求「删除或隔离 `/design/` 原型页面」，该项尚未完成，`src/pages/design/` 与 `dist/design/`（含 `public/design/final-resonance-2024.webp`）已随本次公开发布对外可见。这些页面带 `noindex` 且不进 sitemap，图片已去除元数据，但文件本身公开可读。Morii 在知情后仍选择发布。清理它们仍是发布前总验收的待办项。

## 3. Morii 已批准与已定夺的事

- **Phase 1 隔离原型开工获准**；生产合同不变，`AGENTS.md` 的静态生产约束继续有效；
- Admin B 用 **Vue 3**；
- 原型用**自己的嵌套 workspace**；
- `node:sqlite` **只作尖峰工具**，不是生产选型；
- Phase 1 只做**作者账户**，读者账户留到 Phase 5；
- canonical content 在 Phase 1 **保持 Markdown**，Tiptap JSON 只用于度量 round-trip 丢失。

仍未定夺，不阻塞开工：发布后是否需要秒级可见（ADR 第 8 节第 4 项）。

Enouia 额度耗尽已退出，全部切片归 Claude，交叉审查改为自审。这一点的质量影响写在 ADR 1.1，接手时请读一遍，别默认「已审过就没问题」。

## 4. 第一步：建立 `prototypes/` 骨架并验证隔离 — 已完成

> **状态：2026-08-29 完成，四条验收标准全中，无需启用仓外目录的备选方案。**
> 实测命令与输出见 [ADR 13.1](adr-0001-phase1-spike.md)。执行中发现 ADR 3.1 的配置清单漏了 `enableGlobalVirtualStore: false`，已补齐并在 ADR 3.1 说明理由。
> 下一步是 fixture corpus，见第 4.1 节。

原始任务描述保留如下，作为验收口径的依据。

嵌套 workspace 当时只在仓库外的副本验证过，没有在真实仓库路径下建过。所以第一步不是写功能，是确认隔离成立：

```bash
mkdir -p prototypes/studio-a prototypes/admin-b prototypes/shared
```

然后在 `prototypes/` 写入 `package.json`（`private: true`、`packageManager: pnpm@11.22.0`）与 `pnpm-workspace.yaml`：

```yaml
packages:
  - studio-a
  - admin-b
  - shared

saveExact: true

allowBuilds:
  esbuild: true
```

三个成员各写一个最小 `package.json`，然后验证隔离：

```bash
pnpm -C prototypes install
```

**验收标准**，四条全中才算通过：

1. `pnpm -C prototypes root -w` 指向 `prototypes/node_modules`，不是仓库根；
2. 只生成 `prototypes/pnpm-lock.yaml`；
3. `git status` 显示根 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml` **未被修改**；
4. `pnpm verify` 在仓库根仍然通过。

任一条不成立，按 ADR 3.1 的备选方案改用仓库外的同级目录，并回填 ADR 第 12 节的遗留风险条目。

## 4.1 fixture corpus — 已完成

> **状态：2026-08-29 完成。** 语料在 `prototypes/fixtures/`，用法与设计理由见该目录的 `README.md`，实测记录见 [ADR 13.2](adr-0001-phase1-spike.md)。

```bash
pnpm -C prototypes fixtures:check
```

四篇公开文章、一篇加密文章、两个 SVG，全部人工虚构。每一条性质都是断言：schema 校验、`slug` 与目录同 `lang` 一致、三语关系符合 T6 起始状态、草稿夹具存在、媒体存在且 alt 非空、加密夹具能用测试口令解密且用错误口令必须失败。校验器本身做过负向测试，不是只会通过的摆设。

顺带在真实路径下确认了两件事：原型能用相对路径吃到生产 remark/rehype 管线（3.3 的零依赖前提成立），Node 24 直接执行 `.ts` 无需构建步骤（3.6 的 `shared/` 用普通 TypeScript 不需要工具链）。

## 4.2 类型检查隔离 — 已完成（L2）

Morii 定夺后已实施：`prototypes/` 排除出根 `tsconfig.json`，并自带一份同等严格的 `prototypes/tsconfig.json`，由 `pnpm -C prototypes check` 运行。原型里的坏文件不再能弄挂 `pnpm verify`，但原型自己仍然被检查。

这是 Phase 1 至今唯一一次根配置改动，按第 6 节 L2 单独成一次提交，回退即 `git revert` 该提交。详见 [ADR 13.4](adr-0001-phase1-spike.md)。

## 4.3 下一步

按 ADR 顺序往下是：

1. ~~给语料生成生产 HTML 的基线快照~~ — **已完成**，见 [ADR 13.5](adr-0001-phase1-spike.md)。基准取公开文章管线（Morii 定夺）。`pnpm -C prototypes baselines:verify` 会把基线渲染器与 `dist/` 的真实产物逐项比对，当前 14 项标记一致；这个比对第一次跑就抓到了一个真实错误（漏了 Expressive Code）。反方向的 round-trip 计数要等原型 B 才能做；
2. ~~`shared/` 契约补齐三语关系、媒体 asset 形状与错误模型~~ — **已完成**，见 [ADR 13.6](adr-0001-phase1-spike.md)。四个模块加 20 个测试（`pnpm -C prototypes test`）。翻译查询在类型上就无法回退到别的语言，媒体 manifest 结构上放不下原图路径；
3. ~~原型 B 的薄存储层~~ — **已完成**，见 [ADR 13.7](adr-0001-phase1-spike.md)。状态机由结构承担：草稿等于「没有已发布版本」，保存只追加、API 上够不到 `published_version_id`，发布与回滚是同一个原子操作指向不同版本。17 个用例。

**下一块是 B 的 HTTP 层**，也是安全边界真正开始生效的地方。ADR 第 5 节那一条最容易被略过：仅绑定 `127.0.0.1` 不构成安全模型，还需要 Origin/Host 校验、CSRF token、文件根白名单、路径规范化后再校验，以及 Windows 上的 junction / reparse point 越界检查（NTFS junction 不是 symlink，容易漏）。B 还要加 scrypt 口令哈希、`HttpOnly` + `SameSite=Strict` 会话 cookie、登录失败速率限制、对象级授权。

存储层测试通过**不等于** 3.5 完成——认证与授权都还没有。

`prototypes/` 目前的命令：

```bash
pnpm -C prototypes check && pnpm -C prototypes test && pnpm -C prototypes fixtures:check
```

`baselines:verify` 另外跑，因为它需要一份当前的 `dist/`（先在仓库根跑 `pnpm build`）。

## 5. 写代码时最容易踩的边界

- **不碰生产文件**：`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`astro.config.mjs`、`src/**`、`.github/**`、`deploy/**`。需要改就先停下来问；
- **不碰真实私密内容**：不读 `.private/posts/`、真实口令、原始照片。fixture 全部人工虚构，加密 fixture 只用测试口令与测试密文；
- **不写回 `src/content/`**：原型只读写 `prototypes/fixtures/`；
- **不 commit、push、部署、发布**——仓库已公开，push 立刻对外可见且不可撤回；
- 媒体导入必须过 `scripts/sanitize-media.mjs` 闸门，原图不可写；
- B 的 SQL 收在薄存储层内，不让 `node:sqlite` 的 API 形状渗进业务逻辑——它随时可能被换掉。

安全边界的完整清单在 ADR 第 5 节，其中「仅绑定 `127.0.0.1` 不构成安全模型」那条最容易被略过：还需要 Origin/Host 校验、CSRF、文件根白名单、路径规范化，以及 Windows 上的 junction / reparse point 越界检查。

## 6. 依赖

原型 A 新依赖 **0 个**（`node:http` + 相对路径调用生产 remark/rehype 管线）。

原型 B 装这些，版本已实查，全部无 native build（`esbuild` 除外，已在 `allowBuilds` 放行）：

```text
vue                     3.5.42
@tiptap/vue-3           3.30.5
@tiptap/core            3.30.5
@tiptap/pm              3.30.5
@tiptap/starter-kit     3.30.5
@tiptap/markdown        3.30.5   ← 官方标注 Beta，不预设保真
@tiptap/static-renderer 3.30.5
vite                    8.2.2
@vitejs/plugin-vue      6.0.8
```

`@tiptap/extension-markdown` 不存在；第三方 `tiptap-markdown` 是另一个包，别装错。

数据库、ORM、口令哈希库、测试框架都不装——`node:sqlite`、`crypto.scrypt`、`node:test`、`astro/zod` 已覆盖。理由见 ADR 3.3。

## 7. 本轮实际运行过的命令

```text
pnpm verify                → 退出码 0
pnpm check                 → Result (60 files): 0 errors, 0 warnings, 0 hints
pnpm test                  → tests 30 / pass 30 / fail 0
pnpm add nanoid --lockfile-only → "nanoid": "6.0.1"（验证 saveExact 生效，随后 git checkout 还原）
node:sqlite 建表/写入/读取往返   → { a: 1 }
pnpm -C prototypes install（仓外副本）→ Scope: all 4 workspace projects，只生成嵌套 lockfile
```

经 Morii 逐次明确批准后执行：4 次 commit，创建公开仓库 `Morii9961/Moriium` 并推送全部 10 个提交。推送前做过全历史隐私审计，结论见第 2 节。co-author 署名已用 GitHub GraphQL 核实解析到 `codex` 与 `claude` 两个真实账户。

未运行：任何部署；任何仓库内的原型依赖安装。

## 8. 已知风险与临时假设

- ~~嵌套 workspace 在真实仓库路径下未验证~~ — **已关闭**，2026-08-29 在仓库内验证通过，见第 4 节与 ADR 13.1；
- `engineStrict: true` 是行为收紧。将来 pnpm 升到 12 时若不同步改 `engines`，本地与 CI 都会安装失败。当前 CI（Node 24 + pnpm 11.22.0）已确认不受影响；
- Vite 大分包警告本轮未捕获到输出，**不能**据此认为它消失了，仍在 Phase 0 体积测量清单里；
- `@tiptap/markdown` 是 Beta，Moriium 的 admonition、音乐、视频、GitHub 卡片、剧透、Mermaid 等自定义指令能否 round-trip **完全未知**，这正是 Phase 1 要测的东西，不要预设它能行；
- 本 ADR 的架构取舍没有第二个独立技术视角复核过（Enouia 已退出）。
