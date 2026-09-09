# Design research record

The canonical public visual/design constitution and design-Skills specification is [`DESIGN.md`](../DESIGN.md). This file records inspected evidence, extracted principles, and historical rejection decisions; it is not an authority that can override the constitution.

Research is limited to principles. No reference layout, code, copy, photograph, font file, or brand asset is copied.

## Visited sources

| Source | What was actually inspected | Extracted principle | Moriium decision |
| --- | --- | --- | --- |
| [SiteInspire — Minimal](https://www.siteinspire.com/websites/category/minimal) | The accessible minimal-category listing and its repeated project grid | Stable outer margins, a calm grid, and typography that identifies categories without decorative containers | All three studies use consistent frames, plain text navigation, and hairline structure; none uses cards or visual effects |
| [One Page Love — People and Blogs](https://onepagelove.com/people-blogs) | The listing description and linked People and Blogs site | Personal writing can feel human through clear editorial grouping rather than added product UI | Prototypes use Morii's titles, dates, summaries, and one real photograph instead of generic marketing copy |
| [One Page Love — Dead Simple Sites](https://onepagelove.com/dead-simple-sites) | The listing and linked Dead Simple Sites index | Remove scroll-jacking, animated filler, and excessive storytelling; make hierarchy carry the page | No scroll reveal, parallax, gradient glow, glass, or motion was introduced |
| [Dead Simple Sites](https://deadsimplesites.com/) | Its neutral, line-led index with strong negative space | A compact manifesto and repeated index can coexist without a giant hero | Scheme A uses a restrained introduction followed by a ruled article index; its fixed gallery layout was not copied |
| [People and Blogs](https://peopleandblogs.com/) | Its current editorial organization and personal tone | Preserve authorship and context, but do not inherit a reference's palette or typographic fashion | Moriium keeps an explicit personal introduction and article summaries, while avoiding that site's purple palette, sidebar, and large serif treatment |
| [Land-book](https://land-book.com/) | The current website index, content-type switcher, category rail, filters, and repeated project entries | A restrained page can expose several discovery routes without turning the opening into a dashboard | A keeps its editorial opening, then exposes writing, categories, archive, and RSS as clearly labelled routes; Land-book's commercial gallery cards and filter UI were not copied |
| [Eidolon](https://eidolon-bubble.m4tum1n4.chatgpt.site/) | The complete desktop home: first-viewport identity, personal facts, discover cue, journal, projects, and private-vault sections | A welcome page can feel atmospheric and personal while the next screen immediately proves that the site contains real destinations | A now combines a concise welcome, Morii's subject/language/update ledger, one lead story, recent writing, current work, discovery routes, and an about section; Eidolon's mirror artwork, wording, serif hero, and vault treatment were not copied |
| [FlecBlog repository](https://github.com/talen8/FlecBlog) and [live blog](https://blog.talen.top/) | README, live desktop home, article list, metadata, author rail, category counts, tags, article facts, table of contents, license, and adjacent-post navigation | “Complete” means that common reading and rediscovery paths are visible, not that the page must run every possible service | A adopts visible article metadata, category counts, site index, article outline, translation state, tags, and adjacent-post links. Search, comments, login, analytics, dynamic moments, database, and sidebar widgets remain outside Moriium V1 |
| [InternalBeyond](https://github.com/Sui-IB/InternalBeyond) | README feature model and the actual `InternalBeyond.html` welcome overlay, persistent navigation, introductory copy, primary actions, and atmospheric home state | A substantial welcome should establish whose space this is and offer immediate ways to enter it | A gains a real welcome section with identity, purpose, two entry actions, and a lead story. InternalBeyond's glass effects, ambient simulation, game framing, global player, and application modules were rejected |
| [AstroPaper](https://github.com/satnaing/astro-paper) and [demo](https://astro-paper.pages.dev/) | Repository features and the live home hierarchy: introduction, RSS, featured posts, recent posts, and all-posts route | A lightweight static blog still needs obvious content and subscription pathways | A keeps RSS and the full archive visible and distinguishes a lead story from recent writing; search and the theme's styling were not copied |
| [Retypeset](https://github.com/radishzzz/astro-theme-retypeset) and [demo](https://retypeset.radishzz.cc/) | Live Chinese home and extended-Markdown article, including dates, reading time, captions, admonitions, code copy, Mermaid, repository cards, and click-to-load video | Advanced reading support should feel native to the article rather than like a separate product layer | A's article page reserves stable places for reading metadata and states which advanced modules are active; the production reader continues to load those modules only when needed. Retypeset's paper-book styling and implementation were not copied |
| [Vellume](https://github.com/TimFang4162/astro-theme-vellume) and [demo](https://timfang4162.github.io/astro-theme-vellume/) | Live home, discovery model, article facts, sticky outline, translation-independent metadata, tags, and adjacent navigation | Long-term writing benefits from multiple rediscovery paths and an article page that keeps navigation close without competing with the prose | A adds a structured discovery section and a three-part reading grid. Series, search, reactions, view counts, and comments remain out of scope |
| Moriium Gallery accepted local build | Its home-to-chapter routing, persistent global entry points, active navigation state, and responsive menu hierarchy | A visually expressive home remains usable when every primary destination has a stable URL and the home is not forced to contain every view | A now routes Writing, Archive, Categories, Tags, and About to independent pages. The Gallery's full-screen carousel, photography-first shell, side dialog, palette, and motion were not reused |
| Morii-supplied utility references and annotated A screenshot | The red-box removal notes plus author identity, site-statistics, and activity-calendar examples | A practical personal home should expose author, scale, recency, search, and appearance without becoming a generic dashboard | Prototype-only bars and the three-cell ledger were removed. A adds a ruled author/statistics/activity section, restores search and theme controls, and changes the photograph-only feature into a manual multi-topic switcher. The references' rounded cards, cyan palette, icon set, avatar, exact metrics, and dense dark dashboard were not copied |
| [spring_blogs](https://github.com/RRTiamo/spring_blogs) | Repository overview, declared content model, public/private architecture, feature list, motion stack, responsive targets, and privacy notes | A personal blog can frame writing, photography, travel, and unfinished notes as one lived archive instead of presenting a narrow chronological feed | The production home now acknowledges writing, subjects, and work in progress as parts of one archive. Its database reader path, social features, relationship modules, GSAP/Lenis stack, and unlicensed source were not copied |
| [fine print Magazine](https://www.fineprintmagazine.com/) | The live desktop issue index, including its quiet outer frame, oversized issue field, edge labels, and restrained secondary navigation | One dense field can carry identity while the surrounding frame stays calm | Moriium uses one 深渊蓝 aperture as a fixed identity field. It does not copy fine print's grid, issue covers, type treatment, or publication identity |
| [La Perruque](https://la-perruque.org/) | The live desktop archive and the way its unusually long printed object shapes the digital composition | A site can derive its layout from the nature of its material instead of applying a generic blog template | Moriium derives an aperture from photography and observation, then changes its width and position by page type. La Perruque's specimen format, colors, typography, and interaction were not copied |
| [Spirit Level](https://www.spiritlevel.works/en) | The live desktop landing page, bold blue stage, edge controls, and instrument-led visual metaphor | One product-specific mechanism can carry identity more clearly than many decorative motifs | The aperture becomes Moriium's single recurring mechanism. Spirit Level's tool metaphor, interface, copy, motion, and exact blue were not copied |
| [Lipi](https://github.com/thelocalhoststudio/lipi) | Repository purpose, navigation model, 68-character reading measure, typography roles, timeline archive, static search, and minimal-client-JavaScript policy | A publication can feel complete with a short global navigation, a constrained prose column, and a dense year archive; it does not need sidebar widgets or a dashboard home | Moriium keeps its own blue palette and multilingual fonts, but uses a 48rem reading measure, a year-led archive, and a quiet publication shell. Lipi's parchment, terracotta, paper texture, and exact typography were rejected |
| [astro-whono](https://github.com/cxro/astro-whono) | Repository overview, two-column writing model, separated content types, page-specific style entry points, local-only admin boundary, and self-hosted CJK font strategy | Public reading styles should remain independent from the authoring interface, and CJK typography needs an explicit local loading plan | Production public routes now load `public.css` instead of the prototype study stylesheet. The existing locally installed CJK fonts are reused; astro-whono's two-column shell, admin console, font files, and page layouts were not copied |
| [Revista](https://github.com/erfianugrah/revista-3) | Photography/blog scope, static asset model, theme behavior, compositor-only lightbox motion, image delivery notes, and editorial gallery grid description | Photography needs a wider track than prose and controls should retreat when media becomes the subject | Moriium retains separate text, media, and gallery widths and gives cover photography a 76rem track. Revista's masonry rules, smart-crop defaults, Tailwind structure, and custom lightbox code were not copied |
| Morii-supplied Japanese title-sequence stills and approved Moriium mockup | Character-level rhythm: two readable phrases rise and fall through uneven scale, solid and outline forms, true vertical notes, and a deep-blue editorial field | Typographic tension should come from composed glyph relationships rather than rotating an intact line; occlusion can be strong when the sentence remains recoverable | The production home fixes the Japanese phrases `見たものを記す。` and `未完のまま残す。` as its visual title. Each glyph receives its own scale, baseline, rotation, and ink treatment; only selected outline glyphs reappear through the blue aperture. The supplied title-sequence palette, typeface, chromatic distortion, and exact frames were not copied |

### 2026-09-07 — article content page

| Source | What was actually inspected | Extracted principle | Moriium decision |
| --- | --- | --- | --- |
| [W3C clreq](https://www.w3.org/TR/clreq/) | Sections 2.1.3, 5.1 and 5.3.1 of the published Requirements for Chinese Text Layout | No more than a quarter of a Han character of space between Han text and the Western text set into it; Chinese emphasis is an emphasis mark, not an italic | Inline code, inline mathematics and `<kbd>` carry `margin-inline: 0.25em` inside a Chinese line. `<em>` in Chinese and Japanese drops the synthetic oblique; Morii chose weight over the emphasis mark |
| [heti 赫蹏](https://github.com/sivan/heti) | `lib/_variables.scss`, `lib/_base.scss`, `lib/_heading.scss`, `lib/_inline.scss` | A 42em Chinese measure; small positive tracking on Han body text and larger positive tracking on Han headings; a container that zeroes its first and last child's margins; `<em>` set as weight because Chinese has no italic | The 48rem measure sets 41 Han characters per line and stands. Body text takes `letter-spacing: 0.02em`, reset on the inline elements that are almost always Latin. **Heti's positive heading tracking was not adopted**: Moriium's display type is tracked tight across the whole site, and Morii chose −0.02em as the limit where Han strokes stop touching |
| [Retypeset](https://github.com/radishzzz/astro-theme-retypeset) | `src/styles/markdown.css` in full | A CJK-aware Astro theme built on heti: `scroll-margin-top` on every heading, `break-all` for Latin inside CJK links and code, compressed spacing between two adjacent blocks of the same kind | Headings take `scroll-margin-top: 5rem`; inline code takes `word-break: break-all`. Its paper styling, its `*　*　*` rule and its justified paragraphs were not taken |
| [Tailwind Typography](https://github.com/tailwindlabs/tailwindcss-typography) | `src/styles.js` in full | The exhaustive element list a prose stylesheet has to cover, and a spacing model of explicit per-element margins with `> :first-child` / `> :last-child` and `h2 + *` resets rather than one universal sibling rule | The reading stylesheet now declares spacing per element and closes both ends of the flow. Its palette, its `prose` class model and its size tiers were not taken |
| [Starlight](https://github.com/withastro/starlight) | `packages/starlight/src/components-internals/TableOfContents/starlight-toc.ts` | Observe the article's block elements, not its headings, and intersect them against a thin band below the top of the viewport; rebuild the observer after a resize | The outline's active-section module follows this shape in about 800 bytes. Starlight's heading-wrapper markup and its component API were not taken |
| [MDN — `text-spacing-trim`](https://developer.mozilla.org/en-US/docs/Web/CSS/text-spacing-trim) | The property reference and its baseline status | CJK punctuation compression is the browser default but is not Baseline and depends on font `halt`/`chws` features | Not relied on. The quarter-em rule above is written by hand instead |
| [Josh Comeau — Full-Bleed Layout](https://www.joshwcomeau.com/css/full-bleed/) | The article in full | Named grid columns let a child escape a constrained prose column without negative margins | Evaluated and **not adopted**. A sticky outline in the left margin and a symmetric breakout cannot both occupy that margin at Moriium's widths; the prose column stays centred and the cover keeps the gallery tier |
| [AstroPaper](https://github.com/satnaing/astro-paper) | `src/layouts/PostLayout.astro` | A post page can declare itself to aggregators with schema.org `BlogPosting` | Adopted with Morii's approval: static JSON-LD, no request, no reader identity. Its layout, theme and card styling were not taken |
| [Expressive Code — style overrides](https://expressive-code.com/reference/style-overrides/) | The style-overrides reference | A code block's chrome can be bound to a host site's own CSS custom properties while a real theme still supplies the syntax colours | The block's surface, border, gutter, tab bar, type and padding are bound to Moriium tokens; `github-light` / `github-dark` remain only as token palettes |

The article page rebuild that used this evidence took seven decisions from Morii on 2026-09-07: −0.02em tracking on the Chinese title with a 1.12 line height; weight rather than an emphasis mark for Chinese `<em>`; removal of the panel naming which reader modules had loaded; tags moved to the end of the article and the visible language list removed entirely, with `hreflang` kept in the head; no justified paragraphs; `BlogPosting` structured data admitted; and one opening whose height is set by its content whether or not the post has a cover.

## Rejected automated recommendations

The local UI knowledge base suggested scroll storytelling, an accent-pink Swiss palette, Bodoni headings, GSAP scroll reveals, and a marketing-style conversion sequence. Those recommendations conflict with the personal-blog brief and the clean-room rules, so they were rejected. The implementation keeps only its twelve-column discipline, moderate information density, visible focus, 44-pixel touch-target, reduced-motion, readable-measure, and breakpoint guidance.

The 2026-09-01 redesign query repeated the same scroll-storytelling, pink-accent, Bodoni, and GSAP recommendations. They were rejected again. Its Astro-specific guidance—static `.astro` structure, build-time routes, standard links, and a complete no-JavaScript reading path—matched the repository contract and was retained.

## 2026-09-01 production redesign

The first production pass remained too close to the selected A study: a quiet introduction, a lead story, and a ruled article list. Morii rejected that continuity and asked for a new idea. The replacement direction is **Blue Aperture**.

- **Concept:** the aperture comes from photography, observation, and selective memory. It holds Moriium's fixed identity, then returns the rest of the site to quiet paper-like space.
- **Color:** the canonical 雾霾蓝 / 深渊蓝 palettes remain unchanged. 深渊蓝 appears as one solid field rather than a decorative accent scattered across cards.
- **Type:** Sora stays in the wordmark; Noto Sans SC now carries display headings and interface text; LXGW WenKai Screen is reserved for summaries and long-form reading; IBM Plex Mono carries dates and small data. This creates a sharper public face without sacrificing reading warmth.
- **Home:** the opening is no longer a conventional hero followed by a blog list. Two fixed Japanese phrases are composed glyph by glyph around the deep-blue Moriium identity aperture: scale, baseline, and slight rotation vary within each sentence, while selected outline glyphs cross the aperture and the solid forms remain behind it. True vertical notes hold the outer whitespace. Mobile keeps the same sentence-level recognition in a separate composition, with the second line partially masked by the dominant aperture; recent writing still begins below the four route edges.
- **Directories:** Writing, Archive, Categories, and Tags share the aperture idea but not one repeated card component. Article rows fill with blue from one edge, archive years act as large anchors, and tags form a staggered typographic field.
- **Reading:** the article title sits against a narrow blue aperture band. A 48rem prose track stays readable between an outline and context rail; chapter headings and the adjacent-post ending use the same blue as structural punctuation.
- **Motion:** only direct hover, focus, theme, and arrow feedback animates. No scroll reveal, parallax, route choreography, GSAP, or new dependency was added.

The design deliberately rejects the local UI index's pink Swiss palette, Bodoni headings, conversion-page sequence, and scroll storytelling. It keeps only its accessibility and responsive guidance: semantic links, visible focus, reduced motion, readable measures, and touch-safe controls.

The branch was inspected in the real browser at 375, 390, 768, 1024, 1280, and 1440 CSS pixels. Home and article routes had no document-level horizontal overflow. Search, theme, and visible language controls measured 44 by 44 pixels; the language switch stays hidden at the narrow breakpoints. Light and dark article openings retained the aperture hierarchy and readable facts.

## Three studies

All three use identical content and the same metadata-safe derivative of `P7.jpg`.

- **A — 余白索引:** twelve-column editorial index, cool neutral surface, wide reading rhythm, and dates aligned to long horizontal rules.
- **B — 页边手记:** a structural side rail carries navigation and metadata; main content stays offset and quiet.
- **C — 折页长信:** broad horizontal folds connect introduction, photograph, article index, and long-form reading.

Morii selected **A — 余白索引** as the structural and modern sans-serif direction. B and C remain only as comparison history; identical-content comparison is no longer the active review method.

The first A revision was rejected as too empty and too close to a typography study. The second revision proved the desired content density, but its literal welcome copy and conventional two-column hero did not yet feel like a finished Moriium home. The third revision established the typographic masthead but still carried prototype explanation bars, a photograph-only feature, and a redundant three-cell ledger. The current review removes those elements, restores search and light/dark controls, turns the right side into a manual photography/travel/technology feature switcher, and adds author, current-index statistics, and update-calendar utilities. Writing, Archive, Categories, Tags, and About retain stable standalone routes. The article review retains its outline, reading facts, translation availability, tags, active-feature disclosure, and adjacent posts. This remains a clean-room prototype: no reference UI, CSS, copy, images, avatar, icon set, or brand assets were imported.

## 2026-09-07 About-page study

Morii asked for a broad survey of how other blogs build an About page before rebuilding Moriium's. This section records what that survey found and what was done with it.

**Provenance, stated plainly.** The survey was run as an automated multi-agent sweep with web access. Roughly ninety pages were fetched across five slices: static-site theme ecosystems (Hugo, Jekyll, Zola, Eleventy, Gatsby), Chinese and Japanese personal blogs and their theme contracts, the Astro ecosystem, small independent publications, and colophon pages. **An independent citation-verification pass was planned and did not complete**, so the individual page-level claims below have not been re-checked by hand. One concrete error was caught and is worth recording as a caution: an agent reading this repository through its public GitHub mirror described `prototypes.css` (`.concept-a`, the archived `/design/a/about` study) as though it were the production stylesheet. Every mapping onto Moriium was therefore re-derived against `src/styles/public.css` before implementation. Treat the source list as leads, not as verified evidence, until that pass runs.

| Slice | Representative sources actually fetched | Extracted principle | Moriium decision |
| --- | --- | --- | --- |
| Theme ecosystems | Chirpy `_tabs/about.md`, Beautiful Jekyll `aboutme.md`, Zola serene, eleventy-base-blog, al-folio `_pages/about.md` and a live al-folio site, Hugo Stack's `index.md`/`index.zh.md`/`index.ja.md`, PaperMod, Minimal Mistakes | No generator has ever proposed a content model for an About page; the shipped placeholder is empty, lorem, or a joke. Where a template does impose structure it is academic and institutional — an address block, a circular `prof_pic.jpg`, and three booleans | A thin About is the ecosystem's default outcome, not a Moriium failure. That justified writing a fixed composition of named sections instead of adding paragraphs to a free-form page. Every literal al-folio field was rejected |
| CJK personal blogs | Hexo Butterfly/Stellar/Volantis theme contracts, Hatena's about form, and live 关于 pages including xaoxuu, zhheo, kawabangga, hentioe, yunyoujun, kuangyichen, anheyu, ruanyifeng, jxck, baldanders, mizdra, catnose, lacolaco | 关于 covers two subjects — the person and the site as an object with its own life — and the strongest pages separate them. The site's dated construction history is editorial content, not a footer credit | Morii chose not to publish a personal section, so the page became site-only, which is the cleaner half of that split. The dated record was adopted as the section that is already long on day one and does not depend on post count |
| Astro ecosystem | AstroPaper live and `src/pages/about.astro`, Retypeset live plus `markdown.css` and its per-language `src/content/about/`, Fuwari, Cactus, astro-pure, Frosti, astro-nano, and Astro-built personal sites | Authorship should split three ways: the page file owns the frame and band order, per-language content owns the prose. A layout-owned `h1` destroys compositional control. A measure set in `em` lands correctly in three scripts from one value | The band order lives in the page file. The measure is now set in `em` on prose rather than on the column. Retypeset's `:is(:lang(zh),:lang(ja),:lang(ko))` scoping is noted for a future typography pass and was not adopted in this change |
| Independent publications | Klim Type Foundry, Typotheque, Triple Canopy, The Public Domain Review, Fitzcarraldo Editions, Craig Mod, e-flux, Dinamo, The Creative Independent, Offscreen, The Serving Library, Distill, n+1, gwern | A rule is a measuring instrument and its length is the statement: full-width means a band boundary, inset past the label column means a row inside a band, cut to the width of a word means that word is a label. One blue field, cut to the type rather than to the section; a colour appearing in three values stops signifying | The three-tier rule system is the main structural import. Moriium already had the outer and label tiers; the inset row rule was missing and is now implemented as a pseudo-element offset by the label track. The hero keeps the page's one large blue field and the colophon carries a single 5ch echo — two blue events at opposite scales |
| Colophons | Jay Perry, Ethan Marcotte, Shady Characters, Daring Fireball, Manuel Moreale, tempertemper, qubyte, BurgeonLab, Tony Burns, Scott Killen, Zinzy Waleson Geene, Lucas K.T. Lee, the IndieWeb colophon wiki, Derek Sivers' `/now` and `/uses` | A subordinate block inside prose is made by subtracting width, never by adding a container. Organise typography by role rather than by font file, and order it before the build. A refusal reads as a position only when the principle is the heading and the exclusion is its consequence | All three adopted. The fact block sits at `34em` inside the band with one hairline above and below and no rules between rows. The colophon is three role subsections, then the build, then the refusals written as two sentences rather than seven absent features. `/now` was rejected as inherently personal; `/uses` was rejected as an inventory of nouns without reasons |

### Rejected

- Site-statistics widgets in every form. `blog.anheyu.com/about` renders `0 文章 / 8 标签 / 10 分类 / 128 评论`; Volantis welds `sitepv`/`siteuv` view counters to the honest fields; Hatena's form exposes article-count and posting-streak toggles but has no field for what the blog is about. Moriium has very few posts and bans counters outright, so no count reaches this page.
- A visible freshness stamp. Minimal Mistakes prints `Updated May 27, 2022` beside a 2026 copyright and al-folio's demo news feed stops at January 2016. A dated history is honest when it is old; a "last updated" badge is a decay indicator installed by its own author.
- Personality inventories and skill walls — MBTI percentages, game-version lists, scrolling tool-icon grids, career timelines. The most-copied Butterfly 关于 layout is a hiring portfolio, and Moriium is explicitly not one.
- Monetisation and growth furniture: donor totals, tip jars, sponsor buttons, star-history charts, newsletter calls to action, and mid-page contract-work pitches.
- Live third-party requests on the page. Fuwari and Cirry both call the GitHub API from their About page so its content changes without the author writing anything.
- Mandatory-avatar blogrolls and reciprocal-exchange machinery.

### About activity addition — 2026-09-08

Morii explicitly requested three daily calendars for GitHub, account-side Codex
activity and retained local Claude Code logs. This adds author activity to the
About page; the earlier rejection of reader counters and analytics still applies.
Collection timestamps disclose snapshot age and do not imply a page update.

| Reference inspected | Extracted principle | Decision |
| --- | --- | --- |
| [GitHub contribution calendar schema](https://docs.github.com/en/graphql/reference/users#contributioncalendar) | Daily dates and contribution counts are sufficient for a calendar. | Collect only the official daily aggregates; make no reader-side GitHub request. |
| [Codex app-server](https://developers.openai.com/codex/app-server) | The account usage method keeps authentication inside the installed CLI. | Use the server-side daily buckets for every Codex surface without exposing credentials to the repository. |
| [ccusage JSON output](https://ccusage.com/guide/json-output) | Reuse maintained local-log parsing rather than publishing raw session data. | Pin the external CLI to 20.0.20 for Claude Code and local Cowork, then export a strict daily-value allowlist. |
| Current Moriium About page and `DESIGN.md` | Keep the established label axis, restrained rules and canonical blue family. | Use one shared static component; no copied upstream UI, new visual system or animation. |

An earlier iteration used a simpler display rule: every absent or not-yet-reached
date was shown as zero, so that chart did not distinguish missing records. Both
AI charts keep the same thresholds for cross-source comparison: an empty top Codex
level reflects the current distribution rather than a styling defect. Natural-year
calendars begin at 2026 and always include January through December. The mobile
calendar splits into consecutive halves instead of requiring horizontal scrolling.
A native year selector appears
only after enhancement; without scripts, every year and disclosure table remains
available. The About-only module also adds pointer, keyboard and date-input
inspection. Validation is recorded in [`design-system.md`](design-system.md).

### Earlier About implementation snapshot

The production About page at `/{zh,ja,en}/about/` keeps its directory hero — Morii chose to retain the large title — and therefore spends the page's single display step there. Below it the statement drops to a second voice, and five bands run on one shared label axis: what the archive keeps, a dated record, the colophon, the site principles, and subscription and contact. Measured on the running site at 1440 pixels, every label sits at x=58 and every piece of content at x=202, in both grid bands and prose. The dated record stands on the same axis grammar as the archive index. Contact is one annotated line per channel stating its expectation rather than an icon row, and it names corrections by pull request, which is the only reader-response route available to a site that has banned comments and accounts permanently.

### Activity date states and statistics refinement — 2026-09-08

Morii approved replacing that zero-fill rule after reviewing the running About
page at `http://127.0.0.1:4176/zh/about/#about-activity-title`. Hidden cross-year
padding left stepped corners, and future dates looked like recorded inactivity.
The approved refinement retains full-year alignment with faint outlined padding
and future cells, dotted missing cells, and filled explicit zeroes. No global
identity tokens or animation change. The current year adds a 30-day active count;
active-day average, peak and calculation notes stay inside the daily disclosure.
The About page prose remains unchanged.

Morii refined this decision after viewing the preview: elapsed dates without
records now count as zero, and cross-year padding uses the ordinary zero fill.
The missing-data legend is removed. Future dates retain their outlined state;
padding remains decorative and does not enter the selected year's statistics.

A further preview correction makes trailing padding match the adjacent future
region's outline while the year is in progress; leading padding remains filled.
Morii also removed the future-date legend label. Date interaction and statistics
still exclude future and padding cells.

### Footer navigation rebuild — 2026-09-08

| Reference inspected | Extracted principle | Decision |
| --- | --- | --- |
| The current public footer at `1b7c4e8` | A removed identity note left the wordmark as the identity block's final paragraph, so a more specific legacy `:last-child` rule reduced it to metadata size. | Remove positional typography selectors. Give the wordmark, labels, navigation, and legal text explicit roles. |
| The public header and route set | The footer omitted Home and Tags, and the language switch disappears below 48rem. | Keep the footer concise, but include all six public routes, RSS, and a language switch that remains available on mobile. |
| `DESIGN.md` footer, type, colour, and spacing rules | The footer should conclude the publication through hierarchy, whitespace, one identity field, and quiet rules rather than cards or extra interface chrome. | Retain the flat Moriium Blue field, enlarge the wordmark, and arrange the remaining links as a two-row editorial directory with a native back-to-top link. |

No external site was used for this change. The visual decision came from the
canonical Moriium rules, the current rendered defect, and the site's existing
navigation contract.

### Native page transitions — 2026-09-08

| Reference inspected | Extracted principle | Decision |
| --- | --- | --- |
| [Astro view transitions](https://docs.astro.build/en/guides/view-transitions/) | Astro 7 supports browser-native cross-document transitions without changing an MPA into a client-routed SPA or adding JavaScript to page load. | Keep Moriium's public routes as ordinary static documents and do not add `ClientRouter`. |
| [MDN `@view-transition`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@view-transition) | Both same-origin documents opt in with `navigation: auto`; unsupported browsers retain normal navigation. | Apply the platform transition to the root snapshot, use the existing fast timing and easing tokens, and reduce the animation to an effectively instant swap when reduced motion is requested. |

The transition is a restrained cross-fade. It introduces no direction metaphor
that could conflict with direct links, browser history, or language changes.

### About friend links — 2026-09-09

Question: how should a small friend list be maintained and presented within About?

| Reference inspected | Extracted principle | Moriium decision |
| --- | --- | --- |
| [Astro Pure friend-link documentation](https://astro-pure.js.org/docs/integrations/links) | Keep link records separate from the page; groups and a friend feed are optional additions. | Use one local list for all three languages. |
| [vhAstro-Theme source README](https://github.com/uxiaohan/vhAstro-Theme#-特色页面) | A TypeScript data file can hold names, URLs, avatars, and descriptions without an API. | Use typed local data, rendered at build time. |
| [Butterfly page documentation](https://butterfly.js.org/posts/dc584b87/) | Local data and optional grouping support manual link curation. | Preserve authored order; defer grouping until real content needs it. |

The implementation uses the existing About band, heading, indentation, fonts,
and semantic colors under `DESIGN.md`. Links are text rows with a visible domain
and optional translated description. No upstream code or assets are copied.
No dependency, avatar request, friend feed, submission form, or runtime fetch is
introduced. An empty list displays a short localized sentence.
