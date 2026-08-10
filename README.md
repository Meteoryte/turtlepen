# TurtlePen

![TurtlePen — turtle drawing at an easel](brand/logo.svg)

An integer-exact grid substrate for **AI-authored diagrams**, with a turtle/pen
command language, measurement before placement, and severity-ranked collision
reporting across Z-page overlays.

Status: **prototype**, 229 tests green, zero runtime dependencies.

## The problem it solves

Every mainstream diagram tool measures text at *render* time — inside the
browser or renderer, long after the author has already chosen the box size and
committed. A human catches the overflow instantly by eye. An AI has no eye, so
it produces sloppy output: text that doesn't fit its box, lines that cross
shapes, layers that collide, and nothing anywhere that says so.

TurtlePen inverts that. Measurement happens **before** placement, every
coordinate is an integer, and every defect is reported with a severity and a
numeric fix. Nothing is ever silently resized — the engine measures and reports,
and the AI decides.

## The lattice

```
1 cell  = 10 x 10 px          1 quadrant = 5 x 5 px          strokes = 5px thick
┌────┬────┐
│ q1 │ q2 │   Every legal position is a whole number of quadrants, so results
├────┼────┤   are byte-identical across runs. A collision report is a fact,
│ q3 │ q4 │   not an approximation, and tests assert exact cell sets.
└────┴────┘
```

Addressing is Excel's: columns `A…Z, AA…`, rows `1, 2, 3…`, origin `A1`
top-left, unbounded right and down. There is no negative addressing, so every
address parses unambiguously — start at an inset origin such as `T20` if a
drawing may need to grow up or left.

Three precisions are accepted anywhere a location is expected:

| Form | Meaning | Size |
|---|---|---|
| `C4` | whole cell | 10 × 10 px |
| `C4.tl` | pin point — 9 per cell (`tl t tr l c r bl b br`) | lattice point |
| `C4.q2` | quadrant — 4 per cell | 5 × 5 px |

## The pen

The AI walks a cursor around the lattice laying down strokes and junction
pieces, rather than declaring endpoints and hoping a router does something sane.
Every stroke has an explicit author and an exact footprint, so a collision can
name the step that caused it.

```
pen J8.q1                              # place the cursor
down 2 align right line                # 2 cells of 5px stroke, hugging the right half
down corner align top right            # arrives from the top, leaves to the right
right 3 align top line
right corner align left bottom         # arrives from the left, leaves downward
down align left line to queue.N arrow  # engine counts the distance; run ends in an arrowhead
```

- **Distances count whole 10px cells.** Strokes are 5px, so `align` picks which
  half of the cell they hug: `left|right` for vertical, `top|bottom` for
  horizontal. There is deliberately no `center` — a 5px stroke centred in a 10px
  cell would start at 2.5px, off the lattice.
- **Locations may appear on any command** (`at C7.q2`, or bare `(C7.q2)`), so
  relative walking and absolute re-anchoring mix freely. An error stays
  contained to the run between two absolute locations.
- **`to <address>` or `to <id>.<port>`** draws until it reaches a target and
  reports the distance travelled, so the AI never has to count cells to a box
  whose size came from measured text.
- **A corner names the two sides it connects**, one of which must be the side
  the path arrives on. Styles: `square rounded indented chamfered`.
- **`arrow` on a `line` command turns the run's last quadrant into the
  arrowhead**, rather than adding one after it — so `line to db.W arrow` points
  at a box without overlapping it. Standing alone, `<dir> arrow` places a head
  at the cursor.
- **An omitted `align` continues on the track the cursor is already on.** A
  fixed default would fight a deliberately seated cursor.

## Shapes: anything that is not a rectangle

The lattice is orthogonal, so a diagonal, a circle and an arc are the same kind
of thing — a computed set of whole quadrants. These are the classic integer
algorithms, chosen for the reason they were invented and the reason this project
exists: they are exact.

**They are starting points, not results.** A single `circle` is one gesture; a
composition is what you build from several, related by anchors and varied
deliberately. `validate` now says so out loud — `C001` reports a document whose
densest page has too little ink to have been composed at all.

The worked example to measure against is `diagrams/art-deco-hero.svg`, drawn
entirely on these primitives and inking 11% of its canvas. A page that reaches
for one primitive and stops will typically ink under 1%.

```
ray to AF20.q1        a straight line at ANY angle (Bresenham)
circle 12             outline (midpoint); radius in QUADRANTS, not cells
disc 12               the same circle, filled
arc 12 0 90           part of it, clockwise from east
triangle M4.q1 T9.q1  three points; polygon takes more
dash 6 se             six quadrants diagonally — the morse dash
dot                   one quadrant — the morse dot
```

`dir8` is `n ne e se s sw w nw`, and `up/down/left/right` still work. A stepped
diagonal is not an approximation of a smooth line; on a lattice it **is** the
line, which is how interface art was drawn on 1-bit displays.

## Anchors: position as a relationship

Connectors got `pen from <id>.<face>` early, because a hand-computed address is
where the mistakes live. Shapes did not, so every part of the first logo was an
absolute coordinate and the proportions drifted. An anchor fixes that during
authorship: the relationship is resolved from the target's current footprint
when the program runs, instead of being recomputed by the author.

```
pen at shell.C                       put the cursor ON an element
circle 15 at shell.N                 anchor a shape to one
circle 7 at head.W offset -3 4       nudge in whole quadrants
```

`from` gives the **seat**, one step *outside* the element, where a connector
starts. `at` gives the **anchor**, on the element, where a shape belongs.
Anchors are `N NE E SE S SW W NW C`, and work on anything with a footprint —
including a drawn path, whose footprint is computed from the quadrants it covers.

Anchors are declarative inputs, not live constraints stored in the document.
Rerunning the same program after changing `shell` recomputes the relationship;
moving `shell` later does not automatically move already-created dependents.

> **Corner anchors are bounding-box corners.** On a rectangle that is what you
> want. On an ellipse or any organic shape, `SW` is the corner of the box around
> it, which is empty space — anchoring feet there puts them off the body. Use
> the edge midpoints (`N S E W C`) with an offset for anything not rectangular.

## Tracing over a reference

```
place_reference { source: "ref.png", span: "40x24" }
… draw over it …
remove_page { id: "reference" }
```

The image is dithered onto the lattice — so it is made of the same quadrants you
will draw in — put on a page below the base at 0.25 opacity, and flagged. `L020`
reports it until you remove it, because scaffolding that ships is worse than no
scaffolding.

**Closed shapes are not connectors.** A path that returns to its start is marked
`closed`, and the rules about dangling ends and retraced quadrants do not apply
to it — they are about connectors, and applying them to an outline is how a rule
cries wolf.

**Open artwork is not a connector either.** Set `role: "artwork"` on `pen` (or
inside `plan`) to draw branches, contours, and other intentionally open marks
without connector-only `L008`/`L015` findings. Artwork may also declare a hex
`color`, a `width` from 1–5px, and `cap: "butt"|"round"|"square"`. Those are
presentation properties: the collision engine still claims the exact integer
quadrants, while the SVG paints a simplified continuous line through them.
Set `paint: "cells"` to colour every claimed quadrant instead; this is how the
canonical logo builds solid forms without embedding a bitmap or weakening
collision geometry.

- **`hop` marks a deliberate crossing.** It renders as a bridge arc and exempts
  that quadrant from the stroke-overlap rule, so an intended crossing is not
  reported as a defect. It still claims its quadrant, so a hop through a box is
  still an error.

## Connectors: the two mistakes worth knowing

Both of these came out of an actual authoring session, not from theory. The
first run of `examples/agent-session.js` produced four broken connectors from
entirely reasonable-looking code.

**1. Don't compute the start address yourself.** A box's south face is already
outside it, but its north face *is* the box's own top row — so leaving northward
starts one quadrant higher. Getting this wrong puts a one-quadrant gap between
the connector and the box, which reads as a dangling end. Use the seat instead:

```
pen from gateway.S          # seated just outside, already facing down
down line to checkout.N arrow
```

`place_box` and `describe` also report the seat address for every face, so the
number is always available without deriving it.

**2. `to <id>.<port>` sets a distance, not a destination.** It measures along
the direction of travel only. A run on the wrong row or column stops *level
with* its target and never touches it. That is legitimate on an intermediate leg
— "go right until level with it, then turn" — so it is checked against the
finished path, and reported as `L016` with the gap quantified if the path never
arrives.

## Corner styles participate in collision

A rounded, chamfered, or indented box does not visually occupy its four corner
quadrants, so its **claimed** footprint is larger than its **visual** one. A
stroke through an indented corner is reported as information (`L013`), not as an
error (`L004`). Without that distinction the engine would flag collisions a
human eye would not see — which trains an AI to ignore the log.

## Z-pages

Overlapping is a mistake on one layer and the entire point on another, and
geometry alone cannot tell which. So each page declares its intent:

| Intent | Overlap with lower pages |
|---|---|
| `exclusive` | `L005` **error** — nothing below may be overlapped |
| `overlay` | `L010` **information** — expected, so annotation layers stay quiet |

Within a single page, overlap is always an error regardless of intent.

## Collision rules

| Rule | Sev | What it catches |
|---|---|---|
| `L001` | S0 critical | two elements claim the same quadrants on one page |
| `L012` | S0 critical | duplicate element id — targets become ambiguous |
| `L002` | S1 error | measured text wider than the box interior |
| `L003` | S1 error | wrapped text needs more lines than the box shows |
| `L004` | S1 error | a path runs through the inked body of a box |
| `L005` | S1 error | an exclusive page overlaps content below it |
| `L006` | S2 warn | two paths share a quadrant with no junction or hop |
| `L007` | S2 warn | two boxes touch with no separating quadrant |
| `L008` | S2 warn | a path ends without meeting a box or another path (one finding per path, not per end) |
| `L009` | S2 warn | font size below the 8px legibility floor |
| `L011` | S2 warn | an element extends past the declared canvas |
| `L014` | S2 warn | a stroke drawn on a track the cursor was not on |
| `L015` | S2 warn | a path re-draws a quadrant it already covered |
| `L016` | S2 warn | a path named a destination but stops short of touching it |
| `L020` | S2 warn | a temporary tracing-reference page is still present |
| `L010` | S3 info | expected overlap from an overlay page |
| `L013` | S3 info | a path crosses a claimed but un-inked corner cut |
| `C001` | S3 info | sparse canvas — too little ink to have been composed; compose it, or declare the page `schematic` |

## The workflow

**measure → plan → commit → adjudicate.**

`plan` is the centre of it: send the whole composition as a batch of operations
and read the collision log *before* anything is written. The document is
untouched until the same batch is re-sent with `commit: true`, and a batch that
fails part-way applies nothing at all — a half-applied composition would leave
the document in a state nobody asked for.

```
plan  { operations: [ …place boxes, run pen programs… ] }
  → rehearsed 6 operation(s) on a copy — the document is unchanged.
    [ERROR] L002 "audit" label needs 48px but the interior is 50px …
            fix: widen box to 7 cells

…adjust the plan, not the document, then…

plan  { operations: […], commit: true }
  → committed 6 operation(s).  status: CLEAN
```

Placement is never blocked for collision, so sketching roughly and repairing
afterwards works too — the AI is not fighting per-call rejections either way.

Adjudication is where intent is declared. `accept_finding` records a finding as
deliberate, keyed to a fingerprint derived from the rule, page, actors and exact
quadrants. If the geometry later changes, the fingerprint changes with it and
the acceptance lapses automatically — so "I meant that" can never quietly
suppress a genuinely new problem.

## Every fix has a tool

The collision engine only suggests repairs it can actually perform. A diagnostic
vocabulary that outgrows the action vocabulary strands the AI in a loop it
cannot exit, so these are kept a closed set — and a test asserts it.

| Fix kind | Tool |
|---|---|
| `widen`, `heighten` | `resize` |
| `shorten`, `font` | `restyle` |
| `move` | `move` |
| `rename` | `rename` |
| `intent` | `update_page` |
| `canvas` | `set_canvas` |
| `extend` | `extend_path` |
| `reroute`, `offset`, `hop` | `replace_path` |
| `remove` | `remove` or `remove_page` according to target kind |

## Running it

```bash
pnpm run check                         # 229 tests + examples, logo, and tree
node --test "test/**/*.test.js"        # 229 tests
node examples/build-example.js         # the plan -> commit cycle, end to end
node examples/agent-session.js         # an agent authoring a real diagram over MCP
pnpm run logo                          # regenerate the canonical 1200x1200 logo
pnpm run tree                          # regenerate the 540x960 branching-tree study
node src/viewer/server.js --doc diagrams/example.turtlepen.json
node src/mcp/server.js                 # MCP over stdio
```

Register the MCP server with any MCP-aware agent. Use the absolute path to your
own clone — `args` is resolved by the agent, not by a shell, so `~` and relative
paths do not expand:

```json
{ "mcpServers": { "turtlepen": {
    "command": "node",
    "args": ["/absolute/path/to/turtlepen/src/mcp/server.js"]
} } }
```

There is nothing to install first: no runtime dependencies, Node 20 or newer.
Clone it, point the config at `src/mcp/server.js`, and run `npm test` once to
confirm the clone is sound.

29 tools. Call `turtlepen_help` first — it returns the grammar, the lattice
constants, the rule table, and the fix→tool map.

| Group | Tools |
|---|---|
| orient | `turtlepen_help` `describe` `ascii` `free_space` |
| author | `new_diagram` `open_diagram` `add_page` `remove_page` `measure` `place_box` `pen` `plan` |
| check | `validate` `accept_finding` `unaccept_finding` |
| repair | `resize` `restyle` `move` `rename` `update_page` `set_canvas` `extend_path` `replace_path` `remove` |
| image | `measure_image` `place_image` `place_reference` |
| output | `render` `save` |

## Seeing the drawing

`ascii` renders the lattice as text at quadrant resolution — two characters per
cell, real Excel headers, collisions marked — which is how an AI reads its own
drawing back:

```
     B C D E F G H I J K L M N O P Q R S T U V W
   4 ··aAAAAAAAAAAAAAAAAAAAAAAAAAAa··············
     ··AAAAAAAAAAAAAAAAAAAAAAAAAAAA··············
   8 ·················│··························
  10 ·················└──────┐···················
  12 ··bBBBBBBBBBBBBBBBBBBBBBBBBBBb··········cCCc
```

Lowercase marks a claimed-but-not-inked corner cut. `✗` marks a collision.

## Architecture

```
src/core/     pure engine, no I/O — geometry, address, text, shapes,
              document, pen, occupancy, collide, ascii, svg
src/mcp/      MCP stdio server (hand-rolled JSON-RPC 2.0) + tool definitions
src/viewer/   HTTP server + live browser view of the document and its log
test/         node:test, no framework
examples/     worked end-to-end demonstration
```

Every mutating capability is a named entry in `core.OPERATIONS`, which is what
makes `plan` possible: the same operations run against a throwaway clone or the
live document, so the batch surface and the tool surface cannot drift apart.

The core is pure and shares one code path with both the MCP server and the SVG
renderer, which is what makes measurement and rendering physically unable to
disagree. Every text run is emitted with `textLength`, obliging the browser to
fit glyphs into exactly the width the engine measured.

## Seeing it as a human

`node src/viewer/server.js` serves a live view at `127.0.0.1:8791`: the SVG, the
ranked log, and the ASCII view, re-read from disk as the AI writes. Pages can be
toggled off, and clicking a finding flashes the exact quadrants it names — the
log line and the drawing are the same fact, so the link between them is a click
rather than something to reconstruct by eye. Polls compare the file timestamp
first, so an unchanged large artwork returns a tiny acknowledgement instead of
revalidating, rerendering, and retransmitting the document every 700ms.

## Deferred, deliberately

- **Auto-fit** — the engine reports the shortfall and the fix; it does not resize.
- **Auto-routing** — the pen is the primitive. If auto-routing is built, it will
  be a generator that emits pen commands, so paths stay inspectable.
- **Proportional fonts** — the monospace model makes capacity countable
  (`chars/line = floor((cells × 10 − 10) / 6)` at 10px), which is arithmetic an
  AI can do reliably.
- **Negative addressing** — the grid runs `A1` rightward and downward only.
  Start at an inset origin if a drawing may need to grow up or left.

## AI Generated Examples

The following sample diagrams and visual scenes were authored using TurtlePen MCP tools by **Gemini 3.6 Flash (High)**:

### Domain & System Architecture
- **Server Structure**: [High-Availability Microservices Architecture](diagrams/server-structure-ha-microservices.svg) ([JSON](diagrams/server-structure-ha-microservices.turtlepen.json))
- **Teaching & Education**: [Adaptive Mastery Learning & Assessment Cycle](diagrams/teaching-mastery-learning-cycle.svg) ([JSON](diagrams/teaching-mastery-learning-cycle.turtlepen.json))
- **Technical Analysis**: [Quantitative Trading Signal & Risk Engine](diagrams/technical-analysis-quant-engine.svg) ([JSON](diagrams/technical-analysis-quant-engine.turtlepen.json))
- **Workflow**: [Automated CI/CD Deployment Pipeline](diagrams/workflow-cicd-deployment-pipeline.svg) ([JSON](diagrams/workflow-cicd-deployment-pipeline.turtlepen.json))

### Illustrative Scenes
- **Apple**: [Crisp Red Apple Illustration](diagrams/scene-apple.svg) ([JSON](diagrams/scene-apple.turtlepen.json))
- **Tree**: [Lush Apple Tree Scene](diagrams/scene-tree.svg) ([JSON](diagrams/scene-tree.turtlepen.json))
- **Fence**: [Wooden Picket Fence Scene](diagrams/scene-fence.svg) ([JSON](diagrams/scene-fence.turtlepen.json))
- **Living Room**: [Cozy Living Room & Stick Figure Family](diagrams/scene-living-room-family.svg) ([JSON](diagrams/scene-living-room-family.turtlepen.json))

Authoring script: `build_all_diagrams.js`  
Model used: **Gemini 3.6 Flash (High)**

