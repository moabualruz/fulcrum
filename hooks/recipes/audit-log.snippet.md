### `audit-log` registration

Agent-neutral forensic trail: appends `ISO-8601\tcommand\texit_code` to `~/.fulcrum/state/<project>/shell-commands.log`. Write-only, never blocks.

Inspect with:
```bash
tail ~/.fulcrum/state/$(basename "$PWD")/shell-commands.log
```

**Claude Code** — `~/.claude/settings.json`
```json
{ "hooks": { "PostToolUse": [
  { "matcher": "Bash",
    "hooks": [{ "type": "command", "command": "fulcrum hook audit-log", "timeout": 2000 }] }
] } }
```

**Codex CLI** — `~/.codex/hooks.json`
```json
{ "hooks": { "PostToolUse": [
  { "hooks": [{ "type": "command", "command": "fulcrum hook audit-log" }] }
] } }
```

**Gemini CLI** — `~/.gemini/settings.json`
```json
{ "hooks": { "AfterTool": [
  { "type": "command", "command": "fulcrum hook audit-log" }
] } }
```

**OpenCode** — `~/.config/opencode/plugins/fulcrum-audit-log.ts`
```ts
"tool.execute.after": async ({ $, tool, input, output }) => {
  if (tool !== "bash") return
  await $({ env: { HOOK_INPUT: JSON.stringify({ tool_input: input, tool_response: output }) } })`fulcrum hook audit-log`
}
```

**Pi CLI** — `~/.pi/agent/extensions/fulcrum-audit-log.ts`
```ts
import { execSync } from "child_process"
pi.on("tool_result", (e) => {
  if (e.tool_name !== "bash") return
  execSync("fulcrum hook audit-log", { input: JSON.stringify(e) })
})
```
