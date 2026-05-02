---
Status: in-progress
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
- [ ] Seed migration inserts exactly 9 rows (one per doc_type) for the default org with `project_id IS NULL` and `is_default = true`
- [ ] Re-running seed is idempotent — no duplicate rows, no error
- [ ] ADR template `body_template` includes H2 sections: `## Context`, `## Decision`, `## Consequences`
- [ ] Postmortem template includes `## Impact`, `## Timeline`, `## Root Cause`, `## Action Items`
- [ ] RFC template includes `## Summary`, `## Motivation`, `## Proposal`, `## Alternatives`
- [ ] Runbook template includes `## Service`, `## Severity`, `## Steps`, `## Escalation`
- [ ] Meeting template includes `## Attendees`, `## Agenda`, `## Notes`, `## Action Items`
- [ ] Each template's `frontmatter_template` keys match the required fields in the corresponding Zod schema from slice 03
- [ ] Tests: `docs.templates.list` for default org returns 9 templates
- [ ] Tests: project-specific template with same `doc_type` + `project_id` takes precedence over org default in `docs.create` template resolution
- [ ] Web: new-doc wizard shows the correct template body pre-populated when user picks a doc_type
- [ ] CLI: `fulcrum docs template list --json` returns all 9 with correct fields
- [ ] TUI: `n` new-doc flow shows template body in textarea before first save

## Blocked by
`01-docs-schema-foundation.md` — needs `doc_templates` table

## Notes / Tech-stack hints
- Template precedence resolution: `WHERE org_id=? AND project_id=? AND doc_type=? AND is_default=true` → fallback `WHERE org_id=? AND project_id IS NULL AND doc_type=? AND is_default=true`
- `body_template` is markdown, not TipTap JSON; `docs.create` calls the markdown-to-content_json converter in `src/docs/md-to-tiptap.ts` (to be built in slice 07)
