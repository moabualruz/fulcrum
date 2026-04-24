---
title: "GitHub Copilot CLI extension surface — research snapshot 2026-04-21"
type: reference
date: 2026-04-21
sources:
  - /usr/share/doc/github-copilot-cli-bin/CHANGELOG.md (v1.0.32 installed on host)
  - copilot --help (live binary)
  - copilot help config (live binary)
  - agent-integration/copilot/ (current Fulcrum install surface)
---

# GitHub Copilot CLI — extension surface reference

**Target:** The standalone `copilot` binary (GitHub Copilot CLI), NOT the VS Code
Copilot extension. These are two different products with different extension surfaces.
Installed as `github-copilot-cli-bin` on this host; v1.0.32.

## 1. Repository-wide custom instructions

File: `.github/copilot-instructions.md`

- Auto-loaded for every session in the repo.
- Also reads `AGENTS.md` (and `.github/CLAUDE.md`, `.github/GEMINI.md`) from every
  directory level up to the git root.
- Avoids sending duplicate files (e.g. `copilot-instructions.md` + `CLAUDE.md` with
  identical content) — deduped since v1.0.26.

## 2. Path-scoped instructions

File pattern: `.github/instructions/*.instructions.md`

Frontmatter:
```yaml
---
applyTo: "src/**/*.ts"   # glob — required
description: "..."       # string — shown in context table
---
```

- CLI injects matching files into context when the active file matches `applyTo`.
- Discovered at every directory level from cwd up to git root (monorepo support).
- Since v1.0.26: files with `applyTo` patterns consolidated into a table to reduce
  token waste instead of inlining full content per turn.
- **Valid for Copilot CLI.** Fulcrum emits 33 `fulcrum-skill-*.instructions.md` files
  here with `applyTo: "**"`.

## 3. Custom agents (`.github/agents/*.agent.md`)

File pattern: `.github/agents/*.agent.md`

Frontmatter:
```yaml
---
name: Software Engineer
description: "L2 implementation specialist…"
model: claude-sonnet-4-6
skills:
  - skill-name
agents:
  - other-agent   # delegation list (for CoS)
---
```

Discovery paths:
- `~/.copilot/agents/` — user-level
- `.github/agents/` — repo-level (auto-discovered up to git root)
- Organisation `.github` repo

Access: `copilot --agent <name>` or `/agent` interactive command.

**Valid for Copilot CLI.** Fulcrum emits 24 `<role>.agent.md` files.

## 4. Skills

Files in skill discovery directories, each containing `SKILL.md`:

- `~/.agents/skills/<name>/SKILL.md` — personal (user-level)
- `~/.copilot/skills/<name>/SKILL.md` — also personal
- `.agents/skills/<name>/SKILL.md` — project-level (discovered up to git root)

Frontmatter:
```yaml
---
name: skill-name
description: "What this skill does"
---
```

Agents can declare `skills:` in their frontmatter to eagerly load skills at startup.
Invocable interactively via `/skills` command.

**Note:** Fulcrum uses `.github/instructions/*.instructions.md` (path-scoped) rather
than a separate `.agents/skills/` directory, because the instructions surface auto-injects
without requiring the user to explicitly invoke `/skills add`.

## 5. Hooks

File: `.github/hooks/*.json` (repo-level) or `~/.copilot/hooks/` (user-level).
Also readable from `.claude/settings.json` and `~/.copilot/config.json`.

Format — Claude Code nested matcher/hooks structure:
```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Write", "hooks": [{ "type": "command", "command": "..." }] }
    ],
    "PostToolUse": [...],
    "SessionStart": [...],
    "SessionEnd": [...]
  }
}
```

Tool name matchers: **Claude Code-style** (`Write`, `Edit`, `Bash`), NOT VS Code-style
(`create_file`, `replace_string_in_file`).

Event names: PascalCase (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`,
`PermissionRequest`, `SessionStart`, `SessionEnd`). CLI sends VS Code-compatible
snake_case payloads (`hook_event_name`, `session_id`, ISO 8601 timestamps).

## 6. MCP integration

File: `.mcp.json` at the repo root (or any level up to git root).

```json
{
  "mcpServers": {
    "server-name": {
      "command": "cmd",
      "args": ["..."],
      "type": "stdio"
    }
  }
}
```

- **`.vscode/mcp.json` removed as a config source in v1.0.22.** A migration hint
  appears when `.vscode/mcp.json` is detected without `.mcp.json`.
- User-level: `~/.copilot/mcp-config.json`
- Supports Claude-style `.mcp.json` format without `mcpServers` wrapper.

## 7. Plugins

Installed via `copilot plugin install <source>`. A plugin is a GitHub repo or
subdirectory containing a `plugin.json` manifest. Plugins can bundle:
skills, agents, hooks, MCP servers, LSP servers.

Not used by Fulcrum's repo-level install — Fulcrum uses the native file paths above.

## 8. AGENTS.md

Standard OpenAgents/agentsmd format. Loaded at every directory level up to git root.
Fulcrum emits an `AGENTS.md` at the copilot integration root with a `BEGIN FULCRUM
managed-block` section.

## 9. Slash commands / prompts

`.github/prompts/*.prompt.md` is **not** a Copilot CLI surface — it's VS Code only.
The CLI exposes skills as slash-selectable items via `/skills`. No user-extensible
slash commands.

## 10. Privacy note

2026-04-24 policy change: Free/Pro/Pro+ interaction data trains models by default
for public repos. Auto-loaded instruction files on public repos are an exfil vector.
Fulcrum ships a `copilot-instructions.public.md` sanitized variant that strips
internal infrastructure URLs (MCP host, monitor port, etc.).

## Implications for Fulcrum parity plan

- **MCP**: `.mcp.json` (not `.vscode/mcp.json`) — **source already corrected (PR 10)**
- **Agents**: `.github/agents/*.agent.md` — **24 role files emitted (PR 10)**
- **Skills**: `.github/instructions/fulcrum-skill-*.instructions.md` × 33 with `applyTo: "**"` — **emitted (PR 10)**
- **Hooks**: `.github/hooks/fulcrum.json` with Claude Code matcher format — **emitted (PR 10)**
- **Installer**: `installCopilot()` in `install.ts` — **added (PR 10)**
