# Structurizr pattern adaptation plan

**Date:** 2026-08-25

**Decision:** PASS WITH CONDITIONS

**Scope:** adapt product principles and semantic contracts; do not copy code,
screens, wording, branded themes, icons, or trade dress

## Construction receipt — 2026-08-26

The first slice is implemented and executable:

- `annotate` persists descriptions, technology, tags, properties, and named
  perspectives on elements and relationships;
- `connect` creates directed node-port relationships with literal `direct`,
  `orthogonal`, and `curved` routing; curved routes require explicit waypoints;
- `inspect_model` reports semantic omissions and broken relationship references
  on an independent error/warning/info axis;
- `describe`, viewer state, schema-2 persistence, plan/history, real stdio MCP,
  and endpoint tests expose the new model;
- runtime truth and persistence prerequisites are complete.

Filtered/dynamic views, theme layering, documentation/ADR attachment, and richer
view composition remain phased adaptations rather than implied completed work.

## Research contract

**Segment:** agents and human reviewers authoring architecture, workflow, and
field-service diagrams that must remain inspectable and versionable.

**Need:** define information once, preserve relationship meaning, render it in
more than one useful view, and allow a human to understand or approve every
layout decision.

**Evidence channels:**

1. First-party request: Chuck explicitly asked for Structurizr feature
   adaptation and node-origin curved lines on 2026-08-25.
2. Internal behavior: the TurtlePen product audit found first-class relationship
   semantics, themes, multiple views, accessibility, and an approval workbench
   to be higher leverage than more isolated primitives.
3. External design precedent: official Structurizr documentation, retrieved on
   2026-08-25 through SCANGATE with exact-page ALLOW receipts.

**Failure condition:** stop or redesign the adaptation if it creates a second
hidden geometry model, makes a rendered view disagree with the semantic model,
adds silent inference, or increases unresolved findings versus equivalent
hand-authored TurtlePen diagrams.

## What Structurizr establishes

Official documentation describes a workspace as one architecture model plus
views, documentation, and architecture decision records. It supports multiple
diagram types from that model, tagged filtered views, ordered dynamic views,
static perspectives, cascading tag styles, themes, inspections, and
relationship routing modes of Direct, Curved, and Orthogonal.

The diagram editor only changes layout, not model content. Curved relationships
remain vertex-based and their routing can be toggled without changing what the
relationship means. That separation is the most useful principle for TurtlePen.

## Disposition table

| Structurizr pattern | Decision | TurtlePen adaptation |
|---|---|---|
| One model, many views | **Adapt** | Add a semantic model/view layer above pages; pages remain render layers, not pretend views. |
| Semantic relationships | **Match and improve** | Node-port relationships carry description, technology, tags, and routing; exact pieces remain inspectable and validated. |
| Direct/orthogonal/curved routing | **Match and improve** | One `connect` operation; curved routes use explicit whole-quadrant vertices and exact rasterized footprints. |
| Filtered views by tag | **Adapt** | Durable include/exclude view definitions with deterministic membership receipts. |
| Dynamic views | **Adapt** | Ordered relationship instances for one use case, with order visible in data and output. |
| Perspectives | **Adapt** | Named values/descriptions on elements and relationships; view overlay changes presentation only. |
| Cascading tag styles/themes | **Adapt** | Document-owned tokens and tag rules; no remote theme dependency in the core format. |
| Automatic diagram key | **Match** | Generate a key from resolved tags/styles so notation explains itself. |
| Workspace inspections | **Differentiate** | Fold metadata inspections into TurtlePen's fingerprinted finding system with executable fixes where possible. |
| Documentation and ADRs | **Adapt later** | Attach local, relative sources with explicit resource selection and a generated static bundle; do not silently ingest arbitrary paths. |
| Interactive viewer/editor | **Differentiate** | Approval workbench for semantic and layout diffs, not a content-authoring drag-and-drop clone. |
| Server/cloud/licensing/admin | **Ignore** | Outside TurtlePen's local verified-compiler purpose. |
| Provider icon themes | **Investigate** | Useful domain packs, but license/provenance and deterministic embedding must be solved first. |

## First implementation slice

### A. Truthful foundations

- schema migration and perceptual-review persistence;
- validation state aligned with the save gate;
- runtime JSON Schema enforcement;
- runtime/build diagnostics.

### B. Semantic annotations

Add description, technology, tags, properties, and perspectives as durable
metadata on elements and relationships. Metadata changes must be rehearsable,
undoable, serializable, and visible through `describe`.

### C. Node-attached relationships

Add one `connect` operation/tool:

```json
{
  "id": "api-to-db",
  "from": "api.E",
  "to": "db.W",
  "routing": "curved",
  "via": ["N12.q2"],
  "description": "Reads customer records from",
  "technology": "SQL/TLS",
  "tags": ["data", "sensitive"]
}
```

- `direct` joins the two node seats with an exact ray;
- `orthogonal` uses the existing inspectable router;
- `curved` passes through one or more explicit vertices and uses the existing
  deterministic curve rasterizer;
- every route records source and target ports, so the edge is authored fact;
- a curved route without a vertex is refused because it would be visually
  indistinguishable from a direct route;
- changing routing never changes relationship meaning.

### D. Subsequent slices

1. durable view definitions and tag filters;
2. dynamic ordered relationship views;
3. perspectives and document-owned tag styles;
4. generated diagram key;
5. metadata inspections;
6. documentation/ADR bundle;
7. viewer approval and view switching.

## Acceptance for the first slice

1. Schema-1 documents open through a tested migration and save as schema 2.
2. Perceptual review survives direct and MCP save/reopen/undo flows.
3. Unknown MCP arguments fail with an exact field path.
4. The running package version/tool count/source fingerprint are queryable.
5. Direct, orthogonal, and curved connections start and end at named node ports.
6. A curved connection passes through every supplied vertex, remains
   contiguous, has one target-facing arrowhead, and validates like any path.
7. Relationship meaning and metadata survive save/reopen and path replacement.
8. `plan` and direct calls execute the same operation and reject the same input.
9. `describe` reports relationship semantics and routing without requiring the
   reader to inspect hundreds of quadrants.
10. The full regression suite and real MCP endpoint matrix pass.

## Primary sources

- [Structurizr features](https://docs.structurizr.com/features)
- [Structurizr workspaces](https://docs.structurizr.com/workspaces)
- [Structurizr inspections](https://docs.structurizr.com/workspaces/inspections)
- [Structurizr notation](https://docs.structurizr.com/server/diagrams/notation)
- [Structurizr diagram editor](https://docs.structurizr.com/server/diagrams/editor)
- [Filtered views](https://docs.structurizr.com/dsl/cookbook/filtered-view/)
- [Dynamic views](https://docs.structurizr.com/dsl/cookbook/dynamic-view/)
- [Static perspectives](https://docs.structurizr.com/dsl/cookbook/perspectives-static/)
- [Themes](https://docs.structurizr.com/dsl/cookbook/themes/)
- [Documentation](https://docs.structurizr.com/dsl/docs)
- [Architecture decision records](https://docs.structurizr.com/dsl/adrs)
