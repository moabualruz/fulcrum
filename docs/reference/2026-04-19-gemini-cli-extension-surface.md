---
title: "Gemini CLI extension surface — research snapshot 2026-04-19"
type: reference
date: 2026-04-19
sources:
  - github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md (verified 2026-04-19)
  - github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md (verified 2026-04-19)
  - agent-integration/gemini/ (current Fulcrum install)
---

# Gemini CLI — extension surface reference

## 1. Hooks

Config: `hooks/hooks.json` inside an extension, OR `~/.gemini/settings.json` hooks block.

Events (COMPLETE list from `docs/hooks/index.md`):
- `SessionStart` — session begins (startup, resume, clear).
- `SessionEnd` — session ends (exit, clear).
- `BeforeAgent` — after user prompt submitted, before planning.
- `AfterAgent` — when agent loop ends.
- `BeforeModel` — before sending request to LLM.
- `AfterModel` — after receiving LLM response.
- `BeforeToolSelection` — before LLM selects tools.
- `BeforeTool` — before tool executes.
- `AfterTool` — after tool executes.
- `PreCompress` — before context compression.
- `Notification` — system notification.

**No `UserPromptSubmit` event.** `BeforeAgent` is the rough equivalent but fires after prompt submission, before planning.

Schema:
```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "write_file|replace",
        "hooks": [
          { "name": "security-check", "type": "command", "command": "...", "timeout": 5000 }
        ]
      }
    ]
  }
}
```

Matcher semantics:
- Tool events (`BeforeTool`, `AfterTool`): **regex**.
- Lifecycle events: **exact-string match**.
- `"*"` or `""` = match all.

Stdin / stdout contract:
- Stdin: JSON on stdin (shape documented in `docs/hooks/reference.md` — not retrieved in this session; research owes a follow-up fetch for exact shape).
- Stdout MUST be JSON-only — "Your script must not print any plain text to stdout other than the final JSON object."
- Debug output → **stderr only**.
- Exit codes: `0` (stdout parsed as JSON, including intentional blocks), `2` (system block, target action aborted), other (non-fatal warning).

Env vars:
- `GEMINI_PROJECT_DIR`, `GEMINI_PLANS_DIR`, `GEMINI_SESSION_ID`, `GEMINI_CWD`.
- `CLAUDE_PROJECT_DIR` is aliased for cross-agent compat.

**Can hooks block / modify?** Documented as block via exit 2 + block-shaped JSON. Modification semantics (can `BeforeModel` rewrite the outgoing request?) not explicit in the fetched doc — follow-up fetch of `docs/hooks/reference.md` needed before wiring anything that depends on it.

## 2. Sub-agents / agents

Location (per `docs/extensions/reference.md`): `agents/` subfolder inside an extension. Preview feature. Each `.md` file defines a sub-agent. Frontmatter schema not fully documented in the retrieved reference.md.

Fulcrum currently ships 2 agent MDs: `fulcrum-cos.md`, `fulcrum-memory.md` (in `agent-integration/gemini/agents/`).

## 3. Skills

Location: `skills/<name>/SKILL.md` inside an extension. Auto-loaded by the extension. Skill framework not explicitly documented as "Claude-style model-invoked" — research assumes Agent Skills spec conformance.

Fulcrum currently ships 6 skills: `fulcrum-chief-of-staff`, `fulcrum-complete-task`, `fulcrum-recall-before-writing`, `fulcrum-session-start`, `fulcrum-start-task`, `fulcrum-write-memory`. Source: `agent-integration/gemini/skills/`.

## 4. Slash commands

**TOML format** (not Markdown). Location: `commands/<name>.toml` inside an extension.

Namespacing via subdir + colon: `commands/gcs/sync.toml` → `/gcs:sync`.

Schema fields (extracted from `docs/extensions/reference.md`): `name`, `description`, `args`, prompt body. Full TOML schema owes follow-up fetch of `docs/cli/commands.md` (blocked in this session).

Fulcrum ships 6 commands: `cos.toml`, `fulcrum-log.toml`, `fulcrum-memory.toml`, `fulcrum-run.toml`, `fulcrum-status.toml`, `fulcrum-task.toml`.

## 5. Plugin / extension system

`gemini-extension.json` schema (`docs/extensions/reference.md` verbatim):
```json
{
  "name": "lowercase-with-dashes",
  "version": "semver",
  "description": "...",
  "migratedTo": "https://...",
  "mcpServers": { "serverName": { "command": "...", "args": [...], "cwd": "${extensionPath}" } },
  "contextFileName": "GEMINI.md",
  "excludeTools": ["run_shell_command(rm -rf)"],
  "plan": { "directory": "..." },
  "settings": [{ "name": "...", "envVar": "...", "sensitive": true }],
  "themes": [...]
}
```

Install paths: `~/.gemini/extensions/<name>/` (user-scope). **Project-level `.gemini/extensions/` not officially documented** — user-scope is the primary install target today.

Discovery: all extensions under `~/.gemini/extensions` auto-load at CLI start; conflicts resolved by workspace-config precedence. `/extensions list` in interactive mode.

Subfolder auto-load rules (from reference.md):
- `commands/*.toml` → slash commands (colon namespacing).
- `hooks/hooks.json` → hooks.
- `skills/<skill-name>/SKILL.md` → skills.
- `agents/*.md` → sub-agents (preview).
- `policies/*.toml` → policies (tier-2 priority: above defaults, below user/admin).

MCP servers bundle within the extension via `mcpServers` in the manifest. Use `${extensionPath}` for portability. `settings.json` MCP defs take precedence over extension MCP defs (same name).

## 6. Global context

`contextFileName` field in `gemini-extension.json` points at a file (default `GEMINI.md`) that loads into the agent's context.

Fulcrum ships `agent-integration/gemini/GEMINI.md`, registered via `gemini-extension.json`'s `contextFileName`.

## 7. MCP integration

Transport: stdio via `mcpServers` map in `gemini-extension.json`. All MCP config options supported EXCEPT `trust`.

Tool naming: underscore-separated (`mcp_fulcrum_recall_memory`). Different from Claude Code's `mcp__fulcrum__recall_memory`.

Fulcrum registers via `mcpServers.fulcrum = { command: "fulcrum", args: ["serve", "mcp", "--mode", "filtered", "--runtime-capability", "hooks"] }`.

## 8. Authentication

Gemini API key + Vertex AI auth. Model availability: Gemini 2.x family + experimental models.

## 9. Unique surfaces

- **Policies** (`policies/*.toml`) — tier-2 priority rule system layered between default allowlists and user/admin policies. No Claude Code or Codex equivalent.
- **`migratedTo` field** — auto-migrate an extension to a new upstream repo.
- **`themes/`** — UI theme bundle.
- **Extension `settings` array** — first-class env-var + API-key config surface with `sensitive: true` flag.

## Implications for Fulcrum parity plan

- **Hook event set is WIDER than Claude Code**. Gemini has `BeforeModel` + `AfterModel` + `BeforeToolSelection` + `AfterAgent` which Claude Code lacks. Fulcrum currently wires 6 of 11 events in `hooks.json`; the missing ones (`BeforeAgent`, `AfterAgent`, `BeforeToolSelection`, `Notification`, `AfterModel`) are coverage wins the plan can pick up.
- Hook stdin/stdout **exact JSON shape** still owes a re-fetch of `docs/hooks/reference.md` before the parity PR ships.
- The **`policies/`** directory is a parity surface not currently exploited — could host a "no-grep-without-recall-first" policy.
- **Skill subset (6) vs Claude's 34** is the main gap. Parity PR needs to decide which of the 34 apply on Gemini (probably most, given Gemini has skills + hooks).
