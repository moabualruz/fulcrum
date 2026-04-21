---
title: "opencode extension surface — research snapshot 2026-04-19"
type: reference
date: 2026-04-19
sources:
  - opencode.ai/docs/plugins/ (verified 2026-04-19)
  - opencode.ai/docs/agents/ (verified 2026-04-19)
  - agent-integration/opencode/plugins/fulcrum.ts (current Fulcrum plugin)
  - agent-integration/opencode/ (current install surface)
---

# opencode — extension surface reference

**Primary-focus agent** per the handover — the plugin API is "hooks on steroids" per the user's words.

## 1. Plugin lifecycle hooks (exhaustive)

Opencode plugins are TypeScript modules exporting a function of shape `(ctx) => { [event]: handler, ... }`. One plugin can register handlers across every event class below.

Event taxonomy (format: `{domain}.{entity}.{state}`):

**Command events:** `command.executed`

**File events:** `file.edited`, `file.watcher.updated`

**Installation events:** `installation.updated`

**LSP events:** `lsp.client.diagnostics`, `lsp.updated`

**Message events:** `message.part.removed`, `message.part.updated`, `message.removed`, `message.updated`

**Permission events:** `permission.asked`, `permission.replied`

**Server events:** `server.connected`

**Session events:** `session.created`, `session.compacted`, `session.deleted`, `session.diff`, `session.error`, `session.idle`, `session.status`, `session.updated`

**Todo events:** `todo.updated`

**Shell events:** `shell.env`

**Tool events:** `tool.execute.before` (CAN block/modify input), `tool.execute.after` (observable)

**TUI events:** `tui.prompt.append`, `tui.command.execute`, `tui.toast.show`

**Experimental:** `experimental.session.compacting`, `experimental.chat.system.transform` (CAN modify outgoing system prompt).

## 2. Hook capabilities

- **Blocking / modifying:** `tool.execute.before` (throw to block, mutate `input.input` to modify), `shell.env` (mutate `output.env`), `experimental.session.compacting`, `experimental.chat.system.transform` (return modified system prompt), `permission.ask` (return `{ approved: false, reason }`).
- **Observable only:** everything else.

This is the broadest interception surface of any of the 8 CLI agents. The Fulcrum plugin already uses `experimental.chat.system.transform` to inject workspace status pre-model-call and `tool.execute.before` as a policy gate.

## 3. Custom tools

Via `@opencode-ai/plugin`:
```ts
tool({
  description: "string",
  args: { /* Zod-style schema via tool.schema.* */ },
  async execute(args, context) { ... }
})
```
Plugin tools **override built-in tools** of the same name. Fulcrum registers 10 custom `fulcrum_*` tools today (`fulcrum.ts`).

## 4. Context available to plugins

Plugin init receives `ctx`:
- `project` — current project metadata
- `directory` — CWD
- `worktree` — git worktree path
- `client` — opencode SDK (e.g. `client.app.log()`)
- `$` — Bun shell API

## 5. Agents / sub-agents

Location: `.opencode/agents/<name>.md` (project) + `~/.config/opencode/agents/<name>.md` (global). Markdown file, filename = agent name.

Frontmatter:
```yaml
description: ...                   # required
mode: primary | subagent | all     # default: all
model: provider/model-id           # optional; inherits from config
temperature: 0.0–1.0               # optional
permission:
  edit: ask | allow | deny
  bash:
    "*": ask
    "grep *": allow
    "git *": ask
  webfetch: deny
  task:
    "*": deny
    "orchestrator-*": allow
    "code-reviewer": ask
top_p: 0.0–1.0
steps: <max-iterations>
disable: true|false
prompt: { file: ./path/to/prompt.txt }
hidden: true|false                 # subagents only; hides from @ autocomplete
color: "<hex or theme>"
```

Alternative: agents can be defined in `opencode.json` under `"agent": { "agent-name": {...} }`.

Invocation:
- **Automatic** — primary agents invoke subagents based on description.
- **Manual `@mention`** — user types `@general search the docs`.
- **Task tool** — primary invokes subagent programmatically.

Primary vs subagent: Tab / `switch_agent` cycles primary agents. Subagents invoked from within a primary's conversation.

Built-in primary: `Build` (all tools), `Plan` (restricted).
Built-in subagent: `General` (full except todo), `Explore` (read-only).
System agents (Compaction, Title, Summary): hidden, non-selectable primary.

**For Fulcrum parity:** opencode's agents map cleanly onto our 24 roles. `mode: primary` → orchestrator/chief_of_staff; `mode: subagent` with `hidden: true` → implementation roles that should not be user-selectable.

## 6. Tool allow/deny schema (agents)

```json
"permission": {
  "bash": { "*": "ask", "git push": "ask", "grep *": "allow" },
  "task": { "*": "deny", "code-reviewer": "allow" }
}
```
Bash supports glob; `task` controls which subagents can be spawned. Rules evaluated in order — **last match wins**. No Claude Code / Codex equivalent to `task.<subagent>.allow` fine-grain routing.

## 7. Config + plugin registration

Config file: `opencode.json` (or `.jsonc` as Fulcrum uses). Location: `.opencode/opencode.jsonc` (project) + `~/.config/opencode/opencode.jsonc` (global).

Plugin registration:
```jsonc
{
  "plugin": ["./plugins/fulcrum.ts", "@my-org/other-plugin"]
}
```
- Local path OR npm package reference.
- Plugin dirs: `.opencode/plugins/` (project), `~/.config/opencode/plugins/` (global).
- Dependencies in `.opencode/package.json`, resolved via **Bun** (not node/npm).

## 8. Global context

No single auto-loaded global context file like CLAUDE.md / GEMINI.md / AGENTS.md. Agent MDs' prompts + plugin `experimental.chat.system.transform` ARE the injection surfaces. `opencode.md` exists in `agent-integration/opencode/` but is informational for the human operator (skip-if-exists on install).

## 9. MCP integration

Config:
```jsonc
{
  "mcp": {
    "fulcrum": { "type": "local", "command": ["fulcrum", "serve", "mcp", "--mode", "filtered"], "enabled": true }
  }
}
```

Transport types: `local` (stdio), plus HTTP (via `type: "remote"` per Opencode docs, not fully retrieved this session).

Tool naming: `mymcp_toolname` pattern with underscore (matches Gemini convention; different from Claude Code's `mcp__fulcrum__tool`). Agent permission rules can deny MCP tools via wildcard: `"mymcp_*": false`.

## 10. Authentication

Provider-agnostic via model IDs like `anthropic/claude-haiku-4`, `openai/gpt-5`. Auth model follows whichever provider the model routes to. Plan mode restricts to "safer" tools — plugin can contextualize.

## 11. Unique surfaces worth wiring

- **`experimental.chat.system.transform`** — modify the outgoing system prompt before every LLM call. Already wired in Fulcrum plugin for workspace-status injection. Can host the "Fulcrum-first" behavioral bias as a deterministic system-prompt rider (bypasses skill-discovery uncertainty).
- **Permission allowlist with glob patterns** — richer than Claude Code's permission system.
- **`task.<subagent>.allow`** — gate WHICH subagents a primary can spawn.
- **Event bus** — `session.compacted` / `todo.updated` etc. give observability without polling.
- **Plugin tools override built-ins** — can intercept any native operation by name-collision.

## Implications for Fulcrum parity plan

- opencode plugin coverage is **already the widest** of any Fulcrum install — the gap isn't plugin surface, it's **behavioral rule content**. `experimental.chat.system.transform` is the place to inject the "Fulcrum-first / recall-before-Grep" bias text, because it fires every model call and is deterministic (no skill-discovery uncertainty).
- opencode has **no skill directory** — the "skills" concept should land via agent MDs (per-agent system prompt) + chat.system.transform (global bias text). The plan should NOT try to port Claude-style skill dirs onto opencode.
- **Agents map onto our roles** — parity PR wires the 24 roles as opencode agents. Cockpit-style orchestration via `mode: primary` + `task.<subagent>` permissions.
- **opencode.md skip-if-exists** is a bug for updateability. Plan must either (a) flip to overwrite-with-marker, or (b) host the rule text elsewhere (plugin-embedded string, not a user-editable file).
