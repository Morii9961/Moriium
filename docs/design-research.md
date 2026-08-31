# Design research record

Research is limited to principles. No reference layout, code, copy, photograph, font file, or brand asset is copied.

The canonical public visual/design constitution and design-Skills specification is [`DESIGN.md`](../DESIGN.md). This file records inspected evidence and historical study decisions; it is not an authority that can override `DESIGN.md`.

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
| [Momo](https://github.com/Motues/Momo) and [demo](https://momo.motues.top) | The live desktop home, its post entry, metadata row, and 404 page | A header wider than the text it sits above makes a page read as a publication rather than an application; accent colour can be reserved almost entirely for state | 版心 keeps a wide masthead over a narrow measure and holds its single accent for links, current state, and focus. Momo's serif welcome slogan, cover strip, icon metadata row, and blue were not reused |
| [astro-erudite](https://github.com/jktrn/astro-erudite) | The README's stated position: no UI framework, no CSS framework, fluid type and space scales, semantic colour tokens resolved by `light-dark()` | A blog theme can be systematic without a framework, and one token block can serve both themes | 版心 uses native CSS, a fluid modular scale, and a single `light-dark()` token block driven by the stored theme. Its Radix scales, Utopia generator, and subpost model were not adopted |
| [Retypeset](https://github.com/radishzzz/astro-theme-retypeset) | The README's typographic position and its credited influence, the [heti](https://github.com/sivan/heti) Chinese typography engine | Chinese text needs treatment Latin defaults do not give it: mixed-script spacing, full-width punctuation trimming, and its own leading | 版心 sets CJK at 1.85 leading with `line-break: strict`, applies `text-spacing-trim` and `hanging-punctuation` progressively, and selects Noto Serif JP for Japanese so shared han characters take Japanese glyph forms. No heti markup, class system, or stylesheet was imported |
| [Fuwari](https://github.com/saicaca/fuwari) | The README's feature model: banner imagery, page transitions, smooth animations, configurable theme hue | A useful counterexample: motion and a decorated banner move attention away from the text | Rejected. The direction has no banner, no page transition, and no animation beyond a 120ms colour change on links |
| [MDN: `light-dark()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark) | The function's requirement that `color-scheme` be set, and its Baseline 2024 status | A manual theme toggle can drive `light-dark()` by setting `color-scheme` per `[data-theme]` | The token block is written once instead of twice, and the existing `theme-init.js` contract is unchanged |

## Rejected automated recommendations

The local UI knowledge base suggested scroll storytelling, an accent-pink Swiss palette, Bodoni headings, GSAP scroll reveals, and a marketing-style conversion sequence. Those recommendations conflict with the personal-blog brief and the clean-room rules, so they were rejected. The implementation keeps only its twelve-column discipline, moderate information density, visible focus, 44-pixel touch-target, reduced-motion, readable-measure, and breakpoint guidance.

The second round, for the 「版心」 proposal, produced one further rejection. The Astro stack profile advises colocating component styles in each `.astro` file. 版心 keeps a single stylesheet instead: its width tiers, the drawn text block, and the annotation register are one system, and splitting them across component files would make the grid impossible to read in one place. The profile's token-in-`:root` and static-component guidance was followed. Its touch-target and focus-appearance guidance was followed and produced one concrete fix — the language switch labels were given a 24-pixel floor, since "EN" is narrower than that on its own.

## Three studies

All three use identical content and the same metadata-safe derivative of `P7.jpg`.

- **A — 余白索引:** twelve-column editorial index, cool neutral surface, wide reading rhythm, and dates aligned to long horizontal rules.
- **B — 页边手记:** a structural side rail carries navigation and metadata; main content stays offset and quiet.
- **C — 折页长信:** broad horizontal folds connect introduction, photograph, article index, and long-form reading.

Morii selected **A — 余白索引** as the structural and modern sans-serif direction. B and C remain only as comparison history; identical-content comparison is no longer the active review method.

The first A revision was rejected as too empty and too close to a typography study. The second revision proved the desired content density, but its literal welcome copy and conventional two-column hero did not yet feel like a finished Moriium home. The third revision established the typographic masthead but still carried prototype explanation bars, a photograph-only feature, and a redundant three-cell ledger. The current review removes those elements, restores search and light/dark controls, turns the right side into a manual photography/travel/technology feature switcher, and adds author, current-index statistics, and update-calendar utilities. Writing, Archive, Categories, Tags, and About retain stable standalone routes. The article review retains its outline, reading facts, translation availability, tags, active-feature disclosure, and adjacent posts. This remains a clean-room prototype: no reference UI, CSS, copy, images, avatar, icon set, or brand assets were imported.

## Second round — 「版心」

Morii asked for a public-site design begun from nothing, with the existing A direction set aside rather than revised. Research for this round was again limited to principles; no reference layout, CSS, component structure, copy, photograph, or brand asset was copied. Sources are recorded in the table above.

The result is specified in [`docs/design-hanshin.md`](design-hanshin.md) and implemented under `/design/hanshin/`. It does not replace the canonical constitution or the current production implementation: [`DESIGN.md`](../DESIGN.md) governs shared design rules, while [`docs/design-system.md`](design-system.md) records implementation status. No production route, stylesheet, or layout was modified. The two can be compared with identical content, since both are built from the same posts.

## Third round — 「界格」

Recorded separately from the 版心 round above; nothing in that record was changed.

Morii asked for the second direction to be finished to the same completeness as 版心, so the two can be experienced side by side with identical content. Research for this round was again limited to principles. No reference layout, CSS, component structure, copy, photograph, or brand asset was copied, and nothing was taken from the A study or from 版心.

| Source | What was actually inspected | Extracted principle | Moriium decision |
| --- | --- | --- | --- |
| The rendered 版心 study and the rendered A direction, side by side at 1440 and 375 | Both studies' own home and article pages, captured in a browser rather than reasoned about | A design that is only reasoned about is not a design that has been seen: 版心 read as sound in source and as a lonely column in a viewport | 界格 was built against renders from the first commit, and two faults found that way — a 640-pixel column in a 1440-pixel viewport, and 350-pixel voids between short blocks — set its opening rules |
| Traditional Chinese block-printed page structure, via the terms 版心 and 界格 themselves | The naming distinction between the text block of a page and the ruled lines that divide it | Two different organising ideas sit behind one tradition: framing the text, and dividing the page | The two studies were named for that pair and built to be genuinely different rather than variations. 版心 draws the block; 界格 divides the field |

The result is specified in [`docs/design-jiege.md`](design-jiege.md) and implemented under `/design/jiege/`. It replaces nothing: [`DESIGN.md`](../DESIGN.md) remains canonical, [`docs/design-system.md`](design-system.md) records the current production implementation, and no production route, stylesheet, or layout was modified.

### Rejected in this round

The Astro stack profile's advice to colocate component styles per `.astro` file was rejected again, for the same reason recorded for 版心: the width tiers, the field, and the annotation register are one system, and splitting them across component files would make the grid unreadable in one place. Its guidance on tokens in `:root`, static components, touch-target size, and focus appearance was followed.

One method note worth keeping. The first width check used `chrome --headless --window-size`, which laid the page out at a desktop width and cropped the image, so every study appeared to overflow at 375. Running the production home through the same capture showed the identical false failure, which is what identified the tool rather than the design. The check was redone through the DevTools Protocol with `Emulation.setDeviceMetricsOverride`, which drives the layout viewport and can also report `scrollWidth` — turning "does it overflow" into a measured number instead of a judgement of a screenshot.

## Fourth round — 「卷首」

Recorded separately; nothing above was changed.

Morii's verdict on the first two studies was that the typography and spacing were comfortable but the pages did not read as a person's site. With permission, the A direction was examined directly for the first time, and the comparison produced the brief for this round.

| Source | What was actually inspected | Extracted principle | Moriium decision |
| --- | --- | --- | --- |
| The A direction as built, at 1440 and 375 | Its home, article and writing index, rendered rather than read as source | A's advantage is not layout: it is that every section carries a sentence in Morii's voice, that the page has a narrative order, and that it shows personal content rather than derived counts | 卷首 takes those three as requirements. It does not take A's giant wordmark, numbered chapters, feature stage, or calendar |
| Book front matter as a structural convention | The foreword, the signature and date, the table of contents with dot leaders | Some structures cannot be filled in without a voice. A foreword has to say something; a section label does not | The home opens with a signed, dated foreword, and the contents list uses dot leaders. Both were chosen because they resist being filled with nouns |

The result is specified in [`docs/design-juanshou.md`](design-juanshou.md) and implemented under `/design/juanshou/`. The 版心 and 界格 studies were not modified.

### What the comparison actually showed

Worth recording, because it was a design failure and not a coding one. Both earlier studies were built as systems: a width system, a field of cells, tokens, breakpoints. Both passed every check that can be automated — no overflow at five widths, contrast above AA, no heading skips, working search. And both were mute, because every slot they offered could be filled with a category noun and still look finished.

A's slots could not. `最近文章` there is followed by 「新的排在前面，旧的可以从归档、分类和标签里找。」 The structure asked for a sentence, so a sentence got written. That is the transferable lesson: when a design should have a voice, choose a structure that fails visibly without one.

The corollary is the 近况 block. Showing `1 篇文章 · 1 个分类 · 2 个标签` is true, and on a site with one post it reads worse than saying nothing. The same fact told as 「最近写的是《从一张白纸重新开始》。」 is the same data with a person behind it.
