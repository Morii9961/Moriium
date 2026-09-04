# Moriium design-system implementation status

> Canonical authority: [`DESIGN.md`](../DESIGN.md). This document is a derived implementation and status record for the public site. It must not redefine Moriium's visual identity, tokens, accessibility floor, photography rules, motion philosophy, or design-Skills routing.

## Current production snapshot

The 2026-09-01 frontend branch implements the **Blue Aperture** public design layer, independent from the archived A/B/C study stylesheet:

- a compact publication header with a Sora wordmark, visible route state, and 44-pixel search, theme, and language targets;
- an asymmetric home built around one fixed 深渊蓝 Moriium identity aperture, two glyph-composed Japanese statements, selective outline overprint, true vertical marginal notes, route edges, a content map, and a work-in-progress register;
- independent Writing, Archive, Categories, Tags, and About routes that reuse the aperture as a spatial rule rather than a card component;
- long-form article pages with a narrow blue title band, 48rem prose measure, 76rem cover track, desktop outline and context rails, and single-column mobile reading;
- global static search and light/dark controls, with the generated index and search module still loading only after the reader opens search.

All production public routes import `src/styles/public.css`. The home adds `src/styles/public-home.css`, and the article layout adds `src/styles/public-reading.css`. `src/styles/prototypes.css` remains isolated to `/design/` comparison history.

### Current implementation values

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

Origins are reverse-solved from what the approved composition fixes, measured at 1536×1024: the solid runs begin hard against the left vertical note, which does not move, and the gap between the upper and lower groups is **15.6%** of the card height. The runs then run *to* the panel rather than through it — 見たものを's trailing `を` clears the panel edge by 5.8px and 未完のまま's trailing `ま` by 9.3px, close enough to graze it, far enough to stay out of it.

Judging that needs real glyph outlines, not `getBoundingClientRect`. A CJK em box is mostly empty — `を` inks 0.69 of its em and `。` only 0.27 — so box geometry overstates an intrusion by tens of pixels and reports collisions that are not there. Measure with canvas `TextMetrics.actualBoundingBox*` and map the ink rect through the run's own transform.

Two constraints fight the composition and win, both geometry rather than taste:

- **An ascending run's origin is its floor, not its ceiling.** Raising the number drops the whole run. This is the opposite of the intuition and the thing most likely to be got wrong when re-tuning, on phones especially, where the second run must straddle the panel's top edge and the outline run must clear the panel's register line.
- **`mix-blend-mode: difference` does not work for the outline runs.** A #9AA7BD hairline at 0.55 opacity differenced against the panel composites to roughly #525861, about 2:1 against the panel itself, so the outline disappears exactly where it is meant to turn light. The clipped overprint layer keeps the ink exact and is what ships.

Typography reuses installed local packages: Sora for the wordmark, Noto Sans SC for interface and display text, LXGW WenKai Screen with platform Mincho/Song/Georgia fallbacks for summaries and prose, and IBM Plex Mono for dates and metadata. The home hero adds one display face, Shippori Mincho, self-hosted as a 33-glyph subset (see **Home hero geometry**). No UI dependency was added.

Structural surfaces stay square. The search dialog uses a 2px radius and is the only public surface with a substantial shadow. Cover media, ledgers, article sections, taxonomy indexes, and navigation use spacing and one-pixel rules instead of elevation.

This snapshot describes the current branch code. It does not freeze unresolved identity decisions or override the canonical rules and open items in `DESIGN.md`.

## Isolated design studies

The `/design/` routes are clean-room comparison evidence, not production approval. The inspected references, extracted principles, rejected recommendations, and resulting decisions belong in [`design-research.md`](design-research.md). Any future promotion or revision must follow `DESIGN.md` and Morii's explicit approval.

## Implementation rule

When the implementation and `DESIGN.md` disagree, follow `DESIGN.md` and update this status record. Do not silently promote a prototype, generic skill recommendation, or reference-site pattern into Moriium's site-wide language.
