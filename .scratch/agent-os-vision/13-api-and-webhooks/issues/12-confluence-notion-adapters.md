---
Status: implemented
Triage: AFK
Pillar: api-and-webhooks
Blocked-by: [13/issues/09-connector-framework-interface.md]
PRD: .scratch/agent-os-vision/prds/13-api-and-webhooks.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [Q-flag-granularity, C1, C5, Q-cross-cut]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("API / webhooks / integrations" row)
Docs: [https://developer.atlassian.com/cloud/confluence/rest/v1/, https://developers.notion.com/reference/intro]
---

## Parent

Pillar 13 — API Surface + Webhooks + Connector Framework

## What to build

Two doc-import adapters (both one-way pull into Fulcrum):

**Confluence** (`connector-confluence`): pull pages from a Confluence Space into Fulcrum docs with `doc_type='wiki'`. Confluence Cloud REST API. Env: `CONFLUENCE_URL`, `CONFLUENCE_TOKEN`, `CONFLUENCE_SPACE_KEY`. Body: Confluence storage format → TipTap JSON via `confluence-to-tiptap` transformer (or remark pipeline). `healthCheck()` pings space endpoint.

**Notion** (`connector-notion`): pull Notion database rows → Fulcrum tasks; pull Notion pages → Fulcrum docs. Notion API v1. Env: `NOTION_TOKEN`, `NOTION_DATABASE_ID`. Database rows: title → task title; status property → Fulcrum status; date property → due_date. Pages: body → TipTap JSON.

Both adapters: one-way; no push. `connector_runs` recorded. Idempotent by `external_id`.

- **Web**: `/settings/connectors/confluence` and `/settings/connectors/notion` config + run history.
- **CLI**: `fulcrum connectors sync confluence --json`, `fulcrum connectors sync notion --json`.
- **TUI**: Settings → Connectors cards, `s` sync.

## Acceptance criteria

- [x] Confluence `pull()` against mocked API: Fulcrum docs created with `doc_type='wiki'`; `scope='project'` if project connector; TipTap JSON round-trips.
- [x] Notion `pull()` against mocked API: database rows → tasks with correct field mapping; pages → docs.
- [x] Both adapters idempotent: re-pull with same source data → no duplicate rows.
- [x] `healthCheck()` passes with valid mock credentials; `auth_failed` on 401.
- [x] Both flags tested: OFF → `FeatureDisabledError`; ON → sync completes.
- [ ] Web, CLI, TUI all show `connector_runs` run log for both connectors.

## Blocked by

- 13/issues/09-connector-framework-interface.md

## Notes

P13.29–P13.30 (partial) maps to this slice. TipTap JSON conversion is a best-effort approximation; exact fidelity gated by Confluence storage format complexity.
