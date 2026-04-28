### `index-check` registration

Runs at session start; warns if `tags` / `graphify-out/` are stale or missing.

**Claude Code** — `~/.claude/settings.json`
```json
{ "hooks": { "SessionStart": [
  { "hooks": [{ "type": "command", "command": "fulcrum hook index-check", "timeout": 5000 }] }
] } }
```

**Codex CLI** — `~/.codex/hooks.json`
```json
{ "hooks": { "SessionStart": [
  { "hooks": [{ "type": "command", "command": "fulcrum hook index-check" }] }
] } }
```

**Gemini CLI** — `~/.gemini/settings.json`
```json
{ "hooks": { "SessionStart": [
  { "type": "command", "command": "fulcrum hook index-check" }
] } }
```

**OpenCode** — `~/.config/opencode/plugins/fulcrum-index-check.ts`
```ts
"session.created": async ({ $ }) => { await $`fulcrum hook index-check` }
```

**Pi CLI** — `~/.pi/agent/extensions/fulcrum-index-check.ts`
```ts
import { execSync } from "child_process"
pi.on("session_start", () => execSync("fulcrum hook index-check"))
```
