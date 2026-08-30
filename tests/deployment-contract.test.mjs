import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('the production deployment contract', () => {
  it('keeps public files static and proxies only the author surface', () => {
    const nginx = read('deploy/nginx/moriium.conf');

    assert.match(nginx, /root \/var\/www\/moriium\/current;/);
    assert.match(nginx, /location \^~ \/admin\//);
    assert.match(nginx, /location \^~ \/api\//);
    assert.equal((nginx.match(/proxy_pass http:\/\/moriium_admin;/g) ?? []).length, 2);
    assert.match(nginx, /server 127\.0\.0\.1:4321;/);
    assert.match(nginx, /access_log \/var\/log\/nginx\/morii9961\.top\.access\.log combined;/);
    assert.match(nginx, /location \/ \{\s+try_files \$uri \$uri\/ \$uri\/index\.html =404;/);
  });

  it('runs one unprivileged loopback service with data outside releases', () => {
    const service = read('deploy/systemd/moriium-admin.service');

    assert.match(service, /^User=moriium$/m);
    assert.match(service, /^WorkingDirectory=\/var\/www\/moriium\/current$/m);
    assert.match(service, /HOST=127\.0\.0\.1 PORT=4321/);
    assert.match(service, /\/var\/www\/moriium\/workspace\/dist\/server\/entry\.mjs/);
    assert.match(service, /^Restart=on-failure$/m);
    assert.match(service, /^ProtectSystem=strict$/m);
    assert.match(service, /^ReadOnlyPaths=\/var\/www\/moriium$/m);
    assert.match(service, /^ReadWritePaths=\/var\/lib\/moriium$/m);
  });

  it('matches only failed login POSTs for fail2ban', () => {
    const filter = read('deploy/fail2ban/filter.d/moriium-admin.conf');
    const jail = read('deploy/fail2ban/jail.d/moriium-admin.local');
    const source = filter.match(/^failregex = (.+)$/m)?.[1];
    assert.ok(source);

    const regex = new RegExp(source.replace('<HOST>', String.raw`(?:\d{1,3}\.){3}\d{1,3}`));
    const prefix = '203.0.113.24 - - [30/Aug/2026:15:01:22 +0800] ';
    assert.equal(regex.test(`${prefix}"POST /api/login/ HTTP/2.0" 401 91 "-" "agent"`), true);
    assert.equal(regex.test(`${prefix}"POST /api/login HTTP/1.1" 429 91 "-" "agent"`), true);
    assert.equal(regex.test(`${prefix}"POST /api/articles/1/ HTTP/2.0" 401 91 "-" "agent"`), false);
    assert.equal(regex.test(`${prefix}"GET /api/login/ HTTP/2.0" 401 91 "-" "agent"`), false);
    assert.equal(regex.test(`${prefix}"POST /api/login/ HTTP/2.0" 200 91 "-" "agent"`), false);
    assert.match(jail, /^maxretry = 10$/m);
    assert.match(jail, /^findtime = 15m$/m);
  });

  it('sends source to the VPS and serializes every release there', () => {
    const workflow = read('.github/workflows/ci.yml');
    const driver = read('deploy/bin/deploy-code.sh');

    assert.match(workflow, /git archive --format=tar\.gz/);
    assert.doesNotMatch(workflow, /tar -czf .* -C dist\/client/);
    assert.match(workflow, /deploy\/bin\/deploy-code\.sh/);
    assert.match(driver, /flock -n 9/);
    assert.match(driver, /readlink -f "\$root\/current"/);
    assert.match(driver, /systemctl stop "\$service"/);
    assert.match(driver, /pnpm --dir "\$workspace" site:release/);
    assert.match(driver, /systemctl start "\$service"/);
    assert.match(driver, /curl --fail --silent --show-error --max-time 12 "\$admin_probe"/);
    assert.match(driver, /\/var\/www\/\*/);
  });

  it('documents manual unban, static rollback, and database recovery', () => {
    const guide = read('docs/deployment.md');

    assert.match(guide, /fail2ban-client set moriium-admin unbanip <ip>/);
    assert.match(guide, /mv -Tf current\.rollback current/);
    assert.match(guide, /drill-database-restore\.mjs/);
    assert.match(guide, /systemctl stop moriium-admin/);
  });
});
