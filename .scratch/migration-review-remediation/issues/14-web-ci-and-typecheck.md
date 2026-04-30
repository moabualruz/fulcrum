# 14 — Web CI and typecheck

Status: ready-for-agent
Risk tier: high
Dependencies: —
Source: `.scratch/claude-migration-review/REPORT.md` C2, C3
File ownership:
- `src/web/package.json`
- `src/web/tsconfig.json`
- `src/web/src/lib/state/fulcrum-store.test.ts`
- `src/web/src/lib/product-queries.test.ts`
- `scripts/ci.ts`

Acceptance criteria:
- `cd src/web && bun run check` exits 0.
- Root `bun run ci` includes `cd src/web && bun run build` (and ideally `check`) so future web regressions break root CI.
- `bun-types` (or the SvelteKit-recommended types pattern) is installed in `src/web` so `bun:test` and the `Bun` global are typed.
- Web tests still pass via `bun test ./src/web/...` from the repo root.

## Comments
- Shipped: `@types/bun` added to `src/web/package.json`, `types: ["bun"]` set in `src/web/tsconfig.json`. `scripts/ci.ts` gained `web:install`, `web:check`, and `web:build` stages, each with `cwd: src/web`. Root CI now exercises the full SvelteKit pipeline; `cd src/web && bun run check` exits 0.
