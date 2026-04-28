## Anti-patterns

- **Don't pass markdown bodies through `-b "$VAR"`.** Backticks, quotes, and `$` in the body get eaten by the shell. Use `--body-file path.md` or `--body-file -` and read from stdin.
- **Don't `grep` `gh ... --json` output.** The order of keys is not stable and values may contain newlines. Use `--jq` (built-in) or pipe to `jq`.
- **Don't poll a workflow with `while sleep 10; do gh run list ...`.** Use `gh run watch <id>` — it streams progress and exits with the run's conclusion code.
- **Don't paginate by hand** with `--page 2`, `--page 3`, … `--paginate` walks the `Link: rel="next"` headers and concatenates results into one stream.
- **Don't put tokens on argv.** `gh auth login --with-token < token.txt` keeps the secret out of `ps`, shell history, and command logs. Never `gh auth login --with-token "$TOKEN"`.
- **Don't reach for `gh api repos/o/r/pulls/123`** when `gh pr view 123` exists. Subcommands carry sensible field selection, terminal formatting, and errors; raw `gh api` is for endpoints with no dedicated wrapper.
- **Don't shell out to `curl https://api.github.com/...`** in a script that already has `gh` available — you'll re-implement auth, paging, retries, and rate-limit handling badly. `gh api` does all four.
- **Don't assume the default branch is `main`.** `gh pr create --base $(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)` or omit `--base` and let `gh` infer.
