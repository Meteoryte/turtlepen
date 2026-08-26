# TurtlePen imaging capability roadmap — shading, colour, infill, rasterisation

**Status:** implemented baseline as of 2026-08-26. T1 and T2 are complete; the
remaining inferred extensions require new authoring evidence. Historical
proposal language is retained below as the decision record.
**Raised:** 2026-08-17, out of the five-farm-animals authoring session.
**Scope:** authoring-side imaging capability only. No change to the integer
lattice, to acceptance fingerprinting, or to "the engine never silently changes
geometry".

`status.md` says future work needs *new observed authoring evidence rather than
extending this list speculatively*. This document exists because a real
authoring session produced that evidence. Every item below is tagged:

- **EVIDENCED** — I hit this directly while drawing, and the friction is recorded.
- **INFERRED** — it follows from what the code does today, but no session has
  demanded it yet. Do not build an INFERRED item before an EVIDENCED one.

---

## 1. What TurtlePen already has (verified in source, not assumed)

Read this first. Two of the four things the request asked for partly exist, and
proposing them from scratch would duplicate working code.

| Capability | State | Where |
|---|---|---|
| Density shading (tone) | **Built.** `tone` 0.0625–1 via a 4×4 Bayer matrix keyed to absolute lattice position, plus `feather` falloff and `texture:"eroded"`. Toned shapes ink *and claim* fewer quadrants, so collision stays honest. | `src/core/tone.js` |
| Colour on artwork paths | **Built.** `pen` takes `color` (3/6-digit hex), `width` 1–5, `cap`. Presentation-only; stored integer pieces remain the collision geometry. | `src/core/pen.js`, `llm.md` |
| Colour on boxes and text | **Built.** The pen grammar's `fill <#hex>` token sets a box fill and a text colour. | `src/core/pen.js:136,274,284` |
| Filled disc | **Built.** `disc <r>` — midpoint circle, filled. | `src/core/shapes.js` |
| Raster **in** | **Built.** `place_image` (`embed` / `dither` / `simplify`), `place_reference`, `measure_image`, 4× supersampling, PNG decode on `node:zlib` alone. | `src/core/image.js`, `dither.js`, `png.js` |
| Pattern along a path | **Built.** `pattern: "dashed" \| "dotted"`, keyed to distance travelled so it survives a corner. | `src/core/pattern.js` |
| Raster **out** | **Built.** Deterministic SVG/PNG/PDF output shares measured text layout and renders symbols, gradients, paths, views, images, and masks without a runtime dependency. | `src/core/output.js`, `src/core/index.js` |
| Fill of an arbitrary closed path | **Built.** `fillInterior` applies an even-odd lattice fill; `pen ... fill` refuses open outlines and supports flat or across-region gradient colour. | `src/core/raster.js`, `src/core/pen.js` |
| Hatching as an authoring control | **MISSING as authoring.** `hatch-dense` / `hatch-sparse` exist in `svg.js` but only as renderer-internal decoration for finding severity. An author cannot request a hatch. | `src/core/svg.js:67–68` |

**The one-line summary:** colour, density shading, closed-region area, and
portable raster output are implemented. Hatching, named palettes, measured
colour contrast, and colour-quantised image placement remain evidence-gated
candidates rather than committed scope.

---

## 2. The evidence from the farm-animals session

Recorded so the proposals below are traceable to something real.

1. **Cow spots (EVIDENCED).** I wanted three solid black patches on the cow's
   flank. The only filled primitive is `disc`, so the spots are three discs.
   Anything non-circular — a proper irregular Holstein patch — was not
   expressible without hand-computing a bitmap, which the help explicitly warns
   is "the long way round".
2. **Half-tone at small radius (EVIDENCED).** `tone:"half"` on a radius-2
   quadrant disc dithers to a 5-quadrant plus-sign, not a grey blob. Tone has a
   size floor below which it reads as a glyph rather than a value, and nothing
   warns about it. I found it only by rasterising and looking.
3. **Rasterisation was a manual side-quest (EVIDENCED).** To see the drawing I
   had to run a static HTTP server and drive headless Chrome, because `render`
   emits SVG, the Read tool cannot display SVG, `file:` URLs are blocked in the
   browser tooling, and the Playwright MCP backend wedged. The workflow the help
   now puts on page one — *render, then LOOK AT IT* — has no supported path to
   the "look" step from inside the MCP session.
4. **Sheep fleece (EVIDENCED, weakly).** Fleece is drawn as outline zigzag
   because there is no way to fill a region with a texture. It worked, but the
   first attempt read as a stegosaurus, and a "fill this closed shape with a
   wool texture" primitive would have been the direct expression.

---

## 3. Proposed work, highest value first

### T1 — `render` gains PNG output — **COMPLETE**

**Implementation update:** `render` and the CLI emit deterministic PNG and PDF
in addition to SVG. Native raster uses `layoutTextRuns`, real symbol
silhouettes, gradients, path styles, view keys, image fit, and micro-masks. The
proposal below is retained to show why this capability was prioritized; the
placeholder-text compromise was not required.

**Why first:** it closes the loop the help now opens with. Every other item on
this list is easier to verify once an agent can see its own output.

`render { path: "x.png", format: "png", scale: 2 }`. Encode with `node:zlib`
deflate — the decoder already proves the codec is ownable — so the zero-runtime-
dependency rule holds.

The hard part is not PNG; it is that the current renderer emits SVG text with
`textLength`, and text rasterisation needs glyph outlines. Two honest options:

- **T1a (recommended, small):** rasterise **geometry only** — every claimed
  quadrant is a 5×5 px block, plus artwork polylines. Text renders as a labelled
  placeholder box. This is exactly what `ascii` already gives, at pixel
  resolution and in colour. Ship it as `format: "png"` with a documented
  limitation, not as a silent partial.
- **T1b (larger):** embed a monospace bitmap font at the fixed 10 px size so
  text rasterises exactly as measured. `measure` already owns a monospace
  advance model, so this stays consistent with "measurement and rendering share
  one code path" — but it means shipping glyph data.

**Do not** shell out to a browser. That is what I had to do by hand, and it
would put an external binary in the dependency path of a zero-dependency
project.

**Acceptance:** a PNG whose 5×5 blocks land on exactly the quadrants `describe`
reports; byte-identical across runs; `pnpm run check` green.

---

### T2 — `fill` for a closed path — **COMPLETE**

**Implementation update:** closed outlines use an exact even-odd fill over
quadrants, claim their interior, and support flat or across-region gradient
colour. Open outlines are refused. Exact fill and rendering behavior is covered
by raster, artwork, output, MCP, and persistence tests.

`pen ... polygon A B C ... fill` (and `fill tone <t>`, `fill "#hex"`).

Scanline-fill the interior of a closed path in **quadrant** space, so the filled
region is an exact quadrant set that claims, collides, and validates like every
other element. Reuse `tone.js` so `fill tone half` dithers through the same
absolute-position Bayer matrix and therefore tiles seamlessly against an
adjacent toned shape — the property the help calls out explicitly.

**Constraints that must hold:**

- Refuse to fill a path that is not closed. An open path has no defined
  interior; guessing one is the kind of silent decision this engine exists to
  prevent. Emit a named error, not a best guess.
- A filled shape claims its interior. That is a **behaviour change** for
  collision: a fill sitting over another element becomes an `L001`, correctly.
- Self-intersecting paths need a stated winding rule (even-odd is the
  predictable choice) documented in `HELP`, not left to discover.

**Acceptance:** exact interior quadrant sets asserted in `test/pen.test.js`;
`fill tone` output identical to the same tone applied to a `disc` of matching
geometry; a filled ring (donut) resolves correctly under even-odd.

---

### T3 — Tone legibility finding — **EVIDENCED, cheap**

A new composition-class finding, severity **S2**: *toned region below the size
where its density is readable*. Below roughly 4×4 quadrants a mid-tone dithers
into a recognisable glyph (my radius-2 half-tone became a plus-sign) rather than
a value.

This is a two-hour rule that would have caught, in the log, a defect I only
found by rasterising and looking. It fits the existing severity model exactly:
report the shortfall, name the fix (`raise the tone to solid, or grow the
region`), change nothing.

**Watch out:** the threshold must be calibrated against `diagrams/` the way
`C001` was, and not chosen to suit one cow.

---

### T4 — Hatching and stipple as authoring fills — **INFERRED**

`fill hatch <angle>`, `fill crosshatch`, `fill stipple`. The renderer already
owns hatch patterns for finding severity, so the visual vocabulary exists; this
promotes it to something an author can ask for.

Genuinely useful for technical drawing — section cuts, material callouts, the
HVAC field guides already in `diagrams/` — where flat tone reads as "shaded" but
hatch reads as "this material". **But no session has asked for it yet.** Build
T2 first; hatch is a fill *style*, so it should be a parameter of the fill
primitive rather than a separate feature.

---

### T5 — Palette and named colours — **INFERRED**

Today every colour is a raw hex literal at the call site. A document-level
palette (`set_palette { ink: "#2b2a26", accent: "#7a5c2e" }`, then
`color: "accent"`) would make a multi-page document recolourable in one edit and
keep brand colours consistent with `brand/logo.turtlepen.json`.

Low risk — it is a naming indirection over a field that already exists. Low
urgency for the same reason.

---

### T6 — Contrast / legibility check on colour — **INFERRED**

If T5 lands, a finding for *ink too close to the page or to the element beneath
it* is a natural companion, and is squarely in the spirit of a project whose
thesis is that defects should be measured rather than eyeballed. Needs a stated
contrast model before it is worth building.

---

### T7 — `place_image` gains colour-quantised output — **INFERRED**

`place_image mode:"dither"` currently produces black-and-white lattice runs. An
`n`-colour quantised mode (dither to a small palette rather than to 1-bit) would
let photographic source art land as *coloured* lattice artwork. The supersample
and coverage machinery from `dither.js` mostly carries over.

Flag: `L023` exists because geometry cannot know a subject. Colour quantisation
makes an approximation *look* more authoritative while being no better
informed — so it must raise `L023` at least as loudly, not less.

---

## 4. Sequencing record

```
T1 (PNG out) ──▶ T3 (tone legibility)      cheap, and T1 makes it checkable
     │
     └────────▶ T2 (closed-path fill) ──▶ T4 (hatch as a fill style)
                        │
                        └──────────────▶ T7 (colour-quantised dither)

T5 (palette) ──▶ T6 (contrast finding)     independent, do when convenient
```

**T1 and T2 are complete.** The diagram above records the original dependency
logic, not an active implementation order. T3–T7 remain candidates and must
earn fresh evidence before construction; writing them down did not authorize
them.

## 5. What must not change

Restated from `llm.md`, because every item above touches ink and it would be
easy to erode one of them:

- Integer geometry. A fill is an exact quadrant set or it is not a fill.
- No silent geometry change. A fill that cannot be computed is a named error.
- `tone` changes *what is inked*; `opacity` does not. Do not let a colour or
  fill feature reintroduce opacity as a way to make an overlap disappear —
  `L019` exists to catch exactly that.
- Zero runtime dependencies. PNG encode must be `node:zlib`, not a library.
- A capability documented only in `status.md` is invisible. Nothing here ships
  until `HELP` names it at the moment of need.
