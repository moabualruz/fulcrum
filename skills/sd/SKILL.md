---
name: sd
description: Use this skill whenever the user wants find-and-replace in files or stdin without sed escaping — string-literal or regex substitution, single file or batch via fd/xargs, in-place edits with a preview pass, or a quick rename of a symbol across many files. Trigger phrases include "find and replace in files without sed escaping", "replace strings in files with simpler syntax than sed", "regex find-replace with PCRE syntax", "in-place replace across files", "rename a symbol across many files", "swap one string for another in this config". Skip this skill for non-replacement edits (deleting line N, conditional sed scripts), pattern search without replacement (use rg), file discovery (use fd), or AST-aware refactors that must respect language syntax (use ast-grep).
---

# sd

## When to use

- User want substitute string/regex in files, reach for `sed -i 's/.../.../g'`.
- Agent need rename symbol across tree (`fd -t f -e ts -x sd 'old' 'new'`).
- Replacement has capture groups, slashes, chars make sed quoting painful.
- User want preview before mutate files.

**Skip** for: delete/insert whole lines or address-scoped edits (use `sed`/`awk`); search without replace (`rg`); find files (`fd`); refactor need syntax — function rename, type change (`ast-grep`).

## Invocation

```bash
echo 'abc' | sd 'a' 'X'                     # stdin → stdout: Xbc
sd 'old' 'new' file.txt                     # FILE: in-place by default
sd -p 'old' 'new' file.txt                  # preview without writing
sd -F '((([])))' '' file.txt                # literal pattern (no regex)
sd -f i 'todo' 'TODO' file.txt              # flags: i case-insens, m multi-line ^/$, s dotall, w word-boundary
sd -A '\n\n+' '\n' file.md                  # across line boundaries (whole-file, more memory)
sd -n 1 'foo' 'bar' file.txt                # max replacements per file
echo '123.45' | sd '(\d+)\.(\d+)' '$1d $2c' # captures: $1, $2 (NOT \1)
```

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

Without `-A`, sd line-by-line, pattern no cross `\n`. `-f m` toggle per-line `^`/`$`; `-f s` make `.` match newlines.

## Anti-patterns

- **Don't translate sed `\1` to `\1` in sd** — sd Rust `regex` engine use `$1` for backrefs; `\1` match literal.
- **Don't reach for `sd -i`** — flag not exist. sd write in-place by default.
- **Don't double-quote pattern.** `"$1"` let shell eat backreference. Single-quote.
- **Don't use sd for non-replacement edits** (delete line N, append, conditional ops) — sed/awk.
- **Don't run sd across repo without `-p` first.** Preview on sample, then batch with fd.
- **Don't reach for sd when ast-grep safer.** Code refactor need syntax: `ast-grep` > `sd` > `sed`. sd text-level — rewrite inside strings and comments too.
- **Don't assume `-l` mean literal.** Flag is `-F` / `--fixed-strings` (alias `-s` / `--string-mode`).

## Cross-refs

- Pairs with: `fd` (file selection for batch), `rg` (search without replace), `ast-grep` (syntax-aware refactor — prefer for identifier renames).
- Upstream: <https://github.com/chmln/sd>
- Rust regex syntax: <https://docs.rs/regex/latest/regex/#syntax>