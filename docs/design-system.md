# Moriium design system

> Status: **A structure selected and migrated to the primary production routes; final tokens still under review**. The global frame, home, Writing, archive, categories, tags, about, and article reader use A. This does not freeze the pending typography, color, spacing, media-width, or photography decisions below.

## Frozen product invariants

- Reading comes before decoration.
- Use editorial hierarchy, whitespace, and restrained lines.
- Do not introduce Twilight's visual system, giant centered heroes, gradient glow, glass cards, Bento blocks, rounded-card stacks, particle backgrounds, icon scatter, or routine scroll reveals.
- Do not shorthand Japanese minimalism as beige plus serif plus red dot plus vertical Japanese type.
- Maintain a readable line length, visible focus, semantic headings, sufficient contrast, keyboard operation, 24 CSS-pixel minimum web targets, and reduced-motion behavior.
- Design desktop and mobile together at 375, 390, 768, 1024, and 1440 CSS pixels.

## Selected direction under review

- Use A's modern sans-serif wordmark, twelve-column editorial index, horizontal rules, and restrained content framing.
- Treat the home as an editorial cover and site index, not as a literal welcome or giant centered slogan. Its expressive gesture is the oversized typographic masthead paired with a manually selected feature stage; all other motion stays quiet. The page order is: identity and purpose, featured content, recent writing, author/site activity, category and archive discovery, current work, RSS, and an about-page lead-in.
- Give Writing, Archive, Categories, Tags, and About stable independent routes. Primary navigation must never point to substitute home-page anchors in the selected direction.
- Keep search and light/dark appearance controls in the global header. Search opens a keyboard-safe native dialog; production search remains a lazily loaded static index with no server requests.
- Remove prototype-only explanation bars, decorative issue/location rails, and the compact three-cell site ledger from the public design.
- Use the home for practical orientation: a manual featured-content switcher spanning photography, travel, and technology; a compact author entry; truthful current-index counts; and an update calendar linked to the full archive. Do not auto-rotate featured content.
- Keep the interface content-rich through hierarchy and direct links. Do not imitate a dashboard: no rounded widget field, decorative statistics, icon cloud, or service status panel.
- Give long-form articles a quiet three-part desktop frame: outline, readable body, and compact context. Collapse it into normal document order on mobile.
- Show translation availability, active reading features, tags, and adjacent posts explicitly. Missing translations remain unavailable rather than duplicated.
- Test Noto Sans SC for Chinese body and list copy, Sora for Latin display text, LXGW WenKai Screen for Chinese article titles, second-level headings, and quotations, and IBM Plex Mono for dates, tags, and reading time.
- Keep mixed-script display text ordered as Sora, LXGW WenKai Screen, then Noto Sans SC so Latin remains geometric while Chinese gains a handwritten editorial accent.
- Serve exact-version, locally bundled WOFF2 subsets with `font-display: swap`; do not request third-party font services at runtime.

## Still pending acceptance

The following are intentionally undecided:

- final type scale and approval of the candidate font families;
- light and dark color tokens;
- content frame and reading measure;
- grid, side rail, and article-index pattern;
- spacing scale and rule hierarchy;
- photography cadence and caption alignment.
- exact homepage copy and which personal status details Morii wants public.

After acceptance, replace this section with exact tokens, component states, responsive behavior, and examples. Remove design-study routes before production launch unless Morii asks to preserve them privately.
