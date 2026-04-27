#!/usr/bin/env bash
# Fulcrum SessionStart hook — index freshness check per docs/hooks.md §3.
# Warns if indexes are stale or missing. Does not rebuild — that's the Stop hook's job.
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
