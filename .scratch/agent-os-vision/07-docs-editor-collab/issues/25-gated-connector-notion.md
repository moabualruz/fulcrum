---
Status: implemented
Triage: AFK
ImplRuntime: claude
Pillar: 07-docs-editor-collab
Blocked-by: [01-docs-schema-foundation.md, 05-doc-crud-trpc.md, 24-gated-connector-confluence.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C1, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: [https://developers.notion.com/reference/intro]
---

# Gated: connector-notion — one-way import from Notion REST API → docs rows

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-51, P7-52; gated features table)

## What to build
Feature-flagged (`FULCRUM_FEATURES=connector-notion`) ETL pipeline. Graphile-worker job
`notion-sync` (enqueued via `fulcrum docs connector sync notion`):
1. Fetches pages recursively from Notion REST API (`/v1/blocks/<id>/children` for nested
   blocks; top-level from `NOTION_DATABASE_ID` or page list).
2. Converts Notion block JSON → markdown (custom converter; Notion blocks map 1:1 to
   markdown nodes).
3. Upserts `docs` rows with `external_id='notion:<page_id>'`, `doc_type='wiki'`, `scope='global'`.
4. Writes `connector_sync_log` row (table created in slice 24). Idempotent by `external_id`.

## Acceptance criteria
- [ ] `FULCRUM_FEATURES=connector-notion` OFF: `fulcrum docs connector sync notion` returns feature-disabled error
- [ ] Flag ON: job enqueued → `{job_id}` in `--json` output
- [ ] Job: fetches pages from mock Notion API (test uses mock server); handles pagination (`has_more + next_cursor`)
- [ ] Recursive block fetch: nested child pages fetched recursively; parent-child `parent_id` relationship preserved in `docs` rows
- [ ] Markdown conversion: Notion heading_1/2/3 → `#/##/###`; paragraph → plain text; bulleted/numbered list → `-`/`1.`; code block with language; toggle (collapsible) → blockquote; image → `![alt](url)`
- [ ] `external_id = 'notion:<page_id>'`; idempotent re-run updates rows, no duplicates
- [ ] `connector_sync_log` row written per run (table from slice 24)
- [ ] Auth: `NOTION_API_KEY` env var; documented in `fulcrum doctor --json` output
- [ ] Tests: mock API returns 3 pages with 2 nested children → 5 `docs` rows with correct `parent_id` chain
- [ ] Tests: idempotency — same mock response on re-run → count unchanged; `updated_at` refreshed
- [ ] Tests: Notion API 401 → `connector_sync_log.errors_json` contains error; job fails gracefully
- [ ] Web: Settings → Connectors shows Notion sync status and last-run log
- [ ] CLI: `fulcrum docs connector sync notion --json` + `--status --json` polling
- [ ] TUI: no dedicated surface; CLI used

## Blocked by
`01-docs-schema-foundation.md`, `05-doc-crud-trpc.md`, `24-gated-connector-confluence.md` (shares `connector_sync_log` table)

## Notes / Tech-stack hints
- Notion API rate limit: 3 req/s; add a `p-throttle` limiter in the job worker
- Notion blocks do not map perfectly to markdown — rich text with colors/annotations should be stripped to plain text for `body_md`; store original Notion JSON in `docs.frontmatter.notion_raw` for fidelity
- Recursive fetch depth guard: max 10 levels to prevent infinite loop on circular Notion page references
