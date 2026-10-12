# 2026-10-05 Enouia 子站部署记录

Morii 已明确要求部署现有 Enouia 子站并挂载到 `enouia.morii9961.top`。本次部署使用仓库 `enouia/` 中已选定的实现，没有重新选择或修改视觉设计。

## 当前部署

- 地址：`https://enouia.morii9961.top/`；HTTP 重定向至 HTTPS。
- 腾讯云 DNSPod 新增 `enouia A 106.55.19.189`，默认线路，TTL 600。主域名和 `www` 的记录保持原配置。
- 源码基础：`fd48f88c8b480480fd48a8efe36ef400b3be99b8` 的 `enouia/`。在 VPS 的独立 workspace 中执行冻结 lockfile 安装及 `pnpm verify`。
- 静态目录：`/var/www/enouia/current`，指向 `releases/fd48f88c8b480480fd48a8efe36ef400b3be99b8-20261005`。发布目录由 root 拥有，Nginx 读取；只有 9 个构建输出文件。
- Nginx 配置：`/etc/nginx/sites-available/enouia.conf`，对应仓库 `enouia/deploy/nginx.conf`。不代理后台、数据库或 API；没有 Enouia 常驻 Node 进程。
- Enouia 与主站拥有独立的发布目录和证书。主站 `current`、后台进程和证书保持原状态。
- Let's Encrypt ECDSA 证书覆盖 `enouia.morii9961.top`，有效期至 2027-01-03 00:37:39 UTC。使用 `http-01`、webroot `/var/www/letsencrypt` 及 `systemctl reload nginx` 部署钩子；现有 `certbot.timer` 负责定时续期。

## 验证结果

- VPS `pnpm --dir /var/www/moriium/workspace/enouia verify` 通过：6 个源文件的 Astro 检查无错误、警告或提示，构建一个静态页面；9 个输出文件共 426496 字节，JavaScript 1191 字节。内置静态资源、锚点、隔离、体积及交互逻辑检查通过。
- 4 个发布 WebP 的媒体检查未发现 EXIF、XMP 或 IPTC；本次源码属于此前主站发布前已通过的 Git 历史隐私审计范围。
- `nginx -t` 通过。浏览器及用户电脑 curl 的正式 HTTPS 校验成功，首页返回 200，HTTP 返回指向子域名 HTTPS 的 301。
- 正式域名全部 9 个静态文件均返回 200；`/admin/`、`/api/`、`/package.json`、`/src/pages/index.astro` 返回 404，`/.env` 返回 403。
- 在独立的 loopback Nginx 与 Astro preview 验收实例中，停止该 Node preview 后确认 4344 不再监听，9 个静态文件仍均返回 200。验收实例随后退出；未停止正式 Moriium Admin。
- `certbot renew --cert-name enouia.morii9961.top --dry-run --run-deploy-hooks --non-interactive` 成功，自动续期配置与 reload 钩子已核对。
- 1.1.1.1 与 8.8.8.8 均解析至新 VPS。
- 正式页面在 375、390、768、1024、1440 CSS 像素宽度下未发现横向溢出。图片加载成功；原生滑块响应 Home、ArrowRight，值与辅助标签一致；滚动后保留手动设定值。浏览器捕获的错误日志为空。
- 主站仍返回 200，原发布软链接未改变。

## 边界

- 本次未修改视觉、内容或前端依赖。沿用上一次主站 `pnpm verify` 的有效证据，单独运行 Enouia 的完整验证及实际 Nginx、DNS、TLS 验收。
- 本次浏览器检查是桌面视口模拟，不代表真实触屏、对比度测量或无 JavaScript 浏览器验收。减少动态效果由现有构建模块测试覆盖。
- 此为首次 Enouia 发布，尚无上一版生产目录可作回滚演练；后续发布应保留并独立切换 Enouia 的 `current`。
- GitHub Actions 的现有主站部署流程不会发布 Enouia；本次没有启用新的自动发布流程。
- 备案继续按 Morii 的要求搁置。代码、配置和记录留在本地工作树，未提交或推送。
