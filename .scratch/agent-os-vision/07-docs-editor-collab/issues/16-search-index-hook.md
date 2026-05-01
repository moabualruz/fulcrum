---
Status: ready-for-agent
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [01-docs-schema-foundation.md, 05-doc-crud-trpc.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [Q27, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: []
---

# Search indexer hook — search_documents upsert on every doc save

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-23)

## What to build
`src/docs/search-indexer.ts` — called from `docs.update` (and `docs.create` for initial
index). Strips markdown from `body_md` to plain text, truncates to 10 kB. Upserts a
`search_documents` row with: `kind='doc'`, `entity_id=doc.id`, `org_id`, `project_id`,
`title`, `body_text` (stripped), `doc_type`, `tags` (from frontmatter if present),
`author_id`, `updated_at`. Archive operation: sets `search_documents.archived=true` for
the entity (Pillar 11 filters on this). Delete: removes the `search_documents` row.
Performance target: upsert < 50 ms (in-process PGlite).

## Acceptance criteria
- [ ] `search-indexer.ts` exported as a pure async function `indexDoc(doc: DocRow): Promise<void>`
- [ ] Called from `docs.create` (initial index) and `docs.update` (re-index) — not inlined, imported
- [ ] `search_documents` row upserted: `kind='doc'`, all required fields populated; `ON CONFLICT (entity_id) DO UPDATE`
- [ ] `body_text` is stripped of markdown syntax (no `**`, `#`, `[[…]]`, etc.); max 10 kB
- [ ] `tags` array populated from `doc.frontmatter.tags` if present; empty array otherwise
- [ ] Archive: `docs.delete` soft → `search_documents.archived = true` for that entity_id
- [ ] Hard delete: `docs.delete` hard → `search_documents` row deleted
- [ ] Performance: upsert completes < 50 ms on PGlite with 10 kB body_text (measured in test)
- [ ] Tests: indexDoc with ADR doc → `search_documents` row present with correct `doc_type='adr'`, `body_text` stripped
- [ ] Tests: update doc title → `search_documents.title` updated on next indexDoc call
- [ ] Tests: archive → `search_documents.archived=true`; hard delete → row absent
- [ ] Tests: upsert idempotency — call indexDoc twice with same content, row count unchanged
- [ ] Web: verified via test-db direct query (not UI — Pillar 11 owns search UI)
- [ ] CLI: `fulcrum docs show <slug> --json` `indexed_at` field present after first save
- [ ] TUI: no direct surface — indexer runs server-side; TUI confirms via `fulcrum docs show` output

## Blocked by
`01-docs-schema-foundation.md`, `05-doc-crud-trpc.md`

## Notes / Tech-stack hints
- Use `remark-strip-markdown` or a lightweight regex pass to strip markdown — full remark pipeline may be too heavy in the hot save path; benchmark both
- `search_documents` table owned by Pillar 11; this slice only writes to it — Pillar 11 owns the schema and indexes
- Pillar 3 (Memory) subscribes to `doc.saved` events; this slice emits the event after successful upsert
