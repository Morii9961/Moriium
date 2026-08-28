# Author public articles

## Pages CMS

1. Open the `Morii9961/Moriium` repository in hosted Pages CMS.
2. Choose **Public posts** and create or edit an entry.
3. Store `slug` as `<lang>/<route-slug>`, for example `zh/a-winter-walk`. The public URL becomes `/zh/posts/a-winter-walk/`.
4. Give real translations the same `translationKey`. Do not create placeholder translations.
5. Keep **Draft** enabled until the content and media are ready.
6. Use **Editor** for ordinary Markdown and **Source** for directives, Mermaid, math, and advanced code-fence metadata.
7. Save to `main`. CI validates the schema, directives, encryption tests, static build, and local links before deployment.

Uploaded images go to `public/media/posts/`. Pages CMS does not remove camera metadata. Before publishing a photograph that came from an original file, generate a safe derivative locally:

```sh
node scripts/sanitize-media.mjs path/to/original.jpg public/media/posts/article/photo.webp
```

The command never modifies the source. It rotates from orientation metadata, constrains dimensions, encodes a new file, and refuses output that still contains EXIF, ICC, or XMP blocks.

## Local editing

Create Markdown anywhere below `src/content/posts/`. Run:

```sh
pnpm content:validate
pnpm check
pnpm build
pnpm links
```

The hosted CMS is intentionally not configured for protected posts. Follow [encrypted-posts.md](encrypted-posts.md) for those.
