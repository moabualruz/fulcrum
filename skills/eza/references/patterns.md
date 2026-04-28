## Patterns

### Pattern A — long listing with git status, hide ignored

```bash
eza -l --git --git-ignore
```

`--git` adds a per-entry status column; `--git-ignore` skips files matched by `.gitignore`. Combine for a clean repo overview.

### Pattern B — depth-limited tree

```bash
eza --tree --level=2 --git-ignore
```

Always pass `--level` so the tree doesn't recurse into `node_modules` / `target`.

### Pattern C — newest first with ISO timestamps

```bash
eza -l --sort=modified --reverse --time-style=iso --header
```

### Pattern D — pipe-safe output

```bash
eza -l --color=never --no-quotes | awk '{print $NF}'
```

Without `--color=never`, ANSI escapes leak into downstream parsers; `--no-quotes` drops the quoting around filenames so paths are copy-pasteable.
