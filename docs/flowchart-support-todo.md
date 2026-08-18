# Flowchart support — plan of record

**Raised:** 2026-08-18, from a failed authoring attempt plus two ProcessOn sources.
**Status:** F0–F6 and F8–F10 built and green. F7 stands as shipped. Nothing
from the ProcessOn scope remains unbuilt.
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

### F2 — Flowchart rules as findings — **PARTLY BUILT**

Built, in `src/core/flowchart.js`:

- `F001` **S1** — more than one terminator with nothing leading into it.
- `F002` **S1** — a decision with fewer than two ways out.

**Self-activating.** The rules wake up as soon as a document contains a
`decision` or `terminator`. No flag was needed, and nothing in the existing
corpus is reclassified, because every node in it is a plain `process`. This is
better than the page-intent gate originally sketched here: `intent` means
overlap semantics, and overloading it with a document genre would have muddied
a field that already has a job.

**Edges are authored fact, not proximity.** `pen from <id>.<face>` now records
its origin alongside the target `line to <id>.<port>` already recorded, so
"which edges leave this node" is something the author wrote down. A test asserts
that strokes merely passing beside a decision are not counted as its branches.

Not built, and deliberately:

- `F003` unlabelled branch — deciding that a floating "NO" belongs to one edge
  rather than another means reading intent out of proximity. The honest route is
  to let an author *name* a branch, and check the recorded name; that is a
  grammar addition, not a rule.
- `F004` verb-phrase process labels — would mean shipping an English grammar.

A rule that guesses is worse than no rule: it teaches the author to ignore the
log, which is the exact failure this engine exists to design out.

### F3 — Swimlanes and grouping containers — **DONE**

`lane` and `group` container shapes: a titled band that claims its region but
carves an interior so member nodes sit inside without an `L001`.

Built, and the deferral reason above turned out to be overstated. A container
claiming a ring instead of a slab is **not** a change to the claimed model:
`L001` still compares claimed sets. It is a per-element fact, the same kind that
a corner cut already is, one level up.

What it did expose was a real latent bug. `L001` gated on **bounding-box**
overlap and only then computed the claimed intersection for its cell list — so
for solid boxes, where the two are identical, it had never mattered. It now
tests the claimed intersection itself and reports the true shared quadrant
count rather than the bounding-box area. All 369 existing tests passed
unchanged, which is the evidence that it was a strict correction.

Semantics, pinned by test:

- a container reserves its title band and border ring, never its hole;
- a member inside collides with nothing — the whole point;
- a node **straddling the frame still reports `L001`**, because it does cross
  the border;
- nesting a group inside a lane is legitimate and silent;
- flow crossing a lane border is a real `L004`, and is what `accept_finding`
  exists for: handing over is what a swimlane depicts.

`L013`'s message was corrected too — a path through a lane's hole was being
described as passing through a "corner cut", which is the mechanism but not the
truth.

Proof: `build_swimlane.js` → `diagrams/swimlane-order-handling.svg`, 17
elements, 0 findings above INFO, 4 lane-crossings accepted with a reason.

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

### F8 — Repo page shows its work — **DONE**

The README links a PDF but shows none of it. Embed real rendered examples.

### F4 — `hop to <address>` — **DONE (refused by name)**

Confirmed in source: the `hop` case never read `cmd.to`, so `hop to <address>`
parsed, hopped one quadrant, discarded the target, and left the overlap it was
meant to clear still reported.

Resolved by **refusing it by name**, which the engine's own rule already
required — a mode that is named but not built must refuse rather than quietly do
something adjacent. The error names the working form instead. This is strictly
better than the silent-wrong behaviour and forecloses nothing: implementing
hop-to-target routing later remains open, and is the larger design question that
belongs with F5.

### F5 — Auto-routing — **DONE (as a proposal)**

`src/core/route.js` + `route` (tool 38). The condition `llm.md` attached is the
whole design: it **emits a pen program and changes nothing**. The author reads
it and runs it through `pen` like anything they wrote, so it validates
identically and no path exists in a document that nobody can account for.

Deliberately not a general router. It tries the three shapes a person would draw
— straight, one turn, two turns — against everything already claimed on the
page, and when none is clear it says so and **names the obstacle**. A twelve-turn
path that technically avoids everything is not a connector anyone can follow.

One thing had to be derived rather than reasoned: a `line` leaves the cursor ON
its last quadrant, so a following `corner` can re-ink it and raise `L015`. Which
`align` pair avoids that depends on the turn and is not guessable, so every pair
was run through the pen and the clean ones kept as a table. Emitting a program
that trips a rule the moment it runs would make the router worse than useless.

### F9 — Mermaid `flowchart` import — **DONE**

`src/core/mermaid.js` + `import_mermaid` (tool 37).

It is a **compiler, not a second way to build a document**: it returns
operations and changes nothing, so the caller rehearses with `plan`, reads the
log, and commits. An import therefore faces the same validation as hand-drawn
work and cannot produce geometry the normal path could not. A test asserts every
emitted operation is one the engine already has, and another asserts that a
decision imported from Mermaid still trips `F002` if it does not branch.

Node brackets map onto the symbol vocabulary; longer delimiters are tried first,
because `([x])` matching the `[x]` rule would silently turn a terminator into a
process box — a wrong diagram that validates perfectly.

**It lays out a spine; it does not route**, and it says so, naming the edges that
are not a straight drop. Routing stays with F5 and with the author.
`subgraph`, `classDef`, `style` and `click` are refused by name; dropping half a
diagram and reporting success is the failure this project treats as a defect.

---

## Order

```
F0 (contracts)  ──▶ F1 (shapes) ──▶ F2 (rules) ──▶ F3 (lanes) ──▶ F6 (rebuild)
                                                                      │
F8 (README examples)  ────────────────────────────────────────────────┴──▶ commit
```

F0 first because it is cheap and it is the behaviour that failed. F1 before
everything else because F2, F3, F6 and F9 all compile onto it.

---

## F10 — Perceptual review layer — **DONE**

Added 2026-08-18 from the Forge-authored *TurtlePen Evaluation, Perceptual QA
and Benchmarking Prompt Pack v1.0*, which independently reached this session's
conclusion and cited the farm-animal failures as its calibration examples.

`src/core/perceptual.js`. The containment argument is the design:

- probabilistic judgement never enters collision geometry — a test asserts that
  attaching a review leaves the collision log byte-identical;
- structural and perceptual verdicts are returned side by side and there is
  **no combined boolean**, because collapsing them loses the only case that
  matters: a clean log over the wrong picture;
- a review is bound to the `renderHash` of the bytes the critic actually saw, so
  editing the drawing makes the review visibly **stale** — the acceptance
  fingerprint discipline applied to opinions;
- categories, severities and repair classes are closed sets, refused by name;
- an unreviewed document is `reviewed: false`, never `clean: true`. Absence of
  review must not read as a pass.

**Reachable.** `perceptual_review` is tool 36, `render` now returns the
`renderHash` a review binds to, and `HELP` carries a PERCEPTUAL REVIEW section —
so the loop `render -> LOOK -> perceptual_review` is one an agent can actually
follow. Recording a review goes through `core.OPERATIONS`, so `plan` can rehearse
it and history can undo it; a mutation only the tool layer could perform would be
invisible to rehearsal.

Two existing contract tests caught the addition and both were right to: the
documented tool count is asserted, and `endpoints.test.js` requires every
advertised tool to complete a representative use case over real stdio. The
perceptual loop is now exercised there end to end.

---

## F11 — Executable repairs — **DONE**

`src/core/repair.js` + `repair` (tool 39). From the Qwen 0.5B runs, which named
"translating finding fixes into mutation calls" as something the interface
assumes the caller can do unaided. It is the most mechanical of those gaps,
which is why it was worth closing first.

A finding's fixes become calls: `widen`/`heighten` → `resize`, `font`/`shape` →
`restyle`, `move` → `move`, `canvas` → `set_canvas`, `intent` → `update_page`,
`remove`/`remove_page` → their own. Everything goes through `OPERATIONS`, so a
repair is rehearsable, undoable, and can do nothing a caller could not have done
by hand.

**It refuses to guess.** `reroute`, `offset`, `hop`, `extend`, `rename` and
`shorten` are advice by nature — where a path should go instead, or which words
to cut, is a design decision — and each is refused by name with what is missing
and which tool takes it. A repair also reports whether the finding count
actually fell, because applying a fix and making progress are not the same
thing and the caller should not have to assume.

Still open from that list: no-progress detection, unique-id maintenance, and
resisting premature "done" — the last of which `HELP` now addresses in prose but
nothing enforces.

## F12 — No-progress detection — **DONE**

`src/core/progress.js`, surfaced through `validate`. The second of the Qwen
gaps: "recognizing no-progress loops" is something a stronger model does by
noticing and a weaker one does not do at all, and nothing told either.

Three consecutive checks with edits between them and the **same finding set**
appends a NO PROGRESS note. The digest hashes finding identities rather than
counting them, because fixing one finding while introducing another leaves the
count unchanged and is not standing still.

It watches the sequence of attempts, never the drawing — so it advises, never
blocks, and never becomes a collision rule. Validating twice without editing is
not stagnation, a clean document is never nagged, and swapping one finding for
another reads as movement. A guard that cries wolf teaches you to ignore it,
which is worse than not having one, so the quiet cases are tested as carefully
as the loud one.

Remaining from the Qwen list: unique-id maintenance, and resisting premature
"done" — which `HELP` now addresses in prose but nothing enforces.
