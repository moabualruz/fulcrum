---
Status: completed
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [05-doc-crud-trpc.md, 12-version-history-engine.md, 07-wikilink-node-backlinks.md, 15-doc-templates-trpc-ui.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C4, Q-cli-shape]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: []
---

# CLI docs commands — create / list / tree / show / edit / move / rename / delete / archive / history / restore / backlinks + template + comments

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-41..P7-43)

## What to build
Auto-codegenned CLI bindings for all `docs.*`, `docs.versions.*`, `docs.comments.*`,
`docs.links.*`, `docs.templates.*` tRPC procedures. Hand-coded where interactive:
`fulcrum docs edit <slug>` opens `$EDITOR` with `body_md`. `--json` flag on every
command. Connector sync: `fulcrum docs connector sync <name>` (dispatches graphile-worker
job for gated connectors). All commands respect `--project <id>` and `--org <id>` flags.

## Acceptance criteria
- [ ] `fulcrum docs create --title "My ADR" --type adr --json` → `{id, slug, doc_type, created_at}`
- [ ] `fulcrum docs list --type adr --scope global --json` → paginated array with correct fields
- [ ] `fulcrum docs tree --project <id> --json` → nested structure with `{id, title, doc_type, children:[]}`
- [ ] `fulcrum docs show <slug> --json` → full doc row including `body_md`, `frontmatter`, `doc_type`
- [ ] `fulcrum docs edit <slug>` → opens `$EDITOR` with `body_md`; on save → `docs.update` called; new version written
- [ ] `fulcrum docs move <slug> --parent <parent-slug> --json` → updates `parent_id`; returns updated doc
- [ ] `fulcrum docs rename <slug> --title "New Title" --json`
- [ ] `fulcrum docs archive <slug> --json` → soft delete; `archived=true` in response
- [ ] `fulcrum docs delete <slug> --hard --json` → hard delete; confirms before executing
- [ ] `fulcrum docs history <slug> --json` → version list with `{version_num, is_snapshot, created_at, author_id}`
- [ ] `fulcrum docs restore <slug> --version 5 --json` → creates restore row; response includes new `version_num`
- [ ] `fulcrum docs backlinks <slug> --json` → `[{from_doc_id, title, slug, link_kind}]`
- [ ] `fulcrum docs template list --json` + `fulcrum docs template create --type adr --name "..." --body "..." --json`
- [ ] `fulcrum docs comments list <slug> --json` → `[{id, body_md, anchor_range, resolved, replies:[...]}]`
- [ ] `fulcrum docs connector sync <name>` → enqueues graphile-worker job; reports job ID in `--json` output
- [ ] Tests: every command — `--json` output validates against exported Zod response schema
- [ ] Tests: `fulcrum docs edit <slug>` — mock `$EDITOR` writes new body_md; `docs.update` called; version row written
- [ ] Tests: `fulcrum docs restore --version 5 --json` → response `restore_of` matches v5 id; byte-stable body_md

## Blocked by
`05-doc-crud-trpc.md`, `12-version-history-engine.md`, `07-wikilink-node-backlinks.md`, `15-doc-templates-trpc-ui.md`

## Notes / Tech-stack hints
- Auto-codegen from tRPC: codegen script reads `docs.*` router shape + Zod output schemas → emits command tree; per Q-cli-shape decision
- `fulcrum docs edit` is the only hand-coded interactive flow (opens `$EDITOR`); all others are codegenned
- `--json` output on error: `{error: true, code: 'NOT_FOUND', message: '...'}` — consistent error shape across all commands
