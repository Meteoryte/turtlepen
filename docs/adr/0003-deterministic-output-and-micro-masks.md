# ADR 0003: Deterministic output and presentation micro-masks

**Status:** accepted
**Date:** 2026-08-26

## Context

TurtlePen needs portable raster and PDF output without adding a platform
renderer. It also needs exact one-pixel artwork cleanup without pretending that
sub-quadrant erasing changed semantic or collision geometry.

## Decision

The core owns a deterministic presentation raster shared by native PNG and PDF
export. SVG remains the accessible vector source. A `micro_mask` is separate,
reversible presentation state attached to artwork paths or images; its points
are canonical integer design pixels and its width is exactly one pixel.

## Consequences

- SVG and PNG apply the same mask coordinates.
- Validation remains byte-identical before and after a mask.
- Full-mask coverage is reported so invisible retained geometry is not hidden.
- The built-in bitmap text is a deterministic fallback, not a claim of
  typographic identity with arbitrary system fonts.
