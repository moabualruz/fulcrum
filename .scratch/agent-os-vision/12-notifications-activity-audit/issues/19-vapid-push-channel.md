---
Status: implemented
ImplRuntime: claude
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [04-fanout-worker.md, 07-quiet-hours.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [C1, Q26, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row)
Docs: []
---

# Gated: notify-push VAPID Web Push — web-push npm + service worker + push_subscriptions + 410 cleanup

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Issues T12-36, T12-37)

## What to build
When `FULCRUM_FEATURES=notify-push` ON: register `notify-deliver-push` graphile-worker task using `@Injectable()` `PushNotificationDispatcher` (needle-di) and `web-push` npm library; VAPID keys from `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` env vars; sends to all `PushSubscription` entities for user; `status='sent'|'failed'`; HTTP 410 → delete subscription through `pushSubscriptionRepo.remove()`. SvelteKit service worker (`src/service-worker.ts`): registered when flag ON; handles `push` event → `showNotification`. Web channels config: "Enable push notifications" button calls `navigator.serviceWorker.ready.pushManager.subscribe()` → stores subscription via `notify.channels.push.subscribe` tRPC.

## Acceptance criteria
- [ ] Schema migration: reads/writes `PushSubscription` (from migration class `Migration<timestamp>`).
- [ ] tRPC procedure / module: `notify.channels.push.subscribe/unsubscribe` tRPC procedures; `notify-deliver-push` graphile-worker task and `@Injectable()` dispatcher.
- [ ] Web surface: "Enable push notifications" button subscribes and stores; push notification appears in browser when flag ON and test delivered; channels config shows subscribed status; Playwright: subscribe → test deliver → notification shown (mock push manager).
- [ ] CLI command: N/A (push is Web-only channel).
- [ ] TUI screen: N/A (push is browser-only).
- [ ] Tests: flag OFF → no VAPID calls; ON → `web-push.sendNotification` called with correct subscription; 201 → `status='sent'`; 410 → subscription deleted; service worker `push` event → `showNotification` called (mock); quiet-hours respected; RED→GREEN.

## Blocked by
- `04-fanout-worker.md` — fan-out enqueues `notify-deliver-push`.
- `07-quiet-hours.md` — quiet-hours suppression.
- `01-schema-migration.md` — `PushSubscription` entity.

## Notes / Tech-stack hints
- `web-push` (MIT); `VAPID_PUBLIC_KEY` exposed to client for subscription; private key server-only.
- VAPID rotation: `VAPID_PUBLIC_KEY_OLD` env var → keep old subs valid until TTL expires (90 days); re-subscribe flow surfaced in settings.
- Service worker registered only when flag ON; do NOT load service worker when flag OFF.
- Failure gate: VAPID <95% delivery → degrade gracefully; in-app notifications always-on fallback.
