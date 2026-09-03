# TurtlePen source-of-truth map

This file identifies ownership. It does not duplicate the owned values. When a
derived file disagrees with its owner, repair the owner or regenerate the
derived file—never hand-edit both.

| Concern | Owning source | Derived/read-only surfaces |
|---|---|---|
| Package and runtime version | `package.json` | `src/version.js`, MCP handshake, CLI/doctor output, release history |
| Document schema and migration | `src/core/document.js` | runtime diagnostics, serialized documents, schema tests |
| Core mutations | `src/core/index.js` → `OPERATIONS` | plans, MCP mutation history, browser mutation allowlist |
| MCP input/output schemas and full authoring manual | `src/mcp/tools.js` | `src/capabilities.js`, `docs/mcp-output-schema-contract.md`, `docs/turtlepen-help.txt`, endpoint evidence |
| MCP protocol behavior and transport parity | `src/mcp/protocol.js` | `src/mcp/server.js`, `src/mcp/http-server.js`, endpoint evidence |
| Artifact role and release scope | `artifacts/artifact-catalog.json` | `artifacts/manifest.json`, README release/study labels |
| Artifact quality evidence | TurtlePen documents plus their rendered exports | generated `artifacts/manifest.json` hashes and verdicts |
| Benchmark tasks and partitions | `benchmark/corpus-v1.json` | worksheets, adapter receipts, scored reports |
| Project contract and invariants | `llm.md` | contributor explanations elsewhere |
| Current verified state | `status.md` | README status summary and dated completion reports |
| User onboarding | `docs/QUICKSTART.md` | README entry link |
| Commands and package contents | `package.json` | README command examples |
| Release history | `CHANGELOG.md` | no mutable duplicate; entries are historical snapshots |

## Generated files

- `docs/turtlepen-help.txt`: `pnpm run docs:help`
- `artifacts/manifest.json`: `pnpm run quality:manifest`

`artifacts/artifact-catalog.json` is authored policy, not generated output. A
release-role change begins there; the manifest is then regenerated from it.

`pnpm run governance` verifies naming, catalog coverage, generated-help parity,
manifest scope/roles/hashes, runtime version ownership, registry uniqueness, and
this map. `pnpm run check` regenerates the derived files before running that
gate.

## Naming application

Workspace filenames use kebab-case. Standard ecosystem files and core project
documents (`README.md`, `CHANGELOG.md`, `LICENSE`, and `QUICKSTART.md`) are the
only tracked exceptions. JavaScript variables/functions use camelCase and
classes use PascalCase; TurtlePen's project-local domain modules remain concise
nouns such as `workspace.js` and `output.js` rather than generic `utils` or
`manager` buckets.

Artifact IDs inside a TurtlePen document are model identifiers, not workspace
filenames. Existing underscore IDs remain compatible authored data and are not
silently rewritten by the naming gate.
