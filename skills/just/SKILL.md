---
name: just
description: Use this skill whenever the user wants to run a project task, list available recipes, or interact with a `justfile` / `Justfile` / `.justfile` — the modern Makefile alternative. Trigger phrases include "run a project task", "list available recipes", "what commands does this repo expose", "run the build/test/lint recipe", "show me what tasks are defined", "modern Makefile alternative", "run the deploy recipe with these arguments", "this repo uses just". Discover recipes with `just --list` before guessing names; preview destructive recipes with `just --show RECIPE` before running. Skip this skill for plain Makefiles (use `make`), npm/yarn/pnpm scripts (use the package manager), shell scripts, language-native task runners (cargo, gradle, mix), or ad-hoc one-off shell commands.
---

# just

## When to use

- Repo has `justfile`, `Justfile`, or `.justfile` and user (or you) want run, list, or inspect recipe.
- User ask "what tasks does this project expose?" or "how do I build/test/lint this repo?" — `just --list` answer.
- User ask Makefile-style runner but repo use just (recipe args go after recipe, not as `VAR=value`).
- Agent about run script that already exist as recipe — prefer recipe so deps and shell config apply.

**Skip** for: plain `Makefile` (use `make`), `package.json` scripts (use `npm run` / `pnpm run` / `bun run`), `Taskfile.yml` (use `task`), language task runners (`cargo`, `gradle`, `mix`, `dotnet run`), or one-off shell commands not in justfile.

## Invocation

```bash
# Always discover first — never guess a recipe name
just --list                          # full table
just -l                              # short alias
just --summary                       # space-separated one-liner
just --show <recipe>                 # print the recipe body without running
just --evaluate                      # show all variables and their resolved values

# Run a recipe (recipe args come after the recipe name)
just <recipe>
just <recipe> arg1 arg2

# Use a justfile elsewhere (no chdir to its directory)
just --justfile path/to/justfile <recipe>

# Run as if from a different directory (cd-equivalent)
just -d path/to/dir <recipe>

# Override variables and shell
just --set name=value <recipe>
just --shell bash <recipe>

# Custom working directory (rarely needed — recipes assume justfile's dir)
just --working-directory /tmp <recipe>
```

just walk up from current dir looking for `justfile` / `.justfile` / `Justfile` (case-insensitive on case-insensitive FS), so invoke from any subdir.

## Patterns

### Pattern A — discover before running

```bash
just --list                          # see every public recipe + its doc comment
just --show deploy                   # read the body of `deploy` first
just deploy production               # then run with the right args
```

Doc comment above each recipe (`# deploy to <env>`) show up in `--list`. Private recipe (name start `_`) not appear; pass `--list` `--unsorted` for source order.

### Pattern B — recipe parameters

```just
# justfile
build target='debug':
    cargo build --profile {{target}}

test +tests:                          # one-or-more (variadic, required)
    cargo test {{tests}}

logs *args:                           # zero-or-more (variadic, optional)
    journalctl {{args}}
```

```bash
just build                           # uses default 'debug'
just build release                   # passes 'release'
just test integration unit
just logs                            # no args
just logs --since '1h ago'
```

Recipe args go **after** recipe name, positional. Not Make-style `VAR=value` overrides — for those, use `--set name=value` against recipe variable.

### Pattern C — recipe dependencies

```just
default: lint test

lint: format
    cargo clippy

format:
    cargo fmt

test:
    cargo test
```

`just default` → `format` → `lint` → `test`. Deps run once per invocation, declaration order, before recipe body.

### Pattern D — variables, env, dotenv

```just
set dotenv-load                      # load `.env` from justfile's dir (DEFAULT IS FALSE — must be explicitly set)
set dotenv-required                  # error if .env missing
set dotenv-filename := ".env.local"  # alternative filename
set export                           # export every recipe-set variable as an env var

version := `git describe --tags`
build:
    docker build -t app:{{version}} .
```

```bash
just --evaluate                      # dump all variables and resolved values
just --set version=1.2.3 build       # override at the CLI
```

.env NOT read by default. Enable: add `set dotenv-load := true` (or `set dotenv-load`) at top of justfile. Override location: `set dotenv-filename := "..."` or `set dotenv-path := "..."`. Pass `--no-dotenv` disable for one invocation.

### Pattern E — choose a different shell

```just
set shell := ["bash", "-cu"]         # bash with -u (treat unset as error)
# default is ["sh", "-cu"] — POSIX sh, NOT bash
```

Recipe use bashisms (`[[`, arrays, `<()`) without `set shell := ["bash", ...]` → fail under sh on stock Debian/Alpine container.

### Pattern F — combine in scripts and CI

```bash
just lint && just test && just build
just --justfile $REPO/justfile ci    # absolute path, no chdir surprises
```

Each `just` invocation exit with recipe's exit code; chain `&&` for fail-fast pipelines. In CI, prefer `--justfile` with absolute path so working dir unambiguous.

### Pattern G — sub-justfiles

```bash
just -d services/api deploy          # run the api/justfile's deploy recipe
just --justfile services/api/justfile deploy
```

Both work; `-d` cd first (recipes resolve paths relative to that dir), `--justfile` no chdir (recipes resolve relative to justfile's location anyway, but stdout/stderr cwd is yours).

## Anti-patterns

- **Don't guess recipe names.** Run `just --list` (or `just -l`) first. Recipes repo-specific, often renamed.
- **Don't run `just <recipe>` blind on something might deploy, migrate, or push.** Preview with `just --show <recipe>` and read body first.
- **Don't assume bash.** Default shell POSIX `sh`. Check for `set shell := [...]` at top of justfile before relying on bash features.
- **Don't override `--working-directory`** unless understand it. Recipes assume justfile's dir; overriding break any relative path inside.
- **Don't confuse with `make`.** `make test FOO=foo` become `just test foo` (positional). For variable overrides use `just --set FOO=foo test`, not `FOO=foo just test` (env var won't bind to recipe variable unless `set export` or recipe read `env_var("FOO")`).
- **Don't ignore exit codes.** Failed recipe exit non-zero; chain `&&` not `;` if next steps depend on success.
- **Don't edit recipe to "test" something.** Use `just --set name=value` or pass args — keep justfile clean for everyone else.

## Cross-refs

- `pm-policy` hook (in `docs/hooks.md`) routes recipe-driven repos through `just` instead of running underlying script directly — hook checks for justfile and prefers `just <recipe>` when one exists.
- Upstream: <https://just.systems/>
- Manual: <https://just.systems/man/en/>
- Cheatsheet (`just --list` and `just --show` are two commands you'll use 90% of time).