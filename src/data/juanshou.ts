import type { Language } from './site';

/**
 * Routes, copy and helpers for the 「卷首」 design study.
 *
 * Self-contained: it holds its own strings rather than importing from the
 * 版心 or 界格 studies, so removing any of the three cannot break the others.
 *
 * The interface labels match the other studies word for word, because a fair
 * comparison needs the same content in each. What is new here is FOREWORD and
 * the `say` lines: writing in Morii's own register instead of field labels.
 * That is the whole point of this direction, and it is why the copy lives in
 * one reviewable place rather than scattered through the templates.
 *
 * The voice is taken from wording Morii already uses on the production about
 * page and in the site footer. Nothing here invents a fact about Morii; the
 * 近况 lines are built from the content collection at build time.
 */

export const JUANSHOU_BASE = '/design/juanshou';

export function jsHome(lang: Language) {
  return `${JUANSHOU_BASE}/${lang}/`;
}

export function jsPath(lang: Language, ...segments: string[]) {
  const tail = segments.map((segment) => encodeURIComponent(segment)).join('/');
  return tail ? `${JUANSHOU_BASE}/${lang}/${tail}/` : jsHome(lang);
}

export function jsDay(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function jsYear(date: Date) {
  return String(date.getFullYear());
}

export function jsReadingMinutes(body: string) {
  const cjk = body.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const words = body.replace(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g, ' ').match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  return Math.max(1, Math.ceil(cjk / 400 + words / 220));
}

export function jsCount<T>(items: T[], key: (item: T) => string[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const value of key(item)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
}

/**
 * The foreword.
 *
 * Front matter is a structure that cannot be filled in without a voice: there
 * is no way to write an opening note and stay neutral. That is deliberate —
 * the two earlier studies were impersonal precisely because every slot they
 * offered could be filled with a label.
 */
export const FOREWORD = {
  zh: {
    kicker: '卷首',
    lines: [
      '这个站是我自己的地方。',
      '写完的东西就留在这里，不催更新，也不追热闹。照片慢慢放上来，文章想改就改。',
      '如果你路过，随便翻。',
    ],
    by: 'Morii',
    at: '2026 年 8 月 · 中文 / 日本語 / English',
  },
  ja: {
    kicker: '巻頭',
    lines: [
      'ここは自分の場所です。',
      '書き終えたものはそのまま置いておきます。更新は急がず、話題も追いません。写真は少しずつ、記事は気が向いたら直します。',
      '通りかかったら、好きに見ていってください。',
    ],
    by: 'Morii',
    at: '2026年8月 · 中文 / 日本語 / English',
  },
  en: {
    kicker: 'Front matter',
    lines: [
      'This is my own place.',
      'What I finish stays here. I am not chasing updates, and I am not chasing attention. Photographs go up slowly; posts get revised when I feel like it.',
      'If you are passing through, look around.',
    ],
    by: 'Morii',
    at: 'August 2026 · 中文 / 日本語 / English',
  },
} as const;

export const COPY = {
  zh: {
    nav: { home: '首页', writing: '文章', archive: '归档', categories: '分类', tags: '标签', about: '关于' },
    contents: '目次',
    contentsSay: '这个站有什么，都在这里。',
    latest: '最新一篇',
    latestSay: '新的排在最前面。',
    now: '近况',
    more: '继续阅读',
    recent: '其余文章',
    recentSay: '想按时间、主题或线索找，用下面几个入口。',
    empty: '这个语言目前只有一篇文章。',
    colophon: '版权页',
    colophonSay: '这个站怎么做出来的，以及去哪儿找我。',
    rss: '订阅',
    rssSay: '有新文章时直接收到。',
    aboutMore: '关于这个站点',
    year: '年',
    count: '篇',
    all: '全部文章',
    backToWriting: '← 返回文章列表',
    outline: '本页目录',
    published: '发布',
    updated: '更新',
    reading: '阅读',
    minutes: (n: number) => `${n} 分钟`,
    category: '分类',
    tags: '标签',
    translations: '其他语言',
    current: '当前',
    unavailable: '暂无',
    previous: '上一篇',
    next: '下一篇',
    readerFeatures: '阅读模块',
    readerBasic: '仅基础阅读样式。',
    cover: '题图',
    end: '完',
    notFound: '找不到这个页面',
    notFoundSay: '链接可能改过，或者这一页从来没有存在过。从文章列表重新开始最快。',
    writingSay: '按时间倒序排列，最近写的在最上面。',
    archiveSay: '全部文章，按年份收起来。',
    categoriesSay: '按主题分。写得杂，所以分类也不多。',
    tagsSay: '比分类更细的线索。',
    aboutSay: '这个站是什么，以及不打算做成什么。',
    feature: {
      lightbox: '图片灯箱',
      mermaid: '图表',
      music: '音乐',
      video: '视频',
      math: '数学排版',
      copyProtection: '复制保护',
    },
    about: {
      title: '关于 Moriium',
      lines: [
        '这里不追即时动态。写完的东西会留在原地，链接尽量不变，归档和翻译状态一直可查。',
        '站点在构建时生成静态文件。公开文章可以继续修改；受保护的文章先在本地加密，再把密文放上来，阅读它们不需要服务器参与。',
        '照片按需要放大到正文之外，正文之内保持一个稳定的阅读宽度。没有评论、没有账号、没有统计脚本。',
      ],
      facts: [
        ['作者', 'Morii'],
        ['语言', '中文 · 日本語 · English'],
        ['生成', '构建时静态输出'],
        ['授权', '代码 MIT，文章与照片保留权利'],
      ] as ReadonlyArray<readonly [string, string]>,
    },
  },
  ja: {
    nav: { home: 'ホーム', writing: '記事', archive: 'アーカイブ', categories: 'カテゴリー', tags: 'タグ', about: 'このサイト' },
    contents: '目次',
    contentsSay: 'このサイトにあるものは、ここに全部あります。',
    latest: '最新の記事',
    latestSay: '新しいものが先頭に来ます。',
    now: '近況',
    more: '続きを読む',
    recent: 'そのほかの記事',
    recentSay: '時系列、主題、手がかりから探すなら、下の入口をどうぞ。',
    empty: 'この言語の記事はまだ一件だけです。',
    colophon: '奥付',
    colophonSay: 'このサイトの作りと、連絡先。',
    rss: '購読',
    rssSay: '新しい記事をそのまま受け取れます。',
    aboutMore: 'このサイトについて',
    year: '年',
    count: '件',
    all: 'すべての記事',
    backToWriting: '← 記事一覧へ戻る',
    outline: '目次',
    published: '公開',
    updated: '更新',
    reading: '読了目安',
    minutes: (n: number) => `${n} 分`,
    category: 'カテゴリー',
    tags: 'タグ',
    translations: 'ほかの言語',
    current: '現在',
    unavailable: '未提供',
    previous: '前の記事',
    next: '次の記事',
    readerFeatures: '読み込む機能',
    readerBasic: '基本の閲覧スタイルのみ。',
    cover: 'カバー',
    end: '了',
    notFound: 'ページが見つかりません',
    notFoundSay: 'リンクが変わったか、このページは元からありません。記事一覧からどうぞ。',
    writingSay: '新しい順に並んでいます。',
    archiveSay: 'すべての記事を年ごとにまとめています。',
    categoriesSay: '主題ごとの分類。雑多に書くので、数は多くありません。',
    tagsSay: 'カテゴリーより細かい手がかり。',
    aboutSay: 'このサイトが何で、何にしないつもりか。',
    feature: {
      lightbox: '画像表示',
      mermaid: '図表',
      music: '音楽',
      video: '動画',
      math: '数式組版',
      copyProtection: 'コピー保護',
    },
    about: {
      title: 'Moriium について',
      lines: [
        '短い近況を追いかけません。書き終えたものはそのまま残し、リンクはできるだけ変えず、アーカイブと翻訳の状態はいつでも確認できます。',
        'サイトはビルド時に静的ファイルへ変換されます。公開記事は後から直せます。保護記事はローカルで暗号化してから置くので、読むのにサーバーは要りません。',
        '写真は必要なときだけ本文より外へ広がり、本文の幅は変わりません。コメント、アカウント、解析スクリプトはありません。',
      ],
      facts: [
        ['著者', 'Morii'],
        ['言語', '中文 · 日本語 · English'],
        ['生成', 'ビルド時の静的出力'],
        ['ライセンス', 'コードは MIT、記事と写真は権利を留保'],
      ] as ReadonlyArray<readonly [string, string]>,
    },
  },
  en: {
    nav: { home: 'Home', writing: 'Writing', archive: 'Archive', categories: 'Categories', tags: 'Tags', about: 'About' },
    contents: 'Contents',
    contentsSay: 'Everything on this site, in one list.',
    latest: 'Latest',
    latestSay: 'Newest first.',
    now: 'Lately',
    more: 'Keep reading',
    recent: 'Other writing',
    recentSay: 'To look by date, subject, or thread, use the entries below.',
    empty: 'This language has only one post so far.',
    colophon: 'Colophon',
    colophonSay: 'How this site is made, and where to find me.',
    rss: 'Subscribe',
    rssSay: 'New posts, delivered as they are written.',
    aboutMore: 'About this site',
    year: '',
    count: 'posts',
    all: 'All writing',
    backToWriting: '← Back to all writing',
    outline: 'On this page',
    published: 'Published',
    updated: 'Updated',
    reading: 'Reading',
    minutes: (n: number) => `${n} min`,
    category: 'Category',
    tags: 'Tags',
    translations: 'Other languages',
    current: 'Current',
    unavailable: 'Unavailable',
    previous: 'Previous',
    next: 'Next',
    readerFeatures: 'Reader modules',
    readerBasic: 'Core reading styles only.',
    cover: 'Cover',
    end: 'End',
    notFound: 'Page not found',
    notFoundSay: 'The link may have changed, or this page never existed. The writing index is the quickest way back.',
    writingSay: 'Newest first.',
    archiveSay: 'Everything, gathered by year.',
    categoriesSay: 'Grouped by subject. I write about a lot of things, so there are not many.',
    tagsSay: 'Finer threads than the categories.',
    aboutSay: 'What this site is, and what it is not going to become.',
    feature: {
      lightbox: 'image lightbox',
      mermaid: 'diagrams',
      music: 'music',
      video: 'video',
      math: 'math typesetting',
      copyProtection: 'copy protection',
    },
    about: {
      title: 'About Moriium',
      lines: [
        'This is not a feed. Finished pieces stay where they are, links change as little as possible, and the archive and translation state remain visible.',
        'The site builds to static files. Public posts stay editable; protected posts are encrypted locally and published as ciphertext, so reading one needs no server.',
        'Photographs widen past the text when they need to, and the text keeps one measure. No comments, no accounts, no analytics.',
      ],
      facts: [
        ['Author', 'Morii'],
        ['Languages', '中文 · 日本語 · English'],
        ['Output', 'Static files at build time'],
        ['Licence', 'Code MIT; writing and photographs reserved'],
      ] as ReadonlyArray<readonly [string, string]>,
    },
  },
} as const;

export type JuanshouCopy = (typeof COPY)[Language];

/**
 * 近况, written rather than tallied.
 *
 * The numbers come from the content collection; the sentence around them is
 * authored. `3 posts / 1 category / 2 tags` is true and says nothing about
 * whose site this is — and when a language holds one post, a bare count is
 * actively unflattering. Saying what was written and when is the same fact,
 * told by a person.
 */
export function nowLines(
  lang: Language,
  input: { total: number; latestTitle?: string; latestDate?: Date; languages: number },
) {
  const day = input.latestDate ? jsDay(input.latestDate) : undefined;
  if (lang === 'zh') {
    return [
      day && input.latestTitle
        ? { mark: day, text: `最近写的是《${input.latestTitle}》。` }
        : undefined,
      { mark: '合计', text: `这个语言下目前有 ${input.total} 篇公开文章，全站共 ${input.languages} 种语言。` },
      { mark: '正在做', text: '站点本身还在重做，公开页面的设计还没有定下来。' },
    ].filter(Boolean) as Array<{ mark: string; text: string }>;
  }
  if (lang === 'ja') {
    return [
      day && input.latestTitle
        ? { mark: day, text: `最近書いたのは「${input.latestTitle}」です。` }
        : undefined,
      { mark: '合計', text: `この言語の公開記事は ${input.total} 件、サイト全体で ${input.languages} 言語です。` },
      { mark: '進行中', text: 'サイト自体を作り直している最中で、公開ページの設計はまだ決まっていません。' },
    ].filter(Boolean) as Array<{ mark: string; text: string }>;
  }
  return [
    day && input.latestTitle
      ? { mark: day, text: `The last thing I wrote was “${input.latestTitle}”.` }
      : undefined,
    { mark: 'In all', text: `${input.total} public posts in this language, across ${input.languages} languages site-wide.` },
    { mark: 'Underway', text: 'The site itself is being rebuilt; the public design is not settled yet.' },
  ].filter(Boolean) as Array<{ mark: string; text: string }>;
}
