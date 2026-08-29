# ADR 0002: Conflict-aware local persistence

**Status:** accepted
**Date:** 2026-08-26

## Context

Directly replacing a document can leave a partial file after interruption, and
two MCP/viewer sessions can silently overwrite each other. Undo history is only
trustworthy when it is bound to the document revision it describes.

## Decision

All document checkpoints, saves, sidecars, and exports use a same-directory
temporary file, flush, optional prior-file backup, and atomic rename. Callers
may supply the SHA-256 hash they inspected; a different in-memory or on-disk
hash raises a retry-safe conflict instead of writing. History sidecars retain
their existing exact-state binding.

## Consequences

- A failed write leaves the previous destination intact.
- A stale client must re-inspect and deliberately retry.
- The prior destination is recoverable from `.bak` when backups are enabled.
- Hash guards are concurrency detection, not multi-user merge semantics.
