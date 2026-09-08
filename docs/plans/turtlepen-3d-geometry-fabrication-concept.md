# TurtlePen MCP: 2D-to-3D Geometry / Fabrication Concept

## Core idea

Extend TurtlePen from a primarily 2D drawing language into a geometry description system that can represent actual 3D structures.

Instead of treating Z as merely visual stacking or SVG-style z-index, introduce a real spatial Z coordinate/depth axis. TurtlePen programs could then describe geometry in X, Y, and Z and compile that representation into standard 3D formats.

This would make TurtlePen potentially useful as a lightweight, agent-friendly geometry language for:
- 3D models
- character models
- voxel structures
- mechanical shapes
- diagrams with true depth
- 3D-printable objects
- procedural geometry

## Important distinction

The system should NOT be limited to voxels or blocks.

Voxel primitives are useful because they are easy to reason about and provide a simple first implementation, but the representation should support ordinary geometric primitives as first-class objects, including:

- boxes / cuboids
- points
- lines
- polygons
- circles
- arcs
- cylinders
- spheres
- cones
- extrusions
- paths / splines
- potentially meshes and surfaces

For example, a circle drawn in XY could be extruded along Z to create a cylinder. An arc or path could become a sweep path. A 2D polygon could become a solid through extrusion.

## TurtlePen intermediate file

Explore defining a TurtlePen geometry/interchange format, tentatively `.TPF`.

The TPF file would preserve TurtlePen's concise, AI-friendly instructions while carrying enough explicit geometry to convert deterministically into conventional 3D representations.

Conceptual structure:

TPF
  metadata
  coordinate_system
  units
  objects
    primitive
    position: x, y, z
    rotation
    scale
    dimensions / radius / path
    material
    operation
  groups
  layers
  fabrication metadata

The exact schema should be designed rather than locking this example in prematurely.

## Compilation pipeline

TurtlePen / AI instruction
        ↓
TurtlePen parser
        ↓
TPF geometry representation
        ↓
geometry compiler
        ↓
mesh / solid representation
        ↓
standard export

Potential outputs:
- STL for 3D printing
- OBJ for general meshes
- glTF / GLB for modern 3D scenes and applications
- PLY for geometry / point-cloud workflows
- 3MF for richer additive-manufacturing workflows

Potential later output:
- STEP or another CAD-oriented solid format, if TurtlePen gains sufficiently rigorous solid geometry semantics.

## 3D printer analogy

The useful mental model is a 3D printer.

A printer can construct an object by processing spatial geometry layer by layer, but the source object does not have to be made from cubes. Curves, circles, arcs and arbitrary surfaces ultimately become geometry that can be sliced into layers.

TurtlePen could work similarly:

high-level geometric intent
→ explicit 3D representation
→ triangulated/solid geometry
→ slicer-compatible output
→ physical object

This keeps the authoring language much simpler than forcing the model or user to manually describe every triangle or voxel.

## Why this fits TurtlePen

TurtlePen is especially interesting here because an AI can reason about commands such as:

create circle
extrude 20
move z 10
rotate y 45
union A B
subtract C from A

more naturally than directly constructing thousands of mesh vertices.

That makes TurtlePen potentially an intermediate geometric language between natural-language intent and conventional CAD/3D software.

## Recommended architecture

Keep three concepts separate:

1. Scene ordering
   Existing visual z-index / drawing order.

2. Spatial Z
   Actual third-dimensional position.

3. Geometry operations
   Extrusion, sweep, revolve, union, subtraction, intersection, bevel, etc.

Do not overload one `z` property to mean both drawing order and physical depth.

## First prototype

A useful minimum implementation would support:

- X/Y/Z coordinates
- box
- sphere
- cylinder
- 2D polygon
- circle
- extrusion
- translation
- rotation
- scale
- grouping
- union/subtraction if feasible
- deterministic mesh generation
- STL and GLB export

Then validate with increasingly difficult objects:

simple stacked cubes
→ curved primitive assembly
→ extruded TurtlePen drawing
→ recognizable character/object
→ manifold 3D-printable model

## Longer-term possibility

If successful, this turns TurtlePen into more than a drawing MCP. It could become a compact AI-native geometry DSL/compiler where agents create visual, spatial, and eventually fabricatable objects through a shared language.

The same source representation could potentially target:
- SVG/Canvas for 2D
- WebGL/WebGPU for interactive 3D
- GLB/glTF for applications
- STL/3MF for fabrication
- CAD formats for engineering workflows

This concept should be researched alongside TurtlePen's existing DSL and renderer rather than implemented as an isolated voxel feature.
