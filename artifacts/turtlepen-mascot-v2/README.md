# TurtlePen artist mascot — revision 2

Open `mascot-front.png`, `mascot-back.png`, `mascot-face.png`, and `mascot-side.png`
to review the sculpture. `mascot.glb` is the colored 3D model; `mascot.tpf` retains
the native source. `construction.json` records the authoring commands and accepted
brand source. `mascot.blend` contains the staged scene, cameras and lights.

`mascot-solid.stl` is a single-piece fabrication derivative, approximately
128 x 70 x 83 mm with its bottom at Z=0. It uses an explicit 0.35 mm Blender voxel
union. Import at millimeter scale. Topology checks passed; slicing, supports,
wall thickness, printer suitability and physical printing remain untested.
The colored assembly intentionally contains overlapping parts.

The accepted raised badge and flat logo in `../turtlepen-3d-logo/` are unchanged.
Earlier sculpture previews are retained there for comparison.

Rebuild from the repository root:

```text
node examples/turtlepen-mascot-v2.js
blender --background --python-exit-code 1 --python examples/render-turtlepen-mascot-v2.py -- artifacts/turtlepen-mascot-v2
blender --background --python-exit-code 1 --python examples/fuse-turtlepen-logo-blender.py -- artifacts/turtlepen-mascot-v2 --source mascot.glb --output mascot-solid.stl --voxel-size .35
python examples/verify-turtlepen-logo-stl.py artifacts/turtlepen-mascot-v2 mascot-solid.stl
```

`receipts.json`, `blender-verification.json`, `fabrication-verification.json` and
`stl-byte-verification.json` bind the verification to exact source/export hashes.
