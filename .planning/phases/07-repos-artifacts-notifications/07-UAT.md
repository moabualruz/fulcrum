---
status: complete
phase: 07-repos-artifacts-notifications
source: [07-01-SUMMARY.md, 07-02-SUMMARY.md, 07-03-SUMMARY.md, 07-04-SUMMARY.md, 07-05-SUMMARY.md, 07-06-SUMMARY.md, 07-07-SUMMARY.md, 07-08-SUMMARY.md, 07-09-SUMMARY.md, 07-10-SUMMARY.md]
started: 2026-05-05T21:38:34.000Z
updated: 2026-05-05T21:46:16.000Z
---

## Current Test

number: 1
name: Repo Watcher Sync Queues Work
expected: |
  When a registered repository file is added, changed, or removed, Fulcrum detects the event within about 2 seconds, debounces bursts for the same path, and queues repo.sync.local work instead of running git sync inline.
result: pass
automation: src/tests/phase07-uat-automation.test.ts

## Tests

### 1. Repo Watcher Sync Queues Work
expected: When a registered repository file is added, changed, or removed, Fulcrum detects the event within about 2 seconds, debounces bursts for the same path, and queues repo.sync.local work instead of running git sync inline.
result: pass
evidence: src/repos/__tests__/watcher.sla.test.ts; src/repos/watcher.ts

### 2. LRU Remote Warmup Cron
expected: Fulcrum registers repo.sync.local, repo.sync.remote, and repo.lru.warmup worker metadata; the warmup job selects at most the top five active remote repositories by weighted recent access.
result: pass
evidence: src/repos/__tests__/watcher.sla.test.ts; src/repos/workers/sync-remote.ts

### 3. Multi-Repo Dashboard Rows
expected: Repo list data shows each repo with branch, dirty state, last sync time/status, recent commit, open task count, watcher/sync health, and last sync error when present.
result: pass
evidence: src/repos/__tests__/dashboard.test.ts; src/repos/dashboard.ts

### 4. Repo Detail Slices
expected: Opening a repo detail view exposes Overview, Branches, Commits, Files, and Sync Log slices with latest entries and consistent field names across server data, Web, CLI, and TUI.
result: pass
evidence: src/repos/__tests__/dashboard.test.ts; src/web/src/routes/repos/[id]/page.svelte.test.ts

### 5. Repo REST and tRPC Sync
expected: REST /repos routes delegate to the canonical repos tRPC/service path. Triggering repo sync returns queued/running state and tenant-mismatched status lookups return not found.
result: pass
evidence: src/api/__tests__/repos.api.test.ts; src/trpc/routers/repos.ts

### 6. Repo Surface Parity
expected: Web, CLI, and TUI repo surfaces all use the same repo dashboard contract. CLI supports --json for list/detail/sync, Web renders repo rows and detail tabs, and TUI can trigger queued sync.
result: pass
evidence: src/cli/commands/repos.test.ts; src/tui/screens/repos.test.ts; src/web/src/routes/repos/page.svelte.test.ts; src/web/tests/e2e/phase07-repos-artifacts-notifications.spec.ts

### 7. Artifact Retention Defaults
expected: Artifact retention policies support org/project scope, artifact kind, retention days, keep latest per ref, keep pinned, and enabled state. Project artifacts default to forever; scratch artifacts default to 90 days.
result: pass
evidence: src/artifacts/__tests__/pruner.test.ts; src/db/entities/artifacts/ArtifactRetentionPolicy.ts

### 8. Artifact Pruner Safety
expected: Running the artifact pruner deletes only expired eligible artifacts, skips pinned/latest/disabled/not-expired/cross-org artifacts with clear reasons, and a second run does not delete the same artifact twice.
result: pass
evidence: src/artifacts/__tests__/pruner.test.ts; tests/artifacts/pruner.test.ts

### 9. Artifact Harvest Links Runs and Search
expected: Harvested run artifacts create run-artifact edge links, include digest/source/provenance metadata, and appear in search/index payloads and run detail navigation.
result: pass
evidence: src/artifacts/__tests__/harvest-search.test.ts; src/search/indexers/artifact.ts

### 10. Artifact Preview and Download UX
expected: Artifact list/detail surfaces show digest, MIME, run/source, retention, preview mode, and download action. Unsupported MIME types fall back to download-only behavior.
result: pass
evidence: src/web/src/routes/artifacts/page.svelte.test.ts; src/web/src/routes/artifacts/[id]/page.svelte.test.ts; src/web/tests/e2e/phase07-repos-artifacts-notifications.spec.ts

### 11. Notification Fanout from Repo and Artifact Events
expected: Repo sync completed/failed and artifact.created events enqueue notification fanout once, evaluate persisted rules, respect disabled rules and mutes, and create notification plus channel delivery plan rows.
result: pass
evidence: src/notifications/__tests__/fanout.test.ts; tests/notifications/fanout-worker.test.ts

### 12. Notification Delivery Channels
expected: Delivery workers handle SMTP, webhook, and push channels. Missing SMTP or VAPID config records missing_config rather than logging secrets or crashing.
result: pass
evidence: src/notifications/__tests__/delivery-worker.test.ts; src/notifications/delivery-handlers/push.ts

### 13. Webhook HMAC and Retry Metadata
expected: Webhook deliveries include X-Fulcrum-Event, X-Fulcrum-Delivery, X-Fulcrum-Timestamp, and X-Fulcrum-Signature headers, retry on failures with the default schedule, and persist attempt/status/response metadata.
result: pass
evidence: src/notifications/__tests__/delivery-worker.test.ts; tests/webhooks/dispatcher.test.ts

### 14. Quiet Hours Delivery Hold
expected: Notifications during quiet hours are held with nextAttemptAt, then requeued after the quiet-hours window instead of delivering immediately.
result: pass
evidence: src/notifications/__tests__/delivery-worker.test.ts; src/notifications/quiet-hours.ts

### 15. Notification Inbox and Bell Count
expected: Unread bell count comes from unread user notification rows only. Mark-read and mark-all-read update the count without going below zero.
result: pass
evidence: src/notifications/__tests__/bell-counter.test.ts; src/web/src/routes/inbox/page.svelte.test.ts; tests/notifications/bell-counter-poll.test.ts

### 16. Notification Settings and CLI Controls
expected: Notification settings show channels, rules, delivery timing, and quiet-hours state. CLI notify commands support list/watch/mark-read/mark-all-read/mute with parseable JSON output.
result: pass
evidence: src/web/src/routes/settings/notifications/channels/page.server.test.ts; tests/cli/runs-notify-audit-webhooks.test.ts; src/cli/commands/pillar14-generated.ts

### 17. TUI Notification Controls
expected: The TUI notifications screen shows unread state, supports mark-all-read and mute actions, and refreshes the bell badge from the shared notification contract.
result: pass
evidence: tests/tui/search-notifications.test.ts; src/tui/screens/notifications.ts

### 18. Artifact Authorization and Path Safety
expected: Artifact download/delete only works for artifacts owned by the caller org. Cross-org access returns not found semantics, path traversal is rejected, soft delete is default, and hard delete requires explicit confirmation.
result: pass
evidence: src/artifacts/__tests__/phase07-security.test.ts; src/artifacts/storage.ts

### 19. Webhook Delivery Debug UI
expected: Webhook integration settings show delivery status, attempt count, next/last attempt, response excerpt, error code/message, and resend action without exposing signing secrets or raw payloads.
result: pass
evidence: src/web/src/routes/settings/integrations/webhooks/page.server.test.ts; src/web/src/routes/settings/integrations/webhooks/page.svelte.test.ts

### 20. Phase 7 Cross-Surface Parity Smoke
expected: Repo, artifact, and notification flows expose the same core fields across Web, CLI, and TUI: repo sync health, artifact provenance/retention, notification unseen/read state, and webhook delivery metadata.
result: pass
evidence: src/cli/__tests__/phase07-parity-smoke.test.ts; src/web/tests/e2e/phase07-repos-artifacts-notifications.spec.ts

## Summary

total: 20
passed: 20
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]

## Automation

- unit/component/integration/UAT matrix: src/tests/phase07-uat-automation.test.ts
- browser E2E cycle spec: src/web/tests/e2e/phase07-repos-artifacts-notifications.spec.ts
- focused phase suite: watcher, dashboard, artifact retention/pruning/search/security, repos API/CLI/TUI/Web, notification fanout/delivery/bell/settings, webhook debug UI, parity smoke
