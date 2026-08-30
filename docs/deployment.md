# Deploy, operate, and recover Moriium

This runbook describes the Phase 6A production layout. The files in `deploy/`
are versioned deployment inputs; their presence is not evidence that the VPS is
configured or that a production drill has passed.

The public site and the author service have deliberately different failure
domains:

- Nginx serves every public route from the immutable directory selected by
  `/var/www/moriium/current`.
- Nginx proxies only `/admin/` and `/api/` to the loopback Node service.
- Stopping Node must leave the public site available.

Astro's standalone Node adapter starts `dist/server/entry.mjs`, accepts `HOST`
and `PORT` at runtime, and keeps client assets in `dist/client/`; these are the
upstream contracts used here ([Astro Node adapter documentation](https://docs.astro.build/en/guides/integrations-guide/node/#standalone)).

## GitHub configuration

The workflow in `.github/workflows/ci.yml` deploys only from `main` and only
when the repository variable `DEPLOY_ENABLED` equals `true`. Pull requests and
ordinary pushes always run verification first.

Create these Actions secrets:

- `VPS_HOST`: SSH hostname or address.
- `VPS_USER`: the unprivileged `moriium` deployment user.
- `VPS_SSH_KEY`: its private Ed25519 key.
- `VPS_KNOWN_HOSTS`: a pinned `known_hosts` line collected through a trusted
  channel. The workflow deliberately does not use unauthenticated
  `ssh-keyscan`.
- `VPS_RELEASE_ROOT`: `/var/www/moriium`.

Do not create `DEPLOY_ENABLED=true` until the bootstrap, configuration tests,
static-with-Node-stopped check, and rollback rehearsal below have succeeded.

## Filesystem layout

```text
/var/www/moriium/                 code and disposable build output
├── current -> releases/<id>      public static root
├── releases/<id>/                immutable dist/client copies; keep 6
├── workspace/                    source, node_modules, dist/server
└── release.lock                  serializes code and content releases

/var/lib/moriium/                 persistent data; never inside a release
├── admin.db                      SQLite, with transient -wal and -shm files
├── sessions/                     server-side sessions
├── media/                        sanitized public derivatives only
├── content/                      exported Markdown build input
└── backups/                      hourly validated local database backups
```

The resident Node process runs the server build from `workspace`; `current`
contains only `dist/client`. That is why one retained release does not need its
own copy of `node_modules`, and why Nginx can keep serving readers while Node is
stopped.

## Bootstrap the VPS

The command names below assume a systemd-based Debian or Ubuntu host. Confirm
the actual binary paths before installing the sudoers rule.

Install Node 24, pnpm 11.22, Nginx, fail2ban, curl, tar, and `flock` from
`util-linux`. Then create the unprivileged account and directories:

```sh
sudo useradd --system --create-home --shell /bin/bash moriium
sudo install -d -o moriium -g moriium -m 0750 /var/www/moriium
sudo install -d -o moriium -g moriium -m 0700 \
  /var/lib/moriium \
  /var/lib/moriium/sessions \
  /var/lib/moriium/media \
  /var/lib/moriium/content \
  /var/lib/moriium/backups
sudo install -d -o root -g moriium -m 0750 /etc/moriium
```

Create `/etc/moriium/admin.env` as root, owned by `root:moriium` with mode
`0640`:

```dotenv
MORIIUM_DATABASE_PATH=/var/lib/moriium/admin.db
MORIIUM_SESSION_DIRECTORY=/var/lib/moriium/sessions
MORIIUM_MEDIA_ROOT=/var/lib/moriium/media
MORIIUM_CONTENT_ROOT=/var/lib/moriium/content
MORIIUM_BACKUP_ROOT=/var/lib/moriium/backups
MORIIUM_RELEASE_ROOT=/var/www/moriium
MORIIUM_PROBE_URL=https://morii9961.top/zh/
```

Do not put author plaintext passwords in this file. Create accounts with the
server-side `pnpm account:create` command after the first source deployment.

Install the service unit:

```sh
sudo install -m 0644 deploy/systemd/moriium-admin.service \
  /etc/systemd/system/moriium-admin.service
sudo systemd-analyze verify /etc/systemd/system/moriium-admin.service
sudo systemctl daemon-reload
sudo systemctl enable moriium-admin.service
```

The unit uses `Restart=on-failure`, an unprivileged user, a read-only code tree,
and a single writable data tree. See the upstream definitions of
[`Restart=`](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html#Restart=)
and the execution sandbox options
([systemd.exec](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)).

The deployment driver needs permission to stop and start this one unit. Use
the path returned by `command -v systemctl`, and grant no broader sudo rule:

```sudoers
moriium ALL=(root) NOPASSWD: /usr/bin/systemctl stop moriium-admin.service, /usr/bin/systemctl start moriium-admin.service
```

Validate the sudo rule from the deployment account:

```sh
sudo -n systemctl stop moriium-admin.service
sudo -n systemctl start moriium-admin.service
```

The start is expected to fail before the first successful build because
`workspace/dist/server/entry.mjs` does not exist yet.

## Install Nginx and fail2ban configuration

Install the versioned files, add the real TLS certificate directives, and test
before reloading:

```sh
sudo install -m 0644 deploy/nginx/moriium-legacy-redirects.map \
  /etc/nginx/snippets/moriium-legacy-redirects.map
sudo install -m 0644 deploy/nginx/moriium.conf \
  /etc/nginx/sites-available/moriium.conf
sudo ln -s /etc/nginx/sites-available/moriium.conf \
  /etc/nginx/sites-enabled/moriium.conf
sudo nginx -t
sudo systemctl reload nginx
```

The two `proxy_pass` locations preserve the original request URI and forward
the original host and client address, following Nginx's
[`proxy_pass`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)
and
[`proxy_set_header`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header)
contracts. The upstream binds only to `127.0.0.1:4321`; do not open that port in
the firewall.

Install the fail2ban filter and jail:

```sh
sudo install -m 0644 deploy/fail2ban/filter.d/moriium-admin.conf \
  /etc/fail2ban/filter.d/moriium-admin.conf
sudo install -m 0644 deploy/fail2ban/jail.d/moriium-admin.local \
  /etc/fail2ban/jail.d/moriium-admin.local
sudo fail2ban-client -t
sudo systemctl reload fail2ban
sudo fail2ban-client status moriium-admin
```

After producing controlled 401 and 429 login responses, verify the real log:

```sh
sudo fail2ban-regex \
  /var/log/nginx/morii9961.top.access.log \
  /etc/fail2ban/filter.d/moriium-admin.conf
```

Fail2ban recommends custom settings in `.local` files and defines a jail as the
combination of a filter and an action
([Fail2ban `jail.conf` manual](https://github.com/fail2ban/fail2ban/blob/master/man/jail.conf.5)).
The committed threshold is a launch value, not a permanent truth: inspect real
logs and adjust it between the application's five-per-account and
twenty-global failure boundaries. To undo a self-ban:

```sh
sudo fail2ban-client set moriium-admin unbanip <ip>
```

That command is the jail-specific unban operation documented by
[`fail2ban-client`](https://github.com/fail2ban/fail2ban/blob/master/man/fail2ban-client.1).

## Code release sequence

CI verifies the repository build first, but it uploads source rather than that
build. Production content exists only in the VPS database, so the authoritative
build must run beside the database:

1. `git archive` packages the verified commit.
2. CI uploads the archive and `deploy/bin/deploy-code.sh`.
3. The VPS driver acquires `release.lock` and stages a new workspace.
4. It stops the author service before replacing any server files.
5. If the lockfile is unchanged, it reuses the existing `node_modules`;
   otherwise `pnpm site:release` installs from the frozen lockfile.
6. The release state machine exports published database content, builds, runs
   the public checks, copies `dist/client` to an immutable release, switches
   `current`, probes `/zh/`, records `live_version_id`, and retains six.
7. The driver starts the author service and probes `/admin/`.

Any failure before the static switch restores the previous workspace and starts
the previous author service. If the author service fails after a successful
static switch, the workflow fails plainly but does not roll back the healthy
public site. This is the L1 failure boundary, not a silent success.

Content publishing currently sets `published_version_id` and shows
“awaiting export” in Admin. Until a separately reviewed Admin release trigger
exists, an operator runs the same serialized release manually:

```sh
flock -n /var/www/moriium/release.lock \
  pnpm --dir /var/www/moriium/workspace site:release \
  --url https://morii9961.top/zh/
```

Never run the command without the lock while a code deployment may be active.

## Acceptance checks before enabling deployment

Run these on the VPS and retain the command output with the release record:

```sh
node --version
pnpm --version
sudo nginx -t
sudo fail2ban-client -t
sudo systemd-analyze verify /etc/systemd/system/moriium-admin.service
sudo systemctl status moriium-admin.service
curl --fail https://morii9961.top/zh/
curl --fail https://morii9961.top/admin/
```

Then prove the public failure boundary instead of inferring it:

```sh
sudo systemctl stop moriium-admin.service
curl --fail https://morii9961.top/zh/
curl --fail https://morii9961.top/en/
curl --fail https://morii9961.top/ja/
sudo systemctl start moriium-admin.service
curl --fail https://morii9961.top/admin/
```

Only after these pass should `DEPLOY_ENABLED=true` be created.

## Static rollback

List releases, choose a known-good directory, and replace the link atomically:

```sh
cd /var/www/moriium
ls -lt releases
ln -s /var/www/moriium/releases/<known-good-id> current.rollback
mv -Tf current.rollback current
curl --fail --resolve 'morii9961.top:443:127.0.0.1' \
  'https://morii9961.top/zh/'
```

Do not edit a release in place. This rolls back public static output only; it
does not rewrite the database or the server workspace.

## Database recovery drill and L3 restore

First validate a copied backup without touching production. The drill creates a
new isolated database, proves a corrupt sample is rejected, performs a write,
closes, and reopens it:

```sh
pnpm --dir /var/www/moriium/workspace exec node \
  scripts/drill-database-restore.mjs \
  --backup /path/to/copied-offsite/admin-<timestamp>.db
```

For an actual L3 restore, record the start time, stop the service, and move the
existing database and any sidecars into a timestamped recovery directory. Do
not delete them:

```sh
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
recovery="/var/lib/moriium/recovery-${stamp}"
sudo systemctl stop moriium-admin.service
install -d -o moriium -g moriium -m 0700 "$recovery"
for file in admin.db admin.db-wal admin.db-shm; do
  if [ -e "/var/lib/moriium/$file" ]; then
    mv "/var/lib/moriium/$file" "$recovery/$file"
  fi
done
install -o moriium -g moriium -m 0600 \
  /path/to/validated/admin-<timestamp>.db \
  /var/lib/moriium/admin.db
sudo systemctl start moriium-admin.service
flock -n /var/www/moriium/release.lock \
  pnpm --dir /var/www/moriium/workspace site:release \
  --url https://morii9961.top/zh/
```

Verify one read and one durable write through Admin, reopen the article, and
record the elapsed time from the first stop command. The RTO target is 30
minutes; it is not proven until this complete VPS exercise uses an actual
off-site copy.

## Off-site copies and routine inspection

The application creates and validates hourly local SQLite backups and retains
48. A separate host or storage account is still required for the ADR's daily
30-day database copy and daily sanitized-media copy. Do not point a generic
backup tool at the live `admin.db`; transfer only completed files from
`/var/lib/moriium/backups/` and the sanitized `/var/lib/moriium/media/` tree.

The remote destination, credentials, retention mechanism, and first real RTO
drill cannot be filled in from repository code. Record them here only after
Morii selects and provisions that destination.

With no alerting service, inspect these manually:

```sh
sudo systemctl status moriium-admin.service
sudo journalctl -u moriium-admin.service --since today
sudo fail2ban-client status moriium-admin
find /var/lib/moriium/backups -maxdepth 1 -type f -printf '%TY-%Tm-%Td %TH:%TM %p\n' | sort
df -h /var/www/moriium /var/lib/moriium
```
