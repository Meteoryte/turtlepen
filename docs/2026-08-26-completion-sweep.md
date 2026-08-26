# TurtlePen full audit and Structurizr completion sweep

**Started:** 2026-08-26

**Trigger:** Chuck requested implementation of the entire product-audit backlog
and every remaining Structurizr adaptation slice.

**Rollback checkpoint:** Git commit `5deeae6` on
`acceptance-guard-and-depth`.

## Completion constitution

### Primary objective

Make TurtlePen a coherent, local, verified visual compiler: an agent or human
can define one durable semantic model, derive inspectable views, preview and
approve changes, save without silent conflict or partial writes, and publish
accessible deterministic artifacts from the CLI, MCP server, or viewer.

### Critical workflows

1. Create/open → edit/rehearse → validate/inspect → review → save/recover.
2. Define one semantic model → create filtered/dynamic/perspective views →
   resolve notation/key → render without changing model meaning.
3. Inspect a pending plan → compare exact changes → approve/reject → undo/redo.
4. Validate/render/inspect/bundle from a native CLI without an MCP host.
5. Apply and restore exact 1-design-pixel masks through core, plan, viewer,
   SVG, PNG, persistence, and history.
6. Classify shipped artifacts and execute/ingest reproducible benchmark runs
   without presenting synthetic or unavailable external results as evidence.

### Supporting systems in scope

- document schema and migrations;
- atomic persistence, conflict detection, backup, and history sidecars;
- MCP schemas, runtime diagnostics, capability/help generation, and stdio;
- semantic views, themes/tokens, relationship inspections, documentation, and
  architecture-decision resources;
- SVG/PNG/PDF exporters and static workspace bundles;
- layout directions, pins, lanes, and labelled-edge clearance;
- viewer state transport, tabs, review/approval, accessibility, responsiveness,
  and reduced motion;
- artifact contracts, benchmark harness, documentation, tests, and release
  consistency gates.

### Stable areas to preserve

- integer-quadrant collision geometry;
- measurement-before-placement and shared text-measurement path;
- explicit, inspectable routing/layout decisions;
- transactionality of operations and fingerprinted acceptance;
- zero runtime dependencies;
- existing diagram/source compatibility;
- local-only viewer security boundary and serial mutation ordering.

### Explicit exclusions

- Structurizr cloud/server administration, licensing, and provider trade dress;
- remote theme or icon downloads;
- hidden geometry inference, silent auto-fit, proportional fonts, negative
  addressing, or non-quarter-turn core rotation;
- fabricated competitor/model benchmark results. Comparative model runs require
  the same externally callable model/tool environment and explicit raw receipts.

### Evidence and risk classification

- **Risk:** medium. TurtlePen stores local persistent files and can overwrite
  user work, but has no accounts, payments, tenancy, or remote production data.
- **Activated modules:** file handling/import/export, local real-time
  synchronization, AI tool execution, versioning/migration, accessibility,
  performance, failure injection, and rollback/recovery.
- **External evidence:** the existing EFPRD/SCANGATE research receipt in
  `2026-08-25-structurizr-adaptation-plan.md` supports the Structurizr pattern
  adaptations. This sweep makes no new customer-demand or market-position claim.

## Interface thesis

- **Visual thesis:** a quiet paper-and-ink engineering workbench where status
  colour is scarce, semantic structure is inspectable, and the diagram remains
  the dominant surface.
- **Content plan:** compact document/status rail → full canvas → tabbed
  Inspect/Findings/Views/History/Review context → explicit plan comparison and
  continuation actions.
- **Interaction thesis:** selection/finding focus preserves spatial context;
  plan preview reveals before/after without mutating; operation and review
  state transitions are brief and respect reduced motion.

## Initial feature disposition

| Audit/adaptation area | Disposition | Completion condition |
|---|---|---|
| Perceptual persistence/state/schema enforcement | Repair/retain | Regression and migration gates remain green. |
| Capability registry/searchable HELP/doctor | Complete | Runtime, docs, tool inventory, operations, and versions cannot drift silently. |
| Atomic conflict-aware persistence | Complete | Interrupted and concurrent writes fail recoverably with expected/actual hashes. |
| Artifact contracts | Complete | Every tracked shipped diagram has a checked quality classification. |
| Benchmark execution system | Complete boundary | Repeatable runner, receipt schema, scorer, holdout guard, and report; unavailable external model executions stay explicitly blocked, never fabricated. |
| CLI and SVG/PNG/PDF export | Complete | Commands work without MCP; exporters are deterministic and refuse unsupported fidelity explicitly. |
| Accessible semantics | Complete | Authored document/element/relationship meaning survives in SVG and bundles. |
| Themes/tokens/views/key | Complete | Durable deterministic resolution, filtering, sequences, perspectives, and notation key. |
| Documentation/ADRs/static bundle | Complete | Explicit relative resources and generated offline index/artifacts. |
| First-class edges/layout | Complete | Labels/outcomes and four directions, pins, lanes, previews, and clearance evidence. |
| Approval workbench/lazy state | Complete | Discoverable tabs, plan comparison, approve/reject, revision-safe mutation, recoverable failures, and bounded payloads. |
| 1px eraser | Complete | Add/extend/replace/remove, pointer conversion, history, full-mask truth, SVG/PNG parity, and target refusal. |
| Server/cloud/admin and provider icon packs | Reject/Investigate | Remain outside local verified-compiler scope; no misleading product surface. |

## Change-impact ledger

| Change | Impact | Before | Intended after | Main risks | Rollback/check |
|---|---|---|---|---|---|
| Persistence adapter | Data-affecting, cross-workflow | Direct destination writes; stale MCP can overwrite disk | Same-directory atomic replace, expected-hash conflict refusal, recoverable backup | Windows rename behavior, false conflicts, history drift | `5deeae6`; interruption/concurrency/undo/reopen tests |
| Schema 3 workspace model | Data-affecting | Schema 2 elements plus masks/perceptual state | Versioned views/theme/resources/model review with 1→2→3 migration | Legacy loss or malformed metadata | Migration fixtures and byte-meaning assertions |
| Renderer/export split | Shared, accessibility/performance | SVG only; full state carries SVG+ASCII | Accessible SVG plus deterministic PNG/PDF; lazy render/ascii endpoints | Renderer disagreement, large payloads | exact render tests, browser state-size checks |
| Capability/help/CLI | Shared, cross-workflow | Tool prose and public counts can drift | Runtime-derived searchable help, doctor and CLI | circular registry or stale static docs | inventory/drift/real-process tests |
| Viewer workbench | Cross-workflow, accessibility | One inspector column and full-state broadcasts | Context tabs, view switching, plan approval, review, lazy artifacts | lost drafts/selection, keyboard regressions | WebSocket/browser/keyboard/responsive tests |

## Validation matrix

This table is updated with observed evidence during stabilization.

| Workflow | Happy path | Invalid input | Failure state | Persistence | Resume/retry | Status/confidence |
|---|---|---|---|---|---|---|
| Edit/validate/review/save | Direct and MCP edit → validate/model-inspect → render-hash review → atomic save pass | Unknown fields, invalid acceptances, and unsupported mutations fail at their exact paths | Stale disk hash refuses overwrite with expected/actual evidence | Document, review, and bounded history survive reopen; prior destination is retained as `.bak` | Reload, undo/redo, and retry paths pass, including Windows existing-file replacement | **Pass — high**; full tests, stdio endpoints, and showcase rebuild |
| Semantic model and views | Schema-3 model resolves static, filtered, dynamic, perspective-styled views and generated keys | Invalid view types, filters, resources, tags, directions, pins, and references are refused | Semantic findings remain separate from geometry and lapse after repair | Schema 1/2 migrate to 3 without geometry rewrite; views/theme/resources/acceptances round-trip | Shared model is unchanged by view switching; resource removal never touches its target | **Pass — high**; migration, workspace, SVG, MCP, and viewer tests |
| Plan approval | Browser and MCP rehearse on a copy, report exact object changes, then explicitly approve | Malformed operations and stale expected hashes are refused | Reject leaves the source byte-identical; failed composite plans remain atomic | Approved changes use the normal guarded document/history path | Rehearse again after any revision; undo/redo remain available | **Pass — high**; unit/WebSocket tests plus desktop browser rehearsal |
| CLI/export/bundle | Doctor, validate, inspect, SVG/PNG/PDF, manifest, docs bundle, worksheet/run/score execute without MCP | Missing paths, bad formats, unsupported configs, and blocked publishes fail visibly | Unreviewed perceptual state remains unreviewed; `--enforce` does not manufacture clearance | Outputs use same-directory durable replacement; manifests use repository-relative paths | Deterministic rerun yields stable bytes for fixed inputs | **Pass — high** for native paths; external benchmark execution intentionally absent |
| 1px eraser | Add/extend/replace/remove and continuous pointer drag mask exactly one design pixel per sampled point | Unknown targets, off-target points, excessive point counts, and invalid actions are refused | Full-target masking is reported explicitly instead of disappearing silently | Masks move with targets and survive plan/history/save/reopen | Restore removes mask; undo/redo and replacement allow correction | **Pass — high** core; **moderate-high** browser, exercised at desktop and mobile sizes |
| Artifact/benchmark governance | 59 cataloged documents classified by authored role and generated structural, semantic, perceptual, export, and publishable evidence | Malformed catalogs/corpus/run/adapter receipts are refused and holdout selection stays explicit | Missing review cannot pass; the release slice reports 8/8 ready while non-release debt remains visible and nonblocking | Portable manifest and raw benchmark receipts are durable, reviewable files | Deterministic builders preserve a review only for byte-identical output; worksheet and adapter runs can resume from external receipts | **Pass — high** for governance and release boundary; comparative product claim remains untested |

## Final ACCP report

### Executive result

The in-scope audit and Structurizr-pattern construction are complete. TurtlePen
now has one durable semantic model, multiple deterministic views, exact plan
approval, conflict-aware local persistence, native outputs, a searchable runtime
surface, a richer viewer, continuous 1px masking, portable artifact contracts,
and an executable benchmark boundary. The package remains labelled **prototype**:
this is a completion claim for the requested implementation, not a production
release or a claim of measured superiority over another tool.

### Highest-impact changes

1. Saves, history, and exports no longer silently replace concurrently edited
   files; Windows existing-destination replacement has a tested recovery swap.
2. Schema 3 separates shared model meaning from static, filtered, dynamic, and
   perspective presentation while migrating existing documents in place.
3. Human approval is now a real state transition: exact rehearsal diff,
   revision hash, approve/reject, bounded history, and recoverable refusal.
4. SVG, PNG, PDF, documentation bundles, manifests, and benchmark receipts are
   available through a zero-dependency CLI as well as MCP and the viewer.
5. Continuous 1-design-pixel erasing is reversible document state with coverage
   truth and SVG/PNG parity, not an irreversible raster edit.
6. Authored artifact roles, generated evidence, naming rules, runtime metadata,
   and generated help now have explicit owners enforced by `pnpm run governance`.

### Stabilization evidence

- `pnpm test`: **625 tests, 625 passed, 0 failed**.
- `pnpm run check`: passed the same suite and rebuilt every canonical example,
  the TurtlePen logo, field guide, image workflow, and five-image supersampling
  corpus through their real authoring paths.
- The real stdio endpoint matrix completed representative use cases for all
  **61 MCP tools**; WebSocket tests covered every browser-authorized mutation,
  origin/frame rejection, history, outside edits, and stale revision hashes.
- Playwright review covered desktop and 390×844 layouts, model/view/history/plan
  tabs, non-mutating plan rejection, approved-state readiness, and a continuous
  eraser drag. A separate full-canvas review inspected all 8 release artifacts
  at their current render hashes. No browser console errors or warnings were
  observed.
- The generated manifest classifies **59** cataloged documents: 40 structurally
  clear, 19 structurally blocked, 50 without a current perceptual review, and
  one without an SVG. Role scoping keeps that non-release evidence visible while
  reporting all **8/8 release artifacts ready**; 9 artifacts are publishable
  across the full catalog.
- Stabilization found and repaired three real integration defects: compact help
  split a required phrase, two examples still assumed full help by default, and
  Windows refused rename-over for an existing history sidecar.

### Remaining boundaries

- No comparative benchmark has been executed. Provider credentials, adapters,
  same-model raw runs, and independent perceptual judgements were not available,
  so no competitive score or quality claim is recorded.
- Provider icon packs and remote themes remain excluded until licensing,
  provenance, deterministic embedding, and SCANGATE intake are satisfied.
- The dependency-free PNG/PDF path intentionally uses deterministic bitmap
  glyphs rather than platform fonts. It now shares measured run layout, sizing,
  alignment, weight, silhouettes, gradients, styled paths, and image-fit rules
  with SVG; SVG remains the accessible vector representation.
- Release artifacts are repaired and currently reviewed. Example, fixture, and
  study roles still contain structural and review debt by design, and the
  manifest exposes it without misrepresenting it as release debt.
- TurtlePen remains local-only and prototype-labelled; production distribution,
  installer/update operations, telemetry, signing, and external service
  administration are outside this sweep.

### ACCP gates A–U

| Gate | Result | Evidence/disposition |
|---|---|---|
| A — Discovery | Pass | Capability registry, compact orientation, `search_help`, full manual, CLI help, and `doctor` expose the live surface. |
| B — Critical workflows | Pass | All six constitution workflows complete through their applicable core, CLI, MCP, viewer, and persistence paths. |
| C — Usability | Pass | Diagram remains dominant; context tabs, named views, focused findings, exact diffs, and explicit continuation actions were browser-reviewed. |
| D — Functionality | Pass | Feature and endpoint matrices are executable; all 61 MCP tools have representative real-process coverage. |
| E — Motion/state transition | Pass | Feedback is bound to real request/revision state; CSS respects reduced motion and does not simulate agent activity. |
| F — Recovery | Pass | Undo/redo, bounded durable sidecars, atomic saves, backups, stale-write refusal, reject-without-mutation, and recovery swap are tested. |
| G — Validation truth | Pass | Structural, semantic, perceptual, export, and publishability states remain independent; missing review never passes. |
| H — Priority | Pass | Data-loss, approval, semantic fidelity, and completion blockers were repaired before presentation additions. |
| I — Scope | Pass | Local compiler/workbench scope is complete; cloud/admin, remote assets, production release, and fabricated results remain excluded. |
| J — Feature disposition | Pass | Every audit/adaptation area is marked complete, retained, rejected, or externally blocked in the disposition table. |
| K — Evidence | Pass with product boundary | Implementation has automated/interactive evidence; comparative market/benchmark conclusions remain explicitly unproven. |
| L — Regression | Pass | 625/625 tests and the full generated-example check pass after final mutations. |
| M — Rollback | Pass | Pre-sweep commit `5deeae6`, document `.bak` files, history, and same-directory recovery files provide layered rollback. |
| N — Observability | Pass | Runtime version/schema/tool/fingerprint/hash, plan diffs, history state, mask coverage, model findings, and artifact contracts are inspectable. |
| O — Accessibility | Pass | SVG title/description/roles/labels, semantic groups, keyboard-capable native controls, responsive layout, and reduced-motion handling are present. |
| P — Performance | Pass for prototype scope | Lazy canvas/detail state, bounded history/eraser points/image allocations, deterministic renderers, and no runtime dependencies control cost. |
| Q — Security/privacy | Pass for local boundary | Local-only server, origin checks, CSP/security headers, bounded WebSocket frames, verified image bytes, and no remote asset fetches. |
| R — Data compatibility | Pass | Schema 1/2→3 migration, stable geometry meaning, round-trip tests, relative resources, and portable manifest paths. |
| S — Failure resilience | Pass | Invalid inputs, composite rollback, interruption, two-session conflict, external edits, stale plans, and Windows replacement are covered. |
| T — Confidence | High implementation and release-artifact confidence / moderate external comparison | Code paths and the 8 release artifacts have current evidence; a cross-system benchmark remains intentionally unclaimed. |
| U — Stabilization | Pass | Final full suite and canonical rebuild are green; generated diffs and user-owned untracked files were separated before commit. |
