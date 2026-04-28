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
