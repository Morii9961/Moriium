import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { encryptHtml } from './lib/crypto.mjs';
import { renderPrivateMarkdown } from './lib/render-markdown.mjs';

const root = resolve(import.meta.dirname, '..');
const privateRoot = resolve(root, '.private/posts');
const publicRoot = resolve(root, 'src/content/protected');

function inside(parent, child) {
  const path = relative(parent, child);
  return path && !path.startsWith('..') && !isAbsolute(path);
}

async function hiddenPrompt(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error('Encryption requires an interactive TTY so the password can remain hidden.');
  }
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  let value = '';
  return await new Promise((resolvePrompt, reject) => {
    const onData = (character) => {
      if (character === '\u0003') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        reject(new Error('Cancelled.'));
      } else if (character === '\r' || character === '\n') {
        process.stdin.off('data', onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write('\n');
        resolvePrompt(value);
      } else if (character === '\u007f' || character === '\b') {
        value = value.slice(0, -1);
      } else if (character >= ' ') {
        value += character;
      }
    };
    process.stdin.on('data', onData);
  });
}

function featuresOf(markdown) {
  return {
    lightbox: /!\[[^\]]*\]\([^)]+\)/.test(markdown),
    mermaid: /```mermaid\s/.test(markdown),
    music: /::music\{/.test(markdown),
    video: /::video\{/.test(markdown),
    math: /(^|[^\\])\$\$?[\s\S]*?\$\$?/.test(markdown),
  };
}

function publicMetadata(frontmatter) {
  if ('password' in frontmatter) throw new Error('Password frontmatter is forbidden. Passwords are entered only at the hidden prompt.');
  const required = ['title', 'slug', 'summary', 'publishedAt', 'lang', 'translationKey', 'category'];
  for (const field of required) {
    if (!frontmatter[field]) throw new Error(`Missing required frontmatter field: ${field}`);
  }
  if (!String(frontmatter.slug).startsWith(`${frontmatter.lang}/`)) {
    throw new Error('slug must begin with the article language and a slash.');
  }
  return {
    title: String(frontmatter.title),
    slug: String(frontmatter.slug),
    summary: String(frontmatter.summary),
    publishedAt: frontmatter.publishedAt,
    ...(frontmatter.updatedAt ? { updatedAt: frontmatter.updatedAt } : {}),
    lang: String(frontmatter.lang),
    translationKey: String(frontmatter.translationKey),
    category: String(frontmatter.category),
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.map(String) : [],
    draft: Boolean(frontmatter.draft),
    unlisted: Boolean(frontmatter.unlisted),
    listed: Boolean(frontmatter.listed),
  };
}

const sourceArg = process.argv[2];
if (!sourceArg) {
  console.error('Usage: pnpm encrypt -- .private/posts/<article>.md [src/content/protected/<article>.json]');
  process.exitCode = 1;
} else {
  const sourcePath = resolve(root, sourceArg);
  const defaultName = `${basename(sourcePath, '.md')}.json`;
  const outputPath = resolve(root, process.argv[3] ?? `src/content/protected/${defaultName}`);
  if (!inside(privateRoot, sourcePath)) throw new Error('Plaintext source must be inside .private/posts/.');
  if (!inside(publicRoot, outputPath)) throw new Error('Ciphertext output must be inside src/content/protected/.');

  const raw = await readFile(sourcePath, 'utf8');
  const { frontmatter, content } = parseFrontmatter(raw);
  const password = await hiddenPrompt('Password: ');
  const confirmation = await hiddenPrompt('Confirm password: ');
  if (password !== confirmation) throw new Error('Passwords do not match.');

  const rendered = await renderPrivateMarkdown(content);
  const encryption = await encryptHtml(rendered, password);
  const output = {
    ...publicMetadata(frontmatter),
    features: featuresOf(content),
    encryption,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(output, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(tempPath, outputPath);
  console.log(`Encrypted article written to ${relative(root, outputPath)}.`);
  console.log(`Feature markers: ${Object.entries(output.features).filter(([, enabled]) => enabled).map(([name]) => name).join(', ') || 'none'}.`);
}
