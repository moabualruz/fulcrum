## Anti-patterns

- **Don't** pipe `bat` into `grep`/`jq`/`awk` without `--paging=never --color=never` (or `bat -p`) — the pager hijacks the TTY and ANSI escapes corrupt downstream parsing.
- **Don't** rely on autodetect for stdin — `bat` can't sniff a pipe. Pass `-l json|yaml|diff|...`.
- **Don't** alias `cat=bat` system-wide — first-run latency and missing themes break unconfigured shells and CI scripts that pipe `cat`.
- **Don't** assume the binary is `bat` on Debian/Ubuntu — it ships as `batcat`. Check with `command -v bat || command -v batcat` before scripting.
- **Don't** reach for `bat` to read a 200 MB log — pager startup and highlighter cost dominate. Use `less` / `tail` / `rg` instead.
