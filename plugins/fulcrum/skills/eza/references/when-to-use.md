## When to use

- Directory contents with richer columns than `ls`: per-file git status, gitignore-aware listing, owner/perms/time, icons, or a depth-limited tree.
- Phrases like "list files showing git status", "tree two levels deep", "ls but skip gitignored files", "human-readable sizes", "list with icons".

**Skip** for: finding files by name (`fd`), searching file contents (`rg`), dependency trees (`npm ls`), archive contents (`unzip -l`, `tar -tf`), disk usage (`du`, `dust`).

> Note: `eza` is the maintained fork of the unmaintained `exa` — update old docs/aliases.
