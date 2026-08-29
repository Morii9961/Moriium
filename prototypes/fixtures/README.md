# Fixture corpus

Shared input for prototype A and prototype B. ADR 0001 section 1 makes this a
hard prerequisite for Phase 1: both prototypes have to consume identical inputs,
or the A/B comparison in section 4 compares two different things.

Validate after any change:

```sh
pnpm -C prototypes fixtures:check
```

## Everything here is invented

No file in this directory derives from Morii's real writing, real protected
posts, or real photographs. The prose is fiction written for the fixtures. The
images are hand-authored SVG geometry, so they carry no EXIF, GPS, or camera
data by construction.

Prototypes must treat this directory as **read-only input** (ADR 0001 section
3.2). Neither prototype writes back here, and neither reads `.private/posts/`,
`src/content/`, real passwords, or original photographs.

## The protected fixture breaks a production rule on purpose

`protected/zh-sealed-notebook.source.md` is committed plaintext sitting next to
its own ciphertext, and the password is a constant in
`../tools/fixture-password.ts`.

**Never imitate this for real content.** It is done here because the corpus must
be reproducible and the unlock flow must be testable, and because the password
guards nothing. For real protected posts the rules are the opposite and they are
not negotiable: plaintext lives only in the ignored `.private/posts/`, the
password is typed at a hidden prompt and never written anywhere, and neither
ever enters the repository. See `AGENTS.md` and `docs/encrypted-posts.md`.

Regenerating the envelope draws a fresh random salt and IV, so the JSON changes
every run. That is correct behaviour, not churn to suppress:

```sh
pnpm -C prototypes fixtures:build
```

## What each fixture is for

| Fixture | Serves | Why it is shaped this way |
| --- | --- | --- |
| `posts/zh/zh-tide-notes.md` | T3, T5 | Exercises every block in `docs/markdown-reference.md`: fence metadata with title, line numbers, a marked line and a collapsed range; inline and display math; Mermaid; all five admonition kinds plus a GitHub callout; spoiler; `::github`; `::video`; `::music`; an image with alt and caption; and a paragraph of mixed Chinese, Japanese and English punctuation. |
| `posts/ja/ja-tide-notes.md` | T3, T5, T6 | Same `translationKey`, same blocks, Japanese prose. Gives round-trip fidelity a non-Latin body to lose characters in. |
| *(no English `tide-notes`)* | T6 | The absent third language is the fixture. "Unavailable" has to be distinguishable from "not written yet", and `AGENTS.md` forbids fabricating or copying a translation. |
| `posts/zh/zh-darkroom-log.md` | T6 | Deliberately single-language. T6 asks Morii to author the Japanese translation during the task, so one group has to start incomplete. |
| `posts/zh/zh-winter-drafts.md` | T8, veto check | `draft: true` with `unlisted: false`, so a leak test proves filtering keys on `draft` rather than being masked by `unlisted`. Draft leakage into public routes, RSS, sitemap or search is a hard veto in ADR section 4. |
| `protected/zh-sealed-notebook.json` | T3, unlock flow | Real AES-256-GCM envelope from the production `scripts/lib/crypto.mjs`. Carries an image and math so the `features` markers are not all false. |
| `media/*.svg` | T7 | Referenced under `/media/fixtures/`, mapping to this `media/` directory. `/fixtures/` was already taken by `public/fixtures/reader-image.svg` in production. |

## What the validator actually checks

`../tools/validate-fixtures.ts` asserts rather than assumes:

- every post validates against the shared frontmatter schema;
- `slug` prefix and containing directory both agree with `lang`;
- the mirrored schema in `../shared/content-schema.ts` declares the same field
  names as `src/content.config.ts`, so the mirror cannot drift silently;
- `tide-notes` ships zh and ja and **not** en; `darkroom-log` ships zh only;
- a draft fixture exists and keeps `unlisted: false`;
- every referenced media file exists, every image has non-empty alt text, and no
  media file is orphaned;
- the protected fixture's `features` markers match its source body;
- the envelope decrypts with the published test password, and **fails** with a
  wrong one.

## The baseline

`baseline/` holds each fixture body rendered through the **public article**
pipeline. ADR 0001 section 4 measures round-trip loss and task T5's
preview-versus-production diff against it, so it has to match what the deployed
site emits.

```sh
pnpm -C prototypes baselines:build    # regenerate
pnpm -C prototypes baselines:verify   # prove the renderer still matches dist/
```

Two things make the baseline trustworthy rather than merely present:

- The renderer imports `astro.config.mjs` and uses the plugin lists the site is
  configured with, instead of restating them. `scripts/lib/render-markdown.mjs`
  would have been the wrong source: that is the protected-post path, and it
  disables smartypants and syntax highlighting.
- `baselines:verify` renders a real production post and compares it against the
  page in `dist/`. That check earned its place immediately — the first baseline
  emitted `pre.astro-code`, while the built site contains `div.expressive-code`
  and no `astro-code` at all, because Expressive Code arrives as an Astro
  integration and is not in the markdown plugin chain. It is now wired in
  explicitly, and `fixtures:check` fails if the production `expressiveCode({…})`
  options change without the baseline being regenerated.

Injected `<style>` and `<script>` blocks are stripped. Expressive Code inlines
them, the Astro integration extracts them to `/_astro/`, and left in they were
24 KB of a 48 KB file — the content would have been a rounding error inside its
own diff.

`fixtures:check` fails if any stored baseline no longer matches a fresh render.
When it does, read the diff before regenerating: it means public rendering
changed.

## Known gap

The baseline covers rendering. Counting round-trip loss through Tiptap also
needs the reverse direction — markdown out of the editor compared against
markdown in — and that cannot be built until prototype B exists.
