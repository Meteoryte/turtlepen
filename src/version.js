import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** The one runtime version used by MCP diagnostics and the server handshake. */
export const VERSION = packageJson.version;
