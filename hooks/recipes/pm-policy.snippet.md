### `pm-policy` registration

Refuses `npm`/`yarn` when the repo declares pnpm; refuses `npm` when bun is declared. Detects `pnpm-lock.yaml` / `bun.lock(b)` / `yarn.lock` in the project root.

**Claude Code** — `~/.claude/settings.json`
```json
{ "hooks": { "PreToolUse": [
  { "matcher": "Bash",
    "hooks": [{ "type": "command", "command": "~/.fulcrum/hooks/recipes/pm-policy.sh", "timeout": 3000 }] }
] } }
```

**Codex CLI** — `~/.codex/hooks.json`
```json
{ "hooks": { "PreToolUse": [
  { "hooks": [{ "type": "command", "command": "~/.fulcrum/hooks/recipes/pm-policy.sh" }] }
] } }
```

**Gemini CLI** — `~/.gemini/settings.json`
```json
{ "hooks": { "BeforeTool": [
  { "type": "command", "command": "~/.fulcrum/hooks/recipes/pm-policy.sh" }
] } }
```

**OpenCode** — `~/.config/opencode/plugins/fulcrum.ts`
```ts
"tool.execute.before": async ({ $, tool, input }) => {
  if (tool !== "bash") return
  try {
    await $({ env: { HOOK_INPUT: JSON.stringify({ tool_input: input }) } })`~/.fulcrum/hooks/recipes/pm-policy.sh`
  } catch (e) {
    return { deny: true, reason: String(e) }
  }
}
```

**Pi CLI** — `~/.pi/agent/extensions/pm-policy.ts`
```ts
import { execSync } from "child_process"
pi.on("tool_call", (e) => {
  if (e.tool_name !== "bash") return
  try {
    execSync("~/.fulcrum/hooks/recipes/pm-policy.sh", { input: JSON.stringify(e) })
  } catch (err: any) {
    return { block: true, reason: err.stderr?.toString() ?? "pm-policy" }
  }
})
```
