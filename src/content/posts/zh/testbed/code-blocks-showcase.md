---
title: 代码块能做的事：标题、行号、标记与折叠
slug: zh/code-blocks-showcase
summary: 用几段真实形状的代码，把 Expressive Code 在 Moriium 里启用的能力过一遍：文件标题、终端框、行号、行标记、增删对比、文本标记、折叠区段和换行控制。
publishedAt: 2026-09-08T20:00:00+08:00
lang: zh
translationKey: testbed-code-blocks
category: 技术笔记
tags:
  - TypeScript
  - Rust
  - Node.js
  - C++
  - 工具链
  - 测试
draft: false
unlisted: false
copyProtection: false
---

写技术笔记时，代码块是最容易被忽略、又最常出问题的部分。这篇把常见的几种用法各放一段，方便在浅色、暗色和窄屏下逐个检查。

行内代码像 `pnpm build` 这样出现在句子中间，它的字号和基线应该和周围文字协调。

## 基础：语言与标题

```ts title="src/utils/slug.ts"
export function slugify(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
```

没有标题、只有语言的代码块：

```python
from pathlib import Path

def count_posts(root: Path) -> int:
    return sum(1 for _ in root.rglob("*.md"))

print(count_posts(Path("src/content/posts")))
```

完全不写语言时，按纯文本显示：

```
这是一段没有指定语言的文本。
它不应该有任何语法高亮。
```

## 终端框

Shell 类语言会自动显示成终端样式：

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm links
```

也可以给终端加标题：

```powershell title="Windows PowerShell"
Get-ChildItem -Recurse -Filter *.md src/content/posts | Measure-Object
```

或者强制关掉外框：

```sh frame="none"
echo "没有外框的命令"
```

## 行号

```go showLineNumbers
package main

import "fmt"

func main() {
	for i := 1; i <= 3; i++ {
		fmt.Println("line", i)
	}
}
```

行号可以从指定位置开始，适合摘录大文件中间的一段：

```rust showLineNumbers startLineNumber=118
fn parse_header(line: &str) -> Option<(&str, &str)> {
    let (key, value) = line.split_once(':')?;
    Some((key.trim(), value.trim()))
}
```

## 行标记、增删与文本标记

标记第 3 到 4 行，第 5 行删除、第 6 行新增：

```js title="astro.config.mjs" {3-4} del={5} ins={6}
export default defineConfig({
  site: 'https://morii9961.top',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'file' },
  build: { format: 'directory' },
});
```

用 diff 语法表达修改，同时保留语法高亮：

```diff lang="css"
 .article-body {
-  max-width: 42em;
+  max-width: 48rem;
   margin-inline: auto;
 }
```

标记某个词，或者某个正则匹配到的内容：

```js "readerFeatures" /mermaid|music/
const readerFeatures = detect(body);
if (readerFeatures.mermaid) await import('./mermaid.js');
if (readerFeatures.music) await import('./music.js');
```

## 折叠区段

很长的代码可以把不重要的部分折叠起来。下面折叠了开头的头文件和末尾的显式实例化：

```cpp title="ring_buffer.hpp" collapse={1-6, 31-34}
#pragma once
#include <array>
#include <cstddef>
#include <optional>
#include <utility>
#include <stdexcept>

template <typename T, std::size_t N>
class RingBuffer {
public:
  bool push(T value) {
    if (size_ == N) return false;
    data_[tail_] = std::move(value);
    tail_ = (tail_ + 1) % N;
    ++size_;
    return true;
  }

  std::optional<T> pop() {
    if (size_ == 0) return std::nullopt;
    T value = std::move(data_[head_]);
    head_ = (head_ + 1) % N;
    --size_;
    return value;
  }

private:
  std::array<T, N> data_{};
  std::size_t head_ = 0, tail_ = 0, size_ = 0;
};

// explicit instantiations used by tests
template class RingBuffer<int, 8>;
template class RingBuffer<double, 16>;
```

## 换行控制

站点默认让长行自动换行。需要保留原始行宽时，可以关掉：

```json wrap=false
{"name":"moriium","description":"This line is intentionally very long so that the code block must scroll horizontally instead of wrapping when wrap is turned off for this block","version":"0.1.0"}
```

默认换行时，同样的长行会折到下一行：

```json
{"name":"moriium","description":"This line is intentionally very long so that the code block wraps onto the next line with the default settings for this site","version":"0.1.0"}
```

## 更多语言

```yaml title=".github/workflows/ci.yml"
name: CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm verify
```

```sql
SELECT a.slug, v.title, v.created_at
FROM articles AS a
JOIN versions AS v ON v.id = a.published_version_id
WHERE a.live_version_id IS NOT a.published_version_id
ORDER BY v.created_at DESC;
```

```html
<figure class="article-figure">
  <a href="/media/photo.webp" data-lightbox>
    <img src="/media/photo.webp" alt="描述" loading="lazy" />
  </a>
  <figcaption>图注</figcaption>
</figure>
```

```css
:root {
  --ink: oklch(22% 0.02 260);
  --surface-raised: oklch(98% 0.005 90);
}
```

```dockerfile
FROM node:24-slim
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm build
```

## 列表与提示块里的代码

1. 先确认 Node 版本：

   ```bash
   node -v
   ```

2. 再运行测试。

:::tip{title="复制按钮"}
每个代码块右上角都有复制按钮，提示块里的代码也不例外。

```bash
pnpm test
```
:::
