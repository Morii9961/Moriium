---
title: 这个站用到的开源项目
slug: zh/open-source-cards
summary: 用 GitHub 仓库卡片列出 Moriium 依赖的几个开源项目，其中一个仓库地址故意不存在，用来检查卡片取不到数据时是否退化成普通链接。
publishedAt: 2026-05-12T20:45:00+08:00
lang: zh
translationKey: testbed-open-source
category: 开源
tags:
  - 开源
  - Astro
  - 工具链
  - 测试
draft: false
unlisted: false
copyProtection: false
---

Moriium 自己的代码不多，它站在很多项目的肩膀上。构建时会读取仓库的简介、主要语言和星标数，读不到时，卡片就只是一条普通链接。

## 本站

::github{repo="Morii9961/Moriium"}

## 构建

::github{repo="withastro/astro"}

::github{repo="expressive-code/expressive-code"}

## 阅读组件

::github{repo="KaTeX/KaTeX"}

::github{repo="mermaid-js/mermaid"}

::github{repo="dimsemenov/PhotoSwipe"}

## 不存在的仓库

下面这个仓库并不存在。卡片应该退化为指向 GitHub 的普通链接，而不是显示空白或者报错：

::github{repo="Morii9961/this-repository-does-not-exist"}

普通的链接写法仍然可用：[github.com/withastro/astro](https://github.com/withastro/astro)。
