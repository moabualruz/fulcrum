# 01-08 Event Unification (ARCH-04) — SUMMARY

**Status**: COMPLETE
**Branch**: worktree-agent-ae81457ca4c0c2704

## What was done

### Commit 1: `feat(events): add unified EventDispatcher (ARCH-04)`
- Created `src/product-kernel/event-dispatcher.ts` — single `EventDispatcher` class
  - `dispatch(db, input)` — persist to DB via appendEvent + publish to in-memory subscribers in one call
  - `on(handler, filter?)` — subscribe with optional filter by subjectKind, verb, orgId (compound filters supported)
  - `once(handler, filter?)` — one-shot subscription
  - `publish(event)` — in-memory-only notification (for testing or pre-persisted events)
  - Error isolation: handler exceptions don't break other listeners (sync + async)
  - Process singleton `eventDispatcher` exported for import
- Created `src/product-kernel/event-dispatcher.test.ts` — 8 tests covering persistence, filtering, compound filters, unsubscribe, once, error isolation, listenerCount, publish-only
- Updated `src/product-kernel/events.ts` barrel to export EventDispatcher + types

### Commit 2: `refactor(events): migrate all callers from appendEvent to eventDispatcher.dispatch`
- Migrated 16 source files from `appendEvent(db, {...})` to `eventDispatcher.dispatch(db, {...})`
  - `src/product-kernel/store/repositories.ts` (7 call sites)
  - `src/product-kernel/symphony.ts` (2 call sites)
  - `src/product-kernel/narration.ts` (1 call site)
  - `src/product-kernel/sprints.ts` (1 call site)
  - `src/cli/product.ts` (2 call sites)
  - `src/web/src/lib/server/` — tasks, projects, runs, saved-views, memory, project-connectors, project-statuses, documents, custom-fields, agents, task-detail
- `appendEvent` preserved as internal implementation detail (EventDispatcher delegates to it)
- Test files still import `appendEvent` directly for seeding — acceptable, no pub/sub needed

## Architecture after change

```
                    ┌─────────────────────┐
                    │   EventDispatcher    │ ← single entry point
                    │                     │
                    │  dispatch(db, input) │
                    │    │         │       │
                    │    ▼         ▼       │
                    │ persist   publish    │
                    │ (SQL)    (in-mem)    │
                    └─────────────────────┘
                         │           │
                         ▼           ▼
                    events table   subscribers
                    (ULID PKs)    (EventHandler)
```

## Design decisions

1. **RoutingEventBus preserved** — it's a narrow routing-rules invalidation notifier, not a general event bus. Unifying it would couple routing to the product-kernel event schema unnecessarily. It stays in `src/router/event-bus.ts`.

2. **Symphony hooks preserved** — `registerHook`/`fireHook` in symphony.ts serve workflow lifecycle callbacks. These are orchestration-specific and operate on `SymphonyRunRow`, not `EventRow`. Symphony now uses `eventDispatcher.dispatch` for audit events but keeps its hook registry for run-lifecycle callbacks.

3. **appendEvent kept as internal** — exported from barrel for backward compatibility in tests, but all production code routes through `eventDispatcher.dispatch()`.

## Verification

- 11 tests pass (8 new EventDispatcher + 3 existing event tests)
- All ULID PKs — consistent across the board
- No direct `appendEvent` calls in production code (only in test files and the definition)
