# TurtlePen — status

**As of 2026-08-08.** Prototype, working end to end, 198/198 tests green,
zero runtime dependencies. `pnpm run check` runs everything below.

## What is proven

Verified by running it, not by inspection:

- **198/198 tests pass** (`node --test "test/**/*.test.js"`), including tests
  that drive the real MCP server over a pipe as a child process.
- **An agent authors a real diagram cleanly** (`node examples/agent-session.js`,
  exit 0): seven boxes in two columns and six connectors — including a three-leg
  route around an obstructing box — rehearsed, committed, and annotated on an
  overlay, producing zero findings above INFO. This is the "used in anger" gap
  from the first build, now closed.
- **The full cycle runs** (`node examples/build-example.js`, exit 0): a box
  sized by eye is caught during a *rehearsal* before anything is written,
  repaired in the plan using the engine's own reported numbers, then committed
  clean. Identical Z-page geometry reports as an error on an exclusive page and
  as information on an overlay.
- **plan/commit is transactional**: a batch that fails part-way applies nothing,
  verified by byte-comparing the serialised document before and after.
- **The MCP server responds over stdio**: `initialize`, `tools/list` (27 tools),
  `tools/call`, ordered mutations, and tool errors returned as readable results
  rather than dead calls.
- **The lattice draws more than rectangles.** `ray` (Bresenham, any angle),
  `circle`/`disc` (midpoint), `arc`, `polygon`/`triangle`, and `dot`/`dash`
  marks in eight directions. Integer algorithms throughout, so the same command
  always covers the same quadrants — a stepped diagonal is not an approximation
  of a line; on a lattice it is the line.
- **Position can be a relationship, not a coordinate.** `circle 15 at shell.N
  offset 0 -4` anchors a shape to an element, including to a drawn path, whose
  footprint is computed from the quadrants it covers. This is the lesson
  connectors learned with `pen from <id>.<face>`, applied to shapes — the first
  logo drifted precisely because every part was an address worked out by hand.
- **A reference can be traced over.** `place_reference` dithers an image onto a
  page below the base at low opacity and flags it; `L020` reports it until it is
  removed, so the scaffolding cannot ship.
- **A photo is drawn INTO the lattice**: `mode: 'dither'` decodes PNG on
  `node:zlib` alone, quantises to quadrants through a 4×4 Bayer matrix, and
  emits merged horizontal runs. A 400×300 solid area collapses from 4800
  quadrants to 60 rects. The same image renders byte-identically every run,
  which is why an ordered matrix is the default rather than error diffusion.
- **The viewer serves**: HTTP 200 on `/`; `/api/state` returns the document,
  ranked findings, SVG with per-page groups and fingerprinted finding marks, and
  the ASCII view.
- **SVG geometry is integer pixels throughout**, and every text run carries
  `textLength` matching the measured width exactly.

## Closed since the first build

- **Every fix the engine suggests now has a tool that applies it** — `resize`,
  `restyle`, `move`, `rename`, `update_page`, `set_canvas`, `extend_path`,
  `replace_path`. A test asserts the mapping stays closed, so a new fix kind
  without a repair route fails the suite.
- **`plan`** rehearses a whole composition on a clone and reports conflicts
  before committing; `commit: true` applies all-or-nothing.
- **Path amendment**: paths record their end state and can be extended or
  redrawn without losing their id.
- **Arrowheads**, including the `line … arrow` terminal form that ends a run in
  the head so `to db.W arrow` points at a box without overlapping it.
- **Deliberate crossings** via `hop`, exempt from the stroke-overlap rule.
- **`L008` reports once per path** rather than once per end.
- **Viewer**: page visibility toggles, and clicking a finding flashes the exact
  quadrants it names.
- **Occupied-port detection** in the viewer, with a message naming the likely
  cause instead of an unhandled `EADDRINUSE`.

## Found by using it, then fixed

The first authoring session produced four broken connectors from entirely
reasonable-looking code. None of these were visible from inspection:

- **Start addresses had to be computed by hand**, and a box's faces are not
  symmetric — south and east are already outside the rect, north and west are
  its own first row and column. `pen from <id>.<face>` now seats the cursor, and
  `place_box`/`describe` report every face's seat address.
- **The default stroke alignment was a fixed side**, so it shifted a seated
  cursor one quadrant off the port it was aiming at. It now continues on the
  track the cursor is already on.
- **`to <id>.<port>` could miss entirely** — it sets the distance along the way
  you are travelling, not the track you travel on, so a run on the wrong column
  stopped level with its target and never touched it. Now `L016`, checked on the
  finished path so intermediate legs are not false-flagged.
- **`place_box` took two incompatible span formats** — `"12x5"` as a tool,
  `{w,h}` as a plan operation — because normalisation sat in the tool layer
  rather than in core. One format now, both spellings accepted, in core.

A second authoring session (two diagrams: a branching decision flow and a
hub-and-spoke topology) surfaced one more, in the same family — an asymmetry
invisible from either the drawing or the rule table:

- **Arrival worked in two directions out of four.** A connector running right
  into a west face or down into a north face landed on the seat; the mirror-image
  runs — left into an east face, up into a south face — stopped *two* quadrants
  clear and reported `L008` + `L016`. `portPoint` was mixing conventions: `N`/`W`
  resolved to the box's own first row/column, `S`/`E` to the exclusive
  `bottom()`/`right()` one quadrant outside it. Because a line's last piece lands
  one quadrant *before* its resolved target, only the decreasing directions ever
  showed it. Every side now resolves inclusively, so `seat === port + one step
  outward` holds on all four faces and arrival shares one code path. The
  directional special-case that would have "fixed" only left and up was rejected
  deliberately — it was the same class of asymmetry that caused the bug.

A third session — drawing the project's own logo — found the engine could not
draw a curve at all, and that its rules did not know what a drawing was:

- **The lattice had no diagonals, circles or arcs.** Anything round had to be
  faked from boxes, and a `rounded` corner cuts a fixed 5px whatever the box's
  size, so a 380px-wide "rounded" shell rendered as a plain rectangle. The
  constraint was real but the conclusion was wrong: a curve on a lattice is
  arithmetic, so `src/core/raster.js` computes it. See above.
- **Every closed shape was reported as a broken connector.** Tracing an outline
  produced `L008` (dangling end) and `L015` (self-overlap) on each shape,
  because the engine only modelled connectors — 35 findings on a correct
  drawing, none of them defects. A rule that cries wolf on correct work teaches
  an author to stop reading the log, which destroys the log. Paths that return
  to their start now carry `closed: true` and are exempt from both; genuinely
  dangling connectors are still caught, so the rule was narrowed, not disabled.
- **`place_image` meant two different things.** Its source was resolved to bytes
  in the tool handler but not inside `plan`, so a file path worked as a tool
  call and failed in a batch. Exactly the split `place_box` once had with its
  two span formats — normalisation must sit on the path both entry points take.

## What is deferred, deliberately

- **Auto-fit.** The engine reports the shortfall and the fixes; it does not
  resize. Chuck's call during design.
- **Auto-routing.** The pen is the primitive. If auto-routing is added it must
  emit pen commands so the path stays inspectable.
- **Proportional fonts.** The monospace model is what makes capacity countable.
- **Negative addressing.** The grid runs `A1` rightward and downward only.

## Known gaps

- **The viewer is read-only** and polls at 700ms. No editing, no websocket.
- **No undo.** `plan` covers the "check before you commit" case, which is the
  one that matters most, but there is no history to step back through.
- **`describe` returns whole-document JSON**; on a large diagram that is a lot
  of tokens, with no pagination or filtering by region.
- **No grouping or containers** — no way to say "these five boxes are one
  subsystem" and move or validate them as a unit.
- **`free_space` searches one page at a time**, so it can propose a spot that is
  free on the target page but occupied on an exclusive page below it.
- **Text elements are not collision-checked against each other for legibility**,
  only for quadrant overlap.

## Next

Ranked by what the authoring session actually suggested, not by guesswork:

1. **A second, harder session.** One diagram is one data point. The obvious next
   shapes to try: a dense diagram where free space runs out, a wide fan-out
   where many connectors leave one box on the same face, and a rework pass where
   an existing diagram is edited rather than authored fresh. Editing is the
   least-exercised path in the whole tool.
2. **Multiple connectors on one face.** Every connector leaving a box currently
   seats at the same midpoint, so two would overlap immediately. Seats probably
   need an index (`gateway.S#2`) or an offset.
3. **Cross-page `free_space`**, so a suggested position accounts for the whole
   stack rather than one page.
4. **Grouping**, if a rework session shows that moving related boxes one at a
   time is the main friction.
5. **Region filtering on `describe`** for large diagrams.
