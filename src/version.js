/**
 * The one runtime version used by MCP diagnostics and the server handshake.
 *
 * Keep this literal in sync with package.json. The governance check verifies
 * that invariant without making every runtime import read package.json through
 * `import.meta.url`, which is not stable after Worker bundling.
 */
export const VERSION = '0.4.0';
