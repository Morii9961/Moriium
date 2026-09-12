---
title: 城市散步：一组用来测试画廊的图
slug: zh/city-walk-photos
summary: 横幅、竖幅、超宽全景、正方形、极窄长图和很小的缩略图各一张。图片本身是脚本生成的几何构图，用来检验题图、图注、灯箱缩放、键盘切换和焦点返回。
publishedAt: 2026-08-15T17:40:00+08:00
lang: zh
translationKey: testbed-city-walk
category: 摄影
tags:
  - 摄影
  - 城市
  - 散步
  - 测试
cover: /fixtures/test-posts/cover-city-walk.webp
coverAlt: 暮色蓝调的几何构图，一条横贯画面的地平线上方悬着一个橙色圆形
draft: false
unlisted: false
copyProtection: false
---

这组图没有真实的地点。它们是用脚本生成的几何构图，尺寸和比例是刻意挑过的：每一张都对应一种在真实摄影文章里会遇到的形状。点开任何一张都会进入灯箱，可以用左右方向键切换，按 <kbd>Esc</kbd> 关闭后，焦点应该回到刚才点开的那张图上。

## 横幅

![暮色蓝调的横幅构图，地平线上有几块深浅不同的矩形](/fixtures/test-posts/walk-01-landscape.webp "横幅 1600×1067，最常见的 3:2 比例")

## 竖幅

竖幅照片在桌面上不应该被放大到占满整屏高度，否则读者要滚很久才能看到下一段文字。

![米白纸色的竖幅构图，地平线附近立着几块暗色矩形](/fixtures/test-posts/walk-02-portrait.webp "竖幅 1000×1500")

## 全景

![深海蓝的超宽全景构图，地平线上排列着细长的矩形](/fixtures/test-posts/walk-03-panorama.webp "全景 3000×900，比例接近 10:3")

## 正方形与没有图注的图

下面这张没有写标题，所以不会生成图注，只是一张可以点开的图。

![苔绿色的正方形构图，一个金色圆形悬在地平线上方](/fixtures/test-posts/walk-04-square.webp)

## 极端比例

![黑白灰的极窄长图，下半部分排列着几道浅色横线](/fixtures/test-posts/walk-05-tall.webp "长图 800×2000，检查灯箱能否把它完整缩放进屏幕")

这张图只有 320×200，灯箱打开时不应该把它强行放大到模糊：

![很小的米白色缩略图，中间有一个暗红色圆形](/fixtures/test-posts/walk-06-small.webp "小图 320×200")

## 段落中的图

图片也可以出现在一句话中间 ![行内引用的小图，米白底色上一个暗红色圆形](/fixtures/test-posts/walk-06-small.webp) 这时它不会变成独立的图版，但仍然可以点开。

同一段里连续放两张图：
![暮色蓝调横幅的第二次引用](/fixtures/test-posts/walk-01-landscape.webp)
![苔绿色正方形的第二次引用](/fixtures/test-posts/walk-04-square.webp)

## 长图注

![深海蓝全景的第二次引用](/fixtures/test-posts/walk-03-panorama.webp "这是一条故意写得很长的图注，用来检查图注在窄屏上折成多行时是否仍然和图片左对齐、字号是否比正文小一级、颜色是否足够浅又不至于看不清，以及它和下一段正文之间的距离是否合适")

散步到这里就结束了。
