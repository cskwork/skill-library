# Package validation record

Verification date: **2026-09-19**  
Environment: **Linux; Node.js v22.16.0**  
Package: **stateless-mcp-builder 1.0.0**  
Protocol research baseline: **MCP 2026-07-28**

## Executed checks

| Check | Result | Evidence / scope |
|---|---|---|
| Diagnostic and installer JavaScript syntax | PASS | `node --check` on both scripts |
| Automated local fixture tests | PASS | **34 passed, 0 failed, 0 skipped**; retained TAP output in `tests/validation.tap` |
| CLI process behavior | PASS | Spawned real Node CLI; verified JSON output and exit codes |
| Skill installation helper | PASS | Temporary Claude Code, Codex, and Pi project directories; copies verified; overwrite and symlink checks |
| Agent Skills frontmatter | PASS | Name/directory match, name/description/compatibility bounds, string metadata |
| JSON and TOML assets | PASS | Parsed all supplied JSON and TOML examples |
| Markdown structure | PASS | Balanced fenced blocks and existing relative Markdown link targets |
| Documentation research | CHECKED | Official sources catalogued in `references/SOURCES.md`; dated baseline, not future freshness guarantee |

Fixture coverage includes the modern per-request wire metadata; absence of a
protocol handshake/session requirement; JSON and request-scoped SSE; Unicode and
routing-header encoding; catalog pagination; explicit safe-tool allowlisting;
authentication challenges; unsupported versions; malformed/incomplete results;
timeouts; response limits; idempotent diagnostic behavior (no automatic retry);
secret-safe error diagnostics; argument files; and project-local installation.
The tests implement purpose-built HTTP fixtures, not an official MCP server.
The recorded test duration is the suite runtime, not a production latency benchmark.

## Not executed / not established

**NOT RUN:** your application API, real credentials, real upstream integration,
OAuth login/refresh/revocation, Claude Code connection, Codex connection, Pi
connection or extension, legacy SDK interoperability, stdio bridging, deployment,
replica/restart tests, and real write/idempotency/tenant-isolation tests.

**NOT RUN:** macOS/Windows execution, evaluation of this skill by an actual coding
agent, generated-server compilation, and formal protocol conformance testing.
The commands are written to be portable; execution evidence here is Linux only.
On Windows, POSIX FIFO tests are explicitly skipped and a symlink test may be
skipped when its required privilege is unavailable.

This package creates neither an app server nor an authenticated host connection.
It supplies the build workflow, setup/reference material, templates, and a tested
restricted diagnostic CLI. The generated project must satisfy the remaining
acceptance gates with its actual SDK, backend, identity provider, and harnesses.

## Reproduce

From the extracted `stateless-mcp-builder` directory:

```sh
node --check scripts/mcp-check.mjs
node --check scripts/install-skill.mjs
node --test tests/mcp-check.test.mjs
node scripts/mcp-check.mjs --help
```

No npm install is required for these utilities. Review scripts before executing.
Refer to `references/HUMAN-SETUP.md` for use against an authorized real endpoint.
