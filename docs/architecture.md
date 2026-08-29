# Architecture

> Production baseline. Morii has approved evaluating the experience-first
> full-stack scope documented in [vnext-architecture-plan.md](vnext-architecture-plan.md).
> Until Phase 1 receives implementation authorization and a later Phase 5 ADR
> updates the project contract, the static production architecture below remains
> authoritative.

## Runtime boundary

Astro builds the entire site to `dist/`. Production serves that directory through Nginx. There is no server adapter, Node process, database, PM2 application, server-side search service, comments service, analytics client, or CMS runtime on the VPS.

```text
Markdown / encrypted JSON / cached repository metadata
                         │
                         ▼
                GitHub Actions build
                         │
                         ▼
              static HTML, CSS, JS, media
                         │
                         ▼
               Nginx on the existing VPS
```

## Content

Public Markdown lives in `src/content/posts/`. Metadata is validated by `src/content.config.ts`. Astro reserves the frontmatter key `slug` as a collection-wide ID, so its stored form is `<lang>/<route-slug>`; the helper in `src/utils/content.ts` removes the language prefix when producing `/zh/posts/<route-slug>/` and equivalent routes.

Translations use `translationKey`. A missing language is shown as unavailable and is never synthesized.

Protected plaintext lives only under ignored `.private/posts/`. The local encryption command writes public metadata and ciphertext JSON to `src/content/protected/`; no plaintext is read during a public build.

## Reader modules

Unified processes remark/rehype plugins, KaTeX, and local directives. Expressive Code handles public Markdown code blocks. Page-level feature detection decides whether to emit the loader for PhotoSwipe, Mermaid, music, video, or copy protection. PhotoSwipe and Mermaid are dynamically imported; third-party media does not connect before reader interaction.

GitHub card data is collected at build time when `GITHUB_TOKEN` is available. Actions restores a small daily metadata cache, so repeated builds on the same content do not consume API requests; stale cache remains a fallback if GitHub is temporarily unavailable. Missing data becomes an ordinary repository link and does not fail the build.

## Search

Search is a newly approved V1 capability. The design prototype filters its small inline fixture locally. Production will generate a static article index during the build and load the search module and index only when the reader opens search; no query is sent to a server and no search process runs on the VPS.

## Design boundary

The selected A structure has been migrated to the primary production routes. Its final typography, color, spacing, photography cadence, and other visual tokens are still under review in `docs/design-system.md`; structural migration does not mean the visual system is frozen. Prototype routes are excluded from the sitemap and carry `noindex`.
