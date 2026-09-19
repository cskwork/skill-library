---
name: stateless-mcp-builder
description: Build, migrate, or audit stateless MCP servers that expose a web application's approved APIs as typed tools. Use for MCP transport, authentication, tool design, Claude Code/Codex/Pi attachment, setup manuals, and end-to-end connection diagnostics. Do not use for arbitrary unrestricted HTTP proxies or ordinary API work without MCP.
license: MIT
compatibility: Works as an Agent Skills directory. Requires repository access and current official documentation for implementation. Bundled diagnostic CLI requires Node.js 22 or newer and network access to the chosen MCP endpoint; no npm dependencies.
metadata:
  version: "1.0.0"
  verified-on: "2026-09-19"
  protocol-baseline: "2026-07-28"
---

# Stateless MCP builder

Build an MCP interface to an existing web application's service layer, not a second
business backend. Optimize for safe API execution, quick attachment, small tool
catalogs, and independently verifiable operations. Produce working code, a human
manual, an agent manual, and evidence of the checks actually run.

## 1. Establish the implementation contract

Inspect the repository before making architectural changes. Identify its language,
runtime, lockfile, API/OpenAPI definitions, authentication, tenancy rules, service
layer, deployment environment, and tests. Preserve existing stack conventions;
TypeScript is the fallback for a new project, not a requirement to rewrite one.

Record the MCP endpoint, approved API operations, read/write scopes, expected
harnesses, hosting constraints, and safe test identity. Use clearly marked local
fixtures when real credentials or API definitions are unavailable. Never invent a
live endpoint, successful call, package version, or completed deployment.

Installing this skill does not install or connect an MCP server. Treat **skill
installation**, **server implementation**, and **harness attachment** as separate
steps. Do not change a user's global harness configuration without authorization.

## 2. Recheck protocol and dependency facts

Read [the protocol reference](references/PROTOCOL.md) and the official sources in
[the source register](references/SOURCES.md). At implementation time, verify the
latest **stable** specification, SDK release, and target harness documentation.
Record the date, exact package versions, source URLs, and actual CLI versions in
`docs/mcp/VERSION-LOCK.md`. A date-based protocol revision and an npm version are
not interchangeable. Commit an exact dependency manifest and lockfile.

Baseline verified 2026-09-19:
- MCP **2026-07-28** is the modern stateless protocol revision. Modern requests do
  not require `initialize`, `notifications/initialized`, or `Mcp-Session-Id`.
- Use Streamable HTTP at one `/mcp` endpoint. Prefer ordinary JSON responses for
  short API operations; request-scoped SSE is still valid.
- The official TypeScript v2 packages are `@modelcontextprotocol/server` and
  `@modelcontextprotocol/client`. `createMcpHandler(factory)` is the documented
  HTTP entry point. Do not mix v1 imports or lifecycle examples into v2 code.
- For broad compatibility, explicitly choose its `legacy: 'stateless'` posture;
  choose `legacy: 'reject'` only for a tested modern-only deployment. Legacy
  handshake compatibility does not turn the modern path into a sessionful server.
- Pi core does not provide native MCP attachment. Supply a CLI-backed skill or a
  reviewed extension; do not invent `pi mcp add` or a native MCP configuration file.

Sources: [S1–S6, S11](references/SOURCES.md). Revalidate rather than blindly copying
this dated baseline. When offline, retain the baseline and label freshness
unverified; do not assert it is still the latest.

## 3. Select a minimal, reusable architecture

Follow [architecture and security](references/ARCHITECTURE-SECURITY.md) and
[the web-app integration recipe](references/WEBAPP-INTEGRATION.md).

```text
Browser UI -> authenticated web backend / agent orchestrator
                                |
Claude Code / Codex ----------> MCP /mcp -> policy -> domain services -> APIs
Pi CLI skill / extension ---->     |
                              shared database / job store where needed
```

Use the same domain functions for REST and MCP where they live in the same
application. For a separately deployed adapter, call only configured, allowlisted
upstream APIs with a typed client. The browser must not receive service secrets.
MCP is an additional tool interface, not a reason to route ordinary UI requests
through an LLM or through MCP.

Keep caller identity and authorization request-scoped. Reuse safe connection pools
and immutable definitions, not mutable per-user headers or a shared transport.
Store jobs, business records, approvals, and idempotency results in durable storage
when cross-request persistence is needed. Do not add sticky routing or a protocol
session store. External application state is compatible with a stateless protocol.

## 4. Curate tools instead of exposing a generic HTTP executor

For every tool, write an entry based on `assets/tool-contract.example.json` before
implementing its handler. Specify purpose, when not to use it, bounded input and
output schemas, API mapping, scopes, object authorization, side effects, timeout,
idempotency policy, examples, and a test fixture.

Prefer narrow names such as `materials_search`, `material_get`, and
`assignment_create`. Never expose arbitrary URLs, methods, headers, raw SQL,
filesystem paths, or executable code just because the upstream API permits them.
Do not automatically expose an entire OpenAPI document. Audit the chosen subset.

Validate inputs at runtime and validate structured outputs before returning them.
Use object-shaped outputs and uncomplicated schemas for cross-harness portability,
even when the protocol supports more expressive schemas. Keep results compact,
paginate collections, preserve Unicode, and return stable resource identifiers.
Use concise text alongside structured data when useful to a host.

Set truthful read-only/destructive/idempotent/open-world annotations. An annotation
is a hint, never an authorization or confirmation mechanism. Business/API errors
must be distinguishable from malformed MCP requests; document safe recovery steps.
Never represent an upstream failure as an empty successful result.

## 5. Enforce trust boundaries and reliable writes

Authenticate every protected request. Derive the user and tenant from validated
credentials and application policy, not tool arguments. Enforce operation scopes
and object ownership in the handler/service even when discovery hides a tool.

For remotely shared deployments, implement the current MCP OAuth resource-server
flow with a real identity provider. Separate MCP tokens from upstream API tokens;
validate issuer, signature, audience/resource, expiration, and scopes. A local
bearer credential is a development option, not an OAuth implementation. Never log,
commit, expose in browser bundles, or pass secrets as tool arguments.

For consequential writes, require authenticated approval bound to the operation,
normalized payload hash, resource version, actor, tenant, expiry, and replay policy.
`confirmed: true` supplied by a model is not approval. Preserve the upstream
transaction and idempotency guarantees. Retrying an uncertain write must not
create a second side effect. See the write algorithm in the security reference.

Set bounded request sizes, result sizes, execution deadlines, outbound destination
allowlists, and per-principal rate limits. Validate Origin/Host, reject unexpected
redirects, redact logs, and apply a server-side kill switch for writes.

## 6. Implement the transport with the supported SDK

Use the SDK's request-scoped HTTP factory and runtime adapter. Let the SDK handle
protocol metadata, routing-header validation, result envelopes, error mapping,
and the explicitly selected compatibility posture. Keep the factory cheap and
side-effect-free. Test response and request sizes against the chosen proxy.

Implement conventional HTTP `GET /healthz` and `GET /readyz`, plus a reviewed,
read-only `system_health` MCP tool. These three names are this skill's operational
convention, **not MCP standard methods**. A health call must never create a record,
send a message, charge money, or require customer data.

Long operations must use durable jobs and a status tool, or a verified optional
Tasks extension. Do not keep an HTTP request open indefinitely. Do not add
subscriptions, sampling, roots, or optional UI extensions to basic API tooling
without a justified, tested requirement.

## 7. Deliver attachment and setup manuals

Create project-specific versions of:
- `docs/mcp/HUMAN-SETUP.md`, following [the human manual](references/HUMAN-SETUP.md).
- `docs/mcp/AGENT-SETUP.md`, following [the agent manual](references/AGENT-SETUP.md).
- `docs/mcp/COMPATIBILITY.md`, using `assets/compatibility.example.json` as the
  machine-readable companion. Mark unknown or unrun combinations honestly.

Include prerequisites; exact locked installation, build, start, and stop commands;
all environment variable names and owners; local/remote URLs; auth provisioning;
Claude Code and Codex snippets; the Pi CLI/extension route; smoke checks; expected
results; troubleshooting; credential revocation; and rollback.

Follow [harness attachment](references/HARNESSES.md). Prefer a remote URL for native
HTTP clients. Supply stdio only when required, using the same domain logic, not a
second implementation. A process-launching stdio adapter must emit protocol output
only on stdout; logs belong on stderr.

Give other harnesses a transport-neutral connection manifest and verify their own
schema. Do not claim that all clients accept the same JSON or that every harness
supports the latest wire revision. Register a server once; merge configurations
without overwriting other entries or approvals.

## 8. Verify from the caller's actual environment

Follow [verification](references/VERIFICATION.md). Run checks from the same runtime
or container and credential environment as the intended harness.

A connection is not proven by a config file, `200 /healthz`, or a listing command.
Require protocol discovery, the expected tool inventory, and a real safe tool call.
Verify protected access without credentials is rejected. Also verify a read-only
upstream operation: a local health response alone does not prove API credentials.

The bundled `scripts/mcp-check.mjs` supplies a dependency-free **modern HTTP** probe
and bounded CLI call path. It is not a full SDK, OAuth client, protocol conformance
suite, or stdio bridge. Do not use it to pretend untested SDK/harness integration
has passed. It intentionally never falls back to a legacy protocol silently.

Run its fixture tests with:
```sh
node --test <skill-directory>/tests/mcp-check.test.mjs
```

Run a reviewed health probe with:
```sh
node <skill-directory>/scripts/mcp-check.mjs doctor \
  --url "$MCP_URL" --token-env APP_MCP_TOKEN \
  --tool system_health --allow-tool system_health --require-auth
```

Record per-check PASS/FAIL/SKIP, protocol revision, server identity, latency, and
safe diagnostic codes. Test authorization isolation, retry deduplication, body
limits, Origin rejection, cancellation, graceful shutdown, and replica/restart
independence. Measure cold attachment separately from warm tool latency. Never
substitute fabricated benchmark numbers for a measurement.

## 9. Completion gate and handoff

Do not mark the integration done unless the applicable checks actually passed.
Provide code and lockfile; tool contracts; both manuals; compatibility results;
redacted probe output; and known limitations. Use
`assets/HANDOFF.template.md` for the final report.

When secrets, external access, or a harness are unavailable, finish all independent
work and mark the blocked checks **NOT RUN** with the exact missing prerequisite.
Distinguish a fixture-tested implementation from a deployed, authenticated,
harness-tested integration. Never ask for credentials in chat.
