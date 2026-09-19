# Verification and acceptance criteria

## What the included tests prove

The included Node test suite exercises the diagnostic client against local fixture
HTTP servers. It checks request metadata, JSON/SSE handling, pagination, bounded
responses, failure classification, safe-call allowlisting, and credential handling.
It does **not** implement a production MCP server and does not establish official
SDK conformance or real Claude Code/Codex/Pi interoperability.

The CLI is a small modern HTTP inspection/call utility. It supports JSON and
request-scoped SSE, `server/discover`, paginated `tools/list`, `tools/call`, and
statically reachable `x-mcp-header` annotations. It fails closed on malformed
header annotations. It does not support OAuth login/refresh, legacy handshakes,
stdio, MRTR completion, subscriptions, Tasks, remote `$ref` retrieval, or full JSON
Schema validation. Use a pinned official SDK for production general-purpose
clients and a pinned validator for complete schema checks.

## Doctor contract

Default paths are `/healthz` and `/readyz`; customize paths when mounting behind a
prefix. Health and readiness must return the agreed JSON status. Doctor uses
`server/discover`, not removed modern `ping`. It checks result envelopes and basic
schema metadata, but not every possible conformance rule. The advertised tool
allowlist and server identity must also be reviewed by a human or trusted config.

The selected safe health call must return `structuredContent.ok: true` and must
not set `isError`. An `input_required` response is not complete. The checker only
calls a name explicitly repeated in `--allow-tool`; it never guesses from an
annotation. The project convention is `system_health` with empty arguments.

With `--require-auth`, an unauthenticated `tools/list` must return 401 with a Bearer `WWW-Authenticate` challenge. A 403 does
not prove the authentication challenge is correct; inspect whether a proxy/Origin
rule, rather than authentication, rejected it. A public catalog requires a
separately designed protected, no-side-effect negative test; do not run a write
without authentication merely to test rejection.

Exit codes: **0** means the selected invocation's checks passed, **1** means a
transport/protocol/tool/health check failed, and **2** means usage is invalid or a
doctor probe was incomplete. A successful `call` exits 0 for that call only; a
successful `list` does not mean doctor or harness integration passed.

## Application test matrix

| Area | Required evidence |
|---|---|
| Happy path | Correct typed output for each tool using a safe fixture |
| Input | Missing required, extra fields, Unicode, huge strings, invalid enums/IDs |
| Authorization | Missing/expired/wrong-audience token; wrong scope/tenant/owner |
| Discovery | Correct catalog per authorized principal; no cross-principal cache leak |
| Errors | Domain failure and upstream 429/5xx/timeout are not empty success |
| Writes | Approval tampering/expiry; duplicate key same payload; conflicting payload |
| Uncertainty | Connection loss after commit returns/reconciles the same operation |
| SSRF | Arbitrary hosts, encoded path escapes, redirects, metadata/private endpoints |
| Isolation | Concurrent callers never share mutable headers or identity |
| Statelessness | No modern initialization/session dependency; next call works on another replica |
| Restart | A new process handles the next read; durable job/write records survive |
| Limits | Body/result/timeout/concurrency budgets enforced before resource exhaustion |
| Deployment | Health/readiness behavior, proxy headers, route prefix, TLS and graceful stop |
| Harnesses | Actual versions plus discovery and safe tool call from each target host |

Use a disposable database/upstream stub for destructive test cases. Do not run
security fuzzing or production mutations against systems outside the user's scope.
A two-replica test is stronger evidence of stateless operation than merely checking
that no session header appears.

## Health layers

`healthz`: the process can answer; do not make every upstream failure restart it.
`readyz`: required local configuration and dependencies are usable for this
service's deployment policy. Use bounded checks, appropriate caching, and no
expensive external calls on every probe. Keep detailed dependency information
protected. Return 503 when truly not ready.

`system_health`: authenticated MCP round trip and a bounded safe status object.
`upstream read`: a fixture lookup through the real credentials, adapter, and API.
`harness test`: the same read from the actual interactive/automated client.

These layers answer different questions. None alone proves the others.

## Performance and compatibility record

Measure cold startup-to-first-success and warm request latency independently;
record test environment, sample size, concurrency, API latency, catalog size,
response sizes, and cache state. Set SLOs after measurements. Do not advertise
"instant" attachment or "works with any harness" without a tested boundary.

Record separate results for modern HTTP, SDK sessionless legacy HTTP, optional
stdio, OAuth, and Pi's chosen CLI/extension route. Use NOT RUN for unavailable
hosts. Repeat relevant tests after SDK, protocol, auth-provider, proxy, or harness
upgrades. Store regression fixtures without credentials or real customer data.

## Diagnostic policy limits

The CLI rejects URL credentials, query strings, fragments, cross-origin health
paths, redirects, and an environment-level TLS-verification bypass. These are
this utility's conservative policies, not additional universal MCP requirements.
The byte limit defaults to 1 MiB per response, the page cap to 20, the per-request
deadline to 10 seconds, and the argument-file limit to 256 KiB. These are configurable
probe budgets, not measured production performance or recommended MCP constants.

`--expect-server NAME` checks discovery metadata for an accidental endpoint
mismatch. A server-provided name is not cryptographic identity; TLS and credential
validation remain necessary. `list` may succeed while excluding malformed
header-annotated tools; inspect `rejectedTools`. The checker does not cache across
principals and does not claim every server-provided schema is fully validated.
