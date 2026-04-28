### `tool-output-router` registration

Per-tool output handling driven by `~/.fulcrum/tool-output-policy.toml` (seeded by `fulcrum install`). Default tier: `leave-as-is` — never blanket-truncate. See [docs/tool-output-policy.md](../../docs/tool-output-policy.md) for the tier matrix.

**Claude Code** — `~/.claude/settings.json` (matcher `.*` runs on every tool; the binary self-routes)
```json
{ "hooks": { "PostToolUse": [
  { "matcher": ".*",
    "hooks": [{ "type": "command", "command": "fulcrum hook tool-output-router", "timeout": 8000 }] }
] } }
```

**Codex CLI** — `~/.codex/hooks.json`
```json
{ "hooks": { "PostToolUse": [
  { "hooks": [{ "type": "command", "command": "fulcrum hook tool-output-router" }] }
] } }
```

**Gemini CLI** — `~/.gemini/settings.json`
```json
{ "hooks": { "AfterTool": [
  { "type": "command", "command": "fulcrum hook tool-output-router" }
] } }
```

**OpenCode** — `~/.config/opencode/plugins/fulcrum.ts`
```ts
"tool.execute.after": async ({ $, tool, input, output }) => {
  await $({ env: { HOOK_INPUT: JSON.stringify({ tool_name: tool, tool_input: input, tool_response: output }) } })`fulcrum hook tool-output-router`
}
```

**Pi CLI** — `~/.pi/agent/extensions/fulcrum.ts` (Pi has no MCP — entries for `mcp__*` won't fire)
```ts
import { execSync } from "child_process"
pi.on("tool_result", (e) => {
  execSync("fulcrum hook tool-output-router", { input: JSON.stringify(e) })
})
```
