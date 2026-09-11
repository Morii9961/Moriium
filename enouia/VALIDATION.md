# Validation — 2026-09-11

## Integration checks

- The selected Enouia implementation lives in `enouia/`, with its own package manifest, frozen lockfile, workspace boundary, assets, and static output. Root changes add build/preview/verification commands, a TypeScript exclusion, CI verification, and a README entry. Moriium's public source and deployment procedure are unchanged.
- `pnpm --dir enouia install --frozen-lockfile` and the root frozen install succeeded without changing dependency versions.
- `pnpm enouia:verify` passed from the repository root: Astro diagnostics reported 0 errors, 0 warnings, and 0 hints. The static build, local assets and anchors, output budgets, and built interaction checks passed.
- Enouia produces one prerendered page and nine files, totaling 426,241 bytes. Its external JavaScript module is 1,191 bytes. No inline script, Node adapter, public API, framework runtime, or external media request is present in its output. The publication-blocking robots metadata has been removed.
- The root `pnpm verify` completed Astro diagnostics, content/media validation, the production build, tests, link checks, privacy audit, rendering-boundary checks, and performance budgets. Tests reported 314 passed, 0 failed, 1 skipped, and 1 todo. Astro diagnostics reported 0 errors, warnings, and hints.
- A Python static server returned HTTP 200 for all nine Enouia output files at `http://127.0.0.1:4342/` after the directory migration. No Enouia Astro/Node preview process was running. This confirms static-file delivery without an application process; it is not Nginx acceptance.
- The Nginx example preserves server-level security headers by using `expires` in child locations rather than overriding header inheritance with child `add_header` directives.

## Visual and interaction checks before directory migration

These checks were performed on the same selected page earlier on 2026-09-11. Integration changed its directory, package name, documentation, build wiring, and robots metadata; the rendered content, styles, and interaction module stayed the same.

- Browser layout measurements at 375, 390, 768, 1024, and 1440 CSS pixels found no horizontal overflow. Screenshots of the expanded third passage were inspected at 375, 768, 1024, and 1440 pixels, including the closing copy on mobile. At 375 pixels, the image selected the 600-pixel WebP source.
- The native range control responded to Home and ArrowRight with value 1 and the matching accessible value label. Its visible focus outline was solid. Subsequent scrolling retained value 1, confirming manual ownership. The inspected browser error log was empty.
- The third passage uses an independently generated coastal stairway. Two observations and a short closing note expand the content without adding another interaction or dependency.
- The built interaction module was executed against a small DOM test double: initial split, scroll changes, manual input ownership, accessible labels, endpoint clamping, reduced motion, and hidden-document behavior passed. This logic check was repeated after integration.

## Remaining acceptance limits

A new browser inspection after the directory migration was unavailable because automatic approval review reported an account usage limit. Static HTTP checks and automated verification completed.

Actual touchscreen input, measured contrast ratios, layout shift, no-JavaScript rendering, and reduced-motion browser behavior remain unverified. Reduced motion is covered by the built-module logic check. Viewport resizing is not a physical-device test.

The Nginx example has not been executed on Linux. DNS, TLS, server paths, cache headers, and production deployment remain pending. CI configuration was reviewed locally; hosted CI requires a future push. Source integration does not publish either site.

Stop the Python preview before using the package's Astro preview on port 4342.
