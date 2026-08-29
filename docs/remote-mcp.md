# Remote MCP transport

TurtlePen's Streamable HTTP endpoint is a stateful transport over the same
runtime and live 73-tool registry as the stdio server. It is not a second
diagram engine. Each successful `initialize` receives an opaque
`Mcp-Session-Id`; that session owns one active document, a serial request queue,
and an isolated filesystem root until it expires or the client deletes it.

The transport implements the MCP 2025-06-18 HTTP contract used by current
TurtlePen integrations. POST responses are request-scoped SSE messages. A
client must send both response types:

```http
Accept: application/json, text/event-stream
Content-Type: application/json
```

Python's default `urllib` user agent may be rejected by Cloudflare before a
request reaches TurtlePen. Send a descriptive `User-Agent`; `curl` already
sends one.

## Run a private preview

Set a strong bearer token and start the dependency-free server:

```powershell
$env:TURTLEPEN_HTTP_BEARER_TOKEN = '<random secret from a secret manager>'
pnpm run mcp:http
```

The defaults are `127.0.0.1:8792`, MCP path `/mcp`, and health path `/healthz`.
Initialization looks like this:

```bash
curl -i http://127.0.0.1:8792/mcp \
  -H 'Authorization: Bearer <token>' \
  -H 'User-Agent: TurtlePen-Example/1.0' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"example","version":"1.0"}}}'
```

Keep the returned `Mcp-Session-Id` header and send it, plus
`MCP-Protocol-Version: 2025-06-18`, on later POSTs. The response body is framed
as:

```text
event: message
data: {"jsonrpc":"2.0",...}
```

`DELETE /mcp` with the same session header explicitly closes the session and
purges its isolated filesystem. Idle and absolute expiry do the same. The server
does not expose an unrelated long-lived GET event stream.

## Boundary and deployment contract

- Authentication is deny-by-default. Anonymous mode requires the explicit
  `TURTLEPEN_HTTP_ALLOW_ANONYMOUS=1` development override.
- Browser origins are refused unless listed in
  `TURTLEPEN_HTTP_ALLOWED_ORIGINS` as a comma-separated exact allowlist.
- Every session is confined below `TURTLEPEN_HTTP_DATA_DIR`; the remote server
  refuses to start if `TURTLEPEN_ALLOW_ANY_PATH=1`.
- Defaults bound request and response bytes, request rate, session count, idle
  lifetime, and absolute lifetime. Audit logs contain metadata and hashed
  client/session labels, never bearer tokens or tool arguments/results.
- Session state currently lives in one Node process. A reverse proxy must use a
  single instance or sticky routing; a restart expires active sessions.
- File-oriented tools read and write the server-side session root. A hosted
  product needs an authenticated, session-bound file ingress/egress bridge
  before remote users can supply local images/SVG/documents or download
  rendered files.

The bearer-token mode is suitable for a private preview, not an open public
multi-user release. Put TLS and an OAuth-capable MCP authorization gateway in
front of the service, bind identities to sessions and quotas, and complete the
project's production security/recovery gate before publishing an endpoint for
untrusted users.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `TURTLEPEN_HTTP_HOST` | `127.0.0.1` | bind address |
| `TURTLEPEN_HTTP_PORT` | `8792` | listen port |
| `TURTLEPEN_HTTP_PATH` | `/mcp` | MCP endpoint |
| `TURTLEPEN_HTTP_HEALTH_PATH` | `/healthz` | readiness endpoint |
| `TURTLEPEN_HTTP_BEARER_TOKEN` | none | private-preview credential |
| `TURTLEPEN_HTTP_ALLOWED_ORIGINS` | none | exact browser-origin allowlist |
| `TURTLEPEN_HTTP_DATA_DIR` | OS temporary directory | isolated session roots |
| `TURTLEPEN_HTTP_BODY_LIMIT` | `12582912` | maximum request bytes |
| `TURTLEPEN_HTTP_RESPONSE_LIMIT` | `16777216` | maximum response bytes |
| `TURTLEPEN_HTTP_REQUESTS_PER_MINUTE` | `120` | per-session and initializer rate |
| `TURTLEPEN_HTTP_MAX_SESSIONS` | `100` | live session cap |
| `TURTLEPEN_HTTP_IDLE_TTL_MS` | `1800000` | idle expiry |
| `TURTLEPEN_HTTP_ABSOLUTE_TTL_MS` | `28800000` | hard session expiry |
| `TURTLEPEN_HTTP_TRUST_PROXY` | unset | trust first forwarded client address |

Only enable proxy trust behind a proxy that overwrites untrusted forwarded
headers.
