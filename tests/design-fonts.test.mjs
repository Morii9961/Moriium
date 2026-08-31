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

test('production shell loads the three type roles and the token layers', async () => {
  const [layout, tokens] = await Promise.all([
    read('src/layouts/BaseLayout.astro'),
    read('src/styles/tokens.css'),
  ]);

  // DESIGN.md 5.1 defines three roles. The public shell loads exactly three
  // families for them; Sora belongs to the design study and must not follow the
  // reader onto a production page.
  assert.match(layout, /@fontsource-variable\/noto-sans-sc\/wght\.css/);
  assert.match(layout, /@fontsource\/ibm-plex-mono\/latin-400\.css/);
  assert.match(layout, /lxgw-wenkai-screen-webfont\/lxgwwenkaigbscreen\.css/);
  assert.doesNotMatch(layout, /sora/i);
  assert.doesNotMatch(layout, /https?:\/\//);

  for (const marker of ['masthead__tools', 'theme-icon--sun', 'theme-icon--moon', 'site-footer__identity']) {
    assert.match(layout + (await read('src/components/SiteHeader.astro')) + (await read('src/components/SiteFooter.astro')), new RegExp(marker));
  }

  // Reading is set in the serif, labels in the sans, figures in the monospace.
  assert.match(tokens, /--font-serif: 'LXGW WenKai Screen'/);
  assert.match(tokens, /--font-sans: 'Noto Sans SC Variable'/);
  assert.match(tokens, /--font-mono: 'IBM Plex Mono'/);
  assert.match(tokens, /--color-bg-primary: #f2f5f9/);
});

test('the home page is an editorial index built from real content', async () => {
  const [layout, header, home, writing] = await Promise.all([
    read('src/layouts/BaseLayout.astro'),
    read('src/components/SiteHeader.astro'),
    read('src/pages/[lang]/index.astro'),
    read('src/pages/[lang]/writing/index.astro'),
  ]);

  // The composition is the width sequence: gallery, media, the reading measure
  // at the centre, then media and gallery on the way back out.
  for (const band of ['measure--gallery opening', 'measure--media band', 'measure--text band']) {
    assert.match(home, new RegExp(`class="measure ${band}`));
  }
  assert.match(home, /getListedPosts\(lang\)/);
  assert.match(home, /postPath\(post\)/);
  assert.match(home, /<PostLedger/);
  assert.doesNotMatch(home, /PROTOTYPE_POSTS|PROTOTYPE_CATEGORIES|concept-a/);

  // No dashboard: DESIGN.md 3 rules out the statistics panel and the
  // contribution calendar this information usually arrives in.
  assert.doesNotMatch(home, /a-stats-panel|a-activity-panel|activity-calendar/);

  assert.match(writing, /getListedPosts\(lang\)/);
  assert.match(writing, /class="measure measure--media page-head"/);
  assert.match(header, /`\/\$\{lang\}\/writing\/`/);
  assert.match(layout, /<body class=\{bodyClass\}>/);
});

test('production copy keeps the Moriium voice and the accessible frame', async () => {
  const [home, layout, header, todo] = await Promise.all([
    read('src/pages/[lang]/index.astro'),
    read('src/layouts/BaseLayout.astro'),
    read('src/components/SiteHeader.astro'),
    read('docs/enouia-todo.md'),
  ]);

  assert.doesNotMatch(home, /edition:|\{c\.edition\}/);
  assert.match(home, /Morii 与 Enouia/);
  assert.match(home, /Morii と Enouia/);
  assert.match(home, /Morii and Enouia/);
  assert.doesNotMatch(home, /Morii's personal edition · Dalian|STATIC<br \/>FIRST|在大连生活，持续记录/);

  assert.match(layout, /\{ui\.skip\}/);
  assert.match(header, /aria-label=\{ui\.primaryNav\}/);

  assert.match(todo, /一次只拿一个待办/);
  assert.match(todo, /01　生产搜索/);
  assert.match(todo, /14　发布前总验收/);
  assert.match(todo, /## 明确不做/);
});

test('the language switch is global, and an article never invents a translation', async () => {
  const [article, protectedArticle, header] = await Promise.all([
    read('src/layouts/ArticleLayout.astro'),
    read('src/pages/[lang]/protected/[slug].astro'),
    read('src/components/SiteHeader.astro'),
  ]);

  for (const source of [article, protectedArticle]) {
    assert.match(source, /rel="alternate"/);
    assert.match(source, /hreflang=/);
  }

  // Switching language is a site-wide control and lives in the masthead.
  assert.match(header, /class="language-nav"/);
  assert.doesNotMatch(article, /class="language-nav"/);

  // The article states availability instead: the current version, a real link,
  // or an explicit "unavailable" — never a link to another language's page.
  assert.match(article, /entry\s*\? <a href=\{postPath\(entry\)\}/);
  assert.match(article, /: <span>\{UI\[code\]\.label\}<\/span>/);
  assert.match(article, /c\.unavailable/);
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
