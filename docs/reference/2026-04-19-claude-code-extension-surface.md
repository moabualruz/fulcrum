---
title: "Claude Code extension surface — research snapshot 2026-04-19"
type: reference
date: 2026-04-19
sources:
  - docs.anthropic.com/en/docs/claude-code (verified via superpowers-developing-for-claude-code:working-with-claude-code skill, docs mirror dated 2026-04)
  - packages/cli/src/mcp-tools.ts (current Fulcrum MCP surface, 32 tools)
  - agent-integration/claude/, agent-integration/skills/ (current install surface)
---

# Claude Code — extension surface reference

Authoritative snapshot for the cross-agent parity plan. Cites file paths + exact field names. Do not paraphrase; re-fetch if a field seems off.

## 1. Hooks

Config path: `~/.claude/settings.json` (user), `.claude/settings.json` (project), `.claude/settings.local.json` (local, not committed), `${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json` (plugin).

Schema:

```json
{
  "hooks": {
    "EventName": [
      { "matcher": "ToolPattern", "hooks": [ { "type": "command", "command": "...", "timeout": 30 } ] }
    ]
  }
}
```

- `matcher` (PreToolUse/PostToolUse only): exact / regex / `*` / empty.
- `type`: only `"command"` is supported today.
- `timeout`: seconds, per-command.
- Plugin hooks: env vars `${CLAUDE_PLUGIN_ROOT}` + `${CLAUDE_PROJECT_DIR}`.

Events (complete list):
- `PreToolUse`, `PostToolUse` (matcher-based)
- `UserPromptSubmit` (no matcher)
- `Notification` (no matcher)
- `Stop`, `SubagentStop` (no matcher)
- `SessionStart`, `SessionEnd` (no matcher)
- `PreCompact` (matchers: `manual`, `auto`)

Capabilities:
- `PreToolUse` CAN block via non-zero exit + JSON `{"decision": "block", "reason": "..."}`.
- `UserPromptSubmit` CAN inject additional context into the model's input.
- `PostToolUse` is observable (cannot undo the tool call, CAN inject a follow-up system message).
- `PreCompact` fires before compaction so you can capture state.

Multiple hooks matching the same event run **in parallel**. Stdin/stdout contract: hook receives JSON on stdin; returns JSON on stdout (or empty on success).

## 2. Sub-agents

Location: `.claude/agents/<name>.md` (project) → `~/.claude/agents/<name>.md` (user) → plugin `agents/` → CLI `--agents '{...}'`. Project wins on conflict.

Frontmatter:
```yaml
---
name: my-agent            # lowercase + hyphens
description: ...           # required — what triggers this sub-agent
tools: Read, Grep, Bash    # optional comma list; omit to inherit all
model: sonnet|opus|haiku|inherit  # optional
---
```

Body = system prompt. Each sub-agent runs in an isolated context window. Plugin-provided agents go in `agents/` dir under plugin root (`${CLAUDE_PLUGIN_ROOT}/agents/`).

## 3. Skills

Location: `.claude/skills/<ns>/<name>/SKILL.md` (project) + `~/.claude/skills/<ns>/<name>/SKILL.md` (user) + plugin bundles. Directory form — each skill is its own folder with `SKILL.md` + optional `scripts/`, `references/`, `templates/`.

Frontmatter:
```yaml
---
name: Skill Name
description: What it does + WHEN to use it (critical — this is how Claude decides to invoke)
allowed-tools: Read, Grep, Glob        # optional — restricts tools while skill is active
---
```

Skills are **model-invoked** — Claude autonomously decides when to trigger based on `description`. Not user-invocable by default; slash commands are the user-invocable primitive.

`allowed-tools` is only honored in Claude Code (not general Agent Skills).

## 4. Slash commands

Location: `.claude/commands/<name>.md` (project) + `~/.claude/commands/<name>.md` (user) + plugin `commands/`. Namespace via subdir: `frontend/component.md` → `/component` with `(project:frontend)` descriptor. Name collisions across project/user not supported.

Frontmatter:
```yaml
---
allowed-tools: Bash(git add:*), Bash(git status:*)
argument-hint: [pr-number] [priority] [assignee]
description: ...
model: ...
disable-model-invocation: false   # default false; true hides from SlashCommand tool
---
```

Arguments: `$ARGUMENTS` (all), `$1`, `$2`, `$3`, … (positional).

Bash execution prefix: `!` inside the body (requires `allowed-tools` Bash entries). File refs via `@path/to/file`.

## 5. Plugin system

Location: `.claude-plugin/plugin.json` at plugin root. Plugins can bundle: commands, agents, skills, hooks, MCP servers, statuslines. All auto-merged at load time.

Plugin components (five types per `plugins-reference.md`):
- `commands/*.md`
- `agents/*.md`
- `skills/<name>/SKILL.md`
- `hooks/hooks.json` (or inline in plugin.json)
- `.mcp.json` (or inline in plugin.json)

Marketplace: plugins can be registered via `~/.claude/plugins/marketplace.json`. Current Fulcrum plugin manifest: `agent-integration/claude/.claude-plugin/` + `agent-integration/codex/marketplace.json` for Codex.

## 6. Global context

Location: `~/.claude/CLAUDE.md` (user) + `.claude/CLAUDE.md` (project) + `CLAUDE.md` at repo root. Hierarchical load. Fulcrum uses `<!-- fulcrum:begin --> … <!-- fulcrum:end -->` markers to stamp-and-refresh a section idempotently.

Project `CLAUDE.md` (at repo root, no `.claude/` prefix) is auto-loaded in-context.

## 7. MCP integration

Transport: stdio (by default; HTTP and SSE also supported per `mcp.md`). Registration via `claude mcp add --scope user|project fulcrum -- fulcrum serve mcp --mode filtered --runtime-capability hooks` OR direct-edit `~/.claude.json` (`mcpServers` key).

Tool naming in prompts: `mcp__<server>__<tool>`. Fulcrum exposes `mcp__fulcrum__*` (32 tools as of this audit — see `packages/cli/src/mcp-tools.ts`).

## 8. Authentication modes

ChatGPT-style subscription login + Anthropic API key. Model availability depends on auth; Claude Sonnet/Opus/Haiku via either.

## 9. Unique surfaces worth wiring

- **Status line**: `~/.claude/statusline/*` — custom live status readout while Claude runs. Used by `fulcrum serve monitor` for Claude Code operators.
- **Output styles** (`~/.claude/output-styles/`): response-format presets.
- **Keybindings** (`~/.claude/keybindings.json`): custom keys.
- **`--agents '{...}'` CLI flag**: session-scoped sub-agents without on-disk files.
- **Plugin marketplaces**: `~/.claude/plugins/marketplace.json` — third-party plugin registry.

## Implications for Fulcrum parity plan

- Fulcrum already ships 5 hooks, 34 skills, 24 sub-agent MDs, 4 slash commands, global-context stamp. **Surface coverage on Claude Code is already the most complete of any agent.**
- Gap the plan addresses: skills do not bias *toward Fulcrum first for search*. Every skill tells the agent HOW to use a Fulcrum tool; none tells it WHEN TO PREFER Fulcrum over Grep/Glob.
- Because Claude Code is the richest surface, it is the natural **canonical source** for the "Fulcrum-first" skill text — other agents' copies can be derived/fanned-out.
