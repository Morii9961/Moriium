# Direction 「界格」 — specification

> Status: **proposal, not selected**. [`DESIGN.md`](../DESIGN.md) governs shared public design rules; [`docs/design-system.md`](design-system.md) records the current production implementation. This one lives only under `/design/jiege/` and changes nothing else. It is submitted alongside [`docs/design-hanshin.md`](design-hanshin.md) so Morii and Enouia can experience both with the same content.

*Jiege* (界格) is the printer's name for the ruled lines that divide a page into columns. This direction builds the page out of them.

## The rules

1. **The page is a field divided by rules.** Every region is a cell of that field, flush against its neighbours, separated by one hairline. Nothing floats in a margin.
2. **The author's statement is one cell among the work.** The site's voice is a sentence in the first cell, at the same rank as the writing, not a banner above it.
3. **Reading has a fixed measure, and images leave it.** Prose sets at one width inside the cell. Photographs, code, tables, and diagrams step out to a wider tier.
4. **Two registers only.** A serif reads, per language. A monospace annotates dates, counts, categories, and navigation. There is no third voice.

## What it fixes from 版心

The two studies were built in that order, and the second exists because the first had two faults that were visible the moment it was rendered rather than reasoned about:

- 版心 centred a 640-pixel column in a 1440-pixel viewport and left the rest blank. 界格 spans the page and every cell carries real data.
- Its section padding opened roughly 350-pixel voids between four short blocks. Here the rules do the separating, so the rhythm stays tight.

A third fault was carried over and fixed in both: `overflow-wrap: anywhere` on CJK paragraphs broke 日本語 across two lines. CJK already wraps between characters; only an unbroken Latin run needs help, and `break-word` gives it that without cutting words that fit.

## Layout

| Token | Value | Role |
| --- | --- | --- |
| `--jg-field` | 92rem | Outer width of the field |
| `--jg-read` | 44rem | Reading measure inside a cell |
| `--jg-measure` | 38rem | Summary and caption measure |
| `--jg-gutter` | 1–2.5rem fluid | Field margin |
| `--jg-pad` | 1.25–2rem fluid | Cell padding |

Rows are explicit rather than auto-filled, so a rule never ends in mid-air: each row declares how many cells it holds and closes itself. A row must never hold more cells than it has columns — borders are drawn per cell, and a wrapped cell would carry a left rule where it needs a top one. Content that does not fit becomes a second row.

Collapsing happens in two steps, because a row of three and a row of two run out of room at different widths:

- below 64rem, a three-cell row becomes one column;
- below 48rem, every row becomes one column.

Wherever a row collapses, its vertical rules become horizontal ones.

The article page carries its own grid with named lines — `edge`, `wide`, `media`, `text`. The header band spans the field while its type aligns with the prose it introduces; the body indents to the measure; figures, code, tables, and diagrams step out to `media`. The outline and the prose share one grid row inside `.jg-reading`, which is what lets the outline stand in the margin and stay sticky for the length of the article. Below 78rem it returns to document order as a collapsed list.

## Type

| Role | Face |
| --- | --- |
| Reading, Chinese and Latin | Noto Serif SC Variable |
| Reading, Japanese | Noto Serif JP Variable, selected by `:lang(ja)` |
| Annotation | IBM Plex Mono |

Shared han characters carry different regional glyph forms, so the language picks the file; this was verified in the browser rather than assumed (`ja` resolves to Noto Serif JP, `zh` to Noto Serif SC). Plex Mono has no han glyphs, so CJK labels fall through to the serif on purpose: figures in mono, words in type. `text-transform: uppercase` applies only to Latin strings.

No font was added for this direction. Both serif families were already in the tree.

## Colour

One token block resolved by `light-dark()` against `color-scheme`, which the stored theme sets on `:root[data-theme]`. The accent is a single deep blue marking hover, current state, focus, and the edge of an important admonition. It never fills a panel.

## Search

The study has its own index at `/design/jiege/search/<lang>.json`, resolving to study routes. The existing `src/scripts/search.ts` module is reused unchanged and still loads only when the reader opens search. Driven in a real browser: the dialog opens, a query returns the right count, and the first result links inside the study rather than back to production.

## Scope and boundaries

- Every page is prerendered and `noindex`; `/design/` is already excluded from the sitemap.
- Nothing outside `src/data/jiege.ts`, `src/utils/jiege.ts`, `src/layouts/JiegeBase.astro`, `src/pages/design/jiege/**`, `src/styles/jiege.css` and this document was touched. No production route, no Hanshin file, no dependency, no backend.
- The study is self-contained: it holds its own copy of the interface labels rather than importing them from the 版心 study, so removing either cannot break the other. The strings are identical on purpose — a fair comparison needs both directions to show the same content.
- Encrypted posts keep their production route. The decryption flow is not part of this visual change.

## Open questions for Morii

1. Is 44rem the right measure for Chinese at this size, or should it narrow toward 40rem?
2. The three-cell index row collapses to one column below 64rem. Should it become two columns in that band instead?
3. The masthead does not stick on scroll, which trades navigation for quiet on a long article.
4. The home shows other languages' availability on the lead piece. Keep it once all three languages fill out, or drop it then?
5. The `full` tier exists in the article grid but no page uses it yet. Exercise it with a photo essay, or leave it defined?
