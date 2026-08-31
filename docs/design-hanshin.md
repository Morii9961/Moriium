# Direction 「版心」 — specification

> Status: **proposal, not selected**. [`DESIGN.md`](../DESIGN.md) governs shared public design rules; [`docs/design-system.md`](design-system.md) records the current production implementation. This one lives only under `/design/hanshin/` and changes nothing else.

*Hanshin* (版心) is the printer's name for the block of type on a page — the area the margins exist to frame. This direction draws that block instead of implying it.

## The three rules

1. **The text block is drawn.** At desktop widths a hairline stands on each side of the measure. It marks where reading happens; the rest of the page is the mat around it.
2. **Crossing the block is the only expressive gesture.** Photographs, code, tables, and diagrams widen past the hairlines. Headings, paragraphs, and navigation never do. The lines are what make widening a decision rather than a large image.
3. **Two registers, no third.** A serif reads. A monospace annotates dates, counts, categories, and navigation. Nothing else gets its own voice.

## Why this and not the current direction

The direction under review builds its identity from an oversized typographic masthead and a twelve-column ruled index. This one inverts both. The wordmark is small, set in the annotation register, and the page carries its weight in one column of reading. The signature is structural, not typographic: the drawn block and the things allowed to leave it.

That choice follows from the content. Moriium is photography-oriented, so the layout must answer "how wide may this image be" on every page. A width system that is visible answers it once, everywhere.

## Width tiers

Four tiers, carried by one grid. Children default to the reading measure; a class promotes an element outward. No negative margins, so a breakout never depends on knowing its parent's padding.

| Tier | Token | Width | Used by |
| --- | --- | --- | --- |
| Text | `--hs-text` | 40rem | Every paragraph, heading, list, and quotation |
| Media | `--hs-media` | 52rem | Photographs, code, tables, diagrams, horizontal rules |
| Wide | `--hs-wide` | 68rem | Masthead, footer, the article outline's margin column |
| Full | — | viewport | Reserved for photo essays; no public page uses it yet |

The hairlines stand `--hs-mat` (1.5rem to 3.5rem, fluid) outside the measure. Horizontal rules span the media tier, one step wider than the vertical ones, so the two never meet at a corner. The page is ruled, not boxed.

Below 1024 CSS pixels the mat has no room to hold the lines, and they would read as a frame around the screen. They are dropped there.

## Type

| Role | Face | Notes |
| --- | --- | --- |
| Reading, Chinese and Latin | Noto Serif SC Variable | Latin comes from the same Noto Serif design, so mixed lines keep one colour |
| Reading, Japanese | Noto Serif JP Variable | Selected by `:lang(ja)`; shared han characters carry different regional glyph forms |
| Annotation | IBM Plex Mono | Dates, counts, categories, navigation, captions, labels |

IBM Plex Mono has no han glyphs. Chinese and Japanese labels therefore fall through to the serif, which is the intended result: figures set in mono, words set in type. `text-transform: uppercase` is applied only to Latin strings, where it does something.

Both serif packages are locally bundled at exact version 5.3.0 and served as WOFF2 subsets with `font-display: swap`. No font is requested from a third party at runtime.

Chinese and Japanese paragraphs set at `line-height: 1.85` with `line-break: strict`. Full-width punctuation trimming (`text-spacing-trim`) and `hanging-punctuation` are applied where browsers support them; without them the text simply sets normally.

## Colour

One token block, resolved by `light-dark()` against `color-scheme`, which the stored theme sets on `:root[data-theme]`. Measured contrast against the page background:

| Token | Light | Dark |
| --- | --- | --- |
| `--hs-ink` | 16.6:1 | 14.8:1 |
| `--hs-ink-muted` | 5.8:1 | 7.0:1 |
| `--hs-ink-faint` | 4.7:1 | 4.9:1 |
| `--hs-accent` | 7.6:1 | 8.9:1 |
| `--hs-focus` | 6.4:1 | 10.3:1 |

The accent is a single deep blue. It marks links on hover, the current navigation item, focus, and the edge of an important admonition. It never fills a panel.

## Article page

The outline and the prose share one grid row, so the outline can stand in the mat and stay sticky for the length of the article rather than the length of its own box. Below 1280 CSS pixels the outline returns to document order as a collapsed list above the body.

Translation state is stated for all three languages, including the ones that do not exist. A missing version is struck through and labelled unavailable; it is never substituted.

## What this direction refuses

Glass panels, gradient glow, bento blocks, rounded card stacks, particle fields, scroll reveal, a giant centred hero, and beige-plus-serif-plus-red-dot as a shorthand for Japanese minimalism. It also refuses the dashboard reading of "content-rich": no decorative statistics, no activity heatmap, no service-status panel.

## Scope and boundaries

- Every page is prerendered, `noindex`, and excluded from the sitemap. No public route became on-demand.
- Nothing under `/zh/`, `/ja/`, or `/en/` changed. `src/styles/base.css`, `BaseLayout.astro`, `ArticleLayout.astro`, and the `/design/a/` study are untouched.
- Production pages load none of this: the stylesheet ships as its own bundle and the serif packages appear on study pages only. Verified in the built tree.
- The study reuses two settled behaviours rather than reimplementing them: the theme-toggle contract and the lazily loaded search module. Search resolves to a study-local index so results stay inside the study.
- Encrypted posts keep their production route. The decryption flow is not part of this visual change and must not break silently.

## Preview

```bash
pnpm dev
```

Then open `/design/hanshin/` for the overview and route list. `/design/hanshin/zh/posts/reader-capabilities/` is the fullest test of the breakout rule: it carries images, code, mathematics, a diagram, music, video, and admonitions.

## Open questions for Morii

1. Is 40rem the right measure for Chinese at this type size, or should it widen to 42–44rem?
2. Should the hairlines appear below 1024 pixels in some reduced form, or is dropping them correct?
3. The masthead does not stick on scroll. On a long article that trades navigation for quiet. Which do you want?
4. The home shows other languages' recent writing when the current language is thin. Keep it once all three fill out, or drop it then?
5. Should the full-bleed tier be exercised now with a photo essay, or left defined and unused?
