### `index-rebuild` registration

**Claude Code** — `~/.claude/settings.json`
```json
{ "hooks": { "Stop": [
  { "hooks": [{ "type": "command", "command": "fulcrum hook index-rebuild", "timeout": 60000 }] }
] } }
```

**Codex CLI** — `~/.codex/hooks.json`
```json
{ "hooks": { "Stop": [
  { "hooks": [{ "type": "command", "command": "fulcrum hook index-rebuild" }] }
] } }
```

**Gemini CLI** — `~/.gemini/settings.json`
```json
{ "hooks": { "SessionEnd": [
  { "type": "command", "command": "fulcrum hook index-rebuild" }
] } }
```

**OpenCode** — `~/.config/opencode/plugins/fulcrum-index-rebuild.ts`
```ts
"session.idle": async ({ $ }) => { await $`fulcrum hook index-rebuild` }
```

**Pi CLI** — `~/.pi/agent/extensions/fulcrum-index-rebuild.ts`
```ts
import { execSync } from "child_process"
pi.on("session_shutdown", () => execSync("fulcrum hook index-rebuild"))
```
