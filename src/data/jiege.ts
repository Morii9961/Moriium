import type { Language } from './site';

/**
 * Routes, copy and helpers for the 「界格」 design study.
 *
 * Self-contained on purpose. The interface labels are the same strings the
 * 版心 study uses, because a fair comparison needs both directions to show
 * identical content — but they are held here rather than imported, so removing
 * either study cannot break the other.
 *
 * What belongs to this direction alone is STATEMENT: the site's voice, set once
 * at the top of the home as a sentence rather than a logo. That wording is
 * Morii's own, taken from the production about page.
 */

export const JIEGE_BASE = '/design/jiege';

export function jgHome(lang: Language) {
  return `${JIEGE_BASE}/${lang}/`;
}

export function jgPath(lang: Language, ...segments: string[]) {
  const tail = segments.map((segment) => encodeURIComponent(segment)).join('/');
  return tail ? `${JIEGE_BASE}/${lang}/${tail}/` : jgHome(lang);
}

export const COPY = {
  zh: {
    lead: 'Morii 的个人博客。文章、摄影笔记、旅行记录与技术随笔，用中文、日本語、English 三种语言写。',
    nav: { home: '首页', writing: '文章', archive: '归档', categories: '分类', tags: '标签', about: '关于' },
    counts: { posts: '篇文章', categories: '个分类', tags: '个标签', updated: '最近更新' },
    latest: '最新一篇',
    more: '继续阅读',
    recent: '近期文章',
    empty: '这个语言目前只有一篇文章。',
    elsewhere: '其他语言的近期文章',
    discover: '按其他方式查找',
    archiveNote: '按时间顺序排列的全部文章。',
    categoriesNote: '按主题归类。',
    tagsNote: '更细的线索。',
    rss: '订阅 RSS',
    aboutLead: '关于这个站点',
    aboutMore: '阅读关于页 →',
    all: '全部',
    year: '年',
    count: '篇',
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
    readerFeatures: '本文加载的阅读模块',
    readerBasic: '仅基础阅读样式。',
    cover: '题图',
    notFound: '找不到这个页面',
    notFoundLead: '链接可能已经改变，或者这个页面从未存在过。可以从文章列表重新开始。',
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
      lead: '一个用来放长期内容的地方：文章、照片、旅行与技术笔记。没有评论、没有账号、没有统计脚本。',
      body: [
        '这里不追即时动态。写完的东西会留在原地，链接尽量不变，归档和翻译状态一直可查。',
        '站点在构建时生成静态文件。公开文章可以继续修改；受保护的文章先在本地加密，再把密文放上来，阅读它们不需要服务器参与。',
        '照片按需要放大到正文之外。正文之内保持一个稳定的阅读宽度，这是这套设计唯一坚持的事。',
      ],
      factsLabel: '基本信息',
      facts: [
        ['作者', 'Morii'],
        ['语言', '中文 · 日本語 · English'],
        ['正文', '静态生成'],
        ['授权', '代码 MIT，文章与照片保留权利'],
      ] as ReadonlyArray<readonly [string, string]>,
      linksLabel: '继续',
    },
  },
  ja: {
    lead: 'Morii の個人ブログ。記事、写真のメモ、旅の記録、技術ノートを中国語・日本語・英語で書いています。',
    nav: { home: 'ホーム', writing: '記事', archive: 'アーカイブ', categories: 'カテゴリー', tags: 'タグ', about: 'このサイト' },
    counts: { posts: '件の記事', categories: '件のカテゴリー', tags: '件のタグ', updated: '最終更新' },
    latest: '最新の記事',
    more: '続きを読む',
    recent: '最近の記事',
    empty: 'この言語の記事はまだ一件だけです。',
    elsewhere: 'ほかの言語の最近の記事',
    discover: 'ほかの探し方',
    archiveNote: '時系列に並べたすべての記事。',
    categoriesNote: '主題ごとの分類。',
    tagsNote: 'より細かい手がかり。',
    rss: 'RSS を購読',
    aboutLead: 'このサイトについて',
    aboutMore: 'このサイトのページへ →',
    all: 'すべて',
    year: '年',
    count: '件',
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
    readerFeatures: 'この記事が読み込む機能',
    readerBasic: '基本の閲覧スタイルのみ。',
    cover: 'カバー',
    notFound: 'ページが見つかりません',
    notFoundLead: 'リンクが変わったか、このページは元からありません。記事一覧からもう一度どうぞ。',
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
      lead: '長く残したいものを置く場所です。記事、写真、旅、技術ノート。コメント、アカウント、解析スクリプトはありません。',
      body: [
        '短い近況を追いかけません。書き終えたものはそのまま残し、リンクはできるだけ変えず、アーカイブと翻訳の状態はいつでも確認できます。',
        'サイトはビルド時に静的ファイルへ変換されます。公開記事は後から直せます。保護記事はローカルで暗号化してから置くので、読むのにサーバーは要りません。',
        '写真は必要なときだけ本文より外へ広がります。本文の幅は変わりません。この設計が守るのはそれだけです。',
      ],
      factsLabel: '基本情報',
      facts: [
        ['著者', 'Morii'],
        ['言語', '中文 · 日本語 · English'],
        ['生成', '静的ビルド'],
        ['ライセンス', 'コードは MIT、記事と写真は権利を留保'],
      ] as ReadonlyArray<readonly [string, string]>,
      linksLabel: '次へ',
    },
  },
  en: {
    lead: "Morii's personal blog: essays, photography notes, travel records, and technical writing, kept in Chinese, Japanese, and English.",
    nav: { home: 'Home', writing: 'Writing', archive: 'Archive', categories: 'Categories', tags: 'Tags', about: 'About' },
    counts: { posts: 'posts', categories: 'categories', tags: 'tags', updated: 'Last updated' },
    latest: 'Latest',
    more: 'Keep reading',
    recent: 'Recent writing',
    empty: 'This language has only one post so far.',
    elsewhere: 'Recent writing in other languages',
    discover: 'Other ways in',
    archiveNote: 'Everything in date order.',
    categoriesNote: 'Grouped by subject.',
    tagsNote: 'Finer threads.',
    rss: 'Subscribe by RSS',
    aboutLead: 'About this site',
    aboutMore: 'Read the about page →',
    all: 'All',
    year: '',
    count: 'posts',
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
    readerFeatures: 'Reader modules this post loads',
    readerBasic: 'Core reading styles only.',
    cover: 'Cover',
    notFound: 'Page not found',
    notFoundLead: 'The link may have changed, or this page never existed. The writing index is a good place to start again.',
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
      lead: 'A place for work meant to last: essays, photographs, travel, and technical notes. No comments, no accounts, no analytics.',
      body: [
        'This is not a feed. Finished pieces stay where they are, links change as little as possible, and the archive and translation state remain visible.',
        'The site builds to static files. Public posts stay editable; protected posts are encrypted locally and published as ciphertext, so reading one needs no server.',
        'Photographs widen past the text when they need to. The text itself keeps one measure. That is the only thing this design insists on.',
      ],
      factsLabel: 'Facts',
      facts: [
        ['Author', 'Morii'],
        ['Languages', '中文 · 日本語 · English'],
        ['Output', 'Static build'],
        ['Licence', 'Code MIT; writing and photographs reserved'],
      ] as ReadonlyArray<readonly [string, string]>,
      linksLabel: 'Continue',
    },
  },
} as const;

export type JiegeCopy = (typeof COPY)[Language];

export function jgDay(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function jgYear(date: Date) {
  return String(date.getFullYear());
}

/** Reading estimate that counts han and kana per character, Latin per word. */
export function jgReadingMinutes(body: string) {
  const cjk = body.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const words = body.replace(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g, ' ').match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  return Math.max(1, Math.ceil(cjk / 400 + words / 220));
}

/** Descending count order, then locale order, so listings are stable. */
export function jgCount<T>(items: T[], key: (item: T) => string[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const value of key(item)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
}

export const STATEMENT = {
  zh: {
    line: '把值得保留的东西，放在一个可以慢慢读完的地方。',
    sub: 'Moriium 是 Morii 的个人博客：文章、摄影笔记、旅行记录与技术随笔，用中文、日本語、English 三种语言写。',
    languages: '语言',
    languageValue: '中文 · 日本語 · English',
    since: '开始于',
    n: { posts: '文章', categories: '分类', tags: '标签', updated: '最近更新' },
  },
  ja: {
    line: '残しておきたいものを、ゆっくり読める場所へ。',
    sub: 'Moriium は Morii の個人ブログです。記事、写真のメモ、旅の記録、技術ノートを中国語・日本語・英語で書いています。',
    languages: '言語',
    languageValue: '中文 · 日本語 · English',
    since: '開始',
    n: { posts: '記事', categories: 'カテゴリー', tags: 'タグ', updated: '最終更新' },
  },
  en: {
    line: 'A place to keep what matters and read it slowly.',
    sub: "Moriium is Morii's personal blog: essays, photography notes, travel records, and technical writing, kept in Chinese, Japanese, and English.",
    languages: 'Languages',
    languageValue: '中文 · 日本語 · English',
    since: 'Since',
    n: { posts: 'Posts', categories: 'Categories', tags: 'Tags', updated: 'Last updated' },
  },
} as const;
