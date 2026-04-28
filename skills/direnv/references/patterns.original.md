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
