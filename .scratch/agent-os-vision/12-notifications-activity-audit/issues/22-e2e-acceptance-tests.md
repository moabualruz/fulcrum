---
Status: ready-for-agent
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [10-web-inbox-and-activity.md, 11-web-notification-settings.md, 12-web-audit-viewer.md, 13-cli-notify-commands.md, 14-cli-audit-commands.md, 15-tui-inbox-and-audit.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [Q26, A4, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row; Audit log row)
Docs: []
---

# Playwright e2e + three-surface parity + performance acceptance tests

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Acceptance criteria section)

## What to build
Final acceptance slice. Playwright e2e covering the PRD's acceptance criteria verbatim. Three-surface parity integration tests. Performance gate checks. Doctor integration: reports notification rule count, delivery failure rate, pending fan-out jobs, retention policy, oldest event timestamp.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: N/A (tests + doctor only).
- [ ] Web surface: Playwright: (1) assign task → bell increments; (2) click bell → marks read; (3) mark-all-read → bell=0; (4) create `doc/created/in-app` rule → fires on new doc → new notification; (5) disable rule → new doc → no notification; (6) mute task → no notification; (7) quiet hours 22:00–08:00 → held → resent after; (8) audit filter `kind=task verb=status_changed` + export CSV; (9) `retain_days=30` cron deletes older events.
- [ ] CLI command: `fulcrum notify list --unread --json` returns notifications created in e2e; `fulcrum audit query --kind task --json`; `fulcrum audit export --format csv --output ./test-audit.csv` file written; `fulcrum notify rules create/list/delete` round-trips.
- [ ] TUI screen: TUI smoke: inbox `R`/`M`/`Enter`; activity feed filter chips; audit panel `E` export; rules CRUD; quiet-hours save.
- [ ] Tests: performance: rule eval 1000 rules × 100 users per event <50ms; `/inbox` cold load <150ms; bell count query <20ms; audit export 10k rows CSV <2s; dedup: same event + rule → one `user_notifications` row; default rules: 4 present on user create, each fires, no duplicates; RED→GREEN.

## Blocked by
All Web, CLI, TUI surface slices (10–15).

## Notes / Tech-stack hints
- Performance benchmarks: add to `bun run ci` as `notify:bench` stage with `hyperfine`; assert p50 not p95 for CI stability.
- Three-surface parity: assign task via CLI → Web inbox shows notification → TUI inbox shows notification.
- Doctor integration: add to `fulcrum doctor --json` output: `notifications.pendingFanoutJobs`, `notifications.deliveryFailureRate24h`, `notifications.ruleCount`, `audit.retentionDays`, `audit.oldestEventDate`.
- Quiet-hours e2e: mock `Date.now()` to simulate time inside/outside window; or use test org with always-active quiet hours.
