---
Status: implemented
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
- `fulcrum web` → launch SvelteKit server (prod build via `@sveltejs/kit`); bind `PORT` env var. Boot sequence: instantiate the root needle-di `Container`, register `MikroORM` as a singleton, run pre-startup migration compat check (per PRD "Migration architecture") via `await migrator.getPendingMigrations()` + `schemaMigrationRepo` checks, then mount the SvelteKit handler.
- `fulcrum inference` → stub: print `Inference sidecar not yet implemented`; exit 0 (filled by Pillar 2).
- `fulcrum init` → delegate to `src/cli/init.ts` (from slice `04`).
- `bun build --compile` produces a single static `dist/fulcrum` binary. CI `bun run ci` includes this compile step.
- `package.json` `scripts.build` runs `bun build --compile src/index.ts --outfile dist/fulcrum`.

Cuts through: `src/index.ts` dispatcher → needle-di container bootstrap → MikroORM singleton init → `bun build --compile` → binary smoke test → CI script.

## Acceptance criteria
- [ ] Schema: N/A.
- [ ] Server action / tRPC: N/A.
- [ ] Web surface: `fulcrum web` starts SvelteKit on correct port; `curl localhost:$PORT` returns 200. Boot logs show "MikroORM initialized" + "Migrations up-to-date" + "needle-di container ready".
- [ ] CLI command: `dist/fulcrum --help` exits 0 and prints subcommand list. `dist/fulcrum tui` exits 0. `dist/fulcrum inference` exits 0. Binary size checked; warn in CI if > 150 MB (do not fail — failure gate is an architectural split, not a CI red).
- [ ] TUI screen: N/A — stub only.
- [ ] Tests: `tests/cli/entrypoint.test.ts` — spawn `dist/fulcrum --help`, assert exit code 0 + stdout contains `tui`, `web`, `inference`, `init`. `tests/cli/build.test.ts` — assert `dist/fulcrum` file exists after `bun run build`. RED → GREEN.

## Blocked by
- `06-trpc-core-router-and-permission-middleware` (web subcommand needs tRPC + needle-di container wired into SvelteKit before it can serve).

## Notes
Per Q-distribution: `fulcrum <domain> <verb>` tree (auth, flags, orgs, etc.) is added in slices `09` and `10`. This slice only creates the top-level dispatcher and the four top-level subcommands. Stub subcommands exit 0 per PRD spec. Per C8 the `tsconfig.json` decorator flags must be duplicated in root (Bun issue #6326) — verify both `experimentalDecorators` (for legacy if any third-party requires it) and Stage-3 (`tc39Decorators`) settings flow through to the compiled bundle.
