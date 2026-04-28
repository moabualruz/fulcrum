### `test-on-edit` registration

Opt-in per project: drop a `.fulcrum/test-on-edit.toml` at the repo root mapping glob → command. Without that file, the hook is a no-op. Runs in background; output to `/tmp/<project>-test-on-edit.log`.

Example `.fulcrum/test-on-edit.toml`:
```toml
"*.py"     = "pytest -x {file}"
"src/*.ts" = "vitest run {file}"
"*.go"     = "go test ./$(dirname {file})/..."
```

**Claude Code** — `~/.claude/settings.json`
```json
{ "hooks": { "PostToolUse": [
  { "matcher": "Write|Edit",
    "hooks": [{ "type": "command", "command": "fulcrum hook test-on-edit", "timeout": 5000 }] }
] } }
```

**Codex CLI** — `~/.codex/hooks.json`
```json
{ "hooks": { "PostToolUse": [
  { "hooks": [{ "type": "command", "command": "fulcrum hook test-on-edit" }] }
] } }
```

**Gemini CLI** — `~/.gemini/settings.json`
```json
{ "hooks": { "AfterTool": [
  { "type": "command", "command": "fulcrum hook test-on-edit" }
] } }
```

**OpenCode** — `~/.config/opencode/plugins/fulcrum-test-on-edit.ts`
```ts
"tool.execute.after": async ({ $, tool, input }) => {
  if (tool !== "edit" && tool !== "write") return
  await $({ env: { HOOK_INPUT: JSON.stringify({ tool_input: input }) } })`fulcrum hook test-on-edit`
}
```

**Pi CLI** — `~/.pi/agent/extensions/fulcrum-test-on-edit.ts`
```ts
import { execSync } from "child_process"
pi.on("tool_result", (e) => {
  if (e.tool_name !== "edit" && e.tool_name !== "write") return
  execSync("fulcrum hook test-on-edit", { input: JSON.stringify(e) })
})
```
