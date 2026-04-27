### `format` registration

Runs after the agent edits a file; formats with the right per-language tool. Non-blocking.

**Claude Code** — `~/.claude/settings.json`
```json
{ "hooks": { "PostToolUse": [
  { "matcher": "Write|Edit",
    "hooks": [{ "type": "command", "command": "~/.fulcrum/hooks/recipes/format.sh", "timeout": 8000 }] }
] } }
```

**Codex CLI** — `~/.codex/hooks.json` (the script self-filters on `tool_input.file_path`, so an unmatched event exits 0)
```json
{ "hooks": { "PostToolUse": [
  { "hooks": [{ "type": "command", "command": "~/.fulcrum/hooks/recipes/format.sh" }] }
] } }
```

**Gemini CLI** — `~/.gemini/settings.json`
```json
{ "hooks": { "AfterTool": [
  { "type": "command", "command": "~/.fulcrum/hooks/recipes/format.sh" }
] } }
```

**OpenCode** — `~/.config/opencode/plugins/fulcrum.ts`
```ts
"tool.execute.after": async ({ $, tool, input }) => {
  if (tool === "edit" || tool === "write") {
    await $({ env: { HOOK_INPUT: JSON.stringify({ tool_input: input }) } })`~/.fulcrum/hooks/recipes/format.sh`
  }
}
```

**Pi CLI** — `~/.pi/agent/extensions/format.ts`
```ts
import { execSync } from "child_process"
pi.on("tool_result", (e) => {
  if (e.tool_name !== "edit" && e.tool_name !== "write") return
  execSync("~/.fulcrum/hooks/recipes/format.sh", { input: JSON.stringify(e) })
})
```
