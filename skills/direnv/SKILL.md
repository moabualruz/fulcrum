---
name: direnv
description: Use this skill whenever the user wants to load environment variables when entering a directory, auto-set env per project, scope env vars without polluting the global shell, set PATH per project, or load a `.envrc` on cd. Trigger phrases include "load environment variables when entering a directory", "auto-set env per project", "scoped env vars without polluting shell", "set PATH per project", "load .envrc on cd", "set DATABASE_URL only when I'm in this project", "scope an API token to one repo". Covers `.envrc` shape, `direnv allow` security model, layout helpers (`layout python`, `layout node`, `layout go`), `dotenv`, `PATH_add`, `source_up`, and the bash/zsh/fish hook. Skip for setting tool versions per project (use `mise`/`asdf`), permanent global env vars, runtime secret fetching from a vault, docker compose `env_file`, or shell aliases.
---

# direnv

## When to use

- User want env vars (e.g. `DATABASE_URL`, `AWS_PROFILE`, `API_TOKEN`) load only inside one repo, unload on `cd ..`.
- User want prepend project-local `bin/` or `node_modules/.bin` to `PATH` auto.
- User mention `.envrc`, "auto-load .env", "scoped env per directory", or "envrc allow".
- User want `dotenv` behavior (`.env` file) extended with shell expressions, conditionals, or PATH composition.
- Agent about to `cd` into project with `.envrc`, need project env apply (use `direnv exec` — hooks no fire in agent shells).

**Skip** for: **tool versions** per project (use `mise` or `asdf`); permanent global env (`~/.zshrc` / `~/.profile`); runtime secret fetch from vault inside app (use vault SDK); `docker compose` per-service env (`env_file:` / `environment:`); shell aliases or functions (use rc files).

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

`direnv allow` record hash of current `.envrc` contents. Any edit invalidate allow, env unload until re-allow — that whole security model.

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

`dotenv` parse KEY=value pairs; no run shell. Use when already have `.env`, want direnv apply on cd.

### Pattern C — compose `PATH` and other path-like vars

```bash
# .envrc
PATH_add bin                         # prepend ./bin to PATH
PATH_add node_modules/.bin           # node project local binaries
MANPATH_add share/man                # same for MANPATH
path_add PYTHONPATH src              # generic: prepend to any colon-list var
```

`PATH_add` resolve to absolute path, dedupe, prepend. Use instead of `export PATH="./bin:$PATH"` (relative path break when cwd change mid-session).

### Pattern D — layout helpers (per-language scratch dirs)

```bash
# .envrc
layout python python3.12     # creates .direnv/python-3.12 venv, activates it
layout node                  # adds node_modules/.bin to PATH
layout go                    # sets GOPATH=$PWD/.direnv/go and adds bin/
layout pyenv 3.12.2          # uses pyenv-managed interpreter
use nix                      # delegates to nix-shell / flake.nix
```

Layouts live under `.direnv/` (gitignore it). `layout python` simplest way get project-local venv, activate on cd, deactivate on cd-out.

### Pattern E — inherit a parent `.envrc`

```bash
# monorepo/services/api/.envrc
source_up               # load monorepo/.envrc first
export SERVICE_NAME=api
```

`source_up` walk up, find next `.envrc`, source it. Use so leaf service inherit org-wide vars (region, account ID), no duplicate.

### Pattern F — local overrides without committing

```bash
# .envrc (committed)
export APP_ENV=development
source_env_if_exists .envrc.local

# .envrc.local (gitignored — secrets, personal overrides)
export DATABASE_URL="postgres://me:secret@localhost/myapp_dev"
export STRIPE_SECRET_KEY="sk_test_…"
```

`source_env_if_exists` no-op if file missing. Add `.envrc.local` and `.direnv/` to `.gitignore`. Each dev run `direnv allow` once on checkout.

### Pattern G — agent / CI invocation

```bash
direnv exec . bun test            # apply .envrc, then run command
direnv exec /repo/api ./deploy.sh
```

Non-interactive shells (CI runners, agent subshells, scripts): prompt hook never fire. `direnv exec` explicit form: read `.envrc`, export env, exec command. `direnv allow` must already run on file.

## Anti-patterns

- **Don't** put secrets in committed `.envrc`. Use `.envrc.local` (gitignored) with `source_env_if_exists`, or fetch from vault (`export DB_PASS=$(op read 'op://vault/db/password')`). Hash check protect against tampering, not exposure.
- **Don't** run `direnv allow` without read `.envrc` first — it allowlist for *arbitrary shell code*. Treat fresh `.envrc` from clone or PR like untrusted script: read, then allow.
- **Don't** use direnv to pin tool versions (`export PATH=/opt/node-18/bin:$PATH`). That `mise` / `asdf` / `nix` territory — they handle install, version drift, platform binaries. direnv compose well with them (`use mise` / `use asdf`); no reinvent.
- **Don't** forget shell hook. Without `eval "$(direnv hook <shell>)"` in shell rc, `cd` do nothing, will think `.envrc` broken. Verify with `direnv status` — report "Found RC path" but "Loaded RC path" empty if hook missing.
- **Don't** assume `cd` trigger direnv inside script or agent shell. Hook fire on prompt redraw, not on subshell `cd`. Use `direnv exec . <cmd>` apply env explicit.
- **Don't** edit `.envrc` and expect shell pick up auto. Hash change — direnv unload, print "direnv: error .envrc is blocked. Run `direnv allow` to approve its content". Run `direnv allow` (or `direnv reload`).
- **Don't** ship `.envrc` that call `dotenv` without commit `.env` *template*. Provide `.env.example`, gitignore real `.env`.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — env scoping, secrets-in-repo policy.
- Pair with `mise` (tool versions) — coexist; `mise` can call `use direnv`, direnv can call `use mise`. Load tools via mise, env via direnv.
- Stdlib reference (every helper, including ones above): <https://direnv.net/man/direnv-stdlib.1.html>
- Upstream: <https://direnv.net/>