## Patterns

### A — rename across a tree (pair with fd)

```bash
fd -t f -e ts -e tsx -x sd -p 'oldName' 'newName'   # preview pass
fd -t f -e ts -e tsx -x sd    'oldName' 'newName'   # apply
```

### B — capture-group rewrite

```bash
sd '(\w+)\.bak' '$1' *.txt                          # strip ".bak" suffix
sd 'from "react"' 'from "preact"' src/**/*.tsx
```

### C — multiline with `-A`

```bash
sd -A -f s 'BEGIN.*END' '' notes.md                 # `.` matches newlines (dotall) + cross-line
```

Without `-A`, sd is line-by-line and patterns can't cross `\n`. `-f m` toggles per-line `^`/`$`; `-f s` makes `.` match newlines.
