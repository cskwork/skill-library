# Protocol profile and SDK selection

Baseline checked: **2026-09-19**. This is a dated implementation reference, not an
automatic guarantee that subsequent releases are unchanged. Source identifiers
refer to `SOURCES.md`.

## Modern wire profile

Use MCP `2026-07-28`. Modern calls are independently described by metadata in
`params._meta`; no initialization round trip or protocol session is required.
`server/discover` advertises identity, versions, and capabilities. `ping` is removed.
Do not confuse the old sessionless-transport setting with this newer protocol. [S1, S2, S4]

HTTP requests carry matching `MCP-Protocol-Version`, `Mcp-Method`, and, for a named
operation such as `tools/call`, `Mcp-Name` headers. Send both JSON and SSE in Accept.
The body is authoritative. Use the SDK for header mirroring, including optional
`x-mcp-header` parameters and their Unicode encoding. [S3]

A modern result has `resultType`. Discovery and cacheable list/read results carry
freshness/scope information. Treat `input_required` as incomplete, not successful
execution. A dropped response does not prove a write was not committed. [S1, S4, S16]

### A diagnostic request, not an initialization handshake

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
Mcp-Method: server/discover
Authorization: Bearer <injected at runtime>

{
  "jsonrpc": "2.0",
  "id": "probe-1",
  "method": "server/discover",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "webapp-connection-probe", "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

Use JSON responses for short API calls. SSE within a POST response is compatible
with statelessness; it is not the deprecated two-endpoint HTTP+SSE transport.
Core modern operation does not need GET session streams or DELETE session cleanup.
Keep the transport profile and any application-specific streaming requirement
separate. [S3]

## SDK choice

The official TypeScript v2 stable line uses split server/client packages. Select
exact released versions after checking registry metadata, release notes, exports,
and runtime requirements. A README on `main` can move ahead of a published package.
Use the documentation matching the installed release and compile it. [S5]

Conceptual composition, to be integrated with the repository's real policy layer:

```ts
import { createMcpHandler } from '@modelcontextprotocol/server';

// buildServer is implemented by your project. Register its tools per request.
const handler = createMcpHandler(buildServer, { legacy: 'stateless' });

// The surrounding web route validates Host/Origin and authenticates the caller.
// verifiedAuth is produced by the project's credential verifier, not the model.
const response = await handler.fetch(request, { authInfo: verifiedAuth });
```

This is an architectural excerpt, **not a runnable server or complete security
middleware**. The documented Node adapter is `toNodeHandler` from
`@modelcontextprotocol/node`; Express helpers are in
`@modelcontextprotocol/express`. Avoid reading a request body twice when middleware
has already parsed it. [S6, S7, S8]

Factories allocate lightweight per-request servers. Put safe pools and immutable
configuration outside them; never put the caller's current token into a global
HTTP client's mutable defaults. [S6, S9]

## Compatibility posture

Default for this skill: modern stateless endpoint plus the SDK's explicit
`legacy: 'stateless'` compatibility path. This allows supported 2025-era handshake
clients without a protocol session store. Choose `legacy: 'reject'` for a tested
modern-only environment. Neither setting proves a particular harness works. [S10]

The bundled probe tests **only the modern profile**. Test legacy compatibility
using a pinned SDK/client that actually sends `initialize`, initialized
notification, `tools/list`, and a safe tool call. Capture the negotiated revision
and assert the sessionless compatibility profile does not require a session ID.
Never identify a protocol by its URL alone.

Do not treat 401/403 as a reason to downgrade transport or disable authentication.
Do not replace failed modern discovery with an empty catalog. Log a version
mismatch separately from a missing route. Unsupported revisions are distinct from
HTTP network failures and unknown JSON-RPC methods. [S2]

## Scope deliberately excluded from the default build

Do not adopt deprecated Roots, Sampling, Logging, or HTTP+SSE features for a new
API adapter. Implement normal application logging outside the MCP logging feature.
Add Tasks, MCP Apps, subscriptions, or multi-round-trip interactions only after
checking current extension negotiation and target client support. [S1]

Statelessness is not a ban on databases, audit trails, application logins, business
transactions, or durable job handles. It is the absence of protocol conversation
state needed to interpret the next HTTP request. Application handles must still
be authorized on every use. [S9]
