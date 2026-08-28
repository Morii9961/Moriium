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
