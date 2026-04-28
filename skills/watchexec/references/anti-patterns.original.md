## Anti-patterns

- **Don't start `watchexec` in a non-interactive agent shell expecting it to return** — it runs forever and hangs the session. Run the inner command once as a one-shot and tell the human how to wire the watcher.
- **Don't use `-e ts` and expect TypeScript-config sensitivity** — the filter is purely on file extension. Edits to `tsconfig.json` won't trigger; add `-f 'tsconfig*.json'` or another `-w` if you need them.
- **Don't forget `--restart` for long-running servers** — without it, watchexec waits for the previous invocation to exit before starting the next one, so a server that never exits is never restarted.
- **Don't pile up six `--ignore <glob>` flags** — switch to `--ignore-file <path>` (gitignore syntax) once the list grows.
- **Don't rely on default `.gitignore` reading without verifying** — for monorepos with nested `.gitignore` files the resolution can surprise you. Confirm with `--print-events` or override with `--no-vcs-ignore`.
- **Don't use watchexec for cron-style scheduling** — it reacts to file events, not to time. Use `cron`, `systemd timer`, or `at`.
- **Don't reach for watchexec when the tool already has `--watch`** — `bun --watch`, `vitest --watch`, `cargo watch` (sub-command), `tsc --watch` all integrate better with their own caches.
