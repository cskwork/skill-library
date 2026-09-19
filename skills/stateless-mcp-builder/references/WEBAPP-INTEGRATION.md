# Web application API and tool-calling integration

This is an application design recipe, not a claim that the package contains your
web app's routes, auth provider, model adapter, or production server.

## Two consumers, one authorized service layer

Keep ordinary application actions deterministic: a button with known parameters
calls the application's existing typed backend operation. Use an agent/tool loop
only where the product deliberately needs model-selected actions. The MCP layer
exposes a curated subset of the same capabilities to your backend agent and to
external coding harnesses; it must not bypass existing authorization.

```text
Normal UI action -> existing authenticated API -> domain operation
Agent UI action  -> backend orchestrator -> approved MCP tools -> domain operation
Coding harness  ------------------------> approved MCP tools -> domain operation
```

When MCP and the app share a runtime, call domain functions rather than making a
redundant loopback HTTP request to the app's own REST route. Keep the same policy
and validation boundaries. A standalone adapter uses a fixed-base typed upstream
client with narrowly scoped credentials instead.

## Backend agent request flow

1. Authenticate the web user and derive tenant and role from validated server-side
   state. Attach a request-scoped MCP credential or policy context. Never let a
   model choose the identity, token, or MCP endpoint.
2. Discover the authorized catalog using a pinned official MCP client. Filter it
   against the application's approved registry and validate supported schemas.
   Cache only with an authorization-aware key and valid server cache hints.
3. Convert the curated schemas into the chosen model provider's supported tool
   format. Where direct MCP support exists, verify that its transport/auth/profile
   matches the server instead of assuming equivalence. Unsupported schema
   features must produce an explicit adapter error, not a weaker validation rule.
4. When the model requests a tool, resolve the name through the approved mapping.
   Parse and validate arguments. Recheck user intent, operation budget, resource
   authorization, and any server-issued approval requirement. Do not forward
   arbitrary names, URLs, HTTP headers, or model-supplied credentials.
5. Invoke the SDK's tool-call API under a bounded deadline. Pass cancellation
   where supported; respect the operation's idempotency and uncertainty rules.
   Decode structured output and distinguish tool failure from transport failure.
6. Feed only permitted, size-bounded results back to the model or UI. Mark remote
   content as data. Limit tool rounds, total wall time, parallelism, tokens, and
   spend; report an explicit budget-exhausted result rather than looping forever.

The numerical budgets belong in the generated project's config and tests. No
particular model provider, model version, or hosting service is required here.
Implement the exact SDK calls against the pinned dependency versions. [S5, S16]

## Reads, writes, and UI approvals

A read-only search may be returned directly to the UI. A consequential write
should surface a structured proposed action with the exact targets and changes.
The user approves through the application's authenticated UI or another trusted
flow; the backend creates a bound approval record. A model-produced confirmation
sentence or `confirmed: true` does not create this record.

After approval, execute with a stable business idempotency key. Return an operation
ID and status that the UI can reconcile after reconnects. Do not show "failed"
merely because an HTTP response was lost if commit status is unknown. See the
write algorithm in `ARCHITECTURE-SECURITY.md`.

## Deliverables to generate in the real repository

Generate the actual `/mcp` route/adapter; a shared domain-tool registry; runtime
input/output validation; request-scoped authorization; a backend client adapter
where the product needs one; safe read fixtures; project-specific setup commands;
and integration tests for REST/MCP policy equivalence and cross-tenant isolation.

Also generate `docs/mcp/TOOLS.md`, `HUMAN-SETUP.md`, `AGENT-SETUP.md`,
`VERSION-LOCK.md`, `COMPATIBILITY.md`, and a redacted connection-test report.
The human and agent manuals must cover both external harness attachment and the
web app backend's own connection/credential environment. A harness passing does
not prove the browser-to-backend-to-upstream flow passed.

A minimum acceptance journey is: authenticated synthetic user -> backend agent ->
reviewed read tool -> fixture resource -> typed result displayed by the UI. Add
an unauthorized synthetic user and an attempted out-of-scope tool name as negative
cases. Run real-provider tests only when credentials and authorized fixtures are
available, otherwise label them NOT RUN and keep fixture results distinct.
