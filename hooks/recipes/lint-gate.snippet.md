### `lint-gate` registration

Blocks the next agent turn if lint fails on the just-edited file. Stderr feeds the lint output back.

**Claude Code** — `~/.claude/settings.json`
```json
{ "hooks": { "PostToolUse": [
  { "matcher": "Write|Edit",
    "hooks": [{ "type": "command", "command": "~/.fulcrum/hooks/recipes/lint-gate.sh", "timeout": 15000 }] }
] } }
```

**Codex CLI** — `~/.codex/hooks.json`
```json
{ "hooks": { "PostToolUse": [
  { "hooks": [{ "type": "command", "command": "~/.fulcrum/hooks/recipes/lint-gate.sh" }] }
] } }
```

**Gemini CLI** — `~/.gemini/settings.json` (exit 2 = block)
```json
{ "hooks": { "AfterTool": [
  { "type": "command", "command": "~/.fulcrum/hooks/recipes/lint-gate.sh" }
] } }
```

**OpenCode** — `~/.config/opencode/plugins/fulcrum.ts`
```ts
"tool.execute.after": async ({ $, tool, input }) => {
  if (tool !== "edit" && tool !== "write") return
  try {
    await $({ env: { HOOK_INPUT: JSON.stringify({ tool_input: input }) } })`~/.fulcrum/hooks/recipes/lint-gate.sh`
  } catch (e) {
    throw new Error("lint-gate: violations — fix before continuing")
  }
}
```

**Pi CLI** — `~/.pi/agent/extensions/lint-gate.ts` (return `{block:true,reason}` to block)
```ts
import { execSync } from "child_process"
pi.on("tool_result", (e) => {
  if (e.tool_name !== "edit" && e.tool_name !== "write") return
  try {
    execSync("~/.fulcrum/hooks/recipes/lint-gate.sh", { input: JSON.stringify(e) })
  } catch {
    return { block: true, reason: "lint-gate: violations" }
  }
})
```
