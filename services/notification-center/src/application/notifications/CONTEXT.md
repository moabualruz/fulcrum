# Notifications

Application-layer commands, queries, and read-state ports for the per-user inbox: persisting Notifications, mutating mute/quiet-hours/rules preferences, and serving inbox reads through a transport-agnostic reader.

## Language

**InboxCommand**:
A write operation (`createNotification`, `markNotificationRead`, `markAllNotificationsRead`) that mutates Notification rows inside a TypeORM transaction and writes a paired outbox event.
_Avoid_: Mutation, action, handler.

**PreferenceCommand**:
A write operation against `NotificationRule`, `NotificationMute`, `NotificationQuietHours`, or `PushSubscription` that updates the recipient's delivery preferences.
_Avoid_: Settings update, config write.

**RuleTiming**:
The `{ deliveryMode, digestWindowSeconds, delaySeconds, critical }` slice packed into `NotificationRule.eventPattern` by `withRuleTiming` and unpacked by `ruleTiming` for DTO serialization.
_Avoid_: Schedule, cadence config.

**ReadStatePort** (`NotificationReadStateReader` / `NotificationReadStateWriter`):
A transport-agnostic interface over inbox rows used by surfaces that cannot import TypeORM directly; backed by `NotificationReadStateRecord`.
_Avoid_: Repository, gateway, adapter.

**OutboxBridge** (`writeNotificationOutboxEvent`):
The tolerant wrapper around `writeOutboxEvent` that swallows the "DomainEventOutbox metadata not found" error so notification commands stay green when the outbox table is absent.
_Avoid_: Event publisher, emitter.

**DefaultRuleSeed** (`DefaultNotificationRuleInput`):
A `{ name, subjectKind, eventPattern }` shape applied by `seedDefaultNotificationRules` to provision a new recipient's starter rules; idempotent by `(userId, name)`.
_Avoid_: Preset, template, factory rule.

## Relationships

- An **InboxCommand** runs inside one `em.transaction` and emits exactly one **OutboxBridge** call (or zero, for `createNotification`).
- A **PreferenceCommand** on `NotificationRule` passes `eventPattern` through `withRuleTiming` so **RuleTiming** fields round-trip via `eventPattern`, not dedicated columns.
- A **ReadStatePort** is consumed by surfaces (tRPC/HTTP) that need inbox reads without binding to `EntityManager`; the TypeORM-backed queries in `queries.ts` are the in-process equivalent.
- A **DefaultRuleSeed** is applied once per `(userId, name)` and silently no-ops when `isMissingNotificationRuleColumns` detects a pre-migration schema.

## Example dialogue

> **Dev:** "Why does `createNotification` skip the outbox while `markNotificationRead` writes one?"
> **Domain expert:** "Creation is driven by an upstream `Event` already on the outbox — re-emitting would double-fan-out. `read` and `read_all` are user-originated facts with no upstream Event, so they need their own **OutboxBridge** entry."
> **Dev:** "And the `RuleTiming` fields — why aren't they columns?"
> **Domain expert:** "`NotificationRule.eventPattern` is the rule matcher payload; timing piggybacks there so the rule engine sees one document. `withRuleTiming` writes it, `ruleTiming` reads it, DTOs expose flat fields."

## Flagged ambiguities

- **`queries.ts` vs `read-state.ts`** — both serve inbox reads. `queries.ts` is the TypeORM in-process path (uses `EntityManager`); `read-state.ts` is the **ReadStatePort** abstraction for transports that cannot import entities. Pick by caller capability, not by feature; do not duplicate logic across them.
- **`active` vs `enabled` on NotificationRule** — commands set both to the same boolean on create/update. Treat them as one toggle here; the dual column is legacy and tracked at the parent context level.
- **`serializeNotification` lives in `queries.ts`, `serializeNotificationReadState` lives in `read-state.ts`** — both produce `NotificationDto` but from different row shapes (`Notification` entity vs `NotificationReadStateRecord`). Keep them in sync; do not merge.
