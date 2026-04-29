## Anti-patterns

- **Don't `grep '"key"'`** on JSON — breaks on key reordering, multi-line values, escaped quotes. Use `jq '.key'`.
- **Don't pipe JSON to `awk`** to split on `:` — keys and values can both contain `:`. Use jq.
- **Don't `python -c 'import json, sys; …'`** for one-shots — startup cost dominates and the script is a security review item. Use jq.
- **Don't forget `-r`** when piping into another command. Without it, jq emits `"value"` (with quotes) which most tools then mis-handle.
- **Don't interpolate shell variables into the filter string.** `jq ".[] | select(.x == \"$VAR\")"` breaks on quotes/backslashes/spaces. Use `--arg` (string) or `--argjson` (already-JSON).
- **Don't write `.[]` when you wanted an array result.** `.[]` streams individual values; wrap with `[...]` or use `map(...)` to keep array shape.
- **Don't write a 200-character one-liner.** When the filter outgrows one screen, save it to `query.jq` and run `jq -f query.jq`.
