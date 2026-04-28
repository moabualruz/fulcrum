## Anti-patterns

- **Don't** put secrets in a committed `.envrc`. Use `.envrc.local` (gitignored) with `source_env_if_exists`, or fetch from a vault (`export DB_PASS=$(op read 'op://vault/db/password')`). The hash check protects you against tampering, not exposure.
- **Don't** run `direnv allow` without reading the `.envrc` first — it's an allowlist for *arbitrary shell code*. Treat a fresh `.envrc` from a clone or a PR like any untrusted script: read it, then allow it.
- **Don't** use direnv to pin tool versions (`export PATH=/opt/node-18/bin:$PATH`). That's `mise` / `asdf` / `nix` territory — they handle install, version drift, and platform binaries. direnv composes well with them (`use mise` / `use asdf`); don't reinvent them.
- **Don't** forget the shell hook. Without `eval "$(direnv hook <shell>)"` in your shell rc, `cd` does nothing and you'll think `.envrc` is broken. Verify with `direnv status` — it reports "Found RC path" but "Loaded RC path" empty if the hook is missing.
- **Don't** assume `cd` triggers direnv inside a script or agent shell. The hook fires on prompt redraw, not on subshell `cd`. Use `direnv exec . <cmd>` to apply env explicitly.
- **Don't** edit `.envrc` and expect the shell to pick it up automatically. The hash changes — direnv unloads and prints "direnv: error .envrc is blocked. Run `direnv allow` to approve its content". Run `direnv allow` (or `direnv reload`).
- **Don't** ship a `.envrc` that calls `dotenv` without committing the `.env` *template*. Provide `.env.example` and gitignore the real `.env`.
