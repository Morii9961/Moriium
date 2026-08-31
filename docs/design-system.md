# Moriium design-system implementation status

> Canonical authority: [`DESIGN.md`](../DESIGN.md). This document is a derived implementation and status record for the public site. It must not redefine Moriium's visual identity, tokens, accessibility floor, photography rules, motion philosophy, or design-Skills routing.

## Current production snapshot

The public routes currently implement the A structure: a modern sans-serif wordmark, a twelve-column editorial index, horizontal rules, restrained content framing, independent Writing/Archive/Categories/Tags/About routes, and a long-form article frame with outline, readable body, and compact context.

The current implementation also includes:

- a curated home with recent writing, selected photography/travel/technology features, author/site activity, discovery routes, RSS, and an about lead-in;
- global search and persistent light/dark appearance controls, with the production search index loaded only after search opens;
- explicit translation availability, active reading features, tags, and adjacent-post navigation;
- locally bundled font candidates and native CSS/feature-scoped browser modules, subject to the unresolved decisions in [`DESIGN.md`](../DESIGN.md#18-open-items-to-resolve-during-implementation).

This snapshot describes what the current code does. It does not approve a new visual direction, freeze the candidate fonts, or override the canonical design constitution.

## Isolated design studies

The `/design/` routes are clean-room research and comparison surfaces. They are not production approval and must not be treated as an alternative default design language. Their research evidence belongs in [`design-research.md`](design-research.md); future visual decisions must follow [`DESIGN.md`](../DESIGN.md) and Morii's explicit approval.

## Implementation rule

When this status record and [`DESIGN.md`](../DESIGN.md) differ, follow `DESIGN.md`, then update this file to describe the resulting implementation. Do not silently promote a prototype, generic Skill recommendation, or reference-site pattern into the public system.
