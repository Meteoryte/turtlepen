# Lattice-native SVG editing

TurtlePen now supports a practical editing vocabulary for repairing existing
diagram geometry without redrawing it. These operations work on TurtlePen’s
stored **whole-quadrant** footprints, not on hidden floating-point Bézier
curves. Every result is therefore deterministic, serializable, collision-aware,
undoable, and usable inside `plan`.

This is deliberately different from claiming a general SVG editor. An operation
that needs sub-quadrant geometry, a guessed fill rule, or a GUI-only selection
state is refused or remains outside this vocabulary rather than silently
approximated.

## Editing operations

| Tool / plan operation | Exact behavior |
|---|---|
| `boolean` | `union`, `difference`, `intersection`, and `xor` over two or more element footprints. `visual` is the default; choose `claimed` when layout reservation geometry is intended. |
| `slice` | Splits one element on a named vertical or horizontal lattice boundary. `divide` emits each edge-connected result; `partition` emits one result per side. Result IDs are stable (`source-part-1`, `source-part-2`, …) unless explicitly supplied. |
| `offset_path` | Signed lattice morphology. Positive distance expands and negative distance contracts with a square (Chebyshev) neighborhood. Empty and off-grid results are errors. |
| `stroke_to_path` | Converts a path’s stored collision quadrants into cell-painted artwork. Since TurtlePen stroke widths are at most one 5px quadrant, it never invents fractional outline geometry. |
| `path_edit` | Inserts, moves, deletes, reverses, opens, closes, splits, or joins explicit lattice path pieces. A close operation draws an exact Bresenham bridge. Direct piece edits clear the saved pen cursor and targets, so `extend_path` cannot accidentally continue stale geometry. |
| `normalize_path` | Removes repeated quadrants while preserving first-occurrence order. It does not simplify, move, or infer geometry. |
| `reorder` | Changes draw order within a page (`bring_to_front`, `send_to_back`, `raise`, `lower`, `before`, `after`). It does not hide a same-page collision; use an overlay page for intentional stacking. |
| `duplicate` | Creates one deep copy with an explicit ID and whole-quadrant delta. Flat-group membership follows the copy; follow constraints do not. |
| `array` | Creates a bounded rectangular copy array with stable row-major IDs. The source remains at row 0, column 0. |
| `inspect` | Returns exact areas, perimeters, integer bounds, rational centers, shared quadrants, and pairwise bounding gaps without mutating the document. |

Derived geometry records its source IDs and operation in `provenance`. Destructive
operations refuse to silently erase a source that is referenced by a follow
constraint. A result can retain the source with `removeSources: false` or
`removeSource: false` when a non-destructive comparison is needed.

## Worked repair workflow

This batch edits a pair of overlapping boxes into a separate, measured outline.
It can be rehearsed unchanged with `plan { operations }`; add `commit: true`
only after reviewing the validation log.

```json
[
  { "op": "boolean", "action": "union", "ids": ["logo-left", "logo-right"], "id": "logo" },
  { "op": "offset_path", "id": "logo", "distance": 1, "resultId": "logo-outline", "removeSource": false },
  { "op": "slice", "id": "logo-outline", "axis": "vertical", "at": "M1.tl" },
  { "op": "reorder", "id": "logo-outline-part-2", "action": "bring_to_front" }
]
```

Inspect the result explicitly:

```text
inspect { ids: ["logo-outline-part-1", "logo-outline-part-2"] }
```

The response includes the exact output IDs, quadrant area, perimeter, and any
shared quadrants. `validate` still decides whether the edited result conflicts
with the rest of the diagram.

## Deliberate boundaries

The following remain separate future design work, not partial implementations:

- arbitrary Bézier node/handle editing, freeform knives, and arbitrary affine
  transforms;
- gradients, SVG paint servers, clip paths, masks, filters, and raw `<defs>`;
- arbitrary SVG import and lossless foreign-SVG round trips;
- text outlining, variable-width strokes, and raster-to-vector tracing.

Those features need a document model beyond exact quadrant sets. They should
gain an explicit invariant-preserving design before they are exposed, rather
than being presented as exact when they are not.
