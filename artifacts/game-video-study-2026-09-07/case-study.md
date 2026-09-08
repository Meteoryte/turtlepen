# Can TurtlePen supply a game art pipeline?

**2026-09-07 · Local feasibility study · Result: useful for an illustrated prototype;
source-game fidelity remains partial.** Three attempts completed; the initial attempt
counts in that budget. Best-known output is `attempt-03/`. No publication occurred.

## Evidence and method

The supplied `SORT/Recording 2026-09-07 023412.mp4` is a 75.712-second,
1344×680 Steam trailer recording identifying Sovereign Tower, WILD WITS / Curve Games.
Source SHA-256: `6F18F5D85DC6AA235CB610DDDBE49BEF46681ADD8B0F83C5F2D6F268557EF237`.
The original was preserved. Fifteen frames sample the recording at five-second
intervals, with a contact sheet and gameplay crops under `reference/`.

The study examined the court scene, character, Gothic architecture, dialogue panel,
map, rooms, and cycle/card UI. It authored four independent asset types and one
composition. `build-operations.mjs` emits integer-quadrant TurtlePen pen operations;
the registered local MCP authored attempt 1. Fresh isolated stdio MCP processes
authored retries against the changed source. No image generator or copied frame
pixels appear in exported assets. The temporary reference underlay was removed.

These are reference-guided reconstructions for a private experiment, not original
characters to republish. Fever Dream uses separate original artwork and fiction.

## Loop contract

Ad hoc LOOPBANK refinement, maximum **3 total attempts**. Judge recognizability,
solid fills, editable provenance, independent composition, structural defects, and
export size. Require a material change and observed output on each retry. Preserve
the baseline; stop on pass, stagnation, unsafe state, or budget exhaustion. Do not
change collision thresholds or acceptance requirements to improve the score.

| Attempt | Material change | Observed result |
|---|---|---|
| 1 | Author cathedral, knight, panel and map through MCP | Broad silhouette/palette recognizable. Thin rendered fill stripes needed an explicit cells workaround; downscaled row seams remained. Opaque export paper hid other layers. |
| 2 | Retain filled-region metadata; render filled ink solid; compact uniform-color vector strokes | No visible fill stripes in the scene. Thin open strokes remain thin. Full suite: 730/730 passed. Same authored quadrant positions, smaller SVG. |
| 3 | Native transparent SVG/PNG export, strict arguments and review profile | Browser composition works with three independent assets. PNG empty alpha is zero; foreground remains painted. Default opaque behavior preserved; PDF explicitly refuses transparent mode. |

Scene SVG: **290,779 → 136,538 bytes**, about **53% smaller**. This is a file-size
measurement, not a visual-similarity score. A dedicated regression also proves the
uniform baked-color branch compacts a long line without modifying stored geometry.
Final structural validation had zero S0/S1/S2 findings across all five outputs.
Each informational overlay overlap was adjudicated by its exact fingerprint and
named actors. Render-bound reviews retain P2 detail limitations; see `attempt-03/reviews.json`.

## What improved, and what did not

The pipeline defects were real engine issues: fill intent disappeared before painting;
uniform baked colors bypassed vector simplification; export always painted paper.
The fixes preserve integer geometry and leave source-coordinate choices with the author.
Old saved paths need regeneration to acquire fill metadata, or their existing cells
treatment. Transparent export does not make an authored translucent page opaque.

The illustrated knight still has a simpler face, hands, costume, and shading than
the reference. Architecture lacks painted irregularity; the map is sparse. Those
are unresolved art-direction/authoring issues. Structural PASS cannot measure them.
Native PNG linework is more visibly stepped than the SVG presentation at large scale.
The study does not establish character animation quality or production illustration fidelity.

## Could we make the game?

This proves a practical path for **original layered illustrated scenes, maps, dialogue,
and a small browser prototype**. It does not prove reconstruction of the source game's
quest logic, economy, simulation, animation, narrative volume, audio, saves, or production
scope. Reusable art layers reduce drawing work; they do not supply game systems.

The follow-through experiment is Fever Dream: a short original narrative task game.
It tests whether this art pipeline can sustain a complete beginning, escalation,
interaction loop, and ending. The subjective player experience still needs Chuck's playtest.

## Reproduce and inspect

Run `node serve.mjs` here; open `http://127.0.0.1:4318/`. Compare all attempts,
scrub the original video, toggle the character, advance dialogue, and use fullscreen/exit.
`attempt-01/sha256.json` records the preserved baseline. Retry operations, native
documents, PNG/SVG outputs, MCP runtime receipts and review results remain alongside
each attempt. `test/game-assets.test.js` contains targeted renderer regressions.
The engine's full release check and its exact limitations are in `final-check.log`.

Final check: **732/732 tests passed**, all eight existing release artifacts and governance
passed. The changed logo was freshly inspected and reviewed, retaining a P2 note for
legacy cell seams. `browser-check.log` verifies all three attempts × five assets,
layer toggling, dialogue, fullscreen, mobile width and actual video seek to 32.5 seconds.
`loop-ledger.json` confirms exact authored geometry is unchanged across all attempts.
The playable follow-through is [Fever Dream](../../../game-projects/FeverDream/README.md).
Run its local server and open `http://127.0.0.1:4319/`.
