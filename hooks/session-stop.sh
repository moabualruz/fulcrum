#!/usr/bin/env bash
# Fulcrum Stop hook — mechanical only per docs/memory.md §7.
# Activation gate: substantive sessions only (uncommitted changes OR commits in last hour).
# Pushes vault if dirty. Marks substantive activity for SessionStart's /wrap notice.
set -euo pipefail

VAULT="${VAULT:-$HOME/vault}"
PROJECT=$(basename "$PWD")
STATE="$HOME/.fulcrum/state"
mkdir -p "$STATE"

# Activation gate (memory.md §2 #5)
DIRTY=$(git status --porcelain 2>/dev/null || true)
RECENT=$(git log --since='1 hour ago' --oneline 2>/dev/null | wc -l | tr -d ' ')
if [ -z "$DIRTY" ] && [ "$RECENT" -eq 0 ]; then
  exit 0
fi

# Mark substantive activity (SessionStart reads this to propose /wrap)
touch "$STATE/$PROJECT.last-stop"

# Push vault if it has changes
if [ -d "$VAULT/.git" ]; then
  if [ -n "$(git -C "$VAULT" status --porcelain 2>/dev/null)" ]; then
    AGENT="${FULCRUM_AGENT:-claude}"  # set per-agent (claude|codex|gemini|opencode|pi)
    git -C "$VAULT" pull --rebase --quiet 2>/dev/null || true
    git -C "$VAULT" add -A
    git -C "$VAULT" commit -m "session: $(date -u +%Y-%m-%dT%H:%MZ) [$PROJECT] ($AGENT)" --quiet || true
  fi
  git -C "$VAULT" push --quiet 2>/dev/null || true
fi

exit 0
