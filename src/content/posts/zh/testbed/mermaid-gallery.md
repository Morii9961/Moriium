---
title: Mermaid 图表集：十种图一次看完
slug: zh/mermaid-gallery
summary: 流程图、时序图、类图、状态图、实体关系图、甘特图、饼图、Git 图、时间线和一张很宽的流水线图，检查图表在浅色与暗色主题下的可读性，以及宽图在窄屏上的表现。
publishedAt: 2026-09-02T19:30:00+08:00
lang: zh
translationKey: testbed-mermaid
category: 技术笔记
tags:
  - Mermaid
  - 架构
  - 工具链
  - 测试
draft: false
unlisted: false
copyProtection: false
---

图表只在带有 Mermaid 代码块的文章里加载，普通文章不会下载这部分脚本。这篇把常用的图各画一张，切换一次主题，图表的颜色应该跟着变。

## 流程图

```mermaid
flowchart TD
  subgraph author[作者端]
    A[写作] --> B{自动保存}
    B -->|成功| C[新版本]
    B -->|失败| D[提示重试]
  end
  subgraph release[发布]
    C --> E[显式发布]
    E --> F[导出 Markdown]
    F --> G[静态构建]
    G --> H[原子换站]
  end
  H --> I((读者))
```

## 时序图

```mermaid
sequenceDiagram
  autonumber
  participant R as 读者
  participant P as 文章页
  participant Y as 视频平台
  R->>P: 打开文章
  P-->>R: 显示视频占位
  Note over R,P: 此时没有任何第三方请求
  R->>P: 点击加载
  P->>Y: 请求嵌入框
  Y-->>R: 播放器
```

## 类图

```mermaid
classDiagram
  class Article {
    +int id
    +string slug
    +int publishedVersionId
    +int liveVersionId
    +isAwaitingExport() bool
  }
  class Version {
    +int id
    +string title
    +string body
    +Date createdAt
  }
  class Account {
    +int id
    +string name
  }
  Article "1" --> "*" Version : versions
  Version "*" --> "1" Account : author
```

## 状态图

```mermaid
stateDiagram-v2
  state "草稿" as Draft
  state "已发布，等待上线" as Published
  state "已上线" as Live
  [*] --> Draft
  Draft --> Published: 发布
  Published --> Live: 构建并换站
  Live --> Published: 发布新版本
  Published --> Draft: 撤下
  Live --> Draft: 撤下
```

## 实体关系图

```mermaid
erDiagram
  ACCOUNTS ||--o{ VERSIONS : writes
  ARTICLES ||--|{ VERSIONS : has
  ARTICLES ||--o{ AUDIT : records
  VERSIONS ||--o{ VERSION_TAGS : tagged
  ARTICLES {
    int id PK
    text slug
    int published_version_id FK
    int live_version_id FK
  }
  VERSIONS {
    int id PK
    int article_id FK
    text title
    text body
  }
```

## 甘特图

```mermaid
gantt
  title 一个虚构项目的进度
  dateFormat YYYY-MM-DD
  section 基础
  渲染分裂 :done, a1, 2026-08-20, 2d
  数据库与账户 :done, a2, after a1, 3d
  section 作者端
  后台界面 :done, b1, 2026-08-26, 3d
  媒体导入 :done, b2, after b1, 2d
  section 上线
  导出与换站 :active, c1, 2026-08-31, 4d
  部署 :c2, after c1, 5d
```

## 饼图

```mermaid
pie showData
  title 一篇文章的篇幅构成
  "正文" : 62
  "代码" : 18
  "图表" : 12
  "脚注" : 8
```

## Git 图

```mermaid
gitGraph
  commit id: "init"
  branch design
  checkout design
  commit id: "tokens"
  commit id: "article"
  checkout main
  commit id: "backend"
  merge design
  commit id: "release"
```

## 时间线

```mermaid
timeline
  title 一个虚构站点的时间线
  2026-07 : 原型
  2026-08 : 生产后端 : 后台界面
  2026-09 : 公开站验收 : 测试文章
```

## 很宽的图

下面这张图一行排了十一个节点，在手机上一定放不下，应该能横向滚动或者缩放，而不是把页面撑宽：

```mermaid
flowchart LR
  A[Markdown 源文件] --> B[remark-math] --> C[remark-directive] --> D[Moriium 指令] --> E[rehype-katex] --> F[Expressive Code] --> G[内容转换] --> H[HTML] --> I[链接检查] --> J[隐私审计] --> K[发布]
```
