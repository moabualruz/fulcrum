---
name: eza
description: Use this skill when listing directory contents with more information than POSIX `ls` provides — long-format metadata, per-file git status, gitignore-aware listings, depth-limited tree views, human-readable sizes, sort/group controls, and Nerd-Font icons. Trigger phrases include "list files with git status", "tree view of a directory", "ls replacement that respects gitignore", "show file metadata with colors", "list files with icons", "list directory ignoring gitignored files", "show file sizes human-readable in this folder". `eza` is the maintained fork of the unmaintained `exa`. Skip this skill for finding files by name (use `fd`), searching file contents (use `rg`), npm dependency trees (use `npm ls`), zip listings (use `unzip -l`), or disk-usage summaries (use `du` / `dust`).
---

# eza

## When to use

- Directory contents with richer columns than `ls`: per-file git status, gitignore-aware listing, owner/perms/time, icons, or depth-limited tree.
- Phrases like "list files showing git status", "tree two levels deep", "ls but skip gitignored files", "human-readable sizes", "list with icons".

**Skip** for: find files by name (`fd`), search file contents (`rg`), dependency trees (`npm ls`), archive contents (`unzip -l`, `tar -tf`), disk usage (`du`, `dust`).

> Note: `eza` = maintained fork of unmaintained `exa` — update old docs/aliases.

## Invocation

```bash
eza                                  # basic, replaces `ls`
eza -lah                             # long, all (incl. dotfiles), -h is `--header` (column headers; eza prints human sizes by default with -l)
eza -l --git                         # long format + per-file git status column
eza -l --git-ignore                  # respect .gitignore (hide ignored)
eza --tree --level=2                 # depth-limited tree
eza -l --header --time-style=iso     # column headers + ISO timestamps (also: relative|long)
eza -l --no-quotes                   # drop quotes around names (copy-friendly paths)
eza -l --icons=auto                  # icons: auto|always|never (needs Nerd Font)
eza -l --sort=modified --reverse     # sort: name|Name|extension|Extension|size|modified|changed|accessed|created|inode|type|none
eza -l --group-directories-first     # dirs above files
eza -l --total-size                  # recursive dir size totals (slow on huge trees)
eza -l --color=never                 # plain output for pipes/parsers
```

## Patterns

### Pattern A — long listing with git status, hide ignored

```bash
eza -l --git --git-ignore
```

`--git` add per-entry status column; `--git-ignore` skip `.gitignore` matches. Combine for clean repo overview.

### Pattern B — depth-limited tree

```bash
eza --tree --level=2 --git-ignore
```

Always pass `--level` so tree no recurse into `node_modules` / `target`.

### Pattern C — newest first with ISO timestamps

```bash
eza -l --sort=modified --reverse --time-style=iso --header
```

### Pattern D — pipe-safe output

```bash
eza -l --color=never --no-quotes | awk '{print $NF}'
```

Without `--color=never`, ANSI escapes leak into downstream parsers; `--no-quotes` drop quoting around filenames so paths copy-pasteable.

## Anti-patterns

- **Don't `alias ls=eza` in scripts** depending on POSIX `ls` output — column layout, color codes, date format differ; `awk`/`cut` parsers break.
- **Don't assume `--git` fast** in big repos — eza shells out to git per entry; huge monorepos visibly slow. Drop flag if only names needed.
- **Don't rely on `--icons`** in agent/CI shells without Nerd Font — icons render as `?` or tofu, break column alignment. Force `--icons=never`.
- **Don't pipe colored output** without `--color=never` — ANSI escapes corrupt grep/awk/cut and HTML log captures.
- **Don't use `--total-size`** on huge trees — walks every subdirectory; use `du -sh` or `dust` for one-shot totals.
- **Don't reach for `eza --tree`** for name-pattern search — use `fd`. Trees for orientation, not lookup.

## Cross-refs

- Companion tools: `fd` (name search), `rg` (content search), `bat` (file preview), `dust`/`du` (disk usage).
- Upstream: <https://github.com/eza-community/eza>
- Manual: `man eza`