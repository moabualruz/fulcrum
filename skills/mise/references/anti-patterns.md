## Anti-patterns

- **Don't** mix `.tool-versions` and `.mise.toml` for the same tool — when both declare `node`, mise resolves a single source but the team will get confused. Pick one source of truth per repo.
- **Don't** assume `mise activate` works in non-interactive shells / CI. Hooks don't fire. Use `mise activate --shims` in the rc, or invoke via `mise exec` / use shim PATH directly.
- **Don't** install plugins blindly. `mise plugin install <git-url>` runs upstream shell code on every operation. Verify the source — most tools already have a core plugin (`mise plugin ls --core`).
- **Don't** use mise for system services (postgres, redis, nginx) — that's homebrew/apt/yum territory. mise is for *toolchains the project compiles/runs against*, not long-lived daemons.
- **Don't** forget to `mise install` after pulling a repo. Versions don't auto-install on shell entry; the first `node`/`python` invocation will use whatever was already installed (or fail).
- **Don't** use `mise use --pin` and then commit `~`/`^` ranges. Pinning means pinning. If you want a range, don't pass `--pin`; if you committed a range, don't tell the team it's pinned.
- **Don't** stack mise on top of another version manager (nvm, pyenv, rbenv, asdf) on the same shell PATH. They fight over shims and `which node` becomes a guessing game. Pick one; migrate `.tool-versions` directly into mise.
