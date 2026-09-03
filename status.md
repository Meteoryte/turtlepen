# TurtlePen — status

**As of 2026-09-03.** Prototype, working end to end, 691/691 tests green,
zero runtime dependencies. `pnpm run check` runs everything below.

## What is proven

Verified by running it, not by inspection:

- **691/691 tests pass** (`node --test "test/**/*.test.js"`), including tests
  that drive the real MCP server over a pipe and the stateful Streamable HTTP
  server over TCP.
- **Every external surface has a drift-proof contract.** All 76 MCP tools
  complete representative work over the real stdio child process; Streamable
  HTTP exposes that exact live registry and preserves isolated active documents
  across calls; every JSON-RPC
  method and notification path is asserted; all public viewer routes are tested
  with GET, HEAD, method refusal, and security headers; and every browser-authorized
  tool completes over WebSocket and persists. Frame tests cover ping/pong, clean
  close, masking, UTF-8, fragmentation, binary and reserved frames, control sizes,
  and the 64 KiB limit. The executable map is
  `docs/endpoint-use-case-coverage.md`.
- **ChatGPT and other schema-aware clients receive structured results.** Every
  tool publishes a strict, versioned object `outputSchema`; successful calls
  return matching `structuredContent` over stdio, HTTP, and Cloudflare while
  retaining their original text response for compatibility. JSON output is
  parsed, plain-language receipts stay exact, failed calls remain explicit
  `isError` results, and hosted SVG source is not duplicated into the structured
  envelope.
- **Runtime and persistence truth are explicit.** Schema-1 and schema-2
  documents migrate to schema 3; perceptual review survives save/open; direct and nested-plan calls
  are validated against the same schemas; `runtime_info` reports version,
  schema, tool count, capability fingerprint, session start, and document hash.
- **Local writes are conflict-aware and recoverable.** Document checkpoints,
  saves, SVG/PNG/PDF exports, and history sidecars use same-directory atomic
  replacement. Backups preserve the prior destination and optimistic document
  hashes refuse stale in-memory or concurrent writers with retry-safe evidence.
- **One semantic model produces multiple durable views.** Static, tag-filtered,
  and ordered dynamic views project shared elements; document-owned tokens,
  tag/perspective styles, generated keys, linked documentation/ADR/runbook
  resources, and fingerprinted model acceptances survive migration and reopen.
- **Diagram-type semantics are usable through every endpoint, not only direct
  imports.** The 76-tool registry exposes semantic node roles plus durable,
  plan-aware scale define/update/remove and exact projection inspection.
  Rectangular length bindings survive save/open and are checked by `V001`–`V004`;
  unsupported position, area, radial, and ribbon-width encodings remain
  explicitly unmodelled instead of receiving a false clean verdict.
- **Native, dependency-free output is available outside MCP.** The `turtlepen`
  CLI validates and inspects, renders deterministic SVG/PNG/PDF, generates
  architecture documentation bundles and artifact contracts, and executes or
  scores same-model benchmark adapter receipts while keeping structural,
  semantic, perceptual, and workflow dimensions separate. `render --json`
  returns the exact SVG hash a reviewer saw, and `review` records a guarded,
  hash-bound perceptual verdict without opening an MCP host.
- **Artifact scope has one owner and release evidence is complete.** The
  authored catalog classifies 71 tracked documents as release, example,
  fixture, or study; the generated manifest reports all 8 release artifacts
  ready and keeps non-release evidence from blocking that claim. The governance
  gate checks catalog coverage, filenames, hashes, help parity, runtime version,
  tool-registry identity, and the source-of-truth map.
- **Native raster output preserves the semantic renderer's geometry.** PNG/PDF
  use symbol silhouettes, measured text size/alignment/weight, gradients,
  path styling, view notation keys, and aspect-preserving images; regression
  tests prevent a decision diamond or measured label from flattening into a
  generic rectangle or fixed-size glyph run.
- **The viewer is an approval workbench.** Named-view switching, semantic model
  review, bounded history, non-mutating JSON plan diffs, explicit approve/reject,
  revision hashes, lazy canvas payloads, and continuous pointer-based 1px
  erasing share the same operations and persistence guards as MCP.
- **Architecture meaning is first-class.** `connect` authors direct,
  orthogonal, or node-attached curved relationships between named ports;
  `annotate` persists descriptions, technology, tags, properties, and
  perspectives; `inspect_model` reports semantic incompleteness independently
  of collision geometry.
- **The 1px eraser is reversible presentation state.** `micro_mask` applies to
  artwork paths and images, persists through plan/history/save/viewer flows,
  moves with its target, changes SVG/render hash, and leaves structural
  validation byte-identical.
- **Dense native artwork remains honest and practical.** `applyPen` preserves
  all-or-nothing mutation with an append checkpoint instead of cloning the
  growing document, while L006 rejects geometrically separated path pairs by
  cached bounds before building quadrant sets. The v3 Brainn mascot corpus
  keeps all 2,982 scholar strokes as independent paths, builds in about 0.1s,
  and validates CLEAN in about 0.07s; its five-pose 14,034-stroke sheet builds
  and validates in under two seconds on the verification machine. Native PNG
  output now paints fully opaque, unmasked elements directly instead of
  allocating and compositing a full-canvas layer per element; the 17-million-
  pixel sheet publishes in about 3.5s instead of timing out after three minutes.
  Mascot builders validate before export and produce no-grid PNG previews.
- **TurtlePen has produced a field work product, not only test fixtures.**
  `pnpm run field-guide` authors a complete condenser replacement workflow over
  the real MCP stdio transport, rehearses 27 operations, commits atomically,
  refuses any S0-S2 finding, and writes editable JSON plus a full-canvas SVG.
  The first build caught three clipped instruction cards with `L003`; the final
  build applies the reported numeric height fixes and validates with zero open
  findings. P01-P20 connect the sheet to a deterministic, technician-reviewed
  LLM photo-shot list in `docs/condenser-replacement-photo-shot-list.md`.
- **Real image handling separates evidence, tonal reproduction, and perceptual
  simplification.** `pnpm run image-session` measures a 1536 x 1024 condenser
  photo and a separate generated line-art derivative, proves the `L020`
  temporary-reference gate, embeds the photo, then renders the derivative as
  both source-like dither and a coverage-smoothed non-fidelity simplify before
  save/reopen/render over real MCP stdio. Every placement stores exact viewport,
  render, semantic sample, fit, and up/downscale reports. Dither downscales by
  area and upscales by nearest sample. Simplify selects a deterministic
  near-binary threshold or colour-aware contour strategy, resolves an explicit
  detail budget, and may process at 1x, 2x, or 4x linear resolution before
  box-averaging to weighted coverage on the unchanged final lattice. Auto
  prefers 4x; explicit factors never silently fall back. It refuses fewer than
  24 final quadrants on the
  short side, caps final analysis at 250,000 and working analysis at 1,000,000
  quadrants with linear contour growth, and records what it discarded. `L022`
  blocks high-frequency output; `L023` blocks
  continuous-tone heuristic results because geometry cannot know the subject.
  The rejected raw-photo dither measured 69.24% transitions and was guessed as a
  teapot. The published line-art dither measures 17.40%; coverage-resolved
  4x-to-1x simplify measures 12.72%, uses all 17 possible 4x coverage levels,
  and reads as a softer condenser pictogram. Rasterized modes refuse
  stale-grid resizing. Image bytes are verified, allocations are bounded, and
  deterministic runs do not duplicate the multi-megabyte source in history.
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
- **A dense same-face constraint session is rehearsed and repaired over MCP**
  (`node examples/constraint-stress.js`, exit 0). Five paths deliberately share
  the hub midpoint in the first rehearsal, which produces `L006`; the live
  document remains empty. The rework assigns `hub.S#1` through `hub.S#5`,
  commits with zero S0-S2 findings, confirms a fully occupied bounded
  `free_space` query returns `fits: false`, and renders a deterministic artifact.
  Indexed seats alternate left/up and right/down by whole cells, preserve the
  seat-to-port invariant on every face, expose capacity through `describe`, and
  reject overflow instead of silently clamping it. Browser inspection at
  1440x900 and 390x844 confirmed five distinct rendered starts and arrowheads,
  working page/ASCII controls, contained horizontal scrolling, and no console
  errors or warnings.
- **`free_space` no longer lies across page boundaries.** Its MCP default is
  now `scope: "stack"`, merging every non-reference page and returning the
  effective target and `searched_pages`; `scope: "page"` is the explicit
  compatibility override for intended overlap. Hidden pages remain constraints
  because they are still collision-checked, while tracing references are
  excluded because drawing over them is the workflow. Default search bounds span
  all constraining pages, and incomplete width-only/height-only fit queries fail
  by name instead of silently switching modes. The behavior is proven through
  the real stdio server as well as exact core occupancy tests.
- **`describe` can be bounded without becoming approximate.** An optional cell
  `region`, combinable with `page`, filters boxes/text/images by their claimed
  rectangles and paths by every actual quadrant piece. A real-MCP regression
  proves that an empty area inside an L-shaped path's bounding box is not
  returned. Responses keep the compatible per-page array, add the normalized
  effective filter, accept reversed range corners, and reject an unknown page by
  name instead of returning a misleading empty array.
- **Committed edits have a durable recovery path.** `history` exposes status,
  undo, redo, and clear with a configurable 1–1000 entry bound (100 by default).
  A versioned sidecar is bound to the exact serialized document hash. Undo and
  redo survive open and separate MCP processes; an outside edit invalidates the
  stale sidecar rather than applying it to the wrong state. Failed and no-op
  calls consume no entry, divergent edits clear redo, every restoration is
  checkpointed, and partial composite failure rolls back memory, document, and
  sidecar together.
- **Lattice-native editing is a first-class mutation vocabulary.** `boolean`
  performs exact union/difference/intersection/XOR over visible or claimed
  quadrants; `slice` returns deterministic addressable regions; `offset_path`
  applies square-grid morphology; and `stroke_to_path` materializes the existing
  path footprint without inventing fractional coordinates. `path_edit`,
  `normalize_path`, `reorder`, `duplicate`, and `array` provide explicit repair
  operations, while `inspect` returns exact areas, perimeters, bounds, centers,
  intersections, and gaps. Every mutation shares the `OPERATIONS`/`plan` path,
  participates in history, and has real-stdio plus geometry, invalid-input, and
  persistence coverage.
- **Compatible SVG is now editable rather than opaque.** `inspect_svg` compiles
  a bounded source subset without mutating the document, showing deterministic
  IDs, provenance, exact quadrant bounds, and any opt-in nearest-lattice shifts.
  `import_svg` turns those solid lattice rectangles and 5px linear strokes into
  ordinary artwork paths; they then use the same boolean, slice, offset,
  collision, history, plan, save/open, and renderer paths as hand-authored
  geometry. Curves, transforms, styles, resources, filters, masks, text, and
  active SVG are refused by name before mutation; raw source markup never enters
  a document or the live viewer DOM.
- **Subsystem grouping is durable and exact.** Flat groups own explicit element
  ids across pages, serialize deterministically, move every member by one exact
  delta, participate in plan and history, follow rename/removal, reject ambiguous
  ownership atomically, and are exposed by `describe` and the `group` MCP tool.
- **Follow relationships are persistent constraints.** `constraint` stores one
  parent per dependent with named or indexed anchors and exact quadrant offsets.
  Chains cascade through move, resize, path extension/replacement, and group
  movement; manual dependent movement authors a new offset. Cycles, duplicate
  parents, dangling or ambiguous ids, invalid offsets, and out-of-face anchors
  are refused before mutation or load. Inspection reports synchronized versus
  actual offsets, and `sync` restores a manually edited relationship.
- **Composition inputs survive persistence.** `wireframe` source data now
  survives save/open, so `export_prompt` continues working after reopen;
  `perspective_scene` retains its room, camera, boxes, and measured runs as
  durable provenance. `export_prompt` verifies generated boxes and routes still
  match the live drawing; a later move is refused as stale, while undo restores
  source and geometry together. Core round-trip and real stdio regressions cover
  both.
- **Overlay text occlusion is validated, not left to eyesight alone.** `L021`
  reports an error when opaque content on an overlay crosses the exact text runs
  emitted for a lower box or free-text element. The real agent session keeps its
  callout above the node and uses a separate edge marker, preserving deliberate
  `L010` layering without hiding the node label.
- **Canonical example generation is reproducible.** The direct example pins its
  creation time, the MCP session accepts an injected creation time, and
  `.gitattributes` fixes text output to LF so a Windows verification run does not
  create timestamp or line-ending churn.
- **The full cycle runs** (`node examples/build-example.js`, exit 0): a box
  sized by eye is caught during a *rehearsal* before anything is written,
  repaired in the plan using the engine's own reported numbers, then committed
  clean. Identical Z-page geometry reports as an error on an exclusive page and
  as information on an overlay.
- **plan/commit is transactional**: a batch that fails part-way applies nothing,
  verified by byte-comparing the serialised document before and after.
- **The MCP server responds over stdio**: `initialize`, `tools/list` (76 tools),
  `tools/call`, ordered mutations, and tool errors returned as readable results
  rather than dead calls. The Streamable HTTP transport calls that same protocol
  runtime, returns request-scoped SSE frames, maintains one active document per
  opaque session, serializes its calls, isolates its filesystem, and purges it
  on DELETE or expiry.
- **The public Cloudflare/Sites adapter is canonical source.**
  `src/mcp/cloudflare.js` exposes the same 76-tool registry with D1 session
  indexing, optimistic version commits, R2 document/history/artifact storage,
  explicit quotas, SSE responses, and an injectable binding factory covered by
  an end-to-end in-memory D1/R2 test. Brainn.dev re-exports this adapter rather
  than maintaining a second implementation.
- **Acceptance cannot manufacture a bare pass.** Validation reports `PASS`,
  `PASS_WITH_EXCEPTIONS`, or `FAIL`. `release_check` requires a current
  perceptual review and render-bound evidence for each accepted S0/S1 finding;
  stale acceptances and blocking visual findings stop release.
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
- **Prepared line art can be drawn INTO the lattice**: `mode: 'dither'` decodes PNG on
  `node:zlib` alone, quantises to quadrants through a 4×4 Bayer matrix, and
  emits merged horizontal runs. A 400×300 solid area collapses from 4800
  quadrants to 60 rects. The same image renders byte-identically every run,
  which is why an ordered matrix is the default rather than error diffusion.
  Raw photographs stay embedded; deterministic conversion is not the same as
  recognizable conversion, so `L022` and a normal-size visual check still apply.
- **Prepared line art can be simplified instead of copied.** `mode: 'simplify'`
  preserves contrast-defined structure without Bayer checker tone and is
  explicitly allowed to thicken, omit, and merge source features. A bounded
  `supersample: 4` pass builds four times the width and height, performs the
  cleanup there, and deterministically box-averages each 4x4 working block into
  one final quadrant with 17 possible coverage levels. Coverage is durable
  through save/reopen and renders as per-run opacity, so partial edge evidence is
  no longer collapsed into a bold binary block. It can retain thin connected
  structure without inventing source information or changing the placed
  footprint. Continuous
  photographs take a colour-aware contour path but always raise `L023` until a
  blind identity review is recorded or a purpose-built derivative replaces the
  result. This keeps “cleaner” from being mistaken for “semantically correct.”
- **Five seeded-random supersampling cases pass over real MCP.** The permanent
  `pnpm run random-images` exercise covers RGB and transparent RGBA,
  portrait/landscape, contain/cover, and low/medium/high detail. Every case keeps
  its final `48x32`-quadrant footprint, takes the near-binary path, passes the
  readability gate, survives save/reopen/render, and records source/run hashes.
  All 5/5 preserve partial coverage, reduce weighted edge transitions, avoid
  effective-ink inflation, and produce different 4x runs from direct 1x
  processing; the visual comparison lives in
  `diagrams/supersample-random-five.svg`.
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
- **The local live editor serves and mutates end to end.** HTTP 200 on `/` and a
  compatibility `/api/state` expose document identity, pages, lattice metadata,
  ranked findings, selectable SVG, and ASCII. The browser uses WebSocket rather
  than polling, and supports fit/zoom, keyboard/pointer selection, move, resize,
  restyle, path extension/replacement, flat groups, follow relationships,
  auditable acceptance/withdrawal, deletion, and durable undo/redo. Unknown or
  expired fingerprints are refused rather than stored as meaningless stale
  records; accepted and stale states remain visible. Two-client tests prove broadcast
  revisions and disk state; file-watch tests prove outside reload. Foreign
  origins, unmasked frames, reserved opcodes, and invalid frame flags are
  rejected; messages are bounded, tools and static assets are allowlisted,
  mutation order is serialized, and security headers are asserted.
  Headed browser passes at 1440x900 and 390x844 found no console errors,
  horizontal overflow, blank canvas, control clipping, or incoherent overlap;
  focused drafts survive concurrent updates and require an explicit re-apply.
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
- **Batch/direct move parity is exact.** `plan` accepts the documented
  `cellsX`/`cellsY` form instead of silently treating it as a zero delta, and a
  geometry change invalidates the current-finding snapshot used to accelerate
  consecutive acceptance operations.
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
- **The live viewer no longer polls.** Missing helpers were restored, selectable
  SVG elements and finding rows are keyboard reachable, status updates are
  announced, reduced motion is honoured, error text is escaped, only named
  public assets are served, and the favicon request is quiet. WebSocket broadcasts now carry
  committed revisions; the cheap unchanged HTTP response remains only for
  compatibility and diagnostics.

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
  that ignores them. `build-gemini-3-1-diagrams.js` now throws on a failed
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
- **Proportional fonts.** The monospace model is what makes capacity countable.
- **Negative addressing.** The grid runs `A1` rightward and downward only.
- **Identity-bound hosted workspaces.** The canonical Cloudflare adapter now
  supports an anonymous public endpoint with bounded D1/R2 sessions and inline
  SVG artifacts. OAuth identity, account-owned durable diagrams, private
  artifact ACLs, and a user-facing upload bridge remain separate product work;
  the public session endpoint must not be described as providing them.

## Gap closure status

Every previously recorded local-engine implementation gap is closed: the viewer
is a tested WebSocket editor, history is durable across restarts, groups move
subsystems, and explicit follow constraints persist and cascade. The new hosted
scope has the explicit public-auth, file-transfer, durable deployment, and site
integration gaps above; those are not hidden behind the passing local suite.
