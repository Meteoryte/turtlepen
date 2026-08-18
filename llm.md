# TurtlePen Agent Contract

## Read order

1. `README.md` for the lattice, the pen grammar, the rule table, and commands.
2. `status.md` for current truth, what is proven, and what is deferred.
3. This file before changing anything in `src/core/`.

The design record is `docs/superpowers/specs/2026-08-07-turtlepen-design.md` at
the workspace root.

## What this project is

A substrate for AI-authored diagrams. It exists because generative diagram
output is sloppy in a specific, diagnosable way: the author commits to a layout
before anything knows how big the content is. TurtlePen moves measurement ahead
of placement and makes every defect a ranked, numeric finding.

## Invariants — do not break these

- **Integer geometry.** Every coordinate in the engine is a whole number of
  quadrants (5px). No floats reach the collision engine. `rect()` throws on
  non-integers on purpose; do not relax it, and do not introduce a coordinate
  that requires rounding. If a feature needs a half-quadrant, the feature is
  wrong, not the lattice.
- **The engine never silently changes geometry.** It measures and reports; the
  AI decides. No auto-resize, no auto-shrink, no snapping a stroke onto a track
  without emitting `L014`. Auto-fit and auto-routing are deferred features, and
  when built they must produce visible, inspectable output rather than quiet
  correction.
- **Measurement and rendering share one code path.** `core/text.js` owns
  measurement; `core/svg.js` emits `textLength` + `lengthAdjust` on every run so
  the renderer cannot disagree. Do not add a rendering path that lays out text
  independently — that reintroduces the exact bug this project eliminates.
- **Claimed vs visual footprint is load-bearing.** `elementClaimed` is what an
  element reserves, `elementVisual` is where ink lands. Corner styles carve the
  difference. Rules must use the right one: body crossings are errors, corner-cut
  crossings are information.
- **Acceptance is fingerprinted, never blanket.** A finding is accepted by a
  hash of rule + page + actors + exact quadrants. Never add an
  accept-by-rule or accept-by-element escape hatch; an acceptance that survives
  a geometry change is indistinguishable from a missed defect. Only a current
  fingerprint may be accepted; retain rule/page metadata so a lapsed acceptance
  remains auditable, visible, and withdrawable.
- **A green `validate` is not evidence of a good diagram.** It is evidence of an
  undefective one. `summary.clean` considers only `S0` and `S1`; composition
  findings are `S3` and deliberately do not affect it. Adjudicate them like any
  other finding — compose the page, or declare the page intent `schematic` to
  state that the sparseness is deliberate. Never suppress one by lowering its
  severity or widening the threshold to fit the diagram in front of you: the
  threshold is calibrated against `diagrams/`, and moving it silently
  reclassifies every past diagram.
- **Composition is judged per document, on its densest page.** Judging each page
  independently was tried and was wrong — an annotation overlay is legitimately
  sparse, and four of the seven shipped diagrams tripped on their `notes`,
  `review` and `leaves` overlays while their base pages were richly composed.
- **Composition rules C002–C004 are deferred, not forgotten.** Primitive-heaviness,
  repetition, and absolute addressing cannot be measured from a saved document:
  it stores rasterized `line`/`corner` pieces and no program, and placement
  anchor provenance is not persisted. Durable `constraint` records are a
  separate explicit relationship graph. Geometric proxies for program usage
  false-flag real diagrams — `branching-tree` and `home-lab-network` are 100%
  straight runs because a network diagram legitimately is. They are unblocked by
  a negative corpus under `diagrams/negative/`, not by a cleverer heuristic. See
  `docs/superpowers/specs/2026-08-09-turtlepen-composition-findings-design.md`
  at the workspace root.
- **Placement is never rejected for collision.** Only structurally impossible
  input throws (off-grid placement, a corner that does not include its arrival
  side, a malformed program). Collisions are reported, not blocked.
- **Fix kinds and repair tools are a closed set.** Every `fix.kind` the collision
  engine emits must have a tool that applies it. A diagnostic vocabulary that
  outgrows the action vocabulary strands the AI in a loop it cannot exit — it
  reads advice, finds nothing that performs it, and resorts to deleting and
  redrawing. `test/edit.test.js` asserts the mapping; if you add a fix kind, add
  its route in the same change.
- **`plan` and the tools share one code path.** Every mutating capability is a
  named entry in `core.OPERATIONS`, run against either a throwaway clone or the
  live document. Do not add a mutation that only the tool layer can perform —
  it would be invisible to rehearsal.
- **Argument normalisation belongs in core, not in the tool layer.** An
  operation must mean the same thing called directly, invoked as a tool, or
  rehearsed inside a plan. `place_box` once parsed its span string in the tool
  handler, so the same operation took `"12x5"` as a tool and `{w,h}` in a plan —
  two incompatible signatures for one name. `normalizeSpan` now accepts both, in
  core, where every path reaches it.
- **A batch is all-or-nothing.** `commitOperations` rehearses first and applies
  only if every operation succeeds. A partially applied batch leaves the
  document in a state the caller never asked for.
- **Every core mutation inherits recovery.** The MCP history boundary is derived
  from `core.OPERATIONS`, not a second hand-maintained list. It snapshots the
  complete serialized document before a mutation, records only a successful
  state change, restores partial failures in memory and on disk, bounds history
  at a configurable 1–1000 entries (100 by default), and clears redo after a
  divergent edit. A versioned sidecar is bound to the exact serialized document
  hash, so open and process restart restore history while outside edits invalidate
  it. Force-save provenance is not an
  undoable edit because undo must never hide that an external gate was bypassed.
- **Composition source is durable document state.** `wireframe` and
  `perspective_scene` metadata must survive serialization. The former powers
  `export_prompt` after reopen; the latter is the durable receipt for the
  real-world dimensions and camera that produced projected geometry. Before
  export, every generated wireframe box and routed path must still match that
  source; stale source is refused by element name rather than emitted as fact.
- **Free-space scope is explicit.** The MCP default is `scope: "stack"`, which
  merges every non-reference page, including hidden pages because validation
  still checks them. `scope: "page"` is the deliberate override for intended
  cross-page overlap. Responses must expose the target and searched page ids;
  tracing references are excluded because overlap is their declared purpose.
- **Regional description is exact, not bounding-box approximate.** `describe`
  may filter by a cell range, optionally with a page. Rectangular elements use
  their claimed rectangles; paths test every stored quadrant piece so an empty
  part of an L-shaped path's bounds is not a match. The response exposes the
  normalized effective filter without changing its per-page array shape.
- **Placement anchors resolve at execution time; follow constraints are
  explicit.** `at shell.N` derives a coordinate when a pen program runs and does
  not create a relationship by accident. `constraint` deliberately stores one
  parent per dependent with exact anchor offsets. Chains cascade; cycles,
  duplicate parents, dangling ids, and invalid indexed anchors are refused.
- **Groups are flat ownership, not nested geometry.** An element belongs to at
  most one group. Group movement is one exact batch across pages; rename/removal
  maintain membership, and constraints reconcile the moved set once so a member
  cannot move twice.
- **Artwork styling is presentation-only.** An artwork path may use a colour,
  thin width, and cap, and the SVG may simplify the painted polyline. Its stored
  integer pieces remain the sole collision and selection geometry.

## Size is a choice, not a constraint

The lattice is unbounded right and down, and `set_canvas` grows a document. A
size chosen early is a first guess; it is not a budget, and it is not a reason
to cram.

This is written down because an authoring session hit it hard. A pixel typeface
was drawn in a 7x7 quadrant box, and when a feature needed diagonals long enough
to carry a dash, the author reported that the lattice could not express it —
having picked 7 themselves an hour earlier. The same session had already
concluded that curves were impossible before `raster.js` existed, and that
angled lines were limited to eight compass directions while `ray` sat available.
Three instances of the same error: **a limit the author imposed being reported
as a property of the engine.**

Two capabilities are forgotten in exactly this way, so check them before
concluding something cannot be drawn:

- **A feature may be more than one stroke.** If detail would damage a shape by
  being carved out of it, draw a second mark beside it. Additive beats
  subtractive — subtracting from the stroke that carries the meaning destroys
  the thing being annotated. The trendline work failed repeatedly for this
  reason before the box size was even in question.
- **Layers exist.** An `overlay` page puts marks on top without an `L001`, so
  annotation, texture, and construction do not have to compete with the artwork
  for the same quadrants.

None of this argues for unbounded growth. A canvas far larger than its content
trips `C001`, and a diagram nobody can read at a glance has failed differently.
Take the room the drawing needs, and no more.

## Done means rendered, validated, and looked at

A drawing is not delivered until all four have happened, in this order:

1. **validate AFTER the last edit.** An earlier clean log says nothing about the
   state the work was finished in.
2. **adjudicate to zero open findings** — each one fixed, or accepted with a
   written reason. "Three minor ones remain" is a report of three known defects.
3. **render to a file.** The SVG is part of the deliverable, not an extra
   produced when someone asks for it.
4. **look at it.** `validate` proves the drawing is undefective, never that it
   is finished or that it depicts what was asked for.

Report what the final validation actually said. This is written down because a
session shipped a flowchart whose every decision node was a rectangle, never
rendered it until prompted, and reported it complete with three overlaps open.
`build_flowchart.js` and `build_logo_v2.js` encode the rule: both exit non-zero
if any finding above INFO survives.

## Boundaries

- `src/core/` is pure: no file I/O, no network, no process state. Persistence
  lives in `core/index.js` and the two server modules only.
- The MCP server holds one active document and applies requests through a serial
  promise chain. Keep that ordering — tools mutate shared state, so concurrent
  application would make the saved file depend on scheduling.
- The viewer owns one active document too. Browser mutations run through the
  tested MCP handlers on a serial queue, then broadcast over a local-origin
  WebSocket. Browser selection, hidden pages, zoom, and unsubmitted drafts are
  view state; document/history truth stays server-side. Keep the explicit tool
  and static-asset allowlists, masking/frame/protocol checks, CSP, and
  outside-file reload behavior.
- Zero runtime dependencies is a design choice, not an accident. The MCP
  transport is hand-rolled because newline-delimited JSON-RPC is small enough to
  own, and owning it removes install risk and SDK drift. Do not add a dependency
  without a stated reason that outweighs that.
- Nothing writes to stdout in the MCP server except protocol messages.
  Diagnostics go to stderr; a stray `console.log` corrupts the stream.

## Connector affordances — do not regress these

They were added after a real authoring session produced four broken connectors
from reasonable-looking code. Each encodes a lesson that is not obvious from the
geometry:

- **`pen from <id>.<face>`** seats the cursor just outside a box and faces it
  outward. The faces are not symmetric — south and east are already outside the
  rect, north and west are its own first row and column — which is exactly why
  hand-computed start addresses go wrong.
- **`<face>#<slot>` fans out competing connectors without hidden routing.**
  `#1` is the midpoint, `#2` moves one cell left/up, `#3` one cell right/down,
  then slots alternate outward by whole cells. The slot is bounded by the
  face's cell length and never clamped. Unindexed faces remain exact aliases of
  `#1`, including one-quadrant artwork anchors.
- **An omitted `align` continues on the cursor's current track.** The earlier
  fixed default silently shifted a seated cursor one quadrant off the port it
  was aiming at. Never restore a constant default.
- **`L016` is checked on the finished path, never per command.** Naming a box as
  the target of an intermediate leg ("go right until level with it, then turn")
  is correct usage; judging arrival per command cries wolf on every multi-leg
  route. Paths carry `targets`; only the last one is checked against the tip.

## Before changing the pen grammar

The parser is deliberately forgiving — tokens may appear in any order, a bare
address is a location, a bare style name binds to the element. That is so
natural phrasing parses (`up 1 align right line`, `up indented corner align
right bottom`). Preserve that property; do not impose a rigid token order.

Any grammar change needs a matching test in `test/pen.test.js` asserting the
exact quadrant footprint, not just that it parses.

## Testing

`pnpm run check` — the full regression suite plus the examples, real-MCP
constraint stress, canonical logo, and tree study. No framework. Assert exact
cell sets and exact pixel counts. The whole point of integer geometry is that
tests can be exact; an approximate assertion here is a smell.

`examples/agent-session.js` is a verification tool, not a demo: it authors a
real diagram over the MCP server the way an agent would, and exits non-zero if
the documented path produces any finding above INFO. Run it after changing the
pen grammar or the tool surface — the friction it reports is friction a real
agent will hit. Every test in `test/connectors.test.js` came from a mistake it
surfaced.

`examples/constraint-stress.js` is the crowded counterpart: it must reproduce
the midpoint-seat overlap in rehearsal, prove rehearsal isolation, rework five
same-face routes onto indexed seats, exhaust a bounded free-space query, commit,
validate, and render over the real MCP server.

`test/mcp.test.js` spawns the real server as a child process and talks JSON-RPC
over a pipe. Keep it that way: the core tests never import the server modules,
so before it existed a syntax error in the tool definitions passed a fully green
suite and only surfaced when an agent connected.

When a test and the engine disagree, check the arithmetic before changing the
engine. During the initial build, three of four failures were wrong test
expectations, not bugs.
