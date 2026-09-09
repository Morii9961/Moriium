# Local validation — 2026-09-09, selective refinement

Implementation branch: `codex/enouia-independent-space`.

## Current revision

- `pnpm enouia:verify`: zero Astro errors, warnings, and hints; one static page
  builds; all six optical-geometry tests pass. The verifier checks local `src`,
  `href`, and responsive `srcset` resources and the 1 MB total-output budget.
  The complete output is 732,463 bytes before HTTP compression,
  including both available sizes of both artworks.
- Tests cover normal incidence, the refracted tangential component, total
  internal reflection, a missed prism, all 71 UI angles at five sampled
  wavelengths, and separation of the two spectral endpoints. Dispersion is
  exaggerated for visual legibility; this is not a calibrated simulator.
- Browser width checks at 375, 390, 768, 1024, and 1440 CSS pixels show no
  horizontal document overflow. Desktop and mobile screenshots were inspected
  for the courtyard, greenhouse, optics, and object table.
- The browser selects the 768-pixel WebP alternatives on the 390-pixel viewport.
  No artwork is repeated in another section.
- Slider Home/End keys reach -35/+35 degrees and update the visible reading.
  Morning, overcast, and dusk buttons update the selected light state. The
  Canvas stage renders under the production CSP without browser errors.
- Greenhouse observation buttons update their pressed state and the associated
  note. The chair observation was verified in the browser.
- The object-table button changes the three object transforms and its comment.
  Keyboard activation and the static-picture mode produce zero-duration
  transitions. The static-picture toggle updates its accessible pressed state.
- Root, favicon, stylesheet, script, and all four WebP files return HTTP 200
  with the expected content types. Unknown and source-file paths return 404.
- The body and secondary text colors were checked against their surfaces;
  secondary ink was darkened after the first stone-surface measurement fell
  below 4.5:1.
- `git diff --check`: no whitespace errors. Dependency versions and the root
  lockfile are unchanged. No public Moriium layout or content was edited.

## Fallbacks and limits

The selective refinement was rebuilt and verified with all six tests passing
and zero Astro diagnostics. Fresh browser checks confirmed responsive notes
at the slider extremes and on a light-color change, the revised chair note,
and no horizontal overflow at all five widths listed above. Desktop and
390-pixel screenshots were inspected. The greenhouse-to-optics line is visible
at the section boundary; static-picture mode sets its clip to `none` and keeps
the toggle pressed. No browser warning or error was captured in this pass.

The no-JavaScript document includes the complete images, SVG prism, objects,
and note. Script-only controls remain hidden until their listeners are ready.
This fallback and system reduced-motion guards were inspected in source;
an OS preference toggle and a JavaScript-disabled browser session were not run.

Canvas draws only in response to input, resize, or visibility changes, with
DPR capped at two. Hidden and offscreen states stop rendering work. No idle
animation loop, web font request, analytics, framework hydration, or remote
media request is introduced. No measured frame-rate or CLS claim is made.

Real-device touch and screen-reader acceptance remain useful before launch.
The first draft's main-repository type check and release-shell syntax check
passed earlier in this task. Those unchanged surfaces were not retested for
this visual revision. The full Moriium suite and remote CI were not run.

## Deployment boundary

The local preview command serves only `enouia/dist` and applies the proposed
CSP. It avoids an Astro dev/preview subprocess startup failure observed on this
Windows host. Production still uses static Nginx delivery, with no Enouia Node
service or database.

No commit, push, DNS change, certificate issuance, Nginx reload, VPS publication,
Node-service shutdown, or production rollback rehearsal was performed. The
Moriium-to-Enouia link is still deferred until the approved URL is live.
See `README.md` for deployment and `ASSETS.md` for image provenance.
