# Moriium design-system implementation status

> Canonical authority: [`DESIGN.md`](../DESIGN.md). This document is a derived implementation and status record for the public site. It must not redefine Moriium's visual identity, tokens, accessibility floor, photography rules, motion philosophy, or design-Skills routing.

## Current production snapshot

The 2026-09-01 frontend branch implements the **Blue Aperture** public design layer, independent from the archived A/B/C study stylesheet:

- a compact publication header with a serif wordmark, visible route state, and 44-pixel search, theme, and language targets;
- an asymmetric home built around one fixed 深渊蓝 Moriium identity aperture, two glyph-composed Japanese statements, selective outline overprint, true vertical marginal notes, route edges, a content map, and a work-in-progress register;
- independent Writing, Archive, Categories, and Tags routes that reuse the aperture as a spatial rule rather than a card component;
- an About page composed as an editorial document rather than an index: the directory hero, then a statement at second voice, then five bands — what the archive keeps, a dated record on the archive's own date axis, a colophon, the site principles, and subscription and contact. Every band shares one label track (`--about-label`, 7rem) and one content edge, and prose is indented into that content column by `--about-indent` so labels and words each keep a single left edge. The page carries no counts, no avatar, no freshness stamp and no third-party request;
- a Writing index whose section head carries two controls written in the site's rule-and-word grammar rather than as filled buttons: a category and tag filter that stays a disclosure of real taxonomy links without JavaScript, and a second opener for the same global search dialog;
- long-form article pages with a narrow blue title band, an opening sized by its own content, a 48rem prose measure centred on the page, a 76rem cover track, one sticky outline hanging in the left margin, and single-column mobile reading;
- global static search and light/dark controls, with the generated index and search module still loading only after the reader opens search.

All production public routes import `src/styles/public.css`. The home adds `src/styles/public-home.css`, and the article layout adds `src/styles/public-reading.css`. `src/styles/prototypes.css` remains isolated to `/design/` comparison history.

### Current implementation values

On 2026-09-07, Morii selected the final Juanshou study's typography from
`archive/design-ui-comparison-recovery-2026-08-31` after a local preview.
All public pages now use locally bundled Noto Serif SC Variable for Chinese
and English (including its Latin glyphs), and Noto Serif JP Variable for
Japanese. Titles, navigation, prose, search, and wordmarks share this choice;
metadata keeps IBM Plex Mono with the page's serif as its CJK fallback.
Both new Fontsource dependencies are pinned to 5.3.0, matching the archive.
The home hero's large Japanese lettering, vertical notes, and background
fragments retain Shippori Mincho. Archived comparison studies and author-admin
typography remain separate from this public frontend selection.

These values record the branch implementation. They do not replace the canonical palettes or freeze future identity decisions.

| Role | Light | Dark |
| --- | --- | --- |
| Reading ink | `#20252B` | `#E9EDF4` |
| Secondary ink | `#5C6672` | `#AAB2BF` |
| Auxiliary ink | `#78838F` | `#858E9E` |
| Accessible interactive ink | `#365F8D` | `#A9B9EF` |
| Primary canvas | `#F2F5F9` | `#0B0C14` |

The interactive inks are functional tints derived for contrast; they do not replace Moriium Blue. Measured contrast against the primary canvases is 6.04:1 in light mode and 10.10:1 in dark mode. Reading ink measures 14.11:1 and 16.61:1 respectively.

### Home hero geometry

The home hero is a fixed-proportion type field rather than a flow layout. `.aperture-hero__stage` carries a desktop `aspect-ratio` of `1660 / 960`, and `.aperture-hero` is the container query context, so every offset inside the stage is a percentage of that field and every size is a `cqw`/`cqh` unit. The composition therefore holds the same proportions from 1200px to 1920px instead of drifting with the viewport.

Three custom properties define the aperture: `--panel-start`, `--panel-end` and `--panel-top`. `.aperture-hero__window` positions itself from them and `.aperture-hero__overprint` clips itself with the same three values, which is what makes the outline glyphs change from canvas ink to panel ink exactly on the panel edge. Change the panel geometry through those properties only; editing either rule alone splits the seam.

To slide the panel sideways without resizing it, move `--panel-start` and `--panel-end` by the same amount in opposite directions — its width is `100% - start - end`, so equal-and-opposite keeps it constant and everything inside travels with it. Where the panel sits is set by the type rather than chosen: 見たものを has to finish *outside* the panel, so the panel edge has to clear that run's last glyph. At 1536×1024 the panel starts at 52.34% for that reason, 64px right of where it was. Below 70rem it is flush to the stage's right edge (`--panel-end: 0`), which is arithmetic, not styling — the run sets 412.7px of ink into 389.2px of space and cannot move left because 見 already meets the vertical note, so the shortfall has to come out of a right margin that holds nothing at that width.

The hero's display face is Shippori Mincho, a high-contrast Mincho that the platform fallbacks do not provide. Shipping it whole would cost 1.4 MB per weight for roughly forty glyphs, so `scripts/subset-hero-font.mjs` cuts it to exactly the characters the hero sets — 33 glyphs, 14 KB across both weights — and writes the matching `unicode-range` into the `@font-face` rules at the top of `public-home.css`. Any character outside that range falls straight through to the platform Mincho fallbacks in `--font-mincho`, so the subset can never leave a tofu box. The face is a pinned devDependency used only to generate the subset; the site never downloads it, and no font is fetched from a remote host. Re-run the script after editing the hero's Japanese copy — `tests/design-fonts.test.mjs` fails if the shipped subset stops covering it.

The statement is four runs — 見たものを / 記す。/ 未完のまま / 残す。— and **each run is a single line of type, not a row of individually placed characters**. Every glyph in a run shares one font-size, one line box and one baseline, and carries no size, angle or vertical offset of its own; a glyph may differ from its neighbours in colour, stroke and horizontal spacing only. That is what makes a run's em-box top edges lie on one straight line and its bottom edges on another, exactly parallel — measured on the page, all four runs fit both edges at −8.50° with **zero** pixels of residual.

Give any single glyph its own `font-size`, `top` or `rotate` and that guarantee is gone: the run stops reading as a line and starts reading as five decorations. Earlier passes solved per-glyph offsets against a guide line and the edges were ragged the whole time. Note that `を` is set as an outline but still belongs to 見たもの's line box rather than becoming a fifth positioned object.

The geometry lives entirely in the stylesheet, in two layers that must not be conflated:

- `.aperture-hero__phrase` rotates by `--run-tilt` (−8.5°). This is the run's climb up to the right. All four runs share the one variable, so they are parallel by construction.
- `.aperture-hero__slant` inside it shears by `--glyph-italic` (10°). This is the letterform's own lean. CJK Mincho has no true italic, so it is a synthetic oblique, and it is deliberately steeper than the run's tilt.

Spacing works in two steps. `--line-tracking` on the run sets the rhythm — one value for every pair. `--nudge` then opens one specific pair wider than that rhythm, because even spacing does not read as even: a closed kana beside an open one looks tighter than the same measurement between two dense kanji. The nudges in force, in px at 1536×1024 on top of the run's own advance. Most open a pair up; `の→を` is the one that closes one, and it is not a spacing judgement — it is what pulls the trailing `を` back out of the panel:

| run | pairs |
| --- | --- |
| 見たものを | 見→た +8.0 · た→も +6.5 · も→の +8.0 · の→を −8.0 |
| 記す。 | 記→す +6.5 · す→。 +4.0 |
| 未完のまま | 未→完 +8.0 · 完→の +6.5 · の→ま +8.0 · ま→ま +6.5 |
| 残す。 | 残→す +6.5 · す→。 +4.0 |

Two rules keep `--nudge` from becoming the per-glyph positioning this structure exists to avoid:

- **It is horizontal only, and there is no vertical counterpart.** The runs already fit both edges at zero residual, so there is nothing for a vertical nudge to correct and everything for it to break.
- **It is spent as `margin-left`, not `translateX`.** A margin is layout: the character moves along the run's own axis inside the shared line box, so both em-box edges stay exactly where they were. A transform would need `display: inline-block` on every glyph, which gives each one a box of its own. It is set in em against the run's font-size, so it scales with the type at every breakpoint. The first glyph of a run is always `0` — a margin there moves the whole run rather than a gap inside it.

Sizes are per *run*: the outline runs are set `--line-scale: 1.1` against the solid runs' 145px.

### The article page

The opening is sized by what it holds. It used to be pinned to 48rem tall because the study it came from always put a 76rem photograph directly under the title; with no cover that reserved height held nothing, and on a 900px screen the first paragraph began 137px below the fold. It now ends where the facts end, and the first two paragraphs are on the opening screen.

Han glyphs fill their em box, so the title's old 0.84 line height stacked the second line of a Chinese headline 21px into the first. Titles set at 1.12 with −0.02em; `:lang(en)` keeps 0.98 and −0.05em, because Latin letterforms carry their own side bearings. Body text runs at 1.75 with `letter-spacing: 0.02em` on Chinese and Japanese, reset on `code`, `kbd`, `abbr`, `time`, `.katex` and anything carrying its own `lang`.

The reading grid is three tracks holding two things: the prose sits in the middle column so it is centred on the page, and the outline hangs in the left margin as a sticky marginal note. The right margin holds nothing, deliberately. The rule that used to run down the middle of the prose is gone — it was positioned at 42% of a grid measured for three rails, which at 1440px put it 264px inside the text column, through the figures and the code.

**A layer-order trap worth knowing about.** A layer's position in the cascade is fixed by the first `@layer` statement the browser sees. The article page's bundle begins with this stylesheet, so `components` was being registered before `base`, and `.public-site p { margin: 0 }` in `base` outranked every margin the reading stylesheet declared — which is why the summary sat flush against the title. `public-reading.css` now restates the canonical order at the top. Any future page-specific stylesheet that can lead a bundle needs the same line.

Everything the Markdown pipeline can emit is covered: tables in a focusable scroll wrapper, footnotes, task lists, nested lists, `hr`, `details`, `h4`–`h6`, `kbd`, `mark`, `abbr`, `sub`, `sup`, `del`, `ins`, figures with captions, and `.katex-display` overflow. remark hard-codes `.sr-only` on the heading above a footnote section; undefined, that heading was rendering at full article-h2 size, in English, with the accent rule above it, in the middle of a Chinese post.

The outline marks the section the reader is in through an IntersectionObserver band, in an 809-byte inline module. Without it the outline is still a list of working anchor links.

### The entrance

The hero is written onto the page rather than faded in, and the order is the point: the quiet layer first, then the display type filling the field in four passes.

| | starts | ends |
| --- | --- | --- |
| panel, left marginal note, left rule | 120 / 140 / 200ms | ~1.1s |
| panel register · 見たものを | 300 / 250ms | 1.61s |
| Moriium · 記す。 | 780 / 720ms | 2.05s |
| panel body · 未完のまま | 1180 / 1120ms | 2.36s |
| 残す。 · right note · right rule | 1600 / 1720 / 1780ms | 2.86s |
| CTA words, rule, arrow · ghost text | 1980 / 2080 / 2250 / 1850ms | 2.83s |

Two layers of timing, kept independent. A **run** declares when it starts (`--run-delay`), how long each of its characters takes (`--run-dur`), how far they travel (`--set-y`) and which entrance it uses (`--enter-keys`). A **glyph** declares only its own turn (`--at`) and a small sideways offset to arrive from (`--drift`). The delay is the sum. Nothing animates the run element itself — it carries the rotation, and a transform there would fight it.

`at` and `drift` are authored, not derived from the glyph index, and the unevenness is not decoration. An even step reads as a machine counting off characters. The values group each phrase into the breaths it actually has — 見た | もの | を and 未完 | のまま — roughly 80ms between characters inside a group and 150-165ms of rest between groups, so the run reads as writing rather than as a list. 見 and 未 anchor their runs and do not drift at all; the kana after them do.

The two outline runs use a different keyframe, because they are a second layer of type rather than a copy of the first. They arrive in two stages: the stroke surfaces to about four tenths of its resting strength while still soft and slightly out of place, drifts through a slow middle, then resolves. Stating that partial stage as `calc(var(--glyph-opacity) * 0.4)` is what keeps it from ever reading stronger than the solid characters it sits behind.

Three things about it are load-bearing:

- **The glyphs are `inline-block`, because transforms do not apply to inline boxes.** That swap was measured before it was adopted: advances, both em-box edge fits (−8.500°, zero residual) and every glyph's *text box* come back byte identical either way. Only the border box changes height, from the font's content area to the line box, and nothing is drawn from it.
- **The resting opacity is a custom property, not a literal.** An animation beats a normal declaration, so a keyframe ending at `opacity: 1` would quietly promote every outline character to full strength the moment it finished. The keyframes land on `var(--glyph-opacity)` instead — 1 for solid, 0.55 for outline, 1 again for the outline's overprint copy.
- **The overprint container must not fade as a block.** Its glyphs carry the same per-character schedule as the h1's; a wrapper fade would hide an outline character that is already due.

Travel is in em so the entrance scales with the type, and blur stays at 1–2px at the display size. Blur is the one value worth watching: at three times that it stops reading as type resolving and starts reading as a web page's blur-in.

Under `prefers-reduced-motion` a hero-specific rule replaces all of it with one 320ms fade — no stagger, no travel, no blur. It carries two classes so it outranks the site-wide `.public-site *` reset, and it lands on `--glyph-opacity` so the outline characters still rest at their own strength.

Origins are reverse-solved from what the approved composition fixes, measured at 1536×1024: the solid runs begin hard against the left vertical note, which does not move, and the gap between the upper and lower groups is **15.6%** of the card height. The runs then run *to* the panel rather than through it — 見たものを's trailing `を` clears the panel edge by 5.8px and 未完のまま's trailing `ま` by 9.3px, close enough to graze it, far enough to stay out of it.

Judging that needs real glyph outlines, not `getBoundingClientRect`. A CJK em box is mostly empty — `を` inks 0.69 of its em and `。` only 0.27 — so box geometry overstates an intrusion by tens of pixels and reports collisions that are not there. Measure with canvas `TextMetrics.actualBoundingBox*` and map the ink rect through the run's own transform.

Two constraints fight the composition and win, both geometry rather than taste:

- **An ascending run's origin is its floor, not its ceiling.** Raising the number drops the whole run. This is the opposite of the intuition and the thing most likely to be got wrong when re-tuning, on phones especially, where the second run must straddle the panel's top edge and the outline run must clear the panel's register line.
- **`mix-blend-mode: difference` does not work for the outline runs.** A #9AA7BD hairline at 0.55 opacity differenced against the panel composites to roughly #525861, about 2:1 against the panel itself, so the outline disappears exactly where it is meant to turn light. The clipped overprint layer keeps the ink exact and is what ships.

Typography reuses installed local packages: Sora for the wordmark, Noto Sans SC for interface and display text, LXGW WenKai Screen with platform Mincho/Song/Georgia fallbacks for summaries and prose, and IBM Plex Mono for dates and metadata. The home hero adds one display face, Shippori Mincho, self-hosted as a 33-glyph subset (see **Home hero geometry**). No UI dependency was added.

The About page's three rule tiers are worth stating because they are reused: a band boundary is a full-width rule, a row inside a band is a rule inset past the label track (`.a-about-page__rows li + li::before`, offset by `--about-label` plus its gap), and a section head is a rule cut to the width of its own words. A block of short facts is subordinated by width alone — `.a-about-page__inset` is capped at `34em` with a hairline above and below and nothing between its rows — because a border, fill or radius there would read as a widget on a page that has none. The hero carries the page's one large blue field and the colophon carries a single 5ch slab of the same colour: two aperture events at opposite scales, and no third.

Structural surfaces stay square. The search dialog uses a 2px radius and is the only public surface with a substantial shadow. Cover media, ledgers, article sections, taxonomy indexes, and navigation use spacing and one-pixel rules instead of elevation.

This snapshot describes the current branch code. It does not freeze unresolved identity decisions or override the canonical rules and open items in `DESIGN.md`.

## Isolated design studies

The `/design/` routes are clean-room comparison evidence, not production approval. The inspected references, extracted principles, rejected recommendations, and resulting decisions belong in [`design-research.md`](design-research.md). Any future promotion or revision must follow `DESIGN.md` and Morii's explicit approval.

## About activity calendars — 2026-09-08

The About page includes Morii's requested GitHub, Codex and Claude Code daily
calendars. They reuse the existing label axis, interface and data fonts, blue
tokens and section rules. No new global palette, typography or motion is defined.
Natural-year views begin at 2026 and always run from January through December.
A native select switches the enhanced
view, while the unenhanced HTML keeps every year visible. Below 46rem, each year
splits at a week boundary into two chronological halves. The two AI calendars
share fixed thresholds. Elapsed dates without records count as zero and use the
zero-value fill. Leading padding uses the same fill; trailing padding matches
the adjacent future outlines until the year has ended. The future-date legend
label is omitted. Only elapsed dates are interactive.
Daily tables provide a text alternative to colour and remain
available without JavaScript.

The three language routes were checked locally in both themes, with responsive
checks at 375, 390, 768, 1024 and 1440 CSS pixels. Keyboard selection and date
input returned the expected daily values. Built HTML keeps the year selector
hidden before enhancement, leaves every year panel visible and includes the
native disclosure tables. All three static About routes returned HTTP 200 from
a separate static server while the built Node server remained stopped. The
activity module is 1,526 bytes in this build and is absent from the home pages.
This is local implementation evidence, not deployment acceptance. Data
collection and interpretation are documented in
[`activity.md`](activity.md).

The date-state refinement adds the current year's recorded 30-day active count,
with active-day average, daily peak and date boundaries inside the disclosure.
Keyboard entry selects the latest recorded date. Mobile suppresses the duplicate
month label at the end of the first half; the second half retains that label.
The refinement passed `pnpm verify` (312 passed, one skipped, one TODO, zero
failures), followed by a fresh type check and build after the final presentation
adjustments. The date-state and statistics suite contains 13 passing tests.
The earlier bundle-size and stopped-server observations above belong to the
initial activity implementation, not a fresh deployment acceptance.

## Public footer — 2026-09-08

The public footer now uses one explicit type role per element. Its linked
Moriium wordmark is the closing visual anchor and cannot inherit metadata sizing
from sibling order. A ruled directory below it contains Home, Writing, Archive,
Categories, Tags, and About. A second group keeps all three language entries and
the current language's RSS feed available, including below the header's mobile
language breakpoint. A native anchor returns to the page top. Copyright and
rights text close the field on a separate baseline.

The footer remains static HTML and adds no client script, dependency, card,
shadow, gradient, or new palette value. Desktop uses the wide publication frame;
mobile collapses the directory to two link columns while preserving 44-pixel
targets and visible focus treatment.

## Native page transitions — 2026-09-08

Public routes opt into the browser's native same-origin cross-document view
transition. The root view uses the existing 220-millisecond fast timing and
Moriium ease-out curve, producing a short cross-fade while preserving ordinary
document navigation. Unsupported browsers keep the normal immediate navigation;
reduced-motion mode shortens the transition to an effectively instant swap.

This does not install Astro's client router, add a public script, persist page
state, or change the prerendered route contract.

## Implementation rule

When the implementation and `DESIGN.md` disagree, follow `DESIGN.md` and update this status record. Do not silently promote a prototype, generic skill recommendation, or reference-site pattern into Moriium's site-wide language.
