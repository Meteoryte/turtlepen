# Image scaling procedure

Use this procedure for every TurtlePen image. It separates photographic
evidence from simplified lattice artwork and makes every resampling decision
visible before publication.

## Non-negotiable rules

1. Call `measure_image` before placement.
2. Use `embed` for field photographs, nameplates, instrument displays, damage,
   wiring evidence, and any image whose real detail matters.
3. Use `dither` only for a sparse, high-contrast derivative prepared for 1-bit
   output. Do not use a raw photograph as trace art.
4. Prefer `fit: "contain"`. Use `cover` only when intentional cropping has been
   reviewed.
5. Upscaling never creates detail. A larger display is not a higher-resolution
   source.
6. Validate, render, and inspect the result at its intended reading size. A
   clean collision report does not prove that an image is understandable.

## Mode decision

| Need | Mode | Reason |
|---|---|---|
| Preserve real site or equipment evidence | `embed` | Keeps the verified source bytes in the document. |
| Create a stylistic lattice illustration | `dither` | Converts a prepared PNG to deterministic 1-bit quadrant runs. |
| Trace a temporary construction reference | `place_reference` | Uses dither on a flagged page that `L020` requires you to remove. |

For the same subject, keeping both is valid: embed the real photo and place a
separate line-art derivative as dither. Label the derivative so it cannot be
mistaken for field evidence.

## Placement procedure

1. **Measure.** Call `measure_image` with exactly one of `maxWidthCells` or
   `maxHeightCells`. Read the source dimensions, whole-cell footprint, aspect
   drift, and both scale reports.
2. **Choose the mode.** Select `embed` for evidence or `dither` for prepared
   line art. Stop if the source purpose and mode disagree.
3. **Choose the fit.** `contain` preserves the complete image and may add blank
   padding. `cover` fills the footprint and may crop edges. Never use `cover`
   where cropped evidence could change the meaning.
4. **Place at the measured span.** If a different span is necessary, read the
   new report rather than estimating the effect.
5. **Read the response.** Confirm `UPSCALE`, `DOWNSCALE`, or `EXACT`, the content
   pixels, semantic sample dimensions, procedure, and dither readability.
6. **Validate.** Resolve every S0-S2 finding. `L022` blocks a checkerboard-heavy
   dither from publication.
7. **Inspect.** View the render at normal size and perform a blind identity
   check: ask a reviewer who has not seen the source what the image depicts and
   which features support that answer.
8. **Record the result.** Keep the source hash, dimensions, prompt or capture
   provenance, mode, fit, sample size, and review outcome with the project.

## Exact scaling behavior

### Embed

`embed` places the verified PNG, JPEG, or GIF in an SVG viewport. The renderer
uses aspect-preserving resampling:

- **Downscale:** all source detail remains in the document, but fewer display
  pixels represent it. Fine features may not be visible at normal reading size.
- **Upscale:** the renderer interpolates the existing pixels. It does not infer
  new equipment detail, text, edges, or measurements.
- **Contain:** uses the smaller uniform axis ratio; unused viewport area becomes
  padding.
- **Cover:** uses the larger uniform axis ratio; content outside the viewport is
  cropped.

Embedded images may be resized. TurtlePen recomputes the scale report after a
successful resize.

### Dither

The semantic resolution is **two quadrants per cell on each axis**, not the
final SVG pixel size. A `48x32`-cell placement is sampled at `96x64` quadrants.
Each resulting quadrant is then drawn as a fixed 5x5-pixel block.

- **Downscale:** TurtlePen area-weights every source pixel contributing to a
  destination quadrant, composites alpha over the page ground, then applies the
  deterministic 4x4 Bayer threshold.
- **Upscale:** TurtlePen repeats the nearest source sample over whole destination
  quadrants, then applies the same threshold. It does not interpolate or invent
  line detail.
- **Contain/cover:** both preserve source aspect before sampling. Contain pads
  with page ground; cover crops the source region outside the footprint.

Dither runs are bound to the exact quadrant grid and the source bitmap is
discarded from the saved document to avoid multi-megabyte history duplication.
TurtlePen therefore refuses `resize` on a dithered image. Remove it and call
`place_image` again from the source at the new span so sampling is recomputed.

## Readability gate

`L022` measures how often neighboring quadrants switch between ink and ground.
A result above **45%** is classified `BUSY` and blocks publication at S2 because
the Bayer checker pattern is likely to obscure the subject.

This is a deterministic noise proxy, not semantic recognition. A result below
45% can still depict the wrong object, omit a critical feature, or be unclear.
The rendered-image inspection and blind identity check remain required.

## P01 worked example

Both P01 sources are `1536x1024` and are placed at `48x32` cells:

| Source and mode | Display | Semantic sampling | Result |
|---|---:|---:|---|
| Field-style photo, `embed` | `480x320` px, 31.25% | `480x320` display samples | Retains photographic evidence. |
| Prepared line art, `dither` | `480x320` px | `96x64` quadrants, 6.25%; 16x16 source px per sample | 12.94% ink, 17.40% transitions, 458 runs: `PASS`. |
| Raw photo, `dither` (rejected) | `480x320` px | `96x64` quadrants, 6.25%; 16x16 source px per sample | 59.08% ink, 69.24% transitions, 2,119 runs: `BUSY`. |

The raw-photo conversion was also blind-guessed as a teapot rather than an
outdoor condenser. That is a semantic failure even though the file rendered.
The corrected workflow keeps the photo embedded and uses only the simplified
derivative for lattice art.
