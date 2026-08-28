# Strict lattice SVG import

`inspect_svg` and `import_svg` bring a narrow, exact SVG subset into a
TurtlePen document as ordinary editable artwork paths. The source markup is
compiled; it is never embedded, retained, or emitted verbatim. Imported
geometry therefore participates in `inspect`, boolean operations, slicing,
offsets, validation, `plan`, undo/redo, save/open, and normal SVG export.

This is not a lossy foreign-SVG viewer. If an input needs geometry that the
lattice cannot state honestly, TurtlePen refuses it by name before changing the
document.

## Inspect first

Use the read-only compiler report before importing:

```text
inspect_svg {
  source: "assets/logo.svg",
  prefix: "logo",
  quantize: "reject"
}
```

`source` may instead be inline `<svg>…</svg>` markup. The report lists
deterministic output IDs (`logo-1`, `logo-2`, ...), source-element provenance,
quadrant bounds, output area, and any explicitly requested coordinate shifts.

Then either import directly:

```text
import_svg { source: "assets/logo.svg", page: "base", prefix: "logo" }
```

or rehearse the exact same mutation:

```json
{
  "operations": [
    {
      "op": "import_svg",
      "source": "assets/logo.svg",
      "page": "base",
      "prefix": "logo"
    }
  ]
}
```

The direct tool and `plan` resolve file paths relative to the active diagram in
the same way. A source that fails in a plan fails before the live document is
changed.

## Exact supported subset

| SVG source | TurtlePen result |
|---|---|
| solid, unstroked `<rect>` with 5px-aligned edges | a cell-painted artwork path |
| `<line>` with a hex colour and 5px stroke | an artwork path with the exact rasterized line footprint |
| `<polyline>` or `<polygon>` with 5px stroke and `stroke-linejoin="round"` | an artwork path with exact rasterized segments |
| `<path>` containing only `M`, `L`, `H`, `V`, and `Z` commands under the same stroke rules | an artwork path with exact rasterized segments |

Filled rectangles need boundary coordinates and dimensions divisible by 5px.
Stroke points need to sit at quadrant centers: `2.5`, `7.5`, `12.5`, and so on.
Only 3- or 6-digit hex colours are accepted. All accepted strokes are exactly
5px wide; multi-segment strokes explicitly declare round joins, matching
TurtlePen’s renderer.

The default policy is `quantize: "reject"`. It preserves exactness by refusing
coordinates that do not land on the lattice. `quantize: "nearest"` is available
only as an explicit conversion choice; `inspect_svg` reports every source and
emitted coordinate that it shifts, and `import_svg` stores that report in its
receipt.

## Refused rather than silently changed

The compiler is fail-closed. It rejects unsupported tags and attributes,
including curves, arcs, text, transforms, CSS/style attributes, images,
external resources, `<defs>`, `<use>`, clipping, masking, filters, and active
content such as scripts or event handlers. It also refuses non-zero-origin
viewBoxes, multi-contour paths, filled arbitrary paths, non-5px strokes, and
centered rectangle outlines whose visual footprint cannot be represented
exactly by whole quadrants.

No raw SVG is added to a TurtlePen document. This keeps imported input out of
the live editor’s DOM and ensures the stored document has only the already
validated lattice paths it can measure and collide.

## Next boundaries

This establishes safe, editable interchange for lattice-aligned geometry.
Arbitrary Bézier editing, freeform knife cuts, affine transforms, SVG paint
servers, clipping/masks/filters, text outlining, and broad foreign-SVG
round-tripping remain separate design work. They need explicit semantics for
their visual geometry and collision footprint before they can join this exact
model.
