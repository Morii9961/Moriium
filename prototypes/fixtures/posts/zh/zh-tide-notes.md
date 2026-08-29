---
title: 潮汐笔记：为了一张照片写的小程序
slug: zh/tide-notes
summary: 为了拍到退潮后的滩涂，写了一个粗糙的潮汐推算脚本。记录公式、验证方式，以及它在什么情况下会算错。
publishedAt: 2026-03-14T21:40:00+08:00
updatedAt: 2026-05-02T10:05:00+08:00
lang: zh
translationKey: tide-notes
category: 工程夹具
tags:
  - 夹具
  - 摄影
  - 工具
cover: /media/fixtures/tide-cover.svg
coverAlt: 由横向细线与几处深色色块构成的抽象潮位示意图
draft: false
unlisted: true
copyProtection: false
---

去年冬天我在同一个滩涂扑空了四次。查到的潮汐表只精确到小时，而滩涂露出的窗口只有四十分钟左右，等我背着器材走到位置，水已经回来了。

![滩涂在退潮后露出的纹路，由细线与留白构成的示意图](/media/fixtures/tide-flats.svg "退潮后约二十分钟的滩涂")

后来我干脆自己算。方法很旧，把潮位当成若干个正弦分量叠加：

$$
h(t) = H_0 + \sum_{i=1}^{n} A_i \cos(\omega_i t - \phi_i)
$$

其中 $H_0$ 是平均海平面，$A_i$ 与 $\phi_i$ 是各分潮的振幅和相位。只取 M2、S2、K1、O1 四个主要分潮，误差就已经小于我需要的精度。

## 代码

```ts title="tide.ts" showLineNumbers {7} collapse={1-3}
type Constituent = { amplitude: number; speed: number; phase: number };

const HOURS = 3_600_000;

export function heightAt(base: number, parts: Constituent[], at: Date) {
  const hours = at.getTime() / HOURS;
  return parts.reduce((sum, part) => {
    const angle = (part.speed * hours - part.phase) * (Math.PI / 180);
    return sum + part.amplitude * Math.cos(angle);
  }, base);
}
```

第 7 行是整段里唯一容易写错的地方：分潮速度的单位是度每小时，必须转成弧度再进 `Math.cos`，否则结果看起来仍然像潮汐曲线，只是相位整个偏掉。我在这上面浪费了一个下午。

## 数据从哪来

```mermaid
flowchart LR
  Station[潮位站调和常数] --> Parse[解析分潮参数]
  Parse --> Model[叠加模型]
  Model --> Window[计算可拍摄窗口]
  Window --> Alert[提前两小时提醒]
```

调和常数是公开数据，一个站点一组，几十年才更新一次。真正麻烦的是气压和风——它们能把实际潮位推高或压低几十厘米，而模型对此一无所知。

:::note{title="口径说明"}
下面提到的高度都以当地理论最低潮面为基准，不是海拔。
:::

:::tip{title="省事的做法"}
如果只想知道大概时间，官方潮汐表足够了。自己算只在你需要精确到十分钟时才有意义。
:::

:::important
调和常数按站点绑定。用邻站的常数推算本站，误差会大到让整件事失去意义。
:::

:::warning
模型不含气象修正。大风或气压骤变时，实际水位与推算值可能差出半米。
:::

:::caution
滩涂涨潮是从背后包抄的，不是从正面推进。请始终留出比推算窗口更多的余量。
:::

> [!TIP]
> 出发前再核对一次当天的风力预报，比重算一遍潮位更有用。

那次我终于拍到的时间是 :spoiler[凌晨四点五十分，比推算窗口早了整整十二分钟]。

## 相关

::github{repo="Morii9961/Moriium"}

::video{provider="youtube" id="aqz-KE-bpKQ" title="滩涂退潮延时" ratio="16/9"}

::music{title="Low Water" artist="Fixture Ensemble" meting="https://meting.spr-aachen.com/api?server=netease&type=song&id=1363298691"}

## 排版备注

这一段专门用来看混排。中文用「」和，。日文写作「潮（しお）が引く」、句读用、和。English sentences sit here too, with commas, periods, and "straight quotes" — plus an em dash. 三种标点挤在一起时，行高、标点挤压和西文断词都会暴露问题，所以这段不要删。
