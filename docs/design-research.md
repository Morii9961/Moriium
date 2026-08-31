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

## 2026-08-31 reconstruction

Morii asked for a full reconstruction of the public frontend, referencing open-source blog projects on GitHub, and for a result that balances reader experience against a restrained Japanese-minimal character. The design question taken into the references was narrow: **how should a personal, trilingual, content-first blog compose its home and its article page without becoming either a dashboard or a typography exercise?**

### Sources actually inspected

| Source | What was actually inspected | Extracted principle | Moriium decision |
| --- | --- | --- | --- |
| [RRTiamo/spring_blogs](https://github.com/RRTiamo/spring_blogs) | The repository page and README in full: feature list, three-repository split, stack, directory layout, and licence status. Its screenshots are placeholders and it publishes no demo, so **no interface of it was seen and none could be copied.** | A personal site can express a person by exposing several kinds of accumulated material — writing, photographs, footprints, a "now" — rather than one reverse-chronological feed | The home page keeps a lead story, recent writing, a dated "now" section, and rediscovery routes. Everything else in that project's model is out of scope by `AGENTS.md`: comments, likes, replies, friend links, visitor feedback, maps, wish lists, and love records. Its stack was rejected outright — Next.js, Tailwind, GSAP, Lenis, and Framer Motion all conflict with the static, minimal-JavaScript reader path. The repository also carries **no licence**, so its code is all-rights-reserved and nothing from it may be reused even if it were wanted |
| [moeyua/astro-theme-typography](https://github.com/moeyua/astro-theme-typography) | The repository page and README, plus an attempt to read `src/styles/global.css`. Its typographic values live behind an UnoCSS theme indirection and were **not** legible, and the live demo could not be reached from this environment | A Chinese-language blog theme can take typography itself as the organising idea rather than as a delivery vehicle for a layout | Moriium's reading voice moves from sans to serif and the whole hierarchy is rebuilt on size and space. No value was taken from this project, because none was visible |
| Local `ui-ux-pro-max` index (`--domain ux`, `--stack astro`) | The typography and Astro-stack rows it returned | 65–75 Latin characters per line; a consistent modular scale; tokens in `:root`; `.astro` for static markup | The reading measure follows the document language for exactly this reason: 42em is a comfortable Chinese line and an uncomfortable English one. The stack advice matched what the repository already does |

Only two external projects were opened, per `DESIGN.md` section 14. Neither produced a layout, a component, a palette, a font list, or a line of code. The `/design/` study tree was left untouched.

### What the previous implementation got wrong

The reconstruction was not a matter of taste. The production site contradicted `DESIGN.md` in four measurable ways, and each is now fixed:

1. **The palette was not Moriium's.** `--accent: #365F6B` with neutral grey surfaces. Neither locked palette from section 4.1 appeared anywhere in `src/styles/base.css`.
2. **The typographic roles were inverted.** Section 5.1 assigns the article body to a serif; the site set it in Noto Sans SC and reserved the serif for a fallback slot it never reached.
3. **There was no width hierarchy.** Section 6 specifies five widths and says photography must not be forced into the text measure. The site had two, and photographs were forced into the text measure.
4. **Production shipped the design study.** Every public page imported `src/styles/prototypes.css` — 3,191 lines carrying concepts A, B, and C — so readers downloaded two rejected concepts on every request.

### Decisions taken

- **The measure rule** as the site's one structural gesture: a hairline exactly as wide as the unit it opens, so the width ladder becomes the page's visible structure and no section needs a card, a panel, or a shadow to show where it begins. Moriium Blue marks only the current or lead rule.
- **One serif across three languages.** LXGW WenKai Screen covers Chinese, kana, and Latin from one drawing, so the site reads in a single voice instead of three. Sora was dropped from the public shell.
- **A language-aware reading measure**, because a measure is counted in characters and the three languages disagree about how wide a character is.
- **The dashboard was removed.** The site-statistics panel and the update calendar were re-expressed as a typographic colophon: the author, the counts, and the recent dates are all still there, in one ruled block instead of three boxes and a grid of day cells. Section 3 rules out the form, not the information — but this does change an element Morii previously asked for, so it is flagged rather than assumed.
- **The section numbering was dropped.** `01 / 02 / 03 / 04` across home sections implied a sequence that does not exist. It survives in exactly two places where the order is real: the article outline, and the three site principles on the About page.
- **No motion was added.** The one new indicator, article reading progress, is a scroll-driven CSS animation with no JavaScript and no time-based movement.

### The gap the references could not fill

Neither reference, and no skill, could resolve the accessibility problem in `DESIGN.md` section 4: both palettes are surface colours, and on the dark canvas every one of them falls below 3:1, which makes a hairline drawn in brand blue invisible. The measured evidence, the proposed `--color-accent-ink` and `--color-accent-mark`, and the request for Morii's decision are recorded in [`design-system.md`](design-system.md). They are proposals, not a change to the constitution.

## Rejected automated recommendations

The local UI knowledge base suggested scroll storytelling, an accent-pink Swiss palette, Bodoni headings, GSAP scroll reveals, and a marketing-style conversion sequence. Those recommendations conflict with the personal-blog brief and the clean-room rules, so they were rejected. The implementation keeps only its twelve-column discipline, moderate information density, visible focus, 44-pixel touch-target, reduced-motion, readable-measure, and breakpoint guidance.

## Three studies

All three use identical content and the same metadata-safe derivative of `P7.jpg`.

- **A — 余白索引:** twelve-column editorial index, cool neutral surface, wide reading rhythm, and dates aligned to long horizontal rules.
- **B — 页边手记:** a structural side rail carries navigation and metadata; main content stays offset and quiet.
- **C — 折页长信:** broad horizontal folds connect introduction, photograph, article index, and long-form reading.

Morii selected **A — 余白索引** as the structural and modern sans-serif direction. B and C remain only as comparison history; identical-content comparison is no longer the active review method.

The first A revision was rejected as too empty and too close to a typography study. The second revision proved the desired content density, but its literal welcome copy and conventional two-column hero did not yet feel like a finished Moriium home. The third revision established the typographic masthead but still carried prototype explanation bars, a photograph-only feature, and a redundant three-cell ledger. The current review removes those elements, restores search and light/dark controls, turns the right side into a manual photography/travel/technology feature switcher, and adds author, current-index statistics, and update-calendar utilities. Writing, Archive, Categories, Tags, and About retain stable standalone routes. The article review retains its outline, reading facts, translation availability, tags, active-feature disclosure, and adjacent posts. This remains a clean-room prototype: no reference UI, CSS, copy, images, avatar, icon set, or brand assets were imported.
