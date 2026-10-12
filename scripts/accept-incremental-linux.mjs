// Isolated VPS acceptance only. Never start or stop a systemd/production service.
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
if (process.platform !== 'linux' || !/^\/tmp\/moriium-incremental-acceptance-[a-zA-Z0-9-]+$/.test(root)) {
  throw new Error('Run this acceptance script only in an owned /tmp/moriium-incremental-acceptance-* source copy on Linux.');
}
Object.assign(process.env, { MORIIUM_DATABASE_PATH: join(root, 'isolated.db'), MORIIUM_SESSION_DIRECTORY: join(root, 'isolated-sessions'),
  MORIIUM_MEDIA_ROOT: join(root, 'isolated-media'), MORIIUM_CONTENT_ROOT: join(root, 'isolated-content'), ASTRO_TELEMETRY_DISABLED: '1' });

const run = (args) => {
  const result = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: 'utf8', timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
  process.stdout.write(result.stdout ?? '');
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
};
run(['--test', 'tests/incremental-deployment.test.mjs', 'tests/admin-release.test.mjs', 'tests/deployment-contract.test.mjs']);
run(['scripts/check-incremental-build.mjs', process.argv[2] ?? '20']);
// Mutate only this owned source copy, then compare every affected aggregate and page.
const htmlSnapshot = (directory, prefix = '') => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const file = join(directory, entry.name), name = prefix + entry.name;
  if (entry.isDirectory()) return htmlSnapshot(file, `${name}/`);
  return [[name, createHash('sha256').update(readFileSync(file)).digest('hex')]];
}).sort(([a], [b]) => a.localeCompare(b, 'en'));
const posts = join(root, 'src/content/posts/zh');
const article = readdirSync(posts).find((name) => name.endsWith('.md') && !name.startsWith('_'));
if (!article) throw new Error('No owned public article fixture exists in the source copy.');
const file = join(posts, article), original = readFileSync(file, 'utf8');
const { frontmatter } = parseFrontmatter(original);
const page = join(root, 'dist/client/zh/posts', String(frontmatter.slug).replace(/^zh\//, ''), 'index.html');
const extra = join(posts, 'incremental-acceptance.md');
if (existsSync(extra)) throw new Error('The acceptance fixture filename is occupied.');
const compare = (label, assertOutput) => {
  const start = Date.now();
  const incremental = spawnSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build'], { cwd: root, env: process.env, encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
  if (incremental.status !== 0) throw new Error(incremental.stderr || incremental.stdout);
  const actual = htmlSnapshot(join(root, 'dist/client'));
  assertOutput();
  const seconds = (Date.now() - start) / 1000;
  const clean = spawnSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--force'], { cwd: root, env: process.env, encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
  if (clean.status !== 0) throw new Error(clean.stderr || clean.stdout);
  if (JSON.stringify(actual) !== JSON.stringify(htmlSnapshot(join(root, 'dist/client')))) throw new Error(`Incremental correctness failed: ${label}`);
  console.log(`Content scenario ${label}: ${seconds.toFixed(2)}s; complete static output equals a clean build.`);
};
try {
  writeFileSync(file, `${original}\n\nSynthetic incremental acceptance paragraph.\n`);
  compare('body edit', () => { if (!readFileSync(page, 'utf8').includes('Synthetic incremental acceptance paragraph.')) throw new Error('The edited body was cached incorrectly.'); });
  writeFileSync(file, original.replace(/^title:.*$/m, 'title: Synthetic acceptance title'));
  compare('title and translation metadata', () => { if (!readFileSync(page, 'utf8').includes('Synthetic acceptance title')) throw new Error('The edited title was cached incorrectly.'); });
  writeFileSync(file, original);
  const newPost = original.replace(/^slug:.*$/m, 'slug: zh/incremental-acceptance').replace(/^translationKey:.*$/m, 'translationKey: incremental-acceptance');
  writeFileSync(extra, newPost);
  compare('article addition and adjacent links', () => { if (!existsSync(join(root, 'dist/client/zh/posts/incremental-acceptance/index.html'))) throw new Error('The new article is missing.'); });
  unlinkSync(extra);
  unlinkSync(file);
  compare('article removal and translation availability', () => { if (existsSync(page)) throw new Error('The removed article remains in output.'); });
} finally {
  writeFileSync(file, original);
  if (existsSync(extra)) unlinkSync(extra);
}
// Restore the owned baseline before public/Admin isolation checks.
const restored = spawnSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--force'], { cwd: root, env: process.env, encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
if (restored.status !== 0) throw new Error(restored.stderr || restored.stdout);
run(['scripts/check-links.mjs']);
run(['scripts/audit-public-tree.mjs']);
run(['scripts/check-render-split.mjs']);

const port = async () => {
  const server = createServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const value = server.address().port;
  await new Promise((done) => server.close(done));
  return value;
};
const waitFor = async (url) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(2_000) }); if (response.ok) return; } catch { /* Startup retry. */ }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error('An isolated acceptance listener did not become ready.');
};
const stop = async (child) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((done) => { child.once('exit', done); child.kill('SIGTERM'); });
};
const nodePort = await port(), nginxPort = await port();
chmodSync(root, 0o755);
const config = join(root, 'isolated-nginx.conf');
writeFileSync(config, `pid ${root}/isolated-nginx.pid;\nerror_log ${root}/isolated-nginx.log;\nevents { worker_connections 64; }\nhttp { access_log off; server { listen 127.0.0.1:${nginxPort}; root ${root}/dist/client; location / { try_files $uri $uri/ $uri/index.html =404; } } }\n`);
const nginx = spawn('nginx', ['-c', config, '-p', root, '-g', 'daemon off;'], { stdio: 'ignore' });
const admin = spawn(process.execPath, ['dist/server/entry.mjs'], { cwd: root, env: { ...process.env, HOST: '127.0.0.1', PORT: String(nodePort) }, stdio: 'ignore' });
try {
  await waitFor(`http://127.0.0.1:${nginxPort}/zh/`);
  await waitFor(`http://127.0.0.1:${nodePort}/admin/`);
  await stop(admin);
  for (const lang of ['zh', 'ja', 'en']) for (const path of [`/${lang}/`, `/${lang}/about/`, `/${lang}/rss.xml`, `/search/${lang}.json`]) {
    const response = await fetch(`http://127.0.0.1:${nginxPort}${path}`);
    if (!response.ok) throw new Error(`Static route failed with Node stopped: ${path}`);
  }
  console.log('Isolated acceptance: Node was stopped; 12 public routes still returned 200 through independent Nginx.');
} finally {
  await stop(admin);
  await stop(nginx);
}
