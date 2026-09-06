# SVG editing capability status

The answer to [the SVG editing capability audit RFC](https://github.com/Meteoryte/turtlepen/pull/6).
Every capability that RFC lists carries exactly one status:

| Status | Meaning |
|---|---|
| **SUPPORTED** | a first-class core operation with an MCP tool, plan parity, history, and tests |
| **PARTIAL** | reachable, but with a limit that matters — stated here, never implied |
| **MISSING** | no reliable operation exists; compatible with the lattice and worth building |
| **OUT OF SCOPE** | conflicts with the integer-exact model, or belongs outside TurtlePen |

Updated 2026-09-05 against 84 live tools and 55 native operations.
The broader catalog retains explicit unimplemented items; this is not a claim
that every conventional SVG-editor feature ships in TurtlePen. Where a row says
SUPPORTED, `search_help { query }` will find the tool that does it.

**The one thing that governs every row below.** TurtlePen stores geometry as
whole 5px quadrants on an integer lattice. It has no float coordinates and no
Bézier control points, so anything whose *definition* requires a sub-quadrant
position — a smooth node, a handle, a 37° rotation — is OUT OF SCOPE by
construction rather than by omission. That is not a gap to be closed later; it
is the property the rest of the engine is built on. Where the RFC asks for such
a thing, this document says so plainly instead of offering an approximation.

---

## 1. Boolean / path-combination

| Capability | Status | Notes |
|---|---|---|
| Union / Unite / Weld | **SUPPORTED** | `boolean { action: "union" }`, exact quadrant set algebra |
| Difference / Subtract | **SUPPORTED** | `boolean { action: "difference" }`, `ids` in subtraction order |
| Intersection | **SUPPORTED** | `boolean { action: "intersection" }` |
| Exclusion / XOR | **SUPPORTED** | `boolean { action: "xor" }` |
| Division / Divide | **SUPPORTED** | `slice { mode: "divide" }` emits each edge-connected region |
| Cut Path | **SUPPORTED** | `path_edit { action: "split" }` |
| Split / Break Apart | **SUPPORTED** | `slice { mode: "partition" }`, deterministic result ids |
| Combine / Compound Path | **PARTIAL** | `group` owns membership; there is no compound-path element with its own fill rule |
| Release / Break Compound | **PARTIAL** | `group { action: "delete" }` releases membership, not a fill-rule identity |
| Trim | **SUPPORTED** | `boolean { action: "difference" }` against the trimming shape |
| Outline / Contour | **SUPPORTED** | `offset_path`, then `boolean difference` against the source |
| Inset | **SUPPORTED** | `offset_path { distance: -n }` |
| Outset | **SUPPORTED** | `offset_path { distance: n }` |
| Offset Path, signed distance | **SUPPORTED** | signed whole quadrants; empty and off-grid results are errors, never clamped |
| Fill-rule behaviour after booleans | **OUT OF SCOPE** | a quadrant is occupied or it is not, so `nonzero` and `evenodd` cannot differ |

Booleans default to `footprint: "visual"` (visible ink) and take `"claimed"`
for layout-reservation geometry. Those are genuinely different questions, and
the engine refuses to guess which one was meant.

## 2. Slice / knife / cutting

| Capability | Status | Notes |
|---|---|---|
| Slice object with another path | **SUPPORTED** | `slice { id, cutter }` partitions exact intersection and complement; cutter retained |
| Knife cut | **PARTIAL** | axis-aligned only, via `slice` |
| Scissors / cut at node | **SUPPORTED** | `path_edit { action: "split", index }` |
| Cut at path intersection | **SUPPORTED** | `slice { cutter, mode:"divide" }` emits connected intersection/complement partitions |
| Straight-line cut | **PARTIAL** | vertical and horizontal only; a diagonal cut has no exact lattice form on both sides |
| Polyline / freeform cut | **MISSING** | needs a cutting-path model |
| Shape-based cut | **MISSING** | see the first row |
| Divide into closed regions | **SUPPORTED** | `slice { mode: "divide" }` |
| Delete segment between intersections | **MISSING** | |
| Trim segment | **PARTIAL** | `path_edit { action: "delete", index }` removes a piece, not a measured length |
| Extend segment to intersection | **SUPPORTED** | `path_edit { action:"extend_to", cutter }` finds the nearest forward lattice intersection |
| Deterministic new object ids | **SUPPORTED** | `source-part-1`, `source-part-2`, …, overridable via `ids` |

## 3. Direct path and node editing

`path_edit` is the whole answer here, and its vocabulary is lattice pieces
rather than Bézier nodes.

| Capability | Status | Notes |
|---|---|---|
| Add node | **SUPPORTED** | `path_edit { action: "insert", index, at }` |
| Delete node | **SUPPORTED** | `action: "delete"` |
| Move node | **SUPPORTED** | `action: "move"` |
| Move multiple nodes | **SUPPORTED** | `path_edit { action:"move_many", indices, dx, dy }` |
| Join nodes / join endpoints | **SUPPORTED** | `action: "join", with` |
| Break node | **SUPPORTED** | `action: "split"` |
| Split path at node | **SUPPORTED** | `action: "split", index` |
| Split at distance / percentage | **MISSING** | compatible: quadrant counts along a path are exact |
| Open path | **SUPPORTED** | `action: "open"` |
| Close path | **SUPPORTED** | `action: "close"` draws an exact Bresenham bridge |
| Reverse path direction | **SUPPORTED** | `action: "reverse"` |
| Convert node to corner / cusp / smooth / symmetric | **OUT OF SCOPE** | node *types* exist only where handles do |
| Auto-smooth node | **OUT OF SCOPE** | same reason |
| Straighten selected segment | **PARTIAL** | `replace_path` redraws it as a ray |
| Curve selected segment | **PARTIAL** | `pen` has arc and curve primitives; converting an existing straight segment in place is not an operation |
| Edit / rotate Bézier handles, change handle length | **OUT OF SCOPE** | there are no handles to edit |
| Simplify path | **MISSING** | needs a stated error tolerance, which needs a definition of "close enough" on a lattice |
| Smooth path | **OUT OF SCOPE** | |
| Remove redundant / duplicate nodes | **SUPPORTED** | `normalize_path` |
| Merge collinear segments | **PARTIAL** | SVG rendering already coalesces collinear runs; stored occupancy retains every quadrant. No geometry-deleting storage operation is claimed |
| Resample path | **MISSING** | |
| Interpolate nodes / path | **SUPPORTED** | `path_edit { action:"interpolate", index, endIndex }` replaces the segment with an exact Bresenham bridge |

## 4. Shape construction / primitives

| Capability | Status | Notes |
|---|---|---|
| Rectangle | **SUPPORTED** | `place_box` |
| Rounded rectangle | **SUPPORTED** | `place_box { corner: "rounded" }`, also `indented` and `chamfered` |
| Circle | **SUPPORTED** | `pen` `circle` and `disc` |
| Ellipse | **SUPPORTED** | `pen` `ellipse` |
| Line | **SUPPORTED** | `pen` `ray` — Bresenham, any angle |
| Polyline | **SUPPORTED** | `pen` |
| Polygon / regular polygon | **SUPPORTED** | `pen` `polygon`, plus `triangle` and `box` |
| Star | **PARTIAL** | expressible as a polygon program; not a named primitive |
| Arc | **SUPPORTED** | `pen` `arc` and `curve` |
| Pie / sector | **PARTIAL** | `arc` plus two rays, closed, then the `fill` modifier |
| Spiral | **MISSING** | |
| Freehand path | **SUPPORTED** | `pen` is a freehand program |
| Bézier path | **OUT OF SCOPE** | |
| Convert primitive to editable path | **SUPPORTED** | `stroke_to_path` |
| Flowchart symbols | **SUPPORTED** | `place_box { shape }` — process, decision, terminator, io, prep, manual, data, document, bar, lane, group |

## 5. Transforms

Exact artwork transforms are now native operations. Quarter turns, reflections,
and integer cell magnification keep the lattice model; unsupported semantic or
pixel-mask transformations refuse before mutation.

| Capability | Status | Notes |
|---|---|---|
| Translate / move | **SUPPORTED** | `move` by address, cells, or page |
| Scale uniformly / X only / Y only | **SUPPORTED** | `transform { scaleX, scaleY }` magnifies explicit cell-painted artwork; ordinary box sizing remains `resize` |
| Rotate | **SUPPORTED** | `transform { rotate:90|180|270 }`; arbitrary angles remain outside the exact model |
| Rotate around arbitrary pivot | **SUPPORTED** | `transform { rotate, pivot }` with an explicit lattice address |
| Flip horizontal | **SUPPORTED** | `transform { flip:"horizontal" }` |
| Flip vertical | **SUPPORTED** | `transform { flip:"vertical" }` |
| Reflect across arbitrary line | **PARTIAL** | exact only for lattice-aligned axes |
| Skew / shear X or Y | **OUT OF SCOPE** | no exact lattice form |
| Numeric transform | **SUPPORTED** | every operation is numeric; there is no other kind |
| Transform matrix import / export | **OUT OF SCOPE** | `import_svg` refuses `transform` by name rather than baking an approximation |
| Bake / flatten transform into geometry | **SUPPORTED** | vacuously — geometry is always already baked |
| Reset transform | **OUT OF SCOPE** | nothing carries a pending transform |
| Transform group | **SUPPORTED** | `transform { group }` for path artwork; `paint_path` styles artwork and `group restyle` styles box/text groups |
| Transform selection, relative positions preserved | **SUPPORTED** | `group` moves every member by one exact delta |

## 6. Alignment and distribution

| Capability | Status | Notes |
|---|---|---|
| Align left / right / top / bottom | **SUPPORTED** | `align { ids, edge }` |
| Align horizontal / vertical centre | **SUPPORTED** | `align` |
| Align to canvas / page | **SUPPORTED** | `align { reference:"canvas" }` uses the shared canvas |
| Align to selection bounds | **SUPPORTED** | this is `align`'s model |
| Align to key / reference object | **SUPPORTED** | `align { reference:elementId }` leaves an unselected reference unchanged |
| Align nodes | **SUPPORTED** | `path_edit { action:"align_nodes", indices, axis, at }` |
| Align text baselines | **PARTIAL** | `stroke_label` and box `align` cover the common cases |
| Distribute horizontally / vertically | **SUPPORTED** | `distribute { ids, axis }` |
| Equal centre spacing | **PARTIAL** | Use explicit `move`/plan for centers; `distribute` owns edge gaps, correcting the previous description |
| Equal edge gaps | **SUPPORTED** | `distribute { gap?, exact? }`; computed fractional gaps can be explicitly refused |
| Space around / pack objects | **SUPPORTED** | `layout` is a real auto-layout with gaps and direction |
| Explicit collision-aware distribution | **SUPPORTED** | `validate` judges the result; `layout` reroutes connectors |

## 7. Snapping / construction constraints

Snapping is a GUI answer to a problem TurtlePen does not have: there is no
sub-lattice position to snap *from*. Addresses are the snap.

| Capability | Status | Notes |
|---|---|---|
| Snap to lattice / grid | **SUPPORTED** | every address is on the lattice; there is no other option |
| Snap to node / path / midpoint | **SUPPORTED** | anchors and ports — `unit.N`, `.q1`, `.tl` |
| Snap to intersection | **SUPPORTED** | `inspect` returns exact intersection cells |
| Snap to bounding box / object centre | **SUPPORTED** | `inspect` returns integer bounds and rational centres |
| Snap to guide | **SUPPORTED** | `guide { action:"snap", id, ids, anchor }` |
| Snap to angle increment / snap rotation | **SUPPORTED** | `transform` only accepts exact quarter turns |
| Tangential / perpendicular / handle snap | **OUT OF SCOPE** | |
| Smart-guide equivalent | **SUPPORTED** | `free_space` answers "where does this fit" directly |

## 8. Stroke

| Capability | Status | Notes |
|---|---|---|
| Stroke width | **PARTIAL** | `pen { width }`; collision geometry is one quadrant |
| Stroke colour | **SUPPORTED** | `pen { color }` |
| Stroke opacity | **SUPPORTED** | element and page opacity |
| Dash pattern | **SUPPORTED** | `pen { pattern: "dashed" \| "dotted" }`, keyed to distance travelled so a dash survives a corner |
| Dash offset | **SUPPORTED** | `pen { pattern, patternOffset }` shifts whole-quadrant cycles and retains structural pieces |
| Butt / round / square cap | **SUPPORTED** | `pen { cap }` |
| Miter / round / bevel join, miter limit | **OUT OF SCOPE** | a quadrant corner has one form |
| Variable-width stroke | **OUT OF SCOPE** | |
| Pressure / profile stroke | **OUT OF SCOPE** | |
| Stroke alignment | **OUT OF SCOPE** | a stroke occupies quadrants; there is no centre line to align to |
| Marker start / middle / end | **PARTIAL** | `connect` places arrowheads; general markers do not exist |
| Arrowhead helpers | **SUPPORTED** | `connect`, either or both ends |
| Stroke to Path / Expand Stroke | **SUPPORTED** | `stroke_to_path`; exact because width never exceeds one quadrant |
| Tapered stroke | **OUT OF SCOPE** | |

## 9. Fill

| Capability | Status | Notes |
|---|---|---|
| Solid fill | **SUPPORTED** | `restyle { fill }`, `place_box { fill }` |
| No fill | **SUPPORTED** | `fill: null` |
| Fill opacity | **SUPPORTED** | per element and per page |
| Linear gradient, stops, angle | **SUPPORTED** | `fill: { from, to, angle }` on a box; `pen { fillColor: { from, to } }` gradates across a filled region |
| Radial gradient | **SUPPORTED** | `paint_path { gradient:{type:"radial",from,to,...} }` bakes colors into native pieces |
| Gradient transform | **OUT OF SCOPE** | |
| Mesh gradient | **OUT OF SCOPE** | |
| Pattern fill | **SUPPORTED** | `pen { texture }`, plus `tone` and `feather` |
| Image fill | **SUPPORTED** | `place_image`, including tonal dither |
| `nonzero` / `evenodd` fill rule | **OUT OF SCOPE** | see §1 |
| Region fill | **SUPPORTED** | the `fill` modifier in a `pen` program; it floods from outside and inverts, so an UNCLOSED outline fills nothing rather than leaking |
| Convert fill appearance to durable geometry | **SUPPORTED** | a filled region is real quadrants, not a render-time style |

## 10 and 11. Clipping and masking

| Capability | Status | Notes |
|---|---|---|
| Create / release / edit clip path | **MISSING** | a clip is a compatible idea: intersect a footprint with a region |
| Nested clipping, inverted clipping, clip groups | **MISSING** | |
| Create / release / edit mask | **PARTIAL** | `micro_mask` is a reversible 1-design-pixel eraser, not a general mask |
| Alpha / luminance semantics | **OUT OF SCOPE** | a quadrant is opaque or absent |
| Gradient transparency masks | **OUT OF SCOPE** | |
| Nested masks | **OUT OF SCOPE** | |
| Preserve clipping / masks through serialization | **PARTIAL** | `micro_mask` state is durable and undoable |
| Collision / measurement policy for clipped or masked geometry | **SUPPORTED** | `micro_mask` deliberately does not change structural geometry, and says so |

`import_svg` refuses `clipPath`, `mask` and `filter` by name rather than
dropping them silently. An import that quietly loses a mask is worse than one
that refuses.

## 12. Grouping / hierarchy

| Capability | Status | Notes |
|---|---|---|
| Group / ungroup | **SUPPORTED** | `group { action }` |
| Nested groups | **OUT OF SCOPE** | groups are deliberately flat; membership is explicit ids |
| Add / remove group members | **SUPPORTED** | |
| Move group | **SUPPORTED** | `group { cellsX, cellsY }` |
| Transform group | **SUPPORTED** | `transform { group }` for path artwork; `paint_path` styles artwork and `group restyle` styles box/text groups |
| Restyle group | **SUPPORTED** | Atomic `group { action:"restyle", style }` for box/text presentation; `paint_path {group}` for artwork |
| Select parent / children | **SUPPORTED** | `group { action: "inspect" }` |
| Move object into / out of a group | **SUPPORTED** | |
| Group bounds | **SUPPORTED** | |
| Group-level boolean behaviour policy | **PARTIAL** | `boolean` takes explicit ids, so a group is expanded by the caller |
| Stable group serialization | **SUPPORTED** | deterministic, and follows rename and removal |
| Follow constraints | **SUPPORTED** | beyond the RFC: durable anchor-to-anchor relationships, cycles refused |

## 13. Layers / pages / stacking

| Capability | Status | Notes |
|---|---|---|
| Create layer / page | **SUPPORTED** | `add_page` |
| Rename layer / page | **SUPPORTED** | `update_page { title }` |
| Delete layer / page | **SUPPORTED** | `remove_page` |
| Duplicate layer / page | **PARTIAL** | `page duplicate` copies independent artwork; refuses generated semantics, relationships, guides, and pixel masks explicitly |
| Reorder layer / page | **SUPPORTED** | `update_page { z }` |
| Lock layer / page | **MISSING** | |
| Hide / show layer / page | **SUPPORTED** | `update_page { visible }` |
| Solo layer / page | **SUPPORTED** | `page {action:"solo"|"show_all",id}` |
| Merge layers / pages | **PARTIAL** | `page merge` retains ids; timeline-owned pages require a semantic source update first |
| Move selection to layer / page | **SUPPORTED** | `move { toPage }` |
| Bring to front / send to back | **SUPPORTED** | `reorder` |
| Raise one step / lower one step | **SUPPORTED** | `reorder { action: "raise" \| "lower" }` |
| Move before / after named element | **SUPPORTED** | `reorder { action: "before" \| "after", relative }` |
| Deterministic draw order after splits and booleans | **SUPPORTED** | results keep the source's position in order |

Z-pages are TurtlePen's layers, with one difference worth stating: `reorder`
changes draw order *within* a page and does not hide a same-page collision.
Intentional stacking uses an overlay page, and validation still reports it.

## 14. Duplication / cloning / arrays

| Capability | Status | Notes |
|---|---|---|
| Duplicate | **SUPPORTED** | `duplicate { id, to, dx, dy }` |
| Copy / paste equivalent | **SUPPORTED** | `duplicate` |
| Paste in place | **SUPPORTED** | `duplicate` with a zero delta |
| Linked clone / instance / reference | **OUT OF SCOPE** | a live reference conflicts with explicit geometry; `constraint` covers the useful part |
| Break clone link | **OUT OF SCOPE** | |
| Repeat last transform | **SUPPORTED** | `array { mode:"repeat", ... }` repeats explicit transform values; no hidden last-action state |
| Step-and-repeat / grid array / linear array | **SUPPORTED** | `array { columns, rows, stepX, stepY }`, row-major ids |
| Radial array | **SUPPORTED** | `array { mode:"radial",count,rotate,pivot }`, at most one revolution of quarter turns |
| Mirror duplication | **SUPPORTED** | `transform { flip, copyPrefix }` |
| Pattern / scatter duplication | **OUT OF SCOPE** | |
| Deterministic generated ids | **SUPPORTED** | throughout |

## 15. Shape generation and deformation

Pattern along path, blend, morph, bend, envelope deformation, warp, twist,
roughen, lattice deformation and live symmetry are all **OUT OF SCOPE**, with
one exception: `perspective_scene` builds a real perspective projection from a
room, an eye and a target, so **perspective construction is SUPPORTED** even
though perspective *deformation of existing geometry* is not.

These need continuous coordinates to mean anything. Approximating them on the
lattice would produce a shape whose relationship to the request is unstated,
which is the failure mode the whole engine is arranged to prevent.

## 16. Corner operations

| Capability | Status | Notes |
|---|---|---|
| Round corner / fillet | **SUPPORTED** | `place_box { corner: "rounded" }` |
| Chamfer | **SUPPORTED** | `corner: "chamfered"` |
| Bevel | **SUPPORTED** | `corner: "indented"` |
| Global corner radius | **SUPPORTED** | one corner style per box |
| Per-corner radius | **MISSING** | |
| Convert corner treatment into explicit path geometry | **SUPPORTED** | `stroke_to_path` |

## 17. Text

| Capability | Status | Notes |
|---|---|---|
| Plain text / text box | **SUPPORTED** | box labels, `stroke_label` |
| Font family | **PARTIAL** | one lattice face, TurtleFont, 441 glyphs |
| Weight | **PARTIAL** | stroke width, not a weight axis |
| Size | **SUPPORTED** | `stroke_text { size }` |
| Tracking / letter spacing | **SUPPORTED** | `stroke_text { tracking }` |
| Kerning | **PARTIAL** | per-pair kerning is not exposed; `measure` reports exact fit |
| Line height | **PARTIAL** | `maxWidth` wraps; leading is not a separate control |
| Baseline shift | **MISSING** | |
| Horizontal alignment / text anchor | **SUPPORTED** | `stroke_text { align }` |
| Vertical alignment | **PARTIAL** | box `align` |
| Text on path | **MISSING** | |
| Text inside shape | **SUPPORTED** | labels are measured against the symbol, not the bounding box |
| Vertical text | **PARTIAL** | `stroke_text { rotate }` |
| **Text to Path / Convert to Outlines** | **SUPPORTED** | `stroke_text` *is* outlined text — TurtlePen has no font dependency to lose |
| Preserve measured text-fit diagnostics | **SUPPORTED** | `measure` before placement, and fit status in `describe` |

`font_coverage` and `glyph` report exactly which characters the face has, which
is the honest form of "will this render".

## 18. Raster / image

| Capability | Status | Notes |
|---|---|---|
| Embed image | **SUPPORTED** | `place_image`, data-URI or file |
| Link image | **OUT OF SCOPE** | a link that can rot is not exact |
| Resize | **SUPPORTED** | `place_image { span, fit }`; `measure_image` first |
| Crop | **PARTIAL** | `fit: "cover"` crops |
| Clip image / mask image | **PARTIAL** | needs §10 |
| Rasterize vector selection | **SUPPORTED** | PNG export |
| Trace bitmap / vectorize image | **PARTIAL** | `place_image { mode: "dither" }` and `place_reference` produce a tracing underlay |
| Posterized / colour trace | **MISSING** | |
| Edge trace | **MISSING** | |
| Multi-colour trace | **MISSING** | |
| Convert traced output to editable geometry | **PARTIAL** | dithered output is real quadrants; there is no path-extraction step |
| Preserve source / provenance metadata | **SUPPORTED** | source and run hashes are recorded |

## 19. Selection / query operations for AI editing

| Capability | Status | Notes |
|---|---|---|
| Find by id | **SUPPORTED** | `describe` |
| Find by kind / type | **SUPPORTED** | `describe` |
| Find by page / layer | **SUPPORTED** | `describe { page }` |
| Find by fill / stroke | **SUPPORTED** | `query {color}` matches normalized flat colors, gradient stops, and piece colors |
| Find by bounds / region | **SUPPORTED** | `describe { region }`, `free_space { region }` |
| Find intersecting a region | **SUPPORTED** | `free_space` |
| Find overlapping another object | **SUPPORTED** | `inspect` returns shared quadrants |
| Find contained objects | **SUPPORTED** | `query {within:{x,y,w,h}}` |
| Find nearest object / node | **SUPPORTED** | `query {nearest}` sorts by explicitly reported bounding-rectangle distance |
| Find by group membership | **SUPPORTED** | `group { action: "inspect" }` |
| Select-all equivalent | **SUPPORTED** | `query {}` returns a bounded ordered page with total and nextOffset |
| Invert query result against scope | **SUPPORTED** | `query {invert:true,page?,...}` |
| Return deterministic ordered id sets | **SUPPORTED** | throughout |
| No hidden selection state | **SUPPORTED** | there is no selection state at all; every operation takes explicit ids |

## 20. Measurement / inspection

The RFC calls this TurtlePen's natural strength, and it is: measurement before
placement is the engine's central rule rather than a feature.

| Capability | Status | Notes |
|---|---|---|
| Bounding box | **SUPPORTED** | integer bounds |
| Geometric bounds vs visual / stroke bounds | **SUPPORTED** | `footprint: "claimed"` vs `"visual"` — the distinction is first-class |
| Path length | **SUPPORTED** | `inspect` reports ordered piece-center lengths separately from occupied perimeter and discontinuous jumps |
| Perimeter | **SUPPORTED** | as above |
| Segment length | **SUPPORTED** | `inspect` returns bounded segment pages, squared and Euclidean lengths |
| Angle | **SUPPORTED** | `inspect` reports segment angles; coordinates remain integer |
| Node coordinates | **SUPPORTED** | addresses |
| Radius / diameter | **PARTIAL** | derivable from bounds |
| Area | **SUPPORTED** | `quadrants` and `areaPx2` |
| Distance between objects | **SUPPORTED** | pairwise bounding gaps |
| Distance between nodes | **SUPPORTED** | `inspect` reports segment deltas and lengths; `nearest` measures occupied quadrants |
| Object centre | **SUPPORTED** | exact rational centre, never rounded |
| Transform origin | **SUPPORTED** | `transform` returns the effective pivot |
| Intersection points | **SUPPORTED** | exact shared cells |
| Nearest point on path | **SUPPORTED** | `inspect {nearest}` returns the actual nearest occupied quadrant with deterministic ties |
| Signed offset distance | **SUPPORTED** | `offset_path` takes it and reports the result |
| Count nodes / segments / subpaths | **SUPPORTED** | `inspect` reports counts and continuity; disconnected jumps are explicit |
| Text fit | **SUPPORTED** | `measure` — beyond what the RFC asks |

## 21. Guides / construction geometry

| Capability | Status | Notes |
|---|---|---|
| Horizontal / vertical / angled / named guide | **PARTIAL** | `guide` supports named horizontal/vertical construction lines; arbitrary angled guide behavior is not shipped |
| Grid / lattice query | **SUPPORTED** | `turtlepen_help` returns live lattice constants; `free_space` queries it |
| Isometric / axonometric construction helper | **SUPPORTED** | `perspective_scene` |
| Baseline guide / grid | **SUPPORTED** | Horizontal named guide and explicit anchor snapping |
| Ruler / measurement line | **SUPPORTED** | `annotate`, and `wireframe` dimensions |
| Hide / show construction geometry | **SUPPORTED** | overlay pages with `visible: false` |
| Mark construction geometry as non-deliverable scaffolding | **SUPPORTED** | Persisted constructionGuide property and hard release blocker |
| Validation warning when temporary guides ship | **SUPPORTED** | `release_check` blocks even hidden guides, independent of acceptance records |

Named guides are persisted native overlay paths. Authors create them explicitly,
snap explicit anchors, then remove them. Remaining guides block release even
when their page is hidden.

## 22. Cleanup / normalization

| Capability | Status | Notes |
|---|---|---|
| Remove duplicate nodes | **SUPPORTED** | `normalize_path` |
| Remove duplicate paths | **SUPPORTED** | `cleanup` removes equivalent paths only when semantics, references, opacity and compositing are preserved |
| Merge collinear segments | **PARTIAL** | SVG rendering already coalesces collinear runs; stored occupancy retains every quadrant. No geometry-deleting storage operation is claimed |
| Simplify curves / path | **OUT OF SCOPE** | see §3 |
| Flatten transforms | **SUPPORTED** | vacuous; nothing is deferred |
| Flatten groups | **SUPPORTED** | groups are already flat |
| Remove hidden objects | **PARTIAL** | no sweep operation |
| Remove unused definitions | **OUT OF SCOPE** | there are no `<defs>` in the model |
| Remove empty groups | **SUPPORTED** | `cleanup {ids,emptyGroups:true}` |
| Remove stale ids / references | **SUPPORTED** | rename and removal cascade through groups and constraints |
| Normalize path commands | **OUT OF SCOPE** | the pen program is the representation |
| Relative ↔ absolute path commands | **OUT OF SCOPE** | same |
| Normalize style representation | **SUPPORTED** | `normalizeColor`, `normalizeStroke`, `normalizeFill` |
| Deduplicate gradients / patterns / markers | **OUT OF SCOPE** | no shared definition table exists |
| Produce a cleanup report before mutation | **SUPPORTED** | `plan` rehearses any batch without mutating |

## 23. SVG document-level operations

| Capability | Status | Notes |
|---|---|---|
| Parse SVG into the document model | **PARTIAL** | strict subset: solid lattice-aligned rectangles and 5px linear stroked paths |
| Serialize to SVG | **SUPPORTED** | `render`, `save` |
| Edit viewBox / resize canvas | **SUPPORTED** | `set_canvas` |
| Fit canvas to artwork | **SUPPORTED** | content bounds are computed; `render` forces full-canvas output |
| Fit artwork to canvas | **MISSING** | needs scaling — §5 |
| Change / normalize coordinate system | **OUT OF SCOPE** | there is one |
| Flatten SVG transforms | **OUT OF SCOPE** | `transform` is refused on import by name |
| Stable id management | **SUPPORTED** | `assertFreeId`, deterministic generated ids |
| `<defs>` / `<symbol>` / `<use>` handling | **OUT OF SCOPE** | refused on import |
| Gradient / pattern definition handling | **OUT OF SCOPE** on import | gradients and patterns are authorable natively — §9 |
| `clipPath` / mask / marker / filter definition handling | **OUT OF SCOPE** | refused by name |
| Preserve unsupported SVG constructs losslessly | **OUT OF SCOPE** | *deliberate.* Retaining opaque markup would mean elements the engine cannot measure, collide or validate — an object that lies about being editable |
| Report constructs that cannot round-trip safely | **SUPPORTED** | `inspect_svg` reports before mutating; import refuses by construct name |

The `quantize` policy the RFC asks for is implemented as specified: `reject` is
the default, `nearest` is the explicit opt-in, and every adjustment is reported.
`inward` and `outward` are **MISSING** — they only become meaningful once
clipping and scaling exist.

## 24. SVG filters / effects

Gaussian blur, drop and inner shadow, colour matrix, hue rotation, saturation,
brightness, contrast, displacement map, turbulence, lighting, blend modes,
composite, flood and filter chains are all **OUT OF SCOPE**.

Two rows are worth separating from the rest. Morphology — erode and dilate — is
**SUPPORTED**, but as `offset_path`: real geometry that can then be sliced and
measured, rather than a render-time effect. And "preserve raw SVG filters when
imported" is **OUT OF SCOPE** for the reason given in §23: an unmeasurable
element is worse than a refused one.

## 25. Import / export / conversion

| Capability | Status | Notes |
|---|---|---|
| TurtlePen → SVG | **SUPPORTED** | |
| SVG → TurtlePen | **PARTIAL** | the strict subset above |
| → PNG | **SUPPORTED** | |
| → PDF | **SUPPORTED** | |
| → JPEG | **MISSING** | |
| → WebP | **MISSING** | |
| → React component / JSX | **OUT OF SCOPE** | |
| Export raw path data | **SUPPORTED** | `describe`, `ascii` |
| Export icon-safe optimized SVG | **SUPPORTED** | output is already minimal and deterministic |
| Import SVG | **PARTIAL** | `import_svg` |
| Import PNG / JPEG as image or reference | **SUPPORTED** | `place_image`, `place_reference` |
| Import Mermaid | **SUPPORTED** | `import_mermaid` — beyond the RFC |
| PDF / EPS / DXF import | **OUT OF SCOPE** | |
| Report conversion losses explicitly | **SUPPORTED** | `inspect_svg` |

---

## Existing features, in conventional SVG vocabulary

The RFC asks that TurtlePen's own names be mapped to the terms a vector editor
would use, so that a capability is not reported missing merely because it is
called something else.

| Conventional term | TurtlePen already calls it |
|---|---|
| Layer | Z-page (`add_page`, `update_page`) |
| Artboard / canvas | `set_canvas` |
| Snap to grid | addressing — there is no off-lattice position |
| Bounding box | `inspect` integer bounds |
| Stroke expansion | `stroke_to_path` |
| Erode / dilate | `offset_path` with a negative or positive distance |
| Convert text to outlines | `stroke_text` — text is always outlines |
| Clipping (partial) | `micro_mask` |
| Instance / symbol | `constraint` — a durable follow relationship |
| Smart guides | `free_space` |
| Live-preview a change | `plan` without `commit` |
| Object metadata | `annotate`, `attach_resource` |
| Filtered view / layer comp | `define_view` |
| Theme / global styles | `configure_theme` |

## Where this leaves the RFC's P0 list

| P0 item | Status |
|---|---|
| 1. Boolean union / difference / intersection / XOR | **done** |
| 2. Slice / divide / knife | **done** for axis and exact shape-intersection partitions |
| 3. Path split / join / open / close / reverse | **done** |
| 4. Node / segment editing, in lattice terms | **done** |
| 5. Offset / inset / outset | **done** |
| 6. Stroke-to-path | **done** |
| 7. Z-order / reorder operations | **done** |
| 8. Duplicate / array operations | **done** |
| 9. Exact measurement / intersection queries | **done** |
| 10. Cleanup / normalization | **native exact workflow implemented** — duplicate cleanup protects meaning and compositing; rendering coalesces runs without deleting claimed quadrants |

## Native completion and remaining catalog

The four prioritized clusters now have native workflows: exact transforms and
copies, named guides with a release gate, shape/intersection cuts, and protected
duplicate cleanup. SVG presentation already merges collinear runs; removing
those quadrants from storage would change collision geometry.

See [native editing workflows](native-editing-workflows.md) for executable
examples and boundaries. Remaining MISSING/PARTIAL rows are still real ideas,
not silently relabeled complete. Live clipping/effect stacks, enforced page
locks, generalized markers, tracing/codecs, and arbitrary geometry need their
own implementation/model contracts. Hosted identity is separate product work.

## Worked example

[`examples/vector-repair-session.js`](../examples/vector-repair-session.js)
runs the RFC's target workflow end to end over the real stdio MCP: an SVG
arrives from outside, is inspected before it is imported, and is then combined,
offset, sliced, reordered, measured, adjudicated and exported — without any step
re-deriving the artwork from a description. It also asserts the refusals: a
Bézier curve and off-lattice coordinates are rejected by name, and the
off-lattice case imports only under an explicit `quantize: "nearest"`.

Run it with `pnpm run vector-repair`. It is part of `pnpm run check`.
