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
