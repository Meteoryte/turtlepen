# Spatial geometry and fabrication prototype

TurtlePen now has a separate, persistent 3D scene. Page Z-order still controls
2D drawing layers. The new scene stores physical XYZ coordinates and compiles
meshes for STL and GLB. It is available through core JavaScript, MCP and the CLI;
the existing diagram viewer remains a 2D viewer. Open GLB in a 3D application.

## Try it

Run these examples from this source checkout:

```sh
node examples/geometry3d-prototype.js
node src/cli.js geometry3d artifacts/geometry3d-prototype/castle.tpf --inspect
```

The second command inspects a saved scene. To build a recipe, use `--recipe`:

```sh
node src/cli.js geometry3d --recipe artifacts/geometry3d-prototype/castle.recipe.json --format stl --out castle.stl
node src/cli.js geometry3d artifacts/geometry3d-prototype/castle.tpf --format glb --out castle.glb
```

Recipes contain only `name`, `units`, and `commands`. A `.turtlepen.json` document
containing a scene is also a valid input. Output paths must match the requested
extension; exports cannot overwrite their input. Existing output files receive
the normal atomic-write backup.

## MCP workflow

Start with `new_diagram`, then call:

```json
{
  "action": "create",
  "units": "mm",
  "commands": [
    {"op":"box","id":"base","size":[20,20,10]},
    {"op":"box","id":"top","size":[10,10,10],"position":[5,5,10]},
    {"op":"boolean","id":"stack","operation":"union","ids":["base","top"]}
  ]
}
```

Send that object to `geometry3d`. Use `action:"apply"` for further commands,
`inspect_geometry3d {}` to inspect, and
`export_geometry3d {"format":"stl"}` to receive actual base64 bytes, their hash,
units and inspection. The default works through the hosted adapter without a
local file path; deploying this new source to production is a separate step.
Inline binary data is limited to 4 MiB so both MCP text and structured results
fit the hosted response limit. A local `path:"stack.stl"` writes within allowed
roots. Supported formats are `tpf`, `stl`, and `glb`.

All mutations support `plan`, `expectedHash`, persisted history and undo/redo.
`plan` with `format:"json"` names changed 3D objects/groups and includes the
prospective inspection. Failed commands roll back the whole transaction.
`action:"import", source:"<TPF JSON text>"` restores a scene. Replacing an
existing scene requires `replace:true`; ordinary edits use `apply`.

## Coordinates and commands

- Scene units are explicitly `mm`, `cm`, `m`, or `in` (default `mm`). Coordinate
  system: right handed, Z-up. Size/volume inspection uses scene units and their
  cube. Units belong to the scene and cannot be silently changed by an edit.
- `box`: `size:[x,y,z]`, starts at the local origin and extends positively.
- `sphere`: `radius`, centered at the origin. `cylinder`: `radius`, `height`,
  centered on the Z-axis with its bottom at Z=0. Both accept `segments:8..128`
  (default 32); increasing detail improves the curved approximation.
- `sweep`: 4+3k XYZ cubic Bezier `points` (up to 49) and matching positive cubic
  `radii`, `steps:4..128` per span and `segments:8..128` (both default 32).
  Joined spans share rings; the total ring-vertex budget is 32,768. A parallel-transport
  frame avoids world-axis seams. Ends are flat closed caps; stationary or
  reversing sampled tangents are refused. Self-intersections are not tested.
- `loft`: 2–129 explicit `sections:[[x,y,z,radiusX,radiusY],...]`, with strictly
  increasing Z, `segments:8..128` (default 48), and `exponent:2..8` (default 2).
  Exponent 2 makes ellipses; larger values make rounded rectangular sections.
  Both radii may be zero at either endpoint to make a pole. Other radii must
  be positive. Rings connect directly, with no hidden interpolation: sample
  the intended silhouette into sections to control smoothness.
- `shading:"smooth"` on creation stores explicit area-weighted vertex normals
  in GLB; the default remains `"flat"`. This changes lighting only, not the
  triangles, collision inspection, STL, or manufacturing precision.
- `polygon` with `points:[[x,y],...]` and `circle` with `radius` create named
  profiles. `extrude` accepts exactly one of `points`, `radius`, or `profile`
  (the profile ID), plus positive `height`. Profiles have no solid volume and
  remain editable source. Extrusion snapshots the profile and its transform.
  Simple concave polygons work; holes and self-intersecting profiles are refused.
- Primitive/profile creation accepts `position`, `rotation`, `scale` and optional
  sRGB `color:"#RRGGBB"`. Rotation uses XYZ degrees, composed as
  `translation * Rz * Ry * Rx * scale`. `transform` applies that matrix to an
  existing object or group in world space, around the world origin. To rotate
  around another pivot, translate to the origin, rotate, then translate back.
  Negative scales preserve face orientation; collapsed axes are refused.
- `group` takes `id` and `members`; groups are flat, with one group per object.
  `ungroup` removes the group record and preserves its members' poses. `remove`
  deletes an object and updates its group membership.
- `boolean` takes a new `id`, `operation:"union"|"subtract"|"intersect"` and
  distinct operand `ids`. Subtraction uses the first operand minus all others.
  The first implementation supports **axis-aligned boxes only**, including
  quarter-turned boxes. It consumes operands and creates one baked mesh.
  Curved operands, oblique boxes, empty results and subsequent booleans on a
  baked result are explicitly refused. This is a bounded prototype, not a
  general CAD boolean kernel.

For the JavaScript API, import `geometry3d` from `turtlepen`. It exposes
`createScene`, `applyCommands`, `inspectScene`, `compileScene`, `serializeTpf`,
`deserializeTpf`, and `exportScene`. `applyCommands` returns a new scene without
mutating its input. `exportScene` returns `{bytes,format,units,mimeType,inspection}`.

## Extruding a drawing

Convert selected line paths with `stroke_to_path` to materialize their quadrant
footprint as cell-painted artwork, then call `geometry3d` with:

```json
{"action":"extrude_drawing","id":"letter","ids":["cell-artwork"],"height":4,"unitsPerQuadrant":2}
```

The result is a snapshot of the selected occupied quadrants. Adjacent cells
share one surface; the 2D downward Y-axis becomes negative spatial Y. The source
drawing keeps its own coordinates and later edits do not alter the solid.
Images, boxes, live text, line-painted paths and pixel-masked paths are refused;
convert the intended drawing geometry explicitly first. Quadrant paint effects
such as tone/color do not change this physical footprint. Corner-only contacts
are reported as non-manifold and cannot be exported as STL.

## Persistence, precision and limits

Document schema 5 stores optional `geometry3d` data. Schemas 1–4 migrate without
changing 2D coordinates. Spatial floats never enter the integer collision engine.
TPF is this prototype's JSON interchange format, schema version 1; its name and
schema are not an external industry standard. It stores units, primitives,
profiles, flat groups, baked meshes and row-major affine matrices. Unknown
fields, invalid transforms, nonfinite values and unsupported versions fail.

Limits: 128 objects/groups, 256 commands per transaction, 512 polygon points,
200,000 vertices and 300,000 triangles per scene, 128 shells per topology
orientation check, 32 boolean operands and 32,768 partition cells. Drawing
extrusion is limited to 32,768 quadrants and 65,536 combined X/Y span. Numeric
inputs are finite and within ±1,000,000; positive dimensions are at least
0.000001 scene units. TPF text import is limited to 16 MiB.

STL is binary, Z-up, always scaled to millimeters; the header documents units,
but STL itself has no standardized physical-unit field. GLB follows
[glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html): meters,
right-handed Y-up (`x,y,z` becomes `x,z,-y`), aligned chunks, normals and material
colors. Both use deterministic float32 geometry and refuse coordinate rounding
that collapses topology. TPF retains the original double-precision numbers.
The binary STL layout follows the [Library of Congress format description](https://www.loc.gov/preservation/digital/formats/fdd/fdd000505.shtml).

## What inspection proves

Inspection checks edge incidence, winding consistency, vertex fans, degenerate
triangles, shell orientation/nesting, signed volume, bounds and conservative
part-bound overlap/contact. `solidReady` means those checks passed. It does
**not** mean a slicer or printer accepted the model. Self-intersections, minimum
wall thickness, supports, bed fit and printer profiles remain unevaluated.

STL blocks unresolved part overlaps/contact. GLB can represent overlapping
assemblies with warnings; the robot example is such an assembly. For printable
joined boxes, request a boolean explicitly. The first prototype does not include
general curved booleans, revolutions, bevel modifiers, OBJ/PLY/3MF/STEP exporters,
a native 3D viewer, slicing, G-code, or printer control.

`examples/verify-geometry3d-blender.py` independently imports the generated files,
checks topology, dimensions and volume, then renders a review sheet. Run it with
an installed Blender using `--background --python <script> -- <artifact folder>`.
The [implementation report](3d-geometry-implementation-report.md) records results.

## Mascot case study

`node examples/turtlepen-mascot-v2.js` builds the revised turtle-at-easel with
native sweeps, lofts and smooth GLB normals. Source and rendered review views
live in `artifacts/turtlepen-mascot-v2/`. The earlier study remains available
for comparison; the accepted turtle/nib brand mark is preserved unchanged.
The joined sculpture STL is an explicit downstream Blender voxel union at
0.35 mm, not a new general boolean capability in TurtlePen.
