# TurtlePen brand

## The logo

`logo.svg` is drawn **by TurtlePen**, not by hand and not imported. Every mark in
it is a 5px lattice quadrant in `logo.turtlepen.json`, a validated document with
39 adjudicated findings and zero errors.

The engine now has real shape primitives, so most of the figure is a single
command each — `circle`, `disc`, `ray`, `triangle`, `dash`. Only the shell is
still traced, because it is an ellipse and the engine draws true circles:

| Part | How it is drawn |
|---|---|
| shell, inner rim | traced ellipse outline (`trace.mjs`) |
| carapace plates, head, snout, eye, feet, hand | `circle` / `disc` — midpoint algorithm |
| pupil | `disc 2` |
| arm, neck, pen barrel | `ray` — Bresenham at any angle |
| pen nib, tail | `triangle` |
| brow, corner accents | `dash <n> <dir8>` and `dot` — morse-style marks |
| shell volume | a dithered gradient on an overlay page at 0.45 opacity |
| wordmark | a real `place_box` label, measured before placement |

Four Z-pages carry the depth: `base` (easel), `shade` (dither, 0.45),
`body` (outlines), `detail` (everything on top).

The shell is still traced because an ellipse is not a circle:

1. Define the form implicitly — the shell is `(x-cx)²/rx² + (y-cy)²/ry² <= 1`.
2. Rasterise it at cell resolution.
3. Walk the boundary, keeping the outside on the left.
4. Compress each straight run into one `<dir> N line`, and put a corner at every
   turn.

The shell comes out as **63 orthogonal runs**. The pen literally walks the
outline, which is what a turtle graphics system is for.

- `trace.mjs` — the shape-to-pen-program tracer. `traceProgram(inside, x0, y0,
  x1, y1)` takes a membership test and returns a pen program.
- `build-logo.mjs` — the composition: which ellipse is which body part.

Spur cancellation matters: at the extreme tips of an ellipse the boundary walk
goes out one cell and straight back, which would retrace its own quadrants and
ask for a corner joining a side to itself — not a corner at all. Those pairs are
cancelled before emission.

## Regenerating

```bash
node brand/build-logo.mjs          # writes logo-ops.json
# then send the operations through the turtlepen MCP `plan` tool, commit,
# adjudicate, and render
```

## Why so many accepted findings

A drawing is not a diagram. Every closed outline begins and ends at the same
quadrant (`L008`, `L015`), and body parts touch each other on purpose (`L006`).
Each one is accepted with a stated reason rather than forced, so the intent is
on the record and lapses automatically if the geometry moves.
