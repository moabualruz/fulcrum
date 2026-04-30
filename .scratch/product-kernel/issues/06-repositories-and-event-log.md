# 06 — Repositories and event log

Status: ready-for-agent
Risk tier: medium
Dependencies: product-kernel/05
File ownership:
- `src/product-kernel/store/repositories.ts`
- `src/product-kernel/events.ts`
- `src/product-kernel/events.test.ts`
- `src/product-kernel/ids.ts`
- `src/product-kernel/paths.ts`

Acceptance criteria:
- `ids.ts` exposes `newUlid()` plus a deterministic `testUlid(seed)` for test fixtures.
- `paths.ts` returns the local product DB path under `~/.fulcrum/state/product/` (overridable with `FULCRUM_HOME`).
- `repositories.ts` exposes `createLocalOrg`, `createProject`, `createTask`, `appendEvent`, `listEventsForProject`.
- Creating a project and task writes both the source row and an `events` row in stable order with exact `actor` and `subject` fields.
- RED test fails before implementation; GREEN test (`bun test src/product-kernel/events.test.ts`) passes after.
