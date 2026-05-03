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

# Doc template seeds — 9 built-in org-default templates + project-override precedence

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-04)

## What to build
Immutable built-in template constants for one default template per `doc_type`, exposed through
the runtime template service while the G0/P1 migration gate owns schema/migration surfaces.
No DB seed migration is added in this lane. The service returns deterministic app-level
fallback rows for org defaults and still lets DB-backed project templates override org
defaults when present. Each template carries a `body_template` with sensible heading
structure and a `frontmatter_template` matching the Zod schema for that `doc_type`.
Template bodies are plain markdown strings (not TipTap JSON) — the `docs.create`
procedure converts them to `content_json` at creation time.

## Acceptance criteria
- [x] Runtime service fallback returns exactly 9 built-in org-default templates (one per doc_type) with `project_id = NULL` and `is_default = true`
- [x] No P7 seed migration or global migrator DB write path is added while the G0/P1 migration gate is active
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
- Follow-up removed the unsafe P7 seed migration under the G0/P1 migration gate; this lane now has no rollback delete risk, no local-org duplicate insert, and no migration importing mutable app data.
- Built-in template constants live in `src/docs/template-seeds.ts`; `EntityManagerDocTemplateService` returns deterministic fallback rows (`builtin-doc-template-<doc_type>`) when DB org-default rows are absent.
- Added `docs.templates.list` / `docs.templates.resolve` tRPC surface with MikroORM-backed service fallback and project-over-org precedence; `list(projectId)` now returns project templates plus org defaults.
- Wired `fulcrum docs template list --json`, web `/docs/new` template preload/picker body application, and TUI `n` new-doc template preview/error state.
- Generated `src/cli/generated/docs.ts` is kept reproducible with `scripts/cli/codegen.ts`; the hand-written `fulcrum docs template ...` command remains the supported P7 CLI surface until generated nested imported routers are handled by the CLI codegen lane.
- Casbin action mapping now includes `docs.templates.resolve`.
- Parent orchestration log intentionally not edited from this worktree.

## Verification
- `bun test src/cli/docs-templates.test.ts src/db/data-integrity.test.ts src/server/trpc/routers/__tests__/doc-templates.test.ts src/web/src/routes/docs/new/page.server.test.ts tests/cli/codegen.test.ts tests/trpc/router.test.ts` — 53 pass, 0 fail.
- `bun test tests/db/migrator-service.test.ts tests/infrastructure/test-utils.test.ts` — 43 pass, 0 fail.
- `bun run --cwd src/web web:test -- docs-new-route.test.ts` — 2 pass, 0 fail.
- `bun run lint` — pass.
- `bun run check` in `src/web` — 0 errors; 2 existing warnings outside this lane (`src/routes/boards/+page.svelte`, `src/routes/auth/login/+page.svelte`).
- `git diff --check` — pass.
