---
name: jq
description: Use this skill whenever the user works with JSON on the command line — extracting fields, filtering arrays, reshaping objects, converting JSON to CSV/TSV, counting or sorting items, or piping JSON between tools. Trigger phrases include "extract from JSON", "filter the JSON output", "get the field from this API response", "count items in an array", "merge two JSON files", "select where", "list all the IDs". Use jq instead of grep/sed/awk on JSON, instead of one-shot Python or Node scripts, and instead of manual string parsing. Skip this skill for YAML (use yq), CSV (use awk/miller), XML (use xmlstarlet), or in-program JSON parsing inside Python/JS source files.
---

# jq

## When to use

- The user has JSON in front of them — a file, an API response, an HTTP body, CLI tool output (`gh`, `kubectl`, `aws`, `terraform output -json`, `npm pkg get`, `cargo metadata`) — and wants to query, filter, reshape, or convert it.
- The agent itself is about to invoke a tool with JSON output (anything with `--json`, `--format json`, `-o json`) and needs a specific value.
- The user asks how to count, sort, group, or aggregate items inside a JSON array.
- The user pipes JSON through `grep` or `awk` — that almost always wants jq.

**Skip** for: YAML / TOML / XML (use `yq` or `xmlstarlet`); CSV (use `awk` / `miller` / `csvkit`); JSON parsing inside Python/Go/Node *source code* (use the language's stdlib).

## Invocation

```bash
# Read from stdin (most common)
<command-producing-json> | jq '<filter>'

# Read from a file
jq '<filter>' file.json

# Raw string output (no surrounding quotes)
jq -r '.field'

# Compact one-line-per-result
jq -c '.[]'

# Slurp multiple JSON values into an array
jq -s '.' file1.json file2.json

# Inject a shell value safely (string)
jq --arg name "$NAME" '.[] | select(.user == $name)'

# Inject a shell value safely (JSON)
jq --argjson cutoff 10 '.[] | select(.score >= $cutoff)'
```

## Patterns

### Pattern A — extract one field

```bash
gh pr list --json number,title,author | jq '.[] | .number'
```

Use `-r` to drop the surrounding quotes when piping into another command:

```bash
gh pr list --json number | jq -r '.[].number' | xargs -I{} gh pr view {}
```

### Pattern B — filter array by predicate

```bash
jq '.items[] | select(.status == "active")' data.json
jq '.items | map(select(.score > 50))' data.json   # array out
```

`select(...)` keeps elements where the condition is truthy. Wrap with `map(...)` to keep array shape.

### Pattern C — reshape objects

```bash
jq '.items | map({id: .id, owner: .user.login, count: (.tags | length)})'
```

`{a, b}` is shorthand for `{a: .a, b: .b}`. Computed fields use `(...)` to scope the expression.

### Pattern D — aggregate

```bash
jq 'length'                          # array/object length
jq '[.[] | .price] | add'            # sum
jq 'map(.price) | add / length'      # mean
jq 'group_by(.kind) | map({kind: .[0].kind, n: length})'
jq 'sort_by(.created_at) | reverse | .[:5]'
```

### Pattern E — convert JSON to CSV/TSV

```bash
jq -r '.items[] | [.id, .name, .price] | @csv' data.json   # quoted CSV
jq -r '.items[] | [.id, .name, .price] | @tsv' data.json   # tab-separated
```

`@csv` quotes strings and escapes embedded commas. `@tsv` doesn't quote, but it DOES escape control characters (`\n`, `\r`, `\t`, `\\`) so embedded tabs/newlines round-trip safely.

### Pattern F — defaults and conditionals

```bash
jq '.user.email // "<missing>"'                         # default
jq 'if .status == "ok" then .value else null end'
jq '.items[]?'                                          # tolerate missing
```

`//` is null-or-false fallback (LHS produces a non-null, non-false value, or RHS wins). `?` after a path swallows "Cannot index" errors.

### Pattern G — paths, walk, deep edits

```bash
jq 'paths(. == null)'                                   # find nulls
jq 'walk(if type == "string" then ascii_downcase else . end)'
jq 'setpath(["meta","fetched_at"]; now | todate)'
```

## Anti-patterns

- **Don't `grep '"key"'`** on JSON — breaks on key reordering, multi-line values, escaped quotes. Use `jq '.key'`.
- **Don't pipe JSON to `awk`** to split on `:` — keys and values can both contain `:`. Use jq.
- **Don't `python -c 'import json, sys; …'`** for one-shots — startup cost dominates and the script is a security review item. Use jq.
- **Don't forget `-r`** when piping into another command. Without it, jq emits `"value"` (with quotes) which most tools then mis-handle.
- **Don't interpolate shell variables into the filter string.** `jq ".[] | select(.x == \"$VAR\")"` breaks on quotes/backslashes/spaces. Use `--arg` (string) or `--argjson` (already-JSON).
- **Don't write `.[]` when you wanted an array result.** `.[]` streams individual values; wrap with `[...]` or use `map(...)` to keep array shape.
- **Don't write a 200-character one-liner.** When the filter outgrows one screen, save it to `query.jq` and run `jq -f query.jq`.

## Cross-refs

- Rule: see `rules/AGENTS.md` §3 — "use jq for any JSON read/transform".
- Hook recipe: `tool-output-router` (in `docs/tool-output-policy.md`) routes large JSON outputs through the policy file; jq runs against either the raw stdout or the saved `~/.fulcrum/state/.../*.out` file.
- Manual: <https://jqlang.org/manual/>
- Cookbook: <https://github.com/stedolan/jq/wiki/Cookbook>
