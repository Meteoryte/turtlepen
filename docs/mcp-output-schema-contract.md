# TurtlePen MCP output schema contract

Contract ID: `turtlepen-mcp-tool-result`  
Schema version: `1.0.0`  
Provider: `src/mcp/tools.js`  
Consumers: MCP 2025-06-18 clients over stdio, Streamable HTTP, and the
Cloudflare/ChatGPT Sites adapter  
Provider strategy: one versioned envelope, specialized to each canonical tool
name  
Source prompt: not applicable; this is a runtime protocol contract

## Shape

Every tool descriptor includes an `outputSchema` whose root is a strict object.
The canonical implementation is `toolOutputSchema(toolName)` in
`src/mcp/tools.js`; this document explains that executable owner rather than
duplicating its full JSON Schema.

Successful calls return:

```json
{
  "schemaVersion": "1.0.0",
  "ok": true,
  "tool": "runtime_info",
  "format": "json",
  "result": {}
}
```

- `schemaVersion` is required and names the envelope contract.
- `ok` is required and is always `true` for this success-only envelope.
- `tool` is required and constrained to the descriptor's exact tool name.
- `format` is required and is `json` when the complete handler output parses as
  JSON, otherwise `text`.
- `result` is required. It contains the parsed JSON value or the exact original
  text.
- Unknown top-level fields are refused.

The established text block remains in MCP `content` for compatibility. The
structured value is emitted in `structuredContent` and validated against the
advertised schema before a successful response leaves a transport.

## Boundary behavior

- Invalid or incompatible input is rejected by the tool's input schema and
  returned as an MCP result with `isError: true`; it does not pretend to match
  the success output schema.
- Unknown tools remain JSON-RPC `-32602` protocol errors.
- Empty text is a valid text result and remains an empty string.
- JSON `null`, booleans, numbers, strings, arrays, and objects are preserved as
  their parsed JSON type.
- Tool execution is atomic from the output contract's perspective: no partial
  structured result is emitted after an exception.
- The hosted `render` adapter may append inline SVG artifact data to legacy text
  content. Its structured result is built from the canonical, small render
  receipt before that enrichment so large SVG source is not duplicated in one
  response.

## Validation and evolution

Executable coverage lives in `test/mcp.test.js`, `test/http-mcp.test.js`, and
`test/cloudflare-mcp.test.js`. It verifies descriptor presence and strictness,
text and JSON result semantics, exact tool names, transport parity, and error
separation.

Any incompatible envelope change requires a new `TOOL_OUTPUT_SCHEMA_VERSION`,
updated tests, and a changelog entry. Adding fields without making them required
is still disallowed by the current strict schema and therefore also requires an
intentional versioned contract change.
