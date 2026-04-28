## Anti-patterns

- **Don't run bare `fzf` in an agent shell.** Without `-f`, fzf opens a TUI and blocks waiting for a TTY that the agent doesn't have. The shell call hangs until killed. Always pass `--filter`/`-f` (or pipe input + use `-f`).
- **Don't use fzf for exact substring filtering.** `rg -F 'pattern'` or `grep -F` is faster, clearer, and exits with a meaningful status. fzf's fuzzy scoring will surface false positives.
- **Don't use fzf to search file contents.** fzf ranks lines, not files-with-matches. Use `rg pattern` (or `rg -l pattern` for filenames only).
- **Don't forget `--no-sort`** when input order is already meaningful (`git log`, version-sorted tags, time-ordered logs). Default fzf re-sorts by fuzzy score and you'll lose the chronology.
- **Don't pass `--height`, `--preview`, `--bind`, `--header`** in batch mode — they're inert with `-f` and add noise. They only matter in the interactive UI, which agents shouldn't invoke.
- **Don't shell-interpolate the query unsafely.** `fzf -f "$Q"` is fine for one token, but quoted multi-word queries with shell metacharacters can surprise. Quote at the shell level — `--literal` is about diacritic-folding, not shell escaping.
- **Don't rely on exit code 0 to mean "match found".** `-f` exits 1 when nothing matched and 130 on interrupt. Check both stdout and `$?`.
