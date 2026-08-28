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

Do not add comments, analytics, accounts, an admin runtime, a database, or an API without Morii explicitly changing scope. Search must remain a build-time static index; static build tooling is allowed, but the deployed site must not require Node, a database, PM2, a search service, or a CMS process on the VPS.

## Clean-room visual contract

Twilight is a functional reference and a visual counterexample. Do not copy its UI, CSS, components, palette, wallpaper, animation system, giant centered hero, gradient glow, glass cards, Bento blocks, particle backgrounds, icon scatter, rounded-card stacks, or routine scroll-reveal effects.

Build the design through editorial hierarchy, readable rhythm, whitespace, and restrained rules. Do not reduce “Japanese minimalism” to beige, serif type, red dots, or vertical Japanese text.

Before freezing typography, color, grid, spacing, rules, or dark mode:

1. Show Morii three comparable concepts using identical real content.
2. Include both home and article pages at desktop and mobile widths.
3. Record each visited reference, extracted principle, and resulting decision in `docs/design-research.md`.
4. Implement the selected direction in `docs/design-system.md`; that document then becomes the only visual implementation source of truth.

## Content and privacy

- Public posts live in `src/content/posts/` and may be edited through Pages CMS.
- Plaintext protected posts live only in ignored `.private/posts/`. Never commit them, print their password or plaintext to logs, or copy them into fixtures.
- The public protected-post collection may contain only public metadata and versioned ciphertext envelopes.
- Original photos remain untouched. Generate publishable derivatives separately and remove GPS and sensitive EXIF before committing them.
- Code is MIT licensed. Articles, photographs, audio, and other content are all rights reserved unless a file says otherwise.

## Engineering constraints

- Use Astro static output, TypeScript, and pnpm. Do not add a UI framework, Tailwind, or server adapter.
- Prefer native HTML, CSS, and small feature-scoped browser modules.
- Ordinary pages must not download Mermaid, PhotoSwipe, music, video, or decryption code. Load an advanced module only when its content marker exists, and defer network media until user interaction.
- Search UI may be present globally, but its generated index and search module must load only after the reader opens search.
- Preserve no-JavaScript fallbacks for links, images, GitHub repositories, and protected-post metadata.
- Keep external iframe providers on an explicit allowlist and update the CSP when adding one.
- Translation variants share a `translationKey`. Missing translations must be shown as unavailable; never fabricate or copy a translation.
- Avoid global dependency churn. Lock exact versions and explain additions.

## Working protocol

1. Inspect the working tree and relevant files before editing.
2. Preserve unrelated changes from Morii or another contributor.
3. Implement the smallest complete change inside the approved scope.
4. Run fresh, relevant checks and inspect the final diff.
5. Do not claim a check passed unless its current output proves it.

Do not commit, push, publish, deploy, create a repository, or change remote state unless Morii explicitly requests it. Morii has authorized creating and publishing `Morii9961/Moriium` in the approved launch phase, after visual selection and release verification.

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
- Release output is static and works behind Nginx without Node.
