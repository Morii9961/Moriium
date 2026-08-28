import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const postRoot = resolve(root, 'src/content/posts');
const outputPath = resolve(root, '.cache/github.json');

async function markdownFiles(directory) {
  const { readdir } = await import('node:fs/promises');
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await markdownFiles(path));
    else if (entry.name.endsWith('.md')) results.push(path);
  }
  return results;
}

const repositories = new Set();
for (const file of await markdownFiles(postRoot)) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/::github\{[^}]*repo="([\w.-]+\/[\w.-]+)"[^}]*\}/g)) repositories.add(match[1]);
}

let cache = {};
try { cache = JSON.parse(await readFile(outputPath, 'utf8')); } catch {}

if (process.env.GITHUB_CACHE_FRESH === 'true') {
  console.log(`GitHub cache: restored a fresh daily cache with ${Object.keys(cache).length} entr${Object.keys(cache).length === 1 ? 'y' : 'ies'}.`);
} else if (!process.env.GITHUB_TOKEN) {
  console.log(`GitHub cache: no token; using ${Object.keys(cache).length} cached entr${Object.keys(cache).length === 1 ? 'y' : 'ies'} and link fallbacks.`);
} else {
  const queue = [...repositories];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const repo = queue.shift();
      try {
        const response = await fetch(`https://api.github.com/repos/${repo}`, {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Moriium-static-build',
          },
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        cache[repo.toLowerCase()] = {
          description: data.description,
          language: data.language,
          stargazers_count: data.stargazers_count,
          forks_count: data.forks_count,
          updated_at: data.updated_at,
        };
      } catch (error) {
        console.warn(`GitHub cache fallback for ${repo}: ${error.message}`);
      }
    }
  });
  await Promise.all(workers);
  await mkdir(resolve(root, '.cache'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  console.log(`GitHub cache: ${Object.keys(cache).length} entries.`);
}
