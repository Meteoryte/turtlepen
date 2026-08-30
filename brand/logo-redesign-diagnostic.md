# TurtlePen MCP logo build diagnostic

Run: https://github.com/Meteoryte/turtlepen/actions/runs/33282801755

```text
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
TurtlePen capability search: "place_reference" — 1 match(es)
place_reference          [authoring] Lay an aspect-preserved image UNDER the drawing to trace over, checked for busy raster output and flagged by L020 until remove_page removes it. Dither is exact tonal lattice ink; simplify is a sparse perceptual approximation for sources whose literal dither is unreadable.

[search_help]
TurtlePen capability search: "artwork" — 5 match(es)
pen                      [authoring] Run a pen program. Each command draws and advances a cursor. Geometry always claims exact 5px quadrants. Set role="artwork" for open illustrations, optional hex color/width/cap for line ink, or paint="cells" for solid lattice artwork. Call turtlepen_help for the grammar.
stroke_to_path           [authoring] Materialise a path’s exact claimed quadrants as cell-painted artwork geometry. TurtlePen widths are at most one 5px quadrant, so this produces the only honest editable outline instead of inventing sub-lattice fractional geometry.
boolean                  [other] Combine two or more elements with exact lattice set algebra. action union, difference, intersection, or xor uses each element’s visual footprint by default and creates a cell-painted artwork path. This is not floating-point Bézier clipping: every output quadrant is explicit, collision-checked, persistent, undoable, and available to plan.
import_svg               [other] Import a strict, exact SVG subset as ordinary editable TurtlePen artwork paths. Source markup is compiled, never embedded or emitted verbatim: solid 5px-lattice rectangles become cell-painted paths, while 5px hex-colour line/polyline/polygon/M-L-H-V-Z strokes become exact rasterized paths. Unsupported curves, transforms, text, resources, styles, filters, masks, and scripts fail by name. Use inspect_svg or plan first; direct import participates in validation, history, save/open, and plan exactly like hand-authored geometry.
micro_mask               [other] Apply or remove a reversible 1-design-pixel eraser stroke on an artwork path or image. This changes SVG presentation and renderHash but never deletes 5px quadrant geometry or changes collision validation. Points are absolute integer pixels in the canonical SVG drawing coordinate system.

[search_help]
TurtlePen capability search: "overlay" — 2 match(es)
add_page                 [other] Add a Z-page. intent="exclusive" means nothing below may be overlapped (overlap is an error); intent="overlay" means overlap is expected and is reported as information. Choose deliberately — this is what stops annotation layers generating endless warnings.
reorder                  [other] Change an element’s presentation order within its page: bring_to_front, send_to_back, raise, lower, before, or after. Same-page collisions remain validation errors; use an overlay page and an accepted finding for deliberate stacking.

[search_help]
TurtlePen capability search: "stroke_text" — 2 match(es)
stroke_text              [authoring] Draw words as INK, in TurtleFont — quadrants on the lattice, not an SVG text run. Use it for titles, callouts, plotter output, and anything where the words must collide, measure exactly, and survive without a font file. It is a DISPLAY face: cap height is 6 quadrants (30px), because a stroke glyph smaller than that stops being legible once the lattice has quantised it — for 11px body text, keep using place_box labels. SIZE is the cap height in quadrants: 6 is 30px and the smallest that keeps every letter distinct, 12 is what the glyphs are drawn at, and anything between rounds (the result says whether it did). weight sets pen thickness independently, so a size can be light or bold. A character the face cannot draw is REFUSED, never skipped, so a missing glyph can never become a silent hole in a sentence — call font_coverage first if you are unsure.
font_coverage            [discovery] What TurtleFont can draw. With no argument it returns every glyph in the face grouped by block; given text, it returns only the characters that face CANNOT draw, which is the check to run before stroke_text on anything you did not type yourself.

[search_help]
TurtlePen capability search: "render" — 7 match(es)
measure_image            [file] Read real image dimensions and report the measured whole-cell footprint, aspect rounding, rendered-pixel scale, and dither/simplify quadrant-sampling scales. Call this BEFORE place_image. Reports say exactly whether each stage upscales, downscales, or stays exact; upscaling never creates detail.
render                   [file] Write the diagram to an SVG file. Text is emitted with textLength, so what is drawn cannot disagree with what was measured.
ascii                    [other] Render the diagram as text at quadrant resolution — two characters per cell, with Excel headers. Use it to see what was actually drawn. Optionally marks colliding quadrants.
glyph                    [other] Look at ONE glyph: a picture of its ink, its metrics, and a fingerprint of exactly which quadrants it covers. Use this when editing the face — two different stroke lists can rasterise to identical quadrants, so a source change is not proof of a drawing change, and the fingerprint is what tells the two apart. The picture reads in a terminal, so a glyph can be judged without rendering, opening and screenshotting an SVG.
micro_mask               [other] Apply or remove a reversible 1-design-pixel eraser stroke on an artwork path or image. This changes SVG presentation and renderHash but never deletes 5px quadrant geometry or changes collision validation. Points are absolute integer pixels in the canonical SVG drawing coordinate system.
set_background           [other] Set the paper colour for the whole drawing, or pass no colour to go back to the palette. Paper is document state rather than a render option: a drawing composed against dark paper is a different drawing, and re-rendering it light would misreport it.
perceptual_review        [workspace] Record what a drawing LOOKS like, after rendering and looking at it. validate proves a drawing is structurally undefective; it cannot prove the drawing depicts what was asked for — a corpus once validated CLEAN while a sheep read as a stegosaurus and half-tone spots dithered into plus-signs. Nothing recorded here reaches collision geometry, and the structural and perceptual verdicts are returned side by side, never merged into one flag. A review binds to the renderHash that "render" returned, so editing the drawing afterwards marks the review stale instead of leaving a stale opinion looking current.

[search_help]
TurtlePen capability search: "perceptual_review" — 1 match(es)
perceptual_review        [workspace] Record what a drawing LOOKS like, after rendering and looking at it. validate proves a drawing is structurally undefective; it cannot prove the drawing depicts what was asked for — a corpus once validated CLEAN while a sheep read as a stegosaurus and half-tone spots dithered into plus-signs. Nothing recorded here reaches collision geometry, and the structural and perceptual verdicts are returned side by side, never merged into one flag. A review binds to the renderHash that "render" returned, so editing the drawing afterwards marks the review stale instead of leaving a stale opinion looking current.

[new_diagram]
created "TurtlePen MCP — Creative Studio Mark" (150x128 cells) at /home/runner/work/turtlepen/turtlepen/brand/logo-redesign.turtlepen.json
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
error: ENOENT: no such file or directory, stat '/home/runner/work/turtlepen/turtlepen/brand/logo-redesign-target.jpg'
file:///home/runner/work/turtlepen/turtlepen/examples/logo-redesign-mcp.js:13
async function call(mcp,name,args={},print=false){ const r=await mcp.call(name,args); const body=r.error??r.text; if(print)console.log(`\n[${name}]\n${body}`); if(r.isError||r.error)throw new Error(`${name}: ${body}`); return body; }
                                                                                                                                                                                            ^

Error: measure_image: error: ENOENT: no such file or directory, stat '/home/runner/work/turtlepen/turtlepen/brand/logo-redesign-target.jpg'
    at call (file:///home/runner/work/turtlepen/turtlepen/examples/logo-redesign-mcp.js:13:189)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async file:///home/runner/work/turtlepen/turtlepen/examples/logo-redesign-mcp.js:32:3

Node.js v20.20.2
```
