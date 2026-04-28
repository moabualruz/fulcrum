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
