---
name: just
description: Use this skill whenever the user wants to run a project task, list available recipes, or interact with a `justfile` / `Justfile` / `.justfile` — the modern Makefile alternative. Trigger phrases include "run a project task", "list available recipes", "what commands does this repo expose", "run the build/test/lint recipe", "show me what tasks are defined", "modern Makefile alternative", "run the deploy recipe with these arguments", "this repo uses just". Discover recipes with `just --list` before guessing names; preview destructive recipes with `just --show RECIPE` before running. Skip this skill for plain Makefiles (use `make`), npm/yarn/pnpm scripts (use the package manager), shell scripts, language-native task runners (cargo, gradle, mix), or ad-hoc one-off shell commands.
---

# just

## When to use

- The repo has a `justfile`, `Justfile`, or `.justfile` and the user (or you) wants to run, list, or inspect a recipe.
- The user asks "what tasks does this project expose?" or "how do I build/test/lint this repo?" — `just --list` is the answer.
- The user asks for a Makefile-style runner but the repo uses just (recipe args go after the recipe, not as `VAR=value`).
- The agent is about to run a script that already exists as a recipe — prefer the recipe so dependencies and shell config apply.

**Skip** for: plain `Makefile` (use `make`), `package.json` scripts (use `npm run` / `pnpm run` / `bun run`), `Taskfile.yml` (use `task`), language task runners (`cargo`, `gradle`, `mix`, `dotnet run`), or one-off shell commands that aren't in the justfile.

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

just walks up from the current directory looking for `justfile` / `.justfile` / `Justfile` (case-insensitive on case-insensitive filesystems), so you can invoke from any subdirectory.

## Patterns

### Pattern A — discover before running

```bash
just --list                          # see every public recipe + its doc comment
just --show deploy                   # read the body of `deploy` first
just deploy production               # then run with the right args
```

The doc comment above each recipe (`# deploy to <env>`) shows up in `--list`. If a recipe is private (name starts with `_`), it won't appear; pass `--list` `--unsorted` for source order.

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

Recipe args go **after** the recipe name, positionally. They are not Make-style `VAR=value` overrides — for those, use `--set name=value` against a recipe variable.

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

`just default` → `format` → `lint` → `test`. Deps run once per invocation, in declaration order, before the recipe body.

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

.env is NOT read by default. To enable, add `set dotenv-load := true` (or just `set dotenv-load`) at the top of the justfile. To override the location, use `set dotenv-filename := "..."` or `set dotenv-path := "..."`. Pass `--no-dotenv` to disable for one invocation.

### Pattern E — choose a different shell

```just
set shell := ["bash", "-cu"]         # bash with -u (treat unset as error)
# default is ["sh", "-cu"] — POSIX sh, NOT bash
```

If a recipe uses bashisms (`[[`, arrays, `<()`) without `set shell := ["bash", ...]`, it will fail under sh on a stock Debian/Alpine container.

### Pattern F — combine in scripts and CI

```bash
just lint && just test && just build
just --justfile $REPO/justfile ci    # absolute path, no chdir surprises
```

Each `just` invocation exits with the recipe's exit code; chain with `&&` for fail-fast pipelines. In CI, prefer `--justfile` with an absolute path so the working directory is unambiguous.

### Pattern G — sub-justfiles

```bash
just -d services/api deploy          # run the api/justfile's deploy recipe
just --justfile services/api/justfile deploy
```

Both work; `-d` cd's first (recipes resolve paths relative to that dir), `--justfile` does not chdir (recipes resolve relative to the justfile's location anyway, but stdout/stderr cwd is yours).

## Anti-patterns

- **Don't guess recipe names.** Run `just --list` (or `just -l`) first. Recipes are repo-specific and frequently renamed.
- **Don't run `just <recipe>` blind on something that might deploy, migrate, or push.** Preview with `just --show <recipe>` and read the body first.
- **Don't assume bash.** The default shell is POSIX `sh`. Check for `set shell := [...]` at the top of the justfile before relying on bash features.
- **Don't override `--working-directory`** unless you understand it. Recipes typically assume the justfile's directory; overriding breaks any relative path inside.
- **Don't confuse with `make`.** `make test FOO=foo` becomes `just test foo` (positional). For variable overrides use `just --set FOO=foo test`, not `FOO=foo just test` (the env var won't bind to a recipe variable unless `set export` or the recipe reads `env_var("FOO")`).
- **Don't ignore exit codes.** A failed recipe exits non-zero; chain with `&&` rather than `;` if subsequent steps depend on success.
- **Don't edit a recipe to "test" something.** Use `just --set name=value` or pass arguments — keep the justfile clean for everyone else.

## Cross-refs

- `pm-policy` hook (in `docs/hooks.md`) routes recipe-driven repos through `just` instead of running the underlying script directly — the hook checks for a justfile and prefers `just <recipe>` when one exists.
- Upstream: <https://just.systems/>
- Manual: <https://just.systems/man/en/>
- Cheatsheet (`just --list` and `just --show` are the two commands you'll use 90% of the time).
