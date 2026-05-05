# Phase 7 Research: Repos + Artifacts + Notifications

**Date:** 2026-05-05
**Purpose:** Required research before Phase 7 implementation decisions.

## Competitive/platform patterns

### Repository dashboards
- GitHub/GitLab center repo views on branch state, recent commits, files, and actions/jobs context. Fulcrum should match that information hierarchy: repo list summary -> repo detail tabs for branches, commits, files, sync status, linked tasks.
- GitLab project/system webhooks show broad event routing pattern: event filters, headers, retries/resend, SSL verification controls. Fulcrum outbound webhooks should use explicit event filters, delivery records, retry state, and HMAC verification.

### Artifacts
- GitHub Actions artifacts expose per-run artifact lists, download/delete actions, digest/provenance, expiration date, and configurable retention. Default retention is 90 days for Actions artifacts, and retention can be customized per artifact upload.
- Fulcrum should mirror this pattern locally: artifact detail shows run link, digest/checksum, size/mime, preview/download, retention policy, expiration/prune status.

### Notifications
- Novu's architecture splits workflows, subscribers, and channel delivery steps across in-app/email/push/chat/SMS. Fulcrum should not import Novu wholesale for v1, but should copy the workflow mental model: event -> rule match -> subscriber/user -> channel deliveries -> delivery attempts.
- Novu Push Webhook uses endpoint URL + HMAC secret. Fulcrum webhook/push delivery should sign payloads with HMAC-SHA256 and expose enough metadata for consumers to verify origin.
- Sentry splits notification triggers from routing/alert actions and gives user-level notification settings. Fulcrum should separate event detection/fanout from user notification preferences, quiet hours, and channel delivery.

## Dependency/library research

### Keep/reuse existing code first
- Existing `src/repos/git.ts`, `src/repos/watcher.ts`, `src/repos/workers/sync-local.ts`, `src/repos/workers/sync-remote.ts` already provide Git command and watcher seams.
- Existing `src/artifacts/pruner.ts`, `src/artifacts/harvest.ts`, `src/artifacts/storage.ts`, `src/artifacts/preview-download.ts`, `src/search/indexers/artifact.ts` already cover most artifact lifecycle plumbing.
- Existing `src/notifications/rule-engine.ts`, `src/notifications/fanout-worker.ts`, `src/notifications/realtime-bell.ts`, `src/webhooks/dispatcher.ts`, notification entities, and TUI screens are the natural implementation base.

### Exact packages to consider
- `nodemailer` for SMTP delivery. Mature Node SMTP client, avoids custom SMTP code. Use only behind notification delivery worker; credentials via existing secrets layer.
- `web-push` for browser push delivery if Phase 7 implements real Web Push. Uses VAPID keys and Push API payload encryption; avoids custom push protocol.
- `chokidar` only if current `node:fs.watch` watcher cannot satisfy 2s sync reliably across macOS/Linux. Default recommendation: verify existing watcher first; add `chokidar` only if tests prove platform flakiness.
- No Novu dependency for v1. Fulcrum already has local-first notification entities/workers; adopting Novu would duplicate persistence and add server/runtime scope. Copy patterns, not platform.

## Codebase integration map

### Event producers
- Repo registration/archive/sync: `src/trpc/routers/repos.ts`, `src/repos/register.ts`, `src/repos/workers/sync-local.ts`, `src/repos/workers/sync-remote.ts`.
- Artifact harvest/upload/prune: `src/orchestration/artifact-harvest-hook.ts`, `src/artifacts/harvest.ts`, `src/artifacts/manual-upload.ts`, `src/artifacts/pruner.ts`.
- Notification fanout: `src/notifications/rule-engine.ts`, `src/notifications/fanout-worker.ts`.
- Webhook dispatch: `src/webhooks/dispatcher.ts`.

### Event consumers
- Search indexing: `src/search/indexers/repo.ts`, `src/search/indexers/artifact.ts`, Phase 6 `SearchDocument` query/index pipeline.
- Bell updates: `src/notifications/realtime-bell.ts`, `src/notifications/bell-counter-poll.ts`, `src/web/src/routes/+layout.svelte`, `src/tui/widgets/StatusBar.ts`.
- Delivery workers: new/expanded workers under `src/notifications/` process `NotificationDelivery` rows for `email`, `webhook`, and `push`.
- Retention/pruning: `src/artifacts/pruner.ts` and graphile-worker/cron registration.

### Must-not-break files
- `src/trpc/router.ts` and `src/server/trpc/routers/` mounts: three-surface parity depends on shared tRPC.
- `src/trpc/routers/repos.ts`, `src/server/trpc/routers/artifacts.ts`, `src/trpc/routers/notifications.ts`, `src/trpc/routers/webhooks.ts`.
- `src/db/entities/repos/*`, `src/db/entities/artifacts/*`, `src/db/entities/notifications/*`, `src/db/entities/sandbox/Artifact.ts`, `src/db/entities/sandbox/Edge.ts`.
- `src/orchestration/artifact-harvest-hook.ts`: Phase 3 agent dispatch artifact path.
- `src/search/indexers/artifact.ts` and `src/search/indexers/repo.ts`: Phase 6 search integration.
- `src/cli/commands/repos.ts`, `src/cli/artifacts.ts`, `src/cli/generated/artifacts.ts`, notification/webhook generated commands.
- `src/tui/screens/repos.ts`, `src/tui/screens/artifacts.ts`, `src/tui/screens/notifications.ts`, `src/tui/screens/notification-rules.ts`.

### Cross-phase dependencies
- Phase 2 graphile-worker/job registry required for on-demand repo sync, LRU warm-cache cron, artifact pruner cron, delivery workers, and quiet-hours retry.
- Phase 3 agent dispatch/artifact harvest required for run -> artifact linkage.
- Phase 6 SearchDocument/search endpoint required for artifact/repo search indexing and artifact search verification.
- Phase 5 task watchers/comments feed notification sources.

## Sources

- GitHub Docs: `https://docs.github.com/en/actions/managing-workflow-runs/removing-workflow-artifacts`
- GitHub Docs: `https://docs.github.com/actions/guides/storing-workflow-data-as-artifacts`
- GitLab Docs: `https://docs.gitlab.com/user/project/integrations/webhooks/`
- GitLab Docs: `https://docs.gitlab.com/administration/system_hooks/`
- Novu Docs: `https://docs.novu.co/platform/how-novu-works`
- Novu Docs: `https://docs.novu.co/platform/integrations/push/push-webhook`
- Sentry Docs: `https://docs.sentry.io/hosted/learn/notifications/`
- Sentry API Docs: `https://docs.sentry.io/api/alerts/`

---

## Deep Competitive Addendum (2026-05-05)

See `.planning/phases/07-repos-artifacts-notifications/07-RESEARCH-COMPETITIVE-DEEPDIVE.md` for detailed competitive and dependency research.

### Decisions upgraded by deep research

- Artifact lifecycle must include provenance/integrity fields (`sha256`, `sourcePath`, `harvestedAt`, `producerKind`, `runId`, `edgeId`) and GitHub-style attestation-ready metadata, not just preview/download.
- Retention policy must support GitLab-style exceptions: `keep_latest_per_ref`, pinned artifacts, forever project default, scratch 90d default.
- Notification feed must distinguish `unseen`, `seen`, `read`, and `archived`; bell count must not be raw event count.
- Notification delivery must support `immediate`, `digest`, and `delayed` rule modes to prevent notification fatigue.
- Webhook delivery must expose Linear-style retry schedule: immediate, +1m, +1h, +6h, then permanent failure.
- Webhook signatures use exact headers: `X-Fulcrum-Event`, `X-Fulcrum-Delivery`, `X-Fulcrum-Timestamp`, `X-Fulcrum-Signature`.
- Dependency recommendations: adopt `nodemailer@8.0.7`; adopt `web-push@3.6.7` if real push implemented; conditionally adopt `chokidar@5.0.0`; consider `file-type@22.0.1` and `mime-types@3.0.2` for safe preview/download; defer `@novu/*`, `@octokit/rest`, `isomorphic-git`, and `ntfy` runtime adoption.
