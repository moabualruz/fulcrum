### `index-check` registration

Runs at session start; warns if `tags` / `graphify-out/` are stale or missing.

**Claude Code** — `~/.claude/settings.json`
```json
{ "hooks": { "SessionStart": [
  { "hooks": [{ "type": "command", "command": "~/.fulcrum/hooks/recipes/index-check.sh", "timeout": 5000 }] }
] } }
```

**Codex CLI** — `~/.codex/hooks.json`
```json
{ "hooks": { "SessionStart": [
  { "hooks": [{ "type": "command", "command": "~/.fulcrum/hooks/recipes/index-check.sh" }] }
] } }
```

**Gemini CLI** — `~/.gemini/settings.json`
```json
{ "hooks": { "SessionStart": [
  { "type": "command", "command": "~/.fulcrum/hooks/recipes/index-check.sh" }
] } }
```

**OpenCode** — `~/.config/opencode/plugins/fulcrum.ts`
```ts
"session.created": async ({ $ }) => { await $`~/.fulcrum/hooks/recipes/index-check.sh` }
```

**Pi CLI** — `~/.pi/agent/extensions/index.ts`
```ts
import { execSync } from "child_process"
pi.on("session_start", () => execSync("~/.fulcrum/hooks/recipes/index-check.sh"))
```
