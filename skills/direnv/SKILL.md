---
name: direnv
description: Use this skill whenever the user wants to load environment variables when entering a directory, auto-set env per project, scope env vars without polluting the global shell, set PATH per project, or load a `.envrc` on cd. Trigger phrases include "load environment variables when entering a directory", "auto-set env per project", "scoped env vars without polluting shell", "set PATH per project", "load .envrc on cd", "set DATABASE_URL only when I'm in this project", "scope an API token to one repo". Covers `.envrc` shape, `direnv allow` security model, layout helpers (`layout python`, `layout node`, `layout go`), `dotenv`, `PATH_add`, `source_up`, and the bash/zsh/fish hook. Skip for setting tool versions per project (use `mise`/`asdf`), permanent global env vars, runtime secret fetching from a vault, docker compose `env_file`, or shell aliases.
---

# direnv

## When to use

- The user wants env vars (e.g. `DATABASE_URL`, `AWS_PROFILE`, `API_TOKEN`) to load only inside one repo and unload on `cd ..`.
- The user wants to prepend a project-local `bin/` or `node_modules/.bin` to `PATH` automatically.
- The user mentions `.envrc`, "auto-load .env", "scoped env per directory", or "envrc allow".
- The user wants `dotenv` behavior (`.env` file) but extended with shell expressions, conditionals, or PATH composition.
- The agent itself is about to `cd` into a project that has a `.envrc` and needs the project env to apply (use `direnv exec` — hooks don't fire in agent shells).

**Skip** for: setting **tool versions** per project (use `mise` or `asdf`); permanent global env (`~/.zshrc` / `~/.profile`); runtime secret fetching from a vault inside an app (use the vault SDK); `docker compose` per-service env (`env_file:` / `environment:`); shell aliases or functions (use rc files).

## Invocation

```bash
# One-time per shell: install the hook (put this in ~/.bashrc / ~/.zshrc / config.fish)
eval "$(direnv hook bash)"
eval "$(direnv hook zsh)"
direnv hook fish | source        # fish

# Per-project lifecycle
echo 'export FOO=bar' > .envrc   # author
direnv allow                     # cryptographically allowlist *this content*
direnv reload                    # re-evaluate after editing
direnv status                    # debug: shows loaded RC, allow state, watched files
direnv deny                      # revoke trust until next `allow`
direnv edit                      # open in $EDITOR and auto-allow on save

# Run a command with the .envrc applied without a hook (CI, scripts, agents)
direnv exec . <command>          # use the .envrc in this dir
direnv exec /path/to/proj make   # or any other dir
```

`direnv allow` records a hash of the current `.envrc` contents. Any edit invalidates the allow and the env unloads until you re-allow — that is the entire security model.

## Patterns

### Pattern A — basic project env

```bash
# .envrc
export DATABASE_URL="postgres://localhost/myapp_dev"
export RAILS_ENV="development"
export AWS_PROFILE="myapp-dev"
```

```bash
direnv allow
cd ..    # vars unload
cd -     # vars load again
```

### Pattern B — load a `.env` file with `dotenv`

```bash
# .envrc
dotenv                  # loads .env from this directory
dotenv .env.local       # specific file
dotenv_if_exists .env.local   # tolerate missing
```

`dotenv` understands KEY=value pairs; it does not run shell. Use it when you already have a `.env` and want direnv to apply it on cd.

### Pattern C — compose `PATH` and other path-like vars

```bash
# .envrc
PATH_add bin                         # prepend ./bin to PATH
PATH_add node_modules/.bin           # node project local binaries
MANPATH_add share/man                # same for MANPATH
path_add PYTHONPATH src              # generic: prepend to any colon-list var
```

`PATH_add` resolves to an absolute path, dedupes, and prepends. Use it instead of `export PATH="./bin:$PATH"` (relative paths break when cwd changes mid-session).

### Pattern D — layout helpers (per-language scratch dirs)

```bash
# .envrc
layout python python3.12     # creates .direnv/python-3.12 venv, activates it
layout node                  # adds node_modules/.bin to PATH
layout go                    # sets GOPATH=$PWD/.direnv/go and adds bin/
layout pyenv 3.12.2          # uses pyenv-managed interpreter
use nix                      # delegates to nix-shell / flake.nix
```

Layouts live under `.direnv/` (gitignore it). `layout python` is the simplest way to get a project-local venv that activates on cd and deactivates on cd-out.

### Pattern E — inherit a parent `.envrc`

```bash
# monorepo/services/api/.envrc
source_up               # load monorepo/.envrc first
export SERVICE_NAME=api
```

`source_up` walks up looking for the next `.envrc` and sources it. Use this so leaf services inherit org-wide vars (region, account ID) without duplicating.

### Pattern F — local overrides without committing

```bash
# .envrc (committed)
export APP_ENV=development
source_env_if_exists .envrc.local

# .envrc.local (gitignored — secrets, personal overrides)
export DATABASE_URL="postgres://me:secret@localhost/myapp_dev"
export STRIPE_SECRET_KEY="sk_test_…"
```

`source_env_if_exists` is a no-op if the file is missing. Add `.envrc.local` and `.direnv/` to `.gitignore`. Each developer runs `direnv allow` once on their checkout.

### Pattern G — agent / CI invocation

```bash
direnv exec . bun test            # apply .envrc, then run command
direnv exec /repo/api ./deploy.sh
```

In non-interactive shells (CI runners, agent subshells, scripts), the prompt hook never fires. `direnv exec` is the explicit form: it reads `.envrc`, exports its env, and execs the command. `direnv allow` must already have been run on the file.

## Anti-patterns

- **Don't** put secrets in a committed `.envrc`. Use `.envrc.local` (gitignored) with `source_env_if_exists`, or fetch from a vault (`export DB_PASS=$(op read 'op://vault/db/password')`). The hash check protects you against tampering, not exposure.
- **Don't** run `direnv allow` without reading the `.envrc` first — it's an allowlist for *arbitrary shell code*. Treat a fresh `.envrc` from a clone or a PR like any untrusted script: read it, then allow it.
- **Don't** use direnv to pin tool versions (`export PATH=/opt/node-18/bin:$PATH`). That's `mise` / `asdf` / `nix` territory — they handle install, version drift, and platform binaries. direnv composes well with them (`use mise` / `use asdf`); don't reinvent them.
- **Don't** forget the shell hook. Without `eval "$(direnv hook <shell>)"` in your shell rc, `cd` does nothing and you'll think `.envrc` is broken. Verify with `direnv status` — it reports "Found RC path" but "Loaded RC path" empty if the hook is missing.
- **Don't** assume `cd` triggers direnv inside a script or agent shell. The hook fires on prompt redraw, not on subshell `cd`. Use `direnv exec . <cmd>` to apply env explicitly.
- **Don't** edit `.envrc` and expect the shell to pick it up automatically. The hash changes — direnv unloads and prints "direnv: error .envrc is blocked. Run `direnv allow` to approve its content". Run `direnv allow` (or `direnv reload`).
- **Don't** ship a `.envrc` that calls `dotenv` without committing the `.env` *template*. Provide `.env.example` and gitignore the real `.env`.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — env scoping, secrets-in-repo policy.
- Pairs with `mise` (tool versions) — they coexist; `mise` can call `use direnv` and direnv can call `use mise`. Loads tools via mise, env via direnv.
- Stdlib reference (every helper, including the ones above): <https://direnv.net/man/direnv-stdlib.1.html>
- Upstream: <https://direnv.net/>
