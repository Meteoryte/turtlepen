# TurtlePen MCP help — artistic logo rebuild

## Full TurtlePen manual

```text
TurtlePen — an integer-exact grid for AI-authored diagrams.

WHY IT EXISTS
  Diagram tools measure text at render time, long after a layout was chosen, so
  labels overflow their boxes and nothing notices. Here measurement happens
  before placement, every coordinate is an integer, and every defect is reported
  with a severity and a numeric fix. Nothing is ever silently resized.

THE CANVAS IS NOT A BUDGET
  The grid is unbounded right and down. 160x100 is a starting size, not a limit,
  and set_canvas grows it. If a shape is cramped, MAKE IT BIGGER — an author who
  fights for room inside a size they picked early has mistaken their own first
  guess for a constraint.

  Two more things that are easy to forget you have:
    - A feature can be MORE THAN ONE STROKE. If detail would damage a shape by
      being carved out of it, draw a second mark beside it instead. Additive
      beats subtractive: subtracting from a stroke that carries the meaning
      destroys the thing you are annotating.
    - Layers. add_page with intent "overlay" puts marks ON TOP without an L001,
      so annotation, texture, and construction can live apart from the artwork
      instead of competing with it for the same quadrants.

WORKFLOW
  measure -> plan -> commit -> validate -> render -> LOOK AT IT
                                        -> accept_finding for anything deliberate.

  DONE MEANS ALL FOUR. A drawing is not delivered until it has been:
    1. validated AFTER the last edit, not before it. An earlier clean log says
       nothing about the state you finished in.
    2. adjudicated to zero open findings — every one either fixed or accepted
       with a reason. "Only three minor ones left" is not done; it is a report
       of three known defects.
    3. rendered to a file. The SVG is PART OF THE DELIVERABLE, not an extra
       produced when someone asks. Nobody asked you to keep it to yourself.
    4. looked at. An author who has not seen the drawing does not know what
       they made.
  Report what the final validation actually said. Three sessions have announced
  finished work whose last real check was several edits old.

  Only a fingerprint in the current validation may be accepted. Geometry changes
  make the old acceptance visibly stale; unaccept_finding withdraws that record.
  A committed edit that proves wrong is recoverable with history action="undo".

  Rendering and looking is part of the loop, not an optional last step. A clean
  log is evidence the drawing is undefective, never that it is finished — a
  corpus once validated clean while a rug sat 60 cells from the sofa and an
  apple's stem floated clear of the fruit. Use "ascii" to read the actual
  quadrants; it is cheaper than a render and catches a malformed shape fastest.

  "plan" is the important one: send the whole composition as a batch of
  operations and read the collision log BEFORE anything is committed. The
  document is untouched until you re-send with commit:true, and a batch that
  fails part-way applies nothing at all.

  Findings are ranked S0 critical, S1 error, S2 warn, S3 info. Accepting a
  finding records intent; it lapses automatically if the geometry changes.

IMPORTING A MERMAID FLOWCHART
  import_mermaid { source: "flowchart TD ..." }  ->  operations, NOT a change

  It compiles onto operations you already have and hands them back. Feed them
  to plan, read the log, then commit — so an import faces exactly the same
  validation as anything you draw, and cannot make geometry the normal path
  could not. F001 and F002 apply to it too: a decision imported from Mermaid
  still has to branch.

  ([x]) terminator   {x} decision    [/x/] io      {{x}} prep
  [(x)] data         [[x]] subprocess              [x] process

  It lays out a top-to-bottom spine. It does NOT route, and it tells you which
  edges are not a straight drop so you can reroute them yourself. subgraph,
  classDef, style and click are refused by name rather than silently dropped —
  half a diagram reported as a success is worse than an error.

PERCEPTUAL REVIEW — the half validate cannot see
  render  ->  LOOK  ->  perceptual_review

  validate proves the drawing is UNDEFECTIVE. It cannot prove the drawing
  depicts what you were asked for. This corpus validated CLEAN while a sheep
  read as a stegosaurus, two ears rendered as flags, and half-tone spots
  dithered into plus-signs. Every coordinate was legal. Every one was wrong.

  "render" returns a renderHash. Look at the image, then record what you SAW:

    perceptual_review { renderHash, reviewer, findings: [{
      id, severity: P0..P3, category, symptom, consequence,
      elements: [...], repair }] }

  symptom is what it LOOKS like. consequence is what a reader would get wrong.
  Categories are a closed set: semantic-identity-mismatch, ambiguous-silhouette,
  misleading-structure, symbol-collision, accidental-glyph, poor-hierarchy,
  illegible-density, grouping-error, perspective-implausible,
  annotation-ambiguity.

  Nothing recorded here touches collision geometry — an opinion must never
  silently become an engine fact. The two verdicts come back SIDE BY SIDE and
  are never merged, because a clean log over the wrong picture is the case that
  matters. Editing the drawing marks an existing review STALE rather than
  leaving a stale opinion looking current, and a document with no review is
  NOT REVIEWED, never clean: absence of a review is not a pass.

THE LATTICE
  1 cell = 10x10 px.  1 quadrant = 5x5 px.  Strokes are 5px = 1 quadrant thick.
  Every legal position is a whole number of quadrants, so results are exact.

ADDRESSING (Excel)
  C4        whole cell            C4.tl     pin point (tl t tr l c r bl b br)
  C4.q2     quadrant (q1..q4)     origin A1 top-left, unbounded right and down
  Start at an inset origin such as T20 if the drawing may grow up or left.

FREE SPACE
  free_space defaults to scope="stack": all non-reference pages constrain the
  answer, including hidden pages because validation still checks them. Every
  response names searched_pages. Use scope="page" only when cross-page overlap
  is intentional. Supply cellsW and cellsH together, or neither to list regions.

REGIONAL DESCRIPTION
  describe { region: "C4:AZ40" } returns only elements whose exact claimed
  rectangles touch that range. Paths are tested piece by piece, not by a loose
  bounding box. Add page to narrow both page and region; the response repeats
  the normalized effective filter.

LATTICE-NATIVE EDITING
  boolean { action, ids, id?, removeSources?, footprint? }
    Exact union, difference, intersection, or xor over whole quadrants. visual
    (default) uses visible shape ink; claimed uses reserved layout geometry.
    The output is cell-painted artwork with source provenance, not a guessed
    floating-point Bézier result. Sources must share a page.
  slice { id, axis: "vertical"|"horizontal", at, mode?, ids? }
    Divide at an explicit lattice boundary. divide (default) returns every
    edge-connected result; partition returns one result per side. Default ids
    are source-part-1, source-part-2, … in stable order.
  offset_path { id, distance, resultId?, removeSource?, footprint? }
    Positive distance dilates and negative distance erodes by whole quadrants
    with a square (Chebyshev) neighborhood. Empty or off-grid results refuse.
  stroke_to_path { id, resultId?, removeSource? }
    Makes the path's exact claimed quadrants into editable cell-painted artwork.
    A 1–5px stroke cannot honestly become fractional quadrant geometry.
  path_edit { id, action, index?, at?, ids?, with? }
    actions: insert delete move reverse open close split join. Insert/move use
    an address; close draws an exact Bresenham bridge; join requires adjacent
    ends. Direct piece edits clear resumable pen state rather than extending
    stale geometry.
  normalize_path { id }                 remove repeated quadrants only
  reorder { id, action, relative? }     bring_to_front | send_to_back | raise |
                                         lower | before | after
  duplicate { id, to, dx?, dy? }        exact quadrant copy; no copied follow link
  array { id, columns, rows, stepX, stepY, prefix? }
    Creates at most 100 copies with stable row-major ids. The source is row 0,
    column 0. reorder changes paint order only; same-page overlap remains an
    error, so use an overlay page for deliberate stacking.
  inspect { ids, footprint? }
    Read exact areas, perimeters, integer bounds, rational centres, intersections,
    and bounding gaps without changing the document.

STRICT SVG IMPORT
  inspect_svg { source, prefix?, quantize? }
    Read what TurtlePen can import before changing the document. source is inline
    <svg> text or a path relative to the active diagram. It never embeds or
    executes source markup.
  import_svg { source, page?, prefix?, quantize? }
    Compile exact source geometry into ordinary editable artwork paths. Only
    solid, unstroked <rect> elements on 5px boundaries and 5px hex-colour
    <line>, <polyline>, <polygon>, and M/L/H/V/Z <path> strokes are accepted.
    Multi-segment strokes must declare stroke-linejoin="round". Curves, text,
    transforms, CSS/styles, images/resources, defs, clipping/masks, filters,
    and scripts refuse by name — no source construct is silently dropped or
    preserved as unsafe raw SVG.

    Coordinate policy is quantize:"reject" by default: filled boundaries must
    land on 5px multiples and stroke points on 2.5px quadrant centres. Choose
    quantize:"nearest" only after inspect_svg reports the exact shift; its
    output records every changed coordinate. Imports use deterministic
    prefix-1, prefix-2, … ids, retain source-element provenance, validate and
    serialize like hand-authored paths, and can be rehearsed in plan.

DIMENSIONED COMPOSITIONS
  wireframe authors a plan/elevation in real inches and measures routed runs;
  export_prompt turns that stored composition into a normalized image brief.
  The source survives save/open. Before export, TurtlePen verifies every
  generated box and route still matches it; stale geometry is refused by name.
  Undo the manual edit or rerun wireframe rather than exporting old facts.
  perspective_scene projects real room inches through a declared camera and
  preserves those inputs as provenance with the document.

HISTORY AND RECOVERY
  history { action: "status" }                  inspect the recovery boundary
  history { action: "undo" }                    reverse the newest mutation
  history { action: "redo" }                    reapply the newest undone edit
  history { action: "clear" }                   discard undo and redo entries

  The newest 100 successful document mutations are recoverable by default
  (TURTLEPEN_HISTORY_LIMIT accepts 1..1000). Failed and no-op calls do not consume
  history; a new edit after undo clears redo. A versioned sidecar is bound to the
  exact document hash, so undo/redo survives open and process restart. Outside
  edits invalidate stale history rather than replaying it against the wrong file.

GROUPS AND FOLLOW RELATIONSHIPS
  group { action: "create", id, members }        own a flat subsystem
  group { action: "move", id, cellsX, cellsY }  move every member exactly once
  constraint { action: "create", id,
               dependent, target }              keep current anchor relationship
  constraint { action: "sync", id }             restore the stored offset

  An element belongs to at most one group. A dependent has at most one parent;
  chains cascade and cycles are refused. Named and indexed anchors work, offsets
  are whole quadrants, and describe reports groups plus relationship sync state.

SEMANTIC MODEL AND NODE CONNECTIONS
  annotate { id, description, technology, tags, properties, perspectives }
  connect { id, from: "api.E", to: "db.W", routing: "direct" }
  connect { id, from: "api.E", to: "db.W", routing: "curved",
            via: ["K5.q1"] }
  inspect_model                                report incomplete model meaning

  connect always begins and ends at named node ports. Direct is one exact ray;
  orthogonal applies an inspectable simple route; curved rasterizes through one
  or more explicit whole-quadrant waypoints. Meaning and routing persist, and
  describe returns both. Semantic inspection is separate from collision
  validation, so missing metadata can never masquerade as broken geometry.

1PX ERASER / MICRO-MASK
  micro_mask { action: "add", id, target, points: [{x,y}], width: 1 }
  micro_mask { action: "remove", id }

  One design pixel is one integer SVG-viewBox pixel. The mask changes SVG and
  renderHash, but NEVER cuts the target's 5px quadrant footprint. V1 supports
  artwork paths and images only. ASCII states that masks are not represented.

PEN GRAMMAR
  pen from <id>.<N|S|E|W>                      START HERE for connectors: seats
                                               the cursor just outside a box's
                                               face, already facing away from it
  pen from <id>.<face>#<slot>                  fan out competing connectors;
                                               #1 is the midpoint, #2 left/up,
                                               #3 right/down, then alternate by
                                               one cell (example: gateway.S#2)
  pen <address> [<pin>]                        place the cursor by address
  face <dir>                                   turn without drawing
  <dir> [n] [align <side>] [<style>] line      draw n cells of 5px stroke
  <dir> [<style>] corner align <sideA> <sideB> place a junction and turn
  <dir> ... line to <address|id.port>          draw until it reaches a target;
                                               indexed target faces also work

FLOWCHART NODES — the symbol carries the meaning
  place_box ... shape <name>        or  box ... shape decision  in a pen program

  process     the basic step, named with a verb phrase       rectangle
  decision    branches the process on a test                 diamond
  terminator  start or end of the process                    stadium
  subprocess  enters another process and returns             double side bars
  io          input or output                                parallelogram
  prep        preparation or setup                           hexagon
  manual      a step a person performs                       trapezoid
  data        stored data                                    cylinder
  document    a printed or written artifact                  wavy foot
  bar         fork or join                                   solid bar

  lane        a swimlane: who performs these steps          titled band + frame
  group       a named container around a sub-process         titled band + frame

  CONTAINERS ARE THE EXCEPTION. lane and group reserve only their title band
  and border ring and leave their hole FREE, so members placed inside collide
  with nothing. A node straddling the frame still reports L001, because it
  really does cross the border. Flow crossing a lane border is a real L004 and
  is exactly what accept_finding is for — handing over between lanes is what a
  swimlane depicts, not a defect.

  A shape still CLAIMS its whole bounding box, so gutters, free_space and
  layout are unchanged; it only INKS the symbol. A stroke clipping a diamond's
  empty corner is therefore L013 information, not an L004 error.

  TEXT IS MEASURED AGAINST THE SYMBOL, NOT THE BOX. A diamond gives a label
  about half its bounding width and half its height; a parallelogram gives
  three quarters of its width. A label that fits the rectangle can still
  overflow the diamond, and the log says so. Measure, then choose the span.

  Below 3x3 quadrants a shape has no room to read as itself, so it stays a
  rectangle rather than degrading into a blob.

  The four rules the symbols exist to serve:
    1. order runs left-to-right and top-to-bottom unless you mean otherwise
    2. exactly ONE start; zero or many ends
    3. one arrow per path, and no bend without a reason
    4. avoid crossings; where one is unavoidable, say so with a "hop"

  Rules 2 and part of 3 are CHECKED, not merely advised:
    F001  more than one terminator with nothing leading into it
    F002  a decision with fewer than two ways out

  They wake up on their own as soon as a document uses a decision or a
  terminator, so nothing you drew before is reclassified. An edge is read from
  what you stated — "pen from <id>.<face>" records the source and "line to
  <id>.<port>" the target — never from which strokes happen to sit near which
  box. Rules about branch labels and verb phrases are deliberately NOT checked:
  deciding that a floating "NO" belongs to one edge, or that a label is not a
  verb phrase, means guessing, and a rule that guesses teaches you to ignore
  the log.

SHAPES — anything that is not a rectangle
  ray to <address>                             a straight line at ANY angle
  circle <r>                                   outline; radius in quadrants
  disc <r>                                     the same circle, filled
  arc <r> <startDeg> <endDeg>                  clockwise from east
  polygon <addr> <addr> <addr> ...             closed
  triangle <addr> <addr> <addr>                exactly three points
  dot [<dir8>]                                 one quadrant
  dash <n> <dir8>                              n quadrants, any of eight ways
  dir8 = n ne e se s sw w nw  (up/down/left/right also accepted)

ANCHORS — position as a relationship, not a coordinate
  pen at <id>.<anchor>                         put the cursor ON an element
  <shape> ... at <id>.<anchor>                 anchor a shape to one
  <shape> ... at <id>.<anchor> offset <dx> <dy>   nudge in whole quadrants
  anchors: N NE E SE S SW W NW C

  "from" gives the SEAT, one step OUTSIDE the element, where a connector starts.
  "at" gives the anchor itself, on the element, where a shape belongs. Anchoring
  avoids hand-computed placement drift when the program runs. This grammar alone
  does not store a relationship: rerun the declarative program to recompute it,
  or create an explicit constraint when the dependent must follow later edits.

  These are integer algorithms — Bresenham for lines, midpoint for circles — so
  the same command always covers the same quadrants. A stepped diagonal is not
  an approximation of a line; on a lattice it IS the line.
  <dir> arrow                                  arrowhead pointing that way
  <dir> hop                                    deliberate crossing (exempt from L006)
  box span <W>x<H> at <address> label "..." [style <s>] [id <name>]
  text "..." at <address> [span <W>x<H>] [id <name>]
       [font <px>] [fill <#hex>] [weight <100..900>] [align left|center|right]

ARTWORK PRESENTATION (arguments on the pen tool or plan operation)
  role: "artwork"                              open marks are not connectors
  color: "#rrggbb", width: 1..5, cap: "round" continuous presentation ink
  paint: "cells"                               colour every exact claimed quadrant

TONE — density, and why it is not opacity
  tone: 0.0625..1                              or "quarter" "half"
                                               "three-quarter" "solid"
  feather: <n>                                 quadrants of falloff inward
                                               from the region boundary
  texture: "eroded"                            seeded rough edge, deterministic

  tone changes WHAT IS INKED. A half-tone shape inks half its quadrants through
  the same ordered matrix that dithers images, so it CLAIMS half — collision
  stays honest and the result survives into a font as real contours.
  opacity changes how the SAME geometry is painted; the element still claims
  every quadrant it did at full strength, which is what L019 exists to catch.
  They are separate controls on purpose. Do not reach for opacity to make an
  overlap go away.

  pattern: "dashed" | "dotted"                rhythm ALONG the path

  A dash is keyed to DISTANCE TRAVELLED, not to the lattice, so it keeps its
  rhythm around a corner and reads as one broken line. Keying it to the lattice
  the way tone is keyed would restart the cycle at every turn and produce a line
  that looks damaged rather than dashed. Use it for a projected trendline, a
  leader, or any boundary the reader should understand as inferred.

  The threshold keys off absolute lattice position, so two toned shapes tile
  seamlessly where they meet and the same command always inks the same
  quadrants. Below 0.0625 nothing inks at all, so it is rejected rather than
  drawn as an invisible element that still occupies space.

DRAWING FROM A SOURCE — reach for this BEFORE deriving geometry by hand
  measure_image source [maxWidthCells|maxHeightCells] [fit]
    Reports the measured whole-cell footprint plus separate embedded-pixel and
    dither/simplify quadrant scales. Read UPSCALE, DOWNSCALE, or EXACT before placement.
    Upscaling repeats/interpolates existing information; it creates no detail.
  place_image  id at span source [mode] [fit] [detail] [supersample] [opacity] [page]
    mode "simplify" intentionally makes a perceptual approximation rather than
                   a 1:1 copy. Near-binary sources use clean contrast thresholding;
                   continuous-tone sources use colour-aware contour selection and
                   raise L023 because geometry cannot know the subject. detail is
                   auto|low|medium|high. Fewer than 24 quadrants on the short side
                   is refused; use a larger span or purpose-built icon artwork.
                   supersample is auto|1|2|4. A factor of 4 builds a working canvas
                   at 4x width and height, then box-averages each 16-sample block
                   into one of 17 exact final coverage levels. Runs retain that
                   coverage through save/reopen. auto prefers 4x within limits.
    mode "dither"  quantises the image ONTO the lattice through a 4x4 Bayer
                   matrix. Real quadrants, merged into runs, byte-identical
                   every run. Downscale area-averages; upscale repeats nearest
                   samples. PNG decodes on node:zlib alone. L022 blocks a busy
                   checker result. Remove and re-place to change its span.
    mode "embed"   (default) keeps a picture as a picture; it still claims an
                   exact footprint and collides like any other element. Use it
                   for photos and evidence. Resize recomputes its scale report.
    fit  "contain" (default) preserves every edge with possible padding;
         "cover" fills the footprint by cropping overflow. Both preserve aspect.
  place_reference source span [at] [opacity] [id] [mode] [fit] [detail] [supersample]
    Lays a dithered or simplified copy UNDER the drawing to trace over, flagged
    L020 until remove_page takes it out, so scaffolding cannot ship.

  If a shape has to LOOK like something real — a brain, a leaf, a face — a
  formula will not get there. Sine waves are not cortex. Simplify prepared
  source art, dither it, or trace a reference. Hand-computing a bitmap is the long way round, and the
  usual reason an author reaches for it is that they did not know these exist.

  dir     up down left right          n counts whole 10px cells
  align   vertical strokes: left|right    horizontal strokes: top|bottom
          (no centre — a 5px stroke centred in a 10px cell starts at 2.5px)
  style   square rounded indented chamfered
  sides   top bottom left right — a corner names the two sides it connects;
          one of them must be the side the path arrives on

EXAMPLE — a connector between two boxes, with no address arithmetic
  pen from gateway.S
  down align right line to checkout.N arrow

ROUTING — a proposal, never a change
  route { from: "gateway.S", to: "checkout.N" }  ->  a pen program

  It hands back a program and changes NOTHING. Read it, then run it with "pen"
  like anything you wrote; it validates identically. That is the condition
  auto-routing was deferred on — the path stays inspectable, and there is no
  router hiding inside the kernel producing geometry nobody can account for.

  It tries the three shapes a person would draw — straight, one turn, two turns
  — against everything already on the page. If none is clear it SAYS SO and
  names what is in the way. A twelve-turn path that technically avoids every
  obstacle is not a connector anyone can follow, so it is not offered.

CONNECTORS: THE TWO MISTAKES WORTH KNOWING
  1. Starting at an address you worked out yourself. A box's south face is
     already outside it, but its north face is its own top row — so leaving
     northward starts one quadrant higher. Use "pen from <id>.<face>" instead;
     place_box and describe also report the seat address for every face.
  2. Assuming "to <id>.<port>" arrives. It only sets the DISTANCE along the way
     you are travelling. If the run is on a different row or column from the
     target, it stops level with it and never touches it — reported as L016.

IF YOU ARE GOING ROUND IN CIRCLES, validate WILL SAY SO
  Three checks in a row with edits between them and the SAME findings still
  open — not merely the same count, the same findings — and validate appends a
  NO PROGRESS note. It means what is being changed is not what is being
  reported. Read one finding, use "repair" to see whether any of its fixes is a
  single call, and if none is, change the approach rather than the edit.

  It watches the sequence of attempts, never the drawing, so it advises and
  never blocks. Validating twice without editing is not stagnation, and a clean
  document checked repeatedly is never nagged.

EVERY FIX IS ALSO A CALL
  repair { fingerprint }          list the fixes for a current finding
  repair { fingerprint, index }   perform that one

  Listing says which fixes are one call away and which need a decision from you
  first. Performing goes through the ordinary operations — rehearsable,
  undoable, nothing it could not have done by hand; it only saves you working
  out the arguments.

  It does NOT guess. reroute, offset, hop, extend, rename and shorten are
  refused by name, because where a path should go instead, or which words to
  cut, is yours to decide. Inventing a plausible mutation you did not ask for
  is the failure this engine exists to prevent.

EVERY FIX HAS A TOOL
  widen / heighten -> resize        shorten / font -> restyle
  move             -> move          rename         -> rename
  intent           -> update_page   canvas         -> set_canvas
  extend           -> extend_path   reroute        -> replace_path
  offset / hop     -> replace_path with a hop piece or the other alignment

lattice:
{
  "pxPerCell": 10,
  "pxPerQuadrant": 5,
  "quadrantsPerCell": 2,
  "strokeWidthPx": 5,
  "addressing": "Excel: columns A..Z, AA.., rows 1.. ; origin A1 top-left; unbounded right and down",
  "precisions": {
    "cell": "C4",
    "pin": "C4.tl (9 per cell)",
    "quadrant": "C4.q2 (4 per cell)"
  },
  "pins": [
    "tl",
    "t",
    "tr",
    "l",
    "c",
    "r",
    "bl",
    "b",
    "br"
  ],
  "font": {
    "size": 10,
    "advancePx": 6,
    "lineHeightPx": 15,
    "paddingQuads": 1
  },
  "capacity": {
    "charsPerCellWidth": 1.6666666666666667,
    "formula": "chars per line = floor((cellsWide * 10 - 10) / 6)"
  },
  "strokeAlignments": {
    "vertical": [
      "left",
      "right"
    ],
    "horizontal": [
      "top",
      "bottom"
    ],
    "note": "no centre: a 5px stroke centred in a 10px cell would start at 2.5px, off the lattice"
  },
  "cornerStyles": [
    "square",
    "rounded",
    "indented",
    "chamfered"
  ],
  "nodeShapes": [
    "process",
    "decision",
    "terminator",
    "subprocess",
    "io",
    "prep",
    "manual",
    "data",
    "document",
    "bar",
    "lane",
    "group"
  ],
  "legibilityFloorPx": 8
}

rules:
{
  "L001": {
    "severity": "S0",
    "title": "node overlap",
    "blurb": "two elements claim the same quadrants on one page"
  },
  "L002": {
    "severity": "S1",
    "title": "label too wide",
    "blurb": "measured text is wider than the box interior"
  },
  "L003": {
    "severity": "S1",
    "title": "label too tall",
    "blurb": "wrapped text needs more lines than the box can show"
  },
  "L004": {
    "severity": "S1",
    "title": "stroke crosses node",
    "blurb": "a path runs through the inked body of a box"
  },
  "L005": {
    "severity": "S1",
    "title": "exclusive page overlap",
    "blurb": "a page declared exclusive overlaps content below it"
  },
  "L006": {
    "severity": "S2",
    "title": "stroke overlap",
    "blurb": "two paths claim the same quadrant with no junction"
  },
  "L007": {
    "severity": "S2",
    "title": "no gutter",
    "blurb": "two boxes touch with no separating quadrant"
  },
  "L008": {
    "severity": "S2",
    "title": "dangling path end",
    "blurb": "a path ends without meeting a box or another path"
  },
  "L009": {
    "severity": "S2",
    "title": "below legibility floor",
    "blurb": "font size under 8px"
  },
  "L010": {
    "severity": "S3",
    "title": "overlay overlap",
    "blurb": "expected overlap from a page declared as an overlay"
  },
  "L011": {
    "severity": "S2",
    "title": "outside canvas",
    "blurb": "an element extends past the declared canvas bounds"
  },
  "L012": {
    "severity": "S0",
    "title": "duplicate id",
    "blurb": "the same element id appears more than once"
  },
  "L013": {
    "severity": "S3",
    "title": "passes through corner cut",
    "blurb": "a path crosses a claimed but un-inked corner quadrant"
  },
  "L014": {
    "severity": "S2",
    "title": "path discontinuity",
    "blurb": "a stroke was drawn on a track the cursor was not on"
  },
  "L015": {
    "severity": "S2",
    "title": "path self-overlap",
    "blurb": "a path re-draws a quadrant it already covered"
  },
  "L016": {
    "severity": "S2",
    "title": "target not reached",
    "blurb": "a path named a destination but stops short of touching it"
  },
  "L017": {
    "severity": "S3",
    "title": "centring bias",
    "blurb": "centred text could not be split evenly, so a pixel went left"
  },
  "L018": {
    "severity": "S3",
    "title": "centring bias",
    "blurb": "a stroke centred in an even corridor could not sit exactly in the middle"
  },
  "L019": {
    "severity": "S2",
    "title": "invisible but claiming",
    "blurb": "an element faded past legibility still occupies its quadrants"
  },
  "L020": {
    "severity": "S2",
    "title": "reference still present",
    "blurb": "a tracing underlay is still in the document"
  },
  "L021": {
    "severity": "S1",
    "title": "overlay obscures text",
    "blurb": "opaque overlay content crosses a lower text run"
  },
  "L022": {
    "severity": "S2",
    "title": "busy raster image",
    "blurb": "high-frequency black/white transitions obscure image identity"
  },
  "L023": {
    "severity": "S2",
    "title": "heuristic image approximation",
    "blurb": "continuous-tone source was simplified without semantic understanding"
  },
  "L024": {
    "severity": "S2",
    "title": "symbol out of proportion",
    "blurb": "a shape is stretched until its silhouette no longer distinguishes it"
  },
  "L025": {
    "severity": "S1",
    "title": "depth flattened onto one page",
    "blurb": "things at different depths share a page, so neither can pass behind the other"
  },
  "C001": {
    "severity": "S3",
    "title": "sparse canvas",
    "blurb": "the page has so little ink that nothing was really composed"
  },
  "F001": {
    "severity": "S1",
    "title": "more than one start",
    "blurb": "a flowchart has exactly one beginning"
  },
  "F002": {
    "severity": "S1",
    "title": "decision does not branch",
    "blurb": "a judgement with fewer than two ways out decides nothing"
  }
}
```

## search_help: artwork

```text
TurtlePen capability search: "artwork" — 5 match(es)
pen                      [authoring] Run a pen program. Each command draws and advances a cursor. Geometry always claims exact 5px quadrants. Set role="artwork" for open illustrations, optional hex color/width/cap for line ink, or paint="cells" for solid lattice artwork. Call turtlepen_help for the grammar.
stroke_to_path           [authoring] Materialise a path’s exact claimed quadrants as cell-painted artwork geometry. TurtlePen widths are at most one 5px quadrant, so this produces the only honest editable outline instead of inventing sub-lattice fractional geometry.
boolean                  [other] Combine two or more elements with exact lattice set algebra. action union, difference, intersection, or xor uses each element’s visual footprint by default and creates a cell-painted artwork path. This is not floating-point Bézier clipping: every output quadrant is explicit, collision-checked, persistent, undoable, and available to plan.
import_svg               [other] Import a strict, exact SVG subset as ordinary editable TurtlePen artwork paths. Source markup is compiled, never embedded or emitted verbatim: solid 5px-lattice rectangles become cell-painted paths, while 5px hex-colour line/polyline/polygon/M-L-H-V-Z strokes become exact rasterized paths. Unsupported curves, transforms, text, resources, styles, filters, masks, and scripts fail by name. Use inspect_svg or plan first; direct import participates in validation, history, save/open, and plan exactly like hand-authored geometry.
micro_mask               [other] Apply or remove a reversible 1-design-pixel eraser stroke on an artwork path or image. This changes SVG presentation and renderHash but never deletes 5px quadrant geometry or changes collision validation. Points are absolute integer pixels in the canonical SVG drawing coordinate system.
```

## search_help: pen

```text
TurtlePen capability search: "pen" — 19 match(es)
import_mermaid           [authoring] Compile a Mermaid flowchart into TurtlePen operations. Returns the operations; it does NOT change the document. Feed them to "plan" to rehearse, read the collision log, then commit — so an import is subject to exactly the same validation as anything drawn by hand, and cannot produce geometry the normal path could not. Node brackets map onto the symbol vocabulary: ([x]) terminator, {x} decision, [/x/] io, {{x}} prep, [(x)] data, [[x]] subprocess, backslash-delimited manual, [x] process. It lays out a top-to-bottom spine; it does NOT route, and says so when an edge is not a straight drop. Unsupported syntax (subgraph, classDef, style, click) is refused by name rather than silently dropped.
open_diagram             [authoring] Open an existing diagram file and make it active.
pen                      [authoring] Run a pen program. Each command draws and advances a cursor. Geometry always claims exact 5px quadrants. Set role="artwork" for open illustrations, optional hex color/width/cap for line ink, or paint="cells" for solid lattice artwork. Call turtlepen_help for the grammar.
stroke_text              [authoring] Draw words as INK, in TurtleFont — quadrants on the lattice, not an SVG text run. Use it for titles, callouts, plotter output, and anything where the words must collide, measure exactly, and survive without a font file. It is a DISPLAY face: cap height is 6 quadrants (30px), because a stroke glyph smaller than that stops being legible once the lattice has quantised it — for 11px body text, keep using place_box labels. SIZE is the cap height in quadrants: 6 is 30px and the smallest that keeps every letter distinct, 12 is what the glyphs are drawn at, and anything between rounds (the result says whether it did). weight sets pen thickness independently, so a size can be light or bold. A character the face cannot draw is REFUSED, never skipped, so a missing glyph can never become a silent hole in a sentence — call font_coverage first if you are unsure.
stroke_to_path           [authoring] Materialise a path’s exact claimed quadrants as cell-painted artwork geometry. TurtlePen widths are at most one 5px quadrant, so this produces the only honest editable outline instead of inventing sub-lattice fractional geometry.
turtlepen_help           [authoring] Read this first. Returns a compact orientation by default; section="all" returns the full grammar and rule manual. Use search_help for task-focused discovery.
runtime_info             [discovery] Report the live TurtlePen runtime version, schema, tool inventory fingerprint, session start, and active document identity so a client can detect stale capabilities instead of guessing.
history                  [file] Inspect, clear, or navigate the active diagram's durable bounded edit history. Undo/redo survives open_diagram and MCP restarts through a hash-bound sidecar. Stale or corrupt sidecars are ignored. Failed and no-op calls create no entry, and a new edit clears redo.
constraint               [layout] Create, inspect, delete, or re-sync a durable follow relationship. One anchor on a dependent element follows one anchor on a target element with an exact quadrant offset. Each dependent has one parent; cycles are refused. Relationships persist, cascade through chains, participate in plan/history, and update when elements move, resize, or are redrawn.
group                    [layout] Create and maintain a flat subsystem group, or move every member atomically by a relative whole-cell delta. An element belongs to at most one group. action="list" is read-only; create/add/remove/delete/move are persistent and participate in plan, history, save/open, and describe.
layout                   [layout] Arrange the connected boxes on a page and redraw their connectors. align and distribute tidy an arrangement you already chose; this chooses one — it ranks the graph so flow runs down the page, gives every long edge a lane of its own, reorders each rank to remove crossings, and centres each node over its neighbours. The graph comes from what your pen programs already recorded ("from a.S" is an origin, "line to b.N" is a target), never from which boxes happen to sit near each other, so draw the connections before calling this. Reports what moved, how many crossings went away, any cycle it had to reverse to rank the graph, and any connector it could NOT redraw cleanly.
route                    [layout] Propose a connector between two faces. Returns a PEN PROGRAM and changes nothing — you read it, then run it through "pen" like anything you wrote yourself, and it validates identically. There is no hidden router: the path stays inspectable, which is the condition auto-routing was deferred on. It tries the three shapes a person would draw (straight, one turn, two turns) against everything already on the page. If none is clear it says so and NAMES what is in the way, because a twelve-turn path that avoids everything is not a connector anyone can follow.
extend_path              [other] Continue an existing path from where its pen stopped, without redrawing it. This is the tool behind the "extend" fix for a dangling connector.
glyph                    [other] Look at ONE glyph: a picture of its ink, its metrics, and a fingerprint of exactly which quadrants it covers. Use this when editing the face — two different stroke lists can rasterise to identical quadrants, so a source change is not proof of a drawing change, and the fingerprint is what tells the two apart. The picture reads in a terminal, so a glyph can be judged without rendering, opening and screenshotting an SVG.
import_svg               [other] Import a strict, exact SVG subset as ordinary editable TurtlePen artwork paths. Source markup is compiled, never embedded or emitted verbatim: solid 5px-lattice rectangles become cell-painted paths, while 5px hex-colour line/polyline/polygon/M-L-H-V-Z strokes become exact rasterized paths. Unsupported curves, transforms, text, resources, styles, filters, masks, and scripts fail by name. Use inspect_svg or plan first; direct import participates in validation, history, save/open, and plan exactly like hand-authored geometry.
path_edit                [other] Edit explicit lattice path pieces. insert/move use an address and piece index; delete removes one piece; reverse flips path order; close draws the exact Bresenham bridge; open removes closure; split returns two paths; join appends an adjacent path. Direct piece edits clear resumable pen-program state so a stale cursor can never silently continue edited geometry.
unaccept_finding         [review] Withdraw a previously recorded acceptance, putting the finding back in the open log.
remove_resource          [workspace] Remove a linked resource record. TurtlePen never deletes the referenced external file or URL.
unaccept_model_finding   [workspace] Withdraw a semantic-model finding acceptance so the current finding becomes open again.
```

## search_help: arc

```text
TurtlePen capability search: "arc" — 2 match(es)
turtlepen_help           [authoring] Read this first. Returns a compact orientation by default; section="all" returns the full grammar and rule manual. Use search_help for task-focused discovery.
search_help              [discovery] Search the live capability registry by task, tool name, category, description, or argument field. Returns compact matches instead of the full manual.
```

## search_help: circle

```text
TurtlePen capability search: "circle" — 0 match(es)
```

## search_help: disc

```text
TurtlePen capability search: "disc" — 11 match(es)
place_image              [authoring] Place an image at an exact footprint. Embed preserves verified source bytes; dither reproduces tone with deterministic ordered ink; simplify intentionally discards low-salience texture and may process on a 1x, 2x, or 4x working canvas before box-averaging weighted coverage onto the final lattice. Rasterized modes report readability and must be removed/re-placed to change sampling size. All modes preserve aspect through contain or cover.
turtlepen_help           [authoring] Read this first. Returns a compact orientation by default; section="all" returns the full grammar and rule manual. Use search_help for task-focused discovery.
describe                 [discovery] List elements with their computed geometry, optionally narrowed to a page and/or cell region. Region filtering tests exact claimed rectangles, including each path quadrant, so an empty part of a path bounding box is not returned.
doctor                   [discovery] Run local, read-only runtime and capability diagnostics. Reports readiness, exact checks, tool count, and the full capability fingerprint.
font_coverage            [discovery] What TurtleFont can draw. With no argument it returns every glyph in the face grouped by block; given text, it returns only the characters that face CANNOT draw, which is the check to run before stroke_text on anything you did not type yourself.
free_space               [discovery] Where is there room? Returns maximal empty rectangles, largest first, with addresses and cell sizes — or the first rectangle that fits a given cell span. Defaults to scope="stack", where every non-reference page constrains placement, including hidden pages because they are still validated. Use scope="page" only when cross-page overlap is intentional.
measure                  [discovery] Measure text BEFORE placing a box. Returns advance width, characters per line, wrapped line count, and the cell span the label actually needs. Use this to size boxes rather than estimating. Pass the shape you intend to draw: a symbol carves its label area out of the box, so the span a diamond or a cylinder needs is not the span the raw text needs.
runtime_info             [discovery] Report the live TurtlePen runtime version, schema, tool inventory fingerprint, session start, and active document identity so a client can detect stale capabilities instead of guessing.
search_help              [discovery] Search the live capability registry by task, tool name, category, description, or argument field. Returns compact matches instead of the full manual.
slice                    [other] Divide one element at an explicit vertical or horizontal lattice boundary. divide (default) returns every edge-connected result in deterministic order; partition returns the two sides. The boundary is an address, never an inferred mouse gesture, so no fractional quadrants are discarded or approximated.
inspect_model            [workspace] Inspect semantic completeness separately from collision geometry. Reports missing node and relationship descriptions, missing relationship technology, disconnected nodes, broken endpoints, and connector paths that have no relationship model.
```

## search_help: polygon

```text
TurtlePen capability search: "polygon" — 2 match(es)
import_svg               [other] Import a strict, exact SVG subset as ordinary editable TurtlePen artwork paths. Source markup is compiled, never embedded or emitted verbatim: solid 5px-lattice rectangles become cell-painted paths, while 5px hex-colour line/polyline/polygon/M-L-H-V-Z strokes become exact rasterized paths. Unsupported curves, transforms, text, resources, styles, filters, masks, and scripts fail by name. Use inspect_svg or plan first; direct import participates in validation, history, save/open, and plan exactly like hand-authored geometry.
inspect_svg              [review] Read a strict SVG import report without changing the diagram. The compiler accepts only solid unstroked lattice rectangles and 5px hex-colour line/polyline/polygon/M-L-H-V-Z strokes; it reports their generated ids, exact quadrant bounds, and any explicitly requested nearest-lattice shifts. It never embeds, executes, or preserves raw SVG markup.
```

## search_help: triangle

```text
TurtlePen capability search: "triangle" — 0 match(es)
```

## search_help: text

```text
TurtlePen capability search: "text" — 11 match(es)
pen                      [authoring] Run a pen program. Each command draws and advances a cursor. Geometry always claims exact 5px quadrants. Set role="artwork" for open illustrations, optional hex color/width/cap for line ink, or paint="cells" for solid lattice artwork. Call turtlepen_help for the grammar.
place_image              [authoring] Place an image at an exact footprint. Embed preserves verified source bytes; dither reproduces tone with deterministic ordered ink; simplify intentionally discards low-salience texture and may process on a 1x, 2x, or 4x working canvas before box-averaging weighted coverage onto the final lattice. Rasterized modes report readability and must be removed/re-placed to change sampling size. All modes preserve aspect through contain or cover.
stroke_label             [authoring] Label a box with INK rather than an SVG text run, so the whole drawing survives without a font file and can go to a plotter. The label is its OWN element: it collides like any other stroke and can be moved or removed on its own, and the box keeps whatever <text> label it already had (pass an empty label to place_box if you want only the ink). The text area comes from the SYMBOL, so a diamond leaves far less room than its bounding box — and because cap height is 6 quadrants, inked labels need much bigger nodes than <text> ones. It measures and REFUSES with numbers rather than shrinking or spilling.
stroke_text              [authoring] Draw words as INK, in TurtleFont — quadrants on the lattice, not an SVG text run. Use it for titles, callouts, plotter output, and anything where the words must collide, measure exactly, and survive without a font file. It is a DISPLAY face: cap height is 6 quadrants (30px), because a stroke glyph smaller than that stops being legible once the lattice has quantised it — for 11px body text, keep using place_box labels. SIZE is the cap height in quadrants: 6 is 30px and the smallest that keeps every letter distinct, 12 is what the glyphs are drawn at, and anything between rounds (the result says whether it did). weight sets pen thickness independently, so a size can be light or bold. A character the face cannot draw is REFUSED, never skipped, so a missing glyph can never become a silent hole in a sentence — call font_coverage first if you are unsure.
font_coverage            [discovery] What TurtleFont can draw. With no argument it returns every glyph in the face grouped by block; given text, it returns only the characters that face CANNOT draw, which is the check to run before stroke_text on anything you did not type yourself.
measure                  [discovery] Measure text BEFORE placing a box. Returns advance width, characters per line, wrapped line count, and the cell span the label actually needs. Use this to size boxes rather than estimating. Pass the shape you intend to draw: a symbol carves its label area out of the box, so the span a diamond or a cylinder needs is not the span the raw text needs.
render                   [file] Write the diagram to an SVG file. Text is emitted with textLength, so what is drawn cannot disagree with what was measured.
ascii                    [other] Render the diagram as text at quadrant resolution — two characters per cell, with Excel headers. Use it to see what was actually drawn. Optionally marks colliding quadrants.
import_svg               [other] Import a strict, exact SVG subset as ordinary editable TurtlePen artwork paths. Source markup is compiled, never embedded or emitted verbatim: solid 5px-lattice rectangles become cell-painted paths, while 5px hex-colour line/polyline/polygon/M-L-H-V-Z strokes become exact rasterized paths. Unsupported curves, transforms, text, resources, styles, filters, masks, and scripts fail by name. Use inspect_svg or plan first; direct import participates in validation, history, save/open, and plan exactly like hand-authored geometry.
restyle                  [other] Change a box's label, node shape, corner style, text alignment, font size, or fill. This is the tool behind the "shorten", "font" and "shape" fixes; it re-measures the label.
annotate                 [workspace] Attach semantic model information to any existing node, relationship, text, image, or path without changing its geometry. Descriptions, technology, tags, properties, and perspectives persist in the document and are returned by describe.
```

## search_help: measure

```text
TurtlePen capability search: "measure" — 9 match(es)
perspective_scene        [authoring] Project a room and its contents onto the lattice through a real camera, in three dimensions. Use this when a flat plan or elevation cannot carry what matters — a receding stair, a ceiling far behind the wall, equipment at different depths, or matching the geometry of a photograph. Authored in room INCHES: X rightward, Y up from the finished floor, Z away from the camera. Boxes draw far-to-near because the lattice has no z-buffer, and run lengths are measured in the room rather than off the projection.
place_box                [authoring] Place a box by address and cell span. The address may name a pin point (C4.tl, C4.c, C4.br) which decides which of the box's own corners lands there. Measure the label first — this tool reports overflow but never resizes anything.
stroke_label             [authoring] Label a box with INK rather than an SVG text run, so the whole drawing survives without a font file and can go to a plotter. The label is its OWN element: it collides like any other stroke and can be moved or removed on its own, and the box keeps whatever <text> label it already had (pass an empty label to place_box if you want only the ink). The text area comes from the SYMBOL, so a diamond leaves far less room than its bounding box — and because cap height is 6 quadrants, inked labels need much bigger nodes than <text> ones. It measures and REFUSES with numbers rather than shrinking or spilling.
stroke_text              [authoring] Draw words as INK, in TurtleFont — quadrants on the lattice, not an SVG text run. Use it for titles, callouts, plotter output, and anything where the words must collide, measure exactly, and survive without a font file. It is a DISPLAY face: cap height is 6 quadrants (30px), because a stroke glyph smaller than that stops being legible once the lattice has quantised it — for 11px body text, keep using place_box labels. SIZE is the cap height in quadrants: 6 is 30px and the smallest that keeps every letter distinct, 12 is what the glyphs are drawn at, and anything between rounds (the result says whether it did). weight sets pen thickness independently, so a size can be light or bold. A character the face cannot draw is REFUSED, never skipped, so a missing glyph can never become a silent hole in a sentence — call font_coverage first if you are unsure.
measure                  [discovery] Measure text BEFORE placing a box. Returns advance width, characters per line, wrapped line count, and the cell span the label actually needs. Use this to size boxes rather than estimating. Pass the shape you intend to draw: a symbol carves its label area out of the box, so the span a diamond or a cylinder needs is not the span the raw text needs.
measure_image            [file] Read real image dimensions and report the measured whole-cell footprint, aspect rounding, rendered-pixel scale, and dither/simplify quadrant-sampling scales. Call this BEFORE place_image. Reports say exactly whether each stage upscales, downscales, or stays exact; upscaling never creates detail.
render                   [file] Write the diagram to an SVG file. Text is emitted with textLength, so what is drawn cannot disagree with what was measured.
resize                   [layout] Resize a box by cell span, keeping one corner pinned. This is the tool behind the "widen" and "heighten" fixes; it re-measures the label and reports the new fit.
restyle                  [other] Change a box's label, node shape, corner style, text alignment, font size, or fill. This is the tool behind the "shorten", "font" and "shape" fixes; it re-measures the label.
```

## search_help: page

```text
TurtlePen capability search: "page" — 25 match(es)
import_mermaid           [authoring] Compile a Mermaid flowchart into TurtlePen operations. Returns the operations; it does NOT change the document. Feed them to "plan" to rehearse, read the collision log, then commit — so an import is subject to exactly the same validation as anything drawn by hand, and cannot produce geometry the normal path could not. Node brackets map onto the symbol vocabulary: ([x]) terminator, {x} decision, [/x/] io, {{x}} prep, [(x)] data, [[x]] subprocess, backslash-delimited manual, [x] process. It lays out a top-to-bottom spine; it does NOT route, and says so when an edge is not a straight drop. Unsupported syntax (subgraph, classDef, style, click) is refused by name rather than silently dropped.
pen                      [authoring] Run a pen program. Each command draws and advances a cursor. Geometry always claims exact 5px quadrants. Set role="artwork" for open illustrations, optional hex color/width/cap for line ink, or paint="cells" for solid lattice artwork. Call turtlepen_help for the grammar.
perspective_scene        [authoring] Project a room and its contents onto the lattice through a real camera, in three dimensions. Use this when a flat plan or elevation cannot carry what matters — a receding stair, a ceiling far behind the wall, equipment at different depths, or matching the geometry of a photograph. Authored in room INCHES: X rightward, Y up from the finished floor, Z away from the camera. Boxes draw far-to-near because the lattice has no z-buffer, and run lengths are measured in the room rather than off the projection.
place_box                [authoring] Place a box by address and cell span. The address may name a pin point (C4.tl, C4.c, C4.br) which decides which of the box's own corners lands there. Measure the label first — this tool reports overflow but never resizes anything.
place_image              [authoring] Place an image at an exact footprint. Embed preserves verified source bytes; dither reproduces tone with deterministic ordered ink; simplify intentionally discards low-salience texture and may process on a 1x, 2x, or 4x working canvas before box-averaging weighted coverage onto the final lattice. Rasterized modes report readability and must be removed/re-placed to change sampling size. All modes preserve aspect through contain or cover.
place_reference          [authoring] Lay an aspect-preserved image UNDER the drawing to trace over, checked for busy raster output and flagged by L020 until remove_page removes it. Dither is exact tonal lattice ink; simplify is a sparse perceptual approximation for sources whose literal dither is unreadable.
stroke_label             [authoring] Label a box with INK rather than an SVG text run, so the whole drawing survives without a font file and can go to a plotter. The label is its OWN element: it collides like any other stroke and can be moved or removed on its own, and the box keeps whatever <text> label it already had (pass an empty label to place_box if you want only the ink). The text area comes from the SYMBOL, so a diamond leaves far less room than its bounding box — and because cap height is 6 quadrants, inked labels need much bigger nodes than <text> ones. It measures and REFUSES with numbers rather than shrinking or spilling.
stroke_text              [authoring] Draw words as INK, in TurtleFont — quadrants on the lattice, not an SVG text run. Use it for titles, callouts, plotter output, and anything where the words must collide, measure exactly, and survive without a font file. It is a DISPLAY face: cap height is 6 quadrants (30px), because a stroke glyph smaller than that stops being legible once the lattice has quantised it — for 11px body text, keep using place_box labels. SIZE is the cap height in quadrants: 6 is 30px and the smallest that keeps every letter distinct, 12 is what the glyphs are drawn at, and anything between rounds (the result says whether it did). weight sets pen thickness independently, so a size can be light or bold. A character the face cannot draw is REFUSED, never skipped, so a missing glyph can never become a silent hole in a sentence — call font_coverage first if you are unsure.
wireframe                [authoring] Lay a dimensioned area and its equipment onto the page, to scale. Authored in INCHES and converted at a declared scale, so the drawing is measurable rather than suggestive. Walls are drawn as walls and service clearance as bands around each unit, which means an encroachment reports as an ordinary collision — a unit too near a wall or another unit fails validate. Supply clearance values from the equipment listing and governing code; this tool invents none. Follow with export_prompt to brief an image model.
describe                 [discovery] List elements with their computed geometry, optionally narrowed to a page and/or cell region. Region filtering tests exact claimed rectangles, including each path quadrant, so an empty part of a path bounding box is not returned.
free_space               [discovery] Where is there room? Returns maximal empty rectangles, largest first, with addresses and cell sizes — or the first rectangle that fits a given cell span. Defaults to scope="stack", where every non-reference page constrains placement, including hidden pages because they are still validated. Use scope="page" only when cross-page overlap is intentional.
new_diagram              [file] Create a new diagram and make it active. Creates a "base" page at z:0 with exclusive intent.
layout                   [layout] Arrange the connected boxes on a page and redraw their connectors. align and distribute tidy an arrangement you already chose; this chooses one — it ranks the graph so flow runs down the page, gives every long edge a lane of its own, reorders each rank to remove crossings, and centres each node over its neighbours. The graph comes from what your pen programs already recorded ("from a.S" is an origin, "line to b.N" is a target), never from which boxes happen to sit near each other, so draw the connections before calling this. Reports what moved, how many crossings went away, any cycle it had to reverse to rank the graph, and any connector it could NOT redraw cleanly.
move                     [layout] Move an element: to an address (its pin corner lands there), by a delta in cells, or onto another page. Moving to a page is a move in DEPTH — with no z-buffer, "in front of" is which page a thing sits on, so this is how one element passes behind another. This is the tool behind the "move" fix.
remove                   [layout] Delete an element permanently. Prefer a repair tool where one applies: resize or restyle for a box that is the wrong size or label, replace_path to redraw a connector, move to reposition. Removing and re-adding loses the id, and with it any acceptances recorded against findings about that element.
remove_page              [layout] Remove an entire Z-page and every element on it. This is the repair for L020 after a tracing reference has served its purpose. A document must retain at least one page.
route                    [layout] Propose a connector between two faces. Returns a PEN PROGRAM and changes nothing — you read it, then run it through "pen" like anything you wrote yourself, and it validates identically. There is no hidden router: the path stays inspectable, which is the condition auto-routing was deferred on. It tries the three shapes a person would draw (straight, one turn, two turns) against everything already on the page. If none is clear it says so and NAMES what is in the way, because a twelve-turn path that avoids everything is not a connector anyone can follow.
add_page                 [other] Add a Z-page. intent="exclusive" means nothing below may be overlapped (overlap is an error); intent="overlay" means overlap is expected and is reported as information. Choose deliberately — this is what stops annotation layers generating endless warnings.
ascii                    [other] Render the diagram as text at quadrant resolution — two characters per cell, with Excel headers. Use it to see what was actually drawn. Optionally marks colliding quadrants.
import_svg               [other] Import a strict, exact SVG subset as ordinary editable TurtlePen artwork paths. Source markup is compiled, never embedded or emitted verbatim: solid 5px-lattice rectangles become cell-painted paths, while 5px hex-colour line/polyline/polygon/M-L-H-V-Z strokes become exact rasterized paths. Unsupported curves, transforms, text, resources, styles, filters, masks, and scripts fail by name. Use inspect_svg or plan first; direct import participates in validation, history, save/open, and plan exactly like hand-authored geometry.
reorder                  [other] Change an element’s presentation order within its page: bring_to_front, send_to_back, raise, lower, before, or after. Same-page collisions remain validation errors; use an overlay page and an accepted finding for deliberate stacking.
update_page              [other] Change a page's intent, stacking order, title, or visibility. This is the tool behind the "intent" fix — the one that turns an L005 error into an L010 note when the stacking really is deliberate.
validate                 [review] Validate the whole composition and return the severity-ranked collision log. This is the plan -> validate step: draw everything first, then check it as a unit. Findings carry a fingerprint for accept_finding.
connect                  [workspace] Create a directed, semantic relationship from one node port to another. routing="direct" draws one exact ray; "orthogonal" emits and applies an inspectable simple route; "curved" starts at the source node and bends through one or more explicit via addresses before terminating at the target node. Geometry remains whole 5px quadrants.
define_view              [workspace] Create or replace a durable static, tag-filtered, or ordered dynamic view. Views project one shared model; they never duplicate diagram elements.
```

## search_help: overlay

```text
TurtlePen capability search: "overlay" — 2 match(es)
add_page                 [other] Add a Z-page. intent="exclusive" means nothing below may be overlapped (overlap is an error); intent="overlay" means overlap is expected and is reported as information. Choose deliberately — this is what stops annotation layers generating endless warnings.
reorder                  [other] Change an element’s presentation order within its page: bring_to_front, send_to_back, raise, lower, before, or after. Same-page collisions remain validation errors; use an overlay page and an accepted finding for deliberate stacking.
```

## search_help: layer

```text
TurtlePen capability search: "layer" — 1 match(es)
add_page                 [other] Add a Z-page. intent="exclusive" means nothing below may be overlapped (overlap is an error); intent="overlay" means overlap is expected and is reported as information. Choose deliberately — this is what stops annotation layers generating endless warnings.
```

## search_help: reference

```text
TurtlePen capability search: "reference" — 5 match(es)
place_reference          [authoring] Lay an aspect-preserved image UNDER the drawing to trace over, checked for busy raster output and flagged by L020 until remove_page removes it. Dither is exact tonal lattice ink; simplify is a sparse perceptual approximation for sources whose literal dither is unreadable.
free_space               [discovery] Where is there room? Returns maximal empty rectangles, largest first, with addresses and cell sizes — or the first rectangle that fits a given cell span. Defaults to scope="stack", where every non-reference page constrains placement, including hidden pages because they are still validated. Use scope="page" only when cross-page overlap is intentional.
remove_page              [layout] Remove an entire Z-page and every element on it. This is the repair for L020 after a tracing reference has served its purpose. A document must retain at least one page.
attach_resource          [workspace] Attach or update a durable documentation, ADR, runbook, URL, or local-file reference on the workspace model.
remove_resource          [workspace] Remove a linked resource record. TurtlePen never deletes the referenced external file or URL.
```

## search_help: image

```text
TurtlePen capability search: "image" — 7 match(es)
place_image              [authoring] Place an image at an exact footprint. Embed preserves verified source bytes; dither reproduces tone with deterministic ordered ink; simplify intentionally discards low-salience texture and may process on a 1x, 2x, or 4x working canvas before box-averaging weighted coverage onto the final lattice. Rasterized modes report readability and must be removed/re-placed to change sampling size. All modes preserve aspect through contain or cover.
place_reference          [authoring] Lay an aspect-preserved image UNDER the drawing to trace over, checked for busy raster output and flagged by L020 until remove_page removes it. Dither is exact tonal lattice ink; simplify is a sparse perceptual approximation for sources whose literal dither is unreadable.
wireframe                [authoring] Lay a dimensioned area and its equipment onto the page, to scale. Authored in INCHES and converted at a declared scale, so the drawing is measurable rather than suggestive. Walls are drawn as walls and service clearance as bands around each unit, which means an encroachment reports as an ordinary collision — a unit too near a wall or another unit fails validate. Supply clearance values from the equipment listing and governing code; this tool invents none. Follow with export_prompt to brief an image model.
export_prompt            [file] Emit the composition brief for an image-generation model: the area in feet and inches, each item as a normalised box within it, its real size, its position in plain words, and its description. Read-only. Serves both kinds of model — one that accepts regional conditioning reads the numbers, one that only reads prose gets the same arrangement stated in words.
measure_image            [file] Read real image dimensions and report the measured whole-cell footprint, aspect rounding, rendered-pixel scale, and dither/simplify quadrant-sampling scales. Call this BEFORE place_image. Reports say exactly whether each stage upscales, downscales, or stays exact; upscaling never creates detail.
micro_mask               [other] Apply or remove a reversible 1-design-pixel eraser stroke on an artwork path or image. This changes SVG presentation and renderHash but never deletes 5px quadrant geometry or changes collision validation. Points are absolute integer pixels in the canonical SVG drawing coordinate system.
annotate                 [workspace] Attach semantic model information to any existing node, relationship, text, image, or path without changing its geometry. Descriptions, technology, tags, properties, and perspectives persist in the document and are returned by describe.
```

## search_help: render

```text
TurtlePen capability search: "render" — 7 match(es)
measure_image            [file] Read real image dimensions and report the measured whole-cell footprint, aspect rounding, rendered-pixel scale, and dither/simplify quadrant-sampling scales. Call this BEFORE place_image. Reports say exactly whether each stage upscales, downscales, or stays exact; upscaling never creates detail.
render                   [file] Write the diagram to an SVG file. Text is emitted with textLength, so what is drawn cannot disagree with what was measured.
ascii                    [other] Render the diagram as text at quadrant resolution — two characters per cell, with Excel headers. Use it to see what was actually drawn. Optionally marks colliding quadrants.
glyph                    [other] Look at ONE glyph: a picture of its ink, its metrics, and a fingerprint of exactly which quadrants it covers. Use this when editing the face — two different stroke lists can rasterise to identical quadrants, so a source change is not proof of a drawing change, and the fingerprint is what tells the two apart. The picture reads in a terminal, so a glyph can be judged without rendering, opening and screenshotting an SVG.
micro_mask               [other] Apply or remove a reversible 1-design-pixel eraser stroke on an artwork path or image. This changes SVG presentation and renderHash but never deletes 5px quadrant geometry or changes collision validation. Points are absolute integer pixels in the canonical SVG drawing coordinate system.
set_background           [other] Set the paper colour for the whole drawing, or pass no colour to go back to the palette. Paper is document state rather than a render option: a drawing composed against dark paper is a different drawing, and re-rendering it light would misreport it.
perceptual_review        [workspace] Record what a drawing LOOKS like, after rendering and looking at it. validate proves a drawing is structurally undefective; it cannot prove the drawing depicts what was asked for — a corpus once validated CLEAN while a sheep read as a stegosaurus and half-tone spots dithered into plus-signs. Nothing recorded here reaches collision geometry, and the structural and perceptual verdicts are returned side by side, never merged into one flag. A review binds to the renderHash that "render" returned, so editing the drawing afterwards marks the review stale instead of leaving a stale opinion looking current.
```

## search_help: perceptual_review

```text
TurtlePen capability search: "perceptual_review" — 1 match(es)
perceptual_review        [workspace] Record what a drawing LOOKS like, after rendering and looking at it. validate proves a drawing is structurally undefective; it cannot prove the drawing depicts what was asked for — a corpus once validated CLEAN while a sheep read as a stegosaurus and half-tone spots dithered into plus-signs. Nothing recorded here reaches collision geometry, and the structural and perceptual verdicts are returned side by side, never merged into one flag. A review binds to the renderHash that "render" returned, so editing the drawing afterwards marks the review stale instead of leaving a stale opinion looking current.
```

## search_help: inspect

```text
TurtlePen capability search: "inspect" — 8 match(es)
history                  [file] Inspect, clear, or navigate the active diagram's durable bounded edit history. Undo/redo survives open_diagram and MCP restarts through a hash-bound sidecar. Stale or corrupt sidecars are ignored. Failed and no-op calls create no entry, and a new edit clears redo.
constraint               [layout] Create, inspect, delete, or re-sync a durable follow relationship. One anchor on a dependent element follows one anchor on a target element with an exact quadrant offset. Each dependent has one parent; cycles are refused. Relationships persist, cascade through chains, participate in plan/history, and update when elements move, resize, or are redrawn.
route                    [layout] Propose a connector between two faces. Returns a PEN PROGRAM and changes nothing — you read it, then run it through "pen" like anything you wrote yourself, and it validates identically. There is no hidden router: the path stays inspectable, which is the condition auto-routing was deferred on. It tries the three shapes a person would draw (straight, one turn, two turns) against everything already on the page. If none is clear it says so and NAMES what is in the way, because a twelve-turn path that avoids everything is not a connector anyone can follow.
import_svg               [other] Import a strict, exact SVG subset as ordinary editable TurtlePen artwork paths. Source markup is compiled, never embedded or emitted verbatim: solid 5px-lattice rectangles become cell-painted paths, while 5px hex-colour line/polyline/polygon/M-L-H-V-Z strokes become exact rasterized paths. Unsupported curves, transforms, text, resources, styles, filters, masks, and scripts fail by name. Use inspect_svg or plan first; direct import participates in validation, history, save/open, and plan exactly like hand-authored geometry.
inspect                  [review] Inspect exact claimed or visual lattice geometry without changing the document. Returns areas, perimeters, integer bounds, rational centers, pairwise shared quadrants, and bounding-box gaps for explicit element ids.
inspect_svg              [review] Read a strict SVG import report without changing the diagram. The compiler accepts only solid unstroked lattice rectangles and 5px hex-colour line/polyline/polygon/M-L-H-V-Z strokes; it reports their generated ids, exact quadrant bounds, and any explicitly requested nearest-lattice shifts. It never embeds, executes, or preserves raw SVG markup.
connect                  [workspace] Create a directed, semantic relationship from one node port to another. routing="direct" draws one exact ray; "orthogonal" emits and applies an inspectable simple route; "curved" starts at the source node and bends through one or more explicit via addresses before terminating at the target node. Geometry remains whole 5px quadrants.
inspect_model            [workspace] Inspect semantic completeness separately from collision geometry. Reports missing node and relationship descriptions, missing relationship technology, disconnected nodes, broken endpoints, and connector paths that have no relationship model.
```

## search_help: group

```text
TurtlePen capability search: "group" — 3 match(es)
font_coverage            [discovery] What TurtleFont can draw. With no argument it returns every glyph in the face grouped by block; given text, it returns only the characters that face CANNOT draw, which is the check to run before stroke_text on anything you did not type yourself.
group                    [layout] Create and maintain a flat subsystem group, or move every member atomically by a relative whole-cell delta. An element belongs to at most one group. action="list" is read-only; create/add/remove/delete/move are persistent and participate in plan, history, save/open, and describe.
duplicate                [other] Deep-copy one element with a caller-chosen deterministic id and exact whole-quadrant delta. A duplicate joins the source’s flat group when it has one, but does not silently clone follow constraints.
```

## search_help: transform

```text
TurtlePen capability search: "transform" — 1 match(es)
import_svg               [other] Import a strict, exact SVG subset as ordinary editable TurtlePen artwork paths. Source markup is compiled, never embedded or emitted verbatim: solid 5px-lattice rectangles become cell-painted paths, while 5px hex-colour line/polyline/polygon/M-L-H-V-Z strokes become exact rasterized paths. Unsupported curves, transforms, text, resources, styles, filters, masks, and scripts fail by name. Use inspect_svg or plan first; direct import participates in validation, history, save/open, and plan exactly like hand-authored geometry.
```

## search_help: rotate

```text
TurtlePen capability search: "rotate" — 2 match(es)
stroke_label             [authoring] Label a box with INK rather than an SVG text run, so the whole drawing survives without a font file and can go to a plotter. The label is its OWN element: it collides like any other stroke and can be moved or removed on its own, and the box keeps whatever <text> label it already had (pass an empty label to place_box if you want only the ink). The text area comes from the SYMBOL, so a diamond leaves far less room than its bounding box — and because cap height is 6 quadrants, inked labels need much bigger nodes than <text> ones. It measures and REFUSES with numbers rather than shrinking or spilling.
stroke_text              [authoring] Draw words as INK, in TurtleFont — quadrants on the lattice, not an SVG text run. Use it for titles, callouts, plotter output, and anything where the words must collide, measure exactly, and survive without a font file. It is a DISPLAY face: cap height is 6 quadrants (30px), because a stroke glyph smaller than that stops being legible once the lattice has quantised it — for 11px body text, keep using place_box labels. SIZE is the cap height in quadrants: 6 is 30px and the smallest that keeps every letter distinct, 12 is what the glyphs are drawn at, and anything between rounds (the result says whether it did). weight sets pen thickness independently, so a size can be light or bold. A character the face cannot draw is REFUSED, never skipped, so a missing glyph can never become a silent hole in a sentence — call font_coverage first if you are unsure.
```

## search_help: scale

```text
TurtlePen capability search: "scale" — 4 match(es)
stroke_label             [authoring] Label a box with INK rather than an SVG text run, so the whole drawing survives without a font file and can go to a plotter. The label is its OWN element: it collides like any other stroke and can be moved or removed on its own, and the box keeps whatever <text> label it already had (pass an empty label to place_box if you want only the ink). The text area comes from the SYMBOL, so a diamond leaves far less room than its bounding box — and because cap height is 6 quadrants, inked labels need much bigger nodes than <text> ones. It measures and REFUSES with numbers rather than shrinking or spilling.
stroke_text              [authoring] Draw words as INK, in TurtleFont — quadrants on the lattice, not an SVG text run. Use it for titles, callouts, plotter output, and anything where the words must collide, measure exactly, and survive without a font file. It is a DISPLAY face: cap height is 6 quadrants (30px), because a stroke glyph smaller than that stops being legible once the lattice has quantised it — for 11px body text, keep using place_box labels. SIZE is the cap height in quadrants: 6 is 30px and the smallest that keeps every letter distinct, 12 is what the glyphs are drawn at, and anything between rounds (the result says whether it did). weight sets pen thickness independently, so a size can be light or bold. A character the face cannot draw is REFUSED, never skipped, so a missing glyph can never become a silent hole in a sentence — call font_coverage first if you are unsure.
wireframe                [authoring] Lay a dimensioned area and its equipment onto the page, to scale. Authored in INCHES and converted at a declared scale, so the drawing is measurable rather than suggestive. Walls are drawn as walls and service clearance as bands around each unit, which means an encroachment reports as an ordinary collision — a unit too near a wall or another unit fails validate. Supply clearance values from the equipment listing and governing code; this tool invents none. Follow with export_prompt to brief an image model.
measure_image            [file] Read real image dimensions and report the measured whole-cell footprint, aspect rounding, rendered-pixel scale, and dither/simplify quadrant-sampling scales. Call this BEFORE place_image. Reports say exactly whether each stage upscales, downscales, or stays exact; upscaling never creates detail.
```

## search_help: duplicate

```text
TurtlePen capability search: "duplicate" — 3 match(es)
duplicate                [other] Deep-copy one element with a caller-chosen deterministic id and exact whole-quadrant delta. A duplicate joins the source’s flat group when it has one, but does not silently clone follow constraints.
rename                   [other] Rename an element. This is the tool behind the "rename" fix for duplicate ids.
define_view              [workspace] Create or replace a durable static, tag-filtered, or ordered dynamic view. Views project one shared model; they never duplicate diagram elements.
```

## search_help: array

```text
TurtlePen capability search: "array" — 1 match(es)
array                    [other] Create a bounded rectangular array of exact copies, retaining the source at row 0 column 0. New ids are deterministic prefix-1, prefix-2, … in row-major order; values are capped at 100 copies and all steps are whole quadrants.
```

## search_help: boolean

```text
TurtlePen capability search: "boolean" — 1 match(es)
boolean                  [other] Combine two or more elements with exact lattice set algebra. action union, difference, intersection, or xor uses each element’s visual footprint by default and creates a cell-painted artwork path. This is not floating-point Bézier clipping: every output quadrant is explicit, collision-checked, persistent, undoable, and available to plan.
```

## search_help: slice

```text
TurtlePen capability search: "slice" — 1 match(es)
slice                    [other] Divide one element at an explicit vertical or horizontal lattice boundary. divide (default) returns every edge-connected result in deterministic order; partition returns the two sides. The boundary is an address, never an inferred mouse gesture, so no fractional quadrants are discarded or approximated.
```

## search_help: offset_path

```text
TurtlePen capability search: "offset_path" — 1 match(es)
offset_path              [other] Offset visible or claimed lattice geometry by a signed whole-quadrant distance. Positive distances dilate and negative distances erode using an exact square-grid (Chebyshev) neighborhood; the operation fails rather than creating an empty or off-grid result.
```

## search_help: stroke_to_path

```text
TurtlePen capability search: "stroke_to_path" — 1 match(es)
stroke_to_path           [authoring] Materialise a path’s exact claimed quadrants as cell-painted artwork geometry. TurtlePen widths are at most one 5px quadrant, so this produces the only honest editable outline instead of inventing sub-lattice fractional geometry.
```

## search_help: path_edit

```text
TurtlePen capability search: "path_edit" — 1 match(es)
path_edit                [other] Edit explicit lattice path pieces. insert/move use an address and piece index; delete removes one piece; reverse flips path order; close draws the exact Bresenham bridge; open removes closure; split returns two paths; join appends an adjacent path. Direct piece edits clear resumable pen-program state so a stale cursor can never silently continue edited geometry.
```

## search_help: normalize_path

```text
TurtlePen capability search: "normalize_path" — 1 match(es)
normalize_path           [other] Remove repeated lattice quadrants from one path while preserving first-occurrence order. This is a narrow, explicit cleanup operation; it never simplifies, moves, or approximates geometry that the caller did not name.
```

## search_help: micro_mask

```text
TurtlePen capability search: "micro_mask" — 1 match(es)
micro_mask               [other] Apply or remove a reversible 1-design-pixel eraser stroke on an artwork path or image. This changes SVG presentation and renderHash but never deletes 5px quadrant geometry or changes collision validation. Points are absolute integer pixels in the canonical SVG drawing coordinate system.
```

## search_help: annotate

```text
TurtlePen capability search: "annotate" — 1 match(es)
annotate                 [workspace] Attach semantic model information to any existing node, relationship, text, image, or path without changing its geometry. Descriptions, technology, tags, properties, and perspectives persist in the document and are returned by describe.
```

## search_help: ascii

```text
TurtlePen capability search: "ascii" — 1 match(es)
ascii                    [other] Render the diagram as text at quadrant resolution — two characters per cell, with Excel headers. Use it to see what was actually drawn. Optionally marks colliding quadrants.
```

## search_help: view

```text
TurtlePen capability search: "view" — 11 match(es)
wireframe                [authoring] Lay a dimensioned area and its equipment onto the page, to scale. Authored in INCHES and converted at a declared scale, so the drawing is measurable rather than suggestive. Walls are drawn as walls and service clearance as bands around each unit, which means an encroachment reports as an ordinary collision — a unit too near a wall or another unit fails validate. Supply clearance values from the equipment listing and governing code; this tool invents none. Follow with export_prompt to brief an image model.
export_prompt            [file] Emit the composition brief for an image-generation model: the area in feet and inches, each item as a normalised box within it, its real size, its position in plain words, and its description. Read-only. Serves both kinds of model — one that accepts regional conditioning reads the numbers, one that only reads prose gets the same arrangement stated in words.
accept_finding           [review] Record a current finding as deliberate rather than an error — this is where intent is declared. Unknown or expired fingerprints are refused. The exact fingerprint and finding metadata remain auditable when geometry changes, and unaccept_finding withdraws the record.
inspect                  [review] Inspect exact claimed or visual lattice geometry without changing the document. Returns areas, perimeters, integer bounds, rational centers, pairwise shared quadrants, and bounding-box gaps for explicit element ids.
inspect_svg              [review] Read a strict SVG import report without changing the diagram. The compiler accepts only solid unstroked lattice rectangles and 5px hex-colour line/polyline/polygon/M-L-H-V-Z strokes; it reports their generated ids, exact quadrant bounds, and any explicitly requested nearest-lattice shifts. It never embeds, executes, or preserves raw SVG markup.
repair                   [review] Turn a finding's fix into the call that performs it. With no index it LISTS the fixes, saying which are one call away and which need a decision from you first. With an index it performs that fix through the same operations as any other mutation — rehearsable, undoable, and nothing it could not have done by hand. It does NOT guess: a fix that lacks the information to be performed (reroute, offset, hop, extend, rename, shorten) is refused by name with what is missing and which tool takes it, because inventing a plausible mutation you did not ask for is the failure this engine exists to prevent.
unaccept_finding         [review] Withdraw a previously recorded acceptance, putting the finding back in the open log.
validate                 [review] Validate the whole composition and return the severity-ranked collision log. This is the plan -> validate step: draw everything first, then check it as a unit. Findings carry a fingerprint for accept_finding.
define_view              [workspace] Create or replace a durable static, tag-filtered, or ordered dynamic view. Views project one shared model; they never duplicate diagram elements.
perceptual_review        [workspace] Record what a drawing LOOKS like, after rendering and looking at it. validate proves a drawing is structurally undefective; it cannot prove the drawing depicts what was asked for — a corpus once validated CLEAN while a sheep read as a stegosaurus and half-tone spots dithered into plus-signs. Nothing recorded here reaches collision geometry, and the structural and perceptual verdicts are returned side by side, never merged into one flag. A review binds to the renderHash that "render" returned, so editing the drawing afterwards marks the review stale instead of leaving a stale opinion looking current.
remove_view              [workspace] Remove a durable view definition without removing any shared model elements.
```
