## Patterns

### Pattern A — pin a runtime for a repo

```bash
cd path/to/repo
mise use node@22 python@3.12
mise install            # ensure both are downloaded
git add .mise.toml
```

`mise use TOOL@VER` writes/updates `.mise.toml` in the current directory and installs the version if missing. Re-running is idempotent.

### Pattern B — `.mise.toml` shape

```toml
# .mise.toml
[tools]
node = "22"
python = "3.12"
go = "1.23"
terraform = "1.9.8"

[env]
PROJECT_ROOT = "{{ config_root }}"
DATABASE_URL = "postgres://localhost/dev"

[tasks.test]
run = "npm test"
```

`[tools]` is the version manifest. `[env]` exports vars when the project is active (overlap with direnv — pick one). `[tasks.<name>]` defines runnable tasks (overlap with `just`).

### Pattern C — `.tool-versions` (asdf-compatible) shape

```text
# .tool-versions
node 22.7.0
python 3.12.4
go 1.23.0
```

mise reads this format too. Use `.tool-versions` if the team has asdf users; use `.mise.toml` if the project is mise-only and wants `[env]`/`[tasks]`.

### Pattern D — activation in shells vs CI / agents

```bash
# Interactive shell rc (~/.bashrc, ~/.zshrc):
eval "$(mise activate bash)"           # or: mise activate zsh / fish

# Non-interactive (CI, agent shells, build scripts):
eval "$(mise activate bash --shims)"   # adds ~/.local/share/mise/shims to PATH
# or invoke explicitly:
mise exec -- node app.js
mise exec node@22 -- node app.js
```

`mise activate` hooks `chpwd`/precmd; in a non-interactive shell those hooks never fire and `node`/`python` resolve to whatever's on PATH. Shims work everywhere because they're plain executables on PATH that delegate to the resolved version.

### Pattern E — plugins (asdf-compatible)

```bash
mise plugin ls                          # installed plugins
mise plugin install nodejs              # most languages already have core plugins
mise plugin install kotlin https://github.com/asdf-community/asdf-kotlin.git
mise registry                           # browse known plugins
```

Most mainstream languages have **core** plugins built into mise (no install needed). Use `mise plugin install` only for niche tools — and verify the source URL, since the plugin runs upstream shell code.

### Pattern F — tasks and env (when not using just / direnv)

```bash
mise tasks ls                           # list tasks defined in .mise.toml
mise run test                           # run [tasks.test]
mise run -- test --watch                # forward args
mise env                                # print env vars [env] would set
```

Overlap with `just` (tasks) and `direnv` (env). Pick one tool per concern per repo.

### Pattern G — security gate on directory entry

```bash
mise trust                              # trust .mise.toml in cwd
mise trust --untrust                    # revoke
```

`.mise.toml` `[env]` blocks can run shell expressions. mise refuses to load an untrusted file the first time it sees one — like `direnv allow`. Trust the file only after reading it.
