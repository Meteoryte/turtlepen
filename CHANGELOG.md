# Changelog

## Unreleased — 2026-08-26

- Schema 2 persists perceptual review and migrates schema-1 documents.
- Validation distinguishes blocking errors, unresolved S2 decisions, and
  structural clearance; the viewer separately reports perceptual readiness.
- Runtime JSON-schema enforcement covers direct calls and nested plan
  operations. `runtime_info` identifies the running build and active document.
- `connect` adds semantic direct, orthogonal, and node-attached curved
  relationships through explicit lattice waypoints. `annotate` and
  `inspect_model` add model metadata, perspectives, and completeness checks.
- `micro_mask` adds a reversible 1-design-pixel eraser for artwork paths and
  images without changing structural footprints.
- 588 tests and 52 MCP tools are covered through core, real stdio, and
  WebSocket endpoint contracts.

## 0.2.0 — 2026-08-18

Flowchart support, the perceptual half of quality, and the loop repairs a weaker
author could not make unaided. 318 → 419 tests.

### Flowchart symbols

- **Node shapes** — `decision` `terminator` `subprocess` `io` `prep` `manual`
  `data` `document` `bar`, plus `lane` and `group` containers. A shape still
  claims its whole bounding box and only inks its symbol, so layout, gutters and
  `free_space` are unchanged and a stroke clipping a diamond's empty corner is
  `L013` information rather than an `L004` error.
- **Text is measured against the symbol, not the box.** A diamond gives a label
  about half its bounding width, so the same label in the same span fits a
  rectangle and overflows the diamond — the overflow bug this engine exists to
  eliminate, extended to shapes.
- **Containers** reserve only a title band and border ring, leaving the hole
  free so members collide with nothing while a node straddling the frame still
  reports `L001`.
- **`F001` / `F002`** — more than one start, and a decision that does not
  branch. Self-activating on any document using flowchart symbols, so nothing
  previously drawn is reclassified. Edges are read from what the author stated,
  never from proximity.
- **`import_mermaid`** — a compiler onto ordinary operations. It returns
  operations and changes nothing, so an import faces the same validation as
  hand-drawn work.

### Seeing what the collision log cannot

- **`perceptual_review`** — record what a drawing *looks like* after rendering
  and looking at it. Nothing here reaches collision geometry, the structural and
  perceptual verdicts are never merged, and a review binds to the `renderHash`
  of the bytes the critic saw, so editing the drawing marks it stale. An
  unreviewed document is `NOT REVIEWED`, never clean.
- **`render` returns a `renderHash`**, closing the render → look → review loop.
- **"Done" is defined** in `HELP` and `llm.md`: validated after the last edit,
  adjudicated to zero open findings, rendered to a file, and looked at.

### Repairing without guessing

- **`repair`** — turn a finding's fix into the call that performs it. Advisory
  fixes (`reroute`, `offset`, `hop`, `extend`, `rename`, `shorten`) are refused
  by name, because where a path should go instead is a design decision.
- **`route`** — propose a connector as a *pen program*, changing nothing. It
  tries straight, one turn and two turns, and when none is clear it says so and
  names the obstacle rather than inventing an unreadable path.
- **No-progress detection** — `validate` says so after three checks with edits
  between them and the same findings still open.
- **Duplicate ids now suggest a free name** instead of dead-ending.

### Fixed

- **`L001` gated on bounding-box overlap** and only then computed the claimed
  intersection. For solid boxes the two are identical so it never showed; for a
  hollow container it reported every member inside as a critical collision. It
  now tests the claimed intersection itself. All 369 tests at the time passed
  unchanged, which is the evidence it was a strict correction.
- **`hop to <address>`** parsed, hopped one quadrant and discarded the target.
  It now refuses by name.
- **`L013`** described a path through a container's hole as passing through a
  "corner cut" — the mechanism, but not the truth.

### Documentation and evaluation

- `docs/QUICKSTART.md`, executed by the test suite so it cannot drift.
- `package.json` gains `bin`, `exports`, `files`, `keywords`.
- `benchmark/corpus-v1.json` — 16 frozen tasks with a digest lock, four negative
  cases, and a four-dimension rubric. The harness and any results are
  deliberately absent: the corpus must be fixed before measuring.
- `HELP` reordered so `THE CANVAS IS NOT A BUDGET` and `WORKFLOW` come first.

### Found by looking (0.2.1)

A shape catalogue was rendered and inspected — six of the ten node shapes had
never been drawn at all, only unit-tested. Every mask was provably correct and
four things on screen were still wrong:

- **`pattern: "dotted"` drew nothing.** It emitted zero-length lines with a butt
  cap, which by SVG spec render no pixels. A documented feature produced an
  empty row and validated perfectly.
- **`bar` was identical to `process`** — it fell through to the rectangle
  outline, so a fork/join bar was indistinguishable from a process step, which
  is the one job the symbol has.
- **`document`'s foot** used a control point 2.4× its cap, drawing a bite far
  deeper than the quadrants actually carved.
- **`data` read as a drum**, not stored data, because nothing drew the back edge
  of its top ellipse.

`test/rendered-shapes.test.js` now asserts each of these against the emitted
SVG rather than the mask.

### Known and deliberately unbuilt

`F003`/`F004` (branch labels and verb phrases) would require guessing. The
benchmark harness is not written and nothing has been run, so the claim that a
model using TurtlePen is measurably better remains **untested**.

## 0.1.0

Initial prototype: integer lattice, pen grammar, collision engine, MCP surface,
history, groups and constraints, image placement, wireframe and perspective.
