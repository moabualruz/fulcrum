## Anti-patterns

- **Don't** call `z` from a script or `bash -c` — it's a shell function defined by `zoxide init`, not on `$PATH`. Use `cd "$(zoxide query foo)"`.
- **Don't** assume `z foo` works on a cold install — the database is empty until you `cd` around (or `zoxide add`).
- **Don't** rely on `zi` in agent / CI / non-TTY shells — it spawns `fzf` and needs a TTY. Use `zoxide query foo --list` and pick programmatically.
- **Don't** run zoxide and autojump with default names side-by-side — both bind prompt hooks and the `j` command. Pick one, or rebind with `--cmd`.
- **Don't** edit `~/.local/share/zoxide/db.zo` by hand — binary format. Use `zoxide add` / `zoxide remove`.
