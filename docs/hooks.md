# Automation Layer — Index Hooks

> Deterministic enforcement that cannot be ignored. Hooks for **index maintenance** only — memory + handover hooks (`session-start.sh`, `session-stop.sh`) live in [memory.md](memory.md).

Hooks have two legitimate jobs:
1. **Index maintenance** (this doc) — keep tool indexes current after code changes.
2. **Dynamic context injection** ([memory.md](memory.md)) — inject what the agent cannot retrieve itself.

## 1. Index-aware events

| Hook | Trigger | What it does |
|---|---|---|
| `Stop` | Agent finishes | Rebuilds stale indexes — agent just changed code, best time to update |
| `SessionStart` | Session opens | Checks index freshness, rebuilds if stale before work begins |

Tools with indexes that need maintenance:

| Tool | Index | Rebuild command |
|---|---|---|
| `universal-ctags` | `tags` file in project root | `ctags -R --exclude=.git --exclude=node_modules .` |
| `graphify` | `graphify-out/` directory | `graphify build .` |
| `repomix` | cached pack at `/tmp/<slug>.xml` | `repomix --compress -o /tmp/<slug>.xml` |

## 2. Settings — `~/.claude/settings.json`

Index hooks are registered alongside memory hooks (see [memory.md](memory.md) for the combined block). Index-only registration:

```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{"type": "command", "command": "~/.fulcrum/hooks/index-rebuild.sh"}]
    }],
    "SessionStart": [{
      "hooks": [{"type": "command", "command": "~/.fulcrum/hooks/index-check.sh"}]
    }]
  }
}
```

## 3. Hook scripts — `~/.fulcrum/hooks/`

### `index-rebuild.sh` — runs after agent stops, rebuilds only when code changed

```bash
#!/usr/bin/env bash
set -euo pipefail
SLUG=$(basename "$PWD")
SHA_FILE="/tmp/${SLUG}.index-sha"
CURR_SHA=$(git rev-parse HEAD 2>/dev/null || echo "no-git")
DIRTY=$(git status --porcelain 2>/dev/null || true)
LAST_SHA=$(cat "$SHA_FILE" 2>/dev/null || echo "")

# Skip if HEAD unchanged and working tree is clean
[ "$LAST_SHA" = "$CURR_SHA" ] && [ -z "$DIRTY" ] && exit 0

ctags -R --exclude=.git --exclude=node_modules . 2>/dev/null &
graphify build . 2>/dev/null &
repomix --compress -o "/tmp/${SLUG}.xml" 2>/dev/null &
wait

echo "$CURR_SHA" > "$SHA_FILE"
exit 0
```

SHA stored in `/tmp/` — never touches the repo. Rebuild triggers on: new commits (including pushed), uncommitted changes. Skips when nothing changed.

### `index-check.sh` — runs at session start, warns if indexes are stale

```bash
#!/usr/bin/env bash
NOW=$(date +%s)

if [ -f "tags" ]; then
  AGE=$(( NOW - $(stat -f %m tags 2>/dev/null || echo "$NOW") ))
  [ $AGE -gt 3600 ] && echo "ctags index is $(( AGE / 60 ))min old — rebuild with: ctags -R ."
else
  echo "No ctags index — run: ctags -R --exclude=.git --exclude=node_modules ."
fi

if [ ! -d "graphify-out" ]; then
  echo "No graphify graph — run: graphify build ."
fi

exit 0
```

## Cross-agent

Per-agent hook configurations are in [agents.md](agents.md). All agents register the same `~/.fulcrum/hooks/index-*.sh` scripts; only the configuration syntax differs.
