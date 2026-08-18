# Imaging capability — ready-to-run prompts

Companion to [`imaging-capability-roadmap.md`](imaging-capability-roadmap.md).
One prompt per todo, each self-contained enough to paste into a fresh session.

**Every prompt inherits these preconditions** — they are stated once here rather
than repeated in each:

> Read `llm.md`, then `README.md`, then `status.md` before changing anything in
> `src/core/`. Preserve every invariant in `llm.md` — integer geometry, no silent
> geometry change, one code path for measurement and rendering, fingerprinted
> acceptance, `plan` and tools sharing `core.OPERATIONS`, all-or-nothing batches,
> zero runtime dependencies, nothing on stdout but protocol messages. Add tests
> asserting **exact** quadrant sets or pixel counts, never approximate ones. Run
> `pnpm run check` and report the tally. If a capability becomes reachable by an
> agent, `HELP` in `src/mcp/tools.js` must name it at the moment of need — a
> feature documented only in `status.md` is invisible.

---

## T1 — PNG output from `render`  ·  EVIDENCED  ·  do first

```
Add PNG output to TurtlePen's render path.

Context: `src/core/png.js` exports `decode` only. `render` emits SVG, and there
is no supported way for an agent inside an MCP session to actually look at what
it drew — the documented workflow now ends "render -> LOOK AT IT" on the first
page of the help, and that step currently requires a browser and a static file
server driven by hand.

Build `render { path, format: "png", scale }`:

- Encode with `node:zlib` deflate. The existing decoder proves the codec is
  ownable; do not add a dependency, and do not shell out to a browser.
- Rasterise geometry only: paint every claimed quadrant as a scale*5 px block,
  plus artwork polylines with their stored colour, width and cap. Render text as
  a labelled placeholder rectangle.
- That text limitation is a documented, visible limitation, not a silent
  partial: name it in the tool description AND in HELP, and state it in the
  render tool's return value so the caller sees it at the moment of use.
- `format` defaults to inferring from the path extension; an explicit `format`
  that contradicts the extension is an error, not a silent preference.

Acceptance: the PNG's painted blocks correspond exactly to the quadrants
`describe` reports for the same document; output is byte-identical across two
runs of the same document; `pnpm run check` green.

Before you start, tell me whether you think text-as-placeholder is the right
call, or whether embedding a 10px monospace bitmap font is worth the glyph data
so that text rasterises exactly as `measure` computed it. Recommend one.
```

---

## T2 — Fill a closed path  ·  EVIDENCED

```
Give TurtlePen the ability to fill a closed path.

Context: `disc` is the only filled primitive, and it is filled only because the
midpoint algorithm produces a solid region directly. `polygon` and `triangle`
are outline-only, and there is no scanline or flood fill anywhere in src/. In a
recent authoring session this meant three cow spots had to be circles: an
irregular filled patch was not expressible without hand-computing a bitmap,
which HELP explicitly warns is the long way round.

Add a `fill` modifier to closed-path pen commands, accepting:
  fill                 solid, current ink
  fill "#rrggbb"       solid, that colour
  fill tone <t>        density fill, reusing src/core/tone.js unchanged

Requirements:

- Scanline-fill in QUADRANT space. The filled interior is an exact quadrant set
  that claims, collides and validates like any other element. A fill that lands
  on another element is a correct L001 — do not special-case it away.
- `fill tone` must go through the existing absolute-position Bayer matrix, so a
  filled region tiles seamlessly against an adjacent toned shape. Assert that:
  a `fill tone half` region must produce an identical quadrant set to a `disc`
  of matching geometry at `tone: half`.
- Refuse to fill a path that is not closed, with a named error. An open path has
  no defined interior and guessing one is exactly the silent decision this
  engine exists to prevent.
- Pick even-odd winding, document it in HELP, and test it with a donut: a ring
  drawn as an outer and inner loop must leave the hole empty.
- Do NOT reach for opacity to soften a fill. L019 exists to catch geometry that
  claims quadrants it no longer visibly inks.

Acceptance: exact interior quadrant sets asserted in test/pen.test.js; the
donut case; the tone-parity case; `pnpm run check` green.
```

---

## T3 — Tone legibility finding  ·  EVIDENCED  ·  cheap

```
Add a finding for toned regions too small for their density to read.

Evidence: a radius-2-quadrant disc at tone "half" dithers to a 5-quadrant
plus-sign. It reads as a glyph, not as a value. The collision log was CLEAN
while three cow spots rendered as plus-signs; the defect was only found by
rasterising the SVG and looking at it.

Add an S2 finding: a toned element whose region is below the size at which its
tone is distinguishable from a shape. Fix text should name both real remedies —
raise the tone to solid, or grow the region.

Calibrate the threshold against the existing `diagrams/` corpus the way C001 was
calibrated, and say in your report which existing diagrams trip it. If real
diagrams trip it, the threshold is wrong — do not ship a rule that reclassifies
past work, and do not move a threshold to suit one drawing.

Also add the fix kind to the closed set: llm.md requires every fix.kind the
engine emits to have a tool that applies it, asserted by test/edit.test.js.
```

---

## T4 — Hatch and stipple as authoring fills  ·  INFERRED  ·  after T2

```
Promote hatching from renderer decoration to an authoring fill style.

Context: src/core/svg.js already defines hatch-dense and hatch-sparse, but only
to decorate findings by severity. An author cannot request a hatch. For the
technical drawings already in diagrams/ — the HVAC field guide, the minisplit
elevation — flat tone reads as "shaded" where hatch reads as "this material".

Extend the T2 fill primitive (do not add a parallel feature):
  fill hatch <angleDeg>
  fill crosshatch <angleDeg>
  fill stipple <density>

Hatch lines are real inked quadrants on the lattice, generated deterministically
from absolute position so two hatched regions meeting at an edge stay in phase —
the same property tone has. Assert that phase property in a test.

This is INFERRED, not evidenced: no authoring session has demanded it yet. Say
so in status.md, and do not build it before T2 exists.
```

---

## T5 + T6 — Document palette, then a contrast finding  ·  INFERRED

```
Add a document-level colour palette to TurtlePen, then a contrast finding.

Part 1 — palette. Every colour today is a raw hex literal at the call site.
Add `set_palette { name: "#rrggbb", ... }` as a core operation (it must be in
core.OPERATIONS so `plan` can rehearse it and history can undo it), and let
`color:` and `fill` accept a palette name as well as a hex literal. An unknown
name is a named error, never a silent fallback to black. Palette must survive
serialization — it is document state, like wireframe and perspective_scene
metadata. Recolouring a multi-page document should be one edit.

Part 2 — contrast finding, only once part 1 lands. An S2 for ink too close to
the page ground or to the element beneath it. State the contrast model you chose
and why before implementing it; if you cannot justify a threshold, build part 1
and stop, and say that part 2 needs a model rather than shipping a guessed one.

Cross-check against brand/logo.turtlepen.json — if the palette cannot express
the existing brand colours cleanly, the palette design is wrong.
```

---

## T7 — Colour-quantised `place_image`  ·  INFERRED  ·  after T2

```
Add colour-quantised output to place_image.

Context: mode "dither" currently quantises to 1-bit through a 4x4 Bayer matrix.
Add an n-colour quantised mode so photographic source art can land as coloured
lattice artwork. Most of the supersample and coverage machinery in
src/core/dither.js carries over.

Non-negotiable: L023 exists because geometry cannot know its subject. Colour
makes a heuristic approximation LOOK more authoritative while being no better
informed. Raise L023 at least as loudly for quantised colour as for simplify —
if anything, raise it harder, and say why in the finding text.

Determinism is the acceptance test: the same source, span and palette size must
produce a byte-identical quadrant set across runs, and must survive save,
reopen, validate and render. Assert it the way the existing supersample trials
in examples/ do.
```

---

## Sequencing and honesty note

Build **T1**, then **T3** (T1 makes T3 checkable), then **T2**. T4 and T7 are
extensions of T2 and must not precede it. T5/T6 are independent.

T1–T3 are backed by recorded authoring friction. T4–T7 are inferred from the
code and from what the existing `diagrams/` corpus contains — they are
reasonable, but `status.md` is explicit that future work wants observed evidence
rather than a speculative list. Treat the INFERRED items as candidates awaiting
a session that actually needs them, and record that status honestly rather than
promoting them once they are written down.
