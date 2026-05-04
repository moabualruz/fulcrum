# Plan 01-07 Summary: Service Layer Extraction (ARCH-03)

## Status: COMPLETE

## What was done

Extracted business logic from three tRPC routers into dedicated service classes.
Routers became thin delegation layers — Zod schemas + one-line handler forwarding.

### Files created
- `src/services/TaskService.ts` (389 lines) — task CRUD, bulk ops, parent/dependency cycle detection, event emission
- `src/services/DocService.ts` (592 lines) — doc CRUD, comments, versions, wikilinks, search indexing, narration
- `src/services/SprintService.ts` (321 lines) — sprint CRUD, start/close lifecycle, task disposition, metrics

### Files modified
- `src/server/trpc/routers/tasks.ts` — 508 → 199 lines (61% reduction)
- `src/server/trpc/routers/docs.ts` — 763 → 296 lines (61% reduction; remaining bulk is Zod schemas, not logic)
- `src/server/trpc/routers/sprints.ts` — 381 → 165 lines (57% reduction)

## Architecture

- Service classes take `EntityManager` as constructor parameter
- Routers resolve services via `requireService(ctx)` / `resolveService(ctx)` helpers
- Tasks router preserves needle-di `Container` fallback for `TaskRepository` resolution
- All event emission, cycle detection, version management, and comment auth moved to services
- No behavioral changes — same tRPC API surface, same validation schemas

## Metrics
- Total lines: routers 660 (down from 1652), services 1302
- Net: business logic now testable without tRPC context
