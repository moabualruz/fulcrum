### `index-rebuild` registration

Runs after the agent finishes a turn; rebuilds ctags / graphify / repomix only when HEAD changed or working tree dirty.

**Claude Code** — `~/.claude/settings.json`
```json
{ "hooks": { "Stop": [
  { "hooks": [{ "type": "command", "command": "~/.fulcrum/hooks/recipes/index-rebuild.sh", "timeout": 60000 }] }
] } }
```

**Codex CLI** — `~/.codex/hooks.json`
```json
{ "hooks": { "Stop": [
  { "hooks": [{ "type": "command", "command": "~/.fulcrum/hooks/recipes/index-rebuild.sh" }] }
] } }
```

**Gemini CLI** — `~/.gemini/settings.json`
```json
{ "hooks": { "SessionEnd": [
  { "type": "command", "command": "~/.fulcrum/hooks/recipes/index-rebuild.sh" }
] } }
```

**OpenCode** — `~/.config/opencode/plugins/fulcrum.ts`
```ts
"session.idle": async ({ $ }) => { await $`~/.fulcrum/hooks/recipes/index-rebuild.sh` }
```

**Pi CLI** — `~/.pi/agent/extensions/index.ts`
```ts
import { execSync } from "child_process"
pi.on("session_shutdown", () => execSync("~/.fulcrum/hooks/recipes/index-rebuild.sh"))
```
