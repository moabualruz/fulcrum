# Hooks

> Deterministic, lifecycle-driven hooks. Run *outside* the model loop — cannot be ignored, prompt-injected, or forgotten. Use them for things the agent must *not* be trusted to remember: format, lint, secret-scan, refresh tool indexes, block destructive shell, inject session-time context.
>
> **Cross-agent.** Every recipe is a TypeScript subcommand of the `fulcrum` binary (`fulcrum hook <name>`). Each agent invokes the same binary differently. Section 1 catalogs Claude Code events as the reference; section 6 maps the same recipes onto Codex, Gemini, OpenCode, Pi. Per-agent registration syntax lives in [agents.md](agents.md).

## 1. Claude Code event catalogue (reference shape)

All shapes from primary docs, fetched 2026-04-27 [source: https://code.claude.com/docs/en/hooks]. Default timeout is **600s** for every command hook — set an explicit lower `timeout` (ms) on hot-path hooks. Stdin is JSON; common fields on every event: `session_id`, `transcript_path`, `cwd`, `hook_event_name`. `permission_mode` is added on tool/prompt events.

### 1.1 Core lifecycle (the nine you'll use most)

| Event | Trigger | Stdin (event-specific) | Output controls | Exit 0 / Exit 2 |
|---|---|---|---|---|
| **SessionStart** | Session opens, `--resume`, `/clear`, post-compact. Matcher: `startup\|resume\|clear\|compact` | `source`, `model` | stdout → context; `additionalContext`, `sessionTitle` | 0 = inject stdout · 2 = non-blocking error |
| **UserPromptSubmit** | Before every user prompt is sent. No matcher. | `prompt` | stdout → context; `decision:"block"` + `reason` erases prompt; `additionalContext` | 0 = proceed · 2 = block & erase |
| **PreToolUse** | After tool args generated, before execution. Matcher: tool name or `mcp__<server>__<tool>` (use `mcp__srv__.*` to wildcard) | `tool_name`, `tool_input`, `tool_use_id` | `hookSpecificOutput.permissionDecision: allow\|deny\|ask\|defer` + `permissionDecisionReason`; `updatedInput` to mutate args | 0 = allow · 2 = block (stderr → Claude) |
| **PostToolUse** | Immediately after tool succeeds. Same matchers. | `tool_input`, `tool_response`, `tool_use_id`, `duration_ms` | `decision:"block"` + `reason` (sends stderr back to model); `additionalContext`; `updatedMCPToolOutput` (MCP tools only) | 0 = pass · 2 = block next model turn |
| **PostToolUseFailure** | Tool execution errored. Same matchers. | `error`, `is_interrupt`, `duration_ms` | Same as PostToolUse | 0 = pass · 2 = stop loop |
| **Stop** | Model finished its turn. No matcher. | — | `decision:"block"` + `reason` forces continuation | 0 = stop · 2 = continue (anti-stop) |
| **SubagentStop** | Subagent finished. Matcher: `agent_type`. | `agent_id`, `agent_type` | Same as Stop | 0 = stop · 2 = continue |
| **PreCompact** | Before context compaction. Matcher: `manual\|auto`. | — | `decision:"block"` cancels | 0 = compact · 2 = block |
| **SessionEnd** | Session closing. Matcher: `clear\|resume\|logout\|prompt_input_exit\|bypass_permissions_disabled\|other` | `reason` | None — observability only | Ignored |

### 1.2 Universal output fields (any event)

- `continue` (default `true`) — set `false` to halt the agentic loop with `stopReason`.
- `suppressOutput` — omit stdout from the debug log.
- `systemMessage` — string shown to user.
- Cap: `additionalContext`, `systemMessage`, plain stdout truncate at **10,000 chars**.

### 1.3 Less-common events (one-liner reference)

`UserPromptExpansion` (slash-command/MCP-prompt expansion; can block); `PermissionRequest` / `PermissionDenied` (intercept the permission dialog); `PostToolBatch` (after a parallel tool batch resolves); `Notification` (matcher: `permission_prompt|idle_prompt|auth_success|elicitation_dialog`); `SubagentStart`; `StopFailure` (turn ended on API error); `TaskCreated` / `TaskCompleted` (Claude's internal task tool); `TeammateIdle`; `InstructionsLoaded` (CLAUDE.md/rules loaded); `ConfigChange`; `CwdChanged`; `FileChanged` (watch literal filenames like `.envrc|.env`); `WorktreeCreate` / `WorktreeRemove`; `PostCompact`; `Elicitation` / `ElicitationResult` (MCP form input). Most are observability-only (exit code ignored).

---

## 2. When-to-use decision tree

```
I need to…
├── BLOCK an action before it runs
│   ├── Tool-specific (Bash command, Edit path, Write target)
│   │   → PreToolUse + matcher; exit 2 OR permissionDecision: "deny"
│   └── Every user prompt (e.g., gate on PII)
│       → UserPromptSubmit; exit 2 erases the prompt
│
├── MODIFY input before tool runs
│   → PreToolUse; emit hookSpecificOutput.updatedInput
│
├── REACT to a tool's output
│   ├── Success → PostToolUse (decision:"block" feeds reason back to model)
│   ├── Failure → PostToolUseFailure
│   └── Truncate/redact MCP output → PostToolUse + updatedMCPToolOutput
│
├── INJECT context
│   ├── Once per session → SessionStart (stdout becomes context)
│   ├── Every prompt   → UserPromptSubmit (additionalContext)
│   └── Around a tool  → PreToolUse / PostToolUse additionalContext
│
├── REFRESH something after work is done
│   → Stop (model finished a turn) or SessionEnd (observability)
│
└── OBSERVE only (audit, telemetry)
    → Notification, InstructionsLoaded, CwdChanged, FileChanged — exit code ignored
```

Rule of thumb: **PreToolUse for prevention, PostToolUse for reaction, SessionStart for priming, Stop for refresh.** Everything else is a special case.

---

## 3. Settings layout

[source: https://code.claude.com/docs/en/settings] Hooks live in a `hooks` block:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/bash-guard.sh",
        "timeout": 5000
      }]
    }]
  }
}
```

**Always** wrap `$CLAUDE_PROJECT_DIR` in quotes (paths with spaces). Only `type: "command"` is universally supported (HTTP and `mcp_tool` types exist but are restricted by `allowedHttpHookUrls`).

**Locations & precedence** (highest → lowest): managed (`/Library/Application Support/ClaudeCode/managed-settings.json` macOS, `/etc/claude-code/` Linux, `C:\Program Files\ClaudeCode\` Windows) → CLI args → `.claude/settings.local.json` → `.claude/settings.json` → `~/.claude/settings.json`.

**Hook-control knobs**: `disableAllHooks` (kill switch), `allowManagedHooksOnly` (enterprise), `allowedHttpHookUrls`, `httpHookAllowedEnvVars`. Array settings *merge* across scopes; scalars override.

---

## 4. Seamless-UX principles

1. **Fast.** Target <200ms for PreToolUse; <500ms for PostToolUse. Set explicit `timeout`. Default 600s is a footgun.
2. **Idempotent.** Hook may fire many times per session — formatting, indexing, scanning must produce the same result on repeated input.
3. **Non-blocking on network.** Never `curl` or hit a registry inline. Cache locally, refresh in `Stop` (background `&`), check freshness in `SessionStart`.
4. **Exit 0 by default.** Only exit 2 when you genuinely intend to block. Other non-zero exit codes show as user-visible non-blocking errors.
5. **Logs to stderr.** PreToolUse/PostToolUse stdout is *ignored* outside specific output fields — use stderr for diagnostics.
6. **Never touch repo files.** Cache in `/tmp/`, `$XDG_STATE_HOME`, or `~/.cache/`. The index hooks store SHA in `/tmp/<slug>.index-sha` — follow that pattern.
7. **Trust typed code over shell glue.** Recipes live inside the `fulcrum` binary as TypeScript subcommands; agent envelopes are parsed via `serde`-equivalent type guards, not `jq` shell-out. The binary spawns external CLIs only when actually needed (formatters, ctags, etc).
8. **Hooks run with full shell privileges.** No sandbox. Treat any custom hooks you write as production code; review before adding.

---

## 5. Recipe library

Every recipe is a subcommand of the `fulcrum` binary: `fulcrum hook <name>`. Enable with `fulcrum hooks enable <name>` — writes each detected agent's native hook config, records intent at `~/.fulcrum/hooks/enabled/<name>`, and prints the per-agent registration snippet for review. Disable with `fulcrum hooks disable <name>` — removes Fulcrum-managed native registrations and the marker. Implementation lives in `src/hooks/<name>.ts`; this section explains *what each one does and when to use it.*

| Recipe | Lifecycle | Purpose | Blocks? |
|---|---|---|---|
| `index-check` | SessionStart-equivalent | Warn if `tags` / `graphify-out/` are stale or missing. | no |
| `index-rebuild` | Stop-equivalent | Rebuild ctags + graphify + repomix when HEAD changed or working tree dirty. | no |
| `format` | PostToolUse `Write\|Edit` | Run language-appropriate formatter on the just-edited file (ruff / biome / prettier / gofmt / rustfmt / google-java-format / ktlint / dart format). Fail-open. | no |
| `lint-gate` | PostToolUse `Write\|Edit` | Block the next turn if `ruff check` / `biome check` / `golangci-lint run` reports violations on the edited file. Stderr feeds back. | yes (exit 2) |
| `pm-policy` | PreToolUse `Bash` | Refuse `npm`/`yarn` when the repo declares pnpm; refuse `npm` when bun is declared. Detects `pnpm-lock.yaml` / `bun.lock(b)` / `yarn.lock`. | yes (exit 2) |
| `test-on-edit` | PostToolUse `Write\|Edit` | **Opt-in per-project.** Reads `.fulcrum/test-on-edit.toml` mapping glob → command. No config = no-op. Runs in background; output to `/tmp/<project>-test-on-edit.log`. | no |
| `audit-log` | PostToolUse `Bash` | Agent-neutral forensic trail. Appends `ISO-8601\tcommand\texit_code` to `~/.fulcrum/state/<project>/shell-commands.log`. Write-only. | no |
| `tool-output-router` | PostToolUse (any) | Per-tool output-handling. Reads `~/.fulcrum/tool-output-policy.toml` and applies a tier (raw / status-only / summary+head / summary+file / file-only / leave-as-is). Default: leave-as-is. See [tool-output-policy.md](tool-output-policy.md). | no |

### 5.1 Index maintenance — `index-check` + `index-rebuild`

Rebuilds `tags`, `graphify-out/`, and the repomix pack only when HEAD changed or the working tree is dirty. SHA cached in `/tmp/<slug>.index-sha` — never touches the repo. `index-check` runs at session start and warns if the index is stale; `index-rebuild` runs on Stop.

### 5.2 Editor productivity — `format` + `lint-gate`

`format` is non-blocking: it runs ruff / biome / prettier / gofmt / rustfmt / google-java-format / ktlint / dart format on the edited file and silently moves on if the formatter isn't installed. `lint-gate` is blocking: exit 2 with stderr forces the next agent turn to fix the lint error before continuing.

### 5.3 `pm-policy`

Detects `pnpm-lock.yaml` / `bun.lock(b)` / `yarn.lock` and refuses the wrong package manager with a clear stderr message.

### 5.4 `test-on-edit` — opt-in per project

Drop a `.fulcrum/test-on-edit.toml` in your repo:

```toml
"*.py"      = "pytest -x {file}"
"src/*.ts"  = "vitest run {file}"
"*.go"      = "go test ./$(dirname {file})/..."
```

Without that file, the hook does nothing. With it, on every edit the matching command runs in the background and writes to `/tmp/<project>-test-on-edit.log`. The agent is never blocked.

### 5.5 `audit-log`

Cheap forensic trail. Useful when something breaks ("which command rewrote my git history?") — `tail ~/.fulcrum/state/$(basename $PWD)/shell-commands.log` shows the last hour of agent shell activity. Drop the recipe entirely if you don't audit.

### 5.6 `tool-output-router`

The replacement for blanket MCP truncation. Each tool gets a tailored output strategy in `~/.fulcrum/tool-output-policy.toml` — small structured tools stay raw, huge dumps go to file, formatters return only their exit code. **Default: leave-as-is** (never truncate without explicit policy). Full tier matrix in [tool-output-policy.md](tool-output-policy.md). Edit `~/.fulcrum/tool-output-policy.toml` to override.

---

## 6. Cross-agent

### 6.1 Hook system per agent

| Agent | Config | Events count | Mechanism | Blocking tool? |
|---|---|---|---|---|
| Claude Code | `~/.claude/settings.json` `hooks` block | ~25 | shell command | yes (PreToolUse exit 2 / `permissionDecision: deny`) |
| Codex CLI | `~/.codex/hooks.json` (JSON recommended over TOML) | 6 | shell command | yes (exit 2) |
| Gemini CLI | `~/.gemini/settings.json` `hooks` | 11 | shell command, returns JSON | yes (exit 2; `toolConfig` to mutate) |
| OpenCode | `~/.config/opencode/plugins/*.ts` | 30+ | TypeScript plugin | yes (`tool.execute.before` returns `{deny: true}`) |
| Pi CLI | `~/.pi/agent/extensions/*.ts` | 20+ | TypeScript extension (`pi.on(event, …)`) | yes (`tool_call` returns `{block: true, reason}`) |

Every agent supports the same five categories: session lifecycle, before-tool, after-tool, before-prompt, end-of-turn. The names differ; the `fulcrum hook <name>` subcommand behind them doesn't.

### 6.2 Recipe → event mapping

Same script, different registration. Use this table to wire each recipe in §5 across agents.

| Recipe | Claude Code | Codex | Gemini | OpenCode | Pi |
|---|---|---|---|---|---|
| `index-check` | `SessionStart` | `SessionStart` | `SessionStart` | `session.created` | `session_start` |
| `index-rebuild` | `Stop` | `Stop` | `SessionEnd` | `session.idle` | `session_shutdown` |
| `format` | `PostToolUse` matcher `Write\|Edit` | `PostToolUse` (filter on `tool_name` in script) | `AfterTool` | `tool.execute.after` (or `file.edited`) | `tool_result` (filter on tool name) |
| `lint-gate` | `PostToolUse Write\|Edit`, exit 2 | `PostToolUse`, exit 2 | `AfterTool`, exit 2 | `tool.execute.after`, throw / return error | `tool_result`, return `{block:true,reason}` |
| `pm-policy` | `PreToolUse Bash`, exit 2 | `PreToolUse`, exit 2 | `BeforeTool`, exit 2 | `tool.execute.before` returns `{deny}` | `tool_call` returns `{block:true,reason}` |
| `test-on-edit` | `PostToolUse Write\|Edit`, `nohup … &` | `PostToolUse`, `nohup … &` | `AfterTool`, `nohup … &` | `tool.execute.after`, spawn detached | `tool_result`, spawn detached |
| `audit-log` | `PostToolUse Bash` | `PostToolUse` | `AfterTool` | `tool.execute.after` | `tool_result` |
| `tool-output-router` | `PostToolUse` (any) | `PostToolUse` | `AfterTool` | `tool.execute.after` | `tool_result` |

### 6.3 Per-agent gotchas

- **Codex** — `Stop` must return JSON, not plain text; other events accept stdout text. JSON config recommended over inline TOML (known startup bug).
- **Gemini** — MCP server names break with underscores; use hyphens. `additionalContext` injection only works on hooks that return JSON.
- **OpenCode** — TypeScript plugin, not shell; the bash recipes in §5 must be invoked via `await $\`…\`` template tag from the plugin file. The wrapper:
  ```ts
  // ~/.config/opencode/plugins/fulcrum.ts
  export const FulcrumPlugin = async ({ $ }) => ({
    "tool.execute.before": async ({ tool, input }) => {
      if (tool === "bash") await $({ env: { HOOK_INPUT: JSON.stringify({ tool_input: input }) } })`fulcrum hook pm-policy`
    }
  })
  ```
- **Pi** — TS extensions, hot-reloadable via `/reload`. `before_agent_start` can rewrite the system prompt; equivalent power to Claude Code's SessionStart context injection. No MCP support — `tool-output-router` rules for `mcp__.*` won't fire on Pi.
- **All agents** — invoke `fulcrum hook <name>` from each agent's native config. The binary at `~/.fulcrum/bin/fulcrum` (symlinked to `~/.local/bin/fulcrum` on PATH when possible) is the single source of truth. `fulcrum hooks enable <name>` edits detected native config files and also prints the per-agent snippet for review.

---

## 7. Anti-patterns

- **Network calls in PreToolUse.** Latency budget gone; agent feels stuck. Cache, or move to async `Stop`.
- **Silent repo mutation.** Auto-`git commit`, auto-stage, writing files into the working tree from a hook — the agent will be confused next turn, and the user will never know what changed. Use `/tmp/` or `$XDG_STATE_HOME`.
- **Long-running tests in PreToolUse.** Run in background (`&`), surface results in `SessionStart` or `Notification`.
- **Writing diagnostics to stdout** in non-context events. PreToolUse/PostToolUse stdout outside `hookSpecificOutput` is dropped — use stderr.
- **Depending on undocumented stdin fields.** The schema evolved (5 events → 25+ in a year). Use `jq -r '.field // empty'` defensively.
- **Hooks that re-invoke the agent.** Loops. Especially tempting in `Stop` with `decision:"block"`.
- **Default 600s timeout.** Always set a real `timeout` on hot-path hooks. A wedged hook silently freezes the session for ten minutes.
- **One mega-script.** Split per concern. `format.sh`, `lint.sh`, `bash-guard.sh` — each <50 lines, each independently testable with `echo '{...}' | ./hook.sh`.
- **No fallback when a tool is missing.** `command -v gitleaks >/dev/null || exit 0` — never break a teammate who hasn't installed your favorite scanner.
- **Catching stop with `decision:"block"` to "do one more thing".** If you find yourself doing this, the work belongs in `PostToolUse` or in a real CI step.

---

## Sources

- [Hooks reference (code.claude.com)](https://code.claude.com/docs/en/hooks)
- [Settings reference (code.claude.com)](https://code.claude.com/docs/en/settings)
- [disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery)
- [blakecrosley.com — production hooks tutorial](https://blakecrosley.com/blog/claude-code-hooks-tutorial)
- [stevekinney.com — hook cookbook](https://stevekinney.com/courses/ai-development/claude-code-hook-examples)
- [pixelmojo.io — production CI/CD patterns](https://www.pixelmojo.io/blogs/claude-code-hooks-production-quality-ci-cd-patterns)

All event shapes, exit-code semantics, output fields, and settings precedence verified against primary docs 2026-04-27.
