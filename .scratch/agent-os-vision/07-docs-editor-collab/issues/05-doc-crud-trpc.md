---
Status: implemented
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [01-docs-schema-foundation.md, 03-frontmatter-schemas.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C2, C4, Q22, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: []
---

# Doc CRUD tRPC procedures — create / read / update / archive / move + search-index upsert

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-05..P7-10)

## What to build
tRPC namespace `docs.*` covering the core document lifecycle:
`docs.list`, `docs.get`, `docs.create`, `docs.update`, `docs.delete`, `docs.move`.
`docs.create` auto-generates `slug` from title, applies template (org-default fallback per
slice 04), writes version row 1, upserts `search_documents`.
`docs.update` writes a version row via the version-writer (slice 12), upserts
`search_documents`, triggers wikilink extraction (slice 11).
`docs.delete` supports soft (archived=true) and hard (CASCADE) modes.
`docs.move` writes new `parent_id` + recomputes `sort_position` fractional index.
`docs.tree` returns recursive CTE result (depth-limited, archived excluded).
All procedures carry `assertPermission()`. `--json` parity via CLI codegen.

## Acceptance criteria
- [ ] `docs.list` returns paginated rows filtered by `scope / doc_type / archived / parent_id`; `org_id` scoped
- [ ] `docs.get` returns full row by slug or id; throws `TRPCError NOT_FOUND` on missing
- [ ] `docs.create`: slug auto-generated as `kebab-case(title) + '-' + nanoid(6)`; template body applied; version row 1 written; `search_documents` upserted
- [ ] `docs.update`: `content_json` + `body_md` saved; version row written; `search_documents` upserted; wikilink extraction triggered
- [ ] `docs.delete` soft: sets `archived=true`; hard: cascades `doc_links`, `doc_versions`, `doc_comments`
- [ ] `docs.move`: updates `parent_id` + `sort_position`; fractional index keeps existing siblings' positions stable
- [ ] `docs.tree`: returns nested structure via recursive CTE; depth ≤ 20; archived nodes excluded by default
- [ ] All procedures: `assertPermission()` called; unauthenticated call throws `UNAUTHORIZED`
- [ ] Tests: create→get→update→archive→hard-delete lifecycle integration test on PGlite
- [ ] Tests: `docs.tree` with 3 levels of nesting returns correct parent-child structure
- [ ] Tests: `docs.move` — sort_position of moved node falls between surrounding siblings (midpoint)
- [ ] Web: create doc via `/docs/new` wizard → redirects to `/docs/<slug>/edit`; doc visible in tree
- [ ] CLI: `fulcrum docs create --title "My ADR" --type adr --json` returns `{id, slug, doc_type}`; `fulcrum docs list --json` returns array
- [ ] TUI: `n` key triggers create flow, doc appears in tree; `d` key archives; Enter opens reader

## Blocked by
`01-docs-schema-foundation.md`, `03-frontmatter-schemas.md`

## Notes / Tech-stack hints
- Slug uniqueness: UNIQUE `(org_id, slug)`; on conflict append `-2`, `-3`, etc.
- `sort_position` fractional indexing: insert at end → `max(sort_position) + 1`; between two nodes → `(a + b) / 2`; rebalance when gap < `2^-53`
- `docs.tree` CTE: `WITH RECURSIVE tree AS (SELECT … WHERE parent_id IS NULL UNION ALL SELECT … JOIN tree …)` with `depth < 20` guard
- `docs.create` must call `src/docs/md-to-tiptap.ts` to convert template `body_template` (markdown) → `content_json` (TipTap JSON)
