# Moriium design-system implementation status

> Canonical authority: [`DESIGN.md`](../DESIGN.md). This document is a derived implementation and status record for the public site. It must not redefine Moriium's visual identity, tokens, accessibility floor, photography rules, motion philosophy, or design-Skills routing.

## Current production snapshot

The primary production routes currently implement the selected A structure:

- a modern sans wordmark and restrained publication header;
- a twelve-column editorial index with horizontal rules and quiet framing;
- independent Writing, Archive, Categories, Tags, and About routes;
- long-form article pages with outline, readable body, and compact context;
- global search and light/dark controls, with the production search remaining a lazy-loaded static index.

This snapshot describes the current code. It does not approve a new visual direction, freeze unresolved identity decisions, or override the canonical rules and open items in `DESIGN.md`.

## Isolated design studies

The `/design/` routes are clean-room comparison evidence, not production approval. The inspected references, extracted principles, rejected recommendations, and resulting decisions belong in [`design-research.md`](design-research.md). Any future promotion or revision must follow `DESIGN.md` and Morii's explicit approval.

## Implementation rule

When the implementation and `DESIGN.md` disagree, follow `DESIGN.md` and update this status record. Do not silently promote a prototype, generic skill recommendation, or reference-site pattern into Moriium's site-wide language.
