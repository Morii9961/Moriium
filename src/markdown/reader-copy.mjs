export const READER_COPY = {
  zh: {
    admonitions: { note: '注记', tip: '提示', important: '重要', warning: '警告', caution: '注意' },
    spoiler: '显示隐藏内容',
    github: { eyebrow: 'GitHub 仓库', invalid: '无效仓库', repository: '仓库' },
    image: { open: '查看图片：', fallback: '文章图片' },
    video: {
      fallback: '嵌入视频', load: '载入视频：',
      thirdParty: '第三方视频。载入后将连接外部服务。',
      blocked: '此视频来源未获允许。', unsupported: '浏览器不支持 HTML 视频。',
    },
    music: {
      untitled: '未命名曲目', unknownArtist: '未知艺人', play: '播放', pause: '暂停', lyrics: '歌词',
      noScriptLocal: '这些控件需要 JavaScript；上方音频播放器仍可使用。',
      noScriptRemote: '歌曲来自外部服务，需要 JavaScript 才能载入。',
      ready: '可以播放。', remoteReady: '播放时才连接音乐服务。',
      blocked: '此音乐来源未获允许。', response: '音乐服务返回错误：',
      source: '没有可播放的音频地址。', loading: '正在读取歌曲信息。完成后可再次播放。',
      loaded: '歌曲已载入。', playing: '播放中。', paused: '已暂停。', unavailable: '暂时无法播放。',
    },
    code: { copy: '复制代码', copied: '已复制', failed: '复制失败。可手动选择代码。' },
    copyProtection: '正文已限制复制；代码块不受影响。',
    footnotes: '脚注', footnoteBack: '返回注记 ',
    mermaid: { diagram: '图表', error: '图表未能生成。原始内容如下。' },
  },
  ja: {
    admonitions: { note: '注記', tip: 'ヒント', important: '重要', warning: '警告', caution: '注意' },
    spoiler: '伏せた内容を表示',
    github: { eyebrow: 'GitHub リポジトリ', invalid: '無効なリポジトリ', repository: 'リポジトリ' },
    image: { open: '画像を開く：', fallback: '記事の画像' },
    video: {
      fallback: '埋め込み動画', load: '動画を読み込む：',
      thirdParty: '外部サービスの動画です。読み込むと外部サービスに接続します。',
      blocked: 'この動画ソースは許可されていません。', unsupported: 'このブラウザーは HTML 動画に対応していません。',
    },
    music: {
      untitled: '無題の曲', unknownArtist: '不明なアーティスト', play: '再生', pause: '一時停止', lyrics: '歌詞',
      noScriptLocal: 'この操作には JavaScript が必要です。上の音声プレーヤーはそのまま使えます。',
      noScriptRemote: '外部サービスの曲を読み込むには JavaScript が必要です。',
      ready: '再生できます。', remoteReady: '再生時にだけ音楽サービスへ接続します。',
      blocked: 'この音楽ソースは許可されていません。', response: '音楽サービスからエラーが返されました：',
      source: '再生できる音声 URL がありません。', loading: '曲の情報を読み込んでいます。完了後にもう一度再生できます。',
      loaded: '曲を読み込みました。', playing: '再生中。', paused: '一時停止しました。', unavailable: '現在は再生できません。',
    },
    code: { copy: 'コードをコピー', copied: 'コピーしました', failed: 'コピーできませんでした。コードを手動で選択できます。' },
    copyProtection: '本文のコピーは制限されています。コードブロックには影響しません。',
    footnotes: '脚注', footnoteBack: '注記に戻る ',
    mermaid: { diagram: '図', error: '図を生成できませんでした。元の内容を示します。' },
  },
  en: {
    admonitions: { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' },
    spoiler: 'Reveal hidden text',
    github: { eyebrow: 'GitHub repository', invalid: 'Invalid repository', repository: 'Repository' },
    image: { open: 'Open image: ', fallback: 'article image' },
    video: {
      fallback: 'Embedded video', load: 'Load video: ',
      thirdParty: 'Third-party video. Loading it connects to an external service.',
      blocked: 'This video source is not allowed.', unsupported: 'Your browser does not support HTML video.',
    },
    music: {
      untitled: 'Untitled track', unknownArtist: 'Unknown artist', play: 'Play', pause: 'Pause', lyrics: 'Lyrics',
      noScriptLocal: 'These controls need JavaScript. The audio player above works without it.',
      noScriptRemote: 'This track loads from a remote service and needs JavaScript.',
      ready: 'Ready to play.', remoteReady: 'The music service is contacted only when playback starts.',
      blocked: 'This music source is not allowed.', response: 'The music service returned an error:',
      source: 'No playable audio URL was returned.', loading: 'Loading track details. Try playback again when it is ready.',
      loaded: 'Track loaded.', playing: 'Playing.', paused: 'Paused.', unavailable: 'This track is unavailable.',
    },
    code: { copy: 'Copy code', copied: 'Copied', failed: 'Copy failed. Select the code manually.' },
    copyProtection: 'Prose copying is restricted; code blocks are unaffected.',
    footnotes: 'Footnotes', footnoteBack: 'Back to reference ',
    mermaid: { diagram: 'Diagram', error: 'The diagram could not be rendered. Source follows.' },
  },
};

export function readerLanguageForFile(file) {
  const language = file?.data?.astro?.frontmatter?.lang;
  return language === 'zh' || language === 'ja' || language === 'en' ? language : 'en';
}

export function readerCopyForFile(file) {
  return READER_COPY[readerLanguageForFile(file)];
}
