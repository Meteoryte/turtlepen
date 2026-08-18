# Flowchart support — plan of record

**Raised:** 2026-08-18, from a failed authoring attempt plus two ProcessOn sources.
**Status:** F0, F1, F6, F8 built and green. F2, F3 not built. F7 stands as shipped.
This line was originally written claiming more than had been done; it is
corrected here rather than quietly, because a plan that overstates itself is
the same defect as a validation log read before the last edit.

## Why this exists

Gemini 3.x was asked to reproduce a standard decision flowchart in TurtlePen.
It produced `diagrams/important-process.svg`, and the result is instructive:

- **Every decision node is a rectangle.** The engine has no diamond. Looking at
  the emitted path — `M420,150 H650 L655,155 V195 L650,200 …` — those are boxes
  with a 5 px chamfer, not decisions. A flowchart whose judgements are not
  diamonds is not a flowchart; it is a stack of labelled boxes.
- **It did not render the SVG until asked**, and therefore never looked at its
  own output.
- **It declared the work finished with three overlaps still open**, because
  nothing forced it to validate the finished state.

Its own account of the friction — worth keeping, because it is real evidence:

> "Blind coordinate system & dynamic text spans … I had to repeatedly infer the
> bounding box right-edge from the validation logs."
> "A lot of the L014 path discontinuity warnings occurred because my sequence of
> commands logically brought the pen to a specific side of a cell, but my next
> instruction assumed the pen was centered."
> "All of the NO decision branches returned to the fix node on the left side …
> This resulted in massive stroke overlaps."
> "I initially tried to use `hop to [coord]` … it only jumped a single cell and
> the destination coordinate was ignored by the parser."

Three of those four are **capability gaps, not user error**. That is the bar for
building: `status.md` requires observed authoring evidence, and this is it.

## Sources

- ProcessOn, *How to draw a flowchart* — symbol vocabulary and the four drawing
  rules. https://www.processon.io/blog/introductiontoflowcharts-en-us
- ProcessOn product surface — diagram types and feature set.
  https://www.processon.io/

### What the symbol vocabulary actually is

| Symbol | Meaning | Conventional shape |
|---|---|---|
| Step / Process | the basic action, named with a verb phrase | rectangle |
| Judgment / Decision | branches the process on a test | **diamond** |
| Start / End | terminator | **stadium** (rounded ends) |
| Sub / other process | enters another process and returns | rectangle, **double side bars** |
| Relationship | ordered connection | arrow |
| Fork / Join | one step to many, many to one | **bar** |
| Swimlane | which role or system performs the step | **lane band** |
| Notes | extra context for an activity | annotation |
| External event | something outside the process occurs | — |
| Grouping | names an un-split sub-process | **container** |

### The four drawing rules

1. Know what each symbol means.
2. Order runs left→right, top→bottom (other orders are legal, not default).
3. **One beginning**; zero or many ends.
4. **Avoid intersections.** One arrow per path. No connector bends without a reason.

Rules 3 and 4 are checkable. In a project whose thesis is *every defect is a
ranked finding*, they should be findings, not advice.

---

## Scope: what is honestly in and out

`processon.io` is a collaborative SaaS. "Implement everything from this page"
cannot be taken literally, and pretending otherwise would be the speculative
roadmap this project already warns against.

**In scope** — the parts that are diagram-substrate capability:

- the flowchart symbol vocabulary (F1)
- the drawing rules, as mechanical findings (F2)
- swimlanes and grouping containers (F3)
- honest completion behaviour (F0)

**Out of scope, with reasons:**

| Their feature | Why not |
|---|---|
| Real-time collaboration, cross-device sync, accounts | TurtlePen is a local MCP server holding one document. This is a product, not a substrate capability. |
| Export to PPT / Word / Excel | Each needs an OOXML writer. Zero runtime dependencies is a stated design choice; three office writers is not a rounding error. **PNG export is the export gap that matters** and is already tracked as T1 in the imaging roadmap. |
| Import from Visio / Xmind | Large proprietary parsers. Revisit only if someone actually needs it. |
| Mermaid / Markdown import | *Genuinely interesting* and the closest fit — Mermaid `flowchart` maps almost 1:1 onto F1 + F2. Deferred as **F9**, not rejected. |
| AI one-click generation | TurtlePen's caller already is the AI. |
| 13 diagram types (Gantt, fishbone, ERD…) | Most are layout conventions over shapes that F1/F3 provide. Build the vocabulary, not thirteen bespoke generators. |

---

## The work

### F0 — Completion is render + validate — **DONE**

The cheapest fix and the one that would have caught Gemini's failure.

`llm.md`, `README.md` and `HELP` now state that a drawing is not delivered until
it has been rendered *and* validated at its final state, and that the SVG is part
of the deliverable rather than an extra produced on request. Adjudicate or accept
every finding; "mostly clean" is not done.

### F1 — Flowchart node shapes — **DONE**

The core gap. Implemented by generalising the mechanism that already exists.

A box's corner style already distinguishes **claimed** (the bounding box it
reserves) from **visual** (where ink actually lands), and the collision engine
already treats a stroke through a corner cut as information rather than an
error. A diamond is the same idea with a bigger cut.

- `claimedQuads` is unchanged — a node still reserves its bounding box, so
  layout, gutters and free-space reasoning are untouched.
- `shapeCutQuads(r, shape)` generalises `cornerCutQuads`.
- `visualQuads = claimed − cuts`, shape-aware.
- Cardinal ports need no special case: a diamond's vertices are exactly the
  N/E/S/W midpoints of its bounding box.

Shapes: `process` (default), `decision`, `terminator`, `subprocess`, `io`,
`prep`, `data`, `document`, `manual`, `bar`.

**Text capacity must be shape-aware.** A diamond's usable width at its vertical
centre is about half its bounding box. Reporting a label as fitting because the
*bounding box* is wide enough would reintroduce exactly the overflow bug this
project exists to eliminate.

### F2 — Flowchart rules as findings — **NOT BUILT**

- `F001` **S1** — more than one start terminator with no inbound edge.
- `F002` **S1** — a decision node with fewer than two outgoing branches.
- `F003` **S2** — an unlabelled branch leaving a decision.
- `F004` **S2** — a process node whose label does not begin with a verb phrase.

Opt-in per document via page intent `flowchart`, so existing diagrams are not
retroactively reclassified — the `C001` calibration lesson applied.

Designed, not implemented. `F004` in particular needs a verb list, and a rule
that guesses at English grammar is worse than no rule.

### F3 — Swimlanes and grouping containers — **NOT BUILT**

`lane` and `group` container shapes: a titled band that claims its region but
carves an interior so member nodes sit inside without an `L001`.

Deliberately left out of the shape release. Every other shape keeps claiming
its full bounding box, which is what makes F1 safe. A container must claim
only its frame, and that is a change to the claimed model itself — the one
thing L001 rests on. It deserves its own pass, not a ride-along.

### F6 — Rebuild `important-process` properly — **DONE**

Built by `build_flowchart.js`: 51 elements, 0 findings, 9 decisions, 3
terminators. The script exits non-zero if anything above INFO remains, so the
chart cannot be committed in the state the previous attempt was left in.

The reference flowchart, redrawn with real diamonds and terminators, as proof
the vocabulary works. Replaces the rectangles-only attempt.

### F7 — Logo v2 — **DONE, and left alone**

The mark on the easel draws the previous mark, via `place_image
mode:"simplify"` on a `drawing` Z-page stacked beneath the pen. That version
stands.

A second attempt rebuilt the turtle itself out of this release's shape
vocabulary — hexagon shell, terminator head — on the reading that a "v2 mark"
should be new artwork. It was mechanically clean and visually dead, and was
reverted. Recorded because the lesson generalises: **the shape vocabulary is a
diagram substrate, and reaching for it to do illustration produces geometry, not
character.** The revert is in git history if the direction is ever wanted.

### F8 — Repo page shows its work — **IN PROGRESS**

The README links a PDF but shows none of it. Embed real rendered examples.

### F4 — `hop to <address>` — **DEFERRED**

Gemini reported `hop to [coord]` parsing but ignoring the destination. Real, but
the honest fix may be to **reject** the form rather than implement it: the engine
refuses by name rather than quietly doing something adjacent, and a hop that
silently travels one cell is exactly that failure. Needs a decision on which,
and that decision is Chuck's.

### F5 — Auto-routing lanes — **DEFERRED**

Gemini's "traffic jam" — every NO branch returning to one node — is the strongest
case for routing help. But `llm.md` is explicit that auto-routing, if added, must
emit pen commands so the path stays inspectable. That is a design task, not an
afternoon, and it should not be rushed in behind a shape release.

### F9 — Mermaid `flowchart` import — **DEFERRED**

The one import worth having. Blocked on F1/F2 landing first, since it would
compile straight onto them.

---

## Order

```
F0 (contracts)  ──▶ F1 (shapes) ──▶ F2 (rules) ──▶ F3 (lanes) ──▶ F6 (rebuild)
                                                                      │
F8 (README examples)  ────────────────────────────────────────────────┴──▶ commit
```

F0 first because it is cheap and it is the behaviour that failed. F1 before
everything else because F2, F3, F6 and F9 all compile onto it.
