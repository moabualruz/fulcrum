# Cross-Agent Generalization

> The architecture from [context.md](context.md), [hooks.md](hooks.md), [capabilities.md](capabilities.md), [skills.md](skills.md), [mcp.md](mcp.md), [memory.md](memory.md), [tasks.md](tasks.md) applies to all agents. This doc translates each layer to agent-specific config. All data verified from primary sources 2026-04-27.

## 1. Comparison matrix

| | Codex CLI | Gemini CLI | OpenCode | Pi CLI |
|---|---|---|---|---|
| Global rules | `~/.codex/AGENTS.md` | `~/.gemini/GEMINI.md` | `~/.config/opencode/AGENTS.md` | `~/.pi/agent/` (`AGENTS.md` or `CLAUDE.md`) |
| Project rules | `AGENTS.md` / `.codex/config.toml` | `GEMINI.md` (project root) | `AGENTS.md` | `AGENTS.md` / `CLAUDE.md` |
| Reads AGENTS.md natively | Yes | **No** — only GEMINI.md | Yes | Yes |
| Hook mechanism | `~/.codex/hooks.json` | `hooks` in settings.json | TypeScript plugin | TypeScript extension (`~/.pi/agent/extensions/*.ts`, `pi.on(event, handler)`) |
| Hook events | 6 | 11 | 30+ plugin events | **20+** — session_start, session_shutdown, before_agent_start, turn_start/end, tool_call (blockable), resources_discover, etc. |
| Hook context inject | SessionStart + UserPromptSubmit only | Yes | Yes | Yes — `before_agent_start` can inject messages + rewrite system prompt |
| Skills path | `~/.codex/skills/` (user) · `.codex/skills/` (project) | `~/.gemini/extensions/` | `~/.config/opencode/skills/` | `~/.pi/agent/skills/` |
| MCP | Yes — `config.toml` | Yes — `settings.json` | Yes — `opencode.json` | **No** (by design) |
| DeepWiki | Yes | Yes | Yes | No |

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

Hooks config: `~/.codex/hooks.json` (user) or `.codex/hooks.json` (project). Both TOML inline and JSON are supported but **JSON is the recommended format** — TOML inline hooks have a known startup bug in recent versions where they conflict with the JSON loader.

Six events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `Stop`.

**Stdout behavior per event:**
- `SessionStart`, `UserPromptSubmit` — plain text stdout injected as developer context
- `PreToolUse`, `PostToolUse`, `PermissionRequest` — stdout ignored; use stderr for logs
- `Stop` — must return JSON (plain text invalid)

Non-zero exit code (2) blocks the triggering action with stderr as the reason.

`~/.codex/hooks.json` for fulcrum hooks (index + memory):

```json
{
  "hooks": {
    "Stop": [
      {"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/index-rebuild.sh"}]},
      {"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/session-stop.sh"}]}
    ],
    "SessionStart": [
      {"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/index-check.sh"}]},
      {"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/session-start.sh"}]}
    ]
  }
}
```

Set `FULCRUM_AGENT=codex` in the Codex shell environment so the vault commit messages are stamped correctly.

### 2.3 Skills

**Path rule: Codex uses Codex-namespaced paths only. Never `~/.agents/` or `.agents/` — shared paths collide with other agents.**

Use `~/.codex/skills/<name>/SKILL.md` (user) and `.codex/skills/<name>/SKILL.md` (project). If Codex's default discovery order does not include these paths, configure it via `~/.codex/config.toml`:

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
| `~/.gemini/GEMINI.md` | Global user-level |
| `GEMINI.md` | Project root (project-level) |
| `.gemini/GEMINI.md` | Project-level (alternative location) |

**`AGENTS.md` is not natively read by Gemini CLI.** Only `GEMINI.md` files are discovered. Keep `AGENTS.md` as the single source of truth and make `GEMINI.md` a one-line import:

```markdown
@AGENTS.md
```

Gemini CLI's memory import processor inlines the referenced file at load time. All other agents read `AGENTS.md` directly — no duplication, no drift.

### 3.2 Hooks

Eleven events: `SessionStart`, `SessionEnd`, `BeforeModel`, `AfterModel`, `BeforeAgent`, `AfterAgent`, `BeforeTool`, `AfterTool`, `BeforeToolSelection`, `PreCompress`, `Notification`.

Hooks return JSON; can inject context via `hookSpecificOutput.additionalContext`, control tool access via `toolConfig`. Exit code 2 = emergency block.

Combined index + memory hooks — add to `~/.gemini/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {"type": "command", "command": "~/.fulcrum/hooks/index-check.sh"},
      {"type": "command", "command": "~/.fulcrum/hooks/session-start.sh"}
    ],
    "SessionEnd": [
      {"type": "command", "command": "~/.fulcrum/hooks/index-rebuild.sh"},
      {"type": "command", "command": "~/.fulcrum/hooks/session-stop.sh"}
    ]
  }
}
```

Set `FULCRUM_AGENT=gemini` in the Gemini shell environment.

**Known bug:** Underscores in MCP server alias names break Gemini's policy engine — use hyphens (`deepwiki` not `deep_wiki`).

### 3.3 Skills

Skills in Gemini CLI live **inside Extensions**, not as standalone files. Extension structure:

```
~/.gemini/extensions/<ext-name>/
├── gemini-extension.json   ← required manifest
└── skills/
    └── <skill-name>/
        └── SKILL.md
```

There is no direct `~/.agents/skills/` discovery in Gemini CLI. Each skill must be wrapped in an extension. SKILL.md frontmatter: `name` and `description` required.

For our memory + task skills, create one wrapper extension (`~/.gemini/extensions/fulcrum-skills/`) containing all of them. See [memory.md](memory.md) §10.

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

> **Note: `opencode-ai/opencode` was archived on 2025-09-18 and is no longer maintained.** The successor project is **Crush** (by the original author + Charm team). Documentation below reflects the last stable OpenCode release; Crush may have different paths and APIs.

Sources: [opencode.ai/docs](https://opencode.ai/docs), plugins, skills, mcp-servers, rules references. Verified 2026-04-27.

### 4.1 Context Layer

| File | Scope |
|---|---|
| `~/.config/opencode/AGENTS.md` | Global user-level |
| `~/.claude/CLAUDE.md` | Also loaded natively — shared with Claude Code |
| `AGENTS.md` | Project-level (walked up from cwd) |

At the same level, `AGENTS.md` takes precedence over `CLAUDE.md`. OpenCode reads `~/.claude/CLAUDE.md` as a fallback — a single global rules file covers both Claude Code and OpenCode.

### 4.2 Plugins (hooks equivalent)

TypeScript plugins, not shell hooks. Locations: `~/.config/opencode/plugins/` (global) or `.opencode/plugins/` (project). npm packages declared in `opencode.json` under `"plugin"` are auto-installed.

Key events: `session.created`, `session.idle`, `session.compacted`, `tool.execute.before`, `tool.execute.after`, `file.edited`, `shell.env`, `permission.asked/replied`.

Combined index + memory plugin:

```typescript
// ~/.config/opencode/plugins/fulcrum.ts
export const FulcrumPlugin = async ({ $ }) => ({
  "session.idle": async () => {
    await $`~/.fulcrum/hooks/index-rebuild.sh`
    await $({ env: { FULCRUM_AGENT: "opencode" } })`~/.fulcrum/hooks/session-stop.sh`
  },
  "session.created": async ({ inject }) => {
    await $`~/.fulcrum/hooks/index-check.sh`
    const out = await $`~/.fulcrum/hooks/session-start.sh`
    if (out.stdout) {
      const ctx = JSON.parse(out.stdout)?.hookSpecificOutput?.additionalContext
      if (ctx) inject(ctx)
    }
  }
})
```

### 4.3 Skills

Install path: `~/.config/opencode/skills/<name>/SKILL.md`. Also scans `~/.claude/skills/<name>/SKILL.md` (Claude Code compatibility). Each agent gets its own copy — do not share via a common path.

SKILL.md: `name` (lowercase alphanumeric + hyphens, 1–64 chars) and `description` (1–1024 chars) required. Skill directory name must match `name` field.

### 4.4 MCP

`type` is required. Values: `"local"` (stdio subprocess) or `"remote"` (HTTP). Config at `~/.config/opencode/opencode.json`:

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

Sources: [github.com/badlogic/pi-mono](https://github.com/badlogic/pi-mono), [extensions doc](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md). Verified 2026-04-27 (HEAD `05f79b0`, extensions doc `6580dae`).

### 5.1 Context Layer

| File | Scope |
|---|---|
| `~/.pi/agent/AGENTS.md` or `~/.pi/agent/CLAUDE.md` | Global user-level |
| `AGENTS.md` / `CLAUDE.md` | Project-level (walked up from cwd) |
| `.pi/SYSTEM.md` | Replaces default system prompt (project) |
| `APPEND_SYSTEM.md` | Appended to system prompt (project) |

### 5.2 Hooks (via Extensions)

Pi has a **first-class extension event system** that is functionally equivalent to (and richer than) Claude Code's hooks. TypeScript files at `~/.pi/agent/extensions/*.ts` (global) or `.pi/extensions/*.ts` (project) are auto-discovered, hot-reloadable via `/reload`, and register handlers with `pi.on("event_name", handler)`.

**Settings — `~/.pi/agent/settings.json`:**
```json
{
  "packages": ["npm:@foo/bar@1.0.0", "git:github.com/user/repo@v1"],
  "extensions": ["~/.pi/agent/extensions/memory.ts"]
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

The Bash tool also exposes a `spawnHook` for command/cwd/env mutation.

### 5.3 Memory hook mapping

| Claude Code hook | Pi extension event |
|---|---|
| `SessionStart` | `session_start` (set up context) + `before_agent_start` (inject context messages, rewrite system prompt to include vault index, recent ADRs, `/wrap` notice) |
| `Stop` | `session_shutdown` (push vault, mark substantive activity) |

A single TS file at `~/.pi/agent/extensions/memory.ts` handles both, calling out to the same `~/.fulcrum/hooks/session-start.sh` and `session-stop.sh` scripts via `child_process.execSync` for shell parity. Full code in [memory.md](memory.md) §11.

Set `FULCRUM_AGENT=pi` in the Pi shell environment.

### 5.4 Skills

Install path: `~/.pi/agent/skills/<name>/SKILL.md` (user-level). Project-level: `.pi/skills/` (Pi-namespaced; never shared `.agents/`). Skills invoked via `/skill:name` syntax.

### 5.5 Packages

`pi install npm:<pkg>` or `pi install git:<repo>` adds entries to `settings.json` `packages`. Examples in the repo: `bash-spawn-hook.ts`, `model-status.ts`, `interactive-shell.ts`.

### 5.6 MCP

**No built-in MCP support** — explicit design decision. DeepWiki unavailable via MCP. Workaround: `xh` or `curl` against the DeepWiki REST API directly from the shell tool.

### 5.7 Parity Gaps vs Claude Code

| Gap | Detail |
|---|---|
| **No MCP** | DeepWiki unavailable; REST workaround only |
| **Extension language is TypeScript** | Shell hooks must be wrapped in a TS extension that shells out — adds one layer of indirection but preserves shell-script reuse |
