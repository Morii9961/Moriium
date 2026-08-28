import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';

const root = resolve(import.meta.dirname, '..');
const postsRoot = resolve(root, 'src/content/posts');
const protectedRoot = resolve(root, 'src/content/protected');
const languages = new Set(['zh', 'ja', 'en']);
const directiveNames = new Set(['note', 'tip', 'important', 'warning', 'caution', 'github', 'video', 'music']);
const videoProviders = new Set(['youtube', 'bilibili', 'local']);
const allowedMetingOrigin = 'https://meting.spr-aachen.com';
const errors = [];

async function filesUnder(directory, extension) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path, extension));
    else if (extname(entry.name) === extension) files.push(path);
  }
  return files;
}

function attrs(source) {
  return Object.fromEntries([...source.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

function fail(file, message) {
  errors.push(`${relative(root, file)}: ${message}`);
}

for (const file of await filesUnder(postsRoot, '.md')) {
  const raw = await readFile(file, 'utf8');
  const { frontmatter, content } = parseFrontmatter(raw);
  const prose = content.replace(/```[\s\S]*?```/g, '');
  const required = ['title', 'slug', 'summary', 'publishedAt', 'lang', 'translationKey', 'category'];
  for (const field of required) if (!frontmatter[field]) fail(file, `missing ${field}`);
  if (!languages.has(frontmatter.lang)) fail(file, `unsupported language ${frontmatter.lang}`);
  if (!String(frontmatter.slug ?? '').startsWith(`${frontmatter.lang}/`)) fail(file, 'slug must use <lang>/<route-slug>');
  if (frontmatter.cover && !frontmatter.coverAlt) fail(file, 'coverAlt is required when cover is set');
  if ('password' in frontmatter) fail(file, 'password frontmatter is forbidden');
  if (/<iframe\b/i.test(prose)) fail(file, 'raw iframe is forbidden; use ::video');

  for (const match of prose.matchAll(/:{2,3}([a-z][\w-]*)(?:\{([^}]*)\})?/g)) {
    const [, name, rawAttributes = ''] = match;
    if (!directiveNames.has(name)) {
      fail(file, `unknown directive ::${name}`);
      continue;
    }
    const values = attrs(rawAttributes);
    if (name === 'github' && !/^[\w.-]+\/[\w.-]+$/.test(values.repo ?? '')) fail(file, '::github requires repo="owner/name"');
    if (name === 'video') {
      if (!videoProviders.has(values.provider)) fail(file, '::video provider must be youtube, bilibili, or local');
      if (values.provider === 'local' ? !values.src : !values.id) fail(file, '::video is missing id or src');
      if (!values.title) fail(file, '::video requires a readable title');
      if (values.provider === 'local' && !/^(\/|\.\.\/|\.\/)/.test(values.src ?? '')) fail(file, 'local ::video src must be a relative or root-relative URL');
      if (values.ratio && !/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(values.ratio)) fail(file, '::video ratio must look like 16/9');
    }
    if (name === 'music') {
      if (!values.meting && !values.audio) fail(file, '::music requires meting or audio');
      if (!values.title || !values.artist) fail(file, '::music requires title and artist');
      if (values.audio && !/^(\/|\.\.\/|\.\/)/.test(values.audio)) fail(file, '::music audio must be a relative or root-relative URL');
      for (const field of ['cover', 'lrc']) {
        if (values[field] && !/^(https:\/\/|\/|\.\.\/|\.\/)/.test(values[field])) fail(file, `::music ${field} must use HTTPS or a local URL`);
      }
      if (values.meting) {
        try {
          if (new URL(values.meting).origin !== allowedMetingOrigin) {
            fail(file, `::music meting URL must use ${allowedMetingOrigin}`);
          }
        } catch {
          fail(file, '::music meting must be a valid absolute URL');
        }
      }
    }
  }

  for (const image of prose.matchAll(/!\[([^\]]*)\]\([^)]+\)/g)) {
    if (!image[1].trim()) fail(file, 'Markdown images require descriptive alt text');
  }
}

for (const file of await filesUnder(protectedRoot, '.json')) {
  let data;
  try {
    data = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    fail(file, `invalid JSON: ${error.message}`);
    continue;
  }
  for (const forbidden of ['password', 'plaintext', 'html', 'body', 'content']) {
    if (forbidden in data) fail(file, `forbidden public field ${forbidden}`);
  }
  if (data.encryption?.iterations !== 600000) fail(file, 'PBKDF2 iterations must be 600000');
  if (data.encryption?.algorithm !== 'AES-256-GCM') fail(file, 'algorithm must be AES-256-GCM');
  if (!String(data.slug ?? '').startsWith(`${data.lang}/`)) fail(file, 'slug must use <lang>/<route-slug>');
}

if (errors.length) {
  console.error(errors.map((message) => `- ${message}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Content and custom directives are valid.');
}
