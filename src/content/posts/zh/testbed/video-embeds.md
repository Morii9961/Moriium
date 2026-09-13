---
title: 视频嵌入的几种比例
slug: zh/video-embeds
summary: YouTube 与 Bilibili 的播放器直接放在页面里，由浏览器按懒加载距离加载，不会自动播放。这里放了 16:9、4:3 和竖屏三种比例，检查播放器尺寸、懒加载，以及禁用脚本时是否照常可用。
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

视频是第三方内容。播放器直接写在页面里，不需要点击，也不会自己开始播放。何时加载由浏览器决定：Chrome 会提前一两屏开始加载，所以这篇文章一打开，四个播放器就都会连接外部服务；只有长文章里很靠后的视频才会晚一些加载。

## YouTube · 16:9

::video{provider="youtube" id="aqz-KE-bpKQ" title="Big Buck Bunny" ratio="16/9"}

## YouTube · 4:3

老视频常见的 4:3 比例，播放器应该比 16:9 更高：

::video{provider="youtube" id="jNQXAC9IVRw" title="Me at the zoo" ratio="4/3"}

## Bilibili · 16:9

::video{provider="bilibili" id="BV1GJ411x7h7" title="Bilibili 播放器加载测试" ratio="16/9"}

## 竖屏 · 9:16

竖屏视频在桌面上不应该高到超出一屏：

::video{provider="youtube" id="aqz-KE-bpKQ" title="竖屏比例占位测试" ratio="9/16"}

## 本地视频

本地视频使用原生播放器，并且不预加载。这篇暂时没有放本地视频，因为测试环境里没有可用的编码工具来生成一段干净的样片。
