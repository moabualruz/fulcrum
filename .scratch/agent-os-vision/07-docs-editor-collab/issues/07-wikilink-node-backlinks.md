---
Status: completed
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [02-tiptap-svelte-binding-spike.md, 05-doc-crud-trpc.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [Q11, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: [https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/svelte]
---

# Wikilink TipTap NodeView + backlink computation + doc_links tRPC

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-24, P7-19, P7-17)

## What to build
Custom TipTap `Node` extension `WikilinkNode` (~300 LOC): parses `[[slug]]` syntax,
renders as a Svelte NodeView chip (resolved = blue link, unresolved = orange + "create?"
action). On editor mount, batch-resolves all wikilink slugs via a single
`docs.links.resolveSlug` tRPC call. On save (via `docs.update`), `src/docs/wikilink-extractor.ts`
parses `content_json` for all wikilink nodes → bulk upserts `doc_links` rows
(`link_kind='wikilink'`), removes stale rows. Autocomplete: while typing `[[`, opens a
dropdown of matching doc titles (fuzzy, max 10). tRPC: `docs.links.listBacklinks` +
`docs.links.listForwardLinks`. Web sidebar "Referenced by N docs" panel. CLI + TUI parity.

## Acceptance criteria
- [x] `WikilinkNode` extension: `[[slug]]` typed in editor renders as chip NodeView (not raw text)
- [x] Resolved chip: blue, clickable → navigates to `/docs/<slug>`
- [ ] Unresolved chip: orange, tooltip "create?" action → calls `docs.create` with that slug
- [ ] Autocomplete: typing `[[te` shows dropdown with docs matching "te"; Enter inserts resolved node
- [x] On `docs.update`: `wikilink-extractor.ts` bulk-upserts `doc_links` for all `[[…]]` nodes in `content_json`
- [x] `wikilink-extractor.ts`: stale links (present in DB but not in current `content_json`) removed in same transaction
- [x] `docs.links.listBacklinks`: returns docs that link TO the current doc (filtered by `link_kind='wikilink'`); org-scoped
- [x] `docs.links.listForwardLinks`: returns all outbound `doc_links` rows for a doc
- [x] Tests: extractor is idempotent — run twice on same `content_json`, `doc_links` count unchanged
- [x] Tests: stale link removal — remove wikilink from doc, save, stale row gone from `doc_links`
- [x] Tests: `listBacklinks` returns correct referring docs after extraction
- [ ] Web: `/docs/<slug>` read view sidebar shows "Referenced by N docs" list; clicking navigates
- [ ] Web: `/docs/<slug>/edit` wikilink chips render; unresolved orange visible
- [ ] CLI: `fulcrum docs backlinks <slug> --json` returns `[{from_doc_id, title, link_kind}]`
- [ ] TUI: `b` key in reader opens backlinks panel; arrow-key navigate, Enter opens doc

## Blocked by
`02-tiptap-svelte-binding-spike.md`, `05-doc-crud-trpc.md`

## Notes / Tech-stack hints
- NodeView must handle cursor entering/leaving chip without corrupting ProseMirror node boundaries
- Autocomplete hook: use TipTap `Suggestion` plugin; call `docs.list` with title fuzzy param; debounce 150 ms
- `link_kind` is extensible — `task_ref` and `run_ref` wikilinks (e.g. `[[task:abc]]`) can reuse the same extractor logic in future slices
