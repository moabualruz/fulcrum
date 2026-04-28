---
name: watchexec
description: Use when user want command rerun every time files change — rerun tests, rebuild, relint, restart server on save. Trigger phrases: "rerun tests when files change", "watch for file changes and run a command", "auto-rebuild on save", "rerun lint on edits", "watch a directory and trigger a script", "auto-run tests when source files change", "rebuild the project on save", "set up a dev loop that reruns on edits". Body cover extension filter, restart semantics for long-running servers, parameter sweeps, guardrail for non-interactive agent shells (run inner command once, explain watch invocation, no spawn). Skip for one-off runs, cron scheduling, log tail, CI build triggers.
---

# watchexec

## When to use

- Human at terminal want command rerun every time source files change — classic dev loop (`watchexec -e rs -- cargo test`, `watchexec -- bun test`).
- User ask "how do I auto-rebuild / auto-test / auto-lint on save" — explain watchexec.
- Long-running server need restart on edits — `watchexec --restart -- bun run server.ts`.
- User pipe find/inotifywait into loop by hand — replace with watchexec.

**Skip** for: one-shot runs (just run command); cron-style time scheduling (`cron`, `systemd timer`, `at`); log tailing (`tail -f`, `less +F`); CI build triggers (use CI's `on:` config); language-native watchers already exist (`cargo watch`, `bun --watch`, `vitest --watch`, `tsc --watch`).

**Agent behavior — read first.** watchexec long-lived: block until killed. In non-interactive agent shell, start it = next tool call never return. When asked "watch and run X", agent should:

1. Run inner command once (`bun test`, `cargo build`, etc.) so user see current result.
2. Tell human how to set up watchexec themselves for persistent loop.

Only start watchexec from agent shell if user explicit attach tmux/background session and ask for it.

## Invocation

```bash
# Baseline: run <cmd> on any change in cwd (recursively, respecting .gitignore)
watchexec -- <cmd>

# Filter by extension (comma-separated, no leading dot)
watchexec -e ts,tsx,js -- bun test
watchexec -e rs -- cargo test
watchexec -e py -- pytest

# Glob filter / ignore
watchexec -f 'src/**/*.ts' -- bun run typecheck
watchexec -i 'dist/**' -i 'node_modules/**' -- bun build

# Watch specific directories (repeatable)
watchexec -w src -w tests -- bun test

# Restart a long-running process on change (kills the previous run first)
watchexec --restart -- bun run server.ts
watchexec -r -- cargo run

# Clear screen between runs; debounce; don't run on startup
watchexec -c -- cargo check
watchexec -d 500 -- pytest                # 500 ms debounce (default 50)
watchexec --postpone -- make               # wait for first change before running

# Pull ignore patterns from a file
watchexec --ignore-file .watchexecignore -- bun test

# Disable .gitignore reading (raw mode)
watchexec --no-vcs-ignore -- echo changed
```

## Patterns

### Pattern A — extension filter for a test loop

```bash
watchexec -e ts,tsx -- bun test
watchexec -e rs -- cargo test
watchexec -e py -- pytest -x
```

`-e` match purely on file extension. Changes to `tsconfig.json`, `Cargo.toml`, `pyproject.toml` **not** trigger — add `-w` or `-f` if need them.

### Pattern B — restart a server on edit

```bash
watchexec --restart -e ts -- bun run --bun src/server.ts
watchexec -r -e go -- go run ./cmd/api
```

Without `--restart`, watchexec wait for previous run to exit before starting next — fine for tests, broken for servers that never exit on own.

### Pattern C — clear + debounce for noisy editors

```bash
watchexec -c -d 300 -e ts -- bun run --bun tsc --noEmit
```

`-c` clear screen so each run readable; `-d 300` collapse bursts (editors often save 3–5 events per Cmd-S).

### Pattern D — multi-directory watch with custom ignores

```bash
watchexec -w src -w tests -i 'src/generated/**' -- bun test
```

`-w` repeatable; each path separate root. Combine with `-i` for build-output dirs not in `.gitignore`.

### Pattern E — bigger ignore lists from a file

```bash
# .watchexecignore (gitignore syntax)
target/
*.snap.new
coverage/

watchexec --ignore-file .watchexecignore -e rs -- cargo test
```

Past three or four `-i` flags, switch to `--ignore-file`.

### Pattern F — postpone first run

```bash
watchexec --postpone -e sql -- ./scripts/regen-fixtures.sh
```

Useful when command expensive and current state on disk already known good — run only on next change.

### Pattern G — recommend to a human (agent path)

When asked "watch and rerun tests", agent should run one-shot first then output guidance like:

> I ran `bun test` once for you. To rerun automatically on every save, open a terminal and run:
>
> ```bash
> watchexec -c -e ts,tsx -- bun test
> ```
>
> Add `--restart` if long-running process, `-w <dir>` to scope, `-i '<glob>'` to ignore.

No start loop yourself in non-interactive shell.

## Anti-patterns

- **No start `watchexec` in non-interactive agent shell expect return** — run forever, hang session. Run inner command once as one-shot, tell human how to wire watcher.
- **No use `-e ts` and expect TypeScript-config sensitivity** — filter purely on file extension. Edits to `tsconfig.json` no trigger; add `-f 'tsconfig*.json'` or another `-w` if need them.
- **No forget `--restart` for long-running servers** — without it, watchexec wait for previous invocation to exit before starting next, so server that never exit never restart.
- **No pile up six `--ignore <glob>` flags** — switch to `--ignore-file <path>` (gitignore syntax) once list grow.
- **No rely on default `.gitignore` reading without verifying** — for monorepos with nested `.gitignore` files resolution can surprise. Confirm with `--print-events` or override with `--no-vcs-ignore`.
- **No use watchexec for cron-style scheduling** — react to file events, not time. Use `cron`, `systemd timer`, `at`.
- **No reach for watchexec when tool already have `--watch`** — `bun --watch`, `vitest --watch`, `cargo watch` (sub-command), `tsc --watch` all integrate better with own caches.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — agents no start long-lived processes in foreground tool calls.
- Upstream: <https://github.com/watchexec/watchexec>
- Manual: `watchexec --help` and `man watchexec`