import assert from 'node:assert/strict';
import test from 'node:test';
import { renderPrivateMarkdown } from '../scripts/lib/render-markdown.mjs';

test('private Markdown uses the same advanced reading vocabulary', async () => {
  const html = await renderPrivateMarkdown(`
![A descriptive fixture](/fixtures/reader-image.svg)

\`\`\`ts title="private.ts" showLineNumbers {2}
const visible = true;
console.log(visible);
\`\`\`

Inline math $E = mc^2$.

:::tip{title="Private tip"}
Still encrypted.
:::

::github{repo="Morii9961/Moriium"}

::video{provider="youtube" id="aqz-KE-bpKQ" title="Video fixture"}

::music{title="Fixture" artist="Morii" audio="/media/fixture.mp3"}
`);

  assert.match(html, /data-lightbox/);
  assert.match(html, /class="expressive-code"/);
  assert.match(html, /data-code=/);
  assert.match(html, /class="katex"/);
  assert.match(html, /admonition--tip/);
  assert.match(html, /class="github-card"/);
  assert.match(html, /class="video-card"/);
  assert.match(html, /class="music-card(?:\s[^"]*)?"/);
  assert.doesNotMatch(html, /<script\b/i);
});

test('private directive rendering constrains embed URLs and style values', async () => {
  const html = await renderPrivateMarkdown(`
::video{provider="youtube" id="safe-id" title="Fixture" ratio="1/1;background:red"}

::music{title="Fixture" artist="Morii" meting="https://example.com/api" lrc="javascript:alert(1)"}
`);

  assert.match(html, /--video-ratio:16\/9/);
  assert.doesNotMatch(html, /background:red/);
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /data-meting=/);
});

test('private Markdown localizes reader controls from the article language', async () => {
  const markdown = `
\`\`\`ts
const localized = true;
\`\`\`

:::important
Localized admonition.
:::

This is :spoiler[hidden].

::video{provider="youtube" id="aqz-KE-bpKQ" title="Fixture"}

::music{title="Fixture" artist="Morii" audio="/media/fixture.mp3"}

A footnote.[^1]

[^1]: Footnote body.
`;

  const cases = [
    {
      lang: 'zh',
      expected: ['复制代码', '已复制', '重要', '显示隐藏内容', '第三方视频', '播放', '脚注', '返回注记'],
    },
    {
      lang: 'ja',
      expected: ['コードをコピー', 'コピーしました', '重要', '伏せた内容を表示', '外部サービスの動画', '再生', '脚注', '注記に戻る'],
    },
    {
      lang: 'en',
      expected: ['Copy code', 'Copied', 'Important', 'Reveal hidden text', 'Third-party video', 'Play', 'Footnotes', 'Back to reference'],
    },
  ];

  for (const { lang, expected } of cases) {
    const html = await renderPrivateMarkdown(markdown, lang);
    for (const copy of expected) assert.match(html, new RegExp(copy));
  }
});
