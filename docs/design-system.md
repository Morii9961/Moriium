# Moriium design-system implementation status

> Canonical authority: [`DESIGN.md`](../DESIGN.md). This document is a derived implementation and status record for the public site. It must not redefine Moriium's visual identity, tokens, accessibility floor, photography rules, motion philosophy, or design-Skills routing.

## Current production snapshot

The public site is built from a four-file token and component layer, loaded in order by `src/layouts/BaseLayout.astro`:

| File | Holds |
| --- | --- |
| `src/styles/tokens.css` | Colour, type, layout, spacing, border, radius, and motion tokens |
| `src/styles/base.css` | Reset, base elements, focus, and the width frame |
| `src/styles/layout.css` | Masthead, measure rule, bands, ledger, taxonomy, colophon, footer |
| `src/styles/content.css` | Article page, long-form prose, rich content blocks, search, 404 |

`src/styles/prototypes.css` no longer reaches a public route. It belongs to the `/design/` study tree and is loaded only by `src/layouts/PrototypeLayout.astro`.

### The structural device

Every editorial unit opens with a hairline the width of that unit. Because the units stand on different rungs of the width ladder, the rules step in and out down the page, and the page's structure is readable without a card, a panel, or a shadow. `SectionMark.astro` renders it; `mark--lead` draws it in Moriium Blue for the current or lead unit, which is the only place a rule carries the accent.

### The width ladder

`.measure` plus one modifier places a band on a rung. The tokens are `DESIGN.md` section 6 verbatim.

```text
--layout-prose     42em (37em in English)   article head, body, colophon
--layout-text      48rem                    short text bands
--layout-media     62rem                    directories, photography, adjacent posts
--layout-gallery   76rem                    home opening, home colophon
--layout-wide      90rem                    masthead and footer frame
```

The reading measure is set in `em` and follows the document language, because 42em holds roughly 42 Chinese or Japanese characters but well past 90 Latin ones.

Home: gallery → media → reading measure → media → gallery. Article: prose for reading, media for the cover photograph, figures inside the body stepping out to the media measure, media again for the adjacent posts.

### Typography

Three families for the three roles in `DESIGN.md` section 5.1. LXGW WenKai Screen draws Chinese, kana, and Latin from one hand, which is what lets a single serif carry reading and display across all three languages; it ships one weight, so hierarchy comes from size and space rather than boldness. Sora is no longer loaded on a public route — it remains a dependency for the `/design/` study.

```text
Article body, display, quotation  → LXGW WenKai Screen  (--font-serif)
Navigation, metadata, labels      → Noto Sans SC         (--font-sans)
Code, dates, counts               → IBM Plex Mono        (--font-mono)
```

### Motion

CSS only. Fast transitions at 260ms on an ease-out of `cubic-bezier(0.16, 1, 0.3, 1)`, applied to link colour, navigation underline, and the search dialog. The article's reading indicator is a scroll-driven animation and costs no JavaScript; browsers without `animation-timeline` do not show it, and reduced motion keeps it (it reports position rather than moving on its own) while neutralising everything else.

### What the reader downloads

Recorded 2026-08-31 against the production build, and enforced by `scripts/measure-baseline.mjs`:

| | Before | After | Budget |
| --- | --- | --- | --- |
| Ordinary page eager JavaScript | 1.0 KB | 1.0 KB | 8 KB |
| Capability article eager JavaScript | 7.5 KB | 7.5 KB | 24 KB |
| Ordinary page eager CSS, gzipped | 91.9 KB | 86.7 KB | 120 KB |
| Capability article eager CSS, gzipped | 106.0 KB | 100.9 KB | 120 KB |
| Production tree | 14.2 MB | 14.1 MB | — |

No JavaScript was added. The CSS reduction comes from two places: the public shell no longer ships the study stylesheet, and it loads three font families instead of four. The remaining weight is almost entirely `@font-face` declarations for the CJK subsets, which is the cost of setting three languages in a real serif; the fonts themselves still download per `unicode-range`, so a page fetches only the chunks its characters need.

## Open items resolved here, pending Morii's approval

`DESIGN.md` section 18 leaves three items open and forbids inventing identity-level values silently. Two are proposed here; the third is now settled.

**1. Production font families and loading strategy — proposed.** The three-role assignment above, all local WOFF2 subsets with `font-display: swap`, no remote font host. `font-synthesis` is off outside `<strong>`, because the serif has one weight and faux bold in a heading is a defect.

**2. Neutral reading-ink tokens — proposed, measured.** Chosen against WCAG contrast on each canvas and checked by `tests/design-system.test.mjs`, which fails if any of them regresses.

| Token | Light on `#F2F5F9` | Dark on `#0B0C14` |
| --- | --- | --- |
| `--color-text-primary` | `#12161C` — 16.59:1 | `#E9ECF3` — 16.49:1 |
| `--color-text-secondary` | `#4A535F` — 7.13:1 | `#A6AEBE` — 8.75:1 |
| `--color-text-tertiary` | `#656E7A` — 4.72:1 | `#7B8395` — 5.13:1 |

**3. Component radius and shadow — settled.** `2px` and `4px` only, the pill reserved for tag chips, and one very soft shadow used solely to lift the search dialog off the page.

## A gap in the constitution, surfaced rather than papered over

`DESIGN.md` section 4 defines both palettes as **surface and field** colours. They do not work as ink, and in dark mode they do not work as lines either:

| Colour | On its canvas | Verdict |
| --- | --- | --- |
| `#5A7DAA` light accent-primary | 3.88:1 | Fails AA for text; passes for a line |
| `#2A3A8C` dark accent-highlight | 1.93:1 | Invisible as text *and* as a hairline |
| `#3E4EA6` dark blue-mid | 2.64:1 | Still below the 3:1 floor for a line |

Two additions follow, and both are proposals awaiting Morii's decision:

- `--color-accent-ink` — an accessible blue for text, focus rings, and small marks. `#3D5F8C` light (5.98:1) and `#8FA0E0` dark (7.68:1). Both are steps of the same hue family, so brand blue still reads as blue where it has to be legible.
- `--color-accent-mark` — a semantic alias, not a new colour. It resolves to `--color-accent-primary` on light and `--color-accent-ink` on dark, so the measure rules, the wordmark's full stop, the active navigation underline, and prose underlines stay visible in both themes without any component knowing which theme it is in.

Prose links follow section 5.4 rather than colouring the text: ink-coloured text with a blue underline, and Moriium Blue on hover. That keeps every link at full reading contrast and identifiable without relying on colour alone.

If Morii prefers a different resolution, the change belongs in `DESIGN.md` section 4 first, and this document follows it.

## Known gap: image dimensions

`<img>` elements for post covers carry no `width`/`height`, because `src/content-schema.ts` stores only `cover` and `coverAlt`. The browser therefore cannot reserve the space before the file arrives, and a cover reflows the page once when it loads. Everything cheaper has been done — the plate paints its own ground, the home cover is `loading="lazy"`, the article cover is `fetchpriority="high"`, and both decode off the main thread — but none of that removes the shift.

The real fix is to measure each cover at build time with `sharp`, which is already a dependency, and add `coverWidth`/`coverHeight` to the schema. That touches the content pipeline rather than the presentation layer, so it is recorded here as the next step rather than taken as part of a visual change.

## Isolated design studies

The `/design/` routes are clean-room comparison evidence, not production approval. The inspected references, extracted principles, rejected recommendations, and resulting decisions belong in [`design-research.md`](design-research.md). Any future promotion or revision must follow `DESIGN.md` and Morii's explicit approval.

## Implementation rule

When the implementation and `DESIGN.md` disagree, follow `DESIGN.md` and update this status record. Do not silently promote a prototype, generic skill recommendation, or reference-site pattern into Moriium's site-wide language.
