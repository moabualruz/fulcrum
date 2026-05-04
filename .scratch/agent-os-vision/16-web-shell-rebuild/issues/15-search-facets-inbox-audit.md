---
Status: completed
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/03-cmd-k-palette.md, 11-search-and-discovery/issues/01-search-documents-and-fts.md, 12-notifications-activity-audit/issues/01-notification-rules-and-feed.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q27, Q26, A4, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (rows: "Search facets / saved searches", "Notifications / activity feed", "Audit log")
Docs: https://kit.svelte.dev/docs
---

# Search (/search), Inbox (/inbox), Audit log (/audit)

## What to build

`/search`: full-page search with left-rail facet panel (kind, project, sprint, doc_type, status, assignee, tags, date range) and main result list (kind-grouped). Result cards show title, kind icon, project badge, snippet, date. Saved search: "Save this search" button → `saved_searches` dialog → loads persisted filter on revisit. `/inbox`: two tabs — "For you" (notification feed from `notification_deliveries` matching user's rules) and "My activity" (events actor'd by this user). Bell overlay shows unread count; mark all read. `/audit`: filter toolbar (actor, event kind, date range) + paginated table + CSV/JSON export button (calls `audit.export` tRPC).

Cuts through: `search.query(text, facets)` tRPC → FTS over `search_documents` → grouped results rendered → facet chip selected → results narrow → save search → `saved_searches` row created.

## Acceptance criteria

- [ ] Search: FTS returns results across ≥3 kinds (tasks, docs, memories) in one query; facet `kind:doc` narrows results correctly; date range filter works.
- [ ] Saved search: save → page refresh → filter restored; saved search list in left rail shows name.
- [ ] Inbox "For you": notification cards show event type + subject + timestamp; "Mark all read" clears badge; tab switch doesn't re-fetch.
- [ ] Inbox "My activity": events where `actor=userId` listed; pagination works.
- [ ] Audit: filter by `kind=task` → only task events; export CSV → file download; export JSON → file download.
- [ ] Playwright: search for seeded task → result appears → click → task detail opens; inbox notification → mark read.
- [ ] CLI: `fulcrum search --json`; `fulcrum notifications list --json`.
- [ ] TUI: search pane + notification pane (Pillar 15).

## Blocked by

- Issue 03 (cmd+K palette) — search UI pattern established.
- Pillar 11 issue 01 (search documents + FTS) — `search.query` tRPC.
- Pillar 12 issue 01 (notification rules + feed) — `notify.*` tRPC.
