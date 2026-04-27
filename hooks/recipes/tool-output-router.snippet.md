### `tool-output-router` registration

Per-tool output handling driven by `~/.fulcrum/tool-output-policy.toml` (seeded by `install.sh`). Default tier: `leave-as-is` — never blanket-truncate. See [docs/tool-output-policy.md](../../docs/tool-output-policy.md) for the tier matrix.

**Claude Code** — `~/.claude/settings.json` (matcher `.*` runs on every tool; the script self-routes)
```json
{ "hooks": { "PostToolUse": [
  { "matcher": ".*",
    "hooks": [{ "type": "command", "command": "~/.fulcrum/hooks/recipes/tool-output-router.sh", "timeout": 8000 }] }
] } }
```

**Codex CLI** — `~/.codex/hooks.json`
```json
{ "hooks": { "PostToolUse": [
  { "hooks": [{ "type": "command", "command": "~/.fulcrum/hooks/recipes/tool-output-router.sh" }] }
] } }
```

**Gemini CLI** — `~/.gemini/settings.json`
```json
{ "hooks": { "AfterTool": [
  { "type": "command", "command": "~/.fulcrum/hooks/recipes/tool-output-router.sh" }
] } }
```

**OpenCode** — `~/.config/opencode/plugins/fulcrum.ts`
```ts
"tool.execute.after": async ({ $, tool, input, output }) => {
  await $({ env: { HOOK_INPUT: JSON.stringify({ tool_name: tool, tool_input: input, tool_response: output }) } })`~/.fulcrum/hooks/recipes/tool-output-router.sh`
}
```

**Pi CLI** — `~/.pi/agent/extensions/tool-output.ts` (Pi has no MCP — entries for `mcp__*` won't fire)
```ts
import { execSync } from "child_process"
pi.on("tool_result", (e) => {
  execSync("~/.fulcrum/hooks/recipes/tool-output-router.sh", { input: JSON.stringify(e) })
})
```
