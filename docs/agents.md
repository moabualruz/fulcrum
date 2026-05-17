# Cross-Agent Generalization

> Architecture from [context.md](context.md), [hooks.md](hooks.md), [capabilities.md](capabilities.md), [skills.md](skills.md), [mcp.md](mcp.md) apply all agents. This doc translate each layer to agent-specific config. Pi MCP adapter data verified from primary source 2026-04-28; other agent data verified 2026-04-27.

## 1. Comparison matrix

| | Codex CLI | Gemini CLI | OpenCode | Pi CLI |
|---|---|---|---|---|
| Global rules | `~/.codex/AGENTS.md` | `~/AGENTS.md` (`~/.gemini/GEMINI.md` imports it when Gemini is detected) | `~/.config/opencode/AGENTS.md` | `~/.pi/agent/AGENTS.md` |
| Project rules | `AGENTS.md` / `.codex/config.toml` | `GEMINI.md` (project root) | `AGENTS.md` | `AGENTS.md` / `CLAUDE.md` |
| Reads AGENTS.md natively | Yes | **No** — only GEMINI.md | Yes | Yes |
| Hook mechanism | `~/.codex/hooks.json` | `hooks` in settings.json | TypeScript plugin | TypeScript extension (`~/.pi/agent/extensions/*.ts`, `pi.on(event, handler)`) |
| Hook events | 6 | 11 | 30+ plugin events | **20+** — session_start, session_shutdown, before_agent_start, turn_start/end, tool_call (blockable), resources_discover, etc. |
| Hook context inject | SessionStart + UserPromptSubmit only | Yes | Yes | Yes — `before_agent_start` can inject messages + rewrite system prompt |
| Skills path (fulcrum-managed) | `~/.codex/skills/fulcrum/` (global opt-in) · `.codex/skills/fulcrum/` (project opt-in) | `~/.gemini/extensions/fulcrum-skills/skills/` | `~/.config/opencode/skills/fulcrum/` | `~/.pi/agent/skills/fulcrum/` |
| Package mirrors | Codex plugin cache/config plus loadable skills, native MCP, hooks where supported | Gemini extension mirrors plus native MCP config when package manifest requires it | Native skills/commands/agents/packages plus plugin config and native MCP where supported | Native skills/commands/packages plus MCP through adapter; unsupported primitives recorded |
| MCP | Yes — `config.toml` | Yes — `settings.json` | Yes — `opencode.json` | Via `pi-mcp-adapter` |
| DeepWiki | Yes | Yes | Yes | Yes — installed/configured via `pi-mcp-adapter` (Fulcrum-managed) |


---

## 2. Codex CLI

Sources: [developers.openai.com/codex/config-reference](https://developers.openai.com/codex/config-reference), [/hooks](https://developers.openai.com/codex/hooks), [/skills](https://developers.openai.com/codex/skills). Verified 2026-04-27.

### 2.1 Context Layer

| File | Scope |
|---|---|
| `~/.codex/AGENTS.md` | Global user-level |
| `AGENTS.md` | Project-level (walked up from cwd to repo root) |
| `.codex/config.toml` | Project config (rules, model, tool settings) |

### 2.2 Hooks

Hooks config: `~/.codex/hooks.json` (user) or `.codex/hooks.json` (project). Both TOML inline + JSON supported but **JSON recommended format** — TOML inline hooks have known startup bug recent versions, conflict with JSON loader.

Six events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `Stop`.

**Stdout behavior per event:**
- `SessionStart`, `UserPromptSubmit` — plain text stdout injected as developer context
- `PreToolUse`, `PostToolUse`, `PermissionRequest` — stdout ignored; use stderr for logs
- `Stop` — must return JSON (plain text invalid)

Non-zero exit code (2) blocks triggering action with stderr as reason.

`~/.codex/hooks.json` for fulcrum index hooks:

```json
{
  "hooks": {
    "Stop": [
      {"hooks": [{"type": "command", "command": "fulcrum hook index-rebuild"}]}
    ],
    "SessionStart": [
      {"hooks": [{"type": "command", "command": "fulcrum hook index-check"}]}
    ]
  }
}
```

### 2.3 Skills

**Path rule: Codex use Codex-namespaced paths only. Never `~/.agents/` or `.agents/` — shared paths collide with other agents.**

Use `~/.codex/skills/fulcrum/<name>/SKILL.md` only when global authored skills are explicitly desired (`fulcrum skills sync --codex-global`). Prefer `.codex/skills/fulcrum/<name>/SKILL.md` for repo-scoped skills (`fulcrum skills sync --codex-project <dir>`). If Codex default discovery order not include these paths, configure via `~/.codex/config.toml`:

```toml
[skills]
search_paths = ["~/.codex/skills", ".codex/skills"]
```

SKILL.md frontmatter: `name` and `description` required (YAML).

### 2.4 MCP

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.deepwiki]
url = "https://mcp.deepwiki.com/mcp"
```

---

## 3. Gemini CLI

Sources: [github.com/google-gemini/gemini-cli/docs/reference/configuration.md](https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/reference/configuration.md), [/hooks](https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/hooks/reference.md), [/extensions](https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/extensions/writing-extensions.md). Verified 2026-04-27.

### 3.1 Context Layer

| File | Scope |
|---|---|
| `~/AGENTS.md` | Global user-level Fulcrum target |
| `~/.gemini/GEMINI.md` | Global user-level import shim (`@AGENTS.md`) when Gemini is detected |
| `GEMINI.md` | Project root (project-level) |
| `.gemini/GEMINI.md` | Project-level (alternative location) |

**`AGENTS.md` is not natively read by Gemini CLI.** Fulcrum always writes the shared rules block to `~/AGENTS.md`; when `~/.gemini/` exists, install also appends `@AGENTS.md` to `~/.gemini/GEMINI.md` so Gemini resolves the same source of truth at load time. Keep `AGENTS.md` as the single source of truth, make `GEMINI.md` one-line import:

```markdown
@AGENTS.md
```

Gemini CLI memory import processor inlines referenced file at load time. All other agents read `AGENTS.md` directly — no duplication, no drift.

### 3.2 Hooks

Eleven events: `SessionStart`, `SessionEnd`, `BeforeModel`, `AfterModel`, `BeforeAgent`, `AfterAgent`, `BeforeTool`, `AfterTool`, `BeforeToolSelection`, `PreCompress`, `Notification`.

Hooks return JSON; can inject context via `hookSpecificOutput.additionalContext`, control tool access via `toolConfig`. Exit code 2 = emergency block.

Index hooks — add to `~/.gemini/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {"type": "command", "command": "fulcrum hook index-check"}
    ],
    "SessionEnd": [
      {"type": "command", "command": "fulcrum hook index-rebuild"}
    ]
  }
}
```

**Known bug:** Underscores in MCP server alias names break Gemini policy engine — use hyphens (`deepwiki` not `deep_wiki`).

### 3.3 Skills

Skills in Gemini CLI live **inside Extensions**, not standalone files. Extension structure:

```
~/.gemini/extensions/<ext-name>/
├── gemini-extension.json   ← required manifest
└── skills/
    └── <skill-name>/
        └── SKILL.md
```

No direct `~/.agents/skills/` discovery in Gemini CLI. Each skill must wrap in extension. SKILL.md frontmatter: `name` and `description` required.

### 3.4 MCP

`httpUrl` = Streamable HTTP (recommended); `url` = SSE (legacy). Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "deepwiki": {
      "httpUrl": "https://mcp.deepwiki.com/mcp"
    }
  }
}
```

---

## 4. OpenCode

> **Note: `opencode-ai/opencode` archived 2025-09-18, no longer maintained.** Successor project = **Crush** (by original author + Charm team). Docs below reflect last stable OpenCode release; Crush may have different paths + APIs.

Sources: [opencode.ai/docs](https://opencode.ai/docs), plugins, skills, mcp-servers, rules references. Verified 2026-04-27.

### 4.1 Context Layer

| File | Scope |
|---|---|
| `~/.config/opencode/AGENTS.md` | Global user-level |
| `~/.claude/CLAUDE.md` | Also loaded natively — shared with Claude Code |
| `AGENTS.md` | Project-level (walked up from cwd) |

At same level, `AGENTS.md` take precedence over `CLAUDE.md`. OpenCode read `~/.claude/CLAUDE.md` as fallback — single global rules file cover both Claude Code + OpenCode.

### 4.2 Plugins (hooks equivalent)

TypeScript plugins, not shell hooks. Locations: `~/.config/opencode/plugins/` (global) or `.opencode/plugins/` (project). npm packages declared in `opencode.json` under `"plugin"` auto-installed.

Key events: `session.created`, `session.idle`, `session.compacted`, `tool.execute.before`, `tool.execute.after`, `file.edited`, `shell.env`, `permission.asked/replied`.

Index plugin:

```typescript
// ~/.config/opencode/plugins/fulcrum.ts
export const FulcrumPlugin = async ({ $ }) => ({
  "session.idle": async () => {
    await $`fulcrum hook index-rebuild`
  },
  "session.created": async () => {
    await $`fulcrum hook index-check`
  }
})
```

### 4.3 Skills

Install path: `~/.config/opencode/skills/fulcrum/<name>/SKILL.md`. Also scans `~/.claude/skills/<name>/SKILL.md` (Claude Code compat). Each agent gets own copy — do not share via common path.

SKILL.md: `name` (lowercase alphanumeric + hyphens, 1–64 chars) and `description` (1–1024 chars) required. Skill directory name must match `name` field.

### 4.4 MCP

`type` required. Values: `"local"` (stdio subprocess) or `"remote"` (HTTP). Config at `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "deepwiki": {
      "type": "remote",
      "url": "https://mcp.deepwiki.com/mcp"
    }
  }
}
```

---

## 5. Pi CLI

Sources: [github.com/badlogic/pi-mono](https://github.com/badlogic/pi-mono), [extensions doc](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md), [nicobailon/pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter). Pi core verified 2026-04-27 (HEAD `05f79b0`, extensions doc `6580dae`); MCP adapter verified 2026-04-28.

### 5.1 Context Layer

| File | Scope |
|---|---|
| `~/.pi/agent/AGENTS.md` | Global user-level |
| `AGENTS.md` / `CLAUDE.md` | Project-level (walked up from cwd) |
| `.pi/SYSTEM.md` | Replaces default system prompt (project) |
| `APPEND_SYSTEM.md` | Appended to system prompt (project) |

### 5.2 Hooks (via Extensions)

Pi have **first-class extension event system** functionally equivalent to (and richer than) Claude Code hooks. TypeScript files at `~/.pi/agent/extensions/*.ts` (global) or `.pi/extensions/*.ts` (project) auto-discovered, hot-reloadable via `/reload`, register handlers with `pi.on("event_name", handler)`.

**Settings — `~/.pi/agent/settings.json`:**
```json
{
  "packages": ["npm:@foo/bar@1.0.0", "git:github.com/user/repo@v1"],
  "extensions": ["~/.pi/agent/extensions/index.ts"]
}
```

**Event categories (20+ events total):**

| Category | Events |
|---|---|
| Session | `session_start`, `session_before_switch`, `session_before_fork`, `session_before_compact`, `session_compact`, `session_before_tree`, `session_tree`, `session_shutdown` |
| Agent | `before_agent_start` (can inject messages + rewrite system prompt), `agent_start`, `agent_end`, `turn_start`, `turn_end` |
| Message/Provider | `message_start/update/end`, `before_provider_request`, `after_provider_response`, `model_select`, `context` |
| Tool | `tool_call` (returns `{block: true, reason}` to deny — equivalent to PreToolUse blocking), `tool_result`, `tool_execution_start/update/end`, `user_bash`, `input` |
| Resource | `resources_discover` (contributes skill/prompt/theme paths) |

Bash tool also expose `spawnHook` for command/cwd/env mutation.

### 5.3 Index hook mapping

| Claude Code hook | Pi extension event |
|---|---|
| `SessionStart` | `session_start` |
| `Stop` | `session_shutdown` |

TS files under `~/.pi/agent/extensions/*.ts` can shell out to `fulcrum hook index-check` and `fulcrum hook index-rebuild` via `child_process.execSync`.

### 5.4 Skills

Install path: `~/.pi/agent/skills/fulcrum/<name>/SKILL.md` (user-level, Fulcrum-managed). Skills invoked via `/skill:name` syntax.

### 5.5 Packages

`pi install npm:<pkg>` or `pi install git:<repo>` adds entries to `settings.json` `packages`. Examples in repo: `bash-spawn-hook.ts`, `model-status.ts`, `interactive-shell.ts`.

### 5.6 MCP

Pi does not ship a built-in MCP manager, but it can serve MCPs through [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter):

```bash
pi install npm:pi-mcp-adapter
```

Restart Pi after install. The adapter reads MCP config from `.mcp.json`, `~/.config/mcp/mcp.json`, `~/.pi/agent/mcp.json`, or `.pi/mcp.json` and supports stdio plus HTTP MCP servers.

Recommended user-level DeepWiki config for Pi:

```json
{
  "mcpServers": {
    "deepwiki": {
      "url": "https://mcp.deepwiki.com/mcp"
    }
  }
}
```

Default adapter behavior exposes MCP servers through a proxy-style `mcp(...)` tool. `fulcrum hook tool-output-router` normalises this proxy shape — `tool_name="mcp"` with `tool_input.server` and `tool_input.tool` — to `mcp__<server>__<tool>` before policy lookup, so `mcp__deepwiki__*` rules apply to Pi proxy calls without additional configuration.

`fulcrum install` manages the full Pi DeepWiki lifecycle: `pi install npm:pi-mcp-adapter`, settings.json package entry, and `~/.pi/agent/mcp.json` deepwiki entry. `fulcrum doctor --json` reports `piMcpAdapter.adapterPresent` and `piMcpAdapter.deepwikiPresent`.

### 5.7 Parity Gaps vs Claude Code

| Gap | Detail |
|---|---|
| **Generic MCP adapter** | `pi-mcp-adapter` is installed and configured by `fulcrum install`; DeepWiki entry written to `~/.pi/agent/mcp.json`. Proxy-shape routing normalised in `deriveTool`. |
| **Extension language is TypeScript** | Shell hooks must wrap in TS extension that shells out — adds one layer indirection but preserves shell-script reuse |
