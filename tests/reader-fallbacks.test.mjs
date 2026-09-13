// What each reading capability still does when its script never runs.
//
// AGENTS.md requires no-JavaScript fallbacks for links, images, GitHub
// repositories, and protected-post metadata, and requires network media to wait
// for a deliberate action -- video excepted, which loads lazily as the reader
// scrolls near it. Those two rules pull against each other: the easiest
// way to defer a third-party request is a button that only JavaScript can use,
// which leaves a reader without scripts looking at a control that does nothing.
//
// So the test for each capability is not "does the markup exist" but "is the
// no-script state honest": either the capability works, or it says plainly that
// it cannot. A control that looks usable and is not is the failure being
// guarded against here.
//
// Directive variants that no published article exercises are rendered through
// the same pipeline the build uses. Adding fixture content to cover them would
// mean publishing files that exist only for a test.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, before } from 'node:test';
import { renderPrivateMarkdown } from '../scripts/lib/render-markdown.mjs';
import { publicOutputRoot } from '../scripts/lib/public-output.mjs';

const out = publicOutputRoot();

/** The only origins a video player may come from. */
const PROVIDER_ORIGINS = ['https://www.youtube-nocookie.com', 'https://player.bilibili.com'];

// One Chinese document carrying every capability at once, rendered through the
// pipeline the build uses. This used to be a published acceptance article; it
// lives here now, so the checks do not depend on any article staying online.
const CAPABILITY_MARKDOWN = `
![A descriptive fixture](/fixtures/reader-image.svg)

\`\`\`ts
const fixture = true;
\`\`\`

This is :spoiler[hidden text].

::github{repo="Morii9961/Moriium"}

::video{provider="youtube" id="aqz-KE-bpKQ" title="Video fixture"}

::music{title="Final Resonance" artist="ARForest" meting="https://meting.spr-aachen.com/api?server=netease&type=song&id=1"}

A footnote.[^1]

[^1]: Footnote body.
`;

let capability;

before(async () => {
  capability = await renderPrivateMarkdown(CAPABILITY_MARKDOWN, 'zh');
});

describe('reader language', () => {
  it('uses Chinese controls throughout a Chinese document', () => {
    assert.match(capability, /title="复制代码"/);
    assert.match(capability, /data-copied="已复制"/);
    assert.match(capability, /aria-label="显示隐藏内容"/);
    assert.match(capability, /第三方视频，由外部服务提供。/);
    assert.match(capability, /歌曲来自外部服务，需要 JavaScript 才能载入。/);
    assert.match(capability, />脚注</);
    assert.match(capability, /aria-label="返回注记 1"/);
    assert.doesNotMatch(capability, /title="Copy code"/);
    assert.doesNotMatch(capability, /Third-party video, served by an external service\./);
  });
});

describe('images', () => {
  it('stay visible and keep the original file one ordinary click away', async () => {
    const html = await renderPrivateMarkdown('![A descriptive fixture](/fixtures/reader-image.svg)');
    const link = /<a[^>]*href="([^"]+)"[^>]*data-lightbox/.exec(html) ?? /<a[^>]*data-lightbox[^>]*href="([^"]+)"/.exec(html);
    assert.ok(link, 'an image must be wrapped in a real link, not a scripted control');
    assert.equal(link[1], '/fixtures/reader-image.svg');
    assert.match(html, /<img[^>]+alt="A descriptive fixture"/);
  });

  it('are a plain anchor inside a full document too', () => {
    assert.match(capability, /<a[^>]*href="\/fixtures\/reader-image\.svg"[^>]*data-lightbox/);
  });
});

describe('GitHub cards', () => {
  it('are an ordinary repository link even when the build cache has no entry', async () => {
    const html = await renderPrivateMarkdown('::github{repo="Morii9961/does-not-exist"}');
    assert.match(html, /<a[^>]+href="https:\/\/github\.com\/Morii9961\/does-not-exist"/);
    assert.match(html, /rel="noopener noreferrer"/);
    // An empty card would be worse than no card: it looks like a failed widget.
    assert.match(html, /Morii9961\/does-not-exist/);
  });

  it('never needs a runtime GitHub request', () => {
    assert.ok(!capability.includes('api.github.com'), 'the reader must not contact the GitHub API');
  });
});

describe('admonitions', () => {
  it('keep their title and body as ordinary semantic content', async () => {
    const html = await renderPrivateMarkdown(':::tip{title="Private tip"}\nStill readable.\n:::');
    assert.match(html, /admonition--tip/);
    assert.match(html, /Private tip/);
    assert.match(html, /Still readable\./);
    assert.ok(!/<script/i.test(html), 'an admonition must not depend on a script');
  });
});

describe('spoilers', () => {
  // Read what this does and does not establish before citing it.
  //
  // It proves the text survives into the document. It does NOT prove the
  // no-JavaScript contract is met: with no script the element is transparent
  // text with no way to reveal it, so a reader sees a blank gap and is told
  // nothing. Markup alone cannot show that, which is exactly why the assertion
  // below stops where it does and the gap is recorded as a todo rather than
  // quietly counted as a pass.
  it('keep the hidden text in the document with an accessible control', () => {
    const spoiler = /<span[^>]*data-spoiler[^>]*>([\s\S]*?)<\/span>/.exec(capability);
    assert.ok(spoiler, 'the capability document is expected to contain a spoiler');
    assert.ok(spoiler[1].trim().length > 0, 'spoiler text must stay in the document');
    assert.match(spoiler[0], /role="button"/);
    assert.match(spoiler[0], /aria-label="[^"]+"/);
    assert.match(spoiler[0], /aria-pressed="false"/);
  });

  it(
    'read as either revealable or explained when no script runs',
    { todo: 'open gap: the static state is transparent text with no explanation and no way to reveal it' },
    () => {
      // Deliberately unimplemented. The fix is progressive enhancement in the
      // visual layer -- static state readable or explained, with the button
      // semantics and the mask added only once the script binds -- and that
      // lands with the public visual work, not here. An inline spoiler must not
      // become <details>, which is not an inline element and would break the
      // surrounding paragraph.
    },
  );
});

describe('remote video', () => {
  // Morii chose to have videos load without a click. What stays guarded is how:
  // the player is a lazy frame (the browser decides the distance, and Chrome's
  // is generous), never starts on its own, needs no script, and comes only from
  // an allowlisted provider.
  const frameIn = (html) => /<iframe[^>]*>/.exec(html)?.[0];

  it('renders the player lazily, from the allowlist, without a script', async () => {
    const html = await renderPrivateMarkdown('::video{provider="youtube" id="aqz-KE-bpKQ" title="Video fixture"}');
    const frame = frameIn(html);
    assert.ok(frame, 'a remote video is expected to render its player');
    assert.match(frame, /loading="lazy"/, 'the player must wait until the reader scrolls near it');
    assert.match(frame, /title="Video fixture"/, 'the frame needs a readable title');
    const src = /src="([^"]+)"/.exec(frame)?.[1] ?? '';
    assert.ok(PROVIDER_ORIGINS.some((origin) => src.startsWith(origin)), `${src} is outside the provider allowlist`);
    assert.match(html, /Video fixture/);
  });

  it('never starts playing on its own', async () => {
    for (const markdown of [
      '::video{provider="youtube" id="aqz-KE-bpKQ" title="YouTube fixture"}',
      '::video{provider="bilibili" id="BV1GJ411x7h7" title="Bilibili fixture"}',
    ]) {
      const frame = frameIn(await renderPrivateMarkdown(markdown));
      assert.ok(frame);
      const allow = /allow="([^"]*)"/.exec(frame)?.[1] ?? '';
      assert.doesNotMatch(allow, /autoplay/, 'the frame must not be granted autoplay');
      assert.doesNotMatch(frame, /autoplay=1/);
    }
    // Bilibili's player plays by default unless told not to.
    const bilibili = frameIn(await renderPrivateMarkdown('::video{provider="bilibili" id="BV1GJ411x7h7" title="B"}'));
    assert.match(bilibili, /autoplay=0/);
  });

  it('says in the page that the video is a third party', () => {
    assert.match(capability, /<iframe[^>]*loading="lazy"/);
    assert.match(capability, /class="video-card__note"/);
  });

  it('refuses a provider that is not on the allowlist', async () => {
    const html = await renderPrivateMarkdown('::video{provider="vimeo" id="123" title="Blocked"}');
    assert.match(html, /not allowed/i);
    assert.ok(!/<iframe/i.test(html));
  });
});

describe('local video', () => {
  it('is a native player that downloads nothing on load', async () => {
    const html = await renderPrivateMarkdown('::video{provider="local" src="/media/example.mp4" title="Local fixture"}');
    assert.match(html, /<video[^>]*controls/);
    assert.match(html, /<video[^>]*preload="none"/);
    assert.match(html, /<source[^>]*src="\/media\/example\.mp4"/);
  });
});

describe('remote music', () => {
  it('keeps title and artist readable without any script', async () => {
    const html = await renderPrivateMarkdown(
      '::music{title="Final Resonance" artist="ARForest" meting="https://meting.spr-aachen.com/api?server=netease&type=song&id=1"}',
    );
    assert.match(html, /Final Resonance/);
    assert.match(html, /ARForest/);
    assert.ok(!/<audio/i.test(html), 'a remote track must not become an audio element before consent');
  });

  it('does not present a play control that cannot work without JavaScript', async () => {
    const html = await renderPrivateMarkdown(
      '::music{title="Final Resonance" artist="ARForest" meting="https://meting.spr-aachen.com/api?server=netease&type=song&id=1"}',
    );
    const play = /<button[^>]*data-music-play[^>]*>/.exec(html);
    assert.ok(play, 'the play control is expected in the output');
    assert.match(
      play[0],
      /disabled/,
      'a remote play button must start disabled, or a reader without JavaScript sees a control that silently does nothing',
    );
  });

  it('does not tell a reader to press a button that is disabled', async () => {
    const html = await renderPrivateMarkdown(
      '::music{title="Final Resonance" artist="ARForest" meting="https://meting.spr-aachen.com/api?server=netease&type=song&id=1"}',
    );
    const status = /<p[^>]*data-music-status[^>]*>([\s\S]*?)<\/p>/.exec(html);
    assert.ok(status, 'the status line is expected in the output');
    assert.match(status[1], /JavaScript/, 'the static status must say what is actually missing');
    assert.doesNotMatch(
      status[1],
      /press play/i,
      'the button is disabled at this point, so instructing the reader to press it contradicts the page',
    );
  });

  it('says the same thing in Chinese', () => {
    const status = /<p[^>]*data-music-status[^>]*>([\s\S]*?)<\/p>/.exec(capability);
    assert.ok(status, 'the capability document is expected to carry a music status line');
    assert.match(status[1], /JavaScript/);
    assert.doesNotMatch(status[1], /press play/i);
  });
});

describe('local music', () => {
  const LOCAL = '::music{title="Fixture" artist="Morii" audio="/media/fixture.mp3"}';

  it('keeps a native audio fallback that preloads nothing', async () => {
    const html = await renderPrivateMarkdown(LOCAL);
    const audio = /<audio[^>]*>/.exec(html);
    assert.ok(audio, 'a local track must render an audio element');
    assert.match(audio[0], /preload="none"/);
    assert.match(
      audio[0],
      /controls/,
      'without native controls a local track is unplayable when the script does not run',
    );
  });

  it('ships its custom play button disabled as well', async () => {
    // Having a native player nearby does not make the custom button work. Every
    // listener it needs lives in ReaderEnhancements, so with no script it is a
    // dead control sitting next to a live one -- which reads as the player
    // being broken rather than as the button being an enhancement.
    const html = await renderPrivateMarkdown(LOCAL);
    const play = /<button[^>]*data-music-play[^>]*>/.exec(html);
    assert.ok(play, 'the play control is expected in the output');
    assert.match(play[0], /disabled/, 'a scripted control must not ship enabled');
  });

  it('keeps its scripted transport out of sight until the script binds it', async () => {
    const html = await renderPrivateMarkdown(
      '::music{title="Fixture" artist="Morii" cover="/media/cover.webp" audio="/media/fixture.mp3" lrc="/media/fixture.lrc"}',
    );
    const styles = readFileSync('src/styles/base.css', 'utf8');
    // The row with the play button, the seek bar and the time is in the
    // markup, but a stylesheet rule hides it on any card the script has not
    // marked bound, and hides the native player and lyrics link once it has.
    assert.match(html, /class="music-card__controls"/);
    assert.match(
      styles,
      /\.music-card:not\(\[data-music-bound\]\) \.music-card__controls,\s*\.music-card\[data-music-bound\] audio,\s*\.music-card\[data-music-bound\] \.music-card__lyrics\s*\{\s*display: none;/,
    );
    // The seek bar ships disabled too, and the lyric line is not a live region,
    // or a screen reader would recite the song over itself.
    assert.match(/<input[^>]*data-music-seek[^>]*>/.exec(html)?.[0] ?? '', /disabled/);
    assert.match(/<p[^>]*data-music-lyric[^>]*>/.exec(html)?.[0] ?? '', /aria-hidden="true"/);
    assert.doesNotMatch(/<p[^>]*data-music-lyric[^>]*>/.exec(html)?.[0] ?? '', /aria-live/);
    // The cover is the card's artwork, not a photograph to open in the lightbox.
    assert.match(html, /<div class="music-card__art" data-music-art=""><img[^>]*class="music-card__cover"/);
    assert.doesNotMatch(html, /<a[^>]*data-lightbox[^>]*><img[^>]*music-card__cover/);
  });

  it('points the reader at the control that does work', async () => {
    const html = await renderPrivateMarkdown(LOCAL);
    const status = /<p[^>]*data-music-status[^>]*>([\s\S]*?)<\/p>/.exec(html);
    assert.ok(status, 'the status line is expected in the output');
    assert.match(status[1], /JavaScript/);
    assert.match(status[1], /audio player/i, 'the native fallback is the thing that still works');
  });
});

describe('copy protection', () => {
  it('is applied by script only, so copying still works without JavaScript', () => {
    // The restriction lives in a copy listener. Nothing in the markup may block
    // selection, or a reader without scripts would lose ordinary copying. The
    // article only declares the setting; the listener reads it.
    const layout = readFileSync('src/layouts/ArticleLayout.astro', 'utf8');
    const reader = readFileSync('src/components/ReaderEnhancements.astro', 'utf8');
    // Expressive Code's own stylesheet turns selection off for its line
    // numbers and copy button, which is about code chrome, not the prose; only
    // the markup outside a style block is in question here.
    const markup = capability.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    assert.ok(!/user-select:\s*none/i.test(markup), 'copy protection must not be baked into the markup');
    assert.match(layout, /data-copy-protection=\{String\(features\.copyProtection\)\}/);
    assert.match(reader, /querySelector<HTMLElement>\('\[data-copy-protection="true"\]'\)/);
    assert.match(reader, /addEventListener\('copy'/);
  });
});

describe('protected articles', () => {
  it('publish no draft ciphertext into the reader tree', () => {
    // Which languages own a protected route is a fact about the content, not
    // about the entries that happened to exist when this was written. Reading it
    // keeps both halves of the rule under test: a draft envelope must stay out
    // of the reader tree, and a published one must reach it.
    const collection = new URL('../src/content/protected/', import.meta.url);
    const published = new Set(
      readdirSync(collection, { recursive: true })
        .map((entry) => String(entry).split('\\').join('/'))
        .filter((entry) => entry.endsWith('.json'))
        .map((entry) => JSON.parse(readFileSync(new URL(entry, collection), 'utf8')))
        .filter((data) => data.draft !== true)
        .map((data) => data.lang),
    );

    for (const lang of ['zh', 'ja', 'en']) {
      assert.equal(
        existsSync(join(out, lang, 'protected')),
        published.has(lang),
        published.has(lang)
          ? `${lang}/protected/ is missing although a published protected article exists`
          : `${lang}/protected/ was built, but every protected entry for ${lang} is a draft`,
      );
    }
  });

  it('gate on a route that filters drafts before it generates anything', () => {
    const route = readFileSync(
      new URL('../src/pages/[lang]/protected/[slug].astro', import.meta.url),
      'utf8',
    );
    assert.match(route, /getCollection\('protected',\s*\(\{\s*data\s*\}\)\s*=>\s*!data\.draft\)/);
  });

  it('carry only public metadata and an honest unlock notice in the page shell', () => {
    const route = readFileSync(
      new URL('../src/pages/[lang]/protected/[slug].astro', import.meta.url),
      'utf8',
    );
    // The gate is server-rendered: summary, badge and warning are readable
    // before any script runs, and the body arrives only after decryption.
    assert.match(route, /data-protected-gate/);
    assert.match(route, /copy\.warning/);
    assert.match(route, /data-decrypted-content hidden/);
    assert.ok(!/post\.body/.test(route), 'a protected page must never render plaintext');
  });
});
