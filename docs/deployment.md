# Deploy and roll back

The workflow in `.github/workflows/ci.yml` deploys only from `main` and only when the repository variable `DEPLOY_ENABLED` equals `true`. Pull requests and ordinary pushes always run verification first.

## GitHub configuration

Create these Actions secrets:

- `VPS_HOST`: SSH hostname or address.
- `VPS_USER`: unprivileged deployment user.
- `VPS_SSH_KEY`: its private Ed25519 key.
- `VPS_KNOWN_HOSTS`: a pinned `known_hosts` line collected through a trusted channel. The workflow deliberately does not use unauthenticated `ssh-keyscan`.
- `VPS_RELEASE_ROOT`: normally `/var/www/moriium`.

Create the Actions variable `DEPLOY_ENABLED=true` only after the VPS directories, permissions, Nginx config, TLS certificate, and rollback procedure are ready.

## VPS layout

```text
/var/www/moriium/
├── current -> releases/<commit-sha>
└── releases/
    ├── <older-sha>/
    └── <current-sha>/
```

The deployment user needs write access only to this tree. Nginx needs read and traverse access. It does not need Node.js or repository access.

Install `deploy/nginx/moriium.conf` as the site configuration and `deploy/nginx/moriium-legacy-redirects.map` as `/etc/nginx/snippets/moriium-legacy-redirects.map`. Add the real certificate directives, then run `nginx -t` before reload.

## Release sequence

1. CI verifies and builds static output.
2. It uploads one tar archive named with the commit SHA.
3. The VPS extracts to a new immutable release directory.
4. Staged checks require all language home pages, the sitemap, a title, and no empty HTML files.
5. A new symlink is moved over `current` atomically.
6. A local Nginx request checks `/zh/`. Failure restores the previous link.
7. The six newest release directories are retained.

## Manual rollback

List releases and point a temporary link at the chosen SHA, then replace `current` atomically:

```sh
cd /var/www/moriium
ls -lt releases
ln -s /var/www/moriium/releases/<known-good-sha> current.rollback
mv -Tf current.rollback current
curl --fail --resolve 'morii9961.top:443:127.0.0.1' 'https://morii9961.top/zh/'
```

Do not edit a release in place. Build a new commit for forward fixes.
