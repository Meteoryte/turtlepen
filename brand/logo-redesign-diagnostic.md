# TurtlePen MCP logo build diagnostic

Run: https://github.com/Meteoryte/turtlepen/actions/runs/33279714316

```text
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

[search_help]
TurtlePen capability search: "reference trace artwork" — 0 match(es)

[search_help]
TurtlePen capability search: "layers overlay" — 1 match(es)
add_page                 [other] Add a Z-page. intent="exclusive" means nothing below may be overlapped (overlap is an error); intent="overlay" means overlap is expected and is reported as information. Choose deliberately — this is what stops annotation layers generating endless warnings.

[search_help]
TurtlePen capability search: "circle disc arc" — 0 match(es)

[search_help]
TurtlePen capability search: "text measure" — 5 match(es)
stroke_label             [authoring] Label a box with INK rather than an SVG text run, so the whole drawing survives without a font file and can go to a plotter. The label is its OWN element: it collides like any other stroke and can be moved or removed on its own, and the box keeps whatever <text> label it already had (pass an empty label to place_box if you want only the ink). The text area comes from the SYMBOL, so a diamond leaves far less room than its bounding box — and because cap height is 6 quadrants, inked labels need much bigger nodes than <text> ones. It measures and REFUSES with numbers rather than shrinking or spilling.
stroke_text              [authoring] Draw words as INK, in TurtleFont — quadrants on the lattice, not an SVG text run. Use it for titles, callouts, plotter output, and anything where the words must collide, measure exactly, and survive without a font file. It is a DISPLAY face: cap height is 6 quadrants (30px), because a stroke glyph smaller than that stops being legible once the lattice has quantised it — for 11px body text, keep using place_box labels. SIZE is the cap height in quadrants: 6 is 30px and the smallest that keeps every letter distinct, 12 is what the glyphs are drawn at, and anything between rounds (the result says whether it did). weight sets pen thickness independently, so a size can be light or bold. A character the face cannot draw is REFUSED, never skipped, so a missing glyph can never become a silent hole in a sentence — call font_coverage first if you are unsure.
measure                  [discovery] Measure text BEFORE placing a box. Returns advance width, characters per line, wrapped line count, and the cell span the label actually needs. Use this to size boxes rather than estimating. Pass the shape you intend to draw: a symbol carves its label area out of the box, so the span a diamond or a cylinder needs is not the span the raw text needs.
render                   [file] Write the diagram to an SVG file. Text is emitted with textLength, so what is drawn cannot disagree with what was measured.
restyle                  [other] Change a box's label, node shape, corner style, text alignment, font size, or fill. This is the tool behind the "shorten", "font" and "shape" fixes; it re-measures the label.

[search_help]
TurtlePen capability search: "render look perceptual_review" — 1 match(es)
perceptual_review        [workspace] Record what a drawing LOOKS like, after rendering and looking at it. validate proves a drawing is structurally undefective; it cannot prove the drawing depicts what was asked for — a corpus once validated CLEAN while a sheep read as a stegosaurus and half-tone spots dithered into plus-signs. Nothing recorded here reaches collision geometry, and the structural and perceptual verdicts are returned side by side, never merged into one flag. A review binds to the renderHash that "render" returned, so editing the drawing afterwards marks the review stale instead of leaving a stale opinion looking current.

[new_diagram]
created "TurtlePen MCP — Artist Turtle Capability Splash" (150x125 cells) at /home/runner/work/turtlepen/turtlepen/brand/logo-redesign.turtlepen.json
pages: base (z:0, exclusive)

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

[measure_image]
error: ENOENT: no such file or directory, stat '/home/runner/work/turtlepen/turtlepen/brand/brand/logo-v2-source-mark.png'
file:///home/runner/work/turtlepen/turtlepen/examples/logo-redesign-mcp.js:27
  if (r.isError || r.error) throw new Error(`${name}: ${body}`);
                                  ^

Error: measure_image: error: ENOENT: no such file or directory, stat '/home/runner/work/turtlepen/turtlepen/brand/brand/logo-v2-source-mark.png'
    at call (file:///home/runner/work/turtlepen/turtlepen/examples/logo-redesign-mcp.js:27:35)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async file:///home/runner/work/turtlepen/turtlepen/examples/logo-redesign-mcp.js:73:3

Node.js v20.20.2
```
