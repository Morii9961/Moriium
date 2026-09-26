# Moriium

Moriium is Morii's lightweight personal blog and archive, with Chinese, Japanese, and English interfaces at `/zh/`, `/ja/`, and `/en/`.

Reader pages are prerendered by Astro and served directly by Nginx. The author-only Admin and API use a separate resident Node.js process and SQLite; public reading and search do not depend on that process or database. Astro's `output` remains `static`, with the Node adapter handling only `/admin/` and `/api/` on demand.

## What is included

- Home, writing, archive, category, tag, about, and article pages, plus RSS and a sitemap.
- Build-time static search, loaded when opened, and a persistent light/dark appearance control.
- Markdown extensions for code, mathematics, Mermaid, lightboxes, video, music and repository cards, admonitions, spoilers, and protected posts.
- An author workspace built with Vue 3 and Tiptap, with authenticated editing, media handling, and content export. Its code stays outside public reader bundles.

Translations share a `translationKey`; unavailable variants are shown as unavailable. Machine-translated articles must carry a visible notice identifying the Chinese original.

Twilight is a content-compatibility reference. Moriium's public UI is developed independently and follows [`DESIGN.md`](DESIGN.md).

## Local development

Use Node.js 24.x and pnpm 11.22.0, as specified in [`package.json`](package.json).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [the local Chinese home](http://127.0.0.1:4321/zh/). This starts the development server; author account and production service setup are covered in the [deployment guide](docs/deployment.md).

## Verification

Choose checks for the changed surface, following the [quality gates in AGENTS.md](AGENTS.md#quality-gates):

| Command | Purpose |
| --- | --- |
| `pnpm check` | Astro and TypeScript diagnostics |
| `pnpm content:validate` | Content schema and Markdown directive validation |
| `pnpm media:check` | Publishable media checks |
| `pnpm test` | Repository test suite |
| `pnpm build` | Content/media validation, GitHub card caching, and production build |
| `pnpm links` | Local links in the built output |
| `pnpm split` | Static reader and on-demand author output boundaries |

For the full verification pass used by CI and release acceptance:

```sh
pnpm verify
```

`verify` includes the checks above, the public-tree privacy audit, and performance baseline checks. Do not repeat its constituent commands when their results remain valid. Output-based checks require a build matching the current source; documentation-only changes normally need diff, link, and consistency checks rather than a site build.

The [reader fallback tests](tests/reader-fallbacks.test.mjs) render their own fixture document to check behavior without JavaScript. Local tests and builds do not establish VPS, DNS, TLS, or deployment acceptance.

## Authoring

Public Markdown lives under `src/content/posts/`. The repository also retains [Pages CMS configuration](.pages.yml) and its [authoring guide](docs/authoring.md). Once the Admin takes over authoring, retire Pages CMS or keep it as read-only history: the same article must never be writable through both systems.

Protected plaintext stays in ignored `.private/posts/`; only public metadata and ciphertext may enter the public collection. Keep original photographs unchanged and publish separate derivatives with GPS and sensitive metadata removed.

- [Markdown extensions](docs/markdown-reference.md)
- [Protected article publishing](docs/encrypted-posts.md)
- [Admin and production architecture decisions](docs/adr-0002-phase5-production.md)
- [Service setup, deployment, backup, and rollback](docs/deployment.md)

## Project guidance

[`AGENTS.md`](AGENTS.md) defines scope, engineering constraints, Skill routing, authorization, and verification. [`DESIGN.md`](DESIGN.md) defines the public visual identity. Read supporting documents when they answer a question relevant to the task:

- [Architecture overview](docs/architecture.md)
- [Design implementation status](docs/design-system.md)
- [Design research and references](docs/design-research.md)

The `/design/a/`, `/design/b/`, `/design/c/`, and `/design/mobile/` routes retain earlier visual studies. They are research references, excluded from the sitemap, and do not reopen the approved production design. Local changes within that design do not require another three-concept selection.

## Enouia

[`enouia/`](enouia/README.md) is an independent static site with its own dependencies, lockfile, assets, and output. From this repository root:

```sh
pnpm --dir enouia install --frozen-lockfile
pnpm enouia:verify
pnpm enouia:preview
```

CI verifies both sites separately. Enouia requires its own Nginx virtual host and release directory; the Moriium deployment workflow does not publish its output. See its README for local development and deployment details.

## Rights

Source code is available under the [MIT License](LICENSE). Articles, photographs, audio, and other editorial content are [all rights reserved](CONTENT_LICENSE.md) unless a file states otherwise.
