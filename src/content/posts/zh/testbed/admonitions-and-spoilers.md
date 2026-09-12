---
title: 提示块与剧透：写作时的五种语气
slug: zh/admonitions-and-spoilers
summary: 注记、提示、重要、警告、当心五种提示块，分别用指令语法和 GitHub 风格语法各写一遍，再加上可以点击揭示的行内剧透。
publishedAt: 2026-06-30T09:00:00+08:00
lang: zh
translationKey: testbed-admonitions
category: 写作手册
tags:
  - 提示块
  - 剧透
  - 写作
  - 测试
draft: false
unlisted: false
copyProtection: false
---

提示块用来把一段话从正文里拎出来，告诉读者「这段的语气不一样」。五种类型对应五种语气，从平静的补充，到必须停下来读的警告。

## 指令语法

:::note
没有自定义标题的注记，标题使用默认文案。
:::

:::tip{title="写作小技巧"}
先写结论，再补理由。读者读到一半离开时，至少带走了结论。
:::

:::important{title="发布之前"}
发布之前确认三件事：

1. 摘要不超过 280 个字符；
2. 每张图都有替代文字；
3. 翻译版本共用同一个 `translationKey`。
:::

:::warning
第三方视频和音乐只有在点击后才会联网，但点击之后就会向对方发送请求。
:::

:::caution{title="加密文章"}
静态密文可以被复制后离线猜测口令，弱口令等于没有加密。
:::

## GitHub 风格

> [!NOTE]
> 这是 GitHub 风格的注记。

> [!TIP]
> 这是 GitHub 风格的提示。

> [!IMPORTANT]
> 这是 GitHub 风格的重要信息。

> [!WARNING]
> 这是 GitHub 风格的警告。

> [!CAUTION]
> 这是 GitHub 风格的当心。

## 提示块里的复杂内容

:::tip{title="提示块里可以放代码和列表"}
- 第一项
- 第二项，带有 `行内代码`

```ts
const kinds = ['note', 'tip', 'important', 'warning', 'caution'] as const;
```

还可以放一个剧透：:spoiler[提示块里的剧透也能揭示]。
:::

## 行内剧透

这本推理小说的结局是 :spoiler[叙述者本人就是凶手]。这句话要在点击、按 Enter 或空格之后才显示。

一段里可以有多个剧透：凶手是 :spoiler[管家]，动机是 :spoiler[遗产]，关键证据是 :spoiler[那封没有寄出的信]。

剧透里也可以包含 :spoiler[**粗体** 和 `代码`]。
