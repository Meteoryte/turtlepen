# Changelog

## Unreleased

- Added the canonical Cloudflare/ChatGPT Sites D1+R2 Streamable HTTP adapter to
  the public package. Hosted deployments now re-export this source instead of
  maintaining a private second transport implementation.
- Structural validation now reports `PASS`, `PASS_WITH_EXCEPTIONS`, or `FAIL`;
  accepted decision findings can no longer be presented as a bare clean pass.
  Added `release_check`, current render-profile binding, and required
  render-bound evidence for release with accepted critical/error findings.

- Extracted one transport-independent, stateful MCP protocol runtime so stdio
  and remote HTTP cannot drift into different tool registries or behaviors.
- Added a zero-dependency MCP 2025-06-18 Streamable HTTP transport with all 74
  canonical tools, request-scoped SSE replies, isolated stateful sessions,
  serial mutation ordering, explicit teardown, filesystem confinement, bounded
  resources, storage purge on teardown/expiry, origin checks, private-preview
  bearer auth, and metadata-only audit events.
- Added executable remote transport coverage and a deployment contract that
  keeps public release gated on OAuth identity, TLS, quotas, and a session-bound
  file bridge.
- Fixed shape-aware measurement so `subprocess` side bars, container title
  bands, and every other node aperture use the exact same geometry as placement,
  validation, inspection, and rendering. `createTools(session)` now measures
  14x3 for a subprocess instead of the defective 13x3.
- Corrected `L002` arithmetic so the width named in its message is the same
  unbroken width used to calculate the reported overflow.
- 667 tests pass, including the real HTTP and Cloudflare-hosted transport boundaries, the
  final release gate, and an all-12-shape
  measurement audit.

## 0.3.2 — 2026-08-27

- Tightened the published-file allowlist so repository backups and other
  transient artifact state cannot enter the package through broad directories.
- Made the repository-only governance command report a stable source-checkout
  boundary in packaged installs instead of exposing a raw Git failure.
- Exposed the existing review-status mode and governance scope in CLI help.
- Made both root reference builders idempotent by fixing generated metadata and
  added an isolated two-pass regression so a verification run cannot silently
  rewrite tracked documents and manifest hashes.
- Re-audited the source, package, local browser workbench, links, JSON, secrets,
  naming, and SSOT ownership; 628 tests and the complete generated-artifact gate
  cover the repaired release boundary.

## 0.3.1 — 2026-08-26

- Added an authored artifact catalog as the single owner of release, example,
  fixture, and study roles. The generated manifest now reports role-scoped
  quality and all 8 release artifacts are structurally clear, exported, and
  bound to current perceptual reviews.
- Added a naming and SSOT governance gate covering catalog completeness,
  kebab-case filenames, generated help/manifest parity, runtime version,
  registry uniqueness, artifact hashes, and the source-of-truth map.
- Added CLI JSON render receipts and guarded `review` recording so visual
  evidence can be bound to the exact rendered bytes outside an MCP host.
- Repaired dependency-free PNG/PDF fidelity for flowchart silhouettes, measured
  text size/alignment/weight, gradients, styled paths, view keys, and
  aspect-preserving images.
- Deterministic builders now preserve a perceptual review only when rebuilt SVG
  bytes are identical; changed output lapses the review. Generated timestamps
  are stable, so a verification run leaves canonical artifacts unchanged.
- Normalized project filenames to the workspace naming protocol and documented
  the authoritative owner for version, schema, tools, artifacts, commands, and
  current verified state.
- 625 tests and 61 MCP tools are covered through core, real stdio, CLI,
  governance, quality, and WebSocket endpoint contracts.

## 0.3.0 — 2026-08-26

- Schema 3 persists perceptual review plus one shared semantic model, static,
  filtered, and ordered dynamic views, themes/tokens, resource links, and
  fingerprinted semantic-finding acceptances. Schema-1 and schema-2 documents
  migrate without geometry changes.
- Validation distinguishes blocking errors, unresolved S2 decisions, and
  structural clearance; the viewer separately reports perceptual readiness.
- Runtime JSON-schema enforcement covers direct calls and nested plan
  operations. `runtime_info`, `doctor`, the capability registry, and searchable
  help identify the running build and active document without stale counts.
- `connect` adds semantic direct, orthogonal, and node-attached curved
  relationships through explicit lattice waypoints. `annotate` and
  `inspect_model` add model metadata, perspectives, and completeness checks.
- Relationships now retain visible labels and outcomes through four-direction
  layout and rerouting. Layout supports top-down, bottom-up, left-right, and
  right-left reading directions plus composition-preserving pins.
- `micro_mask` adds reversible, continuous 1-design-pixel eraser strokes for
  artwork paths and images, with full-mask warnings and SVG/PNG parity without
  changing structural footprints.
- Saves/checkpoints/exports use same-directory atomic replacement, backups, and
  optimistic hashes; stale concurrent writers are refused instead of winning.
- The dependency-free CLI validates and inspects models, renders deterministic
  SVG/PNG/PDF, generates architecture documentation bundles and quality
  manifests, and runs/scores benchmark adapters without fabricating perceptual
  results.
- SVG output carries document/element relationship semantics and generated
  notation keys. The local viewer adds view switching, semantic model review,
  bounded history, exact plan rehearsal/approval diffs, lazy canvas state, and
  continuous pointer erasing.
- 613 tests and 61 MCP tools are covered through core, real stdio, CLI, and
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

`F003`/`F004` (branch labels and verb phrases) would require guessing. A
benchmark harness now exists, but no same-model comparative run has been
executed, so the claim that a model using TurtlePen is measurably better remains
**untested**.

## 0.1.0

Initial prototype: integer lattice, pen grammar, collision engine, MCP surface,
history, groups and constraints, image placement, wireframe and perspective.
