## When to use

- Agent has a list of candidates (branches, files, PR titles, k8s pods, log entries) and needs the top fuzzy matches for a query string. Reach for `fzf --filter <query>`.
- A previous step produced JSON; after `jq -r` flattens it to TSV, fzf ranks the rows by a chosen column.
- The user says "find the closest matching X to Y" or "rank these by similarity to Y" — that's fuzzy ranking, not exact match.
- An interactive workflow needs to be ported to a script: replace `fzf` with `fzf -f <query> | head -n 1` to make it deterministic.

**Skip** for: exact substring filtering (`rg -F` / `grep -F` is faster and clearer); regex matching (`rg`); finding files by name glob (`fd`); content search across files (`rg` returns files-with-matches, fzf does not); interactive pickers in an agent shell — fzf without `-f` opens a TUI and will block on the missing TTY.
