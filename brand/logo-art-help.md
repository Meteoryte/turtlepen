# TurtlePen MCP help — artistic logo rebuild

## Orientation

```text
TurtlePen — verified visual authoring on an integer lattice.

WORKFLOW
  measure -> plan (rehearse) -> approve/commit -> validate + inspect_model
          -> render -> LOOK -> perceptual_review -> save

  A structurally clear drawing can still depict the wrong thing. The absence of a review is not a pass.
  Reviews bind to renderHash and become stale
  after presentation changes. Every deliberate structural or model finding needs
  a fingerprinted acceptance reason.

CORE FACTS
  1 cell = 10px; 1 quadrant = 5px; all geometry is integer-exact.
  Addresses use Excel columns: C4, C4.tl, C4.q1. The canvas grows right/down.
  Use pen from <id>.<face> for attached connectors; gateway.S#2 selects an
  indexed face seat. Use connect for semantic direct, orthogonal, or
  explicit-waypoint curved relationships.

DISCOVERY
  search_help { query: "dynamic views" }   compact live capability search
  turtlepen_help { section: "all" }        full pen grammar and rule manual
  doctor                                     runtime/schema/registry checks
  runtime_info                               version, hashes, and tool count

RECOVERY AND OUTPUT
  plan with format:"json" returns an exact object diff before commit.
  history supports status/undo/redo/clear. Saves are atomic and hash-guarded.
  The CLI validates, inspects, renders SVG/PNG/PDF, builds documentation bundles,
  creates artifact manifests, and runs or scores benchmark receipts.

PERCEPTUAL REVIEW
  render returns renderHash. Look at the artifact, then call perceptual_review.
  micro_mask provides reversible 1-design-pixel cleanup on artwork and images.

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

## drawing from a source trace reference recognizable real object

```text
TurtlePen capability search: "drawing from a source trace reference recognizable real object" — 0 match(es)
```

## place_reference authoring reference trace remove page

```text
TurtlePen capability search: "place_reference authoring reference trace remove page" — 1 match(es)
place_reference          [authoring] Lay an aspect-preserved image UNDER the drawing to trace over, checked for busy raster output and flagged by L020 until remove_page removes it. Dither is exact tonal lattice ink; simplify is a sparse perceptual approximation for sources whose literal dither is unreadable.
```

## artwork freeform organic illustration

```text
TurtlePen capability search: "artwork freeform organic illustration" — 0 match(es)
```

## artwork path curves curve arc circle polygon triangle disc

```text
TurtlePen capability search: "artwork path curves curve arc circle polygon triangle disc" — 0 match(es)
```

## pen program ray turn arc turtle commands drawing

```text
TurtlePen capability search: "pen program ray turn arc turtle commands drawing" — 0 match(es)
```

## paint cells filled artwork scan convert shape

```text
TurtlePen capability search: "paint cells filled artwork scan convert shape" — 0 match(es)
```

## layers overlay illustration page intent z order

```text
TurtlePen capability search: "layers overlay illustration page intent z order" — 0 match(es)
```

## text measure font wordmark typography

```text
TurtlePen capability search: "text measure font wordmark typography" — 0 match(es)
```

## image trace simplify dither embed reference difference

```text
TurtlePen capability search: "image trace simplify dither embed reference difference" — 0 match(es)
```

## render showGrid background transparent crop bounds margin

```text
TurtlePen capability search: "render showGrid background transparent crop bounds margin" — 0 match(es)
```

## perceptual_review look render review workflow

```text
TurtlePen capability search: "perceptual_review look render review workflow" — 0 match(es)
```

## inspect artwork geometry bounds

```text
TurtlePen capability search: "inspect artwork geometry bounds" — 0 match(es)
```

## group transform rotate scale duplicate array artwork

```text
TurtlePen capability search: "group transform rotate scale duplicate array artwork" — 0 match(es)
```

## path_edit normalize_path offset_path stroke_to_path

```text
TurtlePen capability search: "path_edit normalize_path offset_path stroke_to_path" — 0 match(es)
```

## boolean slice artwork illustration

```text
TurtlePen capability search: "boolean slice artwork illustration" — 0 match(es)
```
