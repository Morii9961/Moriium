import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { publicOutputRoot } from './lib/public-output.mjs';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const oldProtectedTitle = ['A', 'Farewell', 'But', 'Not', 'the', 'Finale'].join('-');
const errors = [];

async function filesUnder(directory, extensions) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return files;
    throw error;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path, extensions));
    else if (!extensions || extensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

try {
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  for (const file of stdout.split('\0').filter(Boolean)) {
    if (file === '.private' || file.startsWith('.private/')) errors.push(`${file} must never be tracked`);
    if (file.includes(oldProtectedTitle)) errors.push(`${file} exposes the retired protected article`);
  }
} catch {
  console.warn('Git index is unavailable; auditing generated and content files only.');
}

const inspected = [
  ...await filesUnder(resolve(root, 'src/content'), new Set(['.md', '.json'])),
  ...await filesUnder(publicOutputRoot(root), new Set(['.html', '.xml', '.json', '.js'])),
];

for (const file of inspected) {
  const content = await readFile(file, 'utf8');
  const name = relative(root, file);
  if (content.includes(oldProtectedTitle)) errors.push(`${name} exposes the retired protected article`);
  if (content.includes('.private/posts')) errors.push(`${name} exposes a private source path`);
  if (extname(file) === '.md' && /^---[\s\S]*?^password\s*:/m.test(content)) {
    errors.push(`${name} contains forbidden password frontmatter`);
  }
}

if (errors.length) {
  console.error([...new Set(errors)].map((message) => `- ${message}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Public-tree audit found no private source paths, retired protected content, or password frontmatter.');
}
