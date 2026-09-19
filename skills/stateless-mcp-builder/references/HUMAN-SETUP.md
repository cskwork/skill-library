# Human manual: install the skill, build a server, connect a harness

This package is a reusable build skill plus diagnostic utilities. It is **not** an
already deployed MCP server and has no knowledge of your actual API routes,
credentials, or production domain. The build agent must generate project-specific
commands and replace examples after inspecting your application.

## 1. Install the skill

Unpack the archive and place the whole `stateless-mcp-builder` folder in the
appropriate project skill directory listed in `HARNESSES.md`. Alternatively use
the bundled copy helper from your repository root:

```sh
node /path/to/stateless-mcp-builder/scripts/install-skill.mjs --target claude
node /path/to/stateless-mcp-builder/scripts/install-skill.mjs --target codex
node /path/to/stateless-mcp-builder/scripts/install-skill.mjs --target pi
```

Run only the commands for the hosts you use. The helper is project-local, refuses
to overwrite an existing destination, and does not install dependencies, edit MCP
configuration, or connect to external services. Review all scripts before running.
On Windows the same Node commands work with quoted Windows paths.

Start the host and use its invocation form, followed by a task such as:

> Build a stateless MCP interface for this web app's approved APIs. Inspect the
> repository and keep its stack. Use modern Streamable HTTP with sessionless legacy
> compatibility. Begin with read-only tools. Produce locked dependencies, human and
> agent setup manuals, Claude Code/Codex/Pi attachment, and real connection checks.
> Do not enable writes without the application's authorization and approval flow.

## 2. Supply project information, not secrets in chat

Give the agent access to the repository, API specification/service code, target
deployment environment, approved operations, and existing authentication policy.
Have it identify the exact runtime and lockfile. Create a synthetic test account
and fixture resource with no private customer data.

The finished project manual must contain the actual dependency install, build,
start, stop, and deploy commands. For example `npm ci` is appropriate only after
that project has a valid npm lockfile; it is not a command to run in this skill
folder, which has no npm dependencies or server entry point.

For missing API credentials, complete fixture tests first and leave real upstream
checks marked NOT RUN. Do not allow the agent to treat a mock response as live.

## 3. Configure endpoint and credentials

Once the server exists, set the real endpoint and a scoped token in the same
launcher environment used by the harness. Prefer a secret manager or the host's
OAuth flow. These examples use an interactive prompt to avoid typing the token in
shell history; environment variables are still accessible to the local process.
Do not enable shell tracing or save a terminal transcript during secret entry.

Bash:
```sh
export MCP_URL='http://127.0.0.1:3000/mcp'
read -rsp 'MCP token: ' APP_MCP_TOKEN; printf '\n'
export APP_MCP_TOKEN
```

PowerShell:
```powershell
$env:MCP_URL = 'http://127.0.0.1:3000/mcp'
$secure = Read-Host 'MCP token' -AsSecureString
$env:APP_MCP_TOKEN = [System.Net.NetworkCredential]::new('', $secure).Password
Remove-Variable secure
```

The URL above is only a local convention. Remote endpoints must use HTTPS. Do not
put a token in the URL. Do not publish a local dev server to the internet by
changing its bind address before production authentication is implemented.

The diagnostic CLI reads these variables at runtime; it does not automatically
load `.env`. The `.env.example` asset contains names and safe placeholders only.
A missing token is an error unless `--anonymous` is explicitly selected for a
controlled fixture. Anonymous mode is not an authentication workaround.

## 4. Verify the server before attaching a harness

Prerequisite for the bundled CLI: Node.js 22 or newer. From the extracted package:

```sh
node --test tests/mcp-check.test.mjs
node scripts/mcp-check.mjs doctor \
  --tool system_health --allow-tool system_health --require-auth
```

Use a single line in PowerShell, or its backtick line continuation rather than
Bash's backslash. The doctor reads `MCP_URL` and `APP_MCP_TOKEN` by default.

It checks conventional `/healthz` and `/readyz`, modern `server/discover`, all
bounded pages of `tools/list`, a specifically approved safe tool call, and rejection
of unauthenticated tool discovery with a Bearer challenge when `--require-auth` is set. Expected exit code:
0 for the selected checks passing; 1 for a failed check; 2 for invalid invocation
or an incomplete probe. Read the JSON report; do not infer success from exit alone.

Readiness is checked with your credential; liveness is checked without it. For a
proxy subpath, use `--health-path /prefix/healthz --ready-path /prefix/readyz`.
These endpoints must return JSON objects with `status: "ok"` and
`status: "ready"`, respectively. `system_health` must return structured data with
`ok: true`. These are this skill's conventions, not universal MCP requirements.

Then verify a safe **upstream-backed read**, using a reviewed tool from your actual
catalog and synthetic arguments stored in a JSON file:

```sh
node scripts/mcp-check.mjs list
node scripts/mcp-check.mjs call --tool material_get \
  --allow-tool material_get --args-file ./mcp-read-fixture.json
```

The example tool/file must exist in your generated project. Do not copy it as a
claim that your API already has such a tool. Full call output may contain returned
data; run only with permitted test data and do not publish private reports.

## 5. Attach and test the real harness

Follow `HARNESSES.md`. Claude Code/Codex use their own native configurations. Pi
uses the generated consumer skill or a reviewed extension. Restart the actual
launcher after updating environment variables; a desktop process or container
may not inherit your terminal's environment.

Inside the host, discover the tool and invoke `system_health`, then the synthetic
upstream read. Record the host version, endpoint, wire revision, server version,
and result. Do not approve arbitrary operations to fix a failing read-only test.

## 6. Diagnose by layer

| Symptom | Next safe check |
|---|---|
| DNS, TLS, refused connection, timeout | Correct host/port, process, firewall, proxy, CA trust; never disable TLS verification |
| 404, redirect, or HTML response | Correct `/mcp` path; bypass a browser login page with the proper API auth route |
| 401 | Token missing/expired/wrong audience; reauthenticate in the actual launch environment |
| 403 | Check operation scope, tenant policy, Origin and Host; do not grant admin globally |
| Protocol-version error | Inspect advertised versions and SDK/harness versions; use the documented compatibility posture |
| Health works, no tools | Check protected discovery, allowlist, disabled tools, or stale host catalog |
| Tools list, tool fails | Check input schema, ownership, upstream credentials, and correlated server logs |
| JSON is valid but `isError` is true | The tool failed; inspect the sanitized application error |
| Tool reports `input_required` | Additional interaction is needed; this CLI does not complete that flow |
| Works in CLI, fails in harness | Different environment/network namespace, approval, credentials, or protocol profile |
| Timeout during write | Check idempotency/job status; do not blindly rerun |

## 7. Stop, remove, and revoke

Stop the process using the command documented by the generated project. Remove
only this server's harness entry. Revoke its credential through the issuer; simply
removing a config file does not revoke access. Unset local environment variables,
delete synthetic fixture data through an approved workflow, and preserve required
audit records. Roll back code using the deployment system's normal release flow.
