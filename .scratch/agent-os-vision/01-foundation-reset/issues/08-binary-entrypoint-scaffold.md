---
Status: ready-for-agent
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 06-trpc-core-router-and-permission-middleware
---

# `fulcrum` single-binary entrypoint scaffold with subcommand dispatcher

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Implement the top-level `src/index.ts` binary entrypoint that dispatches all subcommands:

- `fulcrum` / `fulcrum --help` → print usage + subcommand list; exit 0.
- `fulcrum tui` → stub: print `TUI not yet implemented`; exit 0 (filled by TUI pillar).
- `fulcrum web` → launch SvelteKit server (prod build via `@sveltejs/kit`); bind `PORT` env var.
- `fulcrum inference` → stub: print `Inference sidecar not yet implemented`; exit 0 (filled by Pillar 2).
- `fulcrum init` → delegate to `src/cli/init.ts` (from slice `04`).
- `bun build --compile` produces a single static `dist/fulcrum` binary. CI `bun run ci` includes this compile step.
- `package.json` `scripts.build` runs `bun build --compile src/index.ts --outfile dist/fulcrum`.

Cuts through: `src/index.ts` dispatcher → `bun build --compile` → binary smoke test → CI script.

## Acceptance criteria
- [ ] Schema: N/A.
- [ ] Server action / tRPC: N/A.
- [ ] Web surface: `fulcrum web` starts SvelteKit on correct port; `curl localhost:$PORT` returns 200.
- [ ] CLI command: `dist/fulcrum --help` exits 0 and prints subcommand list. `dist/fulcrum tui` exits 0. `dist/fulcrum inference` exits 0. Binary size checked; warn in CI if > 150 MB (do not fail — failure gate is an architectural split, not a CI red).
- [ ] TUI screen: N/A — stub only.
- [ ] Tests: `tests/cli/entrypoint.test.ts` — spawn `dist/fulcrum --help`, assert exit code 0 + stdout contains `tui`, `web`, `inference`, `init`. `tests/cli/build.test.ts` — assert `dist/fulcrum` file exists after `bun run build`. RED → GREEN.

## Blocked by
- `06-trpc-core-router-and-permission-middleware` (web subcommand needs tRPC wired into SvelteKit before it can serve).

## Notes
Per Q-distribution: `fulcrum <domain> <verb>` tree (auth, flags, orgs, etc.) is added in slices `09` and `10`. This slice only creates the top-level dispatcher and the four top-level subcommands. Stub subcommands exit 0 per PRD spec.
