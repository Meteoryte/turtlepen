# Condenser image workflow test

This fixture proves TurtlePen's image path with a representative, non-procedural
HVAC image rather than a synthetic pixel block.

## Asset

- File: `assets/generated/p01-condenser-site-overview-illustrative.png`
- Dimensions: 1536 x 1024 px
- SHA-256: `0BD42FCFF3ABA16B3E29C8184C9DDE2C6F58357F796255BB4514A95C9B849E39`
- Generated with: built-in OpenAI image generation
- Intended use: TurtlePen ingestion, rendering, dither, reference-layer, and
  browser tests only
- Safety boundary: illustrative, not equipment-specific evidence and not a
  representation of code compliance

## Generation prompt

```text
Use case: photorealistic-natural
Asset type: technician field-guide test asset, P01 pre-work site overview
Primary request: Create a clear documentary photograph of a residential outdoor
air-conditioning condenser before replacement, showing the entire unit, its
service disconnect, refrigerant line-set entry, electrical whip, equipment pad,
nearby wall, and surrounding service area.
Scene/backdrop: ordinary North American residential exterior in daylight; clean
but realistically used equipment; unobstructed access.
Subject: one complete split-system outdoor condenser installation, photographed
before any work begins.
Style/medium: realistic field documentation photography, technically legible,
neutral color, not cinematic or promotional.
Composition/framing: landscape orientation, eye-level three-quarter view, all
relevant equipment fully inside the frame, enough context to understand
clearances and access.
Lighting/mood: even overcast daylight with minimal glare and no crushed shadows.
Constraints: physically plausible HVAC installation; no people; no open
energized compartments; no active service procedure; no invented labels or
readable measurements; no logos, brand names, watermark, annotations, arrows,
or text. This is illustrative and must not imply code compliance.
Avoid: dramatic lighting, shallow depth of field, stylized rendering, pristine
catalog staging, unsafe wiring, disconnected refrigerant tubing, duplicate
equipment.
```

## Exercised workflow

`pnpm run image-session` uses the real MCP stdio server to:

1. Measure the source before placement and require an exact 48 x 32-cell fit.
2. Place and detect a temporary dithered tracing reference through `L020`.
3. Remove the reference before publication.
4. Place the source as a self-contained embedded image.
5. Rehearse and commit the same source as deterministic lattice dither.
6. Save, reopen, validate, and render the document.

The generated outputs are `diagrams/condenser-image-workflow.turtlepen.json`
and `diagrams/condenser-image-workflow.svg`.
