---
Status: ready-for-agent
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q15, Q16, Q22, C1, C2]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Schema changes — memories, memory_links, context_snapshots DDL
---

## What to build

Migration creating the always-on core tables: `memories` (with `body_tsv` GENERATED ALWAYS tsvector column), `memory_links`, and `context_snapshots`. Includes all composite indexes per Q22.

**Risk gate first**: before writing the migration, verify whether PGlite's bundled WASM Postgres supports `GENERATED ALWAYS AS ... STORED` columns. If it does not, compute `body_tsv` in the application layer on write and add a trigger instead — document the fallback in a `// PGLITE-COMPAT:` comment at the migration call-site.

End-to-end: migration runs idempotent on both PGlite (file-backed) and PostgreSQL; all indexes present; `fulcrum doctor --json` subsystem check passes.

## Acceptance criteria

- [ ] Migration is idempotent (`IF NOT EXISTS` guards on tables and indexes)
- [ ] `memories` table created with all columns per PRD DDL: `id`, `org_id`, `project_id`, `global`, `kind`, `body`, `tags`, `importance`, `source`, `source_ref`, `created_at`, `updated_at`, `archived`, `body_tsv`
- [ ] `body_tsv` populated correctly: either GENERATED ALWAYS (if PGlite supports it) or app-layer write + trigger (fallback path documented)
- [ ] All five GIN/btree indexes on `memories` created: `memories_org_project_importance`, `memories_org_kind`, `memories_org_archived`, `memories_org_global` (partial), `memories_body_tsv` (GIN)
- [ ] `memory_links` table + both indexes created
- [ ] `context_snapshots` table + both indexes created
- [ ] Migration runs clean on PGlite file-backed in `bun test` environment
- [ ] Migration runs clean on PostgreSQL (Docker or CI)
- [ ] Test: verify all tables and indexes exist post-migration; verify idempotency on second run
- [ ] `fulcrum doctor --json` includes a `memories_schema` subsystem check returning `ok`

## Blocked by

None — can start immediately.
