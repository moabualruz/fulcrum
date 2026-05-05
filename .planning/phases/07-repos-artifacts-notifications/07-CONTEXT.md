# Phase 7: Repos + Artifacts + Notifications - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning
**Research basis:** GitHub/GitLab repo and artifact UX, Novu notification workflow/channel architecture, Sentry notification routing model, Fulcrum codebase integration scout

<domain>
## Phase Boundary

This phase completes three v1 pillars: (1) Repos + Git sync verified and surfaced across Web/CLI/TUI, (2) artifact lifecycle hardened from agent run harvest through search indexing, retention, pruning, preview, download, and parity, and (3) notifications functional from event fanout through in-app feed, unread bell, rules UI, delivery workers for SMTP/webhook/push, quiet hours, retry, and parity.

Requirements: REP-01..07, ART-01..06, NTF-01..09 (22 total).

**Roadmap caveat:** `.planning/ROADMAP.md` Phase 7 plan list currently contains copied Phase 6 plan filenames and SRC/DOC/MEM tasks. Downstream planning MUST use Phase 7 goal, dependencies, success criteria, and `.planning/REQUIREMENTS.md` REP/ART/NTF requirements as source of truth, not the stale plan bullets.

</domain>

<decisions>
## Implementation Decisions

### Repository Sync + Dashboard (REP-01..07)
- **D-01:** Verify the existing watcher first. Use `src/repos/watcher.ts` with Node `fs.watch` as current path; only add `chokidar` if the required 2s cross-platform sync test proves `fs.watch` unreliable.
- **D-02:** On-demand repo sync and LRU warm-cache run through the Phase 2 graphile-worker/job registry, not direct request-handler work. Commands/UI enqueue jobs; workers run `src/repos/workers/sync-local.ts` and `src/repos/workers/sync-remote.ts`.
- **D-03:** LRU warm-cache target is exactly top 5 remote repos by recent access/activity. Register cron explicitly; existing function without cron registration does not satisfy REP-03.
- **D-04:** Multi-repo dashboard matches GitHub/GitLab information hierarchy: repo list cards/table with branch status, last sync, dirty status, recent commit, open task count, and health; detail tabs for branches, commits, files, sync log.
- **D-05:** REST repo API must delegate to real MikroORM/tRPC/service path. Replace `src/api/routes/repos.ts` stub-store behavior; do not add new raw SQL product-kernel paths.
- **D-06:** CLI repo commands route through shared tRPC caller and support `--json`: `register`, `list`, `sync`, `status`, plus read-only `branches`, `commits`, `files` if needed for REP-07 parity.
- **D-07:** TUI repo surface reuses `src/tui/screens/repos.ts`; no separate direct DB path. TUI shows repo list, selected repo status, branch/commit summaries, and sync action.

### Artifact Lifecycle (ART-01..06)
- **D-08:** Artifact UX matches GitHub Actions artifact pattern: per-run artifact list, artifact detail, digest/checksum, size/mime, preview/download, retention/expiration status, delete/archive actions.
- **D-09:** Run -> artifact -> search indexing is mandatory. `src/orchestration/artifact-harvest-hook.ts` and `src/artifacts/harvest.ts` create artifacts; `src/search/indexers/artifact.ts` must populate Phase 6 `SearchDocument` rows; tests verify a harvested artifact appears in search.
- **D-10:** Artifact edges stay bidirectional via existing `Edge` model. ART-02 verifies run detail can list produced artifacts and artifact detail can navigate back to source run using edge records.
- **D-11:** Add/verify `artifact_retention_policies` with scope: org/project, artifact kind, `retention_days`, enabled flag, and audit fields. Defaults locked by requirement: project artifacts forever, scratch artifacts 90 days.
- **D-12:** Artifact pruning runs as graphile-worker/cron job. `src/artifacts/pruner.ts` must be registered and must process expired artifacts idempotently, deleting storage blobs and marking/persisting prune status safely.
- **D-13:** Artifact preview is intentionally narrow for v1: PNG/image inline and text/markdown/code inline with sanitization. Other binaries show metadata + download. Do not build general document/media preview pipeline in Phase 7.
- **D-14:** Web/CLI/TUI artifact parity routes through shared artifact tRPC/service. CLI supports CRUD/download/preview metadata with `--json`; TUI artifact screen shows list, filters, preview summary, download path/action.

### Notification Fanout + Delivery (NTF-01..09)
- **D-15:** Notification architecture follows Novu/Sentry split: event detection -> rule evaluation -> user notification/in-app row -> channel delivery rows -> channel workers. Keep Fulcrum local-first entities; do not introduce Novu as runtime dependency.
- **D-16:** Rules are evaluated for every new persisted domain event through `src/notifications/fanout-worker.ts` and `src/notifications/rule-engine.ts`. Phase 7 verifies all relevant event producers call/enqueue fanout.
- **D-17:** Bell counter source of truth is `user_notifications`/Notification unread rows, not raw events. Fix bell API and TUI/web polling to call unread notification count only.
- **D-18:** Delivery workers implement three channels: SMTP via `nodemailer`, webhook via HMAC-SHA256 signed POST using existing `src/webhooks/dispatcher.ts` patterns, and browser push via `web-push` if VAPID config exists. Missing channel config creates typed degraded/failed delivery records, not silent success.
- **D-19:** Webhook delivery records include endpoint, event type, signature timestamp, status, attempt count, next retry time, response status/body excerpt, and last error. Match GitLab/Sentry resend/debug expectations.
- **D-20:** Quiet hours are enforced before external delivery. Held deliveries use status `held-quiet-hours` (or existing enum equivalent) with `nextAttemptAt` set to the end of the quiet window; retry scheduler re-enqueues after that time.
- **D-21:** Notification rules UI matches Sentry/Novu mental model: trigger/event filter, channel selection, recipient/user scope, quiet-hours settings, test/dry-run action. Keep settings page CRUD; do not build workflow designer.
- **D-22:** CLI notifications route through tRPC and support `--json`: list/unread/read/mute/rules/channels/test. Replace generated stubs for NTF-08.
- **D-23:** TUI notifications parity uses existing `notifications` and `notification-rules` screens: inbox, unread count, mark read, mute, rule list/edit basics, quiet-hours display.

### Dependency Policy
- **D-24:** Add `nodemailer` only when implementing SMTP worker. Add `web-push` only when implementing real browser push. Add `chokidar` only if watcher verification fails. Avoid notification-platform dependency (`@novu/*`) for v1 because existing local-first entities already cover persistence and rule/delivery state.
- **D-25:** HMAC signing uses Node/Bun `crypto` primitives; no custom crypto library. Use timestamped signature headers to support replay protection.

### TDD / Verification
- **D-26:** RED tests required before implementation: LRU cron registration and top-5 selection; file watcher sync under 2s; artifact retention policy defaults and pruner idempotency; artifact harvest -> SearchDocument; delivery worker handlers for SMTP/webhook/push; webhook HMAC verification; quiet-hours hold and retry; bell counts unread notifications only; CLI/TUI/Web parity smoke.

### Agent Discretion
- Planner may choose exact cron interval names and job payload schemas as long as graphile-worker/job registry owns async execution.
- Planner may choose whether repo dashboard cards or table is default; both must expose branch status, recent commits, open tasks, and sync health.
- Planner may choose exact notification delivery enum names if compatible with existing `NotificationDelivery` statuses and tests.
- Planner may decide whether `web-push` lands in Phase 7 or push channel records degrade until VAPID config exists, but NTF-04 requires a push worker handler path.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Sources
- `.planning/ROADMAP.md` — Phase 7 goal, dependencies, TDD expectation, success criteria; ignore stale Phase 6 plan list under Phase 7.
- `.planning/REQUIREMENTS.md` — REP-01..07, ART-01..06, NTF-01..09 definitions.
- `.planning/PROJECT.md` — local-first Agent OS product direction, three-surface parity, no-deferrals v1 posture.
- `.planning/STATE.md` — branch policy and locked architecture/session decisions.
- `.planning/phases/07-repos-artifacts-notifications/07-RESEARCH.md` — competitor, dependency, and codebase integration research for this phase.

### Prior Phase Decisions
- `.planning/phases/02-bug-fixes-foundation/02-CONTEXT.md` — graphile-worker, CI, feature flags, PGlite foundation.
- `.planning/phases/03-symphony-sandcastle/03-CONTEXT.md` — agent dispatch, sandbox/artifact assumptions, Symphony run lifecycle.
- `.planning/phases/05-task-management-metrics/05-CONTEXT.md` — watchers/comments/event sources feeding notifications.
- `.planning/phases/06-documents-memory-search/06-CONTEXT.md` — Phase 6 SearchDocument/search pipeline and MEM-09 repoState dependency.

### Codebase Maps
- `.planning/codebase/STACK.md` — Bun, MikroORM, PGlite/PostgreSQL, test stack.
- `.planning/codebase/ARCHITECTURE.md` — shared tRPC/service/repository constraints, EventBus, data flow, anti-patterns.
- `.planning/codebase/INTEGRATIONS.md` — repo integration, notifications, webhooks, feature flags, storage.
- `graphify-out/GRAPH_REPORT.md` — graph community navigation and repo/artifact/notification communities.

### Implementation Starting Points
- `src/repos/git.ts` — existing Git command wrapper.
- `src/repos/watcher.ts` — file watcher implementation for REP-01.
- `src/repos/register.ts` — repo registration starts/stops watchers.
- `src/repos/workers/sync-local.ts` — local sync worker.
- `src/repos/workers/sync-remote.ts` — remote sync worker.
- `src/trpc/routers/repos.ts` — repo tRPC CRUD.
- `src/api/routes/repos.ts` — REST repo route needing real DB wiring.
- `src/cli/commands/repos.ts` — CLI repo commands.
- `src/tui/screens/repos.ts` — TUI repo surface.
- `src/db/entities/repos/Repo.ts`, `src/db/entities/repos/RepoBranch.ts`, `src/db/entities/repos/RepoCommit.ts`, `src/db/entities/repos/RepoFilesIndex.ts` — repo persistence.
- `src/orchestration/artifact-harvest-hook.ts` — run artifact harvest hook.
- `src/artifacts/harvest.ts`, `src/artifacts/storage.ts`, `src/artifacts/pruner.ts`, `src/artifacts/preview-download.ts`, `src/artifacts/manual-upload.ts` — artifact lifecycle modules.
- `src/search/indexers/artifact.ts`, `src/search/indexers/repo.ts` — search indexing integration.
- `src/trpc/routers/artifacts.ts`, `src/server/trpc/routers/artifacts.ts`, `src/api/routes/artifacts.ts` — artifact APIs.
- `src/cli/artifacts.ts`, `src/cli/generated/artifacts.ts`, `src/tui/screens/artifacts.ts` — artifact parity surfaces.
- `src/db/entities/sandbox/Artifact.ts`, `src/db/entities/sandbox/Edge.ts`, `src/db/entities/artifacts/Artifact.ts` — artifact/edge persistence.
- `src/notifications/rule-engine.ts`, `src/notifications/fanout-worker.ts`, `src/notifications/realtime-bell.ts`, `src/notifications/bell-counter-poll.ts` — notification core.
- `src/webhooks/dispatcher.ts` — outbound webhook dispatch/signing base.
- `src/trpc/routers/notifications.ts`, `src/trpc/routers/webhooks.ts`, `src/api/routes/notifications.ts` — notification/webhook API surfaces.
- `src/db/entities/notifications/Notification.ts`, `src/db/entities/notifications/NotificationRule.ts`, `src/db/entities/notifications/NotificationDelivery.ts`, `src/db/entities/notifications/NotificationMute.ts`, `src/db/entities/notifications/NotificationQuietHours.ts`, `src/db/entities/notifications/Webhook.ts`, `src/db/entities/notifications/WebhookDelivery.ts`, `src/db/entities/notifications/WebhookRuleConfig.ts` — notification persistence.
- `src/tui/screens/notifications.ts`, `src/tui/screens/notification-rules.ts`, `src/tui/widgets/StatusBar.ts` — TUI notification parity.
- `src/web/src/routes/settings/notifications/+page.svelte`, `src/web/src/routes/settings/notifications/channels/+page.svelte`, `src/web/src/routes/settings/integrations/webhooks/+page.svelte` — web notification settings surfaces.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Repo domain:** entities, repository, tRPC router, CLI command file, TUI repo screen, watcher, local/remote workers already exist. Most REP work is verification, cron/job wiring, dashboard depth, and stub replacement.
- **Artifact domain:** harvest hook, storage, pruner, preview/download helpers, web routes, tRPC/router tests, CLI/TUI screens, and Edge entity already exist. ART work is lifecycle hardening and search/retention verification.
- **Notification domain:** rule engine, fanout worker, quiet-hours entity, delivery entity, realtime bell, poller, web settings pages, TUI inbox/rules screens, webhooks dispatcher already exist. NTF work is worker/channel completion and parity wiring.
- **Search integration:** Phase 6 SearchDocument/query pipeline must be reused for repo/artifact indexing; no separate artifact search subsystem.
- **EventBus/domain events:** existing EventBus and Event entity can drive notification fanout and realtime updates.

### Established Patterns
- Three surfaces converge on tRPC/service/repository path. No Web/CLI/TUI surface owns business logic.
- MikroORM entities/repositories are canonical data path; raw SQL product-kernel paths are debt and should not expand.
- Async work belongs in graphile-worker/job registry/cron, not request handlers.
- Feature flags use `FULCRUM_FEATURES`/FlagRegistry when optional behavior needs gating.
- Local-first storage is default; SaaS/PostgreSQL compatibility still required.

### Integration Points
- Repo changes -> repo sync worker -> RepoBranch/RepoCommit/RepoFilesIndex -> SearchDocument repo indexer -> dashboard/context bundle repoState slice.
- Agent run completion -> artifact harvest hook -> Artifact/Edge rows -> artifact indexer -> search results -> notification event.
- Domain Event rows -> notification fanout worker -> Notification row + NotificationDelivery rows -> bell update + delivery workers.
- Quiet hours -> delivery hold state -> retry scheduler after quiet window.
- Webhook delivery -> HMAC signed POST -> WebhookDelivery attempt rows -> notification/webhook settings UI.

</code_context>

<specifics>
## Specific Ideas

- Copy GitHub Actions artifact retention UX locally: expiration date/status visible on artifact detail, with delete/prune warnings.
- Copy GitLab/Sentry webhook debugging expectations: inspect last request/response, retry/resend, signature headers, attempt history.
- Copy Novu's workflow language internally but keep Fulcrum implementation local-first: workflow = notification rule + channel delivery plan.
- Repo dashboard should be operational, not decorative: stale sync, dirty worktree, diverged branch, last commit, open tasks visible at first glance.

</specifics>

<deferred>
## Deferred Ideas

- Full notification workflow designer UI — future phase; Phase 7 only needs rules CRUD and channel config.
- Slack/Discord notification channels — v2/gated delivery; Phase 7 requires SMTP, webhook, push.
- General binary/media preview pipeline beyond PNG/text — future artifact enhancement.
- Hosted remote repository cache service — future SaaS scaling; Phase 7 stays local-first with warm cache cron.

</deferred>

---

*Phase: 7-Repos + Artifacts + Notifications*
*Context gathered: 2026-05-05*
