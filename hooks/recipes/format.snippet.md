### `format` registration

Runs after the agent edits a file; formats with the right per-language tool. Non-blocking.

**Claude Code** — `~/.claude/settings.json`
```json
{ "hooks": { "PostToolUse": [
  { "matcher": "Write|Edit",
    "hooks": [{ "type": "command", "command": "fulcrum hook format", "timeout": 8000 }] }
] } }
```

**Codex CLI** — `~/.codex/hooks.json`
```json
{ "hooks": { "PostToolUse": [
  { "hooks": [{ "type": "command", "command": "fulcrum hook format" }] }
] } }
```

**Gemini CLI** — `~/.gemini/settings.json`
```json
{ "hooks": { "AfterTool": [
  { "type": "command", "command": "fulcrum hook format" }
] } }
```

**OpenCode** — `~/.config/opencode/plugins/fulcrum-format.ts`
```ts
"tool.execute.after": async ({ $, tool, input }) => {
  if (tool === "edit" || tool === "write") {
    await $({ env: { HOOK_INPUT: JSON.stringify({ tool_input: input }) } })`fulcrum hook format`
  }
}
```

**Pi CLI** — `~/.pi/agent/extensions/fulcrum-format.ts`
```ts
import { execSync } from "child_process"
pi.on("tool_result", (e) => {
  if (e.tool_name !== "edit" && e.tool_name !== "write") return
  execSync("fulcrum hook format", { input: JSON.stringify(e) })
})
```
