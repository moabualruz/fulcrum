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
