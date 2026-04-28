## Patterns

### Pattern A — print a config file legibly
```bash
bat ~/.config/nvim/init.lua
```
Default style (`numbers,changes,header,grid`) is fine for a human reader at the terminal.

### Pattern B — colorize stdin from a tool that emits JSON/YAML
```bash
kubectl get pod foo -o yaml | bat -l yaml --paging=never
gh pr view 42 --json title,body | bat -l json -pp
```
`bat` cannot sniff the language from a pipe — pass `-l <lang>` (see `--list-languages`).

### Pattern C — syntax-aware diff
```bash
bat -d src/server.ts                     # vs git HEAD
git diff | bat -l diff -pp               # any diff text
```

### Pattern D — extract a slice for a code review reply
```bash
bat --line-range 120:160 --style=numbers,header src/parser.rs
```

### Pattern E — keep colors when piping into `less` or tmux
```bash
bat --color=always huge.log | less -R
```
Without `--color=always`, `bat` strips ANSI when stdout isn't a TTY.
