---
Status: ready-for-agent
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q15, Q16, Q22, C1, C2]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Schema changes — `Memory`, `MemoryLink`, `ContextSnapshot` MikroORM entities
---

## What to build

Migration class `src/db/migrations/Migration<timestamp>.ts` generated from always-on core entities: `Memory`, `MemoryLink`, and `ContextSnapshot`. Includes all composite indexes per Q22 and the FTS decorator expression from PRD schema.

**Risk gate first**: before generating the migration class, verify whether PGlite's bundled WASM Postgres supports the FTS metadata emitted by MikroORM. If it does not, compute the text-search field in `MemoryRepository` before `em.flush()` and document the fallback in a `// PGLITE-COMPAT:` comment at the repository method.

End-to-end: migration class runs idempotent on both PGlite (file-backed) and PostgreSQL; `em.getMetadata()` exposes all properties/indexes; `fulcrum doctor --json` subsystem check passes.

## Acceptance criteria

- [ ] Migration class is idempotent through MikroORM migration runner.
- [ ] `Memory` metadata exposes all properties per PRD entity: `id`, `orgId`, `projectId`, `global`, `kind`, `body`, `tags`, `importance`, `source`, `sourceRef`, `createdAt`, `updatedAt`, `archived`
- [ ] Text-search metadata path works: either PGlite accepts the FTS decorator expression or `MemoryRepository` computes the field before flush (fallback path documented)
- [ ] All five indexes on `Memory` are exposed by `em.getMetadata()`: `memories_org_project_importance`, `memories_org_kind`, `memories_org_archived`, `memories_org_global`, `memories_body_tsv`
- [ ] `MemoryLink` metadata + both indexes exposed by `em.getMetadata()`
- [ ] `ContextSnapshot` metadata + both indexes exposed by `em.getMetadata()`
- [ ] Migration runs clean on PGlite file-backed in `bun test` environment
- [ ] Migration runs clean on PostgreSQL (Docker or CI)
- [ ] Test: verify entity metadata and create/read/delete round-trips post-migration; verify idempotency on second run
- [ ] `fulcrum doctor --json` includes a `memories_schema` subsystem check returning `ok`

## Blocked by

None — can start immediately.
