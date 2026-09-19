# Harness attachment recipes

Checked against official documentation on 2026-09-19. Verify installed versions
and `--help` before applying. Native MCP support does not establish support for a
particular protocol revision; complete the compatibility table with real calls.

## Claude Code: native HTTP

Merge `assets/claude.mcp.example.json` into the project's `.mcp.json` without
replacing other servers. Set `MCP_URL` and a dedicated `APP_MCP_TOKEN` in the
launcher environment. The file uses Claude Code's documented variable expansion.
Do not use a model-provider credential as the MCP token. [S12]

```json
{
  "mcpServers": {
    "webapp-api": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer ${APP_MCP_TOKEN}" }
    }
  }
}
```

For OAuth instead, omit the static Authorization header and register the endpoint:
```sh
claude mcp add --transport http --scope project webapp-api https://api.example.com/mcp
claude mcp get webapp-api
claude mcp list
```
Run `/mcp` inside Claude Code to authorize/check the connection. Review project
trust and server approval prompts. Actually invoke `system_health` and a reviewed
read-only API tool. Registration success alone does not prove authentication. [S12]

## Codex: native HTTP

Merge the following into `~/.codex/config.toml`, or an appropriate trusted
project-scoped configuration supported by the installed version. Do not paste
this TOML into `.mcp.json`. [S13]

```toml
[mcp_servers.webapp_api]
url = "https://api.example.com/mcp"
bearer_token_env_var = "APP_MCP_TOKEN"
startup_timeout_sec = 20
tool_timeout_sec = 30
```

Replace the example URL. The bearer field contains the **variable name**, not its
value. Start Codex from an environment containing that variable. For OAuth, remove
the bearer line and use `codex mcp login webapp_api`. Run `codex mcp list`, inspect
`codex mcp --help`, and use `/mcp` in the interactive client. Verify a real tool call;
a listed configuration is not connectivity evidence. [S13]

The sample timeout values are project defaults, not official recommended values.
Restrict enabled tools to the appropriate environment once the real catalog is
known. Keep normal approvals; never disable them just to make a smoke test pass.

## Pi: CLI-backed skill first; extension when native tool UX is needed

Pi's own documentation says core does not include MCP. It supports skills and
extensions. Do not invent `pi mcp add`, `~/.pi/mcp.json`, or native OAuth behavior.
Installing the builder skill does not register remote tools. [S11]

For the smallest integration, generate a project **consumer** skill from
`assets/PI-CONSUMER-SKILL.template.md`. Configure the endpoint and token in the Pi
launch environment, then have that skill invoke the bundled CLI:

```sh
node /absolute/path/to/stateless-mcp-builder/scripts/mcp-check.mjs list
node /absolute/path/to/stateless-mcp-builder/scripts/mcp-check.mjs call \
  --tool system_health --allow-tool system_health
```

This is Pi using its shell to run a bounded MCP client, **not native MCP tool
registration**. The agent must first read the relevant tool schema, use a reviewed
allowlist, and send arguments through a JSON file rather than constructing shell
commands from untrusted text. Endpoint/auth errors fail closed. The CLI does not
perform OAuth login or refresh; provision a short-lived scoped token externally.

For native named tools in Pi, create a reviewed extension using the pinned
`@modelcontextprotocol/client` SDK and the installed Pi extension API. Check Pi's
current extension package/import names from its docs; do not assume a historic
package name. [S11, S20]

The extension must authenticate before discovery, filter a configured allowlist,
validate/translate schemas without widening them, preserve stable names and
errors, forward cancellation, bound time/results, and close resources on shutdown.
Use the SDK for protocol negotiation/OAuth rather than expanding the tiny CLI into
a general client. Confirm write approvals with server-side policy; Pi core's lack
of permission popups makes server authorization particularly important.

## Other harnesses and stdio-only hosts

Distribute `assets/connection.example.json` as a **project manifest**, not as a
claimed universal harness config. Convert its values using each client's actual
documentation. Verify HTTP support, auth mechanism, revision, tool schema handling,
result parsing, cancellation, and approvals in that host.

A stdio-only client needs a tested stdio server or reviewed stdio-to-HTTP adapter.
Use pinned dependencies and the same authorized service layer. Use absolute
paths, document the working directory, and keep stdout exclusively for protocol
messages. Do not assume environment interpolation or a remote bridge package is
supported without testing. `mcp-check.mjs` is not a stdio bridge.

## Skill installation is separate

Copy the entire `stateless-mcp-builder/` directory, not only its entry file:

| Host | Project location | Invocation |
|---|---|---|
| Claude Code | `.claude/skills/stateless-mcp-builder/` | `/stateless-mcp-builder` |
| Codex | `.agents/skills/stateless-mcp-builder/` | `$stateless-mcp-builder` |
| Pi | `.pi/skills/stateless-mcp-builder/` | `/skill:stateless-mcp-builder` |

These are documented skill locations and invocation forms. Restart/reload the
host as needed when a newly created directory is not discovered. The package uses
standard frontmatter without broad pre-approved tool permissions. [S14, S15, S11]
