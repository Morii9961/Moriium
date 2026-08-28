import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

function plainText(markup) {
  return markup
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function taggedText(markup, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  return [...markup.matchAll(pattern)].map((match) => plainText(match[1])).join(' ');
}

function codePoints(text) {
  return new Set([...text].map((character) => character.codePointAt(0)));
}

function rangeContains(rangeList, points) {
  for (const token of rangeList.split(',')) {
    const match = token.trim().match(/^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/i);
    if (!match) continue;
    const start = Number.parseInt(match[1], 16);
    const end = Number.parseInt(match[2] ?? match[1], 16);
    for (const point of points) if (point >= start && point <= end) return true;
  }
  return false;
}

async function matchingChunks(cssPath, fileDirectory, text) {
  const css = await read(cssPath);
  const points = codePoints(text);
  const names = new Set();

  for (const match of css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)) {
    const block = match[1];
    const range = block.match(/unicode-range:\s*([^;]+)/i)?.[1];
    const file = block.match(/url\(["']?\.\/files\/([^"')]+\.woff2)/i)?.[1];
    if (range && file && rangeContains(range, points)) names.add(file);
  }

  let bytes = 0;
  for (const name of names) bytes += (await stat(new URL(`${fileDirectory}/${name}`, root))).size;
  return { files: names.size, bytes };
}

const [home, article] = await Promise.all([
  read('dist/design/a/index.html'),
  read('dist/design/a/article/index.html'),
]);

const allPageText = `${plainText(home)} ${plainText(article)}`;
const displayText = [
  taggedText(home, 'h1'),
  taggedText(article, 'h1'),
  taggedText(article, 'h2'),
  taggedText(article, 'blockquote'),
].join(' ');

function pageDisplayText(markup) {
  return [taggedText(markup, 'h1'), taggedText(markup, 'h2'), taggedText(markup, 'blockquote')].join(' ');
}

const [noto, wenkai, sora, ibm] = await Promise.all([
  matchingChunks(
    'node_modules/@fontsource-variable/noto-sans-sc/wght.css',
    'node_modules/@fontsource-variable/noto-sans-sc/files',
    allPageText,
  ),
  matchingChunks(
    'node_modules/lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css',
    'node_modules/lxgw-wenkai-screen-webfont/files',
    displayText,
  ),
  stat(new URL('node_modules/@fontsource-variable/sora/files/sora-latin-wght-normal.woff2', root)),
  stat(new URL('node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2', root)),
]);

const builtAssets = await readdir(new URL('dist/_astro/', root), { withFileTypes: true });
const builtFonts = builtAssets.filter((entry) => entry.isFile() && entry.name.endsWith('.woff2'));
let builtFontBytes = 0;
for (const entry of builtFonts) builtFontBytes += (await stat(new URL(`dist/_astro/${entry.name}`, root))).size;

const cssHref = home.match(/href="(\/_astro\/[^"?]+\.css)"/)?.[1];
assert(cssHref, 'A prototype CSS asset was not found in built HTML.');
const builtCss = await read(`dist${cssHref}`);
const remoteFontUrls = builtCss.match(/url\(["']?https?:\/\/[^)]+/gi) ?? [];
assert.equal(remoteFontUrls.length, 0, 'A prototype CSS must not request remote fonts.');

const pageUpperBoundBytes = noto.bytes + wenkai.bytes + sora.size + ibm.size;
const [homeNoto, homeWenkai, articleNoto, articleWenkai] = await Promise.all([
  matchingChunks(
    'node_modules/@fontsource-variable/noto-sans-sc/wght.css',
    'node_modules/@fontsource-variable/noto-sans-sc/files',
    plainText(home),
  ),
  matchingChunks(
    'node_modules/lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css',
    'node_modules/lxgw-wenkai-screen-webfont/files',
    pageDisplayText(home),
  ),
  matchingChunks(
    'node_modules/@fontsource-variable/noto-sans-sc/wght.css',
    'node_modules/@fontsource-variable/noto-sans-sc/files',
    plainText(article),
  ),
  matchingChunks(
    'node_modules/lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css',
    'node_modules/lxgw-wenkai-screen-webfont/files',
    pageDisplayText(article),
  ),
]);
const latinBytes = sora.size + ibm.size;
const homeUpperBoundBytes = homeNoto.bytes + homeWenkai.bytes + latinBytes;
const articleUpperBoundBytes = articleNoto.bytes + articleWenkai.bytes + latinBytes;

console.log(`Built font library: ${builtFonts.length} WOFF2 files, ${builtFontBytes} bytes.`);
console.log(`Bundled prototype CSS: ${Buffer.byteLength(builtCss)} bytes raw, ${gzipSync(builtCss).length} bytes gzip.`);
console.log(`A home character upper bound: ${homeUpperBoundBytes} bytes.`);
console.log(`A article character upper bound: ${articleUpperBoundBytes} bytes.`);
console.log(`A page Noto Sans SC upper bound: ${noto.files} chunks, ${noto.bytes} bytes.`);
console.log(`A display LXGW WenKai: ${wenkai.files} chunks, ${wenkai.bytes} bytes.`);
console.log(`A Latin display and metadata: 2 chunks, ${sora.size + ibm.size} bytes.`);
console.log(`A two-page character upper bound: ${pageUpperBoundBytes} bytes; remote font URLs: 0.`);
