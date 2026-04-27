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
    "hooks": [{ "type": "command", "command": "~/.fulcrum/hooks/recipes/audit-log.sh", "timeout": 2000 }] }
] } }
```

**Codex CLI** — `~/.codex/hooks.json`
```json
{ "hooks": { "PostToolUse": [
  { "hooks": [{ "type": "command", "command": "~/.fulcrum/hooks/recipes/audit-log.sh" }] }
] } }
```

**Gemini CLI** — `~/.gemini/settings.json`
```json
{ "hooks": { "AfterTool": [
  { "type": "command", "command": "~/.fulcrum/hooks/recipes/audit-log.sh" }
] } }
```

**OpenCode** — `~/.config/opencode/plugins/fulcrum.ts`
```ts
"tool.execute.after": async ({ $, tool, input, output }) => {
  if (tool !== "bash") return
  await $({ env: { HOOK_INPUT: JSON.stringify({ tool_input: input, tool_response: output }) } })`~/.fulcrum/hooks/recipes/audit-log.sh`
}
```

**Pi CLI** — `~/.pi/agent/extensions/audit-log.ts`
```ts
import { execSync } from "child_process"
pi.on("tool_result", (e) => {
  if (e.tool_name !== "bash") return
  execSync("~/.fulcrum/hooks/recipes/audit-log.sh", { input: JSON.stringify(e) })
})
```
