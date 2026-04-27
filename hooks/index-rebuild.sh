#!/usr/bin/env bash
# Fulcrum Stop hook — index maintenance per docs/hooks.md §3.
# Rebuilds ctags / graphify / repomix only when code changed since last rebuild.
set -euo pipefail

SLUG=$(basename "$PWD")
SHA_FILE="/tmp/${SLUG}.index-sha"
CURR_SHA=$(git rev-parse HEAD 2>/dev/null || echo "no-git")
DIRTY=$(git status --porcelain 2>/dev/null || true)
LAST_SHA=$(cat "$SHA_FILE" 2>/dev/null || echo "")

# Skip if HEAD unchanged and working tree is clean
[ "$LAST_SHA" = "$CURR_SHA" ] && [ -z "$DIRTY" ] && exit 0

# Rebuild in parallel — best-effort, never block exit
ctags -R --exclude=.git --exclude=node_modules . 2>/dev/null &
graphify build . 2>/dev/null &
repomix --compress -o "/tmp/${SLUG}.xml" 2>/dev/null &
wait

echo "$CURR_SHA" > "$SHA_FILE"
exit 0
