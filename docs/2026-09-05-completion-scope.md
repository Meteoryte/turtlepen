# TurtlePen completion scope — 2026-09-05

Status: native workflow implementation verified; broader catalog items remain
explicitly open in the completion report. This document is not a claim that all
conventional SVG-editor or hosted-account concepts are implemented.

## Task constitution

ID: turtlepen-completion-2026-09-05, version 1.

Objective: let an agent discover, create, surgically edit, inspect, recover, and
deliver native TurtlePen artwork and semantic timelines using the recorded new
concepts, with the same behavior through direct operations, plans, and MCP transports.

Users: Chuck and agents authoring and repairing existing diagrams. This is
first-party workflow evidence; no claim about market demand or model superiority.

Authority: the current request authorizes implementation. The existing integer
lattice, explicit operations, deterministic geometry, zero runtime dependencies,
reversible history, and truthful release gates remain project requirements.
Checkpoint: `d7b51ba441c7c857dc1d5e16f5e9569aae3c768c`; work branch:
`agent/turtlepen-completion-2026-09-05`. Revert individual changes to that checkpoint
if stored data becomes inaccessible or an existing workflow regresses.

## Discovery and sources

- `docs/svg-editing-capability-status.md` and GitHub
  [RFC 6](https://github.com/Meteoryte/turtlepen/pull/6): exact transforms,
  construction guides, shape/intersection cutting, cleanup, selection and editing.
- `docs/2026-09-03-semantic-timeline-request.md` and `docs/semantic-timelines.md`:
  semantic updates, current-date markers, relationships, and representable export.
- `docs/lattice-editing.md`, imaging and flowchart plans, completion reports,
  source-of-truth map, and actual core/tool/transport/tests.
- Live GitHub inspection: no open issues; one open SVG capability RFC. Its
  priority is the existing deterministic editing pipeline, not a new renderer.
- [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools):
  declared schemas, structured results, accurate annotations, and tool error behavior.
- [Mermaid timeline syntax](https://mermaid.js.org/syntax/timeline.html): periods,
  events, title, and sections; richer TurtlePen semantics need explicit refusal
  when a plain timeline cannot represent them.

The old roadmap is not a reliable task count: many listed gaps are implemented.
Every current claim will be reconciled with executable evidence before closure.

## Required workflows and acceptance

1. Query existing objects by explicit scope and properties, with deterministic
   ordering, bounded output, and no hidden selection state.
2. Transform lattice artwork (quarter turns, reflections, integer scale),
   including grouped artwork and explicit copies; preserve exact occupancy and
   named relationships or refuse an unsupported transformation before mutation.
3. Cut by another shape/intersection, retain all partitioned geometry, and name
   every result deterministically. Existing axis slicing remains compatible.
4. Normalize paths and remove provably duplicate artwork without removing distinct
   authored semantics; report any protected or non-equivalent objects.
5. Create, inspect, snap to, and remove named construction guides. They remain
   ordinary editable primitives, persist through restart, and prevent release
   while scaffolding remains, even if hidden.
6. Complete supporting selection alignment/distribution, group presentation,
   and page management using the existing model, with exact invalid-input handling.
7. Complete truthful timeline interchange for the representable Mermaid subset
   and explicit visible current-date semantics. Preserve richer information by
   returning exact unsupported fields rather than silently dropping it.
8. Discover every new capability through live help, schemas, and MCP. Verify
   real stdio/HTTP calls, plan parity, undo/redo, persistence, negative inputs,
   transactional failure, rendered examples, and existing regressions.

Before claiming completion: classify every recorded candidate as implemented,
already supported, or an explicit architecture/product boundary with evidence.
Run the full project check, transport suite, and one clean stabilization pass.

## Boundaries and open assumptions

- Arbitrary affine/Bézier geometry, off-grid coordinates, negative addressing,
  proportional text layout, automatic resizing of ordinary authored boxes, SVG
  filters/mesh paints, and unrestricted foreign-SVG round trips contradict or
  exceed the approved model. Do not silently change those requirements.
- Account-owned hosted workspaces, OAuth identity, durable private cloud storage,
  billing, and deployment permission changes are a separate product and security
  boundary. Existing anonymous hosted behavior must remain compatible. A locally
  passing MCP is not evidence of a production deployment.
- Do not download Drive items: the user skipped Drive intake this session.
- Benchmark tooling exists; external model runs and claims of outperforming
  other tools need actual independent results. Do not manufacture that evidence.
- The default interpretation of “all new ideas” is the recorded project/workspace
  ideas and GitHub RFC. Additional user ideas can extend this checklist.

## Protocol receipts

- SACAP: `APPROVED_WITH_OPEN_ASSUMPTIONS`; native completion proceeds under the
  current contract. New account/cloud products require their own authority.
- EFPRD: `PASS_WITH_CONDITIONS`, mixed first-party implementation evidence and
  official interoperability documentation. Need: avoid manual reconstruction of
  exact existing artwork and loss of chronology. Alternatives: leave workarounds,
  introduce a general vector editor, or extend native operations; choose the
  latter because the published RFC and current model support it. Failure condition:
  changed ink without explicit intent, lost meaning, or a second renderer.
  Adapt Mermaid's declarative input principle; do not copy styling, assets, or code.
  No customer/market/competitive effectiveness claim is authorized by this receipt.
- MCPAP: `FALLBACK_REQUIRED`; no TurtlePen host tool is exposed in this session.
  Use the canonical local engine and real local MCP transports for authoring and
  verification. The ambient GitHub connector is unregistered; use the existing
  authenticated GitHub CLI for repository metadata. No registry approval changed.
- ACCP: full native-MCP completion sweep; medium risk, with persistence, file
  handling, tool integration, recovery, and rendering modules active. Production
  release and identity/account modules are not activated by local verification.
- Release extension: the user explicitly requested updating TurtlePen on Sites.
  PSORR and SAPF release checks were applied to the existing public site; version
  22 and its live evidence are recorded in the completion report. Account-owned
  diagrams and private ACLs remain outside the anonymous session product.
