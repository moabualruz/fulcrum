# Phase 7 Competitive Deep Dive: Repos + Artifacts + Notifications

**Date:** 2026-05-05
**Scope:** Repository dashboards, artifact lifecycle, notification workflows, delivery channels, dependency choices.

## Executive summary

Phase 7 must compete with three mature product categories at once:

- **GitHub/GitLab repo + CI artifact UX:** operational repo state, CI/run-linked artifacts, retention, preview, digest/provenance, downloadable archives, deletion/pruning controls.
- **Linear/Sentry notification UX:** personal inbox, subscription/watch semantics, alert/rule routing, notification preferences, digests/delays to avoid notification fatigue, webhook delivery debug.
- **Novu/Knock/Courier notification infrastructure:** workflow runs, channel routing, in-app feed statuses, preferences, digest/batching, delivery attempts, channel provider abstraction.

Strong Phase 7 plan should not stop at “list repos/artifacts/notifications.” It should make Fulcrum a local-first operational console where every repo sync, artifact, and notification has provenance, delivery state, retry/debug state, and three-surface parity.

## Competitive matrix

| Area | GitHub | GitLab | Linear | Sentry | Novu/Knock/Courier | Fulcrum Phase 7 target |
|---|---|---|---|---|---|---|
| Repo dashboard | repo overview, branches, commits, checks | project overview, branches, commits, pipelines | issue-centric GitHub/Slack links | release/commit association | n/a | repo list/detail with branch health, dirty/diverged status, last sync, recent commits, open tasks |
| Artifact lifecycle | workflow artifacts, retention, attestations/digests | job artifacts, `expire_in`, keep latest, browser preview | issue attachments only | release artifacts/debug files | n/a | run-linked artifact detail with digest, retention state, preview/download, prune audit |
| Artifact provenance | attestations API + digest subjects | job/pipeline provenance | limited | release association | n/a | local provenance fields: runId, producer, checksum, source path, edge row, optional attestation metadata |
| Notification inbox | GitHub notifications/subscriptions | todos/notifications | Inbox with subscriptions and urgency/digests | issue alerts + member notification prefs | in-app feeds with unread/read/seen/archive | Notification feed with unread/seen/read/archive states, source event, actor, subject, priority |
| Notification preferences | watches/subscriptions | project/group notification levels | issue/team subscriptions + email digest delays | per-project/user notification routing | preference center + channel/frequency | per-rule + per-channel preferences, quiet hours, critical rules non-disableable |
| Digest/batching | email digests | limited | email digest delays if inbox unread | alert grouping/routing | first-class digest/batching/delay | event grouping window to avoid notification storms; per-rule digest mode optional |
| Webhook delivery | retries, signatures, event payloads | event filters, SSL verify, resend/debug | webhook retry: 1m, 1h, 6h | alert webhook rules and integration webhooks | webhook providers/channels | HMAC-SHA256 signed POST, event filters, attempt history, response excerpt, retry schedule, resend |
| Push delivery | mobile/web notifications | app/browser notifications | desktop/mobile/push | email/Slack/etc | Web Push/providers | `web-push` with VAPID config, degraded state when absent |

## State-of-the-art patterns to copy

### 1. Artifact detail must include provenance and integrity, not just file metadata

Minimum competitive artifact detail fields:

- `id`, `orgId`, `projectId`, `runId`, `producerKind`, `producerId`
- `title`, `kind`, `mime`, `sizeBytes`, `bodyPath`
- `sha256`, `createdAt`, `updatedAt`
- `sourcePath`, `sourceGlob`, `harvestedAt`, `harvestRunAttempt`
- `retentionPolicyId`, `expiresAt`, `keepLatest`, `prunedAt`, `pruneReason`
- `previewKind`: `image` | `text` | `markdown` | `code` | `unsupported`
- `edgeId` linking run -> artifact and artifact -> run
- optional future `attestation`: `{ predicateType, subjectDigest, issuer, signedAt }`

GitHub artifact attestations are important because they connect artifacts to signed provenance and digest subjects. Fulcrum v1 does not need full Sigstore/SLSA implementation, but it should store checksum/provenance fields now so later attestation support does not require schema churn.

### 2. Retention needs GitLab-style exceptions, not only `retention_days`

GitLab has artifact expiry plus “keep latest successful pipeline artifacts” semantics. Fulcrum equivalent:

- `retention_days`: integer or null for forever
- `scope`: org/project/kind
- `keep_latest_per_ref`: boolean, for repo/run artifacts tied to branch/ref
- `keep_pinned`: boolean, user-pinned artifacts never pruned
- `scratch_default_days`: 90 by requirement
- `project_default_days`: null/forever by requirement
- pruner never deletes if artifact is latest kept for ref, pinned, or legal hold/future audit flag

### 3. Notification inbox needs statuses beyond boolean read/unread

Knock separates `unseen`, `seen`, `read`; archived can be filtered. Fulcrum should model:

- `unseen`: user has not opened feed since notification arrived
- `seen`: feed rendered notification
- `read`: user explicitly marked/read/interacted
- `archived`: removed from default inbox but retained

Bell count should be configurable but default to `unseen + unread`, not raw event count.

### 4. Notification workflow needs digest/delay, not just immediate delivery

Novu and Knock use workflows with delay, digest, batching, branching. Fulcrum v1 can keep implementation simple:

- `NotificationRule.deliveryMode`: `immediate` | `digest` | `delayed`
- `digestWindowSeconds`: default 300 for noisy repo/artifact events
- `delaySeconds`: optional for email/push after in-app is created
- if user reads in-app before delay expires, skip lower-priority email/push delivery
- critical/security notifications bypass digest and quiet hours

This is the difference between competitive and noisy. Without digest/delay, Phase 7 will create notification fatigue the first time repo sync emits many file/artifact events.

### 5. Delivery workers need provider abstraction and attempt records

Mature products treat delivery attempts as first-class. Minimum `NotificationDelivery`/`WebhookDelivery` fields:

- `id`, `orgId`, `notificationId`, `ruleId`, `channel`
- `provider`: `smtp` | `webhook` | `web-push`
- `status`: `pending` | `held_quiet_hours` | `scheduled` | `sending` | `sent` | `retryable_failed` | `permanent_failed` | `canceled`
- `attemptCount`, `maxAttempts`, `nextAttemptAt`, `lastAttemptAt`
- `requestHeadersRedacted`, `responseStatus`, `responseHeadersRedacted`, `responseBodyExcerpt`
- `errorCode`, `errorMessage`, `durationMs`
- `idempotencyKey`

Webhook retries should follow a visible schedule. Linear retries webhooks with backoff at roughly 1 minute, 1 hour, then 6 hours. Fulcrum should use this exact default unless project config overrides it.

### 6. Repo integration needs Git state quality metrics

Repo dashboard should show more than “exists.” Competitive operational fields:

- `defaultBranch`, `currentBranch`, `ahead`, `behind`, `dirty`, `untrackedCount`, `stagedCount`, `conflictedCount`
- `lastLocalCommitSha`, `lastRemoteCommitSha`, `lastSyncAt`, `lastSyncStatus`, `lastSyncError`
- `watcherStatus`: `active` | `degraded` | `stopped`
- `syncLatencyMs`, `lastChangeDetectedAt`, `lastChangeSyncedAt`
- `openTaskCount`, `activeRunCount`, `latestArtifactCount`

## Dependency decisions

| Need | Candidate | Version checked | License | Decision | Rationale |
|---|---:|---:|---|---|---|
| SMTP email | `nodemailer` | 8.0.7 | MIT-0 | Adopt | Mature SMTP client; avoids custom SMTP; isolate behind `SmtpDeliveryProvider` |
| Web Push | `web-push` | 3.6.7 | MPL-2.0 | Adopt if real push required in NTF-04 | Implements VAPID/encryption; MPL acceptable but note copyleft-file obligations; provider-gated by VAPID config |
| File watcher fallback | `chokidar` | 5.0.0 | MIT | Conditional | Use only if current `fs.watch` fails 2s SLA tests; v5 is ESM/modern and cross-platform |
| Git operations | existing `src/repos/git.ts` shell wrapper | n/a | n/a | Keep for v1 | Already implemented; avoids dual git abstraction. Consider `simple-git@3.36.0` only if command parsing becomes fragile |
| Pure JS Git | `isomorphic-git` | 1.37.6 | MIT | Defer | Useful for browser/worker portability, but switching now risks large rewrite |
| GitHub API | `@octokit/rest` | 22.0.1 | MIT | Defer | Phase 7 repo sync is local/remote git, not GitHub-specific SaaS connector |
| MIME sniffing | `file-type` | 22.0.1 | MIT | Adopt for upload/preview sniffing if existing mime detection insufficient | Prevents trusting extension/user MIME for preview decisions |
| MIME mapping | `mime-types` | 3.0.2 | MIT | Adopt if not already available | Lightweight content-type lookup for preview/download headers |
| Notification platform | `@novu/*`, Knock, Courier | SaaS/platform | mixed | Do not adopt | Fulcrum already has local-first entities/rules/delivery; copy workflow concepts, avoid external runtime |
| Push server | `ntfy` | external/self-host | Apache/GPL ecosystem | Defer/gated connector | Good self-hosted push option later; Phase 7 should implement Web Push provider first |
| Queue/cron | graphile-worker | existing | MIT | Use | Existing project dependency/requirement; cron jobs and task queue fit retention/delivery/sync |

## Exact implementation patterns to require in plans

### Repo sync event shape

```ts
type RepoSyncCompletedEvent = {
  id: string;
  eventType: "repo.sync.completed" | "repo.sync.failed";
  orgId: string;
  projectId: string | null;
  subjectKind: "repo";
  subjectId: string;
  actorUserId: string | null;
  payload: {
    repoId: string;
    branch: string | null;
    ahead: number;
    behind: number;
    dirty: boolean;
    commitCount: number;
    syncLatencyMs: number;
  };
};
```

### Artifact created event shape

```ts
type ArtifactCreatedEvent = {
  id: string;
  eventType: "artifact.created";
  orgId: string;
  projectId: string | null;
  subjectKind: "artifact";
  subjectId: string;
  actorUserId: string | null;
  payload: {
    artifactId: string;
    runId: string | null;
    kind: string;
    mime: string | null;
    sizeBytes: number | null;
    sha256: string | null;
    previewKind: "image" | "text" | "markdown" | "code" | "unsupported";
  };
};
```

### Webhook signature headers

Use these exact headers for v1:

- `X-Fulcrum-Event`: event type
- `X-Fulcrum-Delivery`: delivery id
- `X-Fulcrum-Timestamp`: Unix seconds
- `X-Fulcrum-Signature`: `sha256=<hex_hmac_sha256(timestamp + "." + rawBody)>`

Replay protection: receiver should reject timestamps older than 5 minutes; Fulcrum docs/UI should show signing secret masked and last signature timestamp.

### Default webhook retry schedule

- attempt 1: immediate
- attempt 2: +1 minute
- attempt 3: +1 hour
- attempt 4: +6 hours
- then permanent failure unless rule-specific max attempts overrides

### Notification preference hierarchy

1. Critical system/security rule: cannot be disabled; bypass digest; may bypass quiet hours only if marked critical.
2. User per-rule preference: enabled/disabled, channels.
3. User quiet hours: hold non-critical external deliveries.
4. Channel provider availability: degraded if missing config.
5. Rule-level delivery mode: immediate/digest/delayed.

## Sources

- GitHub artifact actions/attest docs: https://github.com/actions/attest
- GitLab job artifacts docs: https://docs.gitlab.com/ci/jobs/job_artifacts/
- GitLab CI YAML artifacts docs: https://docs.gitlab.com/ee/ci/yaml/
- Linear notifications docs: https://linear.app/docs/notifications
- Linear webhooks docs: https://linear.app/developers/webhooks
- Sentry alerts API docs: https://docs.sentry.io/api/alerts/
- Sentry notifications docs: https://docs.sentry.io/hosted/learn/notifications/
- Knock feeds docs: https://docs.knock.app/in-app-ui/feeds/overview
- Knock in-app notifications docs: https://docs.knock.app/integrations/in-app/knock
- Knock workflow docs: https://docs.knock.app/concepts/workflows
- Novu workflow digest/delay docs: https://docs.novu.co/platform/workflow/digest
- Novu workflow overview: https://docs.novu.co/platform/workflow/overview
- Courier preferences docs: https://www.courier.com/docs/platform/preferences/preferences-overview
- ntfy configuration docs: https://docs.ntfy.sh/config/
- Graphile Worker config/cron docs: https://worker.graphile.org/docs/config and https://deepwiki.com/graphile/worker/6-cron-jobs
- isomorphic-git command docs: https://isomorphic-git.org/docs/en/alphabetic
- simple-git npm docs: https://www.npmjs.com/package/simple-git
