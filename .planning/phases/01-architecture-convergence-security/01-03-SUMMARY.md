# 01-03 Summary: DDL Cleanup — Move ALTER TABLE to Migrations

## Status: COMPLETE

## What was done

1. **Created migration** `src/db/migrations/Migration20260504130000_ddl_cleanup.ts`
   - `tasks.due_date` and `tasks.start_date` columns (from tasks.ts handler)
   - `doc_links` columns: `from_doc_id`, `to_doc_id`, `to_slug`, `link_kind` (from documents.ts)
   - `doc_links` default/constraint changes: `id` default, nullable `source_doc_id`/`target_doc_id`
   - Full `down()` rollback provided

2. **Removed runtime DDL from handlers**
   - `src/web/src/lib/server/tasks.ts`: removed lines 75-78 (conditional ALTER TABLE block)
   - `src/web/src/lib/server/documents.ts`: removed `ensureDocLinksCompatibility()` function and its call

3. **Verification**
   - Zero ALTER TABLE statements remain in handler files
   - Migration follows existing project conventions (MikroORM `this.addSql`, `IF NOT EXISTS`)
   - No TypeScript reference errors from removal

## Commit

```
171fcbd0 fix(db): move runtime ALTER TABLE from handlers into migration
```
