# Moriium Agent Instructions

## Scope and precedence

This file applies to the entire repository. Direct instructions from Morii take precedence. A more deeply nested `AGENTS.md` may override this file only inside its own directory.

`AGENTS.md` is the shared source of truth for Codex, Claude, and other contributors. Agent-specific files must point here instead of copying these rules.

## Product contract

Moriium is Morii's lightweight, multilingual personal blog. V1 contains:

- Chinese, Japanese, and English interfaces at `/zh/`, `/ja/`, and `/en/`.
- Home, article, archive, category, tag, about, RSS, and sitemap pages.
- A site-wide static article search and a persistent light/dark appearance control.
- Article lightboxes, rich code blocks, mathematics, Mermaid, video, encrypted posts, music cards, GitHub repository cards, admonitions, spoilers, and optional copy protection.
- Pages CMS authoring for public posts and a local-only encryption flow for protected posts.

Do not add comments, reader accounts, public registration, or analytics. ADR 0002, approved 2026-08-30, admits an author-only admin, a database, two author accounts, and an internal API; anything past that scope still needs Morii to widen it explicitly.

Search must remain a build-time static index. The reader path must not depend on Node, a database, or a CMS: every public route stays prerendered and Nginx serves the static output directly. The author admin may depend on a resident Node process and a database. It is reachable on the public internet and is defended by a long unique password, per-account rate limiting, and fail2ban; that password must never be reused anywhere else.

## Clean-room visual contract

Twilight is a functional reference and a visual counterexample. Do not copy its UI, CSS, components, palette, wallpaper, animation system, giant centered hero, gradient glow, glass cards, Bento blocks, particle backgrounds, icon scatter, rounded-card stacks, or routine scroll-reveal effects.

Build the design through editorial hierarchy, readable rhythm, whitespace, and restrained rules. Do not reduce “Japanese minimalism” to beige, serif type, red dots, or vertical Japanese text.

`DESIGN.md` is Moriium's canonical public visual/design constitution and design-Skills specification. Read it before any meaningful public visual change. `docs/design-system.md` is a derived implementation/status record and must not redefine or conflict with `DESIGN.md`.

Before freezing typography, color, grid, spacing, rules, or dark mode:

1. Show Morii three comparable concepts using identical real content.
2. Include both home and article pages at desktop and mobile widths.
3. Record each visited reference, extracted principle, and resulting decision in `docs/design-research.md`.
4. Implement the selected direction against `DESIGN.md` and record the current implementation/status snapshot in `docs/design-system.md`; the status document must not become a competing source of truth.

## Content and privacy

- Public posts live in `src/content/posts/` and may be edited through Pages CMS. Once the ADR 0002 admin takes over authoring, Pages CMS becomes a read-only history entry or is retired. An article must never be writable through both at once.
- Plaintext protected posts live only in ignored `.private/posts/`. Never commit them, print their password or plaintext to logs, or copy them into fixtures.
- The public protected-post collection may contain only public metadata and versioned ciphertext envelopes.
- Original photos remain untouched. Generate publishable derivatives separately and remove GPS and sensitive EXIF before committing them.
- Code is MIT licensed. Articles, photographs, audio, and other content are all rights reserved unless a file says otherwise.

## Engineering constraints

- Use Astro static output, TypeScript, and pnpm. `output` stays `static`.
- The Node adapter is admitted by ADR 0002 for one purpose: rendering `/admin` and `/api` on demand. No public route may become on-demand without a second ADR.
- Do not add a UI framework or Tailwind to the public site in `src/`. The author admin uses Vue 3 and Tiptap, and its code must never reach a public route.
- Prefer native HTML, CSS, and small feature-scoped browser modules.
- Ordinary pages must not download Mermaid, PhotoSwipe, music, video, or decryption code. Load an advanced module only when its content marker exists, and defer network media until user interaction.
- Search UI may be present globally, but its generated index and search module must load only after the reader opens search.
- Preserve no-JavaScript fallbacks for links, images, GitHub repositories, and protected-post metadata.
- Keep external iframe providers on an explicit allowlist and update the CSP when adding one.
- Translation variants share a `translationKey`. Missing translations must be shown as unavailable; never fabricate or copy a translation.
- Avoid global dependency churn. Lock exact versions and explain additions.

## Working protocol

1. Inspect the working tree and relevant files before editing.
2. Classify the task, then load the smallest skill set that fully covers it. See Skill routing.
3. Preserve unrelated changes from Morii or another contributor.
4. Implement the smallest complete change inside the approved scope.
5. Run fresh, relevant checks and inspect the final diff.
6. Do not claim a check passed unless its current output proves it.

Do not commit, push, publish, deploy, create a repository, or change remote state unless Morii explicitly requests it. Morii has authorized creating and publishing `Morii9961/Moriium` in the approved launch phase, after visual selection and release verification.

## Skill routing

Skills are installed at `~/.claude/skills/` for Claude and `~/.codex/skills/` for Codex. Both agents route from this section; do not keep a second routing list in an agent-specific file.

Load the smallest skill set that fully covers the task. Do not invoke a skill merely because it is available, and do not preload speculative skills. Combine skills only when their responsibilities genuinely overlap.

A skill's output is advice, never authority. Morii's direct instructions, `DESIGN.md` for public visual identity, and this file's product/engineering constraints override any skill recommendation. `docs/design-system.md` records implementation status, while `docs/design-research.md` records evidence and rejected recommendations; neither can override `DESIGN.md`.

### Design and implementation

| Skill | Invoke when | Do not invoke when |
| --- | --- | --- |
| `frontend-design` | Making a genuinely new visual decision: art direction, typography, hierarchy, or composition that `DESIGN.md` has not already settled. | Implementing an approved direction, fixing a local style bug, or changing non-visual code. |
| `ui-ux-pro-max` | Deciding interaction, responsive behavior, accessibility, color, typography, or navigation. Detect the stack first; `data/stacks/astro.csv` covers the current public site. | A trivial CSS correction, or a task with no UX decision. |
| `animate` | Designing motion when motion is actually requested or needed, within `DESIGN.md`'s restraint and reduced-motion rules. | Static work, routine scroll reveals, or motion that has no clear purpose. |
| `gsap-core`, `gsap-timeline`, `gsap-scrolltrigger`, `gsap-performance`, `gsap-frameworks` | Implementing a justified GSAP interaction; choose only the specialist that matches the actual mechanism and framework. | Simple CSS transitions, no-motion work, or React-only guidance for this Astro/Vue repository. |
| `web-design-guidelines` | Morii asks for a UI, UX, or accessibility audit, or an interface is formally reviewed before release. | Initial design or routine implementation. It is an audit skill, not a default coding skill. |
| `review-animations` | Morii explicitly asks for a motion-quality review. | Ordinary implementation or a motion decision that has not been requested. |
| `find-animation-opportunities` | Morii explicitly asks where motion could improve the interface. | Adding motion by default or reviewing non-motion code. |
| `improve-animations` | Morii explicitly asks to improve existing animation quality. | Initial implementation, static work, or speculative optimization. |
| `prototype` | Morii explicitly asks for multiple live visual versions behind a picker. | Ordinary implementation or silently treating a prototype as production approval. |
| `hallmark` | Morii explicitly asks for a Hallmark study, audit, or major redesign. | Routine page implementation or default art direction. |
| `cinematic-ui` | Morii explicitly asks for a cinematic/directorial visual treatment. | Ordinary Moriium pages or generic visual polish. |
| `mono-color` | Morii explicitly asks for mono-color, duotone, risograph, or related editorial asset work. | General site styling or ordinary photography handling. |
| `vercel-react-best-practices` | Writing, reviewing, or refactoring React or Next.js code in the vNext full-stack work. | The file under change is Astro, plain TypeScript, or a static asset. |
| `vercel-composition-patterns` | Designing reusable React component APIs, compound components, or context boundaries. | A one-off section, or any non-React task. |
| `source-driven-development` | Behavior depends on the current Astro, Tiptap, browser, or third-party API surface; a dependency is added or upgraded; a vNext claim needs a first-party citation. | A self-contained local change that follows an already verified project pattern. |

### Engineering quality

| Skill | Invoke when | Do not invoke when |
| --- | --- | --- |
| `systematic-debugging` | A bug, failed test, failed build, or unexplained behavior exists. Reproduce and find the root cause before editing. | Building a requested feature normally, or speculating about failures that have not occurred. |
| `verification-before-completion` | Before claiming substantial work is complete, fixed, or passing. Run `pnpm verify`, or the narrower relevant commands, and report their real output. | Pure discussion with no completion claim. |
| `code-review-and-quality` | Morii requests review, a commit or merge is being prepared, or a risky diff needs multi-axis review. | Ordinary implementation before a review phase. |

### Writing

Project documents are mixed-language. `AGENTS.md`, `DESIGN.md`, `README.md`, `docs/architecture.md`, `docs/design-system.md`, `docs/design-research.md`, `docs/authoring.md`, `docs/deployment.md`, `docs/encrypted-posts.md`, and `docs/markdown-reference.md` are English. `docs/enouia-todo.md`, `docs/vnext-architecture-plan.md`, the `docs/adr-*.md` series, and the `docs/handoff-*.md` and `docs/claude-vnext-handoff.md` handoffs are Chinese. Match the language of the file being edited.

Code, comments, commit messages, and files under `prototypes/` are English, matching `src/`.

| Skill | Invoke when | Do not invoke when |
| --- | --- | --- |
| `humanizer-zh` | Naturalizing or polishing substantial Chinese prose: interface copy, articles, or the Chinese planning documents. | English instructions, code, exact technical reference text, or a short Chinese reply. |
| `writing-clearly-and-concisely` | Writing or materially revising English documentation, explanations, commit messages, error messages, or substantial UI copy. | Code-only changes, or small labels whose wording is already supplied. |
| `documentation-writer` | Creating or restructuring a technical tutorial, how-to guide, reference, explanation, or a substantive README. | A short status update, ordinary code comments, or a tiny correction in an established document. |
| `doc-coauthoring` | A substantial proposal, ADR, or specification set needs iterative context transfer, outline agreement, and reader verification, such as the Phase 5 architecture ADR. | A focused single-file edit with clear requirements. |
| `beautiful-prose` | Morii explicitly names it. | Any implicit or routine task. |

### Common combinations

- New or redesigned public-site UI: read `DESIGN.md`, then use `frontend-design` + `ui-ux-pro-max` only for decisions the constitution leaves open; check the result against the clean-room visual contract.
- Motion work: read `DESIGN.md`, then use `animate` and only the necessary GSAP specialist when the interaction justifies it; invoke the explicit motion-review skills only when Morii asks for those reviews.
- Bug or failed build: `systematic-debugging` first, then the relevant implementation skill, then `verification-before-completion`.
- Pre-commit readiness: `code-review-and-quality` + `verification-before-completion`.
- vNext research or an ADR: `source-driven-development` + `doc-coauthoring`, with every external claim carrying a first-party link.
- Revising a Chinese planning document: `humanizer-zh`; add `documentation-writer` only when its structure is being rebuilt.

Do not default to `emil-design-eng`, `gsap-react`, Taste/`gpt-taste`, Open Design full, Claude Design Skill, PencilPlaybook, or Landing Page Generator. Skills not listed here are not part of the default workflow. Invoke one only when Morii names it, or the task unambiguously matches its description.

### The `ui-ux-pro-max` search tool

This skill queries a local Python index instead of loading its data into context. Invoke it by absolute path; do not assume a working directory:

```sh
python "$HOME/.claude/skills/ui-ux-pro-max/scripts/search.py" "<query>" --domain ux
python "$HOME/.claude/skills/ui-ux-pro-max/scripts/search.py" "<query>" --stack astro
```

Codex uses the same script under `~/.codex/skills/`. Resolve the path from the home directory rather than hardcoding a machine-specific one; this file is published with the repository. Never put private project data, `.private/posts/` content, passwords, or original photograph paths in a query. Do not run `--persist --force`; it overwrites a stored design system without review.

## Collaboration and attribution

- Keep handoffs explicit: changed files, decisions, checks, and unresolved risks.
- `CLAUDE.md` is a short bridge to this file.
- Never discard, reset, overwrite, or silently reformat another contributor's changes.
- When Codex materially contributes to a requested commit, use `Co-authored-by: Codex <267193182+codex@users.noreply.github.com>`.
- When Claude materially contributes, use `Co-authored-by: Claude <noreply@anthropic.com>`.
- Credit only actual contributors and verify trailers after committing.

## Quality gates

- `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm links` pass.
- Content schema and custom Markdown directives validate.
- Keyboard navigation, visible focus, semantic headings, alt text, contrast, and reduced motion work.
- Layout is checked at 375, 390, 768, 1024, and 1440 CSS pixels.
- Ordinary pages contain no unused advanced-reader bundles.
- Generated output and Git history contain no protected plaintext, passwords, exact GPS, secrets, or unrelated generated files.
- Public output is static and stays fully reachable with the Node process stopped. Prove it by stopping the process, not by asserting it.
- No public page bundles admin code such as Vue or Tiptap.
