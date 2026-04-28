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
