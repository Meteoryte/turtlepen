# Native editing workflows

TurtlePen 0.5 adds selection queries, exact artwork transforms, radial/repeated
copies, path color fields, shape cuts, construction guides, protected duplicate
cleanup, page composition, and richer timeline interchange. These are native
operations: direct calls, `plan`, MCP, undo/redo, and persisted documents use the
same implementation. Run `pnpm run editing-session` for the rendered example.

## Find, rehearse, edit, recover

1. `query {tags:["artwork"], limit:100}` returns explicit IDs and `nextOffset`.
   Filters are ANDed. `invert` applies within the chosen page. Region bounds
   use quadrants; nearest-object distance is to the bounding rectangle.
2. Pass the IDs to `plan {operations:[...], commit:false}`. Plans change no
   document state. `commit:true` is all-or-nothing. `expectedHash` guards
   against another actor changing the active document.
3. Use the same operation directly when ready. Every new mutation checkpoints
   the document and participates in durable history.
4. `history {action:"undo"}` and `redo` work after `open_diagram`. A refused
   transform, incompatible group, duplicate ID, or malformed nested plan leaves
   the previous state intact.

## Exact artwork and color

```json
{"op":"transform","ids":["symbol"],"rotate":90,"pivot":"K11.q1","copyPrefix":"turned"}
{"op":"transform","ids":["symbol"],"flip":"horizontal"}
{"op":"stroke_to_path","id":"symbol"}
{"op":"transform","ids":["symbol"],"scaleX":2,"scaleY":3}
{"op":"array","id":"symbol","mode":"radial","count":4,"rotate":90,"pivot":"Q20.q1"}
{"op":"paint_path","ids":["symbol"],"gradient":{"type":"radial","from":"#fff","to":"#123","radius":12}}
```

Transforms support path artwork and flat artwork groups. Quarter turns and
reflections transform piece directions as well as positions. Scaling requires
explicit cell paint because multiplying the occupied cells of a thin stroke is
a different visual operation. Copies use `prefix-originalId`; repeated arrays
use `prefix-N`, and include the original in `count`.

The default pivot is the bounding cell center, or the top-left for scale. A
half-grid result refuses; supply an explicit address. Negative results,
non-path objects, semantic connectors, and pixel-masked paths refuse rather
than lose their meaning. Follow relationships are re-anchored once for the
whole selection, then propagated to descendants.

`paint_path` changes color, width, or cap without changing occupancy. Linear and
radial fields become ordinary piece colors. SVG and PNG render colored strokes
and cell artwork from those same samples. A solid color removes the prior
piece-color override.

## Cuts, nodes, and measurement

`slice {id,cutter,mode:"partition",footprint:"claimed"}` partitions exact
inside/outside geometry and retains the cutter. `divide` also separates each
connected component. Axis/at slicing remains available. Every result is named
and every input quadrant belongs to a returned partition.

`path_edit` adds `move_many` and `align_nodes` with explicit indices, `trim`
with an inclusive index range, `interpolate` with an exact Bresenham bridge,
and `extend_to` with the nearest forward intersection of the terminal ray and
a named cutter. No hit is an error. Edited paths clear their stale pen cursor.

`inspect` reports ordered piece/segment counts, lengths, angles, continuity,
nearest occupied quadrants, and bounded segment pages. Occupied-area perimeter
and ordered path length are different measurements. SVG already coalesces
collinear presentation runs; removing their stored quadrants would change
collision geometry and is not a valid storage cleanup.

## Construction and cleanup

`guide {id,from,to}` creates a native horizontal/vertical overlay path.
`guide {action:"snap",id,ids,anchor}` moves explicit anchors to its nearest
occupied quadrant. Query `properties:{constructionGuide:"true"}` to inspect.
Remove the guide after use. `release_check` rejects remaining construction
guides even on hidden pages, independently of structural acceptances.

`cleanup {ids,removeDuplicates:true,emptyGroups:true}` keeps the first exact
path record in caller order. Different authored semantics, group ownership,
references, pixel masks, transparency, or intervening ink protect a duplicate.
The response reports removals and protected matches. This is exact cleanup,
not an approximate geometry simplifier.

## Layout, groups, and pages

`align` accepts a reference element or `reference:"canvas"`; `exact:true`
refuses fractional center motion. `distribute` already used edge gaps; an
explicit integer `gap` now anchors the first object, and `exact:true` refuses
fractional computed gaps. Legacy selection centering retains its existing
off-canvas behavior; ordinary validation reports the resulting geometry.

`group {action:"restyle",id,style}` applies measured box/text presentation
atomically. Use `paint_path` for artwork groups. `page` supports `duplicate`,
`merge`, `solo`, and `show_all`. Duplicate IDs are deterministic. Generated
semantic content, connected sources, guides, and pixel masks require explicit
source-level duplication; the tool refuses unsupported copies. Merging a
timeline-owned page requires updating that timeline first.

## Timeline display and interchange

`currentDate` now produces an in-domain temporal marker or a clearly labelled
context/outside-range fact. An ordinal axis does not invent a quantitative
position. `showRelationships:true` renders native orthogonal event connectors
with stable IDs and labels. It defaults off for existing layout compatibility;
missing routes refuse instead of silently crossing a box.

`export_timeline {id,format:"json"}` returns complete semantic source. Saving
the native document also retains manual primitive overrides and review history.
`format:"mermaid"` is an explicit content projection: it reports identity
mapping and layout omissions, and refuses unrepresentable event fields with an
enumerated `unsupported` list. It never claims a lossless Mermaid document.

## Scope of completion

The native workflows above are implemented and tested. The historical SVG RFC
also catalogs separate ideas: live/nested clipping effects, page locks enforced
across every direct mutator, generalized markers, advanced image tracing,
JPEG/WebP codecs, arbitrary affine/Bézier geometry, proportional typography,
and account-owned hosted workspaces. These are not claimed as shipped. See the
capability status for the remaining rows; the old blanket gap-closure claim has
been removed. A passing local suite is not a production deployment or external
model benchmark.
