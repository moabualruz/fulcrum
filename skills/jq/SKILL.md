---
name: jq
description: Use this skill whenever the user works with JSON on the command line — extracting fields, filtering arrays, reshaping objects, converting JSON to CSV/TSV, counting or sorting items, or piping JSON between tools. Trigger phrases include "extract from JSON", "filter the JSON output", "get the field from this API response", "count items in an array", "merge two JSON files", "select where", "list all the IDs". Use jq instead of grep/sed/awk on JSON, instead of one-shot Python or Node scripts, and instead of manual string parsing. Skip this skill for YAML (use yq), CSV (use awk/miller), XML (use xmlstarlet), or in-program JSON parsing inside Python/JS source files.
---

# jq

## When to use

- User has JSON in front — file, API response, HTTP body, CLI tool output (`gh`, `kubectl`, `aws`, `terraform output -json`, `npm pkg get`, `cargo metadata`) — wants query, filter, reshape, convert.
- Agent about to invoke tool with JSON output (anything with `--json`, `--format json`, `-o json`) needs specific value.
- User ask how to count, sort, group, aggregate items in JSON array.
- User pipe JSON through `grep` or `awk` — almost always want jq.

**Skip** for: YAML / TOML / XML (use `yq` or `xmlstarlet`); CSV (use `awk` / `miller` / `csvkit`); JSON parse inside Python/Go/Node *source code* (use language stdlib).

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

Use `-r` to drop surrounding quotes when piping to another command:

```bash
gh pr list --json number | jq -r '.[].number' | xargs -I{} gh pr view {}
```

### Pattern B — filter array by predicate

```bash
jq '.items[] | select(.status == "active")' data.json
jq '.items | map(select(.score > 50))' data.json   # array out
```

`select(...)` keep elements where condition truthy. Wrap with `map(...)` to keep array shape.

### Pattern C — reshape objects

```bash
jq '.items | map({id: .id, owner: .user.login, count: (.tags | length)})'
```

`{a, b}` shorthand for `{a: .a, b: .b}`. Computed fields use `(...)` to scope expression.

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

`@csv` quote strings, escape embedded commas. `@tsv` no quote, but DOES escape control chars (`\n`, `\r`, `\t`, `\\`) so embedded tabs/newlines round-trip safe.

### Pattern F — defaults and conditionals

```bash
jq '.user.email // "<missing>"'                         # default
jq 'if .status == "ok" then .value else null end'
jq '.items[]?'                                          # tolerate missing
```

`//` = null-or-false fallback (LHS produce non-null non-false value, or RHS win). `?` after path swallow "Cannot index" errors.

### Pattern G — paths, walk, deep edits

```bash
jq 'paths(. == null)'                                   # find nulls
jq 'walk(if type == "string" then ascii_downcase else . end)'
jq 'setpath(["meta","fetched_at"]; now | todate)'
```

## Anti-patterns

- **Don't `grep '"key"'`** on JSON — break on key reorder, multi-line values, escaped quotes. Use `jq '.key'`.
- **Don't pipe JSON to `awk`** to split on `:` — keys and values both can contain `:`. Use jq.
- **Don't `python -c 'import json, sys; …'`** for one-shots — startup cost dominate, script = security review item. Use jq.
- **Don't forget `-r`** when pipe to another command. Without it, jq emit `"value"` (with quotes), most tools mis-handle.
- **Don't interpolate shell vars into filter string.** `jq ".[] | select(.x == \"$VAR\")"` break on quotes/backslashes/spaces. Use `--arg` (string) or `--argjson` (already-JSON).
- **Don't write `.[]` when want array result.** `.[]` stream individual values; wrap with `[...]` or use `map(...)` to keep array shape.
- **Don't write 200-char one-liner.** Filter outgrow one screen → save to `query.jq`, run `jq -f query.jq`.

## Cross-refs

- Rule: see `rules/AGENTS.md` §3 — "use jq for any JSON read/transform".
- Hook recipe: `tool-output-router` (in `docs/tool-output-policy.md`) route large JSON outputs through policy file; jq run against raw stdout or saved `~/.fulcrum/state/.../*.out` file.
- Manual: <https://jqlang.org/manual/>
- Cookbook: <https://github.com/stedolan/jq/wiki/Cookbook>