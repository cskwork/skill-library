# Source register

Checked **2026-09-19**. These are official specifications, SDK documentation, and
project-owner documentation. Recheck the latest stable revision and installed
versions each time the skill is used. No claim is made that a harness was run in
this delivery environment. The package adds original engineering conventions and
test tooling; those conventions are not requirements of the MCP specification.

| ID | Source and purpose | URL |
|---|---|---|
| S1 | MCP 2026-07-28 changelog; removed lifecycle, current features | `https://modelcontextprotocol.io/specification/2026-07-28/changelog` |
| S2 | MCP versioning and compatibility; modern vs legacy behavior | `https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning` |
| S3 | Streamable HTTP; headers, metadata, JSON/SSE, Origin | `https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http` |
| S4 | Discovery; request and result shape | `https://modelcontextprotocol.io/specification/2026-07-28/server/discover` |
| S5 | Official TypeScript SDK; current v2 release line and packages | `https://github.com/modelcontextprotocol/typescript-sdk` |
| S6 | SDK HTTP factory and auth context | `https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html` |
| S7 | SDK Express adapter and Host/Origin handling | `https://ts.sdk.modelcontextprotocol.io/v2/serving/express.html` |
| S8 | SDK resource-server auth integration | `https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization.html` |
| S9 | SDK sessions, state, and horizontal scaling | `https://ts.sdk.modelcontextprotocol.io/v2/serving/sessions-state-scaling.html` |
| S10 | SDK stateless legacy compatibility posture | `https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients.html` |
| S11 | Pi project README; no native MCP, skills and extensions | `https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/README.md` |
| S12 | Claude Code MCP configuration, environment expansion, checks | `https://code.claude.com/docs/en/mcp` |
| S13 | Codex MCP configuration and authentication | `https://developers.openai.com/codex/mcp` |
| S14 | Codex skill structure and project discovery | `https://developers.openai.com/codex/skills` |
| S15 | Claude Code skill paths and invocation | `https://code.claude.com/docs/en/skills` |
| S16 | MCP tool definitions, results, annotations, caching | `https://modelcontextprotocol.io/specification/2026-07-28/server/tools` |
| S17 | MCP authorization | `https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization` |
| S18 | MCP security best practices | `https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices` |
| S19 | SDK tool error patterns | `https://ts.sdk.modelcontextprotocol.io/v2/servers/errors.html` |
| S20 | Pi extension authoring | `https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md` |
| S21 | Agent Skills format specification | `https://agentskills.io/specification` |

S13/S14 redirected to official ChatGPT Learn pages during verification. Preserve
the source identity and check any subsequent redirect before trusting new content.

## Freshness procedure for generated projects

Inspect the latest stable spec and official release notes, then check package
registry metadata and the installed SDK's exports. Record exact versions and
lockfile checksums in the project, not guesses in this package. Check each actual
harness with its version command and connection test. Drafts, beta releases, main
branches, and example snippets are not interchangeable with a stable installed
artifact. Preserve an existing tested version until an upgrade is deliberately
validated.
