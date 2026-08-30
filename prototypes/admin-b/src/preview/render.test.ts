import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { createMarkdownProcessor, parseFrontmatter } from '@astrojs/markdown-remark';
import {
  baselineBytes,
  baselinePathFor,
  collectPosts,
} from '../../../tools/build-baselines.mjs';
import { renderPreview } from './render.ts';

async function bodyOf(postPath: string): Promise<string> {
  return parseFrontmatter(await readFile(postPath, 'utf8')).content;
}

describe('the draft preview', () => {
  it('reproduces every stored baseline byte for byte', async () => {
    const posts = await collectPosts();
    assert.ok(posts.length >= 4, 'the fixture corpus should still hold four posts');

    for (const post of posts) {
      const expected = await readFile(baselinePathFor(post), 'utf8');
      const preview = baselineBytes(await renderPreview(await bodyOf(post)));
      assert.equal(preview, expected, `preview diverged from the baseline for ${post}`);
    }
  });

  // Without this the test above proves very little: it would pass for any
  // renderer that happens to agree with whatever produced the baseline. A
  // plain processor is what "write a second, approximate parser" would get
  // you, so it is the thing the equality has to be able to tell apart.
  it('does not agree with a processor that lacks the production plugin chain', async () => {
    const [post] = await collectPosts();
    assert.ok(post);

    const naive = await createMarkdownProcessor({});
    const rendered = (await naive.render(await bodyOf(post))).code;

    assert.notEqual(baselineBytes(rendered), await readFile(baselinePathFor(post), 'utf8'));
  });

  it('renders code fences the way the built site does, not the way Astro does by default', async () => {
    const preview = await renderPreview('```ts title="tide.ts"\nexport const tide = 1;\n```\n');

    assert.match(preview, /expressive-code/);
    assert.doesNotMatch(preview, /astro-code/);
  });
});
