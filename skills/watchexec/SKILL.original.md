---
name: watchexec
description: Use this skill whenever the user wants to run a command every time files change — rerunning tests, rebuilding, relinting, or restarting a server on save. Trigger phrases include "rerun tests when files change", "watch for file changes and run a command", "auto-rebuild on save", "rerun lint on edits", "watch a directory and trigger a script", "auto-run tests when source files change", "rebuild the project on save", "set up a dev loop that reruns on edits". The body covers extension filtering, restart semantics for long-running servers, parameter sweeps, and the guardrail for non-interactive agent shells (run the inner command once, explain the watch invocation rather than spawning it). Skip for one-off runs, cron-style scheduling, tailing logs, or CI build triggers.
---

# watchexec

## When to use

- The human in front of the terminal wants a command to rerun every time source files change — the classic dev loop (`watchexec -e rs -- cargo test`, `watchexec -- bun test`).
- The user asks "how do I auto-rebuild / auto-test / auto-lint on save" — explain watchexec.
- A long-running server needs to restart on edits — `watchexec --restart -- bun run server.ts`.
- The user pipes find/inotifywait into a loop by hand — replace with watchexec.

**Skip** for: one-shot runs (just run the command); cron-style time-based scheduling (`cron`, `systemd timer`, `at`); log tailing (`tail -f`, `less +F`); CI build triggers (use the CI's `on:` config); language-native watchers that already exist (`cargo watch`, `bun --watch`, `vitest --watch`, `tsc --watch`).

**Agent behavior — read this first.** watchexec is a long-lived process: it blocks until killed. In a non-interactive agent shell, starting it means the next tool call never returns. When asked to "watch and run X", the agent should:

1. Run the inner command once (`bun test`, `cargo build`, etc.) so the user sees the current result.
2. Tell the human how to set up watchexec themselves for the persistent loop.

Only start watchexec from an agent shell if the user has explicitly attached a tmux/background session and asked for it.

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

`-e` matches purely on file extension. Changes to `tsconfig.json`, `Cargo.toml`, or `pyproject.toml` will **not** trigger — add `-w` or `-f` if you need them.

### Pattern B — restart a server on edit

```bash
watchexec --restart -e ts -- bun run --bun src/server.ts
watchexec -r -e go -- go run ./cmd/api
```

Without `--restart`, watchexec waits for the previous run to exit before starting the next one — fine for tests, broken for servers that never exit on their own.

### Pattern C — clear + debounce for noisy editors

```bash
watchexec -c -d 300 -e ts -- bun run --bun tsc --noEmit
```

`-c` clears the screen so each run is readable; `-d 300` collapses bursts (editors often save 3–5 events per Cmd-S).

### Pattern D — multi-directory watch with custom ignores

```bash
watchexec -w src -w tests -i 'src/generated/**' -- bun test
```

`-w` is repeatable; each path is a separate root. Combine with `-i` for build-output dirs that aren't in `.gitignore`.

### Pattern E — bigger ignore lists from a file

```bash
# .watchexecignore (gitignore syntax)
target/
*.snap.new
coverage/

watchexec --ignore-file .watchexecignore -e rs -- cargo test
```

Once you're past three or four `-i` flags, switch to `--ignore-file`.

### Pattern F — postpone first run

```bash
watchexec --postpone -e sql -- ./scripts/regen-fixtures.sh
```

Useful when the command is expensive and the current state on disk is already known good — run it only on the next change.

### Pattern G — recommend to a human (agent path)

When asked to "watch and rerun tests", the agent should run the one-shot first and then output guidance like:

> I ran `bun test` once for you. To rerun automatically on every save, open a terminal and run:
>
> ```bash
> watchexec -c -e ts,tsx -- bun test
> ```
>
> Add `--restart` if it's a long-running process, `-w <dir>` to scope, `-i '<glob>'` to ignore.

Do not start the loop yourself in a non-interactive shell.

## Anti-patterns

- **Don't start `watchexec` in a non-interactive agent shell expecting it to return** — it runs forever and hangs the session. Run the inner command once as a one-shot and tell the human how to wire the watcher.
- **Don't use `-e ts` and expect TypeScript-config sensitivity** — the filter is purely on file extension. Edits to `tsconfig.json` won't trigger; add `-f 'tsconfig*.json'` or another `-w` if you need them.
- **Don't forget `--restart` for long-running servers** — without it, watchexec waits for the previous invocation to exit before starting the next one, so a server that never exits is never restarted.
- **Don't pile up six `--ignore <glob>` flags** — switch to `--ignore-file <path>` (gitignore syntax) once the list grows.
- **Don't rely on default `.gitignore` reading without verifying** — for monorepos with nested `.gitignore` files the resolution can surprise you. Confirm with `--print-events` or override with `--no-vcs-ignore`.
- **Don't use watchexec for cron-style scheduling** — it reacts to file events, not to time. Use `cron`, `systemd timer`, or `at`.
- **Don't reach for watchexec when the tool already has `--watch`** — `bun --watch`, `vitest --watch`, `cargo watch` (sub-command), `tsc --watch` all integrate better with their own caches.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — agents don't start long-lived processes in foreground tool calls.
- Upstream: <https://github.com/watchexec/watchexec>
- Manual: `watchexec --help` and `man watchexec`
