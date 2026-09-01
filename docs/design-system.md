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

Typography reuses installed local packages: Sora for the wordmark, Noto Sans SC for interface and display text, LXGW WenKai Screen with platform Mincho/Song/Georgia fallbacks for summaries and prose, and IBM Plex Mono for dates and metadata. No new font or UI dependency was added.

Structural surfaces stay square. The search dialog uses a 2px radius and is the only public surface with a substantial shadow. Cover media, ledgers, article sections, taxonomy indexes, and navigation use spacing and one-pixel rules instead of elevation.

This snapshot describes the current branch code. It does not freeze unresolved identity decisions or override the canonical rules and open items in `DESIGN.md`.

## Isolated design studies

The `/design/` routes are clean-room comparison evidence, not production approval. The inspected references, extracted principles, rejected recommendations, and resulting decisions belong in [`design-research.md`](design-research.md). Any future promotion or revision must follow `DESIGN.md` and Morii's explicit approval.

## Implementation rule

When the implementation and `DESIGN.md` disagree, follow `DESIGN.md` and update this status record. Do not silently promote a prototype, generic skill recommendation, or reference-site pattern into Moriium's site-wide language.
