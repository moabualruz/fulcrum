---
Status: in-progress
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [Q26, A4, Q22]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row; Audit log row)
Docs: []
---

# Migration class: NotificationRule, Notification, NotificationDelivery, NotificationMute, NotificationQuietHours, EventRetentionPolicy, WebhookRuleConfig, PushSubscription

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Schema changes section; issues T12-01)

## What to build
Write migration class `Migration<timestamp>` covering all 8 notification entities with composite `(org_id, …)` indexes (Q22), UNIQUE constraints, FK cascades, and enum/range validators as specified in the PRD entity block. Also creates `EventRetentionPolicy` per A4 (default 1 year per org, configurable). Migration class remains idempotent.

## Acceptance criteria
- [ ] Schema migration: `Migration<timestamp>` applies clean twice on PGlite + standard Postgres; all 9 entity mappings (8 notification + 1 retention policy) present; UNIQUE constraints enforced; FK cascades tested (delete org → cascade to all notification entities); index on `NotificationRule.eventPattern`.
- [ ] tRPC procedure / module: migration runs as part of `fulcrum db migrate`; no procedure in this slice.
- [ ] Web surface: N/A.
- [ ] CLI command: `fulcrum doctor --json` reports all notification entities registered and `NotificationRuleRepository.count()` value.
- [ ] TUI screen: N/A.
- [ ] Tests: migration unit test asserts all entity metadata + indexes; UNIQUE `(user_id, endpoint)` on `PushSubscription` enforced; `DeliveryStatus` enum on `NotificationDelivery` enforced; `EventRetentionPolicy` default entity created for local org with `retain_days=365`; RED→GREEN.

## Blocked by
- Pillar 1 (Foundation) — `Org`, `User`, `Project`, `Event` entities must exist; graphile-worker bootstrap.

## Notes / Tech-stack hints
- `NotificationRule.channels` uses array storage; repository helper answers "includes channel" checks.
- Use `EventRetentionPolicy` per A4; single UNIQUE `(org_id, project_id NULL)` entity per scope.
- `push_subscriptions`: `p256dh` and `auth` are base64url-encoded — store as text; `endpoint` may be long URL.
- Default retention: on local org seed, create `EventRetentionPolicy` for org `00000000-0000-0000-0000-000000000001` with `retain_days=365` per A4 default.
