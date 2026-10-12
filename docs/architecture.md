# Architecture

> Production follows ADR 0002: static reader routes and a separate author
> service. The earlier [vnext architecture plan](vnext-architecture-plan.md)
> supplies historical planning context; changes to the reader boundary need
> an approved architecture decision.

## Runtime boundary

Astro uses static output with the standalone Node adapter admitted by ADR 0002.
Every public route is prerendered into `dist/client/`. Nginx serves the immutable
release selected by `/var/www/moriium/current`; reader requests do not require
Node or the database. Only `/admin/` and `/api/` reach the loopback author
service, whose server build and persistent SQLite data are separate from the
public release. Search remains a static index.

```text
Markdown / encrypted JSON / cached repository metadata
                         │
                         ▼
                Verified source + VPS published-content export
                         │
                         ▼
                Astro build on VPS
                         │
                         ▼
              immutable HTML, CSS, JS, media
                         │
                         ▼
               Nginx on the existing VPS
```

The optional [automatic deployment controller](automatic-deployment.md) receives
signed GitHub notifications and fetches verified source incrementally. Its
installation and activation are separate from ordinary source verification.

## Content

Public Markdown lives in `src/content/posts/`. Metadata is validated by `src/content.config.ts`. Astro reserves the frontmatter key `slug` as a collection-wide ID, so its stored form is `<lang>/<route-slug>`; the helper in `src/utils/content.ts` removes the language prefix when producing `/zh/posts/<route-slug>/` and equivalent routes.

Translations use `translationKey`. A missing language is shown as unavailable and is never synthesized.

Protected plaintext lives only under ignored `.private/posts/`. The local encryption command writes public metadata and ciphertext JSON to `src/content/protected/`; no plaintext is read during a public build.

## Reader modules

Unified processes remark/rehype plugins, KaTeX, and local directives. Expressive Code handles public Markdown code blocks. Page-level feature detection decides whether to emit the loader for PhotoSwipe, Mermaid, music, video, or copy protection. PhotoSwipe and Mermaid are dynamically imported. Remote music does not connect before reader interaction; a YouTube or Bilibili player is a lazy iframe that the browser fetches within its lazy-load distance (often on arrival), and never autoplays.

GitHub card data is collected at build time when `GITHUB_TOKEN` is available. Actions restores a small daily metadata cache, so repeated builds on the same content do not consume API requests; stale cache remains a fallback if GitHub is temporarily unavailable. Missing data becomes an ordinary repository link and does not fail the build.

## Search

Production generates a static article index during the build and loads the
search module and index only when the reader opens search. No query is sent to
a server and no search process runs on the VPS.

## Design boundary

The selected A structure has been migrated to the primary production routes. Public visual decisions follow the canonical [`DESIGN.md`](../DESIGN.md); [`design-system.md`](design-system.md) records only the current implementation snapshot and remaining implementation work. Structural migration does not mean every open design item is frozen. Prototype routes are excluded from the sitemap and carry `noindex`.
