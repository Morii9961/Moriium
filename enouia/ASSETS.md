# Artwork provenance

All imagery was made for this page. No private photograph, real location,
character portrait, relationship history, or third-party stock asset was used.

## Generated environments

Created with the built-in image-generation tool on 2026-09-09:

| Asset | Subject | Source generation |
| --- | --- | --- |
| `public/images/courtyard-*.webp` | Rain-washed courtyard maquette, spiral stair, rain chain, plants, puddles, and everyday objects | `exec-07d7f90e-7ab4-48c2-83d6-52517f210ac9.png` |
| `public/images/passage-*.webp` | Eye-level greenhouse passage with wet glass, ferns, a chair and notebook, and light at the far door | `exec-abce5db2-4b3f-43ca-a88c-8e87d89a1eda.png` |

The prompts requested different spaces, viewpoints, and rendering treatments,
with no text, people, characters, or logos. Neither image is a depiction of a
known place. Visible captions identify them as imagined spaces.

The selected images were resized to widths of 768 and 1536 pixels using the
repository's existing Sharp package and encoded as WebP at quality 82. No
source photograph was edited. Source PNGs remain in the generation output;
only optimized derivatives are part of this site. Sharp's default metadata
stripping was retained. Each subject is used in one HTML image; `srcset`
provides alternate resolutions, not duplicate page content.

## Code-native visuals

- `src/components/Objects.astro`: individually drawn blue glass, asymmetric
  folded paper bird, and winged seeds. No stairway geometry is reused.
- `src/scripts/optics.ts`: procedural prism and ray family, drawn in Canvas 2D.
- The inline prism SVG is a no-JavaScript/no-Canvas fallback in the same stage.
  It is visually hidden after the live stage renders, not repeated elsewhere.
- `src/styles/space.css` and inline geometry: alignment lines, subtle framing,
  and surface treatments drawn specifically for their location.

The repository's content-license policy applies to artwork; code retains the
repository's code license.
