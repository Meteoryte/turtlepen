/**
 * Transport-independent TurtlePen MCP protocol runtime.
 *
 * stdio and Streamable HTTP both call this module. Keeping the tool registry,
 * handshake instructions, protocol negotiation, and error semantics here means
 * a new transport cannot quietly become a smaller server that merely shares
 * TurtlePen's name.
 */

import { createSession, createTools } from './tools.js';
import { VERSION } from '../version.js';

export const SERVER_INFO = Object.freeze({ name: 'turtlepen', version: VERSION });
export const DEFAULT_PROTOCOL = '2025-06-18';
export const SUPPORTED_PROTOCOLS = Object.freeze([
  DEFAULT_PROTOCOL,
  '2025-03-26',
  '2024-11-05',
]);

const SUPPORTED_PROTOCOL_SET = new Set(SUPPORTED_PROTOCOLS);

export const result = (id, value) => ({ jsonrpc: '2.0', id, result: value });
export const error = (id, code, message, data = null) => ({
  jsonrpc: '2.0',
  id,
  error: { code, message, ...(data == null ? {} : { data }) },
});

/**
 * Build the only capability inventory every client is guaranteed to put in the
 * model's context. It is derived from the live tool registry and its enums.
 */
export function buildInstructions(tools) {
  const firstSentence = (tool) => String(tool.description ?? '').split(/(?<=\.)\s/)[0].trim();
  const modes = (tool) => Object.entries(tool.inputSchema?.properties ?? {})
    .filter(([, schema]) => Array.isArray(schema.enum) && schema.enum.length > 1)
    .map(([name, schema]) => `${name}: ${schema.enum.join('|')}`)
    .join('  ');
  const summary = (tool) => {
    const availableModes = modes(tool);
    return availableModes ? `${firstSentence(tool)}  [${availableModes}]` : firstSentence(tool);
  };
  const inventory = tools.map((tool) => `  ${tool.name} — ${summary(tool)}`).join('\n');

  return [
    'Call turtlepen_help first. Measure text before sizing boxes, draw the whole',
    'composition, then call validate and adjudicate each finding. Nothing is ever',
    'silently resized. Render the result and LOOK at it — a clean log means the',
    'drawing is undefective, never that it is finished.',
    '',
    'The canvas is unbounded right and down; a declared size is a starting point,',
    'not a budget. A feature may be more than one stroke, and overlay pages let',
    'annotation sit on top without colliding. Before concluding the lattice cannot',
    'express something, check this list — three separate sessions have reported an',
    'engine limit that was really a capability they had not found:',
    '',
    `EVERY TOOL (${tools.length}):`,
    inventory,
  ].join('\n');
}

/**
 * Create one stateful MCP runtime. A transport owns its request ordering and
 * lifecycle; this object owns one active TurtlePen document and its 73 tools.
 */
export function createProtocolRuntime(sessionOptions = {}) {
  const session = createSession(sessionOptions);
  const tools = createTools(session);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  let negotiatedProtocol = null;

  return {
    session,
    tools,
    byName,
    get protocolVersion() {
      return negotiatedProtocol;
    },

    async handle(message) {
      const { id, method, params } = message ?? {};
      const isNotification = id === undefined || id === null;

      switch (method) {
        case 'initialize': {
          const asked = params?.protocolVersion;
          negotiatedProtocol = SUPPORTED_PROTOCOL_SET.has(asked) ? asked : DEFAULT_PROTOCOL;
          return result(id, {
            protocolVersion: negotiatedProtocol,
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions: buildInstructions(tools),
          });
        }

        case 'notifications/initialized':
        case 'notifications/cancelled':
          return null;

        case 'ping':
          return result(id, {});

        case 'tools/list':
          return result(id, {
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            })),
          });

        case 'tools/call': {
          const tool = byName.get(params?.name);
          if (!tool) {
            return error(id, -32602, `unknown tool "${params?.name}"`, {
              available: [...byName.keys()],
            });
          }
          try {
            const text = await tool.handler(params.arguments ?? {});
            return result(id, { content: [{ type: 'text', text: String(text) }] });
          } catch (caught) {
            return result(id, {
              content: [{ type: 'text', text: `error: ${caught.message}` }],
              isError: true,
            });
          }
        }

        default:
          if (isNotification) return null;
          return error(id, -32601, `method not found: ${method}`);
      }
    },
  };
}
