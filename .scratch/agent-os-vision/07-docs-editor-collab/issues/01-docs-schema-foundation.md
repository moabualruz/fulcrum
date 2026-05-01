---
Status: ready-for-agent
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C2, Q11, Q22]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: []
---

# Docs schema foundation — ALTER TABLE docs + doc_links + doc_versions + doc_comments + doc_templates

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-01..P7-02)

## What to build
Five idempotent Drizzle migrations that establish the complete Pillar 7 schema. Migration 1
extends the existing `docs` table (`ADD COLUMN IF NOT EXISTS`) with `parent_id`, `scope`,
`doc_type`, `frontmatter`, `body_md`, `content_json`, `sort_position`, `archived`,
`external_id`, plus all `docs_org_*` composite indexes. Migration 2 creates `doc_links`,
`doc_versions`, `doc_comments`, `doc_templates` with their full column sets, CHECK
constraints, FK cascades, and composite `(org_id, …)` indexes per Q22. Drizzle schema
types + Zod base shapes exported from `src/db/schema/docs.ts`.

## Acceptance criteria
- [ ] Migration: `docs` ALTERed idempotently — all nine columns present, re-run no-op
- [ ] Migration: `docs.doc_type` CHECK (`spec|adr|wiki|runbook|meeting|postmortem|rfc|note|scratch`), `docs.scope` CHECK (`project|global`)
- [ ] Migration: indexes `docs_org_project_scope`, `docs_org_doc_type`, `docs_org_parent`, `docs_org_external_id` UNIQUE PARTIAL (WHERE external_id IS NOT NULL) all present
- [ ] Migration: `doc_links(id, org_id, from_doc_id, to_doc_id, to_slug, link_kind, anchor, created_at)` with CHECK (`wikilink|task_ref|run_ref|mention`); `doc_links_org_from`, `doc_links_org_to` indexes
- [ ] Migration: `doc_versions(id, org_id, doc_id, version_num, snapshot, delta, body_md_snapshot, author_id, restore_of, created_at)` with UNIQUE `(doc_id, version_num)`; index `doc_versions_org_doc_version`
- [ ] Migration: `doc_comments(id, org_id, doc_id, anchor_range, author_id, body_md, parent_comment_id, resolved, created_at, updated_at)`; index `doc_comments_org_doc`
- [ ] Migration: `doc_templates(id, org_id, project_id, doc_type, name, frontmatter_template, body_template, is_default, created_at)` with UNIQUE `(org_id, project_id, doc_type, name)`; index `doc_templates_org_project_type`
- [ ] Logic: `DocRow`, `DocLinkRow`, `DocVersionRow`, `DocCommentRow`, `DocTemplateRow` Drizzle inferred types exported with correct nullability
- [ ] Logic: `DocTypeEnum` + `ScopeEnum` + `LinkKindEnum` Zod/Drizzle enums exported from schema
- [ ] Tests: all six migrations idempotent (apply twice, no error, same schema)
- [ ] Tests: `docs.parent_id` ON DELETE SET NULL — delete parent row, child `parent_id` becomes NULL
- [ ] Tests: `doc_links.from_doc_id` ON DELETE CASCADE — delete doc, all its outbound links removed
- [ ] Tests: `doc_comments.parent_comment_id` ON DELETE CASCADE — delete thread root, replies removed
- [ ] Tests: `EXPLAIN` on `WHERE org_id=? AND project_id=? AND scope=?` uses `docs_org_project_scope`

## Blocked by
None — can start immediately

## Notes / Tech-stack hints
- `content_json` default `'{}'::jsonb`; `frontmatter` default `'{}'::jsonb`; `sort_position float8` default `0`
- `external_id` format: `'confluence:<page_id>'` | `'notion:<page_id>'` — validated by Zod pattern in TS, not at DB level
- `doc_versions.restore_of` FK ON DELETE SET NULL — restoring to a version that was itself a restore must not cascade-delete
- Failure gate: if PGlite WASM doesn't support the recursive CTE needed for tree queries, document the fallback to a closure table alongside (PRD tech-stack row)
