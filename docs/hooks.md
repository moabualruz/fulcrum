# Hooks

> Deterministic, lifecycle-driven shell hooks for the Claude Code harness (and equivalents in Codex, Gemini, OpenCode, Pi). Hooks run *outside* the model loop — they cannot be ignored, prompt-injected, or forgotten. Use them for things the agent must *not* be trusted to remember: format, lint, secret-scan, refresh tool indexes, block destructive shell, inject session-time context.

## 1. Event catalogue

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
7. **Quote everything.** `"$CLAUDE_PROJECT_DIR"`, `set -euo pipefail`, `jq -r` over manual string parsing of stdin.
8. **Hooks run with full shell privileges.** No sandbox. Treat `.claude/hooks/*` as production code; review before adding.

---

## 5. Recipe library

All recipes assume scripts live at `"$CLAUDE_PROJECT_DIR"/.claude/hooks/` (project) or `~/.fulcrum/hooks/` (user). All read JSON event from stdin via `jq`.

### 5.1 Index maintenance — Stop + SessionStart

Rebuilds `tags`, `graphify-out/`, repomix pack only when HEAD changed or working tree dirty. SHA stored in `/tmp/<slug>.index-sha`. Full scripts ship in `hooks/index-rebuild.sh` and `hooks/index-check.sh`.

### 5.2 Auto-format on edit — PostToolUse · `Write|Edit`

```json
{ "matcher": "Write|Edit",
  "hooks": [{ "type": "command",
    "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/format.sh", "timeout": 8000 }] }
```

```bash
#!/usr/bin/env bash
set -euo pipefail
FILE=$(jq -r '.tool_input.file_path // empty')
[ -z "$FILE" ] || [ ! -f "$FILE" ] && exit 0
case "$FILE" in
  *.py)             ruff format "$FILE" >&2 2>/dev/null || true ;;
  *.ts|*.tsx|*.js|*.jsx|*.json|*.md) prettier --write "$FILE" >&2 2>/dev/null || true ;;
  *.go)             gofmt -w "$FILE" >&2 2>/dev/null || true ;;
  *.rs)             rustfmt "$FILE" >&2 2>/dev/null || true ;;
esac
exit 0
```

Idempotent, never blocks, never speaks back to the model.

### 5.3 Lint gate — PostToolUse · `Write|Edit` (blocking)

Same matcher; exit 2 with stderr feeds the lint output back to Claude so the next turn fixes it.

```bash
#!/usr/bin/env bash
FILE=$(jq -r '.tool_input.file_path // empty')
[[ "$FILE" == *.py ]] || exit 0
if ! ruff check --quiet "$FILE" >&2; then
  echo "ruff found violations in $FILE — fix before continuing" >&2
  exit 2
fi
```

[source: https://blakecrosley.com/blog/claude-code-hooks-tutorial]

### 5.4 Block destructive bash — PreToolUse · `Bash`

```bash
#!/usr/bin/env bash
CMD=$(jq -r '.tool_input.command // empty')
deny() { echo "blocked: $1" >&2; exit 2; }
case "$CMD" in
  *"rm -rf /"*|*"rm -rf ~"*|*"rm -rf \$HOME"*) deny "rm -rf on root/home" ;;
  *"git push --force"*|*"git push -f"*)
    [[ "$CMD" == *"origin main"* || "$CMD" == *"origin master"* ]] && deny "force-push to main/master" ;;
  *"git reset --hard"*) deny "destructive reset — confirm with user" ;;
  *":(){ :|:& };:"*)    deny "fork bomb" ;;
  *"chmod -R 777"*)     deny "world-writable recursive chmod" ;;
esac
exit 0
```

[source: https://github.com/disler/claude-code-hooks-mastery]

### 5.5 Secret scan before commit — PreToolUse · `Bash` matching `git commit`

```bash
#!/usr/bin/env bash
CMD=$(jq -r '.tool_input.command // empty')
[[ "$CMD" == *"git commit"* ]] || exit 0
command -v gitleaks >/dev/null || exit 0
if ! gitleaks protect --staged --no-banner --redact >&2; then
  echo "gitleaks found secrets in staged diff — abort commit" >&2
  exit 2
fi
```

Falls open if `gitleaks` not installed (don't break devs without the tool).

### 5.6 Protected paths — PreToolUse · `Edit|Write`

```bash
#!/usr/bin/env bash
F=$(jq -r '.tool_input.file_path // empty')
case "$F" in
  *.env|*.env.*|*/.git/*|*/node_modules/*|*.lock|*-lock.json|*.pem|*.key)
    echo "refuse to edit $F (sensitive/generated)" >&2; exit 2 ;;
esac
```

### 5.7 Package-manager policy — PreToolUse · `Bash`

```bash
CMD=$(jq -r '.tool_input.command // empty')
if [ -f "$CLAUDE_PROJECT_DIR/pnpm-lock.yaml" ] && [[ "$CMD" =~ (^|[[:space:]])npm[[:space:]] ]]; then
  echo "this repo uses pnpm — replace 'npm' with 'pnpm'" >&2; exit 2
fi
```

[source: https://stevekinney.com/courses/ai-development/claude-code-hook-examples]

### 5.8 MCP output truncation — PostToolUse · `mcp__.*`

For chatty MCP tools that blow context, return `hookSpecificOutput.updatedMCPToolOutput`:

```bash
RESP=$(jq -r '.tool_response | tostring')
if [ "${#RESP}" -gt 8000 ]; then
  TRUNC=$(printf '%s' "$RESP" | head -c 4000)
  jq -nc --arg s "$TRUNC… [truncated $((${#RESP} - 4000)) bytes]" \
    '{hookSpecificOutput:{hookEventName:"PostToolUse", updatedMCPToolOutput:$s}}'
fi
```

### 5.9 Background test runner — PostToolUse · `Write|Edit` (non-blocking)

```bash
FILE=$(jq -r '.tool_input.file_path // empty')
[[ "$FILE" == *.py ]] || exit 0
TEST="${FILE%.py}_test.py"; [ -f "$TEST" ] || TEST="tests/test_$(basename "${FILE%.py}").py"
[ -f "$TEST" ] || exit 0
nohup pytest -x "$TEST" >"/tmp/$(basename "$TEST").log" 2>&1 &
exit 0
```

Background `&` keeps the agent unblocked; results land in `/tmp/`. A SessionStart hook can surface failures from the previous run.

### 5.10 Notify on long session — Stop

There is no native "long-running" event. Compute duration in `Stop` from a timestamp written by `UserPromptSubmit`:

```bash
# UserPromptSubmit hook
date +%s > /tmp/cc-turn-start; exit 0

# Stop hook
START=$(cat /tmp/cc-turn-start 2>/dev/null || echo 0)
DUR=$(( $(date +%s) - START ))
if [ $DUR -gt 120 ]; then
  case "$(uname)" in
    Darwin) osascript -e "display notification \"Claude finished after ${DUR}s\" with title \"Claude Code\"" ;;
    Linux)  notify-send "Claude Code" "finished after ${DUR}s" ;;
  esac
fi
exit 0
```

### 5.11 Bash command audit log — PostToolUse · `Bash`

```bash
mkdir -p "$CLAUDE_PROJECT_DIR/.claude"
jq -r '[now|todate, .tool_input.command, .tool_response.exit_code // 0] | @tsv' \
  >> "$CLAUDE_PROJECT_DIR/.claude/bash-commands.log"
exit 0
```

Add `.claude/bash-commands.log` to `.gitignore`.

---

## 6. Cross-agent

Every other agent has an equivalent surface but different syntax: Codex (`~/.codex/hooks.json`, 6 events), Gemini (`settings.json` `hooks`, 11 events incl. `BeforeModel`/`AfterModel`), OpenCode (TypeScript plugins, 30+ events), Pi (TS extensions, `pi.on(event, …)`, 20+ events incl. blockable `tool_call`). Same shell scripts can back all of them — wrap once, register per agent. Full matrix in [agents.md](agents.md).

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
