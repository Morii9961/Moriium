import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('A prototype uses exact local font packages and keeps mixed-script display order', async () => {
  const [layout, styles, manifest] = await Promise.all([
    read('src/layouts/PrototypeLayout.astro'),
    read('src/styles/prototypes.css'),
    read('package.json').then(JSON.parse),
  ]);

  assert.match(layout, /@fontsource-variable\/noto-sans-sc\/wght\.css/);
  assert.match(layout, /@fontsource-variable\/sora\/wght\.css/);
  assert.match(layout, /@fontsource\/ibm-plex-mono\/latin-400\.css/);
  assert.match(layout, /lxgw-wenkai-screen-webfont\/lxgwwenkaigbscreen\.css/);
  assert.doesNotMatch(layout, /https?:\/\//);

  assert.equal(manifest.dependencies['@fontsource-variable/noto-sans-sc'], '5.3.0');
  assert.equal(manifest.dependencies['@fontsource-variable/sora'], '5.3.0');
  assert.equal(manifest.dependencies['@fontsource/ibm-plex-mono'], '5.3.0');
  assert.equal(manifest.dependencies['lxgw-wenkai-screen-webfont'], '1.7.0');

  assert.match(
    styles,
    /--font-a-display:\s*"Sora Variable",\s*"LXGW WenKai Screen",\s*"Noto Sans SC Variable"/,
  );
  assert.match(styles, /\.concept-a \.prototype-post h3,\s*\.concept-a \.prototype-post h2\s*{[^}]*var\(--font-a-text\)/s);
  assert.match(styles, /\.concept-a \.a-article__body blockquote\s*{[^}]*var\(--font-a-display\)/s);
  assert.match(
    styles,
    /\.concept-a \.prototype-post time,\s*\.concept-a \.prototype-post > a > span\s*{[^}]*var\(--font-a-data\)/s,
  );
});

test('selected A prototype exposes an expressive home, independent directories, and long-form reading', async () => {
  const [layout, home, article, writing, archive, categories, tags, about] = await Promise.all([
    read('src/layouts/PrototypeLayout.astro'),
    read('src/pages/design/[concept]/index.astro'),
    read('src/pages/design/[concept]/article/index.astro'),
    read('src/pages/design/a/writing/index.astro'),
    read('src/pages/design/a/archive/index.astro'),
    read('src/pages/design/a/categories/index.astro'),
    read('src/pages/design/a/tags/index.astro'),
    read('src/pages/design/a/about/index.astro'),
  ]);

  for (const marker of ['a-opening', 'a-feature-reel', 'a-post-index', 'a-home-utility', 'a-profile-panel', 'a-stats-panel', 'a-activity-panel', 'a-discovery', 'a-site-index', 'a-about']) {
    assert.match(home, new RegExp(`class=\\"[^\\"]*${marker}`));
  }
  assert.doesNotMatch(home, /a-welcome|a-opening__rail|a-ledger/);
  assert.doesNotMatch(layout, /class=\"study-bar/);
  for (const marker of ['data-search-open', 'data-search-dialog', 'data-search-input', 'data-theme-toggle']) {
    assert.match(layout, new RegExp(marker));
  }
  assert.match(layout, /moriium-prototype-theme/);

  assert.match(layout, /writing:\s*`\$\{prototypeHome\}writing\/`/);
  assert.match(layout, /archive:\s*`\$\{prototypeHome\}archive\/`/);
  assert.match(layout, /categories:\s*`\$\{prototypeHome\}categories\/`/);
  assert.match(layout, /tags:\s*`\$\{prototypeHome\}tags\/`/);
  assert.match(layout, /about:\s*`\$\{prototypeHome\}about\/`/);

  for (const [source, page] of [
    [writing, 'writing'],
    [archive, 'archive'],
    [categories, 'categories'],
    [tags, 'tags'],
    [about, 'about'],
  ]) {
    assert.match(source, new RegExp(`page=\\"${page}\\"`));
    assert.match(source, /class=\"[^\"]*a-directory/);
  }

  for (const marker of ['a-article__hero', 'a-article__facts', 'a-article__outline', 'a-article__context', 'a-article__end']) {
    assert.match(article, new RegExp(`class=\\"[^\\"]*${marker}`));
  }

  assert.match(article, /尚未提供/);
  assert.match(article, /本文没有加载代码、图表或媒体模块/);
});

test('production shell loads the public typography and editorial frame', async () => {
  const [layout, styles] = await Promise.all([
    read('src/layouts/BaseLayout.astro'),
    read('src/styles/public.css'),
  ]);

  assert.match(layout, /@fontsource-variable\/noto-sans-sc\/wght\.css/);
  assert.match(layout, /@fontsource-variable\/sora\/wght\.css/);
  assert.match(layout, /@fontsource\/ibm-plex-mono\/latin-400\.css/);
  assert.match(layout, /lxgw-wenkai-screen-webfont\/lxgwwenkaigbscreen\.css/);

  for (const marker of ['site-actions', 'theme-icon--sun', 'theme-icon--moon', 'site-footer__identity']) {
    assert.match(layout, new RegExp(marker));
  }

  assert.match(layout, /import '\.\.\/styles\/public\.css'/);
  assert.doesNotMatch(layout, /public-(?:home|reading)\.css/);
  assert.match(layout, /bodyClass = 'public-site'/);
  assert.match(styles, /--surface:\s*var\(--moriium-light-canvas\)/);
  assert.match(styles, /--font-display:\s*"Noto Sans SC Variable",\s*"Sora Variable"/);
  assert.match(styles, /\.public-site \.site-header__inner\s*{[^}]*grid-template-columns:\s*minmax\(12rem, 1fr\) auto minmax\(12rem, 1fr\)/s);
  assert.match(styles, /\.public-site \.site-footer__name\s*{[^}]*color:\s*var\(--accent-field-ink\)/s);
  assert.match(styles, /\.a-directory__stats div\s*{[^}]*padding-inline:\s*clamp\(1rem, 2vw, 1\.5rem\)/s);
});

test('the home hero ships a local Shippori Mincho subset that covers its own copy', async () => {
  const [home, homeStyles, manifest, packageManifest] = await Promise.all([
    read('src/pages/[lang]/index.astro'),
    read('src/styles/public-home.css'),
    read('scripts/hero-font-subset.json').then(JSON.parse),
    read('package.json').then(JSON.parse),
  ]);

  // The face is a dev-time source for the subset, never a runtime dependency.
  assert.equal(packageManifest.devDependencies['@fontsource/shippori-mincho'], '5.3.0');
  assert.equal(packageManifest.dependencies['@fontsource/shippori-mincho'], undefined);

  for (const weight of [400, 600]) {
    assert.match(
      homeStyles,
      new RegExp(`font-weight: ${weight};[\\s\\S]{0,200}url\\("/fonts/shippori-mincho-hero-${weight}\\.woff2"\\) format\\("woff2"\\)`),
    );
  }
  assert.doesNotMatch(homeStyles, /url\(["']?https?:\/\//);
  assert.match(homeStyles, /--font-mincho: "Shippori Mincho", "Yu Mincho"/);
  assert.equal(homeStyles.split('unicode-range: ').length - 1, 2);
  assert(homeStyles.includes(`unicode-range: ${manifest.unicodeRange};`), 'CSS unicode-range must match the generated subset.');

  // Every character the hero sets in the display Mincho must be in the subset,
  // or it silently drops to a platform fallback and breaks the composition.
  const heroCopy = [
    ...[...home.matchAll(/char: '([^']+)'/g)].map((match) => match[1]),
    ...[...home.matchAll(/leftNote: '([^']+)'/g)].map((match) => match[1]),
    ...[...home.matchAll(/rightNote: '([^']+)'/g)].map((match) => match[1]),
  ].join('');
  assert(heroCopy.length > 0, 'Hero display copy was not found; the source shape changed.');
  const covered = new Set(manifest.characters);
  const missing = [...new Set(heroCopy)].filter((character) => !covered.has(character));
  assert.deepEqual(missing, [], `Re-run scripts/subset-hero-font.mjs; uncovered: ${missing.join('')}`);
});

test('production home and writing index use the rebuilt editorial system with real content', async () => {
  const [layout, home, writing] = await Promise.all([
    read('src/layouts/BaseLayout.astro'),
    read('src/pages/[lang]/index.astro'),
    read('src/pages/[lang]/writing/index.astro'),
  ]);

  for (const marker of ['aperture-hero', 'aperture-hero__note', 'aperture-hero__overprint', 'aperture-identity', 'aperture-ways', 'aperture-field', 'aperture-now', 'aperture-closing']) {
    assert.match(home, new RegExp(`class=\"[^\"]*${marker}`));
  }
  assert.match(home, /aperture-hero__phrase aperture-hero__phrase--\$\{line\}/);
  assert.match(home, /aperture-hero__glyph aperture-hero__glyph--\$\{treatment\}/);
  assert.match(home, /getListedPosts\(lang\)/);
  assert.match(home, /import '\.\.\/\.\.\/styles\/public-home\.css'/);
  assert.match(home, /postPath\(post\)/);
  assert.match(home, /const recentPosts = posts\.slice\(0, 4\)/);
  assert.doesNotMatch(home, /leadPost|aperture-lead|aperture-hero__aside/);
  assert.doesNotMatch(home, /aperture-hero__thesis-tail|aperture-hero__counterline/);
  assert.doesNotMatch(home, /aperture-hero__type-row/);
  assert.doesNotMatch(home, /PROTOTYPE_POSTS|PROTOTYPE_CATEGORIES/);

  assert.doesNotMatch(writing, /bodyClass=|prototypes\.css/);
  assert.match(writing, /getListedPosts\(lang\)/);
  assert.match(writing, /class=\"a-directory\"/);
  assert.match(layout, /`\/\$\{lang\}\/writing\/`/);
  assert.match(layout, /<body class=\{bodyClass\}>/);
});

test('production copy removes prototype fillers and keeps the Moriium voice', async () => {
  const [home, layout, todo] = await Promise.all([
    read('src/pages/[lang]/index.astro'),
    read('src/layouts/BaseLayout.astro'),
    read('docs/enouia-todo.md'),
  ]);

  assert.doesNotMatch(home, /edition:|\{c\.edition\}|记录与留白/);
  assert.match(home, /見たものを記す。未完のまま残す。/);
  assert.match(home, /時間の中で、拾い集める。/);
  assert.match(home, /いつか戻れるように。/);
  // The display type stays Japanese in all three languages — it is read as form.
  // The panel beside it is ordinary prose, so it follows the page language and
  // no longer advertises the three languages as a label.
  assert.match(home, /heroBody: \['文字と写真と旅の断片を、', 'ここでゆっくりと整理していく。'\]/);
  assert.match(home, /heroBody: \['文字、照片与旅途的断片，'/);
  assert.match(home, /heroBody: \['Fragments of writing, photographs'/);
  assert.match(home, /\{c\.heroIdentity\}/);
  assert.match(home, /\{c\.heroBody\.map/);
  assert.doesNotMatch(home, /ZH · JA · EN|lang="ja"><span>\{heroCopy\.enter\}/);
  assert.doesNotMatch(home, /Morii's personal edition · Dalian|STATIC<br \/>FIRST|a-profile-panel__mark|在大连生活，持续记录/);
  assert.match(layout, /\{ui\.skip\}/);
  assert.match(layout, /aria-label=\{ui\.primaryNav\}/);
  // The header mark is the wordmark alone; the tagline lives in the footer only.
  assert.match(layout, /<a class="site-mark" href=\{`\/\$\{lang\}\/`\}><strong>\{SITE\.name\}<\/strong><\/a>/);

  assert.match(todo, /一次只拿一个待办/);
  assert.match(todo, /01　生产搜索/);
  assert.match(todo, /14　发布前总验收/);
  assert.match(todo, /## 明确不做/);
});

test('article pages keep language alternates in metadata without an inline language switch', async () => {
  const [article, protectedArticle, layout, styles] = await Promise.all([
    read('src/layouts/ArticleLayout.astro'),
    read('src/pages/[lang]/protected/[slug].astro'),
    read('src/layouts/BaseLayout.astro'),
    read('src/styles/base.css'),
  ]);

  for (const source of [article, protectedArticle]) {
    assert.match(source, /rel="alternate"/);
    assert.match(source, /hreflang=/);
    assert.doesNotMatch(source, /TranslationLinks|translation-list/);
  }
  assert.match(layout, /class="language-nav"/);
  assert.doesNotMatch(styles, /\.translation-list/);
});

test('bundled font CSS uses WOFF2 subsets and swap rendering without remote URLs', async () => {
  const [notoSans, sora, ibmPlexMonoLatin, lxgwWenKai] = await Promise.all([
    read('node_modules/@fontsource-variable/noto-sans-sc/wght.css'),
    read('node_modules/@fontsource-variable/sora/wght.css'),
    read('node_modules/@fontsource/ibm-plex-mono/latin-400.css'),
    read('node_modules/lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css'),
  ]);

  for (const css of [notoSans, sora, ibmPlexMonoLatin, lxgwWenKai]) {
    assert.match(css, /font-display:\s*swap/);
    assert.match(css, /\.woff2/);
    assert.doesNotMatch(css, /url\(["']?https?:\/\//);
  }

  for (const css of [notoSans, sora, lxgwWenKai]) assert.match(css, /unicode-range:/);
  assert.match(ibmPlexMonoLatin, /ibm-plex-mono-latin-400-normal\.woff2/);
});
