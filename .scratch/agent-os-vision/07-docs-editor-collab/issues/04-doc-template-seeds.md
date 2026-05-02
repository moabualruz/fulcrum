---
Status: implemented
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [01-docs-schema-foundation.md]
Owner: claude-worker-p7-template-seeds
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C1, Q11]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: []
---

# Doc templates seed migration — 9 org-default templates + project-override precedence

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-04)

## What to build
A seed migration (runs after schema migration 01) that inserts one `doc_templates` row per
`doc_type` for the well-known local org (`org_id = default-org-uuid`,
`project_id = NULL`, `is_default = true`). Each template carries a `body_template` with
sensible heading structure and a `frontmatter_template` matching the Zod schema for that
doc_type. Template bodies are plain markdown strings (not TipTap JSON) — the `docs.create`
procedure converts them to `content_json` at creation time. Seed is idempotent
(`INSERT ... ON CONFLICT DO NOTHING`).

## Acceptance criteria
- [x] Seed migration inserts exactly 9 rows (one per doc_type) for the default org with `project_id IS NULL` and `is_default = true`
- [x] Re-running seed is idempotent — no duplicate rows, no error
- [x] ADR template `body_template` includes H2 sections: `## Context`, `## Decision`, `## Consequences`
- [x] Postmortem template includes `## Impact`, `## Timeline`, `## Root Cause`, `## Action Items`
- [x] RFC template includes `## Summary`, `## Motivation`, `## Proposal`, `## Alternatives`
- [x] Runbook template includes `## Service`, `## Severity`, `## Steps`, `## Escalation`
- [x] Meeting template includes `## Attendees`, `## Agenda`, `## Notes`, `## Action Items`
- [x] Each template's `frontmatter_template` keys match the required fields in the corresponding Zod schema from slice 03
- [x] Tests: `docs.templates.list` for default org returns 9 templates
- [x] Tests: project-specific template with same `doc_type` + `project_id` takes precedence over org default in template resolution (`docs.templates.resolve`; `docs.create` consumption remains owned by P7-05/P7-15)
- [x] Web: new-doc wizard shows the correct template body pre-populated when user picks a doc_type
- [x] CLI: `fulcrum docs template list --json` returns all 9 with correct fields
- [x] TUI: `n` new-doc flow shows template body in textarea before first save

## Blocked by
`01-docs-schema-foundation.md` — needs `doc_templates` table

## Notes / Tech-stack hints
- Template precedence resolution: `WHERE org_id=? AND project_id=? AND doc_type=? AND is_default=true` → fallback `WHERE org_id=? AND project_id IS NULL AND doc_type=? AND is_default=true`
- `body_template` is markdown, not TipTap JSON; `docs.create` calls the markdown-to-content_json converter in `src/docs/md-to-tiptap.ts` (to be built in slice 07)

## Implementation log
- Linkage chain preserved: `MASTER-PLAN.md -> COVERAGE.md -> TASK-DAG.md -> TASK-BUNDLES.md -> 07-docs-editor-collab/issues/04-doc-template-seeds.md`.
- Seed migration now inserts the well-known local org before org-default templates so fresh migrations satisfy the `doc_templates.org_id` FK, then seeds 9 idempotent template rows from `src/docs/template-seeds.ts`.
- Added `docs.templates.list` / `docs.templates.resolve` tRPC surface with MikroORM-backed service fallback and project-over-org precedence.
- Wired `fulcrum docs template list --json`, web `/docs/new` template preload, and TUI `n` new-doc template preview.
- `fulcrum init` now runs the idempotent seed service after migrations even when a migration created the default org first.
- Parent orchestration log intentionally not edited from this worktree.

## Verification
- `bun test src/cli/docs-templates.test.ts src/db/data-integrity.test.ts src/server/trpc/routers/__tests__/doc-templates.test.ts src/web/src/routes/docs/new/page.server.test.ts` — 26 pass, 0 fail.
- `bun run lint` — pass.
- `bun run check` in `src/web` — 0 errors; 2 existing warnings outside this lane.
- `git diff --check` — pass.
