# 01-05 SUMMARY: Product-kernel raw SQL migration to MikroORM (ARCH-02)

## Status: COMPLETE

## What was done

1. **Sprint entity extended** (`src/db/entities/tasks/Sprint.ts`)
   - Added `closedAt`, `metricsSnapshot`, `retroDocId`, `updatedAt` properties
   - Wired `SprintRepository` via `@Entity({ repository })` decorator

2. **Event entity extended** (`src/db/entities/core/Event.ts`)
   - Added `actor` (string) and `projectId` (uuid) properties for product-kernel compatibility

3. **SprintRepository created** (`src/db/repositories/tasks/SprintRepository.ts`)
   - Standard MikroORM EntityRepository stub with needle-di @injectable

4. **Repository barrel updated** (`src/db/repositories/tasks/index.ts`)
   - Exports SprintRepository alongside TaskRepository

5. **repositories.ts fully rewritten** (`src/product-kernel/store/repositories.ts`)
   - All raw `db.query()` calls replaced with MikroORM patterns:
     - `em.getRepository(Entity).find/findOne/create` for entity ops
     - `em.execute(sql, params, 'all')` for complex queries without entities
     - `em.persist()` + `em.flush()` for inserts/updates
   - `DbHandle` union type (`EntityManager | ProductDb`) for backward compat
   - All Row interfaces and function signatures preserved
   - Type-check passes cleanly

## Key decisions

- Used `em.execute()` (MikroORM's SqlEntityManager method) instead of `getKnex()` since knex types aren't exposed on the PostgreSqlEntityManager in this project's type setup
- Kept `DbHandle` union type so callers can migrate incrementally; runtime assertion throws with migration guidance if ProductDb passed
- Tables without MikroORM entities (projects, custom_fields, saved_views, api_keys, event_handler_log) use `em.execute()` raw queries through MikroORM connection

## Files modified

- `src/db/entities/core/Event.ts`
- `src/db/entities/tasks/Sprint.ts`
- `src/db/repositories/tasks/SprintRepository.ts` (new)
- `src/db/repositories/tasks/index.ts`
- `src/product-kernel/store/repositories.ts`
