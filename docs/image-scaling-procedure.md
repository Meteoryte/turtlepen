# Image scaling procedure

Use this procedure for every TurtlePen image. It separates photographic
evidence from simplified lattice artwork and makes every resampling decision
visible before publication.

## Non-negotiable rules

1. Call `measure_image` before placement.
2. Use `embed` for field photographs, nameplates, instrument displays, damage,
   wiring evidence, and any image whose real detail matters.
3. Use `dither` when tonal pattern is intentional. Use `simplify` when a clean,
   non-fidelity approximation is more useful than a literal 1-bit copy.
4. A raw photograph simplified by geometry is still semantically unverified.
   `L023` blocks it until normal-size blind review or replacement with a
   purpose-built high-contrast derivative.
5. Prefer `fit: "contain"`. Use `cover` only when intentional cropping has been
   reviewed.
6. Upscaling never creates detail. A larger display is not a higher-resolution
   source. A supersampled working canvas can preserve thin connected structure
   during processing, but does not create source information.
7. Validate, render, and inspect the result at its intended reading size. A
   clean collision report does not prove that an image is understandable.

## Mode decision

| Need | Mode | Reason |
|---|---|---|
| Preserve real site or equipment evidence | `embed` | Keeps the verified source bytes in the document. |
| Preserve source tone as 1-bit lattice pattern | `dither` | Applies deterministic Bayer thresholding to prepared PNG pixels. |
| Preserve recognizable structure instead of every tone | `simplify` | Intentionally drops texture, joins contours, and cleans small fragments. |
| Trace a temporary construction reference | `place_reference` | Uses dither or simplify on a flagged page that `L020` requires you to remove. |

For the same subject, keeping both is valid: embed the real photo and place a
separate line-art derivative as dither or simplify. The derivative may change
proportions, remove details, thicken edges, or omit background context when
that makes the subject clearer. Label it so it cannot be mistaken for field
evidence.

## Placement procedure

1. **Measure.** Call `measure_image` with exactly one of `maxWidthCells` or
   `maxHeightCells`. Read the source dimensions, whole-cell footprint, aspect
   drift, and both scale reports.
2. **Choose the mode.** Select `embed` for evidence, `dither` for tonal lattice
   treatment, or `simplify` for a reviewed approximation. Stop if the source
   purpose and mode disagree.
3. **Choose the fit.** `contain` preserves the complete image and may add blank
   padding. `cover` fills the footprint and may crop edges. Never use `cover`
   where cropped evidence could change the meaning.
4. **Place at the measured span.** If a different span is necessary, read the
   new report rather than estimating the effect. For `simplify`, choose
   `supersample: 1`, `2`, `4`, or `auto` (`auto` prefers 4x within limits).
5. **Read the response.** Confirm `UPSCALE`, `DOWNSCALE`, or `EXACT`, content
   pixels, semantic sample dimensions, selected simplification strategy/detail,
   working-canvas factor and dimensions, final reduction, discarded fragments,
   and readability.
6. **Validate.** Resolve every S0-S2 finding. `L022` blocks high-frequency
   raster output. `L023` blocks a continuous-tone heuristic approximation until
   semantic review or replacement.
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

### Simplify

`simplify` is deliberately not a 1:1 conversion. Its final output still uses
two quadrants per cell, but processing may occur on a larger internal canvas
before deterministic reduction to that final lattice:

1. Sample the source onto a `1x`, `2x`, or `4x` linear working canvas.
2. Simplify on that canvas using one of the strategies below.
3. Clean disconnected fragments on the working canvas, then box-average each
   working block into the exact ink-coverage fraction of one final quadrant.

At `4x`, the working canvas has four times the final width and height. Each
final quadrant therefore receives the average of a `4x4` block of 16 working
samples: one of 17 exact coverage levels from 0/16 through 16/16. No second
binary threshold discards that coverage.
For a final `96x64` lattice, processing occurs at `384x256` and then returns to
`96x64`; document geometry and rendered footprint never change.

The two deterministic simplification strategies are:

- **Near-binary source:** identify the page-ground tone, keep sufficiently
  contrasting structure as solid ink, close isolated gaps, and remove fragments.
  This is the preferred path for LLM-generated or edited technical line art.
- **Continuous-tone source:** area-sample or nearest-repeat by scale direction,
  smooth according to the resolved `low`, `medium`, or `high` detail budget,
  rank colour-aware edges and background contrast, extend weaker pixels only
  when they continue a strong contour, and remove small disconnected fragments.

`auto` detail resolves from target size and scale severity. `auto` supersampling
prefers `4x`, then reduces to `2x` or `1x` only when needed to stay under the
working-canvas ceiling. An explicit factor never silently falls back: it either
runs exactly or refuses with the calculated size. Supersampling does not infer
new pixels; it provides more intermediate positions for thresholding, contour
joining, and cleanup, which can retain a thin connected feature that direct
final-size processing would discard.

The coverage values are stored on deterministic horizontal runs and emitted as
SVG fill opacity, while every run coordinate and the image's claimed footprint
remain on the integer quadrant lattice. Save/reopen recomputes weighted metrics
from those runs and rejects missing, zero, non-numeric, or greater-than-one
coverage.

The receipt records the requested/resolved factor, working dimensions, source
scale into that canvas, box-average method, samples per output, partial final
quadrants, strategy, and parameters. Simplify refuses a target with fewer than
24 quadrants (12 cells) on its short side; below that, use a larger footprint or
purpose-built icon artwork. It also caps semantic analysis at 250,000 quadrants;
the internal working canvas is capped at 1,000,000 quadrants. Larger evidence
stays embedded or is simplified at a smaller semantic size. Like dither,
simplify discards the source after
creating durable runs and must be removed/re-placed to change its span.

A continuous-tone result always raises `L023`: contrast processing can make an
image cleaner, but cannot know that the fan, disconnect, data plate, or another
feature is the subject. A generated or edited high-contrast derivative is often
the correct recovery and does not need to match every source pixel.

## Readability gate

`L022` measures how often neighboring quadrants switch between ink and ground
for dither. For simplify, it measures the weighted coverage difference between
neighbors, so a 1/16-to-2/16 edge counts less than a solid-to-empty switch.
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
| Prepared line art, `simplify auto`, `supersample 4` | `480x320` px | `384x256` working quadrants -> `96x64` final, 16-sample box average, medium detail | 15.56% effective ink, 12.72% weighted transitions, 1,458 partial quadrants across 17 levels: `PASS`; softer non-fidelity result. |
| Raw photo, `dither` (rejected) | `480x320` px | `96x64` quadrants, 6.25%; 16x16 source px per sample | 59.08% ink, 69.24% transitions, 2,119 runs: `BUSY`. |
| Raw photo, `simplify auto` (review gate) | `480x320` px | `96x64` quadrants, adaptive contour strategy | Low-frequency output, but `L023` blocks it because identity is not machine-verifiable. |

The raw-photo conversion was also blind-guessed as a teapot rather than an
outdoor condenser. That is a semantic failure even though the file rendered.
The corrected workflow keeps the photo embedded and uses the reviewed generated
derivative for both source-like dither and a softer simplified approximation.

## Five-case seeded-random exercise

`pnpm run random-images` generates five reproducible sources across RGB/RGBA,
portrait/landscape, contain/cover, and every explicit detail level. Each is
placed as source evidence, direct `1x` simplify, and `4x -> 1x` simplify through
real MCP. The exercise asserts identical final geometry, the requested working
factor, near-binary provenance, durable partial coverage, lower weighted edge
transitions without effective-ink inflation, and clean save/reopen/render.
See the [contact sheet](../diagrams/supersample-random-five.svg) and
[hash-backed evidence ledger](supersample-random-five-report.md).
