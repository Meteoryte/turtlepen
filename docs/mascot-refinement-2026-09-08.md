# Mascot revision and curved authoring

The user rejected the first full 3D mascot while accepting the new turtle/nib
brand mark. The original illustration was a flat, outlined drawing, not a
sculpture specification. The first translation used exposed cylinders, separate
balls, segmented expression lines, and an oversized pixel wordmark. Structural
mesh success did not establish visual success. This was a local modeling and
authoring limitation (AIRR L1/S2), not a reason to replace the whole engine.

The revision keeps the recognizable turtle drawing at an easel. It changes the
head/body proportions, shortens the neck, shows the shell in the front silhouette,
uses a continuous curved reaching arm, makes the face look toward the drawing,
rounds the easel and base, and puts the accepted mark on the paper. The accepted
brand source is reused without edits. The original logo and earlier sculpture
remain available; this does not replace the canonical 2D brand.

## Reusable tooling

- Native `sweep`: one or more joined cubic Bezier spans, positive varying radii,
  parallel-transport frames, shared join rings and closed end caps. Tessellation
  is bounded before allocation. Stationary/reversing sampled tangents fail.
- Native `loft`: explicit increasing-Z elliptical/superelliptical sections, optional
  endpoint poles and bounded tessellation. Source parameters survive TPF.
- Explicit `shading`: smooth, area-weighted GLB vertex normals or the existing
  flat default. Lighting changes without changing exported vertex positions.
- Existing fabrication and STL byte-verification examples now accept an explicit
  model filename, so the process can be reused without rewriting the scripts.

These changes share the existing core/CLI/MCP operations, rehearsal, rollback,
history and persistence. No runtime dependency was added. The 2D lattice is intact.
General self-intersection detection and curved booleans remain unimplemented.

## Verification

The new curve tests failed before implementation. Analytic-volume convergence,
topology, compound-span connectivity, deterministic export, float32 geometry,
unit normal sharing, malformed inputs, pre-allocation budgets, mirrored transforms,
MCP rehearsal, persisted history, reopen and CLI equivalence now pass. The complete
`pnpm run check` passes 758 tests, eight release artifacts, and governance READY.

`examples/render-turtlepen-mascot-v2.py` independently imports the real native GLB,
checks per-part topology/volume and physical bounds, and renders front, back, face
and side views with the exported normals. It does not sculpt or smooth the mesh.
Review caught an occluded shell, buried smile, and joint shading at expression
segments; the source and reusable sweep representation were corrected.

The sculpture's single-piece STL is an explicitly requested downstream Blender
voxel union at 0.35 mm. That discretization is recorded in its receipt, not hidden
as a native exact Boolean. Blender and a separate binary STL parser verify the
final bytes. No physical print, slicing, support design or printer profile is claimed.

The artwork files and reproduction commands are documented in
`artifacts/turtlepen-mascot-v2/README.md`. Rendering is evidence for review; the
user's aesthetic acceptance is not assumed.
