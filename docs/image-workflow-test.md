# Condenser image workflow test

This fixture proves TurtlePen's image path with a representative HVAC photo and
a purpose-built line-art derivative rather than a synthetic pixel block.

## Embedded photo asset

- File: `assets/generated/p01-condenser-site-overview-illustrative.png`
- Dimensions: 1536 x 1024 px
- SHA-256: `0BD42FCFF3ABA16B3E29C8184C9DDE2C6F58357F796255BB4514A95C9B849E39`
- Generated with: built-in OpenAI image generation
- Intended use: TurtlePen ingestion, embedded rendering, and browser tests only
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

## Dither line-art asset

- File: `assets/generated/p01-condenser-site-overview-line-art.png`
- Dimensions: 1536 x 1024 px
- Size: 1,245,595 bytes
- SHA-256: `57D6CBB0B84F1B46EBC8FE127E2B475393CBF27AB6247C74B5528A145E6D254B`
- Generated with: two built-in OpenAI image-editing passes; the first derived
  service line art from the photo, and the second removed detail for the 1-bit
  target
- Intended use: deterministic dither and temporary reference-layer tests only
- Safety boundary: illustrative derivative, not field evidence

### Regeneration prompt

```text
Edit this service-manual condenser line drawing into an ultra-simplified,
high-recognition 1-bit source designed specifically to survive reduction to a
96 by 64 pixel black-and-white grid. Preserve the same outdoor condenser,
equipment pad, wall-mounted disconnect, electrical whip, and two refrigerant
lines in the same relative arrangement. Make the condenser unmistakable: bold
rectangular cabinet silhouette, simple top fan opening with only 2 or 3 rings
and 4 broad fan blades, and only 5 to 7 widely spaced bold vent marks on each
visible side. Remove grass, gravel, mulch, brick outlines, siding texture, tiny
screws, fine grille slats, hatch marks, shadows, and all stray detail. Use thick
uniform pure-black strokes, pure-white background, large negative spaces, no
gray, no antialias-like shading, no dots, no checker pattern, no text, labels,
arrows, dimensions, logos, or watermark. Keep every important component fully
inside the frame with generous margins. This is a clean technical pictogram
derived from the reference, not a new installation and not photographic
evidence.
```

The derivative must still be reviewed against the actual source by a qualified
technician. Generated line art can simplify presentation; it cannot establish
site condition or equipment compliance.

## Scaling and recognition evidence

Both sources measure `1536x1024` and fit exactly at `48x32` cells. The embedded
photo renders at `480x320` pixels, a 31.25% downscale on each axis. Dither uses
the separate `96x64` semantic quadrant grid, a 6.25% downscale and exactly
`16x16` source pixels per sample.

The initial experiment dithered the raw photo. It technically rendered, but a
blind recognizer guessed a teapot. Its 59.08% ink coverage, 69.24% neighboring
transition rate, and 2,119 runs quantify the checkerboard failure. `L022` now
blocks that result.

The line-art derivative in `dither` produces 12.94% ink coverage, 17.40%
neighboring transitions, and 458 runs. The same derivative in `simplify auto`
resolves to the near-binary threshold strategy at medium detail and produces
23.83% ink, 13.03% transitions, and 371 runs. It is intentionally bolder and
does not attempt a 1:1 copy. Both pass the deterministic noise gate.

The raw photo is also exercised through `simplify auto`; TurtlePen raises
`L023` because continuous-tone contour selection has no semantic understanding.
The test removes that heuristic result before publication. Passing numeric
readability does not prove identity; normal-size inspection and a blind identity
check remain required. See
[`image-scaling-procedure.md`](image-scaling-procedure.md) for the full policy.

## Exercised workflow

`pnpm run image-session` uses the real MCP stdio server to:

1. Measure both sources before placement and require an exact 48 x 32-cell fit.
2. Verify the dither report is 96 x 64 quadrants and 16 x 16 source pixels per
   sample.
3. Place raw-photo simplify, require `L023`, and remove the unverified result.
4. Place and detect a temporary line-art tracing reference through `L020`.
5. Remove the reference before publication.
6. Place the photo as a self-contained embedded image.
7. Rehearse and commit the line art as both deterministic dither and non-fidelity
   simplify.
8. Refuse every remaining S0-S2 finding, including `L022` and `L023`.
9. Save, reopen, validate, and render the document.

The generated outputs are `diagrams/condenser-image-workflow.turtlepen.json`
and `diagrams/condenser-image-workflow.svg`.
