# 2026-10-05 VPS 部署记录

Morii 已明确授权本次 VPS 部署、域名解析切换及无用 DNS 清理；备案暂时搁置。本记录说明已完成的部署，不代表 ADR 0002 的全部生产验收已完成。

## 当前部署

- 腾讯云广州轻量服务器 `moriium-vps`，公网 IPv4 `106.55.19.189`，Ubuntu 24.04。
- 基础源码为 `fd48f88c8b480480fd48a8efe36ef400b3be99b8`，另应用本次部署修复：systemd 允许 `AF_NETLINK`、后台启动探针有限重试、Nginx HTTP ACME 验证路径。
- 公共静态目录：`/var/www/moriium/current`，指向 `releases/fd48f88c8b480480fd48a8efe36ef400b3be99b8`。Node 后台仅监听 `127.0.0.1:4321`，Nginx 仅代理 `/admin/` 与 `/api/`。
- `nginx`、`moriium-admin`、`fail2ban` 已启动。云防火墙保留原有 SSH、HTTP、ICMP 规则，新增 TCP 443。
- `morii9961.top` 与 `www.morii9961.top` 的 A 记录均为 `106.55.19.189`，TTL 600。旧地址 `38.22.234.39` 已替换；两条已完成用途的 `_acme-challenge` TXT 记录已删除。
- HTTP 和 HTTPS `www` 均重定向至 `https://morii9961.top`。
- Let's Encrypt ECDSA 证书覆盖主域名及 `www`，有效期至 2027-01-03 00:12:59 UTC。已从手动 DNS 验证改为 HTTP webroot `/var/www/letsencrypt`，部署钩子为 `systemctl reload nginx`，`certbot.timer` 已启用。
- 正式 Nginx 配置为 `/etc/nginx/sites-available/moriium.conf`，证书路径由安装时写入。原默认站点软链接保存在 `/etc/nginx/sites-disabled/default-20261005`；隔离验收配置只监听 `127.0.0.1:8080`。

## 已记录的验证

- 本地最终 `pnpm verify` 通过：401 项测试，397 通过、0 失败、3 跳过、1 todo；内容、媒体、构建、链接、隐私历史审计、Public/Admin 渲染隔离与体积检查通过。完整输出保存在本机忽略目录 `.astro/deployment-verify-final.log`。
- VPS 实际构建成功；Linux 测试 397 通过、0 失败。Nginx、systemd、sudoers 与 fail2ban 配置检查通过。
- 在首次上线的隔离验收阶段，确认 Node 已停止且 4321 未监听时，三语首页、文章、RSS、sitemap 和三语搜索索引仍返回 200，之后恢复后台。
- 正式域名的公网证书校验通过；三语首页、中文文章、RSS、sitemap、搜索索引和后台页面返回 200。HTTP 与 `www` 返回正确的 301。
- 1.1.1.1 与 8.8.8.8 均已解析两个域名至新 VPS。
- `certbot reconfigure --webroot --preferred-challenges http --run-deploy-hooks` 的模拟续期成功，最终配置已核对为 `http-01`、`webroot` 及 Nginx reload 钩子。
- 浏览器正式 HTTPS 首页与静态搜索正常，搜索“白纸”返回真实文章；主题切换后刷新保持选择。首页和文章此前在隔离预览中检查过 375、390、768、1024、1440 宽度。

## 未完成及后续边界

- 备案按 Morii 要求搁置。此前备案控制台的服务角色授权动作被自动审批拒绝，未继续授权。
- 未创建正式作者账号或配置作者密码；数据库是新部署的空数据库，仓库现有公开文章已正常生成。
- 未配置真实异地备份、GitHub Actions 部署凭据或自动发布开关；未声称完成异地恢复、正式账号登录、fail2ban 实际封禁或完整生产回滚演练。
- 本次代码修复与本记录留在本地工作树，未提交、推送。
