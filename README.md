# skill-library

A public library of Agent Skills for coding agents (Claude Code, Codex CLI, Pi).
Each skill is a self-contained directory you copy into your project — no
frameworks, no runtime dependencies, no telemetry.

**Landing page:** <https://cskwork.github.io/skill-library/>

## Skills

| Skill | Version | Description |
|---|---|---|
| [stateless-mcp-builder](skills/stateless-mcp-builder/) | 1.0.0 | Build, migrate, or audit stateless MCP servers that expose a web application's approved APIs as typed tools. |

## Install a skill

```sh
git clone https://github.com/cskwork/skill-library.git
node skill-library/skills/stateless-mcp-builder/scripts/install-skill.mjs \
  --target claude --project /path/to/your-app
```

Targets: `claude` (`.claude/skills`), `codex` (`.agents/skills`), `pi` (`.pi/skills`).
The installer copies files only — it never overwrites, installs packages, edits
MCP configuration, or connects a server.

Or copy the skill directory manually into your harness's skills folder.

## Conventions

- Entry point is `SKILL.md`; keep its `references/`, `scripts/`, `assets/`, and
  `tests/` beside it.
- Every skill records a dated research baseline and a validation record
  (`VALIDATION.md`).
- Skills are MIT licensed.

## Adding a skill

Create `skills/<skill-name>/` with a `SKILL.md` entry point and a short
`README.md`, then update the table above and the catalog on `index.html`.
