# Stateless MCP Builder — skill package

A reusable Agent Skills package for implementing stateless MCP interfaces around
approved web-app APIs, with human/agent setup instructions and a modern HTTP
connection checker. Research baseline: **2026-09-19 / MCP 2026-07-28**.

## Start here

Read `references/HUMAN-SETUP.md`. Install this directory in the desired host's
project skill location using `scripts/install-skill.mjs`, then invoke the skill.
The entry point is `SKILL.md`; keep its referenced files beside it.

This package is **not a deployed MCP server**. The skill instructs your coding
agent to implement one in your existing app, respecting its API and security
model. The included diagnostic CLI has no npm dependencies and requires Node.js
22 or newer. No external account or API credential is bundled.

## Included

- `SKILL.md`: build/migrate/audit workflow and completion gates.
- `references/`: modern protocol, web-app integration, architecture/security, harness recipes, human
  setup, agent setup, verification, and official source register.
- `scripts/mcp-check.mjs`: modern HTTP discover/list/call/doctor utility.
- `scripts/install-skill.mjs`: project-local, no-overwrite copy helper.
- `assets/`: Claude/Codex config examples, connection and compatibility manifests,
  tool contract, Pi consumer skill, environment and handoff templates.
- `tests/`: local fixture tests for the diagnostic client.
- `VALIDATION.md`: checks run for this package and important limitations.

## Test the diagnostic utility

```sh
node --test tests/mcp-check.test.mjs
node scripts/mcp-check.mjs --help
```

After your server exists and environment variables are configured:

```sh
node scripts/mcp-check.mjs doctor \
  --tool system_health --allow-tool system_health --require-auth
```

Expected environment: `MCP_URL`, `APP_MCP_TOKEN`. Do not include token values in
commands, documentation, or chat. Read the human manual for secure entry and the
exact health response conventions.

Native harness attachment is documented, not preconfigured. Pi uses a CLI-backed
skill or a separately reviewed extension, not fictional native MCP support.
The doctor is a restricted probe, not a replacement for an official SDK client or
a protocol conformance suite. See `references/VERIFICATION.md`.

License: MIT for original package contents. Referenced external projects retain
their own licenses. No third-party source distribution or runtime dependencies
are included.
