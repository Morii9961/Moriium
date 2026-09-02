import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VIDEO_PROVIDERS = {
  youtube: (id) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`,
  bilibili: (id) => `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(id)}`,
};
const ALLOWED_METING_ORIGIN = 'https://meting.spr-aachen.com';

function allowedMeting(value) {
  try {
    return new URL(value).origin === ALLOWED_METING_ORIGIN ? value : '';
  } catch {
    return '';
  }
}

function walk(node, visitor, parent = null, index = -1) {
  visitor(node, parent, index);
  if (Array.isArray(node.children)) {
    for (let childIndex = 0; childIndex < node.children.length; childIndex += 1) {
      walk(node.children[childIndex], visitor, node, childIndex);
    }
  }
}

function element(tagName, properties = {}, children = []) {
  return { type: 'element', tagName, properties, children };
}

function text(value) {
  return { type: 'text', value };
}

function property(node, dashed, camel) {
  return node.properties?.[dashed] ?? node.properties?.[camel];
}

function readGitHubCache() {
  try {
    return JSON.parse(readFileSync(resolve('.cache/github.json'), 'utf8'));
  } catch {
    return {};
  }
}

function transformGitHub(node, cache) {
  const repo = String(property(node, 'data-repo', 'dataRepo') ?? '');
  const valid = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo);
  const href = valid ? `https://github.com/${repo}` : 'https://github.com/';
  const data = valid ? cache[repo.toLowerCase()] : undefined;
  node.tagName = 'a';
  node.properties = {
    className: ['github-card'],
    href,
    rel: ['noopener', 'noreferrer'],
  };
  node.children = [
    element('span', { className: ['github-card__eyebrow'] }, [text('GitHub repository')]),
    element('strong', { className: ['github-card__name'] }, [text(repo || 'Invalid repository')]),
    element('span', { className: ['github-card__description'] }, [
      text(data?.description || 'Open the repository on GitHub.'),
    ]),
    ...(data
      ? [
          element('span', { className: ['github-card__meta'] }, [
            text(`${data.language || 'Repository'} · ★ ${Number(data.stargazers_count || 0).toLocaleString('en-US')}`),
          ]),
        ]
      : []),
  ];
}

function transformVideo(node) {
  const provider = String(property(node, 'data-provider', 'dataProvider') ?? '');
  const id = String(property(node, 'data-id', 'dataId') ?? '');
  const src = String(property(node, 'data-src', 'dataSrc') ?? '');
  const title = String(property(node, 'data-title', 'dataTitle') ?? '') || 'Embedded video';
  const requestedRatio = String(property(node, 'data-ratio', 'dataRatio') ?? '16/9');
  const ratio = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(requestedRatio) ? requestedRatio : '16/9';
  const poster = String(property(node, 'data-poster', 'dataPoster') ?? '');

  node.tagName = 'figure';
  node.properties = { className: ['video-card'], style: `--video-ratio:${ratio}` };

  if (provider === 'local' && /^(\/|\.\/|\.\.\/)/.test(src)) {
    node.children = [
      element('video', { controls: true, preload: 'none', playsinline: true, poster, title }, [
        element('source', { src }),
        text('Your browser does not support HTML video.'),
      ]),
      element('figcaption', {}, [text(title)]),
    ];
    return;
  }

  const embed = VIDEO_PROVIDERS[provider]?.(id);
  // The consent control is a link, not a button. Deferring the iframe until the
  // reader asks is the point, but a button carrying the URL in a data attribute
  // leaves a reader without JavaScript with no way to reach the video at all.
  // As a link it degrades to what it is — a way to open the video at the
  // provider — and ReaderEnhancements upgrades it to an inline frame in place.
  // The href is the same allowlisted embed URL, so this adds no new origin.
  node.children = embed
    ? [
        element(
          'a',
          {
            className: ['video-consent'],
            href: embed,
            rel: ['noopener', 'noreferrer'],
            dataVideoSrc: embed,
            dataVideoTitle: title,
            ariaLabel: `Load video: ${title}`,
          },
          [
            element('span', { className: ['video-consent__title'] }, [text(title)]),
            element('span', { className: ['video-consent__note'] }, [
              text('Load this video from a third-party service'),
            ]),
          ],
        ),
        element('figcaption', {}, [text(title)]),
      ]
    : [element('p', { className: ['embed-error'] }, [text('This video source is not allowed.')])];
}

function transformMusic(node) {
  const properties = node.properties ?? {};
  const title = String(properties['data-title'] ?? properties.dataTitle ?? '') || 'Untitled track';
  const artist = String(properties['data-artist'] ?? properties.dataArtist ?? '') || 'Unknown artist';
  const audio = String(properties['data-audio'] ?? properties.dataAudio ?? '');
  const cover = String(properties['data-cover'] ?? properties.dataCover ?? '');
  const lrc = String(properties['data-lrc'] ?? properties.dataLrc ?? '');
  const meting = allowedMeting(String(properties['data-meting'] ?? properties.dataMeting ?? ''));
  const isSafeLocalAudio = /^(\/|\.\/|\.\.\/)/.test(audio);
  const isSafeCover = /^(https:\/\/|\/|\.\/|\.\.\/)/.test(cover);
  const isSafeLyrics = /^(https:\/\/|\/|\.\/|\.\.\/)/.test(lrc);

  node.tagName = 'figure';
  node.properties = {
    className: ['music-card', ...(isSafeCover ? [] : ['music-card--no-cover'])],
    dataMusicCard: '',
    ...(meting ? { dataMeting: meting } : {}),
  };
  node.children = [
    ...(isSafeCover
      ? [element('img', { src: cover, alt: '', loading: 'lazy', decoding: 'async', className: ['music-card__cover'] })]
      : []),
    element('figcaption', { className: ['music-card__body'] }, [
      element('strong', { className: ['music-card__title'] }, [text(title)]),
      element('span', { className: ['music-card__artist'] }, [text(artist)]),
      // This button does nothing without the script -- for a remote track it has
      // no audio URL yet, and for a local one every listener lives in
      // ReaderEnhancements. So it ships disabled in every case and is enabled on
      // bind. Shipping it enabled for local audio only looked like a smaller
      // claim, but it still put a dead control in front of a reader with no
      // JavaScript, which is the thing this is supposed to prevent.
      element(
        'button',
        { type: 'button', className: ['music-card__play'], dataMusicPlay: '', disabled: true },
        [text('Play')],
      ),
      ...(isSafeLyrics
        ? [element('a', { href: lrc, className: ['music-card__lyrics'], rel: ['noopener', 'noreferrer'] }, [text('Lyrics')])]
        : []),
      // Native controls are the fallback: with no script the element is still a
      // working player, and preload="none" keeps it from fetching anything.
      ...(isSafeLocalAudio
        ? [element('audio', { src: audio, controls: true, preload: 'none', dataMusicAudio: '' })]
        : []),
      // The static status describes the page as it stands, with no script yet
      // run. Telling a reader to press play while the button is disabled is the
      // contradiction this replaces; ReaderEnhancements swaps in the working
      // message once the control actually works.
      element('p', { className: ['music-card__status'], ariaLive: 'polite', dataMusicStatus: '' }, [
        text(
          isSafeLocalAudio
            ? 'These controls need JavaScript. The audio player above works without it.'
            : 'This track loads from a remote service, which needs JavaScript.',
        ),
      ]),
    ]),
  ];
}

export function rehypeMoriiumContent() {
  const githubCache = readGitHubCache();

  return (tree) => {
    walk(tree, (node, parent, index) => {
      if (node.type !== 'element') return;

      if (node.tagName === 'img' && parent && parent.tagName !== 'a') {
        const src = String(node.properties?.src ?? '');
        if (!src) return;
        node.properties = { ...(node.properties ?? {}), loading: 'lazy', decoding: 'async' };
        parent.children[index] = element(
          'a',
          {
            href: src,
            className: ['article-image-link'],
            dataLightbox: '',
            ariaLabel: `Open image: ${String(node.properties.alt ?? 'article image')}`,
          },
          [node],
        );
        return;
      }

      if (property(node, 'data-github', 'dataGithub') !== undefined) transformGitHub(node, githubCache);
      if (property(node, 'data-video', 'dataVideo') !== undefined) transformVideo(node);
      if (property(node, 'data-music', 'dataMusic') !== undefined) transformMusic(node);

      if (node.tagName === 'a' && /^https?:\/\//.test(String(node.properties?.href ?? ''))) {
        node.properties = { ...(node.properties ?? {}), rel: ['noopener', 'noreferrer'] };
      }
    });
  };
}
