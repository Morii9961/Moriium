import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { publicOutputRoot } from './lib/public-output.mjs';

const root = resolve(import.meta.dirname, '..');
// Only the reader-facing half. See scripts/lib/public-output.mjs.
const dist = publicOutputRoot(root);
const errors = [];

async function htmlFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await htmlFiles(path));
    else if (entry.name.endsWith('.html')) result.push(path);
  }
  return result;
}

function targetFor(sourceFile, reference) {
  const clean = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
  const absolute = clean.startsWith('/') ? resolve(dist, `.${clean}`) : resolve(dirname(sourceFile), clean);
  const pathFromDist = absolute.slice(dist.length);
  if (!pathFromDist || (!pathFromDist.startsWith('\\') && !pathFromDist.startsWith('/'))) {
    throw new Error('reference escapes dist');
  }
  if (extname(absolute)) return absolute;
  return resolve(absolute, 'index.html');
}

for (const file of await htmlFiles(dist)) {
  const html = await readFile(file, 'utf8');
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const reference = match[1];
    if (!reference || /^(?:https?:|mailto:|tel:|data:|#)/.test(reference)) continue;
    try {
      const target = targetFor(file, reference);
      await access(target);
    } catch {
      errors.push(`${file}: missing or unsafe ${reference}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Built-site local links resolve.');
}
