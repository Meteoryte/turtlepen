# TurtlePen product, fidelity, and tool audit

**Date:** 2026-08-25

**Status:** implemented on 2026-08-26; the audited baseline remains below for traceability

**Snapshot:** `acceptance-guard-and-depth` at `d02f4fd`, 18 commits ahead of local `main`

**Scope:** core model, MCP surface, persistence, validation truth, rendering,
viewer, shipped artifacts, benchmark posture, product position, and future tool
priorities

## Implementation outcome — 2026-08-26

The evidence snapshot below remains the audited baseline. The completion sweep
now implements every in-scope audit phase:

- schema 3 migrates schema-1/schema-2 documents and persists perceptual review,
  views, themes, linked resources, and semantic-finding acceptances;
- validation and the viewer distinguish blocking errors, S2 decisions,
  structural clearance, missing/stale review, perceptual blockers, and
  publishable state;
- runtime schemas reject unknown direct and nested-plan arguments at exact field
  paths;
- `runtime_info`, `doctor`, and searchable capability help derive version,
  schema, tool count, fingerprints, process start, and active document hashes
  from the running build;
- `connect`, `annotate`, and `inspect_model` add semantic node relationships,
  direct/orthogonal/curved routing, metadata, perspectives, and model
  completeness checks;
- the 1px eraser supports add/extend/replace/remove and continuous pointer
  strokes, reports full-mask coverage, and has deterministic SVG/PNG parity;
- atomic same-directory writes, backups, and expected-hash conflict refusal
  protect document, history, and export destinations;
- a native CLI validates/inspects, renders deterministic SVG/PNG/PDF, generates
  artifact manifests and static architecture bundles, and runs/scores benchmark
  adapters without fabricating missing perceptual evidence;
- one model now drives static, filtered, and ordered dynamic views with themes,
  perspectives, generated keys, labelled/outcome edges, four layout directions,
  and explicit pins;
- SVG semantics, viewer plan approval, semantic review, view switching, bounded
  history, and lazy canvas state close the accessibility/approval workbench gap;
- the current verified surface is 61 MCP tools and 613 passing tests.

The only unresolved items are external evidence, not missing in-scope product
implementation: no same-model comparative benchmark has been executed, and no
third-party provider icon pack was imported because licensing, provenance, and
SCANGATE approval are not available. Server/cloud/licensing administration
remains an explicit product exclusion.

## Executive conclusion

TurtlePen is already technically differentiated. It is not merely a drawing
library: it is an inspectable visual compiler with exact geometry, rehearsal,
machine-readable findings, durable acceptance evidence, history, and a local
review surface. The current branch exposes 47 MCP tools, has zero runtime or
development dependencies, and passed all 568 tests during this audit.

Its main constraint is now **product coherence and trust**, not a shortage of
primitives. Several parts of the product disagree about what is saved, what is
clean, which capabilities exist, and which build is running. Those mismatches
undercut TurtlePen's strongest promise: that an agent and a human can inspect
the same truthful state.

The recommended order is therefore:

1. repair persistence and status truth;
2. enforce tool schemas and make the running build identifiable;
3. generate documentation/release facts from one capability registry;
4. execute the existing benchmark instead of expanding it speculatively;
5. add workflow-closing outputs and semantics: CLI, PNG, accessibility,
   themes, and labelled edges;
6. turn the viewer into an approval workbench;
7. add high-fidelity editing, including the proposed **1px eraser**, as a
   reversible presentation mask rather than destructive vector surgery.

## Evidence snapshot

| Area | Verified state |
|---|---|
| Tests | `pnpm test`: 568 passed, 0 failed, about 4.1 seconds |
| Source MCP surface | 47 tools from `createTools(createSession())` |
| Connected MCP process | 45 tools; it was an older cached process and did not match the checked-out source |
| Help payload | 27,671 characters, 3,965 words, 600 lines |
| Tool-description payload | 14,277 characters before host-added metadata |
| Dependencies | zero runtime and zero development dependencies |
| Package/server version | package `0.2.0`; MCP `SERVER_INFO` still reports `0.1.0` |
| Document schema | schema 1, with exact-version refusal and no migration path |
| Branch drift | checked-out branch 18 commits ahead of local `main` |
| Documentation drift | README top says 568 tests/47 tools; the same README later says 35 tools; `status.md` says 318 tests/35 tools; endpoint coverage says 35 tools |
| Shipped diagrams | 52 documents; fresh validation produced 973 open findings: 16 S0, 13 S1, 172 S2, and 772 S3 |
| Artifact provenance | 11 forced saves, 431 accepted findings, and 5 stale acceptances across those documents |

The large artifact finding count does **not** mean all 52 files are failed
deliverables. The folder mixes examples, stress cases, historical evidence,
negative fixtures, and presentation artifacts without a manifest that says
which standard applies to each file. The classification gap is the defect.

## What is already strong

### Exactness is a real architecture, not branding

- Structural geometry is stored as whole 5px quadrants.
- Measurement precedes placement, so text fit and shortfalls are computed.
- Operations can be rehearsed through `plan`, then committed atomically.
- Findings have stable fingerprints, severities, concrete fixes, acceptance
  reasons, and staleness behavior.
- Connector seats, indexed ports, constraints, groups, layers, composition
  findings, fills, tone, image reduction, TurtleFont, and auto-layout all use
  inspectable state rather than hidden inference.
- The core test suite asserts exact footprints and the real MCP/viewer
  transports are exercised, not only imported functions.

### The product has an unusually credible agent workflow

The best loop is already visible:

`measure -> author -> rehearse -> validate -> adjudicate -> render -> review`

That loop is more defensible than a generic "AI diagram generator" pitch. It
supports deterministic repair, evidence-bound approvals, and human oversight.
The viewer can become a strong front end for that loop without turning into a
general-purpose freehand canvas.

### Zero dependencies is producing useful discipline

The hand-owned MCP transport, PNG decoder, geometry, history, and viewer avoid
install drift and make exact behavior easier to audit. Preserve this constraint
unless a measured benchmark shows that a dependency solves more risk than it
adds.

## P0 — trust and correctness repairs

### 1. Persist perceptual review state

`src/core/perceptual.js` attaches a review at `doc.perceptual`, but
`serialize()` and `deserialize()` in `src/core/document.js` omit it. A direct
round-trip probe during this audit showed:

- before serialization: `reviewed: true`, `clean: true`;
- serialized content: no `perceptual` field;
- after reopen: `reviewed: false`, `clean: false`.

This contradicts the module's documented promise that reviews survive reopen.
It also means a review recorded through the MCP can appear successful and then
vanish on the next process.

**Recommendation:** introduce schema 2 with explicit migration from schema 1.
Persist reviewer, findings, render hash, review date, note, and any adjudication
state. Keep staleness derived from the current render hash.

**Acceptance:** direct mutation, MCP mutation, save/reopen, undo/redo, history
sidecar restoration, and external-edit reload all preserve the same review;
editing the render marks it stale; schema-1 documents still open through a
tested migration.

### 2. Replace the overloaded `clean` boolean with a product state machine

`src/core/collide.js` sets `summary.clean` when S0 and S1 are zero. The save
gate in `src/core/index.js` blocks every finding except S3, including S2. The
viewer then displays a green **Clean** badge next to an open S2 badge. All
three behaviors follow their local definitions, but together they tell the
user two incompatible things.

**Recommendation:** expose named states instead of one boolean:

- `draft`
- `blocking-errors` (S0/S1)
- `needs-decisions` (open S2)
- `structurally-clear`
- `review-missing`
- `review-stale`
- `publishable`

Keep structural and perceptual verdicts separate in data, as they are now, and
derive the UI state explicitly from both.

**Acceptance:** no screen or tool can show "Clean" while save/render refuses;
every state has one definition shared by validation, gate, MCP response, and
viewer; tests cover every transition.

### 3. Enforce advertised MCP schemas at runtime

The tool schemas set `additionalProperties: false`, but `tools/call` currently
passes arguments to handlers without validating them. A direct probe passed
`unexpected_field` to `measure`; the call succeeded and silently ignored it.
For an agent-facing tool, a misspelled parameter must be a visible failure.

**Recommendation:** add a small, zero-dependency validator for the JSON Schema
subset TurtlePen publishes: required keys, additional properties, primitive
and union types, enums, number bounds, arrays, and nested objects. Apply it to
direct calls and to every operation nested inside `plan`.

**Acceptance:** unknown, missing, misspelled, wrong-type, and out-of-range
arguments fail with the tool/operation name and exact field path; direct and
planned calls reject the same inputs; every published schema has a positive and
negative real-stdio test.

### 4. Generate all capability and release facts from one registry

The checked-out source has 47 tools and 568 tests, while several user-facing
documents still say 35 tools and 318 tests. `package.json` is 0.2.0 while the
MCP handshake reports 0.1.0. The public/default branch was behind the active
branch during the audit. The connected MCP process was behind both.

**Recommendation:** create one capability registry that generates or verifies:

- MCP inventory and tool count;
- compact HELP topics and operation names;
- README capability tables;
- endpoint coverage;
- status facts;
- package/server version agreement;
- changelog/release checks.

Add `runtime_info` or `doctor` with loaded package version, tool count, build or
source fingerprint, document schema, process start time, active document hash,
and working directory.

**Acceptance:** CI fails on any count, operation, HELP, endpoint, or version
drift; the host can distinguish a stale MCP process from current source in one
call.

### 5. Make file persistence atomic and concurrency-aware

Document and history writes go directly to their destination. The MCP and
viewer can also hold separate in-memory copies of one file. The viewer watches
outside changes; the MCP process does not refresh before every mutation. Two
writers can therefore overwrite newer work with a valid but stale document.

**Recommendation:** write to a same-directory temporary file and atomically
rename; require an expected document hash/revision on mutation; refuse and
offer reload when disk changed; optionally keep one recoverable backup.

**Acceptance:** simulated interruption never leaves a partial JSON file; two
sessions cannot silently lose one another's edits; conflict responses include
the expected and actual revision/hash and a safe reload path.

## P1 — product leverage

### 6. Execute the benchmark that already exists

`benchmark/corpus-v1.json` freezes 16 tasks, but the benchmark README says no
execution harness, model runner, or result set exists. TurtlePen's central
product claim is therefore plausible but not yet measured.

Run the same model and task set through:

- TurtlePen;
- raw SVG;
- Mermaid;
- D2 when available.

Score structural validity, semantic correctness, perceptual quality, and
workflow cost separately. Record time, tokens/context, tool calls, retries,
open/accepted findings, human interventions, and final render quality. Do not
let a sparse but technically clean artifact win.

**Acceptance:** repeatable runner, frozen prompts/configuration, raw receipts,
holdout results, and a report that names where TurtlePen wins, loses, or merely
shifts cost.

### 7. Add an artifact manifest and quality contracts

Classify every file in `diagrams/` as one of:

- canonical deliverable;
- showcase;
- benchmark-positive;
- benchmark-negative;
- regression/stress evidence;
- historical/unreviewed.

Each class should declare allowed severities, force-save policy, perceptual
review requirement, and whether it is publishable. CI should validate against
that contract instead of pretending every artifact has the same purpose.

### 8. Make HELP compact and searchable

The current default HELP response is almost 4,000 words, before host-added tool
metadata. This makes discovery expensive and encourages agents to skip the
details they actually need.

**Recommendation:** `turtlepen_help` should return a compact workflow and topic
index by default, with `topic`, `query`, `operation`, and `full` options. Generate
operation lists from `core.OPERATIONS`; the current `plan` description already
lags operations it can execute.

**Acceptance:** default help is under a deliberate context budget; any tool,
rule, grammar term, or recipe is discoverable by query; registry and HELP cannot
drift.

### 9. Ship a native CLI

The package currently exposes only `turtlepen-mcp`. Add:

```text
turtlepen doctor
turtlepen validate <file> --json
turtlepen render <file> --format svg|png
turtlepen inspect <file>
turtlepen view <file>
turtlepen benchmark ...
```

This makes TurtlePen useful in CI and documentation pipelines without an MCP
host, and provides a direct diagnostic route for users.

### 10. Add deterministic PNG export

TurtlePen decodes PNG for image import, but the public render path emits SVG.
PNG closes the required "render, then look" loop for agents and makes CI
previews, issue attachments, and documentation publishing easier.

The first version should render exact lattice geometry and TurtleFont without a
browser dependency. If ordinary SVG text cannot be reproduced exactly, refuse
or require conversion through `stroke_label` rather than silently omitting it.
Return the same render hash discipline used by perceptual review.

### 11. Add accessible document semantics

The SVG root has no authored title/description or ARIA contract, and TurtleFont
paths are visually legible but semantically invisible.

Add document title, description, diagram type, reading order, element labels,
and relationship descriptions. Emit `<title>`, `<desc>`, and appropriate ARIA
metadata without changing geometry. A text-as-path label must retain its text
as semantic metadata.

### 12. Add document-owned themes and semantic tokens

Raw hex values per element do not scale to coherent diagrams. Add serialized,
document-owned tokens and roles such as paper, ink, surface, border, accent,
muted, success, warning, danger, title, body, annotation, and connector states.
Theme resolution must be deterministic and visible in `describe`.

### 13. Make edges first-class semantic objects

Paths already record source/targets for layout, but product-quality diagrams
need authored relationship type, label, decision outcome, label segment/anchor,
and label-clearance checks. This is more valuable than another shape primitive:
it improves semantics, accessibility, layout, and model-to-multiple-views use
cases at once.

### 14. Extend layout where evidence is strongest

Add TB/BT/LR/RL directions, pinned nodes, stable incremental layout,
per-container direction, labelled-edge clearance, and explicit lanes. Every
layout should support preview/diff and report reversals or stranded routes.
Avoid an opaque router that spends many turns hiding the decisions the current
system exposes.

## P1 experiment — 1px eraser / micro-mask

### Product value

A 1px eraser would materially improve illustration cleanup, imported-image
touch-up, stroke lettering, and small visual corrections. It is especially
useful where deleting an entire 5x5 quadrant removes too much. The current path
renderer already accepts 1–5px presentation widths, so the renderer can express
this visual scale.

The eraser is nevertheless an architectural feature. TurtlePen's editable and
collision-aware geometry is a 5px quadrant. Destructively cutting a 1px channel
through `path.pieces` would make stored geometry claim one thing while its
internal pixels mean another, or would force the entire collision engine down
to a new resolution.

### Recommended design

Expose **Eraser** in the viewer, but store it internally as a reversible
`micro-mask` on a separate presentation plane.

- "1px" means one integer **design pixel in the SVG viewBox**, equal to one
  fifth of a quadrant—not one physical monitor pixel. Zoom and export scaling
  must not change its meaning.
- Store integer design-pixel mask strokes with explicit target element/page,
  ordered points, width, cap, and stable id.
- Apply the mask in SVG and future PNG rendering. Do not mutate the target's
  quadrant pieces.
- Keep collision, routing, selection geometry, and structural findings based on
  the unmasked quadrant footprint. A visual eraser must never manufacture a
  false structural pass.
- Make masks visible in `describe`, selection state, history, and plan diffs.
  The UI should show a **Masked** badge and allow restore/remove-mask.
- Any mask changes the render hash and makes the perceptual review stale.
- Restrict v1 to artwork paths and imported images. Refuse boxes, connectors,
  arrowheads, ordinary labels, and TurtleFont semantics until there is evidence
  for a safe contract.
- Keep structural deletion separate: a future `erase_quadrants` operation may
  remove whole claimed quadrants, but it is not the 1px tool.

Suggested internal/API vocabulary:

```text
micro_mask create  { id, target, points:[[x,y],...], width:1, cap:"round" }
micro_mask extend  { id, points:[[x,y],...] }
micro_mask replace { id, points:[[x,y],...], width }
micro_mask remove  { id }
```

The viewer may label this simply **Eraser**. The durable state should retain
the more honest `micro-mask` name so downstream tools know it is non-destructive.

### Eraser acceptance criteria

1. A 1-design-pixel mask removes exactly one pixel row/column in the canonical
   SVG viewBox and scales deterministically at export.
2. Save/reopen, undo/redo, MCP `plan`, viewer edits, and outside reload preserve
   the identical mask.
3. Applying, extending, replacing, and removing the mask use one core operation
   path and are atomic.
4. Structural validation is byte-identical before and after a micro-mask;
   perceptual render hash is not.
5. SVG and PNG outputs apply the same mask and produce deterministic bytes.
6. `ascii` states that sub-quadrant masks are not represented; `describe`
   reports their exact target and design-pixel bounds.
7. Hit testing remains usable at zoom, and the pointer is converted to integer
   design pixels without hidden rounding.
8. Erasing every visible pixel does not silently delete the element; the viewer
   identifies the fully masked element and offers explicit remove/restore.
9. Unsupported semantic targets are refused by name.

### Why not build it first

The eraser expands fidelity, but the current schema already drops perceptual
review state. Adding another durable state type before schema migration and
round-trip tests would compound the persistence risk. Build it after P0 items
1–4 and preferably alongside PNG so both renderers share the mask contract.

## Viewer direction

The desktop viewer is restrained and usable, but it should become an
**agent-approval workbench**, not an Excalidraw clone.

Recommended surface:

- Inspect, Findings, Layers, History, and Review tabs;
- before/after plan overlay;
- exact operation diff with Approve, Reject, and Undo;
- current structural state and perceptual review freshness;
- one-click safe repairs and finding focus;
- eraser/micro-mask controls only when a supported target is selected;
- mobile bottom sheet instead of placing the entire inspector below the canvas.

State transport also needs to scale. During the browser audit, a modest diagram
state was about 0.19 MiB while an image-heavy document was about 4.44 MiB. The
viewer broadcasts full state, including SVG and ASCII, after mutations. Split
document metadata, render, findings, and heavy inspection data; use revision
deltas, ETags/render caching, and lazy panel fetches.

History currently stores complete serialized snapshots, up to 100 by default.
For a multi-megabyte image document this can become hundreds of megabytes.
Measure real histories, then add compression, content-addressed snapshots, or
diff storage if the evidence warrants it.

## Product position and strongest use cases

The most defensible position is:

> **A verified visual compiler for agents.**

Best-fit use cases:

1. auditable process, workflow, and architecture diagrams;
2. dimensioned field-service plans and procedural documentation;
3. font-free plotter/stroke output where geometry must remain inspectable;
4. human-approved CI and documentation pipelines;
5. one semantic system model rendered into multiple views.

Illustration and photo approximation are valuable stress tests and optional
capability packs. They should not displace the verified-diagram core unless the
benchmark shows a durable user advantage.

## Maintainability recommendations

The largest files are now `src/mcp/tools.js` (2,332 lines),
`src/core/index.js` (1,541), `document.js` (896), `collide.js` (798), and
`pen.js` (795). Size alone is not failure, but capability inventory, handlers,
help prose, schemas, and persistence policy are accumulating in a few modules.

Refactor only behind existing exact tests:

- capability registry plus generated tool/help docs;
- operation modules grouped by domain, still collected into one
  `core.OPERATIONS` registry;
- versioned document codecs/migrations separate from live model behavior;
- persistence adapter for atomic write/hash conflict policy;
- renderer-neutral presentation model shared by SVG/PNG and micro-masks.

Do not split files merely to reduce line count. Split where one generated source
can eliminate drift or one boundary can make a contract independently testable.

## Delivery sequence

### Phase 1 — truthful state

Perceptual persistence, status state machine, schema enforcement.

### Phase 2 — coherent runtime and release

Capability registry, `runtime_info`/`doctor`, version agreement, atomic writes,
conflict detection, artifact manifest.

### Phase 3 — measured product proof

Benchmark harness, baseline executions, holdout report, cost and quality data.

### Phase 4 — workflow completion

CLI, PNG, accessible exports.

### Phase 5 — semantic fidelity

Themes/tokens, first-class labelled edges, layout directions and pins.

### Phase 6 — approval workbench

Plan diffs, review freshness, focused repairs, incremental/lazy viewer state.

### Phase 7 — visual fidelity

1px micro-mask eraser, followed by evidence-backed domain packs and additional
layout capabilities.

## External comparison sources used

These sources were used for capability and product-pattern comparison, not to
copy screens, code, wording, or trade dress:

- [D2 export formats](https://d2lang.com/tour/exports/)
- [D2 command line](https://d2lang.com/tour/man/)
- [D2 roadmap: aesthetics and layout](https://d2lang.com/tour/future/)
- [Mermaid accessibility](https://mermaid.js.org/config/accessibility.html)
- [Mermaid theming](https://mermaid.js.org/config/theming)
- [Graphviz output formats](https://graphviz.org/docs/outputs/)
- [Structurizr DSL model and views tutorial](https://docs.structurizr.com/dsl/tutorial)
- [TurtlePen public repository](https://github.com/Meteoryte/turtlepen)

## Audit receipt

- Read the project contract and relevant core, MCP, viewer, benchmark, docs,
  artifact, and package surfaces.
- Ran the full test suite: 568/568 passed.
- Counted the checked-out source tools and HELP payload directly.
- Probed perceptual-review serialization and unknown-argument handling directly.
- Revalidated all 52 diagram documents through the current core.
- Inspected the desktop and mobile viewer in a real browser during the product
  audit; screenshots were retained in the workspace audit output directory.
- The connected TurtlePen MCP was used read-only for help discovery. Its 45-tool
  inventory was stale relative to the 47-tool checked-out source, so source and
  fresh direct-runtime probes were used for current facts.
- No TurtlePen source, diagram, status, release, or external service was changed
  by this audit.
