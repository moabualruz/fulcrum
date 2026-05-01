---
Status: ready-for-agent
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [01-docs-schema-foundation.md, 04-doc-template-seeds.md, 05-doc-crud-trpc.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: []
---

# Doc templates CRUD — tRPC + Settings UI + New-doc wizard integration

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-18, P7-40)

## What to build
tRPC namespace `docs.templates.*`: `list`, `get`, `create`, `update`, `delete`, `setDefault`.
Resolution: project-specific template takes precedence over org-default (same `doc_type`).
`NewDocWizard.svelte` — multi-step: pick `doc_type` (grid of 9 cards with icon/description)
→ shows available templates for that type → create → redirects to `/docs/<slug>/edit` with
template body pre-populated. Settings → Templates page: CRUD for project-scoped templates.
Slash menu `/template` entry opens template picker inside the editor to insert template content
at cursor.

## Acceptance criteria
- [ ] `docs.templates.list`: returns org-default templates + project overrides filtered by `doc_type` if passed
- [ ] `docs.templates.create`: creates project-scoped template; `org_id` + `project_id` set from auth context
- [ ] `docs.templates.setDefault`: marks one template as `is_default=true`; clears previous default for same `(org_id, project_id, doc_type)` combination
- [ ] `docs.templates.delete`: only template owner or org admin can delete; org-default templates protected from deletion via `project_id IS NULL` guard
- [ ] Resolution precedence: `docs.create` picks project-specific template over org-default for same doc_type
- [ ] `NewDocWizard.svelte`: step 1 shows 9 doc_type cards; step 2 shows available templates (org-default if no project override); step 3 creates doc + redirects
- [ ] Settings → Templates page: lists templates per doc_type; create / edit / delete / set-default actions
- [ ] Slash menu `/template` entry: opens template picker popover; selecting template inserts body at cursor position
- [ ] Tests: resolution precedence — project-scoped template returned over org-default for same doc_type
- [ ] Tests: `setDefault` — only one `is_default=true` per `(org_id, project_id, doc_type)` after call
- [ ] Tests: `docs.create` uses correct template body in `content_json` for each doc_type
- [ ] Web: new-doc wizard flow end-to-end: pick ADR → default template shown → create → editor opens with ADR template
- [ ] CLI: `fulcrum docs template list --json` returns templates; `fulcrum docs template create --type adr --name "My ADR" --body "..." --json`
- [ ] TUI: `n` key in tree opens simplified template picker; selected template pre-fills textarea

## Blocked by
`01-docs-schema-foundation.md`, `04-doc-template-seeds.md`, `05-doc-crud-trpc.md`

## Notes / Tech-stack hints
- `is_default` toggle: use a DB transaction — `UPDATE … SET is_default=false WHERE org_id=? AND project_id=? AND doc_type=?`, then `UPDATE … SET is_default=true WHERE id=?`
- Template CRUD settings page lives at `/projects/<id>/settings/templates`; org-level templates at `/settings/templates`
