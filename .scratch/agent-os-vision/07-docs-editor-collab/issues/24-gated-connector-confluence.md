---
Status: implemented
Triage: AFK
ImplRuntime: claude
Pillar: 07-docs-editor-collab
Blocked-by: [01-docs-schema-foundation.md, 05-doc-crud-trpc.md, 04-doc-template-seeds.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C1, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: [https://developer.atlassian.com/cloud/confluence/rest/v2/intro/]
---

# Gated: connector-confluence — one-way import from Confluence Cloud REST → docs rows

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-50, P7-52; gated features table)

## What to build
Feature-flagged (`FULCRUM_FEATURES=connector-confluence`) ETL pipeline. Graphile-worker job
`confluence-sync` (enqueued via `fulcrum docs connector sync confluence`):
1. Fetches pages from Confluence Cloud REST v2 API (paginated, `CQL` query scoped to space).
2. Converts Confluence storage format → markdown via remark pipeline.
3. Upserts `docs` rows with `external_id='confluence:<page_id>'`, `doc_type='wiki'`, `scope='global'`.
4. Writes `connector_sync_log` row per run: `{connector, started_at, finished_at, pages_synced, errors}`.
Idempotent: re-run updates existing rows by `external_id`; does not duplicate.
`connector_sync_log` table must be created by this slice's migration.

## Acceptance criteria
- [ ] `FULCRUM_FEATURES=connector-confluence` OFF: no import; `fulcrum docs connector sync confluence` returns feature-disabled error
- [ ] Flag ON: job enqueued via `fulcrum docs connector sync confluence --json` → returns `{job_id}`
- [ ] Job runs: fetches pages from mock Confluence API (test uses mock server); upserts `docs` rows with correct `external_id`
- [ ] `connector_sync_log` table: migration creates `(id, connector, org_id, started_at, finished_at, pages_synced, errors_json)`
- [ ] Log row written per run: success case shows `pages_synced > 0`, `errors_json = []`; failure case captures error message
- [ ] Idempotent re-run: run twice with same mock API response → `docs` row count unchanged; `updated_at` refreshed
- [ ] `external_id` set: `docs.external_id = 'confluence:<page_id>'`; `UNIQUE` constraint enforced
- [ ] Markdown conversion: Confluence `<h1>` → `# heading`; `<p>` → paragraph; `<code>` → fenced code block; links preserved
- [ ] Auth: `CONFLUENCE_API_TOKEN` + `CONFLUENCE_BASE_URL` env vars; documented in `fulcrum doctor --json` output
- [ ] Tests: mock Confluence API returns 3 pages → 3 `docs` rows with correct `external_id` and `body_md`
- [ ] Tests: idempotency — mock returns same 3 pages on re-run → row count still 3; `updated_at` advanced
- [ ] Tests: API error (401) → `connector_sync_log.errors_json` contains error; job fails gracefully
- [ ] Web: no dedicated UI surface (Pillar 11 search surfaces imported docs); `connector_sync_log` viewable in Settings → Connectors
- [ ] CLI: `fulcrum docs connector sync confluence --json` + `fulcrum docs connector sync confluence --status --json` (poll job)
- [ ] TUI: no dedicated surface; CLI used for connector management

## Blocked by
`01-docs-schema-foundation.md`, `05-doc-crud-trpc.md`, `04-doc-template-seeds.md`

## Notes / Tech-stack hints
- Confluence REST v2: `GET /wiki/rest/api/content?type=page&spaceKey=MYSPACE&expand=body.storage&limit=50`; paginated via `start` param
- remark-parse + remark-html is not the right tool for Confluence storage format (XHTML) → use `rehype-parse` to parse Confluence XHTML, then `rehype-remark` to convert to mdast, then `remark-stringify` to produce markdown
- `connector_sync_log` is shared between `connector-confluence` and `connector-notion`; create table in this slice's migration if not yet present
