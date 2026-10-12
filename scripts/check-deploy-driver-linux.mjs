// Exercises the actual Bash driver with synthetic commands; no systemctl or network calls.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readlinkSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.argv[2];
if (process.platform !== 'linux' || !/^\/var\/www\/moriium-driver-acceptance-[A-Za-z0-9-]+$/.test(root ?? '') || resolve(root) !== root) {
  throw new Error('Use a newly created owned /var/www/moriium-driver-acceptance-* fixture directory.');
}
const sha = 'a'.repeat(40);
const marker = join(root, '.owned-driver-fixture');
if (readdirSync(root).length && !existsSync(marker)) throw new Error('Refusing to reuse a directory not owned by this fixture.');
writeFileSync(marker, 'Synthetic deployment-driver fixture only.\n');
const driver = resolve(import.meta.dirname, '../deploy/bin/deploy-code.sh');
const source = { 'package.json': '{"name":"synthetic","version":"1.0.0"}\n', 'pnpm-lock.yaml': 'synthetic-lock\n',
  'scripts/release-site.mjs': '// Synthetic command, intercepted by fixture pnpm.\n', 'source-version': 'candidate\n' };
const put = (file, contents, mode) => { mkdirSync(resolve(file, '..'), { recursive: true }); writeFileSync(file, contents, mode ? { mode } : undefined); };

function prepare(mode) {
  for (const entry of readdirSync(root)) if (entry !== '.owned-driver-fixture') {
    const path = join(root, entry);
    if (!path.startsWith(`${root}/`)) throw new Error('Fixture cleanup escaped its root.');
    rmSync(path, { recursive: true, force: true });
  }
  for (const [name, contents] of Object.entries(source)) put(join(root, 'input', name), contents);
  put(join(root, 'workspace/package.json'), source['package.json']);
  put(join(root, 'workspace/pnpm-lock.yaml'), source['pnpm-lock.yaml']);
  put(join(root, 'workspace/source-version'), 'previous\n');
  put(join(root, 'workspace/node_modules/.astro/cache'), 'retained cache\n');
  mkdirSync(join(root, 'releases/previous'), { recursive: true });
  symlinkSync(join(root, 'releases/previous'), join(root, 'current'));
  put(join(root, 'shims/sudo'), `#!/usr/bin/env bash\nset -eu\n[[ "$1" == '-n' && "$2" == 'systemctl' && "$4" == 'moriium-admin.service' ]]\nprintf '%s\\n' "$3" >> "$MORIIUM_FIXTURE_ROOT/service.log"\n`, 0o755);
  put(join(root, 'shims/curl'), '#!/usr/bin/env bash\nexit 0\n', 0o755);
  put(join(root, 'shims/pnpm'), `#!/usr/bin/env bash\nset -eu\nif [[ "$1" == '--version' ]]; then printf '11.22.0\\n'; exit 0; fi\n[[ "$1" == '--dir' && "$3" == 'site:release' ]]\nfixture_root="$MORIIUM_FIXTURE_ROOT"\ncase "$MORIIUM_FIXTURE_MODE" in\n  build-failure) exit 42 ;;\n  interrupted) touch "$fixture_root/building"; sleep 30; exit 43 ;;\nesac\nmkdir -p "$fixture_root/releases/${sha}"\nln -s "$fixture_root/releases/${sha}" "$fixture_root/current.next"\nmv -Tf "$fixture_root/current.next" "$fixture_root/current"\nif [[ "$MORIIUM_FIXTURE_MODE" == 'switch-failure' ]]; then exit 44; fi\nprintf '${sha}\\n' > "$fixture_root/.release-ready"\nif [[ "$MORIIUM_FIXTURE_MODE" == 'after-ready-failure' ]]; then exit 45; fi\n`, 0o755);
  const archive = join(root, 'source.tar.gz');
  const packed = spawnSync('tar', ['-czf', archive, '-C', join(root, 'input'), '.']);
  if (packed.status !== 0) throw new Error('Synthetic source packaging failed.');
  return { ...process.env, PATH: `${root}/shims:${process.env.PATH}`, MORIIUM_FIXTURE_ROOT: root,
    MORIIUM_FIXTURE_MODE: mode, MORIIUM_DEPLOY_ARCHIVE: archive };
}

for (const mode of ['build-failure', 'switch-failure', 'success', 'after-ready-failure', 'interrupted']) {
  const env = prepare(mode);
  let status;
  if (mode === 'interrupted') {
    const child = spawn('bash', [driver, sha, root, 'https://example.invalid/zh/', 'https://example.invalid/admin/'], { env, detached: true, stdio: 'ignore' });
    const end = Date.now() + 10_000;
    while (!existsSync(join(root, 'building')) && Date.now() < end) await new Promise((done) => setTimeout(done, 50));
    const exited = new Promise((done) => child.once('exit', (code) => done(code)));
    process.kill(-child.pid, 'SIGTERM');
    status = await exited;
  } else {
    const result = spawnSync('bash', [driver, sha, root, 'https://example.invalid/zh/', 'https://example.invalid/admin/'], { env, encoding: 'utf8', timeout: 15_000 });
    if (result.error) throw result.error;
    status = result.status;
  }
  const kept = ['success', 'after-ready-failure'].includes(mode);
  assert.equal(readlinkSync(join(root, 'current')), join(root, 'releases', kept ? sha : 'previous'), mode);
  assert.equal(readFileSync(join(root, 'workspace/source-version'), 'utf8'), kept ? 'candidate\n' : 'previous\n', mode);
  assert.equal(readFileSync(join(root, 'workspace/node_modules/.astro/cache'), 'utf8'), 'retained cache\n', mode);
  assert.equal(status === 0, mode === 'success', mode);
  assert.ok(readFileSync(join(root, 'service.log'), 'utf8').endsWith('start\n'), mode);
  console.log(`Driver fixture passed: ${mode}; public selection, workspace, dependency cache and restart ordering verified.`);
}
