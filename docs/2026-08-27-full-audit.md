# TurtlePen full audit — 2026-08-27

## Result

The in-scope source, package, CLI/MCP, generated-artifact, browser-workbench,
naming, and single-source-of-truth audit passes after three repairs. TurtlePen
remains correctly labelled a local prototype; this is not a production-release
or competitive-quality claim.

The audited build is version `0.3.2`, document schema 3, with 61 live MCP tools,
zero runtime dependencies, and 628 automated tests.

## Scope and acceptance

Critical workflows were create/open → edit/rehearse → validate/inspect →
review → save/recover; CLI export/governance; and the local browser workbench.
The review included persistence, import/export, local synchronization,
accessibility, security boundaries, failure truth, package contents, naming,
and SSOT ownership. Remote services, installers, production distribution,
external model runs, and new market claims were outside this audit.

## Findings closed

| Finding | Impact | Repair and regression |
|---|---|---|
| The broad `artifacts` package entry included `manifest.json.bak`. | A published package could contain repository rollback state. | Replaced broad package directories with an explicit release-file allowlist and added package-boundary assertions. `pnpm pack --dry-run --json` contains no backup, history, or log state. |
| `governance` was shipped but assumes Git metadata and exposed Git's raw failure outside a checkout. | Packaged users received a misleading repository-internal error. | The CLI now states the source-checkout scope and returns a stable explanation that directs packaged installs to `doctor`; the boundary has a regression test. |
| `build-flowchart.js` and `build-swimlane.js` rewrote generated timestamps on every check. | A successful verification dirtied canonical documents and changed manifest hashes. | Both builders now use fixed metadata and support isolated output roots; a two-pass test requires byte-identical JSON and SVG output. |

The audit also corrected CLI discoverability by documenting the existing
non-mutating `review --status` path separately from review recording.

## Verification evidence

- `pnpm run check`: 628/628 tests passed, all canonical examples/builders ran,
  help and the artifact manifest regenerated, and repository governance ended
  `READY`.
- All tracked JavaScript modules passed syntax checks; all tracked JSON parsed;
  all local Markdown targets resolved; the tracked-source secret-pattern scan
  found no credential material.
- The governance gate confirmed compliant filenames, 59/59 cataloged TurtlePen
  documents, current artifact/export hashes, generated-help parity, version
  ownership, 61 unique runtime tools, the source map, and schema ownership.
- The packed `0.3.2` build passed `doctor` and a core SVG-render smoke test.
  Packaged governance failed only at its documented source-checkout boundary.
- Playwright covered the editor at 1440×900 and 390×844. Invalid dimensions
  and malformed JSON plans were refused without mutation; a valid plan exposed
  an exact rehearsal and explicit approve/reject controls; reject preserved the
  document. Native controls remained keyboard reachable, reduced-motion CSS is
  present, and the browser reported zero console errors or warnings.
- The package has no dependency graph (`dependencies` and `devDependencies`
  are empty), so a registry vulnerability audit requiring a lockfile is not
  applicable; package-content and executable smoke checks were used instead.

## SSOT and naming disposition

`package.json` remains the owner of commands, package contents, and version;
`src/core/document.js` owns schema and migration; `src/mcp/tools.js` owns MCP
schemas and full help; `artifacts/artifact-catalog.json` owns artifact roles;
and `status.md` owns current verified state. The workspace Hub registry already
advertises TurtlePen's `README.md`, `llm.md`, and `status.md` contracts, so no
second project registry or naming owner was introduced.

## Remaining boundaries

- No comparative model benchmark has been executed, so TurtlePen makes no
  measured-superiority claim.
- Example, fixture, and study roles intentionally retain structural/review debt;
  all 8 release-role artifacts remain ready under the authored catalog policy.
- Production signing, installers/updates, telemetry, cloud administration, and
  remote asset intake remain outside the local prototype boundary.
- The deterministic bitmap text path remains a deliberate fidelity tradeoff;
  SVG is the accessible vector output.

No open implementation blocker was found inside the accepted audit scope.
