// What each reading capability still does when its script never runs.
//
// AGENTS.md requires no-JavaScript fallbacks for links, images, GitHub
// repositories, and protected-post metadata, and requires network media to wait
// for a deliberate action. Those two rules pull against each other: the easiest
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
const CAPABILITY_PAGE = 'zh/posts/reader-capabilities/index.html';

/** The origins a reader may reach only after asking. */
const PROVIDER_ORIGINS = ['https://www.youtube-nocookie.com', 'https://player.bilibili.com'];

let capability;

before(() => {
  const path = join(out, CAPABILITY_PAGE);
  assert.ok(existsSync(path), 'run `pnpm build` before these fallback assertions');
  capability = readFileSync(path, 'utf8');
});

describe('images', () => {
  it('stay visible and keep the original file one ordinary click away', async () => {
    const html = await renderPrivateMarkdown('![A descriptive fixture](/fixtures/reader-image.svg)');
    const link = /<a[^>]*href="([^"]+)"[^>]*data-lightbox/.exec(html) ?? /<a[^>]*data-lightbox[^>]*href="([^"]+)"/.exec(html);
    assert.ok(link, 'an image must be wrapped in a real link, not a scripted control');
    assert.equal(link[1], '/fixtures/reader-image.svg');
    assert.match(html, /<img[^>]+alt="A descriptive fixture"/);
  });

  it('are a plain anchor in the built article too', () => {
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
    assert.ok(spoiler, 'the capability article is expected to contain a spoiler');
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
  it('renders no iframe until the reader asks', async () => {
    const html = await renderPrivateMarkdown('::video{provider="youtube" id="aqz-KE-bpKQ" title="Video fixture"}');
    assert.ok(!/<iframe/i.test(html), 'a remote video must not be an iframe at rest');
    assert.match(html, /Video fixture/);
  });

  it('leaves a link a reader without JavaScript can actually open', async () => {
    const html = await renderPrivateMarkdown('::video{provider="youtube" id="aqz-KE-bpKQ" title="Video fixture"}');
    const consent = /<(a|button)[^>]*data-video-src="([^"]+)"[^>]*>/.exec(html);
    assert.ok(consent, 'the consent control is expected in the output');
    assert.equal(
      consent[1],
      'a',
      'the consent control must be a real link, or a reader without JavaScript has no way to reach the video',
    );
    assert.match(consent[0], /href="https:\/\//, 'the link needs a resolvable destination');
  });

  it('offers the same honest path in the built article', () => {
    const consent = /<(a|button)[^>]*data-video-src="([^"]+)"[^>]*>/.exec(capability);
    assert.ok(consent, 'the built article is expected to contain a video consent control');
    assert.equal(consent[1], 'a', 'the built article leaves no no-JavaScript path to the video');
    const href = /href="([^"]+)"/.exec(consent[0]);
    assert.ok(href, 'the consent control must carry an href');
    assert.ok(
      PROVIDER_ORIGINS.some((origin) => href[1].startsWith(origin)),
      `${href?.[1]} is outside the video provider allowlist`,
    );
  });

  it('keeps link semantics after enhancement, so the keyboard contract holds', () => {
    // A link activates on Enter and not on Space. Claiming role="button"
    // promises Space as well, and an anchor cannot deliver it -- the key just
    // scrolls the page. Either the element implements the button contract in
    // full or it stays the link it already is; it may not advertise one and
    // behave as the other.
    const consent = /<a[^>]*data-video-src="[^"]+"[^>]*>/.exec(capability);
    assert.ok(consent, 'the built article is expected to carry a video consent link');
    assert.doesNotMatch(consent[0], /role=/, 'the static markup must not override link semantics');

    const chunk = readdirSync(join(out, '_astro'))
      .filter((name) => name.startsWith('ReaderEnhancements') && name.endsWith('.js'))
      .map((name) => readFileSync(join(out, '_astro', name), 'utf8'))
      .find((code) => code.includes('videoBound'));
    assert.ok(chunk, 'the video binding is expected in the build');
    assert.ok(
      !/setAttribute\(\s*[`'"]role[`'"]/.test(chunk),
      'the script must not add role="button" to an anchor it cannot make behave like one',
    );
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

  it('says the same thing in the built article', () => {
    const status = /<p[^>]*data-music-status[^>]*>([\s\S]*?)<\/p>/.exec(capability);
    assert.ok(status, 'the built article is expected to carry a music status line');
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
    // selection, or a reader without scripts would lose ordinary copying.
    assert.ok(!/user-select:\s*none/i.test(capability), 'copy protection must not be baked into the markup');
    assert.match(capability, /data-copy-protection="true"/);
  });
});

describe('protected articles', () => {
  it('publish no draft ciphertext into the reader tree', () => {
    for (const lang of ['zh', 'ja', 'en']) {
      assert.equal(
        existsSync(join(out, lang, 'protected')),
        false,
        `${lang}/protected/ was built, but the only protected entry is a draft`,
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
