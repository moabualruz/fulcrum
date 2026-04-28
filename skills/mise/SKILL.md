---
name: mise
description: Use this skill whenever the user wants to install, pin, or switch language/runtime versions per repository — node, python, go, ruby, java, rust, deno, bun, terraform, etc. — or read/write `.mise.toml` or `.tool-versions`. Trigger phrases include "install a specific node/python/go version per project", "manage tool versions", "asdf replacement", "pin a runtime version for a repo", "switch python versions per directory", "what version of node does this repo need", "this repo has a `.mise.toml`", "this repo has a `.tool-versions`". mise is the Rust-based, asdf-compatible polyglot toolchain manager. Skip this skill for system packages (homebrew/apt), docker images, project env vars only (use direnv), and language-internal virtualenvs (`pip`, `poetry`, `uv venv`).
---

# mise

## When to use

- Repo has `.mise.toml`, `mise.toml`, or `.tool-versions` and user (or you) need install/run with right toolchain.
- User asks "what version of node/python/go does this repo need?" — `mise current` answer.
- User want pin runtime per project, switch versions on `cd`, or replace asdf with faster.
- Agent about to invoke `node`, `python`, `go`, etc. in non-interactive shell where `mise activate` not run — use `mise exec` or `mise activate --shims`.

**Skip** for: system packages (`brew`, `apt`, `yum`, `pacman`); container/image (`docker`, `podman`); per-project *env vars only* without tools (`direnv`); language-internal virtualenvs (`python -m venv`, `poetry`, `uv venv`); dep vuln scans (`osv-scanner`, `npm audit`).

## Invocation

```bash
# Install everything declared in .mise.toml / .tool-versions (idempotent)
mise install

# Set a per-project (local) version — writes/updates .mise.toml in cwd
mise use python@3.12
mise use node@22 go@1.23

# Set a global version — writes ~/.config/mise/config.toml
mise use -g node@22

# What is active right now (resolved per-tool)?
mise current
mise current python

# What is installed (across all tools, all versions)?
mise ls
mise ls python

# Drift report against latest releases
mise outdated
mise upgrade            # bumps installed versions per the spec

# Run a one-shot in a tool version without activating
mise exec node@22 -- node app.js
mise exec -- pytest     # uses the resolved version from .mise.toml

# Print the env mise would set (PATH, [env] vars)
mise env
mise env -s bash        # eval-able

# Set tool versions for the current shell session (alias: `mise sh`).
# Prints export statements; must be eval'd. Does NOT spawn a subshell.
eval "$(mise shell node@22 python@3.12)"

# To actually launch a subshell with the tools active, use `mise exec`:
mise exec node@22 -- bash
```

## Patterns

### Pattern A — pin a runtime for a repo

```bash
cd path/to/repo
mise use node@22 python@3.12
mise install            # ensure both are downloaded
git add .mise.toml
```

`mise use TOOL@VER` writes/updates `.mise.toml` in cwd, installs version if missing. Re-run idempotent.

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

`[tools]` = version manifest. `[env]` exports vars when project active (overlaps direnv — pick one). `[tasks.<name>]` defines runnable tasks (overlaps `just`).

### Pattern C — `.tool-versions` (asdf-compatible) shape

```text
# .tool-versions
node 22.7.0
python 3.12.4
go 1.23.0
```

mise reads this format too. Use `.tool-versions` if team has asdf users; use `.mise.toml` if project mise-only and want `[env]`/`[tasks]`.

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

`mise activate` hooks `chpwd`/precmd; in non-interactive shell hooks never fire and `node`/`python` resolve to whatever on PATH. Shims work everywhere — plain executables on PATH that delegate to resolved version.

### Pattern E — plugins (asdf-compatible)

```bash
mise plugin ls                          # installed plugins
mise plugin install nodejs              # most languages already have core plugins
mise plugin install kotlin https://github.com/asdf-community/asdf-kotlin.git
mise registry                           # browse known plugins
```

Most mainstream languages have **core** plugins built into mise (no install needed). Use `mise plugin install` only for niche tools — verify source URL, plugin runs upstream shell code.

### Pattern F — tasks and env (when not using just / direnv)

```bash
mise tasks ls                           # list tasks defined in .mise.toml
mise run test                           # run [tasks.test]
mise run -- test --watch                # forward args
mise env                                # print env vars [env] would set
```

Overlaps `just` (tasks) and `direnv` (env). Pick one tool per concern per repo.

### Pattern G — security gate on directory entry

```bash
mise trust                              # trust .mise.toml in cwd
mise trust --untrust                    # revoke
```

`.mise.toml` `[env]` blocks can run shell expressions. mise refuses untrusted file first time it sees one — like `direnv allow`. Trust file only after reading it.

## Anti-patterns

- **Don't** mix `.tool-versions` and `.mise.toml` for same tool — when both declare `node`, mise resolves single source but team gets confused. Pick one source of truth per repo.
- **Don't** assume `mise activate` works in non-interactive shells / CI. Hooks don't fire. Use `mise activate --shims` in rc, or invoke via `mise exec` / use shim PATH directly.
- **Don't** install plugins blindly. `mise plugin install <git-url>` runs upstream shell code every operation. Verify source — most tools have core plugin (`mise plugin ls --core`).
- **Don't** use mise for system services (postgres, redis, nginx) — homebrew/apt/yum territory. mise for *toolchains project compiles/runs against*, not long-lived daemons.
- **Don't** forget to `mise install` after pulling repo. Versions don't auto-install on shell entry; first `node`/`python` invocation uses whatever already installed (or fails).
- **Don't** use `mise use --pin` then commit `~`/`^` ranges. Pinning means pinning. Want range, don't pass `--pin`; committed range, don't tell team it's pinned.
- **Don't** stack mise on top of another version manager (nvm, pyenv, rbenv, asdf) on same shell PATH. They fight over shims and `which node` becomes guessing game. Pick one; migrate `.tool-versions` directly into mise.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — toolchain pinning and runtime resolution.
- Complement: `direnv` skill — direnv handles per-project env vars, mise handles per-project tools (with optional `[env]` overlap; pick one).
- Peer: `just` skill — both define tasks; if repo already has justfile, leave tasks there and keep `.mise.toml` to `[tools]`.
- Migration: any `.tool-versions` from asdf read by mise unmodified — drop in mise, run `mise install`, remove asdf from PATH.
- Upstream: <https://mise.jdx.dev/>
- Config reference: <https://mise.jdx.dev/configuration.html>