import assert from 'node:assert/strict';
import { readdir, readFile, stat, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const html = await readFile(join(root, 'index.html'), 'utf8');
assert.match(html, /<title>Enouia<\/title>/);
assert.equal((html.match(/<h1\b/g) || []).length, 1);
assert.match(html, /type="range"/);
assert.match(html, /<noscript>/);
assert.doesNotMatch(html, /\/api\/|\/admin\/|iframe|https:\/\/fonts\./);
assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc=)[^>]*>/, 'Inline scripts violate the deployment CSP');
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
for (const [, link] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  if (link.startsWith('#')) assert.ok(ids.has(link.slice(1)), `Missing anchor: ${link}`);
  else if (!/^https?:/.test(link)) await access(join(root, link.replace(/^\//, '')));
}
for (const [, srcset] of html.matchAll(/srcset="([^"]+)"/g)) {
  for (const candidate of srcset.split(',')) await access(join(root, candidate.trim().split(/\s+/)[0]));
}
const list = async directory => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async entry => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? list(path) : [path];
}))).flat();
const files = await list(root);
assert.ok(!files.some(path => /[\\/]server[\\/]/.test(path)), 'Unexpected server output');
let total = 0;
let js = 0;
for (const file of files) {
  const size = (await stat(file)).size;
  total += size;
  if (file.endsWith('.js')) {
    js += size;
    assert.doesNotMatch(await readFile(file, 'utf8'), /tiptap|vue\.runtime|react-dom|fetch\(/);
  }
}
assert.ok(js < 12_000, `JavaScript exceeds 12 KB: ${js}`);
assert.ok(total < 450_000, `Static output exceeds 450 KB: ${total}`);
console.log(`Verified one static page, local assets and anchors; ${files.length} files, ${total} bytes total, ${js} bytes JavaScript.`);
