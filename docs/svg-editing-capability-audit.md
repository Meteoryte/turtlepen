# RFC: Comprehensive SVG Editing Capability Audit for TurtlePen MCP

## Purpose

TurtlePen already has a strong deterministic mutation model: geometry is authored through named core operations, the MCP surface derives from that mutation vocabulary, edits participate in planning/validation, and mutations are recoverable through undo/redo history.

This RFC asks for a systematic audit and expansion of TurtlePen so common SVG/vector editing operations can be expressed directly through the TurtlePen MCP instead of requiring external manual editing.

The goal is **not** to turn TurtlePen into a conventional GUI vector editor. The goal is to expose the useful geometry vocabulary of professional SVG editors as deterministic, inspectable, testable, AI-callable operations that fit TurtlePen's existing lattice-first architecture.

## Required audit method

For every capability below, determine one of:

- **SUPPORTED** — already exists as a first-class TurtlePen core/MCP operation.
- **PARTIAL** — achievable only through lower-level pen commands, indirect composition, export-only behavior, or with important limitations.
- **MISSING** — no reliable first-class operation exists.
- **OUT OF SCOPE** — conflicts with TurtlePen's integer-exact/lattice model or should deliberately remain external.

For every PARTIAL or MISSING capability that belongs in TurtlePen, add or design:

1. a deterministic core operation;
2. inclusion in `OPERATIONS` so `plan` can rehearse it;
3. a corresponding MCP tool or plan operation schema;
4. undo/redo compatibility;
5. validation/collision behavior;
6. stable serialization and SVG export behavior;
7. tests for geometry, invalid inputs, round-trip persistence, and plan parity;
8. documentation/help text and at least one worked example.

Do not silently approximate unsupported geometry. If an operation cannot preserve TurtlePen invariants, return an explicit diagnostic.

---

# Capability checklist

## 1. Boolean / path-combination operations

Audit and add where appropriate:

- [ ] Union / Unite / Weld
- [ ] Difference / Subtract / Minus Front
- [ ] Intersection
- [ ] Exclusion / XOR
- [ ] Division / Divide
- [ ] Cut Path
- [ ] Split / Break Apart
- [ ] Combine / Compound Path
- [ ] Release / Break Compound Path
- [ ] Trim
- [ ] Outline / Contour
- [ ] Inset
- [ ] Outset
- [ ] Offset Path with signed distance
- [ ] Preserve or explicitly define fill-rule behavior after boolean operations

Suggested MCP vocabulary could include operations such as `boolean_union`, `boolean_difference`, `boolean_intersection`, `boolean_xor`, `divide`, `offset_path`, and `break_apart`.

## 2. Slice / knife / cutting operations

Treat slicing as a first-class geometry concept rather than hiding everything behind generic booleans.

- [ ] Slice object with another path
- [ ] Knife cut
- [ ] Scissors / cut at node
- [ ] Cut at path intersection
- [ ] Straight-line cut
- [ ] Polyline/freeform cut
- [ ] Shape-based cut
- [ ] Divide object into closed regions
- [ ] Delete segment between intersections
- [ ] Trim segment
- [ ] Extend segment to intersection
- [ ] Return newly created object IDs deterministically

Expected behavior: an object cut into two regions should become two separately addressable TurtlePen elements while preserving provenance and draw order where possible.

## 3. Direct path and node editing

- [ ] Add node
- [ ] Delete node
- [ ] Move node
- [ ] Move multiple nodes
- [ ] Join nodes
- [ ] Break node
- [ ] Join endpoints
- [ ] Split path at node
- [ ] Split path at distance/percentage
- [ ] Open path
- [ ] Close path
- [ ] Reverse path direction
- [ ] Convert node to corner/cusp
- [ ] Convert node to smooth
- [ ] Convert node to symmetric
- [ ] Auto-smooth node
- [ ] Straighten selected segment
- [ ] Curve selected segment
- [ ] Edit Bézier handles
- [ ] Rotate Bézier handles
- [ ] Change handle length
- [ ] Simplify path
- [ ] Smooth path
- [ ] Remove redundant/duplicate nodes
- [ ] Merge collinear segments
- [ ] Resample path
- [ ] Interpolate nodes/path

Where TurtlePen uses quadrant pieces instead of free Bézier geometry, define the equivalent operation in lattice terms rather than pretending full floating-point Bézier editing exists.

## 4. Shape construction / primitives

Audit primitives and first-class shape support for:

- [ ] Rectangle
- [ ] Rounded rectangle
- [ ] Circle
- [ ] Ellipse
- [ ] Line
- [ ] Polyline
- [ ] Polygon
- [ ] Regular polygon
- [ ] Star
- [ ] Arc
- [ ] Pie / sector
- [ ] Spiral
- [ ] Freehand path
- [ ] Bézier path where compatible
- [ ] Convert primitive to editable path

Existing box/node shapes should be mapped to this list rather than duplicated unnecessarily.

## 5. Transform operations

- [ ] Translate / move
- [ ] Scale uniformly
- [ ] Scale X only
- [ ] Scale Y only
- [ ] Rotate
- [ ] Rotate around arbitrary pivot
- [ ] Flip horizontal
- [ ] Flip vertical
- [ ] Reflect across arbitrary line
- [ ] Skew / shear X
- [ ] Skew / shear Y
- [ ] Numeric transform
- [ ] Transform matrix import/export
- [ ] Bake / flatten transform into geometry
- [ ] Reset transform
- [ ] Transform group
- [ ] Transform selection while preserving relative positions

Any transform that would leave the lattice must either quantize according to an explicit policy or fail with a useful diagnostic. Silent half-pixel drift is unacceptable.

## 6. Alignment and distribution

- [ ] Align left
- [ ] Align right
- [ ] Align top
- [ ] Align bottom
- [ ] Align horizontal center
- [ ] Align vertical center
- [ ] Align to canvas/page
- [ ] Align to selection bounds
- [ ] Align to key/reference object
- [ ] Align nodes
- [ ] Align text baselines where relevant
- [ ] Distribute horizontally
- [ ] Distribute vertically
- [ ] Equal center spacing
- [ ] Equal edge gaps
- [ ] Space around
- [ ] Pack objects
- [ ] Explicit collision-aware distribution option

## 7. Snapping / construction constraints

Audit existing lattice addressing and constraints, then expose missing vector-style snapping concepts if useful:

- [ ] Snap to node
- [ ] Snap to path
- [ ] Snap to intersection
- [ ] Snap to midpoint
- [ ] Snap to bounding box
- [ ] Snap to object center
- [ ] Snap to lattice/grid
- [ ] Snap to guide
- [ ] Snap to angle increment
- [ ] Snap rotation
- [ ] Tangential snap
- [ ] Perpendicular snap
- [ ] Handle snap
- [ ] Smart-guide equivalent

Prefer deterministic query/placement helpers over hidden UI-like snapping state.

## 8. Stroke operations

Audit current stroke support and add missing capabilities:

- [ ] Stroke width
- [ ] Stroke color
- [ ] Stroke opacity
- [ ] Dash pattern
- [ ] Dash offset
- [ ] Butt cap
- [ ] Round cap
- [ ] Square cap
- [ ] Miter join
- [ ] Round join
- [ ] Bevel join
- [ ] Miter limit
- [ ] Variable-width stroke
- [ ] Pressure/profile stroke
- [ ] Stroke alignment
- [ ] Marker start
- [ ] Marker middle
- [ ] Marker end
- [ ] Arrowhead helpers
- [ ] Stroke to Path / Expand Stroke
- [ ] Tapered stroke where compatible

`stroke_to_path` is especially important because it converts presentation into editable geometry that can then participate in slicing and boolean operations.

## 9. Fill operations

- [ ] Solid fill
- [ ] No fill
- [ ] Fill opacity
- [ ] Linear gradient
- [ ] Radial gradient
- [ ] Gradient stops
- [ ] Gradient transform
- [ ] Mesh gradient, if compatible
- [ ] Pattern fill
- [ ] Image fill
- [ ] `nonzero` fill rule
- [ ] `evenodd` fill rule
- [ ] Convert fill/pattern appearance to durable geometry where appropriate

## 10. Clipping

- [ ] Create clip path
- [ ] Release clip path
- [ ] Edit clip path
- [ ] Nested clipping
- [ ] Inverted clipping if supported
- [ ] Clip groups
- [ ] Preserve clipping through serialization/export
- [ ] Collision/measurement policy for clipped vs underlying geometry

## 11. Masking

- [ ] Create mask
- [ ] Release mask
- [ ] Edit mask
- [ ] Alpha/luminance semantics
- [ ] Gradient transparency masks
- [ ] Nested masks
- [ ] Preserve masks through serialization/export
- [ ] Explicit measurement/collision policy for masked geometry

## 12. Grouping / hierarchy

Audit existing group support and fill any gaps:

- [ ] Group
- [ ] Ungroup
- [ ] Nested groups
- [ ] Add/remove group members
- [ ] Move group
- [ ] Transform group
- [ ] Restyle group
- [ ] Select parent
- [ ] Select children
- [ ] Move object into/out of group
- [ ] Group bounds
- [ ] Group-level boolean behavior policy
- [ ] Stable group serialization

## 13. Layers / pages / stacking

Map TurtlePen pages and z-order semantics against conventional SVG layers:

- [ ] Create layer/page
- [ ] Rename layer/page
- [ ] Delete layer/page
- [ ] Duplicate layer/page
- [ ] Reorder layer/page
- [ ] Lock layer/page
- [ ] Hide/show layer/page
- [ ] Solo layer/page
- [ ] Merge layers/pages
- [ ] Move selection to layer/page
- [ ] Bring to front
- [ ] Send to back
- [ ] Raise one step
- [ ] Lower one step
- [ ] Move before/after named element
- [ ] Preserve deterministic draw order after splits/booleans

## 14. Duplication / cloning / arrays

- [ ] Duplicate
- [ ] Copy / paste-equivalent operation
- [ ] Paste in place
- [ ] Linked clone / instance/reference
- [ ] Break clone link
- [ ] Repeat last transform
- [ ] Step-and-repeat
- [ ] Grid array
- [ ] Linear array
- [ ] Radial array
- [ ] Mirror duplication
- [ ] Pattern/scatter duplication
- [ ] Deterministic generated IDs

## 15. Shape generation and deformation

Audit for usefulness and lattice compatibility:

- [ ] Pattern along path
- [ ] Blend/interpolate shapes
- [ ] Morph between compatible paths
- [ ] Bend
- [ ] Envelope deformation
- [ ] Perspective deformation
- [ ] Warp
- [ ] Twist
- [ ] Roughen
- [ ] Lattice deformation
- [ ] Mirror symmetry/live symmetry

These may be lower priority than booleans, slicing, path editing, transforms, and stroke expansion.

## 16. Corner operations

- [ ] Round corner
- [ ] Fillet
- [ ] Chamfer
- [ ] Bevel
- [ ] Global corner radius
- [ ] Per-corner radius
- [ ] Convert corner treatment into explicit path geometry

Audit against TurtlePen's existing box corner styles so the API does not create redundant concepts.

## 17. Text operations

Audit current text support and add where valuable:

- [ ] Plain text
- [ ] Text box
- [ ] Font family
- [ ] Weight
- [ ] Size
- [ ] Tracking / letter spacing
- [ ] Kerning
- [ ] Line height
- [ ] Baseline shift
- [ ] Horizontal alignment
- [ ] Vertical alignment
- [ ] Text anchor
- [ ] Text on path
- [ ] Text inside shape
- [ ] Vertical text
- [ ] Text to Path / Convert to Outlines
- [ ] Preserve measured text-fit diagnostics

`text_to_path` should be considered important for portable SVG output when external fonts cannot be assumed.

## 18. Raster/image operations

Audit existing `place_image`, dither, simplify, and tracing-reference behavior against:

- [ ] Embed image
- [ ] Link image where safe
- [ ] Crop
- [ ] Clip image
- [ ] Mask image
- [ ] Resize
- [ ] Rasterize vector selection
- [ ] Trace bitmap
- [ ] Vectorize image
- [ ] Posterized/color trace
- [ ] Edge trace
- [ ] Multi-color trace
- [ ] Convert traced output to editable TurtlePen geometry
- [ ] Preserve source/provenance metadata

## 19. Selection/query operations for AI editing

A headless MCP benefits from explicit selection queries even more than a GUI editor does.

- [ ] Find by ID
- [ ] Find by kind/type
- [ ] Find by page/layer
- [ ] Find by fill
- [ ] Find by stroke
- [ ] Find by bounds/region
- [ ] Find intersecting a region
- [ ] Find overlapping another object
- [ ] Find contained objects
- [ ] Find nearest object/node
- [ ] Find by group membership
- [ ] Select all equivalent query result
- [ ] Invert query result against scope
- [ ] Return deterministic ordered ID sets

These need not maintain hidden selection state; returning explicit IDs is preferable for MCP reliability.

## 20. Measurement / inspection

Audit and add exact numeric queries for:

- [ ] Bounding box
- [ ] Geometric bounds vs visual/stroke bounds
- [ ] Path length
- [ ] Segment length
- [ ] Angle
- [ ] Node coordinates
- [ ] Radius / diameter
- [ ] Area
- [ ] Distance between objects
- [ ] Distance between nodes
- [ ] Object center
- [ ] Transform origin
- [ ] Intersection points
- [ ] Nearest point on path
- [ ] Signed offset distance
- [ ] Perimeter
- [ ] Count nodes/segments/subpaths

This category strongly matches TurtlePen's measurement-before-placement philosophy.

## 21. Guides / construction geometry

- [ ] Horizontal guide
- [ ] Vertical guide
- [ ] Angled guide
- [ ] Named guide
- [ ] Grid/lattice query
- [ ] Isometric/axonometric construction helper
- [ ] Baseline guide/grid
- [ ] Ruler/measurement line
- [ ] Hide/show construction geometry
- [ ] Mark construction geometry as non-deliverable scaffolding
- [ ] Validation warning when temporary guides ship unintentionally

## 22. Cleanup / normalization

Especially important for generated or imported SVG:

- [ ] Remove duplicate nodes
- [ ] Remove duplicate paths
- [ ] Merge collinear segments
- [ ] Simplify curves/path
- [ ] Flatten transforms
- [ ] Flatten groups
- [ ] Remove hidden objects
- [ ] Remove unused definitions
- [ ] Remove empty groups
- [ ] Remove stale IDs/references
- [ ] Normalize path commands
- [ ] Convert relative path commands to absolute
- [ ] Convert absolute path commands to relative where useful
- [ ] Normalize style representation
- [ ] Deduplicate gradients/patterns/markers
- [ ] Produce cleanup report before mutation

## 23. SVG document-level operations

- [ ] Parse SVG into TurtlePen document model
- [ ] Serialize TurtlePen document to SVG
- [ ] Edit `viewBox`
- [ ] Resize canvas
- [ ] Fit canvas to artwork
- [ ] Fit artwork to canvas
- [ ] Change/normalize coordinate system
- [ ] Flatten SVG transforms
- [ ] Stable ID management
- [ ] `<defs>` management
- [ ] `<symbol>` management
- [ ] `<use>`/instance handling
- [ ] Gradient definition handling
- [ ] Pattern definition handling
- [ ] `clipPath` handling
- [ ] Mask handling
- [ ] Marker handling
- [ ] Filter definition handling
- [ ] Preserve unsupported SVG constructs losslessly when feasible
- [ ] Report constructs that cannot round-trip safely

## 24. SVG filters / effects

Audit for export support and whether effects belong in the editable document model:

- [ ] Gaussian blur
- [ ] Drop shadow
- [ ] Inner shadow
- [ ] Color matrix
- [ ] Hue rotation
- [ ] Saturation
- [ ] Brightness
- [ ] Contrast
- [ ] Morphology / erode
- [ ] Morphology / dilate
- [ ] Displacement map
- [ ] Turbulence
- [ ] Lighting
- [ ] Blend modes
- [ ] Composite
- [ ] Flood
- [ ] Filter chains
- [ ] Preserve raw SVG filters when imported even if TurtlePen cannot reason about them

Filters are lower priority for geometric reasoning than path/boolean/measurement operations, but import/export preservation matters.

## 25. Import / export / conversion

Audit current export and add only where appropriate:

- [ ] TurtlePen -> SVG
- [ ] SVG -> TurtlePen
- [ ] SVG/TurtlePen -> PNG
- [ ] SVG/TurtlePen -> JPEG
- [ ] SVG/TurtlePen -> WebP
- [ ] SVG/TurtlePen -> PDF
- [ ] SVG -> React component / JSX helper
- [ ] Export raw path data
- [ ] Export icon-safe optimized SVG
- [ ] Import SVG
- [ ] Import PNG/JPEG as image/reference
- [ ] Optional PDF/EPS/DXF import only if reliable libraries make this reasonable
- [ ] Report conversion losses explicitly

---

# Recommended implementation priority

## P0 — core editing vocabulary

These provide the largest increase in what an AI can repair without redrawing an entire object:

1. Boolean union/difference/intersection/XOR
2. Slice/divide/knife
3. Path split/join/open/close/reverse
4. Node/segment editing or the TurtlePen lattice equivalent
5. Offset/inset/outset
6. Stroke-to-path
7. Z-order/reorder operations
8. Duplicate/array operations
9. Exact measurement/intersection queries
10. Cleanup/normalization

## P1 — composition and styling

1. Alignment/distribution
2. Richer transforms
3. Clip paths
4. Masks
5. Gradient/pattern fill support
6. Markers/arrowheads
7. Text-to-path
8. Improved grouping/layer operations
9. SVG import with explicit loss reporting

## P2 — advanced effects

1. Morph/deformation/path effects
2. Mesh gradients
3. Filter/effect authoring
4. advanced raster tracing modes
5. broad interchange formats

---

# AI/MCP design requirements

Every new editing operation should optimize for an AI caller, not mouse interaction.

### Deterministic IDs

Operations that create multiple outputs must return stable ordered IDs, for example:

```json
{
  "source": "logo",
  "operation": "slice",
  "created": ["logo-part-1", "logo-part-2"]
}
```

### Dry-run parity

Anything callable directly must mean the same thing inside `plan`. No separate parsing or geometry semantics between direct MCP calls and batch planning.

### Explicit quantization

If a requested transform or intersection does not land on the TurtlePen lattice, support one of:

- `quantize: "nearest"`
- `quantize: "inward"`
- `quantize: "outward"`
- `quantize: "reject"`

Default should favor rejection unless a geometry-specific policy is clearly documented.

### Provenance

Derived objects should retain enough metadata to explain where they came from, especially for slice, boolean, trace, expand-stroke, and text-to-path operations.

### No hidden selection state

Prefer operations that receive explicit IDs or explicit queries. An AI should not need to remember what a GUI-style invisible selection currently contains.

### Inspection before mutation

Where useful, provide query forms such as `measure`, `intersections`, `preview_boolean`, or a plan dry run so the model can inspect consequences before committing.

### Validation integration

New operations must not bypass TurtlePen's collision/adjudication model. A boolean or slice that creates an overlap, unreadable object, out-of-bounds geometry, or unintended temporary scaffolding should surface through normal validation where applicable.

---

# Acceptance criteria for this RFC

This RFC is complete when:

- [ ] every checklist item above has an explicit status: SUPPORTED / PARTIAL / MISSING / OUT OF SCOPE;
- [ ] existing TurtlePen features are mapped to the conventional SVG terminology they already cover;
- [ ] missing P0 items judged compatible with TurtlePen have implementation issues or code changes;
- [ ] direct MCP and `plan` semantics remain identical;
- [ ] all new mutation operations participate in undo/redo;
- [ ] tests cover success, invalid input, round-trip persistence, SVG export, and plan parity;
- [ ] `turtlepen_help` documents the final vocabulary;
- [ ] examples demonstrate an AI repairing an existing vector without redrawing it from scratch.

## Example target workflow

A future TurtlePen MCP session should be able to express a workflow conceptually like:

```text
open SVG/TurtlePen document
  -> inspect object IDs and geometry
  -> duplicate object
  -> convert stroke to path
  -> slice at specified line/intersections
  -> delete one region
  -> boolean-union remaining regions
  -> offset result outward by N lattice units
  -> align result to reference object
  -> measure final bounds
  -> validate
  -> export SVG
```

That is the capability level this audit is intended to move TurtlePen toward while preserving its defining advantage: explicit geometry, exact measurement, deterministic operations, and no silent resizing or repair.