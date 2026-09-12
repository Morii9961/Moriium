---
title: 视频嵌入的几种比例
slug: zh/video-embeds
summary: YouTube 与 Bilibili 的视频在读者点击之前只是占位链接。这里放了 16:9、4:3 和竖屏三种比例，检查占位尺寸、点击后的加载，以及禁用脚本时能否跳转到视频页面。
publishedAt: 2026-07-20T12:00:00+08:00
lang: zh
translationKey: testbed-video
category: 影像
tags:
  - 视频
  - 第三方嵌入
  - 测试
draft: false
unlisted: false
copyProtection: false
---

视频是第三方内容。Moriium 不会在页面打开时加载任何播放器，只有读者主动点击后，才会把占位换成嵌入框。

## YouTube · 16:9

::video{provider="youtube" id="aqz-KE-bpKQ" title="Big Buck Bunny" ratio="16/9"}

## YouTube · 4:3

老视频常见的 4:3 比例，占位框应该比 16:9 更高：

::video{provider="youtube" id="jNQXAC9IVRw" title="Me at the zoo" ratio="4/3"}

## Bilibili · 16:9

::video{provider="bilibili" id="BV1GJ411x7h7" title="Bilibili 播放器加载测试" ratio="16/9"}

## 竖屏 · 9:16

竖屏视频在桌面上不应该高到超出一屏：

::video{provider="youtube" id="aqz-KE-bpKQ" title="竖屏比例占位测试" ratio="9/16"}

## 本地视频

本地视频使用原生播放器，并且不预加载。这篇暂时没有放本地视频，因为测试环境里没有可用的编码工具来生成一段干净的样片。
