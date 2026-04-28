## Anti-patterns

- **Don't `alias ls=eza` in scripts** that depend on POSIX `ls` output — column layout, color codes, and date format differ; `awk`/`cut` parsers break.
- **Don't assume `--git` is fast** in big repos — eza shells out to git per entry; on huge monorepos it's visibly slow. Drop the flag if you only need names.
- **Don't rely on `--icons`** in agent/CI shells without a Nerd Font — icons render as `?` or tofu and break column alignment. Force `--icons=never`.
- **Don't pipe colored output** without `--color=never` — ANSI escapes corrupt grep/awk/cut and HTML log captures.
- **Don't use `--total-size`** on huge trees — it walks every subdirectory; use `du -sh` or `dust` for one-shot totals.
- **Don't reach for `eza --tree`** when you want a name-pattern search — use `fd`. Trees are for orientation, not lookup.
