# Moriium

Moriium is Morii's lightweight, multilingual personal blog. It is rebuilt from a blank Astro project: Twilight informs content compatibility, but none of its UI, CSS, component system, palette, wallpaper, or animation layer is reused.

The deployed site is a directory of static files. Node.js, Pages CMS, databases, and process managers are build-time or authoring concerns only; Nginx serves the result on the VPS.

## Current state

The engineering foundation and three clean-room design studies are implemented. Morii selected A as the active direction; its practical-home revision remains under review before final tokens are frozen:

- `/design/a/` — 时间切片（active review）
- `/design/b/` — 页边手记
- `/design/c/` — 折页长信
- `/design/mobile/` — 三案首页与文章页的 390 px 并排预览

A includes independent Writing, Archive, Categories, Tags, About, and article pages, plus a prototype static search and persistent light/dark theme. All studies reflow at mobile widths.

## Requirements

- Node.js 24 LTS
- pnpm 11.22

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:4321/zh/`. The complete reading fixture is at `/zh/posts/reader-capabilities/` and is intentionally omitted from indexes.

## Checks

```sh
pnpm verify
```

This runs Astro type/content checks, encryption and private-rendering tests, directive validation, metadata-safe media checks, a production build, local-link validation, and a public-tree leak audit.

## Authoring and operations

- [Public article authoring](docs/authoring.md)
- [Markdown extension reference](docs/markdown-reference.md)
- [Protected article publishing](docs/encrypted-posts.md)
- [Architecture](docs/architecture.md)
- [Design research](docs/design-research.md)
- [Design system status](docs/design-system.md)
- [VPS deployment and rollback](docs/deployment.md)

Hosted Pages CMS reads [`.pages.yml`](.pages.yml) and may edit public posts directly on `main`. Protected plaintext never enters Pages CMS.

## Rights

Source code is available under the [MIT License](LICENSE). Articles, photographs, audio, and other editorial content are [all rights reserved](CONTENT_LICENSE.md) unless a file states otherwise.
