---
title: "What a code block can do: titles, line numbers, markers and folding"
slug: en/code-blocks-showcase
summary: A few realistically shaped snippets that walk through every Expressive Code feature Moriium enables — file titles, terminal frames, line numbers, line markers, insertions and deletions, text markers, collapsible sections and wrapping.
publishedAt: 2026-09-08T20:00:00+08:00
lang: en
translationKey: testbed-code-blocks
machineTranslation: zh
category: Engineering notes
tags:
  - TypeScript
  - Rust
  - Node.js
  - C++
  - Toolchain
draft: false
unlisted: false
copyProtection: false
---

In technical notes, code blocks are the part most easily overlooked and the part most likely to break. This post gives each common usage its own snippet, so they can be checked one by one in light mode, dark mode and on narrow screens.

Inline code such as `pnpm build` sits in the middle of a sentence; its size and baseline should agree with the text around it.

## Basics: language and title

```ts title="src/utils/slug.ts"
export function slugify(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
```

A block with a language but no title:

```python
from pathlib import Path

def count_posts(root: Path) -> int:
    return sum(1 for _ in root.rglob("*.md"))

print(count_posts(Path("src/content/posts")))
```

With no language at all, it renders as plain text:

```
This text has no language.
It should have no syntax highlighting.
```

## Terminal frames

Shell languages get a terminal frame automatically:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm links
```

A terminal can carry a title too:

```powershell title="Windows PowerShell"
Get-ChildItem -Recurse -Filter *.md src/content/posts | Measure-Object
```

Or the frame can be switched off:

```sh frame="none"
echo "a command with no frame"
```

## Line numbers

```go showLineNumbers
package main

import "fmt"

func main() {
	for i := 1; i <= 3; i++ {
		fmt.Println("line", i)
	}
}
```

Numbering can start anywhere, which suits an excerpt from the middle of a large file:

```rust showLineNumbers startLineNumber=118
fn parse_header(line: &str) -> Option<(&str, &str)> {
    let (key, value) = line.split_once(':')?;
    Some((key.trim(), value.trim()))
}
```

## Line markers, diffs and text markers

Lines 3–4 marked, line 5 deleted, line 6 inserted:

```js title="astro.config.mjs" {3-4} del={5} ins={6}
export default defineConfig({
  site: 'https://morii9961.top',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'file' },
  build: { format: 'directory' },
});
```

A diff that keeps syntax highlighting:

```diff lang="css"
 .article-body {
-  max-width: 42em;
+  max-width: 48rem;
   margin-inline: auto;
 }
```

Marking a word, or whatever a regular expression matches:

```js "readerFeatures" /mermaid|music/
const readerFeatures = detect(body);
if (readerFeatures.mermaid) await import('./mermaid.js');
if (readerFeatures.music) await import('./music.js');
```

## Collapsible sections

Long code can fold away the parts that do not matter. This one folds the headers at the top and the explicit instantiations at the bottom:

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

## Wrapping

The site wraps long lines by default. To keep the original line width, turn it off:

```json wrap=false
{"name":"moriium","description":"This line is intentionally very long so that the code block must scroll horizontally instead of wrapping when wrap is turned off for this block","version":"0.1.0"}
```

With the default, the same kind of long line wraps:

```json
{"name":"moriium","description":"This line is intentionally very long so that the code block wraps onto the next line with the default settings for this site","version":"0.1.0"}
```

## More languages

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
    <img src="/media/photo.webp" alt="description" loading="lazy" />
  </a>
  <figcaption>Caption</figcaption>
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

## Code inside lists and callouts

1. Check the Node version first:

   ```bash
   node -v
   ```

2. Then run the tests.

:::tip{title="Copy button"}
Every code block has a copy button in its top corner, including the ones inside a callout.

```bash
pnpm test
```
:::
