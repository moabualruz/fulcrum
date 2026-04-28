## When to use

- The user wants env vars (e.g. `DATABASE_URL`, `AWS_PROFILE`, `API_TOKEN`) to load only inside one repo and unload on `cd ..`.
- The user wants to prepend a project-local `bin/` or `node_modules/.bin` to `PATH` automatically.
- The user mentions `.envrc`, "auto-load .env", "scoped env per directory", or "envrc allow".
- The user wants `dotenv` behavior (`.env` file) but extended with shell expressions, conditionals, or PATH composition.
- The agent itself is about to `cd` into a project that has a `.envrc` and needs the project env to apply (use `direnv exec` — hooks don't fire in agent shells).

**Skip** for: setting **tool versions** per project (use `mise` or `asdf`); permanent global env (`~/.zshrc` / `~/.profile`); runtime secret fetching from a vault inside an app (use the vault SDK); `docker compose` per-service env (`env_file:` / `environment:`); shell aliases or functions (use rc files).
