# 3D geometry and fabrication proposal: first prototype implemented

Reviewed 2026-09-08 during the full SORT pass. The original proposal is
[TurtlePen MCP: 2D-to-3D Geometry / Fabrication Concept](plans/turtlepen-3d-geometry-fabrication-concept.md).
It was recovered from [My Drive](https://drive.google.com/file/d/1Mpf2anQ4yaths0G91n2JjU8D6we7FZbR/view),
outside the normal `_AI_Area/TurtlePen` folder. Provider modification time:
2026-09-03T22:39:47.924Z. Original SHA-256:
`8893d40986fc9b51b9b15bbd487dc628d5be6759ef0f6f245253ecd912227527`.

After recovery, Chuck explicitly requested implementation and testing. The
local first prototype is now implemented. See the [usage guide](3d-geometry.md),
[implementation plan](superpowers/plans/2026-09-08-3d-geometry.md) and
[verification report](3d-geometry-implementation-report.md). The original source
above is preserved unchanged.

| Capability | Current evidence | Status |
|---|---|---|
| Page Z ordering and overlay occlusion | Existing document/pages and rendering tests | Implemented as drawing behavior |
| Room X/Y/Z inputs projected through a camera | `src/core/perspective.js`, `perspective_scene`, persisted provenance and endpoint tests | Implemented as a 2D projection workflow |
| General spatial geometry scene distinct from page ordering | `src/core/geometry3d/`, document schema 5, core/MCP/CLI tests | Implemented locally |
| `.TPF` interchange schema with units and transforms | Strict TPF schema 1, round-trip and malformed-input tests | Implemented prototype format; no external standard claim |
| Solid box/sphere/cylinder primitives; polygon/circle extrusion | Analytic volumes, concave extrusion and independent Blender imports | Implemented |
| Sweep/revolve and boolean solid operations | Axis-aligned box union/subtraction/intersection tested, including a joined castle and cavity | Box booleans implemented; sweep/revolve/general CAD booleans deferred |
| Deterministic mesh generation | Repeat-byte tests, bounded geometry compilation and stored SHA-256 receipts | Implemented |
| STL and GLB export | STL mm/Z-up; GLB meters/Y-up; seven independent Blender imports | Implemented locally |
| OBJ, PLY, 3MF and eventual STEP | No exporters found | Potential later outputs |
| Manifold/slicer/physical-print acceptance | Edge/vertex/shell topology, orientation, volume and unit tests; independent Blender evidence | Digital topology verified; slicer and physical print remain unverified |

The current perspective module accepts physical room coordinates, then projects
and rounds them onto the 2D integer lattice. Those coordinates do not establish
a mesh or solid suitable for a slicer. The existing Z-page and perspective tests
therefore do not test 3D printing.

## Original validation sequence

1. Stacked cubes.
2. Curved primitive assembly.
3. Extruded TurtlePen drawing.
4. Recognizable character or object.
5. Manifold model suitable for 3D printing.

The proposal explicitly includes curved and ordinary geometric primitives;
voxels are one possible starting primitive, not the entire design. It keeps
scene ordering, spatial Z, and geometry operations separate.

## Implementation boundary

The dependency-free spatial engine uses physical floating-point coordinates in
an independent scene. Existing 2D geometry stays integer-exact. The first
prototype has bounded box booleans and simple profile extrusion, not a general
CAD kernel. The curved robot is a GLB assembly with declared overlapping parts;
it is not exported as a joined printable STL. No hosted deployment or physical
printer operation was performed.

The exact source remains in the permanent Drive mirror and in the linked
project plan; source receipt and the full batch inventory are recorded in
`00_WORKSPACE_ADMIN/databases/sort-drive-routes-2026-09-08.json` at Home Base root.
