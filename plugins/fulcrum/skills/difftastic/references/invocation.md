## Invocation

The binary is **`difft`** (not `difftastic`). Agents frequently guess `difftastic` and get "command not found".

```bash
# Two-file structural diff
difft a.rs b.rs

# Force a language when the extension is ambiguous or wrong (use --override GLOB:LANG)
difft --override 'old.txt:TypeScript' --override 'new.txt:TypeScript' old.txt new.txt

# Or scope the override by glob (one form fits many files)
difft --override '*.in:Rust' template.in template.out

# Side-by-side, full unchanged context, no syntax highlight (terminals/logs)
difft --display side-by-side --context 999 --syntax-highlight off a.py b.py

# Show BOTH sides fully even when one side is unchanged in a hunk
difft --display side-by-side-show-both a.py b.py

# Inline (single-column) — useful for narrow terminals or piping
difft --display inline a.py b.py

# Ignore comment-only changes
difft --ignore-comments a.go b.go

# Strip CR for Windows files mixed with Unix
difft --strip-cr win.ts unix.ts

# What languages are supported?
difft --list-languages
```
