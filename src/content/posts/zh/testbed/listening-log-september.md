---
title: 九月的听歌记录
slug: zh/listening-log-september
summary: 三张音乐卡片：一张从远程接口按需加载，两张使用本地音频，其中一张带封面和歌词。检查音频不会自动播放、播放一首会暂停另一首，以及没有脚本时的说明文字。
publishedAt: 2026-09-09T23:20:00+08:00
lang: zh
translationKey: testbed-listening-log
category: 音乐
tags:
  - 音乐
  - 歌单
  - 测试
draft: false
unlisted: false
copyProtection: false
---

这个月听得最多的还是那几首。下面三张卡片的行为各不相同，适合放在一起测。

## 远程曲目

第一张卡片的曲目信息来自第三方接口。页面打开时不会发出任何请求，第一次按播放才去取曲目地址，再按一次才真正开始播放。

::music{title="Final Resonance" artist="ARForest" meting="https://meting.spr-aachen.com/api?server=netease&type=song&id=1363298691"}

## 本地音频

第二张是本地文件，带封面和歌词文件。音频是脚本生成的一段 C 大调音阶，大约四秒。

::music{title="测试音阶" artist="Moriium Testbed" cover="/fixtures/test-posts/music-cover.webp" audio="/fixtures/test-posts/scale.wav" lrc="/fixtures/test-posts/scale.lrc"}

第三张没有封面，也没有歌词，用来检查卡片缺少这两样时的布局：

::music{title="没有封面的测试音阶" artist="Moriium Testbed" audio="/fixtures/test-posts/scale.wav"}

## 测试要点

| 操作 | 期望 |
| --- | --- |
| 打开页面 | 没有音频请求，也没有第三方请求 |
| 播放第二张 | 开始播放本地音阶 |
| 接着播放第三张 | 第二张自动暂停 |
| 禁用脚本 | 本地卡片显示原生播放器，远程卡片说明需要 JavaScript |
