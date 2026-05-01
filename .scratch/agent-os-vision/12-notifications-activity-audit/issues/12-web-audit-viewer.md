---
Status: ready-for-agent
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [06-trpc-audit-procedures.md, 08-audit-retention-cron.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [A4, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Audit log row)
Docs: []
---

# Web /audit: filter toolbar + paginated table + CSV/JSON export + retention policy settings

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Issues T12-18, T12-19)

## What to build
SvelteKit `/audit` route — read-only audit log viewer. Filter toolbar: project select, user select, subject_kind multi-select, verb input, date range picker (default last 7 days); each filter updates URL params and re-fetches. Paginated TanStack Table showing event rows (timestamp, actor, kind, verb, project, payload preview). Export buttons: "Download CSV" and "Download JSON" — calls `audit.export` procedure; streams for <100k rows. Retention policy section at bottom of `/settings/notifications` page: `retain_days` number input + "0 = keep forever" note + save.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: `audit.query` + `audit.export` + `audit.retentionPolicy.*` consumed.
- [ ] Web surface: `/audit` renders filter toolbar; kind+verb+date filter narrows results; paginated table loads correct events; CSV export downloads file with headers+rows; JSON export downloads array; retention setting saves and loads; Playwright: filter by `kind=task`, export CSV, verify file contents.
- [ ] CLI command: N/A (audit CLI in separate CLI slice).
- [ ] TUI screen: N/A (TUI audit in separate slice).
- [ ] Tests: filter toolbar unit tests; `audit.export` CSV headers match event columns; JSON export is valid JSON array; retention setting `retain_days=0` accepted; large export (>100k) → returns `{jobId}`; RED→GREEN.

## Blocked by
- `06-trpc-audit-procedures.md` — `audit.query` + `audit.export`.
- `08-audit-retention-cron.md` — `audit.retentionPolicy.*`.

## Notes / Tech-stack hints
- TanStack Table v8 headless for paginated table; `created_at DESC` default sort.
- CSV export: `Content-Disposition: attachment; filename="audit-<date>.csv"`; streamed from SvelteKit `+server.ts` response.
- Payload preview: truncate to 100 chars with "…" expand button; JSON pretty-print on click.
- Date range picker: shadcn-svelte `DateRangePicker`; default "last 7 days" = `{ from: subDays(today, 7), to: today }`.
