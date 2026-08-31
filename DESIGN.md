# Moriium — DESIGN.md

> **Status:** canonical visual/design constitution for the Moriium public experience.
>
> **Scope:** Moriium public website, articles, archives, photography surfaces, and shared public-facing components. The CMS/Admin may reuse tokens, but it is a separate utilitarian product and must not force dashboard aesthetics onto the public site.

---

## 0. Authority and precedence

When visual instructions conflict, use this order:

1. Morii's current explicit instruction.
2. A page-specific design decision explicitly approved by Morii.
3. This `DESIGN.md`.
4. Repository `AGENTS.md` product/engineering constraints.
5. Generic design skills, design-system databases, reference websites, and third-party component libraries.

**Generic skills never override Moriium's locked identity.** A design skill is a consultant, not the brand owner.

Before making a meaningful visual change, read this file. If a requested change appears to contradict a locked rule, explain the conflict before changing the rule.

---

# 1. Product and brand thesis

Moriium is a **content-first personal publication and archive** for writing, photography, projects, traces, and things accumulated over time.

It should feel:

- quiet, but not anonymous;
- restrained, but not sterile;
- editorial, but not imitative;
- personal, but not scrapbook-like;
- modern, but not SaaS-like;
- designed, but able to survive years of continued use.

The intended impression is closer to **a small independent publication / personal archive** than a web application dashboard.

A useful working phrase is:

> **记录与留白**

The site should carry a sense of memory and continuity. It must not look like a theme that could be rebranded for any random blog by replacing a logo.

---

# 2. Locked visual principles

## 2.1 Content before chrome

Typography, imagery, pacing, whitespace, and hierarchy carry the design. Decorative UI chrome is secondary.

Do not create visual noise merely to prove that the page was "designed".

## 2.2 Moriium Blue is identity, not garnish

Blue is Moriium's primary recognition color. The site must not collapse into pure black/white/gray minimalism.

At the same time, Moriium Blue must be used with discipline. It should appear where it communicates identity, hierarchy, focus, state, or interaction — not sprayed across every surface.

## 2.3 Whitespace is structural

Whitespace is not empty space to be filled. It establishes rhythm, separates editorial units, protects photography, and gives long-form text a calm reading cadence.

## 2.4 Photography remains photography

Site styling must support Morii's photographs rather than recolor, obscure, or compete with them. Photographs can become visually dominant when the content calls for it.

## 2.5 Restraint beats novelty

A single memorable gesture is better than five fashionable effects. If one area is visually bold, surrounding areas should become quieter.

---

# 3. Explicit anti-goals

Moriium should **not** drift toward any of the following by default:

- generic "minimal blog" styling: white page + black text + thin gray borders + interchangeable cards;
- SaaS dashboard composition;
- card soup / every section inside a rounded rectangle;
- default Bento Grid as a design crutch;
- giant hero typography with little editorial purpose;
- excessive pill controls;
- strong glassmorphism, blur, neon glow, chrome gradients, or luminous blue effects;
- large decorative gradients used as identity replacement;
- purple/blue AI-default gradients;
- excessive shadows or floating surfaces;
- animation on every element;
- perpetual ambient motion;
- copied Awwwards effects that reduce readability or make the page fragile;
- copying Momo, Moriium Gallery, or any reference site component-for-component;
- visual changes made only because a generic Skill recommends them.

Do not turn "anti-AI-slop" into another recognizable template aesthetic. Moriium needs its own grammar.

---

# 4. Color system

## 4.1 Canonical Moriium Blue palettes

The following values are **locked canonical brand tokens**. They come from Morii's approved theme card and must not be silently replaced by generic blue palettes proposed by third-party skills or reference sites.

### Dark mode — 深渊蓝

| Role | Token | Hex |
| --- | --- | --- |
| 主色 / Primary | `--moriium-blue-primary` | `#162043` |
| 强调 / Accent | `--moriium-blue-accent` | `#1F2C6A` |
| 高亮 / Highlight | `--moriium-blue-highlight` | `#2A3A8C` |
| 中亮 / Mid | `--moriium-blue-mid` | `#3E4EA6` |
| 基础 / Canvas | `--moriium-dark-canvas` | `#0B0C14` |
| 次要 / Secondary surface | `--moriium-dark-secondary` | `#0D1220` |
| 边框 / 分割线 | `--moriium-dark-border` | `#151A27` |
| 悬停 / Hover | `--moriium-dark-hover` | `#1C2760` |
| 选中 / Selected | `--moriium-dark-selected` | `#1F2C6A` |
| 进度 / Progress | `--moriium-dark-progress` | `#2A3A8C` |

### Light mode — 雾霾蓝

| Role | Token | Hex |
| --- | --- | --- |
| 主色 / Primary | `--moriium-light-primary` | `#5A7DAA` |
| 强调 / Accent | `--moriium-light-accent` | `#85A1C2` |
| 高亮 / Highlight | `--moriium-light-highlight` | `#AEC3DA` |
| 中亮 / Mid | `--moriium-light-mid` | `#D3E0EE` |
| 基础 / Canvas | `--moriium-light-canvas` | `#F2F5F9` |
| 次要 / Secondary surface | `--moriium-light-secondary` | `#B8C4D1` |
| 边框 / 分割线 | `--moriium-light-border` | `#E6EAF0` |
| 悬停 / Hover | `--moriium-light-hover` | `#E5E7EB` |
| 选中 / Selected | `--moriium-light-selected` | `#E3ECF8` |
| 进度 / Progress | `--moriium-light-progress` | `#5A7DAA` |

These two palettes are related, but they are **not mechanical inversions of one another**. Preserve their independently approved hierarchy.

## 4.2 Semantic implementation

Application code should consume semantic roles rather than scattering palette values through components.

A recommended mapping is:

```css
:root {
  color-scheme: light;

  --color-bg-primary: #F2F5F9;
  --color-bg-secondary: #B8C4D1;
  --color-bg-elevated: #E6EAF0;

  --color-text-primary: /* neutral reading ink; define separately from brand blue */;
  --color-text-secondary: /* quieter neutral ink */;
  --color-text-tertiary: /* auxiliary neutral ink */;

  --color-border-subtle: #E6EAF0;
  --color-border-default: #D3E0EE;

  --color-accent-primary: #5A7DAA;
  --color-accent-secondary: #85A1C2;
  --color-accent-highlight: #AEC3DA;
  --color-interactive-hover: #E5E7EB;
  --color-interactive-selected: #E3ECF8;
  --color-progress: #5A7DAA;
}

:root[data-theme="dark"] {
  color-scheme: dark;

  --color-bg-primary: #0B0C14;
  --color-bg-secondary: #0D1220;
  --color-bg-elevated: #151A27;

  --color-text-primary: /* neutral light reading ink */;
  --color-text-secondary: /* quieter neutral light ink */;
  --color-text-tertiary: /* auxiliary neutral light ink */;

  --color-border-subtle: #151A27;
  --color-border-default: #1C2760;

  --color-accent-primary: #162043;
  --color-accent-secondary: #1F2C6A;
  --color-accent-highlight: #2A3A8C;
  --color-interactive-hover: #1C2760;
  --color-interactive-selected: #1F2C6A;
  --color-progress: #2A3A8C;
}
```

The blue palette defines **brand and interaction color**, not article body text. Long-form reading text should normally use high-contrast neutral ink so that Moriium Blue remains distinctive rather than becoming visual wallpaper.

## 4.3 Accent usage rules

Use Moriium Blue most clearly for:

- active navigation / selected states;
- meaningful links and focus cues;
- progress and small data accents;
- restrained identity details;
- occasional editorial emphasis.

Do not use every blue step in every component. Most interfaces should need only a small subset at a time.

The darkest brand blue (`#162043`) may also function as a large dark identity field where appropriate, but should not replace the true dark canvas (`#0B0C14`) indiscriminately.

## 4.4 Gradients

The approved theme card contains light-to-dark gradient references built from the same palette family.

Gradients are **supporting tools**, not Moriium's default surface language:

- use them when a smooth state, data, photographic overlay, or intentionally atmospheric passage benefits from one;
- prefer subtle tonal transitions inside the approved blue family;
- do not introduce unrelated purple/cyan gradient palettes;
- do not use a gradient where a flat semantic token communicates the hierarchy more clearly.

## 4.5 Neutral surfaces

Moriium's surrounding neutrals should remain quiet enough for photography and text.

Avoid:

- fluorescent or electric blues;
- strong blue-tinted body text over long reading passages;
- large accent-colored containers when a border, label, or small state cue would work;
- replacing the approved 雾霾蓝 / 深渊蓝 pair with a reference site's palette.


# 5. Typography

Typography is one of Moriium's primary identity systems.

## 5.1 Role model

```text
Article body       → Serif
Display / headings → Serif or display serif
UI / navigation    → Sans serif
Metadata           → Sans serif
Quotation          → Serif, allowed to have a distinct editorial voice
Code               → Monospace
```

This is a role system, not a requirement to copy the exact font list from any reference project.

Chinese is a first-class reading language. English and Japanese must remain visually compatible rather than looking like afterthoughts.

## 5.2 Article rhythm

Recommended starting values:

```text
body line-height       1.70–1.80
paragraph rhythm       ~0.8–1.0rem
measure                ~760–800px maximum
metadata               clearly smaller/quieter than body
heading spacing        generous above, controlled below
```

Avoid cramped text columns and excessively wide long-form prose.

## 5.3 Heading behavior

- H1 should feel editorial, not like an app-page title.
- H2/H3 hierarchy should be obvious without relying on boxes or background fills.
- Light separators beneath major headings are acceptable when they improve document structure.
- Do not use five different display styles inside one article.

## 5.4 Links

For prose links, prefer low-noise affordance:

```text
normal → body/accent-related text + restrained underline/dotted underline
hover  → Moriium Blue emphasis
focus  → clearly visible accessible focus treatment
```

Links must remain identifiable without relying only on color where context is ambiguous.

---

# 6. Layout system

Moriium uses **different widths for different kinds of content**. Do not force photography into the article text measure.

Recommended canonical layout tokens:

```css
:root {
  --layout-text: 48rem;        /* ~768px */
  --layout-media: 62rem;       /* ~992px */
  --layout-gallery: 76rem;     /* ~1216px */
  --layout-header: 64rem;      /* deliberately wider than article text */
  --layout-wide: 90rem;
  --layout-gutter: clamp(1rem, 4vw, 4.5rem);
}
```

These are design-system targets, not excuses to hard-code every page to identical dimensions.

## 6.1 Editorial width hierarchy

```text
Header / global frame    wider
        ↓
Article / prose          narrow, readable
        ↓
Normal media             wider than prose
        ↓
Photography / gallery    substantially wider
        ↓
Hero / intentional bleed near full viewport when justified
```

A typical article may intentionally alternate:

```text
          title / metadata

        |--- text ---|
        |--- text ---|

   |-------- photograph --------|

        |--- text ---|
```

This width contrast is a core Moriium characteristic.

## 6.2 Grid behavior

Use grids for alignment and editorial composition, not automatically for boxed cards.

Prefer:

- asymmetric editorial arrangements when content benefits from them;
- image pacing and negative space;
- alignment relationships that persist across sections;
- clear vertical rhythm.

Avoid turning the home page into a dashboard of equal rectangles.

---

# 7. Spacing, borders, radius, and depth

## 7.1 Spacing scale

Use a small coherent spacing family rather than arbitrary values. A practical base scale:

```text
4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 px
```

Fluid spacing with `clamp()` is encouraged for page-level composition.

## 7.2 Borders

- 1px borders are the default structural separator.
- Most borders should have low visual presence.
- Use stronger borders only when state or hierarchy requires them.

## 7.3 Radius

- small to medium radius only;
- editorial media may be square-cornered or only slightly rounded;
- avoid making every object soft/rounded;
- pills are reserved for true chips/tags/toggles where the shape communicates function.

## 7.4 Shadow

Shadows should be rare and very soft. If a surface can be separated using spacing, contrast, or a border, prefer those before adding elevation.

No neon/glow shadow language in the default system.

---

# 8. Component grammar

## 8.1 Header

- wider than the article column;
- visually light;
- navigation should feel like publication navigation, not dashboard tabs;
- keep interaction targets accessible even when the visual treatment is restrained;
- sticky behavior is allowed only if it genuinely improves navigation and does not dominate reading.

## 8.2 Home page

The home page is a **curated editorial index**, not a feature dashboard.

It may combine:

- recent writing;
- selected photography;
- current project traces;
- archives/entry points;

But each module must earn its place. Avoid equal-weight card grids that make every item look like a product feature.

## 8.3 Post previews

Prefer list, ledger, editorial rows, or varied image/text compositions over default rounded cards.

A post preview can use:

- title;
- date / category / quiet metadata;
- optional excerpt;
- optional image.

Do not require an image merely to fill a template slot.

## 8.4 Archive

Archive pages can be denser than the home page, but still need breathable typography and strong date/title scanning.

## 8.5 Footer

The footer should conclude rather than restart the site. Keep it concise, structured, and low-noise.

## 8.6 Empty / error states

Do not turn 404 or empty states into generic SaaS illustrations. Keep them typographic and in character with the site.

---

# 9. Photography system

Photography is a first-class content type, not an oversized thumbnail.

## 9.1 Integrity

- preserve original photographs unchanged;
- generate thumbnails/optimized derivatives separately;
- preserve intended aspect ratios;
- do not crop unless the design explicitly calls for a crop and the crop is approved/controlled;
- do not add synthetic replacements for real travel photographs;
- do not expose private GPS/EXIF metadata without explicit approval.

## 9.2 Display widths

- inline explanatory image → text/media width depending on purpose;
- important photograph → media/gallery width;
- photographic essay → allow deliberate width changes to create rhythm;
- hero photograph → near-full bleed only when composition supports it.

## 9.3 Captions and EXIF

Captions should be visually secondary but readable. EXIF is optional context, never mandatory decoration.

## 9.4 Color interaction

Do not place strong site-colored overlays on photographs by default. The surrounding UI should withdraw when a photograph is the focal point.

---

# 10. Motion philosophy

Motion must explain space, state, hierarchy, or continuity. If removing an animation changes nothing meaningful, question whether it should exist.

Moriium Gallery already established a useful restrained precedent: fast transitions around **260ms**, medium transitions around **560ms**, and a strong ease-out curve (`cubic-bezier(0.16, 1, 0.3, 1)`). Treat this as continuity guidance, not a universal requirement.

Recommended design tokens:

```css
:root {
  --motion-fast: 180ms–280ms;
  --motion-medium: 360ms–600ms;
  --motion-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

## 10.1 Preferred properties

Prefer animating:

- `transform`
- `opacity`

Avoid expensive layout animation unless there is a clear reason and it has been measured.

## 10.2 Motion hierarchy

```text
Micro feedback      → very fast
Dropdown / reveal   → fast
Panel / route       → medium
Editorial sequence  → only when intentionally designed
```

Routine controls should not take 700ms+ to respond.

## 10.3 CSS vs GSAP

- use CSS transitions/animations for simple state changes;
- use GSAP when timeline orchestration, scroll choreography, or complex interruption/control genuinely requires it;
- do not add GSAP simply because the skill is installed.

## 10.4 Accessibility

Respect `prefers-reduced-motion`. Reduced motion should remove unnecessary travel/scale and preserve state clarity.

Keyboard interaction must never depend on a motion effect finishing.

---

# 11. Responsive behavior

Responsive design is not "desktop squeezed smaller".

## Mobile

- preserve reading comfort before decorative composition;
- reduce large spatial gestures without collapsing hierarchy;
- keep touch targets comfortably usable;
- avoid horizontal overflow from wide media;
- photography may approach the viewport edge when intentional.

## Desktop

- use the available width to create editorial relationships and image pacing;
- do not simply center a narrow mobile column in a huge empty viewport;
- header/global frame may be wider than article content.

Test narrow mobile and wide desktop explicitly.

---

# 12. Accessibility floor

Every public interface should maintain:

- semantic document structure;
- keyboard access for interactive elements;
- visible `:focus-visible` states;
- adequate contrast in both themes;
- useful alternative text policy for meaningful images;
- decorative images correctly ignored;
- stable content dimensions where possible to reduce layout shift;
- reduced-motion behavior;
- no interaction that depends only on hover;
- reasonable hit targets on touch devices.

Accessibility is part of the visual system, not a post-release patch.

---

# 13. Performance as a design constraint

Moriium's public architecture is content-first Astro. The design should not require a heavy SPA runtime to look correct.

Target principles:

```text
server-rendered HTML first
minimal client JS
minimal hydration
optimized responsive images
careful font loading/subsetting
stable layout
```

Article body, static navigation structure, typography, images, and metadata should remain usable without large client bundles.

Hydrate only the interactions that actually need it, such as theme controls, search, lightbox, or advanced gallery controls.

A design that requires unnecessary JavaScript to preserve basic layout is a design regression.

---

# 14. Reference library

References are **evidence and inspiration, not templates**. For any new visual decision, choose one primary question and inspect no more than **1–3 relevant references** unless the first pass leaves a concrete unresolved problem.

## 14.1 Primary structural reference

### Momo

Use for:

- content-first publication feeling;
- width hierarchy;
- serif/sans role separation;
- quiet borders and shadows;
- restrained accent usage;
- long-form article rhythm.

Do **not** copy its theme, components, exact palette, or font list. Extract principles and re-express them through Moriium tokens.

## 14.2 Internal precedent: Moriium Gallery

Moriium Gallery is useful as an internal precedent for:

- photography-first hierarchy;
- restrained route/menu motion;
- visible keyboard focus;
- reduced visual chrome;
- preserving image integrity;
- using motion to express spatial continuity rather than spectacle.

Its paper-toned gallery palette is not automatically the global Moriium palette.

## 14.3 External inspiration index

| Need | Reference | Consult for |
| --- | --- | --- |
| Motion | Landing Love — https://www.landing.love/ | Page transitions, scroll choreography, hover behavior, restrained sequencing |
| Aesthetic direction | Land-book — https://land-book.com/ | Overall visual tone, typography, composition, editorial presentation |
| Creative concepts | Awwwards — https://www.awwwards.com/ | Unusual art direction / interaction ideas to simplify and adapt |
| Refined finish | One Page Love — https://onepagelove.com/ | Spacing, hierarchy, concise polished composition |
| Bold treatment | Lapa Ninja — https://www.lapa.ninja/ | High-impact layouts, contemporary color/layout ideas |
| Existing components | 21st.dev — https://21st.dev/ | Potential implementation starting points after compatibility/license/a11y review |
| Design-led layouts | SiteInspire — https://www.siteinspire.com/ | Grids, image pacing, typography, art direction |

## 14.4 Reference-use rules

1. Extract **principles**, not proprietary layouts, source code, copy, photography, or brand assets.
2. Do not add product features merely because a reference has them.
3. For motion references, preserve keyboard usability, reduced motion, stable layout, and reasonable loading cost.
4. Treat copied community components as external code: verify license, dependencies, accessibility, and framework compatibility first.
5. Record which references were actually inspected and what decision each informed.
6. Never cite an unvisited site as evidence.
7. If a reference conflicts with this `DESIGN.md`, Moriium wins.

## 14.5 Reference extraction workflow

When a task genuinely needs outside inspiration:

```text
Define one design question
        ↓
Choose 1 primary reference category
        ↓
Inspect 1–3 sites/pages
        ↓
Extract measurable principles
        ↓
Translate into Moriium tokens/components
        ↓
Implement
        ↓
Screenshot / responsive / accessibility review
```

`design-md-chrome` may be used as a measurement/extraction aid when inspecting a public reference. Hallmark `study` may be used as an explicit visual-DNA analysis tool. Neither tool grants permission to copy a site.

---

# 15. Skill routing for design work

`DESIGN.md` is loaded before generic design skills.

## Default roles

| Skill | Role | Invoke when |
| --- | --- | --- |
| `frontend-design` | art director | new interface or meaningful visual direction/composition decision |
| `ui-ux-pro-max` | design-system / UX researcher | system, responsive, accessibility, typography/color/navigation questions |
| `animate` | motion designer | motion is actually requested/needed |
| GSAP official skills | motion implementation specialist | GSAP is justified by the interaction |
| `web-design-guidelines` | auditor | formal UI/UX/a11y review after implementation |
| `verification-before-completion` | verifier | before claiming a substantial visual implementation is complete |

## Explicit specialists

- Hallmark → explicit study / audit / major redesign only.
- `review-animations` → explicit animation review.
- `find-animation-opportunities` → explicit motion-opportunity pass.
- `improve-animations` → explicit motion-quality pass.
- Cinematic UI → explicit cinematic/directorial project treatment.
- Mono Color → editorial/poster/zine/photography asset work.

Do not invoke multiple broad art-direction skills for the same ordinary page merely because they are installed.

---

# 16. Design change protocol

The following are **locked identity decisions** unless Morii explicitly changes them:

- content-first editorial character;
- quiet / rational / restrained tone;
- Moriium Blue as the primary identity color;
- no generic grayscale-only minimalism;
- no SaaS/dashboard visual language for the public site;
- multi-width content system for text vs photography;
- photography-first integrity rules;
- low-noise borders/shadows;
- motion restraint;
- references are principles, not templates.

Before changing a locked decision, state:

1. what is being changed;
2. why the current rule is insufficient;
3. what components/tokens are affected;
4. whether the change is experimental or proposed as the new canonical rule.

Do not silently let an experiment become the new site-wide language.

---

# 17. Review checklist

Before calling a new or redesigned public page visually complete, check:

### Identity
- Does it feel recognizably Moriium rather than a generic theme?
- Is Moriium Blue meaningful but restrained?
- Is the page still content-first?

### Composition
- Is the text measure readable?
- Are photography/media widths chosen intentionally?
- Is whitespace doing structural work?
- Have unnecessary cards/containers been removed?

### Typography
- Are serif/sans roles consistent?
- Is metadata clearly subordinate?
- Does long-form text retain comfortable rhythm?

### Motion
- Does every meaningful animation have a purpose?
- Is routine feedback fast enough?
- Does reduced motion work?

### Photography
- Are aspect ratios and originals respected?
- Is the UI withdrawing when the image is the focal point?
- Is private metadata protected?

### Accessibility
- Keyboard navigation works.
- Focus is visible.
- Contrast is acceptable in both themes.
- Mobile controls remain usable.

### Performance
- No unnecessary framework/runtime was added for presentation alone.
- Images are delivered responsively.
- Layout shift is controlled.

### Reference discipline
- If references were used, were only relevant references inspected?
- Can the exact principle learned from each reference be stated?
- Is the result an adaptation rather than a copy?

---

# 18. Open items to resolve during implementation

The canonical **雾霾蓝 / 深渊蓝** palettes are now recovered and locked in Section 4.

The remaining open items are:

1. Final production font families and local/webfont loading strategy.
2. Exact neutral reading-ink tokens for light and dark mode after accessibility/contrast review.
3. Exact component-level radius/shadow tokens after the first real Moriium vNext page is implemented and reviewed.

Do not silently invent unresolved identity-level values. Surface the gap and make it an explicit design decision.

---

# 19. Provenance / continuity notes

This design constitution consolidates earlier Moriium decisions and research:

- Moriium vNext architecture direction: Astro public frontend, content-first, photography-oriented design system, multi-width article/media/gallery layout, Momo used as a visual reference rather than a theme to copy.
- Moriium Gallery `AGENTS.md`: selective skill routing and a curated reference library including Landing Love, Land-book, Awwwards, One Page Love, Lapa Ninja, 21st.dev and SiteInspire.
- Moriium Gallery CSS: restrained motion timing/easing, low-noise focus/accessibility treatment, and photography-first presentation.

When future research improves this document, preserve the reasoning behind previous locked decisions rather than replacing them with trend-driven defaults.
