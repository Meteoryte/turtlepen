# MCP audit notes

Audit scope: `src/mcp/server.js`, `src/mcp/tools.js`, and real-stdio MCP tests.
These are improvement notes, not a claim that the prototype is unsafe to use.

## 1. Make `repair` persistent and undoable

**Priority: high.** `repair` changes the in-memory document through
`core.applyFix`, but its handler does not checkpoint the document. It is also
outside `MUTATING_TOOLS`, so it bypasses the shared history wrapper. A repair
can therefore appear successful, disappear after reopening, and be skipped by
undo/redo. This contradicts the tool description's promise that repairs are
"rehearsable, undoable".

Add `repair` to the history-covered mutations, persist a successful repair,
and add a real-MCP regression that verifies the saved state and a one-step undo
after a repair.

Evidence: `src/mcp/tools.js:21-22`, `src/mcp/tools.js:175-204`,
`src/mcp/tools.js:985-1014`, `src/mcp/tools.js:1414-1416`.

## 2. Derive the `plan` operation inventory

**Priority: medium.** The `plan` schema describes a hand-written list of
permitted operations. It omits dispatchable operations including `wireframe`,
`perspective_scene`, and `perceptual_review`, which are present in
`core.OPERATIONS`. This makes valid batch capabilities invisible to clients
and risks further drift as operations are added.

Generate the operation list in the description from `Object.keys(core.OPERATIONS)`,
as the server already generates its handshake tool inventory from live tool
definitions. Add an assertion that the advertised plan operations equal the
dispatch table.

Evidence: `src/mcp/tools.js:805-824`, `src/mcp/server.js:32-77`,
`src/core/index.js:503-561`.

## 3. Validate tool arguments before dispatch

**Priority: medium.** Tool schemas declare required fields, enums, bounds, and
`additionalProperties: false`, but the server forwards `params.arguments`
directly to each handler. Unsupported properties can be silently ignored; for
example, a misspelled `label` on `new_diagram` is not rejected by the declared
schema. That is an especially costly failure mode for an agent-facing API.

Add a small zero-dependency validator for the schema subset the project uses,
or validate in each handler consistently. At minimum reject missing required
properties, unexpected properties, wrong primitive types, enum violations, and
numeric bounds. Exercise valid and invalid arguments through the real stdio
server.

Evidence: `src/mcp/server.js:113-124`, `src/mcp/tools.js:220-242`,
`test/mcp.test.js:27-36`.

## 4. Define and enforce the file-access boundary

**Priority: low (security hardening).** Diagram, render, and image paths are
resolved with Node's `resolve`, so absolute paths and `..` components may read
or write outside the server's starting directory. A local stdio server normally
runs with its user's authority, but the scope should be intentional and
visible—particularly when an agent is allowed to choose tool arguments.

Choose one documented policy: restrict all file operations to an explicit
workspace root (including symlink-aware checks), or retain unrestricted local
access and clearly state that trust boundary in setup documentation. Add
coverage for the chosen policy.

Evidence: `src/mcp/tools.js:42-58`, `src/mcp/tools.js:234-256`,
`src/mcp/tools.js:858-868`, `docs/QUICKSTART.md:13-39`.

## 5. Keep release metadata and operational claims synchronized

**Priority: low.** The package version is `0.2.0`, while the MCP initialize
response reports `0.1.0`. The README says 39 tools and 424 tests; the status
document still says 35 tools and 318 tests. Stale capability and verification
claims make it harder for an MCP client or maintainer to establish what is
actually being run.

Derive the server version from package metadata at build/release time, and
either update status figures as part of releases or replace volatile totals
with the command that verifies them. Add a release check that compares the
reported MCP version and advertised tool count with the package and live tool
list.

Evidence: `package.json:2-4`, `src/mcp/server.js:16-18`,
`README.md:9`, `status.md:3,12-14`.
