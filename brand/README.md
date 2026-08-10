# TurtlePen brand

## The actual logo

`logo.svg` is the canonical full TurtlePen logo: the supplied friendly turtle
drawing on an easel, with the **Turtle Pen / MCP** wordmark. `logo-mark.svg` is
the illustration-only mark used by the live viewer.

Both are rendered by TurtlePen from `logo.turtlepen.json`. The supplied bitmap
was used as a visual reference only; it is not embedded, traced as an image, or
shipped in either artifact.

| Part | TurtlePen construction |
|---|---|
| shell, body, head, feet, arm, hand | scan-converted to exact 5px quadrant runs and painted with `paint: "cells"` |
| navy silhouettes and shell plates | open/closed artwork paths with safe hex colour, 1–5px width, and round caps |
| eyes and pupils | `disc` fills plus `circle` outlines |
| pen and nib | `ray`/polyline barrel plus a filled lattice polygon |
| easel, board, clamp, tray, legs | filled lattice polygons with separate vector outlines |
| board flourish | a green polyline and arc |
| wordmark | measured TurtlePen text with explicit colour, alignment, size, and weight |

The construction uses four semantic Z-pages above the base: colour, outlines,
features, and type. Cartoon parts deliberately overlap. The build validates
those overlaps and accepts each non-INFO finding by its geometry fingerprint
with an explicit reason; any changed geometry produces a new fingerprint and
will block the next build until it is reviewed. The current artifact has no
open finding above INFO.

## Regenerating

```bash
pnpm run logo
```

That one command uses TurtlePen's own tool handlers to:

1. create a 120×120-cell document;
2. rehearse all 64 composition operations;
3. commit them transactionally;
4. validate and fingerprint intentional construction overlaps;
5. save `logo.turtlepen.json`;
6. render the 1200×1200 `logo.svg` and cropped `logo-mark.svg`.

The creation timestamp and acceptance timestamps are pinned presentation
metadata, so rerunning the command produces byte-identical JSON and SVG files.

`trace.mjs` remains a general implicit-shape tracer from the earlier logo
study. The canonical logo builder now uses finer quadrant scan conversion in
`build-logo.mjs`, which is better suited to the supplied cartoon reference.
