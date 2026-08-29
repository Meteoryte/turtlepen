# ADR 0001: One model, many views

**Status:** accepted
**Date:** 2026-08-26

## Context

TurtlePen pages are render layers. Treating them as architecture views would
duplicate elements, allow relationship meaning to drift, and confuse Z-order
with audience or use-case selection.

## Decision

Schema 3 owns one element/relationship model plus durable static, tag-filtered,
and ordered dynamic view definitions. A view stores selection, direction,
perspective, and key preferences; it never owns copied geometry. Themes and
generated keys resolve at render time and cannot change collision footprints.

## Consequences

- Editing one element updates every view.
- Dynamic sequence order is authored data, not inferred from position.
- Pages remain responsible only for composition and overlap intent.
- Legacy schema-1/schema-2 documents migrate to an empty workspace layer
  without geometry changes.
