---
Status: ready-for-agent
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [05-doc-crud-trpc.md, 06-slash-menu-core-marks-blocks.md, 07-wikilink-node-backlinks.md, 09-comments-threads.md, 12-version-history-engine.md, 13-frontmatter-form-yaml-ui.md, 14-doc-tree-crud-ui.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C4, Q11]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: []
---

# Web routes assembly — /docs hub, /docs/<slug> read, /docs/<slug>/edit, /docs/<slug>/history, /projects/<id>/docs

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-33..P7-37, P7-40)

## What to build
Wire all SvelteKit routes for the docs domain, composing components from earlier slices:

- `/docs` — global hub: `DocTree` (both scope accordions), recent docs list, search bar (Pillar 11 integration point)
- `/docs/new` — `NewDocWizard.svelte` (slice 15)
- `/docs/<slug>` — read view: `remark`+shiki+`isomorphic-dompurify` render of `body_md`; wikilink chips clickable; backlinks panel; comments panel (read-only); frontmatter summary card; breadcrumbs
- `/docs/<slug>/edit` — TipTap editor (`DocEditor`), frontmatter slide-in panel, comments panel with anchoring, presence avatars placeholder (populated when collab flag on), autosave indicator
- `/docs/<slug>/history` — version timeline list; diff view (jsondiffpatch HTML); restore button
- `/projects/<id>/docs` — same layout as `/docs` but scoped to project (scope=`project`, project_id filter)

Sanitization: all `body_md` rendered via `remark`+`isomorphic-dompurify` in read view; TipTap renders its own output in edit view (no extra DOMPurify pass needed).

## Acceptance criteria
- [ ] `/docs` route loads without server error; `DocTree` shows global + project trees; recent docs list shows last 10 modified
- [ ] `/docs/new` wizard works end-to-end: pick type → template → create → redirect to edit
- [ ] `/docs/<slug>` read view: `body_md` rendered with syntax-highlighted code blocks; wikilink chips clickable; backlinks panel shows linked docs
- [ ] `/docs/<slug>` read view: DOMPurify applied to rendered HTML; `<script>` tags stripped; safe-by-default verified by test with XSS payload
- [ ] `/docs/<slug>/edit` mounts `DocEditor` with loaded `content_json`; frontmatter panel opens/closes; autosave indicator visible
- [ ] `/docs/<slug>/history` lists versions with snapshot badge; selecting two versions shows diff; restore creates new version + redirects to read view
- [ ] `/projects/<id>/docs` shows only project-scoped docs; scope toggle `g` switches to global tree
- [ ] cmd+K integration: `docs.create` command opens `/docs/new`; `docs.search` focuses search bar; `docs.navigate-to` opens picker
- [ ] Tests: Playwright — create doc flow end-to-end; edit + save + reload (content_json persisted); history restore; XSS payload sanitized
- [ ] Tests: Vitest — `sanitizeDocHtml` function strips `<script>` and `onerror` attrs; wikilink chips rendered in read view
- [ ] Web: `/docs/<slug>` shows correct frontmatter summary card per doc_type (e.g. ADR shows status badge)
- [ ] CLI: all routes reflect same data as `fulcrum docs list/show --json`
- [ ] TUI: `/docs` hub equivalent = two-pane tree+reader; same doc shown by TUI and web read view

## Blocked by
`05-doc-crud-trpc.md`, `06-slash-menu-core-marks-blocks.md`, `07-wikilink-node-backlinks.md`, `09-comments-threads.md`, `12-version-history-engine.md`, `13-frontmatter-form-yaml-ui.md`, `14-doc-tree-crud-ui.md`

## Notes / Tech-stack hints
- Read view sanitization pipeline: `unified().use(remarkParse).use(remarkRehype).use(rehypeShiki, {theme:'github-dark'}).use(rehypeSanitize).use(rehypeStringify)` — use `rehypeSanitize` not DOMPurify directly for the unified pipeline; DOMPurify as second-pass safety net
- Presence avatars on edit route: render empty `<PresenceAvatars>` component that reads from Hocuspocus awareness when `real-time-collab-server` flag is on; renders nothing when off
