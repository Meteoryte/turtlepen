# TurtlePen native editing completion — 2026-09-05

Status: native workflow implementation verified. Version 0.5.0, 84 tools,
55 native operations. The broader capability catalog is not fully implemented.

The implementation closes the four prioritized native editing clusters in the
SVG RFC and completes supporting query, layout, page, color and timeline
workflows. [Scope](2026-09-05-completion-scope.md) and
[usage](native-editing-workflows.md) describe the exact contract and limits.

## Implemented and observed

| Workflow | Evidence |
|---|---|
| Discover/filter existing elements | Stateless query tests for tags, inversion, bounds, pagination and geometry |
| Transform, copy and scale artwork | Four-turn/two-reflection reversibility, integer area scaling, group and follow-constraint tests |
| Shape cutting and surgical node editing | Exact partition union, multi-node movement, interpolation, trim and computed intersections |
| Color and path measurements | Per-piece SVG colors, raster endpoint pixels, persisted fields, bounded segment measurements |
| Construction and cleanup | Hidden-guide release refusal, exact snapping, semantic/compositing protection |
| Group/layout/page workflows | Atomic mixed-group failure, reference alignment, fixed gaps, copy/merge recovery |
| Timeline display/interchange | Current-date modes, native relationship reflow, native JSON, Mermaid refusal/projection, pre-0100 dates |
| MCP recovery | Real stdio invokes every tool; nested-plan refusal, reopen, undo/redo and expected-hash behavior |
| Rendering | Native editing PNG inspected; SVG render hash `918e65559eb189eb`; no visual/structural blockers |

The reviewed example is
[native-editing-workflows.svg](../diagrams/native-editing-workflows.svg), built
entirely with native operations. Its document remains an example-role artifact;
the visual review does not silently promote it into the release catalog.

## Protocol and acceptance record

- Core mutation paths and transport wrappers are shared. Every new mutation
  participates in planning and durable history. Optional query/export tools
  advertise read-only behavior; mixed-action tools stay conservative.
- Legacy centering behavior is preserved; the new exact alignment path refuses
  fractional moves. Off-grid transforms, unsupported object kinds, pixel masks,
  incompatible group styling and unsafe duplicate removal have explicit results.
- Public claims are limited to executable local evidence. Interoperability
  follows the official MCP tool and Mermaid timeline sources linked in scope.
- ACCP native implementation checks: discovery, source ownership, supported
  input choices, mutation scope, atomic failure, persistence, recovery, matching
  transports, visual review, and truthful remaining-work labels are exercised.
  Hosted-account gates remain separate. The authorized anonymous Sites release
  and its production checks are recorded below.

## Remaining ideas and deployment boundary

The broad SVG capability catalog still contains unimplemented ideas. Live clip
stacks, every-mutator page locks, generalized markers, advanced tracing/codecs,
arbitrary affine/Bézier geometry and proportional typography are not shipped by
this change. Some require a different source/effect or geometry contract; none
is hidden behind the local test count. Account-owned cloud diagrams, OAuth,
private artifact ACLs and uploads remain a separate hosted product.

Canonical implementation `ed23b839c2bf333b231fc44b65a9daad04a77e60` is pushed to
GitHub. The user subsequently requested the Sites update. The website candidate
preserves the already-published navigation/signup revision and vendors all 62
canonical source files, including executable modes, without differences.

Sites version **22** built and published successfully from website source
`36f3a170c3e13d4e115ddcf30162c1604dd85eb0`. Deployment:
`appgdep_6a9cda90ca908191ac6179f022613e22`. The public endpoint
<https://brainn.dev/api/mcp/turtlepen> reports 0.5.0 and 84 tools, negotiates MCP
2025-11-25, and passes native mutation/reopen/undo/redo, isolation, guide removal,
color/page/cleanup, shape-aware measurement, deliberate overflow, self-contained
SVG, temporal marker, relationship reflow and timeline-export checks. Fourteen
grouped live checks and ten desktop/phone navigation scenarios pass.

The website release also blocks unused Server Action/form write paths before
framework decoding. Its dependency review identifies remaining development-graph
advisories; the containment does not claim to patch those packages. The local
website TypeScript check remains limited by its missing declared Supabase
dependency; Sites performed the successful production build. These are recorded
in the website's `docs/turtlepen-0.5-source-validation.md`.

## Final validation

- `pnpm run check`: PASS, including all 728 tests, complete example rebuilds,
  generated help, manifest enforcement and final governance.
- Final stabilization: the complete check passed again after endpoint-reference
  protection and distinct-overpaint normalization were added.
- Governance: READY; 76 cataloged native documents, all eight release artifacts
  pass, two source-less exports remain explicitly classified.
- New example: structural PASS, current perceptual review, release-check PASS.
- Hosted source synchronization, build identity and observed production behavior
  are recorded in the website's vendored provenance and release report. Sites
  version 20 remains available for rollback; no storage migration was made.
