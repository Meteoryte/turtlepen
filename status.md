# TurtlePen — status

**As of 2026-08-10.** Prototype, working end to end, 230/230 tests green,
zero runtime dependencies. `pnpm run check` runs everything below.

## What is proven

Verified by running it, not by inspection:

- **230/230 tests pass** (`node --test "test/**/*.test.js"`), including tests
  that drive the real MCP server over a pipe as a child process.
- **A diagram can be judged on composition, not just correctness.** `C001`
  (S3/INFO) reports a document whose densest page inks less than 1.2% of its
  canvas — the case that previously scored green because "no defects" is
  trivially achieved by drawing almost nothing. Judged per document rather than
  per page, because an annotation overlay is legitimately sparse. Calibrated
  against all seven shipped diagrams, which is asserted by a regression test:
  if the fidelity bar ever trips the rule, the threshold is wrong.
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
- **The MCP server responds over stdio**: `initialize`, `tools/list` (32 tools),
  `tools/call`, ordered mutations, and tool errors returned as readable results
  rather than dead calls.
- **The lattice draws more than rectangles.** `ray` (Bresenham, any angle),
  `circle`/`disc` (midpoint), `arc`, `polygon`/`triangle`, and `dot`/`dash`
  marks in eight directions. Integer algorithms throughout, so the same command
  always covers the same quadrants — a stepped diagonal is not an approximation
  of a line; on a lattice it is the line.
- **Position can be a relationship, not a coordinate.** `circle 15 at shell.N
  offset 0 -4` anchors a shape to an element, including to a drawn path, whose
  footprint is computed from the quadrants it covers. The anchor resolves when
  the program runs; it prevents hand-calculation drift but is not a stored live
  constraint after the element has been created.
- **A reference can be traced over.** `place_reference` dithers an image onto a
  page below the base at low opacity and flags it; `L020` reports it until it is
  removed, so the scaffolding cannot ship.
- **A photo is drawn INTO the lattice**: `mode: 'dither'` decodes PNG on
  `node:zlib` alone, quantises to quadrants through a 4×4 Bayer matrix, and
  emits merged horizontal runs. A 400×300 solid area collapses from 4800
  quadrants to 60 rects. The same image renders byte-identically every run,
  which is why an ordered matrix is the default rather than error diffusion.
- **Drawn artwork has density, not just presence.** `tone` (0.0625–1, or
  `quarter`/`half`/`three-quarter`/`solid`), `feather`, and `texture` on a pen
  path filter its pieces through that same ordered matrix. Because a piece IS
  one quadrant, a half-tone shape claims exactly its half — `elementClaimed`,
  the SVG emitter and the ASCII view all became correct without the collision
  engine being touched, which is the strongest evidence the design matched the
  engine's grain. `tone: 1` is the default and a proven no-op: the logo and
  tree artifacts regenerate byte-identically. `tone` and `opacity` stay
  separate on purpose — density changes what is inked and therefore what is
  claimed, opacity changes neither, so `L019` can still police a fade used to
  make an overlap disappear. Below 0.0625 the matrix inks nothing at all, so
  `normalizeTone` rejects it rather than allowing an invisible element that
  still occupies space; prevention was cheaper than a new finding, which would
  have needed a new fix kind and a repair route.
  Design: `docs/superpowers/specs/2026-08-12-turtlepen-tone-design.md`.
- **An area can be wireframed to scale, and equipment placed in it.** `wireframe`
  takes a room or roof in INCHES with a declared scale, draws the walls, places
  each unit at its real footprint, and surrounds it with its service clearance;
  `export_prompt` emits the composition for an image model as normalised boxes
  plus feet-and-inches. Two things make it more than a drawing helper. Clearance
  is modelled as four BANDS around a unit rather than a filled rectangle, so it
  cannot collide with the unit it belongs to and an encroachment reports as an
  ordinary `L001` — a unit 24" from a wall that needs 36" fails `validate` with
  no new rule required. And the area is drawn as WALLS rather than a filled
  rect, for the same reason one level up: a filled area overlaps everything
  standing in it. Rounding drift is reported per dimension in inches, never
  swallowed. The module supplies **no clearance values of its own** — those come
  from the listing and the governing code, and plausible invented numbers would
  be worse than none. Runs close the gap that a first real job exposed:
  a mini-split drawing's most important element is the line set, and it is a
  PATH, not a box. `runs` routes one through waypoints and reports its length
  measured along the route — a sketch reading "~25 FT LINE SET" asserts a number
  nobody measured, and routing it produces the same number as a fact that
  disagrees loudly when the route changes. `allowanceIn` carries the leg that is
  not visible in the view, so "20'-4" = 10'-4" routed + 10'-0" allowance" states
  which part was measured and which was assumed. Kinds set the stroke pattern —
  control dashed, drain dotted — so three runs tell apart with no legend, which
  is the first real use of the `pattern` work. Elevations and `atAffIn` came from
  the same job: a wall's second axis is height, and asking an installer to
  convert "7'-6 AFF" into inches from a ceiling is how a drawing acquires an
  error nobody can see.
- **A room can be projected in three dimensions.** `perspective_scene` places a
  room and its contents through a real camera — eye, target, field of view —
  with everything authored in room inches: X rightward, Y up from the finished
  floor, Z away from the camera, so "condenser 9ft along the wall, 7'-6\" AFF,
  6\" proud" needs no conversion. This exists because a flat elevation is a
  plane, and a plane cannot say that a stair recedes or that a ceiling sits
  twenty feet behind the wall being looked at; matching a photograph means
  projecting real coordinates rather than arranging rectangles that resemble
  one. Verified by the only test that matters for perspective: a post at the
  near wall projects 57 quadrants tall and the same post twenty feet back
  projects 29. Boxes draw FAR TO NEAR because the lattice has no z-buffer, so
  draw order is the only thing that makes an occlusion read. Edges behind the
  camera are dropped rather than clipped — clipping invents a vertex the author
  never placed, while a hole is an honest signal that the camera is inside the
  geometry. Run lengths are measured in the ROOM, never off the projection: a
  run drawn shorter because it recedes is not a shorter run.
- **A line can be dashed.** `pattern: "dashed" | "dotted"` on a pen path, which
  the lattice previously could not express at all — a projected trendline or an
  inferred boundary had to be faked mark by mark, so the intent lived in the
  author's head rather than in the document. It shares the piece-filtering
  mechanism with `tone` and nothing else: **tone removes quadrants by position
  on the LATTICE, a pattern removes them by position ALONG THE PATH.** Keying a
  dash to the lattice would restart its rhythm at every corner and produce a
  line that reads as damaged rather than dashed; keying it to distance travelled
  means the cadence survives a turn with no geometry recomputed.
- **Additional corner styles were considered and declined.** The four existing
  styles already span the design space at the stated one-quadrant cut — sharp,
  curved, concave, angled — so a fifth is a near-duplicate. The useful version
  is a variable cut DEPTH, but that moves the boundary between `elementClaimed`
  and `elementVisual`, which is load-bearing. It needs its own spec rather than
  being added to round out a list.
- **The viewer serves**: HTTP 200 on `/`; `/api/state` returns the document,
  ranked findings, SVG with per-page groups and fingerprinted finding marks, and
  the ASCII view.
- **SVG geometry is integer pixels throughout**, and every text run carries
  `textLength` matching the measured width exactly.
- **The supplied tree is reproducible through TurtlePen itself.** `pnpm run
  tree` rehearses and commits 65 branch segments plus 50 leaves through the MCP
  tool handlers, validates the result, and regenerates a deterministic 540×960
  document and SVG with no open finding above INFO.
- **The supplied turtle-at-easel artwork is now the actual logo.** `pnpm run
  logo` uses TurtlePen's own tool handlers for 64 rehearsed/committed operations
  and regenerates byte-identical source, full-logo, and mark SVG artifacts. The
  source bitmap is not embedded; solid colour is exact claimed-cell paint, and
  all intentional construction overlaps are fingerprint-adjudicated.

## Closed since the first build

- **Every fix the engine suggests now has a tool that applies it** — `resize`,
  `restyle`, `move`, `rename`, `update_page`, `set_canvas`, `extend_path`,
  `replace_path`, `remove`, `remove_page`. A test asserts the mapping stays closed, so a new fix kind
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

## Closed in the full audit

- **Single operations are transactional as well as plans.** A failed multi-mark
  pen program, reference placement, or path replacement now leaves the live
  document byte-identical instead of leaking partial elements, orphan pages, or
  deleting the path it was meant to replace.
- **Path movement preserves resumability.** The stored pen end moves with its
  pieces, so a later `extend_path` continues from the visible endpoint.
- **Reference tracing has parity and correct collision semantics.** Local image
  paths resolve inside `plan`, drawing over a reference no longer raises a false
  exclusive-page collision, and `L020` routes to the direct `remove_page` tool.
- **Forced-save provenance survives load/save round trips.** The warning can no
  longer disappear merely because a document was reopened.
- **Open illustration paths are first-class artwork.** They retain exact integer
  claims while supporting safe hex colour, 1–5px width, cap style, smooth line
  presentation, or solid claimed-cell paint without connector-only
  dangling/retrace warnings.
- **Full-canvas rendering is explicit.** `render { bounds: "canvas" }` preserves
  the declared portrait canvas instead of cropping to content.
- **The live viewer survives its first successful poll.** Missing helpers were
  restored, finding rows are keyboard buttons, status updates are announced,
  reduced motion is honoured, error text is escaped, static paths are confined,
  and the favicon request is quiet. Unchanged polls now compare the file
  timestamp before loading the document and return a tiny acknowledgement,
  avoiding repeated validation, rendering, and transfer of large artwork.

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

A fourth session — eight dense artwork diagrams authored non-interactively by
another model, then audited — found nothing wrong with the engine and a great
deal wrong with how a script can use it. It is on record because the failure is
the one this project exists to make impossible, wearing a different coat:

- **Six of the eight documents were empty, and the script reported success.**
  `plan` is all-or-nothing, so one bad operation in a batch of 204 discarded the
  other 203; the unconditional `save` that followed then wrote a valid, empty
  document. The tool layer had returned each failure as readable text — the
  right shape for an agent that reads results, and a loaded gun for a script
  that ignores them. `build_gemini_3.1_diagrams.js` now throws on a failed
  operation and refuses to save a document carrying an S0 or S1 finding.
  Transactional writes protect the document; they do not protect a caller from
  believing it succeeded.
- **The authoring log blamed the lattice for its own mistakes.** It reported
  that TurtlePen "restricts angled lines to eight compass directions" — written
  after `ne 8 line` failed to parse, while `ray` was available and draws at any
  angle. A bare `unrecognised token` left the author with that conclusion and
  they faked diagonals with stacked discs for the rest of the run. A compass
  word used as a movement verb now names `ray` and `dash` in the error.
- **A hand-rolled column converter produced `^59`.** `String.fromCharCode(65+n)`
  runs off the end of the alphabet at index 26; `indexToCol` was already
  exported from `core/address.js` and is correct to `AA` and beyond.
- **An overlay page is a paint layer.** Every L004 in the corpus came from
  detail drawn INSIDE a filled box on the same page — blades in a rack, a peak
  on a picket, an arm on a sofa. Moved onto an overlay, the same ink reports
  L010: information that a planned layering worked, rather than an error that
  two things collided. This is the single most useful thing the session
  learned, and it is not obvious from the rule table.
- **A clean log is not a finished drawing.** Every diagram validated clean while
  the rug sat 60 cells from the sofa, three figures floated above the floor,
  connectors stopped in open space, and an apple's stem hovered four cells clear
  of the fruit. `C001` catches an empty canvas; nothing catches an incoherent
  one. Those were found by rendering the SVGs and looking at them, which is now
  part of the loop rather than an optional last step.

The eight rebuilt diagrams are dense (2.2%–26.4% ink on their densest page,
against a 1.2% floor), deterministic — the candlestick walk was seeded, having
previously used `Math.random()` and so producing an unrepeatable document — and
carry zero critical or error findings.

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

A fifth session — drawing a pixel typeface and a brand mark — found the engine
sound and the *help text* at fault, in the same family as the `ray` incident:

- **An author read `turtlepen_help` first, as instructed, and still never
  learned that images exist.** The help documented the lattice, addressing, pen
  grammar, shapes, anchors, artwork presentation, workflow and the fix table —
  and said nothing about `place_image`, `place_reference`, or `mode: "dither"`.
  The author hand-generated every glyph as an ASCII bitmap converted to pen
  programs, pasting ~16KB of JSON per commit, then spent five failed attempts
  deriving a brain silhouette from unions of discs and sine-wave "folds" before
  reading `status.md` and discovering that a 4×4 Bayer dither of a source image
  had been available the whole time. `HELP` now carries a **DRAWING FROM A
  SOURCE** section, placed next to artwork presentation where the need arises,
  and it says plainly that a formula will not produce a shape that has to look
  like something real.
- **The workflow line stopped at `validate`.** The "clean log is not a finished
  drawing" lesson was recorded here in `status.md` but never reached the surface
  an agent actually reads. `WORKFLOW` now ends `-> render -> LOOK AT IT`, and
  names `ascii` as the cheap way to read the quadrants.
- **A false defect was filed against `showGrid`, and is retracted here.** The
  session reported it "appears to be inert" because passing `showGrid: true`
  produced a byte-identical file to a plain render. It is not inert: the default
  is already `true`, so passing it changes nothing, and `true` vs `false` differ
  by 1164 bytes with the grid pattern correctly present or absent. The grid was
  in both renders the whole time — it is a deliberately faint hairline, so
  "I cannot see a difference" was read as "the flag does nothing".
  The lesson is the cheaper one: **test the flag against its opposite, not
  against the default.** A no-op result comparing X to a default of X carries no
  information either way.

The through-line across the `ray` incident and this one: **the engine's
capabilities are discoverable only from the surface the agent reads first.**
Anything documented solely in `status.md`, `README.md`, or a tool's own
description is, in practice, invisible — an agent calls `turtlepen_help`, gets a
complete-looking reference, and reasonably stops looking. When a capability is
added, it is not shipped until `HELP` names it at the moment of need.

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
- **Anchors are execution-time placement helpers, not persistent constraints.**
  Moving a target later does not move already-created dependents; rerun the
  declarative program to recompute them.
- **`free_space` searches one page at a time**, so it can propose a spot that is
  free on the target page but occupied on an exclusive page below it.
- **Text elements are not collision-checked against each other for legibility**,
  only for quadrant overlap.

## Next

Ranked by what the authoring session actually suggested, not by guesswork:

1. **A dense constraint-stress session.** The flow, topology, tree, and actual
   logo now cover substantially different authoring modes. The next useful edge
   is a diagram where free space runs out and many connectors compete for the
   same face, followed by a rework pass over that crowded document.
2. **Multiple connectors on one face.** Every connector leaving a box currently
   seats at the same midpoint, so two would overlap immediately. Seats probably
   need an index (`gateway.S#2`) or an offset.
3. **Cross-page `free_space`**, so a suggested position accounts for the whole
   stack rather than one page.
4. **Grouping**, if a rework session shows that moving related boxes one at a
   time is the main friction.
5. **Region filtering on `describe`** for large diagrams.
