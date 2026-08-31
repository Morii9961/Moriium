# Direction 「卷首」 — specification

> Status: **proposal, not selected**. [`DESIGN.md`](../DESIGN.md) governs shared public design rules; [`docs/design-system.md`](design-system.md) records the current production implementation. This is the third study, alongside [`docs/design-hanshin.md`](design-hanshin.md) and [`docs/design-jiege.md`](design-jiege.md); none of them was modified to make room for it.

*Juanshou* (卷首) is the front matter of a book: the foreword, the signature, the table of contents — everything before the work begins.

## Why a third study

Morii's verdict on the first two was that the type and spacing were comfortable but the pages did not feel like a person's site. That diagnosis was right, and the cause was structural rather than decorative.

Both earlier studies offered slots that could be filled without saying anything. 版心 had a masthead and section labels; 界格 had a field of cells with a label in each. Every slot could be, and was, filled with a noun: 归档. 分类. 标签. Correct, and mute.

Front matter cannot be filled in that way. A foreword has to say something, and it has to be signed. This study picks a structure that forces the voice rather than one that merely permits it.

## The rules

1. **The page opens with writing, not a logo.** A short foreword at display size, dated and signed. It is the first thing a visitor reads and the first thing that tells them whose site this is.
2. **Contents carry dot leaders.** What the site holds is a real table of contents, each entry ending in a fact — how many posts, which years, who wrote it. It is the one piece of print apparatus the web mostly dropped, and it is what makes the page read as front matter rather than as navigation.
3. **Facts are said, not tallied.** The numbers come from the content collection; the sentence around them is written. `1 post` is true and says nothing about whose site this is — and when a language holds a single post, a bare count is actively unflattering.
4. **Scale is allowed to be loud.** The foreword and the article title carry the page; annotations are allowed to be very small. The earlier studies sat between 17px and 48px throughout and read evenly grey.
5. **Sections differ in shape.** Foreword, leader list, single lead, marked notes, index, colophon. An even grid of identical blocks is what made 界格 read flat.
6. **The article keeps its context beside it.** Dates, translations, tags and the outline sit in a rail next to the prose rather than after it, so a reader who stops halfway has still seen that the piece exists in three languages.

## What is kept from 界格

The reading measure, the CJK line-breaking rules, the two-register type system (serif reads, monospace annotates), the per-language serif, and the spacing rhythm. That is the part Morii found comfortable, and none of it was the problem.

## Layout

| Token | Value | Role |
| --- | --- | --- |
| `--js-page` | 78rem | Outer width |
| `--js-read` | 42rem | Reading measure |
| `--js-wide` | 56rem | Notes and colophon |
| `--js-gutter` | 1.25–5rem fluid | Page margin |

Type runs from `--js-note` (0.6875rem) to `--js-title` (up to 3.5rem) — roughly a fivefold range against the earlier studies' threefold.

The article is one grid: header band across the top, prose in the first column, rail in the second. Below 64rem the rail follows the article instead of sitting beside it, and the outline collapses into a `<details>` above the prose rather than repeating itself.

## Type and colour

Unchanged in principle from the earlier studies, and verified again in the browser: `:lang(ja)` resolves to Noto Serif JP, `zh` to Noto Serif SC. No font was added; both families were already in the tree. One `light-dark()` token block driven by `color-scheme`.

The masthead sets the site name in the reading serif rather than the annotation mono. On a personal site the name is the author's, not a label.

## Copy

All of it lives in `src/data/juanshou.ts`, including the foreword in three languages, so the writing can be reviewed in one place instead of hunted through templates. The voice follows wording Morii already uses on the production about page and in the footer.

**Nothing in it invents a fact about Morii.** The 近况 block is generated from the content collection at build time and phrased as a sentence. Morii should replace those lines with real ones; the point of the block is that the structure asks for them.

## Scope and boundaries

- Every page prerendered and `noindex`; `/design/` is already excluded from the sitemap.
- Only `src/data/juanshou.ts`, `src/utils/juanshou.ts`, `src/layouts/JuanshouBase.astro`, `src/pages/design/juanshou/**`, `src/styles/juanshou.css` and this document were added. No production route, no earlier study, no dependency, no backend.
- Self-contained: it holds its own copy of the interface labels, so removing any of the three studies cannot break the others. The labels match word for word, because a fair comparison needs the same content in each.
- Search has its own index at `/design/juanshou/search/<lang>.json`, resolving to study routes, and was driven in a real browser rather than assumed.
- Encrypted posts keep their production route.

## Open questions for Morii

1. The foreword is mine, written in your register from wording you already use. Replace it — it is the one piece of this design that should not be written by someone else.
2. The 近况 entries are derived. Which real ones do you want there, and how often would you actually update them?
3. Dot leaders: distinctive, or too much of a book affectation for a website?
4. The rail holds five blocks on an article. Is the outline pulling its weight there, or should it go back to the left margin?
5. 42rem measure with the rail beside it — comfortable, or should the prose column widen when an article has no outline?
