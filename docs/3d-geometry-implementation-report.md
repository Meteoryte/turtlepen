# TurtlePen 3D first-prototype implementation and verification

Historical first-prototype evidence. The subsequent 0.6 release adds native
sweeps/lofts and a live hosted deployment; its current results are recorded in
[mascot refinement and publication](mascot-refinement-2026-09-08.md).

Verified locally on 2026-09-08, following Chuck's instruction to implement and
test the recovered [fabrication concept](plans/turtlepen-3d-geometry-fabrication-concept.md).
The [usage guide](3d-geometry.md) contains commands, format contracts and limits.

**Result:** physical XYZ primitives, extrusion, transforms/groups, bounded box
booleans, TPF and STL/GLB export are implemented and digitally tested. The local
first prototype is complete within those bounds. No slicer, physical printer,
public release or hosted deployment was exercised.

## Implementation

- Dependency-free scene/compiler in `src/core/geometry3d/`; spatial units and
  floats remain separate from page ordering and the integer diagram lattice.
- Box, sphere, cylinder, named circle/polygon profiles, simple concave extrusion,
  world-space transforms, flat groups, and box union/subtraction/intersection.
- Explicit drawing-quadrant extrusion through `src/core/geometry3d-document.js`.
- Document schema 5, migration from 1–4, strict TPF schema 1, deterministic binary
  STL in millimeters and GLB in meters. sRGB input colors convert to glTF's linear
  material factors. Float32 topology is rechecked before export.
- CLI recipe/document/TPF inputs and three MCP tools: `geometry3d`,
  `inspect_geometry3d`, `export_geometry3d`. Mutations share rehearsal diffs,
  expected-hash guards, atomic persistence, undo/redo and batch rollback.
- Local runtime remains version 0.5.0 with 87 tools and schema 5; this is
  unreleased source, not a claim that the hosted 0.5.0 service gained these tools.
  Capability fingerprint:
  `cfe95111ff39980cce00821ae1377321afc4e708d11916477fe2a7a3acfbdc50`.

## Validation evidence

| Check | Result | Evidence |
|---|---|---|
| Full project command, `pnpm run check` | PASS: 751 tests, existing example generation, 8 release artifacts, governance READY | [full log](../artifacts/geometry3d-full-check.log) |
| Final complete Node suite after the last parser fix | 751 passed; zero failed/skipped | [TAP](../artifacts/geometry3d-tests.tap) |
| Focused geometry and core/MCP/CLI integration | 18 passed | [TAP](../artifacts/geometry3d-focused.tap), `test/geometry3d.test.js`, `test/geometry3d-integration.test.js` |
| All MCP tools through a real stdio child process | 87-tool use-case matrix passes | `test/endpoints.test.js` |
| Hosted adapter persistence/export | Separate D1/R2-backed fixture requests preserve geometry and return valid GLB bytes; undo/redo passes | `test/cloudflare-mcp.test.js` |
| Independent Blender 5.0.1 imports | 7/7 STL/GLB files pass topology, outward volume and physical bounds checks | [Blender JSON](../artifacts/geometry3d-prototype/blender-verification.json), [log](../artifacts/geometry3d-prototype/blender.log) |
| Visual review | Rendered four imported models and inspected the sheet | [preview](../artifacts/geometry3d-prototype/blender-review.png) |
| Recovery checkpoint | Original 124 dirty/untracked files copied and SHA-256 verified before implementation | Home Base `08_BACKUPS/turtlepen-3d-before-2026-09-08T18-05-38-376Z/checkpoint.json` |

The hosted test uses the real adapter with in-memory D1/R2 fixtures. It does not
establish live Cloudflare deployment or provider performance. The full check
regenerated existing examples under schema 5; the recovery checkpoint preserves
the preexisting edits. Package/runtime version was not bumped.

Negative tests cover malformed/self-crossing profiles, invalid dimensions and
transforms, unknown/missing TPF fields, duplicate IDs, excessive segmentation,
group conflicts, unsupported/empty booleans, open/reversed/non-manifold meshes,
corner-only contacts, reversed disconnected shells, float32 feature collapse,
overlapping STL assemblies, path escape and accidental document overwrite.
Legitimate cavities remain accepted. A rehearsal shows changed spatial IDs and
prospective geometry inspection before commit.

## Original proposal's example sequence

| Example | Dimensions in mm | Triangles | Outcome |
|---|---|---|---|
| [Stacked cubes](../artifacts/geometry3d-prototype/stacked-cubes.stl) | 20 × 20 × 20 | 68 | Joined solid, 5,000 mm³, STL/GLB imports pass |
| [Curved robot](../artifacts/geometry3d-prototype/curved-robot.glb) | 50.31 × 24 × 57 | 4,812 | Recognizable curved assembly; each part closed; overlaps declared; GLB only |
| [Extruded drawing](../artifacts/geometry3d-prototype/extruded-drawing.stl) | 40 × 40 × 4 | 316 | Native cell-painted T, 624 mm³, explicit 2 mm/quadrant snapshot |
| [Castle](../artifacts/geometry3d-prototype/castle.stl) | 70 × 55 × 36 | 768 | Recognizable joined object, 39,248 mm³; STL/GLB imports pass |

All examples retain editable TPF source. Recipe JSON and the native drawing
document are in the same artifact folder. The [receipts](../artifacts/geometry3d-prototype/receipts.json)
record format, byte count, SHA-256 and inspection for all 11 TPF/STL/GLB files.
Rerun `node examples/geometry3d-prototype.js` to regenerate them and use
`examples/verify-geometry3d-blender.py` for independent verification.

## Remaining scope

The STL gate proves the implemented topology checks, not manufacturability.
General mesh self-intersections, wall thickness, supports, bed fit, slicer
acceptance and a physical print remain unverified. Part-bound overlap detection
is intentionally conservative and can flag separated curved surfaces.

General curved booleans, booleans on baked results, profile holes, sweeps,
revolutions, bevels, OBJ/PLY/3MF/STEP exporters, a native 3D viewer, slicing/G-code
and printer control are deferred. Those later concepts are not reported as
completed by the first prototype. The original Drive proposal remains byte-exact:
SHA-256 `8893d40986fc9b51b9b15bbd487dc628d5be6759ef0f6f245253ecd912227527`.

Format references used: [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
for GLB layout, coordinate/unit conventions and materials; [Library of Congress binary STL description](https://www.loc.gov/preservation/digital/formats/fdd/fdd000505.shtml)
for STL records and interchange limitations.
